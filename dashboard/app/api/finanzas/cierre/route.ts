/**
 * POST /api/finanzas/cierre — FIN-3 · Generar/regenerar cierre a demanda
 *
 * Lo usa el botón "Generar cierre" de Finanzas → Cierre y proyección.
 * Solo directores. Body: { month: "YYYY-MM" }.
 *
 * Un cierre 'final' NO se regenera (409) — primero hay que volverlo a
 * draft desde la UI (decisión explícita del socio, no de este endpoint).
 * Marcar final/draft se hace directo desde la vista (RLS director).
 */

import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { generarCierre, CierreFinalError } from "@/lib/cierre";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const access = await requireRole(req, ["director"]);
  if (!access.ok) return access.response;

  let body: { month?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }
  const month = body.month;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return Response.json({ error: "Falta month (YYYY-MM)" }, { status: 400 });
  }

  try {
    const { row, narrativeOk } = await generarCierre(month, "dashboard:cierre");
    return Response.json({ ok: true, row, narrativeOk });
  } catch (err) {
    if (err instanceof CierreFinalError) {
      return Response.json({ error: err.message }, { status: 409 });
    }
    const detail = err instanceof Error ? err.message : "unknown";
    return Response.json({ error: detail }, { status: 500 });
  }
}
