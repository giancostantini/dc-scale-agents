/**
 * POST /api/clients/[id]/creative-bulk-save
 *
 * Guarda en bulk piezas de contenido propuestas por el Asistente
 * Creativo (modo PROPOSE) como filas en content_posts. El frontend
 * envía las piezas que el director aprobó.
 *
 * Body:
 *   pieces: Array<{
 *     date: string,
 *     time: string,
 *     network: "ig" | "tt" | "in" | "fb" | "yt",
 *     format: "reel" | "carrusel" | "post" | "story" | "video" | "short",
 *     brief: string,
 *     copy?: string,
 *     status?: "draft" | "scheduled"
 *   }>
 *
 * Solo director.
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

interface PieceInput {
  date: string;
  time: string;
  network: string;
  format: string;
  brief: string;
  copy?: string;
  status?: "draft" | "scheduled" | "published";
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    return Response.json({ error: "Servidor no configurado." }, { status: 500 });
  }
  const { id: clientId } = await params;

  const callerToken = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!callerToken) return Response.json({ error: "Sin sesión" }, { status: 401 });
  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user: caller },
  } = await callerClient.auth.getUser();
  if (!caller) return Response.json({ error: "No autenticado" }, { status: 401 });
  const { data: callerProfile } = await callerClient
    .from("profiles")
    .select("role")
    .eq("id", caller.id)
    .maybeSingle();
  if (!callerProfile || callerProfile.role !== "director") {
    return Response.json({ error: "Solo directores." }, { status: 403 });
  }

  let body: { pieces?: PieceInput[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }
  const pieces = body.pieces ?? [];
  if (!Array.isArray(pieces) || pieces.length === 0) {
    return Response.json({ error: "Sin piezas para guardar" }, { status: 400 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Validar piezas mínimas + mapear a row
  const rows = pieces
    .filter(
      (p) =>
        p &&
        /^\d{4}-\d{2}-\d{2}$/.test(p.date) &&
        /^\d{2}:\d{2}$/.test(p.time) &&
        ["ig", "tt", "in", "fb", "yt"].includes(p.network) &&
        ["reel", "carrusel", "post", "story", "video", "short"].includes(
          p.format,
        ) &&
        typeof p.brief === "string" &&
        p.brief.trim().length > 0,
    )
    .map((p) => ({
      client_id: clientId,
      date: p.date,
      time: p.time,
      network: p.network,
      format: p.format,
      brief: p.brief.trim(),
      status: p.status ?? "draft",
      source: "ai",
    }));

  if (rows.length === 0) {
    return Response.json(
      { error: "Ninguna pieza pasó la validación." },
      { status: 400 },
    );
  }

  const { error, count } = await admin
    .from("content_posts")
    .insert(rows, { count: "exact" });
  if (error) {
    console.error("[creative-bulk-save] insert error:", error);
    return Response.json(
      { error: "No se pudieron guardar las piezas.", detail: error.message },
      { status: 500 },
    );
  }

  return Response.json({
    success: true,
    created: count ?? rows.length,
    skipped: pieces.length - rows.length,
  });
}
