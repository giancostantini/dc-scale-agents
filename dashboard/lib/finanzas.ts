// ==================== FINANZAS ====================
// Helpers para ingresos manuales (fijos + one-time) y configuración
// de distribución de dividendos.
//
// Todas las operaciones requieren rol director (gateado por RLS).

import { getSupabase } from "./supabase/client";

// ============ INGRESOS MANUALES ============

export type ManualRevenueKind = "fijo" | "one_time";

/** Métodos de pago soportados. */
export type PaymentMethod =
  | "efectivo"
  | "transferencia"
  | "tarjeta"
  | "cheque"
  | "mp"
  | "crypto"
  | "otro";

/** Estado del ingreso (cobrado / pendiente / cancelado). */
export type RevenueStatus = "paid" | "pending" | "cancelled";

export interface ManualRevenue {
  id: string;
  kind: ManualRevenueKind;
  description: string;
  amount: number;
  currency: string;
  start_date: string | null;   // para fijos
  end_date: string | null;     // para fijos (opcional, null = vigente)
  date: string | null;          // para one-time
  category: string | null;
  notes: string | null;
  /** Cliente al que se asigna este ingreso. NULL = ingreso corporativo. */
  client_id: string | null;
  /** Método de pago (migración 036). */
  payment_method: PaymentMethod | null;
  /** % de IVA del ingreso (default 22% UY). */
  iva_pct: number;
  /** URL al comprobante adjunto en Storage. */
  comprobante_url: string | null;
  /** Estado del ingreso. */
  status: RevenueStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateManualRevenueInput {
  kind: ManualRevenueKind;
  description: string;
  amount: number;
  currency?: string;
  start_date?: string | null;
  end_date?: string | null;
  date?: string | null;
  category?: string | null;
  notes?: string | null;
  /** Asignar este ingreso a un cliente. NULL/undefined = corporativo. */
  client_id?: string | null;
  payment_method?: PaymentMethod | null;
  iva_pct?: number;
  comprobante_url?: string | null;
  status?: RevenueStatus;
}

export async function listManualRevenues(): Promise<ManualRevenue[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("manual_revenues")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("listManualRevenues:", error);
    return [];
  }
  return (data ?? []) as ManualRevenue[];
}

export async function createManualRevenue(
  input: CreateManualRevenueInput,
): Promise<ManualRevenue> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("manual_revenues")
    .insert({
      kind: input.kind,
      description: input.description,
      amount: input.amount,
      currency: input.currency ?? "USD",
      start_date: input.start_date ?? null,
      end_date: input.end_date ?? null,
      date: input.date ?? null,
      category: input.category ?? null,
      notes: input.notes ?? null,
      client_id: input.client_id ?? null,
      payment_method: input.payment_method ?? null,
      iva_pct: input.iva_pct ?? 22,
      comprobante_url: input.comprobante_url ?? null,
      status: input.status ?? "paid",
      created_by: user?.id ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as ManualRevenue;
}

export async function updateManualRevenue(
  id: string,
  patch: Partial<CreateManualRevenueInput>,
): Promise<ManualRevenue> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("manual_revenues")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as ManualRevenue;
}

export async function deleteManualRevenue(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("manual_revenues")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

/**
 * Calcula cuánto suma un ingreso manual en un mes específico (YYYY-MM).
 * - one_time: aplica solo si la fecha cae dentro del mes.
 * - fijo: aplica todos los meses entre start_date y end_date (o
 *   indefinido si end_date es null).
 */
export function revenueMonthlyImpact(
  rev: ManualRevenue,
  monthYYYYMM: string,
): number {
  if (rev.kind === "one_time") {
    if (!rev.date) return 0;
    return rev.date.startsWith(monthYYYYMM) ? Number(rev.amount) : 0;
  }
  // fijo
  if (!rev.start_date) return 0;
  const monthStart = `${monthYYYYMM}-01`;
  const startsBefore = rev.start_date <= monthStart;
  // end_date inclusive: si terminó antes del mes, no cuenta
  const endsAfter = !rev.end_date || rev.end_date >= monthStart;
  return startsBefore && endsAfter ? Number(rev.amount) : 0;
}

// ============ CONFIG DE DIVIDENDOS ============

export interface DividendConfig {
  id: number;
  partner_a_pct: number;
  partner_b_pct: number;
  inversiones_pct: number;
  back_pct: number;
  partner_a_name: string;
  partner_b_name: string;
  updated_at: string;
  updated_by: string | null;
}

/** Lee la fila singleton. */
export async function getDividendConfig(): Promise<DividendConfig | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("dividend_config")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    console.error("getDividendConfig:", error);
    return null;
  }
  return data as DividendConfig | null;
}

export interface UpdateDividendConfigInput {
  partner_a_pct?: number;
  partner_b_pct?: number;
  inversiones_pct?: number;
  back_pct?: number;
  partner_a_name?: string;
  partner_b_name?: string;
}

export async function updateDividendConfig(
  patch: UpdateDividendConfigInput,
): Promise<DividendConfig> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("dividend_config")
    .update({ ...patch, updated_by: user?.id ?? null })
    .eq("id", 1)
    .select("*")
    .single();
  if (error) throw error;
  return data as DividendConfig;
}

/**
 * Aplica los porcentajes de la config sobre un net profit.
 * Devuelve los 4 valores derivados.
 */
