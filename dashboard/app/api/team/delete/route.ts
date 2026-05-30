/**
 * POST /api/team/delete
 *
 * Elimina un miembro del equipo:
 *   1. Borra public.profiles (cascade borra client_assignments,
 *      position_history, salary_history, team_milestones, etc.).
 *   2. Borra auth.users via service role (Admin API).
 *
 * Solo director. No se puede borrar a sí mismo (safety).
 *
 * Body:
 *   userId: string (uuid de auth.users)
 */

import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceKey) {
    return Response.json(
      { error: "Servidor no configurado." },
      { status: 500 },
    );
  }

  // Auth: solo director
  const callerToken = req.headers
    .get("authorization")
    ?.replace("Bearer ", "");
  if (!callerToken) {
    return Response.json({ error: "Sin sesión" }, { status: 401 });
  }
  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user: caller },
  } = await callerClient.auth.getUser();
  if (!caller) {
    return Response.json({ error: "No autenticado" }, { status: 401 });
  }
  const { data: callerProfile } = await callerClient
    .from("profiles")
    .select("role")
    .eq("id", caller.id)
    .maybeSingle();
  if (!callerProfile || callerProfile.role !== "director") {
    return Response.json(
      { error: "Solo directores pueden eliminar miembros." },
      { status: 403 },
    );
  }

  // Body
  let body: { userId?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }
  const { userId } = body;
  if (!userId) {
    return Response.json({ error: "Falta userId" }, { status: 400 });
  }
  if (userId === caller.id) {
    return Response.json(
      { error: "No podés borrarte a vos mismo." },
      { status: 400 },
    );
  }

  // Service role: borrar profile + auth.users
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Limpiar relaciones que podrían bloquear el delete del profile
  //    (no todas las migraciones tienen ON DELETE CASCADE seteado).
  //    Hacemos best-effort: si una tabla no existe, lo ignoramos.
  const cleanupSteps = [
    { table: "client_assignments", col: "user_id" },
    { table: "client_assignments", col: "assigned_by" }, // si existe
    { table: "client_requests", col: "assigned_to", patch: { assigned_to: null } },
    { table: "client_requests", col: "submitted_by", patch: { submitted_by: null } },
    { table: "position_history", col: "user_id" },
    { table: "salary_history", col: "user_id" },
    { table: "team_milestones", col: "user_id" },
    { table: "internal_requests", col: "user_id" },
    { table: "internal_requests", col: "assigned_to", patch: { assigned_to: null } },
    { table: "agent_runs", col: "user_id", patch: { user_id: null } },
    { table: "notifications", col: "to_user_id" },
    { table: "consultant_conversations", col: "user_id" },
    { table: "report_comments", col: "user_id", patch: { user_id: null } },
    { table: "audit_log", col: "actor_id", patch: { actor_id: null } },
  ];
  const failures: { table: string; col: string; error: string }[] = [];
  for (const step of cleanupSteps) {
    try {
      if (step.patch) {
        // Soft cleanup: set FK a null en lugar de borrar la fila
        const { error } = await admin
          .from(step.table)
          .update(step.patch)
          .eq(step.col, userId);
        if (error && !error.message.includes("does not exist")) {
          failures.push({ table: step.table, col: step.col, error: error.message });
        }
      } else {
        // Hard delete
        const { error } = await admin
          .from(step.table)
          .delete()
          .eq(step.col, userId);
        if (error && !error.message.includes("does not exist")) {
          failures.push({ table: step.table, col: step.col, error: error.message });
        }
      }
    } catch (err) {
      // Tabla/columna inexistente: lo ignoramos
      failures.push({
        table: step.table,
        col: step.col,
        error: (err as Error).message,
      });
    }
  }

  // 2. Borrar profile
  const { error: profileErr } = await admin
    .from("profiles")
    .delete()
    .eq("id", userId);
  if (profileErr) {
    return Response.json(
      {
        error: "No se pudo eliminar el profile.",
        detail: profileErr.message,
        cleanupFailures: failures.length > 0 ? failures : undefined,
      },
      { status: 500 },
    );
  }

  // 2. Borrar auth.users via admin API
  const { error: authErr } = await admin.auth.admin.deleteUser(userId);
  if (authErr) {
    // El profile ya está borrado pero auth.users sigue — no es crítico
    // pero loggeamos. El usuario no podrá iniciar sesión porque no
    // tiene profile.
    console.warn(
      "[team.delete] profile borrado pero auth.users falló:",
      authErr.message,
    );
    return Response.json(
      {
        success: true,
        warning: `Profile eliminado pero auth.users falló: ${authErr.message}. El usuario no podrá entrar.`,
      },
    );
  }

  return Response.json({ success: true });
}
