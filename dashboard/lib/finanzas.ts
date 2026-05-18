// ==================== FINANZAS ====================
// Helpers para ingresos manuales (fijos + one-time) y configuración
// de distribución de dividendos.
//
// Todas las operaciones requieren rol director (gateado por RLS).

import { getSupabase } from "./supabase/client";

// ============ INGRESOS MANUALES ============

export type ManualRevenueKind = "fijo" | "one_time";

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
