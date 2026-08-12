// ==================== TESORERÍA MULTIMONEDA (FIN-0) ====================
// Cálculo de posición por moneda, proyección de flujo del mes y descalce
// (egresos de una moneda que no se cubren con ingresos de esa moneda).
//
// Este módulo es PURO: no importa supabase ni toca red. Los callers le
// pasan los datos ya cargados:
//   - La vista Tesorería (browser) le pasa los objetos camelCase que ya
//     carga la página de Finanzas (Expense, ManualRevenue, etc.).
//   - El cron /api/cron/fx-rates (server, service role) le pasa las filas
//     crudas de Supabase (snake_case).
// Por eso las shapes de input aceptan ambos naming donde difieren.
//
// Regla de calce (dolor #1 de Fede): los ingresos UYU cubren los egresos
// UYU. Si los egresos proyectados de una moneda superan sus ingresos
// proyectados, hay que convertir desde la otra moneda — eso es un
// "descalce" y se alerta con el monto estimado al TC del día.
// La CONVERSIÓN en sí es siempre humana (RED — la ejecutan los socios).

import type { FinanceCurrency } from "./types";

export interface ExchangeRateRow {
  rate_date: string;
  usd_uyu_buy: number | null;
  usd_uyu_sell: number | null;
  usd_uyu_mid: number;
  source: string;
}

/** Cuenta bancaria mínima para posición. Compatible con CuentaBancaria
 *  (lib/cuentas-bancarias) y con la fila cruda de Supabase. */
export interface CuentaLike {
  currency: string;
  current_balance: number | string;
  is_active: boolean;
}

/** Cliente mínimo para proyectar fees. Compatible con Client (types.ts)
 *  y con la fila cruda de `clients`. */
export interface ClientFeeLike {
  id: string;
  fee: number | string | null;
  fee_currency?: string | null;
  status?: string | null;
}

/** Tramo de client_fee_schedules. Acepta camelCase (ClientFeeSchedule de
 *  storage.ts) o snake_case (fila cruda). */
export interface FeeScheduleLike {
  clientId?: string;
  client_id?: string;
  startMonth?: string;
  start_month?: string;
  endMonth?: string | null;
  end_month?: string | null;
  amount: number | string;
}

/** Ingreso manual (manual_revenues). Mismo shape en ambos mundos. */
export interface RevenueLike {
  kind: string;
  amount: number | string;
  currency: string | null;
  start_date: string | null;
  end_date: string | null;
  date: string | null;
  status?: string | null;
}

/** Egreso (expenses). Acepta Expense camelCase o fila cruda snake_case. */
export interface ExpenseLike {
  date: string;
  amount: number | string;
  currency?: string | null;
  recurrence?: string | null;
  recurrenceEndDate?: string | null;
  recurrence_end_date?: string | null;
  status?: string | null;
}

export interface FlujoMoneda {
  ingresos: number;
  egresos: number;
  /** ingresos - egresos. Negativo = esa moneda no se autofinancia este mes. */
  neto: number;
}

export interface DescalceMoneda {
  currency: FinanceCurrency;
  /** Cuánto falta en esa moneda (valor positivo). */
  faltante: number;
  /** Equivalente en la otra moneda al TC mid del día (null sin TC). */
  equivalenteOtraMoneda: number | null;
  /** Moneda desde la que habría que convertir. */
  desde: FinanceCurrency;
}

export interface ProyeccionMes {
  month: string; // YYYY-MM
  flujo: Record<FinanceCurrency, FlujoMoneda>;
  descalces: DescalceMoneda[];
}

function num(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
}

/** Normaliza cualquier moneda del sistema al eje USD/UYU de tesorería.
 *  Todo lo que no es UYU se trata como USD (el default de la mig 082). */
export function asFinanceCurrency(c: string | null | undefined): FinanceCurrency {
  return c === "UYU" ? "UYU" : "USD";
}

/** Mes actual en hora Uruguay (YYYY-MM). El server de Vercel corre en UTC
 *  y a la noche uruguaya el mes UTC puede ya haber cambiado. */
export function currentMonthUY(): string {
  return new Date()
    .toLocaleDateString("en-CA", { timeZone: "America/Montevideo" })
    .slice(0, 7);
}

/** Fecha de hoy en hora Uruguay (YYYY-MM-DD). */
export function todayUY(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Montevideo" });
}

// ==================== POSICIÓN ====================

/** Suma current_balance de las cuentas activas, agrupado por moneda.
 *  Devuelve un mapa moneda → saldo con TODAS las monedas presentes
 *  (no solo USD/UYU — hay cuentas EUR/ARS/BRL posibles). */
