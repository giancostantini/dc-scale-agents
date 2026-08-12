// ==================== CIERRE MENSUAL (FIN-3) — SERVER ONLY ====================
// Números por queries deterministas + narrativa ejecutiva por IA.
// NUNCA importar desde un Client Component (usa service role + Anthropic).
//
// La IA solo REDACTA sobre el JSON calculado — regla del doc 16: si un
// número no está en `data`, no existe. El cierre nace 'draft' y solo los
// socios lo marcan 'final' (gate YELLOW).

import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { CLAUDE_MODEL_SONNET } from "@/lib/anthropic-model";
import { recordApiUsage } from "@/lib/api-usage";
import {
  feeEfectivoDelMes,
  asFinanceCurrency,
  expenseImpact,
  posicionPorMoneda,
  todayUY,
  addMonths,
} from "@/lib/tesoreria";
import type {
  CierreData,
  CierreCliente,
  CierreImpaga,
  CierreMoneda,
  CierreComparativa,
  MonthlyCloseRow,
} from "@/lib/cierre-types";
import type { FinanceCurrency } from "@/lib/types";

/** Error tipado: el cierre ya está finalizado — no se regenera. */
export class CierreFinalError extends Error {
  constructor(month: string) {
    super(`El cierre de ${month} ya está marcado como FINAL — no se regenera.`);
    this.name = "CierreFinalError";
  }
}

