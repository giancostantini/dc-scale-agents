/**
 * POST /api/cron/fx-rates — FIN-0 · Tesorería multimoneda
 *
 * Corre 1×/día desde GitHub Actions (.github/workflows/fx-rates.yml):
 *   1. Trae la cotización USD/UYU del día (uy.dolarapi.com; fallback
 *      open.er-api.com) y hace upsert en exchange_rates (idempotente
 *      por rate_date).
 *   2. Proyecta el flujo del mes por moneda (fees por fee_currency +
 *      ingresos manuales vs egresos) y si una moneda no se autofinancia
 *      → notificación warning al director con el monto a convertir
 *      estimado al TC del día (máx. 1 aviso/día).
 *
 * La alerta solo AVISA. Mover o convertir plata es siempre decisión y
 * ejecución de los socios (gate RED — ver docs/ai-company-audit/16).
 *
 * Auth: header `x-internal-secret` = CRON_SECRET (requireInternalSecret).
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireInternalSecret } from "@/lib/auth-guard";
import {
  currentMonthUY,
  todayUY,
  proyeccionDelMes,
  descalceResumen,
  type ExchangeRateRow,
} from "@/lib/tesoreria";

export const dynamic = "force-dynamic";

interface FetchedRate {
  buy: number | null;
  sell: number | null;
  mid: number;
  source: string;
}

function toNum(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Fuente primaria: dolarapi Uruguay. Devuelve compra/venta del oficial. */
async function fetchDolarApi(): Promise<FetchedRate> {
  const res = await fetch("https://uy.dolarapi.com/v1/cotizaciones", {
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`uy.dolarapi.com HTTP ${res.status}`);
  const json: unknown = await res.json();
  // Respuesta: array de cotizaciones ({moneda, compra, venta, ...}).
  // Tomamos la primera entrada USD con compra/venta numéricos.
  const list = Array.isArray(json) ? json : [json];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (row.moneda !== "USD" && row.moneda !== undefined) continue;
    const buy = toNum(row.compra);
    const sell = toNum(row.venta);
    if (buy && sell) {
      return { buy, sell, mid: (buy + sell) / 2, source: "uy.dolarapi.com" };
    }
  }
  throw new Error("uy.dolarapi.com: sin entrada USD con compra/venta válidas");
}

/** Fallback: open.er-api.com — solo mid rate, sin compra/venta. */
async function fetchErApi(): Promise<FetchedRate> {
  const res = await fetch("https://open.er-api.com/v6/latest/USD", {
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`open.er-api.com HTTP ${res.status}`);
  const json = (await res.json()) as { result?: string; rates?: Record<string, number> };
  const mid = toNum(json.rates?.UYU);
  if (json.result !== "success" || !mid) {
    throw new Error("open.er-api.com: respuesta sin rates.UYU");
  }
  return { buy: null, sell: null, mid, source: "open.er-api.com" };
}

export async function POST(req: NextRequest) {
  const guard = requireInternalSecret(req);
  if (!guard.ok) return guard.response;

  const supabase = getSupabaseAdmin();
  const rateDate = todayUY();

  // ---- 1. Cotización del día (primaria + fallback) ----
  let rate: FetchedRate;
  try {
    rate = await fetchDolarApi();
  } catch (primaryErr) {
    console.warn("[fx-rates] fuente primaria falló:", primaryErr);
    try {
      rate = await fetchErApi();
    } catch (fallbackErr) {
      const detail = fallbackErr instanceof Error ? fallbackErr.message : "unknown";
      return Response.json(
        { error: `Ambas fuentes de TC fallaron. Fallback: ${detail}` },
        { status: 502 },
      );
    }
  }

  const { error: upsertError } = await supabase
    .from("exchange_rates")
    .upsert(
      {
        rate_date: rateDate,
        usd_uyu_buy: rate.buy,
        usd_uyu_sell: rate.sell,
        usd_uyu_mid: rate.mid,
        source: rate.source,
      },
      { onConflict: "rate_date" },
    );
  if (upsertError) {
    return Response.json(
      { error: `Upsert exchange_rates falló: ${upsertError.message}` },
      { status: 500 },
    );
  }

  // ---- 2. Descalce del mes ----
  const month = currentMonthUY();
  const [{ data: clients }, { data: schedules }, { data: revenues }, { data: expenses }] =
    await Promise.all([
      supabase.from("clients").select("id, fee, fee_currency, status"),
      supabase
        .from("client_fee_schedules")
        .select("client_id, start_month, end_month, amount"),
      supabase
        .from("manual_revenues")
        .select("kind, amount, currency, start_date, end_date, date, status"),
      supabase
        .from("expenses")
        .select("date, amount, currency, recurrence, recurrence_end_date, status"),
    ]);

  const proyeccion = proyeccionDelMes({
    month,
    clients: clients ?? [],
    feeSchedules: schedules ?? [],
    revenues: revenues ?? [],
    expenses: expenses ?? [],
    rate: rate.mid,
  });

  // ---- 3. Alerta al director (1×/día como mucho) ----
  let notified = false;
  if (proyeccion.descalces.length > 0) {
    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("agent", "tesoreria")
      .gte("created_at", rateDate)
      .limit(1);

    if (!existing || existing.length === 0) {
      const body = proyeccion.descalces
        .map((d) => descalceResumen(d, month))
        .join("\n");
      const { error: notifError } = await supabase.from("notifications").insert({
        client: null,
        agent: "tesoreria",
        level: "warning",
        title: `Descalce de tesorería en ${month}`,
        body: `${body}\nLa conversión la deciden y ejecutan los socios — esto es solo el aviso.`,
        link: "/finanzas",
        to_role: "director",
        email_sent: false,
      });
      if (notifError) {
        console.error("[fx-rates] insert notification falló:", notifError.message);
      } else {
        notified = true;
      }
    }
  }

  return Response.json({
    ok: true,
    rate: {
      rate_date: rateDate,
      usd_uyu_buy: rate.buy,
      usd_uyu_sell: rate.sell,
      usd_uyu_mid: Math.round(rate.mid * 10_000) / 10_000,
      source: rate.source,
    } satisfies ExchangeRateRow,
    month,
    flujo: proyeccion.flujo,
    descalces: proyeccion.descalces,
    notified,
  });
}