export function posicionPorMoneda(cuentas: CuentaLike[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of cuentas) {
    if (!c.is_active) continue;
    const cur = c.currency || "USD";
    out[cur] = (out[cur] ?? 0) + num(c.current_balance);
  }
  return out;
}

// ==================== PROYECCIÓN DEL MES ====================

function scheduleClientId(s: FeeScheduleLike): string {
  return s.clientId ?? s.client_id ?? "";
}
function scheduleStart(s: FeeScheduleLike): string {
  return s.startMonth ?? s.start_month ?? "";
}
function scheduleEnd(s: FeeScheduleLike): string | null {
  return s.endMonth ?? s.end_month ?? null;
}

/** Fee efectivo del mes para un cliente: el tramo vigente más reciente de
 *  client_fee_schedules, o el fee del contrato si no hay tramos. Misma
 *  semántica que effectiveFeeForMonth de storage.ts, tolerando snake_case. */
export function feeEfectivoDelMes(
  client: ClientFeeLike,
  schedules: FeeScheduleLike[],
  yyyymm: string,
): number {
  const applicable = schedules
    .filter(
      (s) =>
        scheduleClientId(s) === client.id &&
        scheduleStart(s) <= yyyymm &&
        (!scheduleEnd(s) || (scheduleEnd(s) as string) >= yyyymm),
    )
    .sort((a, b) => scheduleStart(b).localeCompare(scheduleStart(a)));
  return applicable.length > 0 ? num(applicable[0].amount) : num(client.fee);
}

/** Impacto de un manual revenue en el mes (misma regla que
 *  revenueMonthlyImpact de finanzas.ts) — pero acá SÍ excluimos los
 *  cancelados: tesorería proyecta plata que va a entrar de verdad. */
function revenueImpact(rev: RevenueLike, yyyymm: string): number {
  if (rev.status === "cancelled") return 0;
  if (rev.kind === "one_time") {
    if (!rev.date) return 0;
    return rev.date.startsWith(yyyymm) ? num(rev.amount) : 0;
  }
  if (!rev.start_date) return 0;
  const monthStart = `${yyyymm}-01`;
  const startsBefore = rev.start_date <= monthStart;
  const endsAfter = !rev.end_date || rev.end_date >= monthStart;
  return startsBefore && endsAfter ? num(rev.amount) : 0;
}

function expenseRecurrenceEnd(e: ExpenseLike): string | null {
  return e.recurrenceEndDate ?? e.recurrence_end_date ?? null;
}

/** ¿Este egreso impacta en el mes yyyymm?
 *  - one_time: su date cae dentro del mes.
 *  - monthly_fixed: una instancia por mes desde su mes de alta hasta
 *    recurrence_end_date (misma expansión que PremiumEgresos).
 *  Exportada porque el cierre mensual (lib/cierre.ts) usa la misma regla. */
