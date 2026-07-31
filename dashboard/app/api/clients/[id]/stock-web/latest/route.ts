/**
 * GET /api/clients/[id]/stock-web/latest
 *
 * Devuelve el último snapshot de "talles faltantes" producido por el agente
 * `stock-web` para un cliente, leyendo de la tabla `agent_outputs`. Lo consume
 * el apartado /cliente/[id]/talles para renderizar la tabla de productos con
 * algún talle agotado.
 *
 * Si el cliente todavía no tiene snapshots, devuelve { snapshot: null } y el
 * componente UI maneja el empty state.
 *
 * Response:
 *   { snapshot: { title, created_at, structured } | null }
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireClientAccess } from "@/lib/auth-guard";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await context.params;

  if (!clientId || !/^[a-z0-9-]+$/.test(clientId)) {
    return Response.json({ error: "Invalid client id" }, { status: 400 });
  }

  const access = await requireClientAccess(req, clientId);
  if (!access.ok) return access.response;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("agent_outputs")
    .select("title, created_at, structured")
    .eq("client", clientId)
    .eq("agent", "stock-web")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return Response.json(
      { error: `Supabase: ${error.message}` },
      { status: 500 },
    );
  }

  return Response.json({ snapshot: data ?? null });
}
