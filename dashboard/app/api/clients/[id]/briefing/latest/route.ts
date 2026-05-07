/**
 * GET /api/clients/[id]/briefing/latest
 *
 * Devuelve el último morning-briefing producido para un cliente, leyendo de
 * la tabla `agent_outputs`. Lo consume el Planificador para renderizar el
 * panel del briefing del día (o el último disponible si no hay uno de hoy).
 *
 * Si el cliente todavía no tiene briefings, devuelve { briefing: null }.
 * El componente UI maneja el empty state con un link para generar uno.
 *
 * Response:
 *   { briefing: { body_md, title, created_at } | null }
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await context.params;

  if (!clientId || !/^[a-z0-9-]+$/.test(clientId)) {
    return Response.json({ error: "Invalid client id" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("agent_outputs")
    .select("body_md, title, created_at")
    .eq("client", clientId)
    .eq("agent", "morning-briefing")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return Response.json(
      { error: `Supabase: ${error.message}` },
      { status: 500 },
    );
  }

  return Response.json({ briefing: data ?? null });
}
