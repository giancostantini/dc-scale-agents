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

/** Distribuye el net profit de un mes respetando el split PER-CLIENT
 *  (migración 052). El net contribution de cada cliente (fees_paid
 *  - expenses_asignados) se distribuye con SU split (si tiene uno
 *  custom) o con el global (default). El neto no asignado a ningún
 *  cliente (revenues sueltos, gastos corporativos) usa el global.
 *
 *  Esto permite que "el cliente que trajo Federico paga 40% para él,
 *  20% para Gianluca" mientras que el resto sigue 30/30 o lo que
 *  esté en `dividend_config`.
 *
 *  Devuelve el mismo shape que `distributeDividends` + el `net` total
 *  para que el caller sepa qué persistir en el snapshot. */
export function distributeMonthByClient(input: {
  clients: Array<{
    id: string;
    name: string;
    fee: number;
    dividend_distribution?: {
      use_default: boolean;
      partner_a_pct: number;
      partner_b_pct: number;
      inversiones_pct: number;
      back_pct: number;
    } | null;
  }>;
  /** Payments del mes (ya filtrados por month=mk). */
  clientPayments: Array<{
    clientId: string;
    status: string;
    amountOverride?: number | null;
  }>;
  /** Egresos del mes con date que cae dentro (incluye monthly_fixed
   *  vigentes). El caller ya filtró por período. */
  monthExpenses: Array<{ assignedTo: string; amount: number }>;
  /** Impacto de manual revenues del mes (ya sumado, solo paid). */
  unassignedRevenue: number;
  /** Config global de dividendos — se usa como fallback para clientes
   *  con dividend_distribution=null y para revenues/expenses no
   *  asignados. */
  config: DividendConfig;
}): {
  net: number;
  partnerA: number;
  partnerB: number;
  inversiones: number;
  back: number;
} {
  let partnerA = 0;
  let partnerB = 0;
  let inversiones = 0;
  let back = 0;
  let net = 0;

  const clientNames = new Set(input.clients.map((c) => c.name));

  // Cada cliente tributa a su propio split (o al global si use_default)
  for (const c of input.clients) {
    const p = input.clientPayments.find((pp) => pp.clientId === c.id);
    const revenue = p?.status === "paid" ? (p.amountOverride ?? c.fee) : 0;
    const costs = input.monthExpenses
      .filter((e) => e.assignedTo === c.name)
      .reduce((s, e) => s + e.amount, 0);
    const clientNet = revenue - costs;
    if (clientNet === 0) continue;

    const useCustom =
      !!c.dividend_distribution && c.dividend_distribution.use_default === false;
    const splitConfig: DividendConfig = useCustom
      ? {
          ...input.config,
          partner_a_pct: c.dividend_distribution!.partner_a_pct,
          partner_b_pct: c.dividend_distribution!.partner_b_pct,
          inversiones_pct: c.dividend_distribution!.inversiones_pct,
          back_pct: c.dividend_distribution!.back_pct,
        }
      : input.config;
    const d = distributeDividends(clientNet, splitConfig);
    partnerA += d.partnerA;
    partnerB += d.partnerB;
    inversiones += d.inversiones;
    back += d.back;
    net += clientNet;
  }

  // Egresos sin asignar a ningún cliente (corporativos) + revenues
  // manuales → split global.
  const unassignedExpenses = input.monthExpenses
    .filter((e) => !clientNames.has(e.assignedTo))
    .reduce((s, e) => s + e.amount, 0);
  const unassignedNet = input.unassignedRevenue - unassignedExpenses;
  if (unassignedNet !== 0) {
    const d = distributeDividends(unassignedNet, input.config);
    partnerA += d.partnerA;
    partnerB += d.partnerB;
    inversiones += d.inversiones;
    back += d.back;
    net += unassignedNet;
  }

  return { net, partnerA, partnerB, inversiones, back };
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
  /** Estado editable — migración 058. Default 'pending'. */
  status: "paid" | "pending";
  /** Cuenta bancaria desde la que se pagó (migración 061). NULL si
   *  status='pending'. Cuando está seteada y status='paid', el
   *  sistema mantiene un movimiento de egreso en esa cuenta. */
  cuenta_id: string | null;
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
    status: (r.status === "paid" ? "paid" : "pending") as "paid" | "pending",
    cuenta_id: (r.cuenta_id as string | null) ?? null,
  }));
}

