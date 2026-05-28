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

  // 1. Borrar profile (cascade)
  const { error: profileErr } = await admin
    .from("profiles")
    .delete()
    .eq("id", userId);
  if (profileErr) {
    return Response.json(
      {
        error: "No se pudo eliminar el profile.",
        detail: profileErr.message,
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
