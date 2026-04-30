/**
 * GET /api/agents/runs/[runId]/output
 *
 * Devuelve el output estructurado de un run específico. Usado por el
 * ConsultantChat al mostrar mensajes de completion — para saber si la pieza
 * tiene video producido y poder linkear la descarga.
 *
 * Response:
 *   { output: { output_type, title, body_md, structured } | null }
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId: runIdRaw } = await context.params;
  const runId = parseInt(runIdRaw, 10);
  if (!runId || Number.isNaN(runId)) {
    return Response.json({ error: "Invalid runId" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("agent_outputs")
    .select("output_type, title, body_md, structured")
    .eq("run_id", runId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return Response.json({ output: null });
  }
  return Response.json({ output: data });
}