/**
 * Cambia el estado de una distribución (paid/pending) y opcionalmente
 * setea la cuenta bancaria desde la que se pagó.  Cuando status='paid'
 * y cuentaId está seteada, sincroniza un movimiento de salida en esa
 * cuenta (idempotente vía marker en notes). Cuando vuelve a pending
 * o se borra la cuenta, elimina el movimiento.
 */
export async function setDividendDistributionStatus(
  monthKey: string,
  status: "paid" | "pending",
  cuentaId: string | null = null,
): Promise<void> {
  const supabase = getSupabase();
  // Si pasa a "pending", limpiamos la cuenta también (no aplica).
  const effectiveCuentaId = status === "paid" ? cuentaId : null;
  const { error } = await supabase
    .from("dividend_distributions")
    .update({ status, cuenta_id: effectiveCuentaId })
    .eq("month_key", monthKey);
  if (error) throw error;
  // Sincronizar movimiento bancario.
  await syncDividendDistributionMovement(monthKey).catch((err) =>
    console.warn(
      "[setDividendDistributionStatus] sync movement failed:",
      err,
    ),
  );
}

const DIVIDEND_MOVEMENT_MARKER = (monthKey: string) =>
  `[auto-dividend:${monthKey}]`;

/**
 * Crea / actualiza / borra el movimiento bancario asociado al
 * dividendo de un mes dado.
 *
 *   · Si status === 'paid' Y cuenta_id != NULL → upsert movimiento.
 *   · En cualquier otro caso → borrar movimiento existente (si lo había).
 *
 * Importe: importeDistribuido = partner_a_amount + partner_b_amount
 * (lo que efectivamente sale de la cuenta para ir a los socios).
 */
async function syncDividendDistributionMovement(
  monthKey: string,
): Promise<void> {
  const supabase = getSupabase();
  const marker = DIVIDEND_MOVEMENT_MARKER(monthKey);

  // Leer el snapshot actual
  const { data: snap } = await supabase
    .from("dividend_distributions")
    .select(
      "month_key, status, cuenta_id, partner_a_amount, partner_b_amount",
    )
    .eq("month_key", monthKey)
    .maybeSingle();

  // Buscar movimiento existente con la marca
  const { data: existing } = await supabase
    .from("cuenta_movimientos")
    .select("id")
    .like("notes", `%${marker}%`)
    .limit(1)
    .maybeSingle();

  const shouldHaveMovement =
    !!snap && snap.status === "paid" && !!snap.cuenta_id;

  if (!shouldHaveMovement) {
    if (existing?.id) {
      await supabase
        .from("cuenta_movimientos")
        .delete()
        .eq("id", existing.id);
    }
    return;
  }

  const amount =
    Number(snap!.partner_a_amount ?? 0) + Number(snap!.partner_b_amount ?? 0);

  // Fecha: usar la fecha de cierre del mes (último día). Para
  // simplificar, día 28 — siempre existe.
  const [yy, mm] = monthKey.split("-").map(Number);
  const lastDay = new Date(yy, mm, 0).getDate();
  const fecha = `${yy}-${String(mm).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const monthLabel = new Date(`${monthKey}-01`).toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
  });

  const movementBody = {
    cuenta_id: snap!.cuenta_id as string,
    fecha,
    description: `Distribución dividendos · ${monthLabel}`,
    category: "egreso" as const,
    entry_amount: 0,
    exit_amount: amount,
    comprobante_id: null,
    notes: marker,
  };

  if (existing?.id) {
    await supabase
      .from("cuenta_movimientos")
      .update(movementBody)
      .eq("id", existing.id);
  } else {
    await supabase.from("cuenta_movimientos").insert(movementBody);
  }
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
 *
 * Si había un movimiento bancario asociado, lo borramos también para
 * que el saldo se ajuste solo.
 */
export async function deleteDividendDistribution(
  monthKey: string,
): Promise<void> {
  const supabase = getSupabase();
  // Borrar movimiento asociado primero (si lo había)
  const marker = DIVIDEND_MOVEMENT_MARKER(monthKey);
  await supabase
    .from("cuenta_movimientos")
    .delete()
    .like("notes", `%${marker}%`);

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