export function expenseImpact(e: ExpenseLike, yyyymm: string): number {
  if (e.status === "cancelled") return 0;
  if (e.recurrence === "monthly_fixed") {
    const startMonth = (e.date ?? "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(startMonth) || startMonth > yyyymm) return 0;
    const endMonth = expenseRecurrenceEnd(e)?.slice(0, 7) ?? null;
    if (endMonth && endMonth < yyyymm) return 0;
    return num(e.amount);
  }
  return (e.date ?? "").startsWith(yyyymm) ? num(e.amount) : 0;
}

/**
 * Proyección de flujo del mes por moneda + descalces.
 *
 * Ingresos = fees de clientes activos/onboarding (en la moneda de
 * facturación de cada cliente, mig 082) + ingresos manuales del mes.
 * Egresos = expenses del mes (únicos + recurrentes vigentes).
 *
 * `rate` (usd_uyu_mid) habilita el cálculo del equivalente a convertir;
 * sin TC el descalce se reporta igual pero sin equivalencia.
 */
export function proyeccionDelMes(input: {
  month: string;
  clients: ClientFeeLike[];
  feeSchedules: FeeScheduleLike[];
  revenues: RevenueLike[];
  expenses: ExpenseLike[];
  rate?: number | null;
}): ProyeccionMes {
  const { month, clients, feeSchedules, revenues, expenses, rate } = input;
  const flujo: Record<FinanceCurrency, FlujoMoneda> = {
    USD: { ingresos: 0, egresos: 0, neto: 0 },
    UYU: { ingresos: 0, egresos: 0, neto: 0 },
  };

  for (const c of clients) {
    // Los DEV se operan por sprint, pero también facturan fee mensual;
    // solo quedan afuera los archivados/pausados si existieran.
    if (c.status && !["active", "onboarding", "dev"].includes(c.status)) continue;
    const fee = feeEfectivoDelMes(c, feeSchedules, month);
    if (fee <= 0) continue;
    flujo[asFinanceCurrency(c.fee_currency)].ingresos += fee;
  }

  for (const r of revenues) {
    const impact = revenueImpact(r, month);
    if (impact <= 0) continue;
    flujo[asFinanceCurrency(r.currency)].ingresos += impact;
  }

  for (const e of expenses) {
    const impact = expenseImpact(e, month);
    if (impact <= 0) continue;
    flujo[asFinanceCurrency(e.currency)].egresos += impact;
  }

  const descalces: DescalceMoneda[] = [];
  for (const cur of ["USD", "UYU"] as FinanceCurrency[]) {
    flujo[cur].neto = flujo[cur].ingresos - flujo[cur].egresos;
    if (flujo[cur].neto < 0) {
      const faltante = Math.abs(flujo[cur].neto);
      const otra: FinanceCurrency = cur === "UYU" ? "USD" : "UYU";
      let equivalente: number | null = null;
      if (rate && rate > 0) {
        // Falta UYU → se cubre vendiendo USD: faltante / TC.
        // Falta USD → se cubre vendiendo UYU: faltante * TC.
        equivalente = cur === "UYU" ? faltante / rate : faltante * rate;
      }
      descalces.push({
        currency: cur,
        faltante,
        equivalenteOtraMoneda: equivalente,
        desde: otra,
      });
    }
  }

  return { month, flujo, descalces };
}

/** Suma n meses a un YYYY-MM. */
export function addMonths(yyyymm: string, n: number): string {
  const [y, m] = yyyymm.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

export interface PosicionProyectada {
  month: string;
  /** Posición estimada al cierre de ese mes, por moneda (USD/UYU). */
  USD: number;
  UYU: number;
}

export interface ProyeccionMultiMes {
  meses: ProyeccionMes[];
  /** Posición acumulada: posición actual + neto proyectado mes a mes. */
  posiciones: PosicionProyectada[];
}

/**
 * Proyección de cashflow a N meses (FIN-3): aplica proyeccionDelMes a cada
 * mes consecutivo y acumula la posición partiendo de la posición actual de
 * las cuentas. Determinista y explicable: fees programados + ingresos
 * manuales fijos vigentes − egresos recurrentes/registrados. Los one-time
 * futuros no se inventan — si no están cargados, no existen.
 */
export function proyeccionMeses(input: {
  startMonth: string;
  count: number;
  clients: ClientFeeLike[];
  feeSchedules: FeeScheduleLike[];
  revenues: RevenueLike[];
  expenses: ExpenseLike[];
  rate?: number | null;
  /** Posición actual por moneda (de posicionPorMoneda). */
  posicionActual: Record<string, number>;
}): ProyeccionMultiMes {
  const meses: ProyeccionMes[] = [];
  const posiciones: PosicionProyectada[] = [];
  let usd = input.posicionActual.USD ?? 0;
  let uyu = input.posicionActual.UYU ?? 0;

  for (let i = 0; i < input.count; i++) {
    const month = addMonths(input.startMonth, i);
    const p = proyeccionDelMes({
      month,
      clients: input.clients,
      feeSchedules: input.feeSchedules,
      revenues: input.revenues,
      expenses: input.expenses,
      rate: input.rate,
    });
    meses.push(p);
    usd += p.flujo.USD.neto;
    uyu += p.flujo.UYU.neto;
    posiciones.push({ month, USD: Math.round(usd * 100) / 100, UYU: Math.round(uyu * 100) / 100 });
  }

  return { meses, posiciones };
}

/** Texto humano del descalce para la alerta y la UI. */
export function descalceResumen(d: DescalceMoneda, month: string): string {
  const fmt = (n: number) => Math.round(n).toLocaleString("es-UY");
  const base = `Los egresos en ${d.currency} de ${month} superan los ingresos proyectados en ${d.currency} por ${d.currency} ${fmt(d.faltante)}.`;
  if (d.equivalenteOtraMoneda == null) {
    return `${base} No hay TC cargado para estimar la conversión.`;
  }
  return `${base} Al TC del día habría que convertir ~${d.desde} ${fmt(d.equivalenteOtraMoneda)}.`;
}
