/**
 * POST /api/cron/process-sync — Stage 3 · Sincronización de process_instances
 *
 * Re-deriva el estado de los 3 procesos (onboarding, ciclo de contenido,
 * reporte mensual) desde las tablas fuente y lo upsertea en
 * process_instances. Corre 1×/día (workflow "Process Sync") y también lo
 * invoca /api/phases/approve tras aprobar una fase (sync inmediato).
 *
 * Determinista: correrlo N veces = mismo resultado. Body opcional:
 * { clientId } para sincronizar un solo cliente.
 *
 * Auth: header `x-internal-secret` = CRON_SECRET.
 */

import { NextRequest } from "next/server";
import { requireInternalSecret } from "@/lib/auth-guard";
import { runProcessSync } from "@/lib/process-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const guard = requireInternalSecret(req);
  if (!guard.ok) return guard.response;

  let clientId: string | undefined;
  try {
    const body = (await req.json()) as { clientId?: string };
    if (body?.clientId) clientId = body.clientId;
  } catch {
    // sin body → todos los clientes
  }

  try {
    const result = await runProcessSync(clientId);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown";
    return Response.json({ error: `process-sync falló: ${detail}` }, { status: 500 });
  }
}
