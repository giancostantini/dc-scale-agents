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
  /** Concepto creativo separado del brief. */
  idea?: string;
  /** Caption final listo para publicar. */
  copy?: string;
  /** CTA corto — típicamente para anuncios. */
  cta?: string;
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

  // Validar piezas mínimas + mapear a row.
  // Formatos válidos: reel/post/carrusel/story (orgánicos) + ugc + anuncio.
  // Antes excluía ugc/anuncio porque el asistente nuevo los genera y se
  // perdían silenciosamente en el filtro.
  const VALID_FORMATS = [
    "reel",
    "post",
    "carrusel",
    "story",
    "ugc",
    "anuncio",
    "video",
    "short",
  ];
  const VALID_NETWORKS = ["ig", "tt", "in", "fb", "yt"];

  const rows = pieces
    .filter(
      (p) =>
        p &&
        /^\d{4}-\d{2}-\d{2}$/.test(p.date) &&
        /^\d{2}:\d{2}$/.test(p.time) &&
        VALID_NETWORKS.includes(p.network) &&
        VALID_FORMATS.includes(p.format) &&
        // brief o idea sirven como contenido mínimo — antes era solo
        // brief obligatorio, pero el asistente nuevo puede mandar piezas
        // donde lo importante está en idea/copy.
        ((typeof p.brief === "string" && p.brief.trim().length > 0) ||
          (typeof p.idea === "string" && p.idea.trim().length > 0)),
    )
    .map((p) => ({
      client_id: clientId,
      date: p.date,
      time: p.time,
      network: p.network,
      format: p.format,
      brief: (p.brief ?? "").trim(),
      idea: p.idea?.trim() || null,
      copy: p.copy?.trim() || null,
      cta: p.cta?.trim() || null,
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
