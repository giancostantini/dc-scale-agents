// ==================== CONTEXTO FINANCIERO — SERVER ONLY ====================
// Snapshot financiero determinista para prompts: posición por moneda, TC,
// proyección del mes, facturas abiertas y último cierre. Queries baratas,
// cero llamadas a Claude. Vivía dentro de consultant-personas.ts; extraído
// porque ahora lo consumen dos lugares (la persona Finanzas del consultor
// global y el digest de la Gerencia de Finanzas) y dejarlo allá armaba un
// ciclo de imports personas → digests → personas.

import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  currentMonthUY,
  posicionPorMoneda,
  proyeccionDelMes,
  descalceResumen,
} from "@/lib/tesoreria";

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
}

const fmt = (n: number) => Math.round(n).toLocaleString("es-UY");

/**
 * Snapshot financiero determinista para el system prompt: posición por
 * moneda, TC, proyección del mes, facturas abiertas, último cierre y gasto
 * de IA del mes. Queries baratas, cero llamadas a Claude.
 */
export async function loadFinanceContext(): Promise<string | null> {
  const admin = getSupabaseAdmin();
  const month = currentMonthUY();

  const [
    { data: cuentas },
    { data: rates },
    { data: clients },
    { data: schedules },
    { data: revenues },
    { data: expenses },
    { data: openPayments },
    { data: lastClose },
  ] = await Promise.all([
    admin.from("cuentas_bancarias").select("currency, current_balance, is_active"),
    admin
      .from("exchange_rates")
      .select("rate_date, usd_uyu_mid")
      .order("rate_date", { ascending: false })
      .limit(1),
    admin.from("clients").select("id, name, fee, fee_currency, status"),
    admin.from("client_fee_schedules").select("client_id, start_month, end_month, amount"),
    admin
      .from("manual_revenues")
      .select("kind, amount, currency, start_date, end_date, date, status"),
    admin
      .from("expenses")
      .select("date, amount, currency, recurrence, recurrence_end_date, status"),
    admin
      .from("payments")
      .select("client_id, month, status, amount_override")
      .in("status", ["pending", "late"]),
    admin
      .from("monthly_closes")
      .select("month, status, narrative_md, data")
      .order("month", { ascending: false })
      .limit(1),
  ]);

  const rate = rates?.[0] ? num(rates[0].usd_uyu_mid) : null;
  const posicion = posicionPorMoneda(cuentas ?? []);
  const proyeccion = proyeccionDelMes({
    month,
    clients: clients ?? [],
    feeSchedules: schedules ?? [],
    revenues: revenues ?? [],
    expenses: expenses ?? [],
    rate,
  });

  const nameById = new Map((clients ?? []).map((c) => [c.id, c.name as string]));
  const impagas = (openPayments ?? [])
    .map((p) => `${nameById.get(p.client_id) ?? p.client_id} · ${p.month} (${p.status})`)
    .slice(0, 12);

  const close = lastClose?.[0] ?? null;

  const lines = [
    "CONTEXTO FINANCIERO REAL (calculado ahora, fuentes: Supabase — NO estimes nada fuera de esto):",
    `- TC USD/UYU: ${rate ? fmt(rate) : "sin cargar"}${rates?.[0] ? ` (${rates[0].rate_date})` : ""}`,
    `- Posición en cuentas activas: USD ${fmt(posicion.USD ?? 0)} · UYU ${fmt(posicion.UYU ?? 0)}`,
    `- Proyección ${month}: USD ingresos ${fmt(proyeccion.flujo.USD.ingresos)} / egresos ${fmt(proyeccion.flujo.USD.egresos)} / neto ${fmt(proyeccion.flujo.USD.neto)} · UYU ingresos ${fmt(proyeccion.flujo.UYU.ingresos)} / egresos ${fmt(proyeccion.flujo.UYU.egresos)} / neto ${fmt(proyeccion.flujo.UYU.neto)}`,
    proyeccion.descalces.length > 0
      ? `- ⚠ DESCALCE: ${proyeccion.descalces.map((d) => descalceResumen(d, month)).join(" · ")}`
      : "- Sin descalce de moneda este mes.",
    impagas.length > 0
      ? `- Facturas abiertas (${impagas.length}): ${impagas.join(" · ")}`
      : "- Sin facturas abiertas.",
    close
      ? `- Último cierre: ${close.month} (${close.status}).${close.narrative_md ? ` Lectura: ${(close.narrative_md as string).slice(0, 600)}` : ""}`
      : "- Sin cierres generados todavía.",
  ];
  return lines.join("\n");
}
