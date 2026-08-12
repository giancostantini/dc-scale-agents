/**
 * POST /api/cron/autonomy-review — Stage 6 · Review semanal de autonomía
 *
 * Computa la aprobación sostenida por tipo de output (lib/autonomy.ts) y:
 *   - marca ELEGIBLE + avisa a los socios cuando un tipo se ganó el
 *     derecho con datos (la promoción sigue siendo un UPDATE humano),
 *   - limpia la elegibilidad si la métrica dejó de sostenerse,
 *   - alerta rollback si un tipo PROMOVIDO cayó del umbral.
 *
 * El sistema jamás cambia `mode` solo — mide y avisa.
 * Auth: header `x-internal-secret` = CRON_SECRET.
 */

import { NextRequest } from "next/server";
import { requireInternalSecret } from "@/lib/auth-guard";
import { reviewAutonomyEligibility } from "@/lib/autonomy";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const guard = requireInternalSecret(req);
  if (!guard.ok) return guard.response;

  try {
    const review = await reviewAutonomyEligibility();
    return Response.json({ ok: true, review });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown";
    return Response.json({ error: `autonomy-review falló: ${detail}` }, { status: 500 });
  }
}