function num(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

interface RawRows {
  clients: {
    id: string;
    name: string;
    fee: number | string | null;
    fee_currency: string | null;
  }[];
  schedules: { client_id: string; start_month: string; end_month: string | null; amount: number | string }[];
  payments: {
    client_id: string;
    month: string;
    status: string;
    amount_override: number | string | null;
  }[];
  revenues: {
    kind: string;
    amount: number | string;
    currency: string | null;
    start_date: string | null;
    end_date: string | null;
    date: string | null;
    status: string | null;
  }[];
  expenses: {
    date: string;
    amount: number | string;
    currency: string | null;
    recurrence: string | null;
    recurrence_end_date: string | null;
    status: string | null;
    assigned_to: string | null;
  }[];
}

/** Impacto de un ingreso manual en el mes, separado cobrado/por cobrar. */
function revenueImpactSplit(
  rev: RawRows["revenues"][number],
  month: string,
): { cobrado: number; porCobrar: number } {
  if (rev.status === "cancelled") return { cobrado: 0, porCobrar: 0 };
  let impact = 0;
  if (rev.kind === "one_time") {
    impact = rev.date?.startsWith(month) ? num(rev.amount) : 0;
  } else {
    const monthStart = `${month}-01`;
    const startsBefore = !!rev.start_date && rev.start_date <= monthStart;
    const endsAfter = !rev.end_date || rev.end_date >= monthStart;
    impact = startsBefore && endsAfter ? num(rev.amount) : 0;
  }
  if (impact <= 0) return { cobrado: 0, porCobrar: 0 };
  return rev.status === "pending"
    ? { cobrado: 0, porCobrar: impact }
    : { cobrado: impact, porCobrar: 0 };
}

/** Agregados de un mes por moneda (para el cierre y la comparativa). */
function aggregateMonth(rows: RawRows, month: string) {
  const out: Record<FinanceCurrency, CierreMoneda> = {
    USD: { cobrado: 0, porCobrar: 0, egresos: 0, neto: 0 },
    UYU: { cobrado: 0, porCobrar: 0, egresos: 0, neto: 0 },
  };

  const clientById = new Map(rows.clients.map((c) => [c.id, c]));

  for (const p of rows.payments) {
    if (p.month !== month || p.status === "cancelled") continue;
    const client = clientById.get(p.client_id);
    if (!client) continue;
    const cur = asFinanceCurrency(client.fee_currency);
    const amount =
      p.amount_override != null
        ? num(p.amount_override)
        : feeEfectivoDelMes(
            { id: client.id, fee: client.fee, fee_currency: client.fee_currency },
            rows.schedules,
            month,
          );
    if (p.status === "paid") out[cur].cobrado += amount;
    else out[cur].porCobrar += amount;
  }

  for (const rev of rows.revenues) {
    const { cobrado, porCobrar } = revenueImpactSplit(rev, month);
    const cur = asFinanceCurrency(rev.currency);
    out[cur].cobrado += cobrado;
    out[cur].porCobrar += porCobrar;
  }

  for (const e of rows.expenses) {
    const impact = expenseImpact(e, month);
    if (impact <= 0) continue;
    out[asFinanceCurrency(e.currency)].egresos += impact;
  }

  for (const cur of ["USD", "UYU"] as FinanceCurrency[]) {
    out[cur].cobrado = r2(out[cur].cobrado);
    out[cur].porCobrar = r2(out[cur].porCobrar);
    out[cur].egresos = r2(out[cur].egresos);
    out[cur].neto = r2(out[cur].cobrado - out[cur].egresos);
  }
  return out;
}

/** Calcula los números deterministas del cierre de `month`. */
export async function computeCierreData(month: string): Promise<CierreData> {
  const admin = getSupabaseAdmin();
  const prevMonth = addMonths(month, -1);

  const [
    { data: clients },
    { data: schedules },
    { data: payments },
    { data: revenues },
    { data: expenses },
    { data: cuentas },
    { data: rates },
  ] = await Promise.all([
    admin.from("clients").select("id, name, fee, fee_currency"),
    admin.from("client_fee_schedules").select("client_id, start_month, end_month, amount"),
    admin
      .from("payments")
      .select("client_id, month, status, amount_override")
      .in("month", [month, prevMonth]),
    admin
      .from("manual_revenues")
      .select("kind, amount, currency, start_date, end_date, date, status"),
    admin
      .from("expenses")
      .select("date, amount, currency, recurrence, recurrence_end_date, status, assigned_to"),
    admin.from("cuentas_bancarias").select("currency, current_balance, is_active"),
    admin
      .from("exchange_rates")
      .select("rate_date, usd_uyu_mid")
      .gte("rate_date", `${month}-01`)
      .lte("rate_date", `${month}-31`)
      .order("rate_date", { ascending: true }),
  ]);

  const rows: RawRows = {
    clients: clients ?? [],
    schedules: schedules ?? [],
    payments: (payments ?? []).filter((p) => p.month === month),
    revenues: revenues ?? [],
    expenses: expenses ?? [],
  };
  const prevRows: RawRows = { ...rows, payments: (payments ?? []).filter((p) => p.month === prevMonth) };

  const monedas = aggregateMonth(rows, month);
  const prevAgg = aggregateMonth(prevRows, prevMonth);
  const mesAnterior: Record<FinanceCurrency, CierreComparativa> = {
    USD: { cobrado: prevAgg.USD.cobrado, egresos: prevAgg.USD.egresos, neto: prevAgg.USD.neto },
    UYU: { cobrado: prevAgg.UYU.cobrado, egresos: prevAgg.UYU.egresos, neto: prevAgg.UYU.neto },
  };

  // ---- Rentabilidad por cliente (egresos asignados por NOMBRE — misma
  // convención que la distribución de dividendos) ----
  const clientes: CierreCliente[] = [];
  for (const c of rows.clients) {
    const p = rows.payments.find((pp) => pp.client_id === c.id);
    const cur = asFinanceCurrency(c.fee_currency);
    const amount =
      p?.amount_override != null
        ? num(p.amount_override)
        : feeEfectivoDelMes(
            { id: c.id, fee: c.fee, fee_currency: c.fee_currency },
            rows.schedules,
            month,
          );
    let egresosUSD = 0;
    let egresosUYU = 0;
    for (const e of rows.expenses) {
      if ((e.assigned_to ?? "") !== c.name) continue;
      const impact = expenseImpact(e, month);
      if (impact <= 0) continue;
      if (asFinanceCurrency(e.currency) === "UYU") egresosUYU += impact;
      else egresosUSD += impact;
    }
    const cobrado = p?.status === "paid" ? amount : 0;
    if (!p && egresosUSD === 0 && egresosUYU === 0) continue; // sin actividad
    clientes.push({
      id: c.id,
      name: c.name,
      currency: cur,
      cobrado: r2(cobrado),
      egresosUSD: r2(egresosUSD),
      egresosUYU: r2(egresosUYU),
      facturaStatus: p?.status ?? "sin_factura",
    });
  }
  clientes.sort((a, b) => b.cobrado - a.cobrado);

  // ---- Impagas de ESTE mes y anteriores (pending/late aún abiertas) ----
  const { data: openPayments } = await admin
    .from("payments")
    .select("client_id, month, status, amount_override")
    .in("status", ["pending", "late"])
    .lte("month", month);
  const clientById = new Map(rows.clients.map((c) => [c.id, c]));
  const impagas: CierreImpaga[] = (openPayments ?? [])
    .map((p) => {
      const c = clientById.get(p.client_id);
      if (!c) return null;
      return {
        clientId: p.client_id,
        name: c.name,
        month: p.month,
        amount:
          p.amount_override != null
            ? num(p.amount_override)
            : feeEfectivoDelMes(
                { id: c.id, fee: c.fee, fee_currency: c.fee_currency },
                rows.schedules,
                p.month,
              ),
        currency: asFinanceCurrency(c.fee_currency),
        status: p.status,
      };
    })
    .filter((x): x is CierreImpaga => x !== null)
    .sort((a, b) => a.month.localeCompare(b.month));

  const rateRows = rates ?? [];
  const tc =
    rateRows.length > 0
      ? {
          promedio: r2(
            rateRows.reduce((s, r) => s + num(r.usd_uyu_mid), 0) / rateRows.length,
          ),
          ultimo: num(rateRows[rateRows.length - 1].usd_uyu_mid),
          fecha: rateRows[rateRows.length - 1].rate_date as string,
        }
      : null;

  return {
    month,
    monedas,
    clientes,
    impagas,
    mesAnterior,
    tc,
    posicion: posicionPorMoneda(cuentas ?? []),
    generadoEl: todayUY(),
  };
}

// ==================== NARRATIVA ====================

const NARRATIVE_SYSTEM = `Sos el analista financiero interno de D&C Scale Partners (agencia de growth, Uruguay). Redactás el borrador del cierre mensual para los DOS socios (Gian y Fede). Tono rioplatense directo, sin jerga corporativa.

Reglas absolutas:
- Usá SOLO los números del JSON. Si un dato no está, no lo menciones — jamás inventes ni estimes.
- Los montos van con su moneda (USD y UYU por separado — nunca los sumes entre sí).
- Estructura (markdown, sin título principal):
  1. **El mes en una línea** — neto por moneda y si fue mejor o peor que el mes anterior.
  2. **Ingresos** — qué se cobró, qué quedó por cobrar, quién no pagó.
  3. **Egresos** — dónde se fue la plata, desvío vs mes anterior si es relevante.
  4. **Rentabilidad por cliente** — quién dejó margen y quién está costando más de lo que paga (solo si los datos lo muestran).
  5. **Para mirar** — máximo 3 bullets accionables (cobranzas pendientes, descalce de moneda, gastos que crecen).
- Máximo ~350 palabras. Esto es un DRAFT: los socios lo revisan antes de darlo por cierre.`;

/**
 * Genera (o regenera) el cierre de un mes: computa números, redacta la
 * narrativa y hace upsert en monthly_closes. Lanza CierreFinalError si el
 * cierre ya fue finalizado por los socios.
 */
export async function generarCierre(
  month: string,
  source: string,
): Promise<{ row: MonthlyCloseRow; narrativeOk: boolean }> {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error(`Mes inválido: '${month}' (esperado YYYY-MM)`);
  }
  const admin = getSupabaseAdmin();

  const { data: existing } = await admin
    .from("monthly_closes")
    .select("status")
    .eq("month", month)
    .maybeSingle();
  if (existing?.status === "final") throw new CierreFinalError(month);

  const data = await computeCierreData(month);

  // Narrativa — si Claude falla, guardamos igual los números (degraded).
  let narrative: string | null = null;
  let model: string | null = null;
  let narrativeOk = false;
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const anthropic = new Anthropic();
      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL_SONNET,
        max_tokens: 1400,
        system: [{ type: "text", text: NARRATIVE_SYSTEM }],
        messages: [
          {
            role: "user",
            content: `Cierre de ${month}. Números deterministas del sistema:\n\n${JSON.stringify(data, null, 2)}`,
          },
        ],
      });
      const block = response.content.find((b) => b.type === "text");
      narrative = block && block.type === "text" ? block.text.trim() : null;
      model = response.model;
      narrativeOk = Boolean(narrative);
      await recordApiUsage({
        source,
        clientId: null,
        model: response.model,
        usage: response.usage,
      });
    } catch (err) {
      console.error("[cierre] narrativa falló (se guardan solo números):", err);
    }
  }

  const { data: row, error } = await admin
    .from("monthly_closes")
    .upsert(
      {
        month,
        status: "draft",
        data,
        narrative_md: narrative,
        model,
        generated_at: new Date().toISOString(),
        finalized_at: null,
        finalized_by: null,
      },
      { onConflict: "month" },
    )
    .select("*")
    .single();
  if (error || !row) {
    throw new Error(`No se pudo guardar el cierre: ${error?.message ?? "?"}`);
  }

  return { row: row as MonthlyCloseRow, narrativeOk };
}
