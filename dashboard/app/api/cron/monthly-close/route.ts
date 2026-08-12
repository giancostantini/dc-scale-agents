/**
 * POST /api/cron/monthly-close — FIN-3 · Cierre mensual
 *
 * Corre el día 2 de cada mes (workflow "Cierre mensual") y genera el DRAFT
 * del cierre del mes ANTERIOR: números deterministas + narrativa ejecutiva
 * por IA. Notifica a los socios para que lo revisen — la IA jamás declara
 * el cierre sola (gate YELLOW): queda 'draft' hasta que un director lo
 * marca 'final' en Finanzas → Cierre y proyección.
 *
 * Si el cierre ya está 'final', NO lo pisa (idempotente + respeta el gate).
 * Body opcional: { month: "YYYY-MM" } para regenerar un mes puntual.
 *
 * Auth: header `x-internal-secret` = CRON_SECRET.
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireInternalSecret } from "@/lib/auth-guard";
import { currentMonthUY, addMonths } from "@/lib/tesoreria";
import { generarCierre, CierreFinalError } from "@/lib/cierre";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const guard = requireInternalSecret(req);
  if (!guard.ok) return guard.response;

  let month = addMonths(currentMonthUY(), -1);
  try {
    const body = (await req.json()) as { month?: string };
    if (body?.month && /^\d{4}-\d{2}$/.test(body.month)) month = body.month;
  } catch {
    // sin body → mes anterior
  }

  try {
    const { row, narrativeOk } = await generarCierre(month, "cron:monthly-close");

    const supabase = getSupabaseAdmin();
    const usd = row.data.monedas.USD;
    const uyu = row.data.monedas.UYU;
    await supabase.from("notifications").insert({
      client: null,
      agent: "cierre",
      level: "info",
      title: `Cierre de ${month} listo para revisar (draft)`,
      body: `Neto del mes: USD ${Math.round(usd.neto).toLocaleString("es-UY")} · UYU ${Math.round(uyu.neto).toLocaleString("es-UY")}. Por cobrar: USD ${Math.round(usd.porCobrar).toLocaleString("es-UY")} · UYU ${Math.round(uyu.porCobrar).toLocaleString("es-UY")}.${narrativeOk ? "" : " (La narrativa IA falló — están solo los números.)"}\nRevisalo en Finanzas → Cierre y proyección; cuando esté OK, marcalo como FINAL.`,
      link: "/finanzas",
      to_role: "director",
      email_sent: false,
    });

    return Response.json({ ok: true, month, status: row.status, narrativeOk });
  } catch (err) {
    if (err instanceof CierreFinalError) {
      return Response.json({ ok: true, month, skipped: "final", detail: err.message });
    }
    const detail = err instanceof Error ? err.message : "unknown";
    return Response.json({ error: `Cierre de ${month} falló: ${detail}` }, { status: 500 });
  }
}
