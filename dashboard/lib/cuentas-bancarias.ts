/**
 * Helpers para gestión de cuentas bancarias + movimientos.
 *
 * Modelo:
 *   - cuentas_bancarias: una fila por cuenta. Saldo se mantiene por
 *     trigger en DB (cuenta_recalc_balance).
 *   - cuenta_movimientos: entrada/salida con fecha + categoría +
 *     comprobante adjunto opcional.
 */

import { getSupabase } from "./supabase/client";

export type Currency = "ARS" | "UYU" | "USD" | "EUR" | "BRL";

export type BankSlug =
  | "nacion"
  | "santander"
  | "bbva"
  | "brou"
  | "itau"
  | "scotia"
  | "galicia"
  | "macro"
  | "hsbc"
  | "mercado_pago"
  | "uala"
  | "wise"
  | "payoneer"
  | "otro";

export const BANK_LABEL: Record<BankSlug, string> = {
  nacion: "Banco de la Nación Argentina",
  santander: "Banco Santander",
  bbva: "BBVA",
  brou: "BROU",
  itau: "Itaú",
  scotia: "Scotiabank",
  galicia: "Galicia",
  macro: "Macro",
  hsbc: "HSBC",
  mercado_pago: "Mercado Pago",
  uala: "Ualá",
  wise: "Wise",
  payoneer: "Payoneer",
  otro: "Otro",
};

/** Color de la "marca" para el chip del banco. */
export const BANK_COLOR: Record<BankSlug, { bg: string; text: string }> = {
  nacion:       { bg: "#FEF3C7", text: "#92400E" }, // dorado nación
  santander:    { bg: "#FEE2E2", text: "#B91C1C" }, // rojo santander
  bbva:         { bg: "#DBEAFE", text: "#1E40AF" }, // azul bbva
  brou:         { bg: "#DBEAFE", text: "#1D4ED8" },
  itau:         { bg: "#FFEDD5", text: "#C2410C" },
  scotia:       { bg: "#FEE2E2", text: "#B91C1C" },
  galicia:      { bg: "#FFEDD5", text: "#C2410C" },
  macro:        { bg: "#DBEAFE", text: "#1D4ED8" },
  hsbc:         { bg: "#FEE2E2", text: "#B91C1C" },
  mercado_pago: { bg: "#DBEAFE", text: "#0284C7" }, // celeste MP
  uala:         { bg: "#EDE9FE", text: "#6D28D9" },
  wise:         { bg: "#D1FAE5", text: "#047857" },
  payoneer:     { bg: "#FFE4E6", text: "#BE123C" },
  otro:         { bg: "#E2E8F0", text: "#475569" },
};

export type MovimientoCategoria =
  | "ingreso"
  | "pago"
  | "gasto"
  | "impuestos"
  | "transferencia"
  | "comision"
  | "otro";

export const CATEGORIA_LABEL: Record<MovimientoCategoria, string> = {
  ingreso: "Ingreso",
  pago: "Pago",
  gasto: "Gasto",
  impuestos: "Impuestos",
  transferencia: "Transferencia",
  comision: "Comisión",
  otro: "Otro",
};

/** Color del pill por categoría — alineado al mockup. */
export const CATEGORIA_COLOR: Record<MovimientoCategoria, string> = {
  ingreso: "bg-emerald-100 text-emerald-700",
  pago: "bg-rose-100 text-rose-700",
  gasto: "bg-amber-100 text-amber-700",
  impuestos: "bg-violet-100 text-violet-700",
  transferencia: "bg-sky-100 text-sky-700",
  comision: "bg-orange-100 text-orange-700",
  otro: "bg-slate-100 text-slate-700",
};

export interface CuentaBancaria {
  id: string;
  bank_slug: BankSlug;
  bank_name: string;
  account_name: string;
  last4: string;
  currency: Currency;
  current_balance: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CuentaMovimiento {
  id: string;
  cuenta_id: string;
  fecha: string; // YYYY-MM-DD
  description: string;
  category: MovimientoCategoria;
  entry_amount: number;
  exit_amount: number;
  comprobante_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Cuentas
// ============================================================
export async function listCuentas(): Promise<CuentaBancaria[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("cuentas_bancarias")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("listCuentas:", error);
    return [];
  }
  return (data ?? []).map(cuentaFromRow);
}

export interface CreateCuentaInput {
  bank_slug: BankSlug;
  bank_name: string;
  account_name?: string;
  last4: string;
  currency: Currency;
  notes?: string;
  initial_balance?: number;
}

export async function createCuenta(
  input: CreateCuentaInput,
): Promise<CuentaBancaria> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("cuentas_bancarias")
    .insert({
      bank_slug: input.bank_slug,
      bank_name: input.bank_name,
      account_name: input.account_name ?? "",
      last4: input.last4.replace(/\D/g, "").slice(-4).padStart(4, "0"),
      currency: input.currency,
      notes: input.notes ?? null,
      // Si pasa initial_balance, lo registramos como un movimiento
      // "ingreso" de apertura para que current_balance lo refleje via
      // trigger. El default acá es 0; el movimiento se inserta después.
      current_balance: 0,
    })
    .select("*")
    .single();
  if (error) throw new Error(`Error creando cuenta: ${error.message}`);
  const cuenta = cuentaFromRow(data);
  if (input.initial_balance && input.initial_balance > 0) {
    await createMovimiento({
      cuenta_id: cuenta.id,
      fecha: new Date().toISOString().slice(0, 10),
      description: "Saldo de apertura",
      category: "ingreso",
      entry_amount: input.initial_balance,
      exit_amount: 0,
    });
  }
  return cuenta;
}

