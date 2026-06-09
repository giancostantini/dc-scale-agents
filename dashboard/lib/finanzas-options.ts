/**
 * Catálogos hardcoded para forms de Finanzas premium.
 * En el futuro pueden migrar a tablas con CRUD.
 */

export const INCOME_CATEGORIES = [
  "Servicios profesionales",
  "Asesoramientos",
  "Auditoría",
  "Honorarios contables",
  "Liquidación de impuestos",
  "Otros ingresos",
] as const;

export const EXPENSE_CATEGORIES = [
  { value: "equipo", label: "Funcionales / Sueldos" },
  { value: "tools", label: "Tools / Software" },
  { value: "ia", label: "IA / Suscripciones" },
  { value: "produccion", label: "Producción" },
  { value: "impuestos", label: "Impuestos" },
  { value: "mkt_interno", label: "Marketing interno" },
  { value: "otros", label: "Varios" },
] as const;

export const PAYMENT_METHODS = [
  { value: "transferencia", label: "Transferencia bancaria" },
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta", label: "Tarjeta de crédito/débito" },
  { value: "cheque", label: "Cheque" },
  { value: "mp", label: "Mercado Pago" },
  { value: "crypto", label: "Cripto / USDT" },
  { value: "otro", label: "Otro" },
] as const;

export const CURRENCIES = [
  { value: "USD", label: "USD · Dólar" },
  { value: "UYU", label: "UYU · Peso uruguayo" },
  { value: "ARS", label: "ARS · Peso argentino" },
  { value: "EUR", label: "EUR · Euro" },
  { value: "BRL", label: "BRL · Real" },
] as const;

export const IVA_OPTIONS = [
  { value: 22, label: "22% — Tasa básica" },
  { value: 10, label: "10% — Tasa mínima" },
  { value: 0, label: "0% — Exento / No gravado" },
] as const;

export const REVENUE_STATUSES = [
  { value: "paid", label: "Cobrado", tone: "success" as const },
  { value: "pending", label: "Pendiente", tone: "warn" as const },
  { value: "cancelled", label: "Cancelado", tone: "danger" as const },
] as const;

export const EXPENSE_STATUSES = [
  { value: "paid", label: "Pagado", tone: "success" as const },
  { value: "pending", label: "Pendiente", tone: "warn" as const },
  { value: "cancelled", label: "Cancelado", tone: "danger" as const },
] as const;
