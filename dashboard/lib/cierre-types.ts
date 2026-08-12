// ==================== TIPOS DEL CIERRE MENSUAL (FIN-3) ====================
// Client-safe: solo tipos, sin imports server-only. El shape de
// monthly_closes.data es CierreData — lo produce lib/cierre.ts (server) y lo
// renderiza CierreView (browser).

import type { FinanceCurrency } from "./types";

export interface CierreMoneda {
  /** Cobrado del mes: payments paid + ingresos manuales paid. */
  cobrado: number;
  /** Facturado y NO cobrado al cierre (pending/late). */
  porCobrar: number;
  egresos: number;
  /** cobrado - egresos. */
  neto: number;
}

export interface CierreCliente {
  id: string;
  name: string;
  currency: FinanceCurrency;
  /** Lo efectivamente cobrado a este cliente en el mes (0 si no pagó). */
  cobrado: number;
  /** Egresos del mes asignados a este cliente (por nombre, misma
   *  convención que dividendos). Puede mezclar monedas — se separa. */
  egresosUSD: number;
  egresosUYU: number;
  /** Estado de su factura del mes: paid / pending / late / sin_factura. */
  facturaStatus: string;
}

export interface CierreImpaga {
  clientId: string;
  name: string;
  month: string;
  amount: number;
  currency: FinanceCurrency;
  status: string;
}

export interface CierreComparativa {
  cobrado: number;
  egresos: number;
  neto: number;
}

export interface CierreData {
  month: string;
  monedas: Record<FinanceCurrency, CierreMoneda>;
  clientes: CierreCliente[];
  impagas: CierreImpaga[];
  /** Mismos agregados del mes anterior, para desvíos. */
  mesAnterior: Record<FinanceCurrency, CierreComparativa> | null;
  /** TC del período: promedio del mes y último disponible. */
  tc: { promedio: number; ultimo: number; fecha: string } | null;
  /** Posición de cuentas al momento de generar (no snapshot de fin de mes). */
  posicion: Record<string, number>;
  generadoEl: string;
}

export interface MonthlyCloseRow {
  id: string;
  month: string;
  status: "draft" | "final";
  data: CierreData;
  narrative_md: string | null;
  model: string | null;
  generated_at: string;
  finalized_at: string | null;
}