export function distributeDividends(
  netProfit: number,
  config: DividendConfig,
): {
  partnerA: number;
  partnerB: number;
  inversiones: number;
  back: number;
  totalDistributed: number;
  remainder: number;
} {
  const partnerA = (netProfit * config.partner_a_pct) / 100;
  const partnerB = (netProfit * config.partner_b_pct) / 100;
  const inversiones = (netProfit * config.inversiones_pct) / 100;
  const back = (netProfit * config.back_pct) / 100;
  const totalDistributed = partnerA + partnerB + inversiones + back;
  const remainder = netProfit - totalDistributed;
  return { partnerA, partnerB, inversiones, back, totalDistributed, remainder };
}

// ============ DIVIDEND DISTRIBUTIONS (snapshots) ============
// Migración 057. Cada mes cerrado tiene una fila con el snapshot
// de la distribución (net + amounts + config en el momento).
// El UI lazy-genera para meses cerrados sin snapshot y permite
// "regenerar" borrando la fila.

export interface DividendDistribution {
  month_key: string;
  net_profit: number;
  partner_a_pct: number;
  partner_b_pct: number;
  inversiones_pct: number;
  back_pct: number;
  partner_a_amount: number;
  partner_b_amount: number;
  inversiones_amount: number;
  back_amount: number;
  auto_generated: boolean;
  notes: string | null;
  generated_by: string | null;
  generated_at: string;
}

export async function listDividendDistributions(): Promise<
  DividendDistribution[]
> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("dividend_distributions")
    .select("*")
    .order("month_key", { ascending: false });
  if (error) {
    console.error("listDividendDistributions:", error);
    return [];
  }
  // Cast: los numerics vienen como string desde Supabase JS.
  return (data ?? []).map((r: Record<string, unknown>) => ({
    month_key: r.month_key as string,
    net_profit: Number(r.net_profit),
    partner_a_pct: Number(r.partner_a_pct),
    partner_b_pct: Number(r.partner_b_pct),
    inversiones_pct: Number(r.inversiones_pct),
    back_pct: Number(r.back_pct),
    partner_a_amount: Number(r.partner_a_amount),
    partner_b_amount: Number(r.partner_b_amount),
    inversiones_amount: Number(r.inversiones_amount),
    back_amount: Number(r.back_amount),
    auto_generated: (r.auto_generated as boolean) ?? true,
    notes: (r.notes as string | null) ?? null,
    generated_by: (r.generated_by as string | null) ?? null,
    generated_at: r.generated_at as string,
  }));
}

/**
 * Crea (o reemplaza) el snapshot de un mes. Se usa cuando el UI
 * detecta un mes cerrado sin snapshot — calcula con los datos
 * actuales y persiste.
 */
export async function upsertDividendDistribution(
  monthKey: string,
  netProfit: number,
  config: DividendConfig,
  autoGenerated = true,
  notes: string | null = null,
): Promise<void> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const dist = distributeDividends(netProfit, config);
  const { error } = await supabase.from("dividend_distributions").upsert(
    {
      month_key: monthKey,
      net_profit: netProfit,
      partner_a_pct: config.partner_a_pct,
      partner_b_pct: config.partner_b_pct,
      inversiones_pct: config.inversiones_pct,
      back_pct: config.back_pct,
      partner_a_amount: dist.partnerA,
      partner_b_amount: dist.partnerB,
      inversiones_amount: dist.inversiones,
      back_amount: dist.back,
      auto_generated: autoGenerated,
      notes,
      generated_by: user?.id ?? null,
      generated_at: new Date().toISOString(),
    },
    { onConflict: "month_key" },
  );
  if (error) throw error;
}

/**
 * Borra el snapshot de un mes. La próxima carga del Historial
 * detectará que falta y lo regenerará con los datos actuales —
 * útil para corregir si se agregaron gastos posteriormente.
 */
export async function deleteDividendDistribution(
  monthKey: string,
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("dividend_distributions")
    .delete()
    .eq("month_key", monthKey);
  if (error) throw error;
}

// ============ DIVIDEND HISTORY EXCLUDES (legacy) ============
// Migración 055. Mantenemos los helpers pero el nuevo flujo de
// snapshots (migración 057) lo reemplaza — el botón "eliminar" del
// historial ahora borra el snapshot en vez de excluir el mes.

export interface DividendHistoryExclude {
  month_key: string;             // YYYY-MM
  reason: string | null;
  excluded_by: string | null;    // profile.id
  excluded_at: string;
}

/** Lista todos los meses excluidos. */
export async function listDividendHistoryExcludes(): Promise<
  DividendHistoryExclude[]
> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("dividend_history_excludes")
    .select("*");
  if (error) {
    console.error("listDividendHistoryExcludes:", error);
    return [];
  }
  return (data ?? []) as DividendHistoryExclude[];
}

/**
 * Agrega un mes a la lista de excluidos. Si ya estaba excluido,
 * sobreescribe la razón / excluded_by (idempotente).
 */
export async function addDividendHistoryExclude(
  monthKey: string,
  reason: string | null = null,
): Promise<void> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("dividend_history_excludes").upsert(
    {
      month_key: monthKey,
      reason,
      excluded_by: user?.id ?? null,
      excluded_at: new Date().toISOString(),
    },
    { onConflict: "month_key" },
  );
  if (error) throw error;
}

/** Reintegra un mes — lo elimina de la tabla de excluidos. */
export async function removeDividendHistoryExclude(
  monthKey: string,
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("dividend_history_excludes")
    .delete()
    .eq("month_key", monthKey);
  if (error) throw error;
}
