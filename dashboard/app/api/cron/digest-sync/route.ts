/**
 * POST /api/cron/digest-sync — mig 096 · Refresh on-demand de los digests
 *
 * Reconstruye el pipeline jerárquico (digests de cliente → digests de
 * gerencia) que alimenta al Gerente General. El refresh regular corre al
 * final de /api/cron/process-sync (diario); este endpoint existe para
 * refrescar a demanda ("los datos del GG lucen viejos") sin esperar al cron.
 *
 * Determinista, cero llamadas a Claude. Body opcional: { clientId } para
 * reconstruir solo ese cliente (las gerencias se rearman igual, con los
 * digests persistidos de los demás).
 *
 * Auth: header `x-internal-secret` = CRON_SECRET.
 */

import { NextRequest } from "next/server";
import { requireInternalSecret } from "@/lib/auth-guard";
import { runDigestSync } from "@/lib/digests";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

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
    const result = await runDigestSync(clientId);
    return Response.json({ ok: result.errores.length === 0, ...result });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown";
    return Response.json({ error: `digest-sync falló: ${detail}` }, { status: 500 });
  }
}
