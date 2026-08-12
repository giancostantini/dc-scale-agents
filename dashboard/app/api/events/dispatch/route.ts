/**
 * POST /api/events/dispatch — Stage 5 · Procesador del outbox de eventos
 *
 * Procesa los eventos pendientes de la tabla `events` (mig 092) y ejecuta
 * el handler de cada tipo (lib/events.ts). Lo invocan:
 *   1. El sweeper diario (workflow "Events Dispatch") — red de seguridad.
 *   2. (Opcional, real-time) un Database Webhook de Supabase sobre INSERT
 *      en `events` → POST acá con el header x-internal-secret. Se
 *      configura una vez en Supabase Studio → Database → Webhooks.
 *   3. organic-insights inline, después de emitir metricas.actualizadas.
 *
 * Idempotente y a prueba de concurrencia (claim condicional): el webhook y
 * el sweeper pueden pisarse sin duplicar handlers.
 *
 * Auth: header `x-internal-secret` = CRON_SECRET.
 */

import { NextRequest } from "next/server";
import { requireInternalSecret } from "@/lib/auth-guard";
import { processEvents } from "@/lib/events";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const guard = requireInternalSecret(req);
  if (!guard.ok) return guard.response;

  let limit = 25;
  try {
    const body = (await req.json()) as { limit?: number };
    if (typeof body?.limit === "number" && body.limit > 0 && body.limit <= 100) {
      limit = body.limit;
    }
  } catch {
    // sin body → default
  }

  try {
    const result = await processEvents(limit);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown";
    return Response.json({ error: `events dispatch falló: ${detail}` }, { status: 500 });
  }
}
