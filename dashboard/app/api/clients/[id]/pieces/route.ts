/**
 * GET /api/clients/[id]/pieces
 *
 * Lista las piezas producidas por content-creator para un cliente, leyendo
 * de la tabla `content_pieces` de Supabase. La biblioteca del cliente la
 * consume para mostrar videos / scripts / estáticos producidos.
 *
 * Query params:
 *   ?limit=50        máximo de filas (default 100, cap 200)
 *   ?status=produced filtrar por status
 *   ?withVideo=1     solo piezas con video_path no nulo
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { ContentPieceRow } from "@/lib/types";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await context.params;

  if (!clientId || !/^[a-z0-9-]+$/.test(clientId)) {
    return Response.json({ error: "Invalid client id" }, { status: 400 });
  }

  const url = req.nextUrl;
  const limitRaw = Number(url.searchParams.get("limit") ?? "100");
  const limit = Number.isFinite(limitRaw) && limitRaw > 0
    ? Math.min(limitRaw, 200)
    : 100;
  const statusFilter = url.searchParams.get("status");
  const withVideo = url.searchParams.get("withVideo") === "1";

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("content_pieces")
    .select(
      "id, client, piece_id, piece_type, source, status, objective, angle, script_format, emotional_trigger, platforms, video_path, voice_path, static_path, publish_results, metrics, created_at",
    )
    .eq("client", clientId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }
  if (withVideo) {
    query = query.not("video_path", "is", null);
  }

  const { data, error } = await query.returns<ContentPieceRow[]>();

  if (error) {
    return Response.json(
      { error: `Supabase: ${error.message}` },
      { status: 500 },
    );
  }

  return Response.json({ pieces: data ?? [] });
}