export interface UpdateCuentaInput {
  bank_slug?: BankSlug;
  bank_name?: string;
  account_name?: string;
  last4?: string;
  currency?: Currency;
  is_active?: boolean;
  notes?: string | null;
}

export async function updateCuenta(
  id: string,
  patch: UpdateCuentaInput,
): Promise<void> {
  const supabase = getSupabase();
  const clean: Record<string, unknown> = { ...patch };
  if (clean.last4) {
    clean.last4 = String(clean.last4).replace(/\D/g, "").slice(-4).padStart(4, "0");
  }
  const { error } = await supabase
    .from("cuentas_bancarias")
    .update(clean)
    .eq("id", id);
  if (error) throw new Error(`Error actualizando cuenta: ${error.message}`);
}

export async function deleteCuenta(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("cuentas_bancarias")
    .delete()
    .eq("id", id);
  if (error) throw new Error(`Error eliminando cuenta: ${error.message}`);
}

// ============================================================
// Movimientos
// ============================================================
export async function listMovimientos(opts?: {
  cuentaId?: string;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<CuentaMovimiento[]> {
  const supabase = getSupabase();
  let q = supabase
    .from("cuenta_movimientos")
    .select("*")
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });
  if (opts?.cuentaId) q = q.eq("cuenta_id", opts.cuentaId);
  if (opts?.from) q = q.gte("fecha", opts.from);
  if (opts?.to) q = q.lte("fecha", opts.to);
  if (opts?.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) {
    console.error("listMovimientos:", error);
    return [];
  }
  return (data ?? []).map(movFromRow);
}

export interface CreateMovimientoInput {
  cuenta_id: string;
  fecha: string;
  description: string;
  category: MovimientoCategoria;
  entry_amount: number;
  exit_amount: number;
  comprobante_id?: string | null;
  notes?: string | null;
}

export async function createMovimiento(
  input: CreateMovimientoInput,
): Promise<CuentaMovimiento> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("cuenta_movimientos")
    .insert({
      cuenta_id: input.cuenta_id,
      fecha: input.fecha,
      description: input.description,
      category: input.category,
      entry_amount: input.entry_amount,
      exit_amount: input.exit_amount,
      comprobante_id: input.comprobante_id ?? null,
      notes: input.notes ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`Error creando movimiento: ${error.message}`);
  return movFromRow(data);
}

export async function deleteMovimiento(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("cuenta_movimientos")
    .delete()
    .eq("id", id);
  if (error) throw new Error(`Error eliminando movimiento: ${error.message}`);
}

// ============================================================
// Helpers
// ============================================================
function cuentaFromRow(r: Record<string, unknown>): CuentaBancaria {
  return {
    id: String(r.id),
    bank_slug: (r.bank_slug as BankSlug) ?? "otro",
    bank_name: String(r.bank_name ?? ""),
    account_name: String(r.account_name ?? ""),
    last4: String(r.last4 ?? "0000"),
    currency: (r.currency as Currency) ?? "USD",
    current_balance:
      typeof r.current_balance === "string"
        ? parseFloat(r.current_balance)
        : Number(r.current_balance ?? 0),
    is_active: Boolean(r.is_active),
    notes: (r.notes as string | null) ?? null,
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  };
}

function movFromRow(r: Record<string, unknown>): CuentaMovimiento {
  const toNum = (v: unknown) =>
    typeof v === "string" ? parseFloat(v) : Number(v ?? 0);
  return {
    id: String(r.id),
    cuenta_id: String(r.cuenta_id),
    fecha: String(r.fecha),
    description: String(r.description ?? ""),
    category: (r.category as MovimientoCategoria) ?? "otro",
    entry_amount: toNum(r.entry_amount),
    exit_amount: toNum(r.exit_amount),
    comprobante_id: (r.comprobante_id as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  };
}

/**
 * Formatea monto con símbolo según moneda.
 *
 * IMPORTANTE: sin redondear — siempre devuelve 2 decimales. Para los
 * movimientos de cuentas bancarias y los saldos, redondear hacía
 * desaparecer los centavos y desfasaba el saldo real (un movimiento
 * de USD 14,40 se veía como "USD 14" y la suma de varios redondeos
 * podía dejar el saldo total descuadrado contra los bancos).
 */
export function formatCurrency(amount: number, currency: Currency): string {
  const v = amount.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  switch (currency) {
    case "ARS":
      return `$ ${v}`;
    case "UYU":
      return `$U ${v}`;
    case "USD":
      return `USD ${v}`;
    case "EUR":
      return `€ ${v}`;
    case "BRL":
      return `R$ ${v}`;
    default:
      return `${currency} ${v}`;
  }
}
