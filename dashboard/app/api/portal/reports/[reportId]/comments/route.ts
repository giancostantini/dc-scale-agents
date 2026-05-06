/**
 * GET  /api/portal/reports/[reportId]/comments
 * POST /api/portal/reports/[reportId]/comments
 *
 * Comentarios sobre un phase_report — visibles al cliente solo si el
 * report está en estado 'approved' y pertenece a su client_id (RLS de
 * migration 015). El cliente puede leer y agregar; los comentarios son
 * inmutables (no UPDATE ni DELETE).
 *
 * El trigger SQL `report_comments_notify` se encarga de notificar al
 * team cada vez que el cliente comenta.
 *
 * Body POST: { body: string }
 * Response GET: { comments: ReportComment[] }
 * Response POST: { comment: ReportComment }
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

interface ReportCommentRow {
  id: string;
  report_id: string;
  client_id: string;
  author_id: string;
  author_role: "director" | "team" | "client";
  body: string;
  created_at: string;
}

async function authenticateClient(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return { error: "Servidor no configurado.", status: 500 as const };
  }
  const callerToken = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!callerToken) return { error: "Sin sesión", status: 401 as const };

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado", status: 401 as const };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, client_id, name")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "client" || !profile.client_id) {
    return { error: "Solo clientes pueden usar este endpoint.", status: 403 as const };
  }

  return {
    user,
    profile: profile as { role: "client"; client_id: string; name: string },
    supabase,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const auth = await authenticateClient(req);
  if ("error" in auth) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }
  const { reportId } = await params;

  const { data, error } = await auth.supabase
    .from("report_comments")
    .select("id, report_id, client_id, author_id, author_role, body, created_at")
    .eq("report_id", reportId)
    .order("created_at", { ascending: true });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // RLS filtra automáticamente: si el report no es del cliente o no está
  // approved, viene array vacío. Para distinguir "no existe" de "no tenés
  // acceso" haríamos otra query, pero al cliente eso no le suma — un
  // array vacío es respuesta correcta para ambos casos.

  return Response.json({ comments: (data ?? []) as ReportCommentRow[] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const auth = await authenticateClient(req);
  if ("error" in auth) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }
  const { reportId } = await params;

  let body: { body?: string };
  try {
    body = (await req.json()) as { body?: string };
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }

  const text = (body.body ?? "").trim();
  if (text.length === 0) {
    return Response.json({ error: "El comentario está vacío." }, { status: 400 });
  }
  if (text.length > 2000) {
    return Response.json(
      { error: "El comentario es demasiado largo (máx 2000 caracteres)." },
      { status: 400 },
    );
  }

  const { data, error } = await auth.supabase
    .from("report_comments")
    .insert({
      report_id: reportId,
      client_id: auth.profile.client_id,
      author_id: auth.user.id,
      author_role: "client",
      body: text,
    })
    .select("id, report_id, client_id, author_id, author_role, body, created_at")
    .single();

  if (error) {
    // Si la RLS rechazó (ej. report no es del cliente o no está approved),
    // postgres devuelve "new row violates row-level security policy".
    if (error.message.includes("row-level security") || error.message.includes("violates")) {
      return Response.json(
        {
          error:
            "No podés comentar en este reporte. Solo se aceptan comentarios sobre tus reportes aprobados.",
        },
        { status: 403 },
      );
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ comment: data as ReportCommentRow });
}
