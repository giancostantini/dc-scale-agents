/**
 * fx — tipo de cambio USD/UYU para el Panel principal de Finanzas.
 *
 * Streams separados: los montos se cargan en su moneda y no se mezclan.
 * Pero el dashboard general quiere mostrar TODO en dólares, así que los
 * montos en pesos se convierten con la cotización del día.
 */

export interface FxRate {
  /** Cuántos pesos uruguayos vale 1 dólar (USD → UYU). */
  rate: number;
  /** ISO/UTC del último update de la fuente, o null. */
  updatedAt: string | null;
  /** "open.er-api.com" o "fallback" si la API no respondió. */
  source: string;
}

/** Trae la cotización del día desde /api/finanzas/fx-rate. Nunca
 *  rechaza: si algo falla, devuelve un fallback razonable. */
export async function getFxRate(): Promise<FxRate> {
  try {
    const res = await fetch("/api/finanzas/fx-rate");
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = (await res.json()) as FxRate;
    if (typeof data.rate === "number" && data.rate > 0) return data;
    throw new Error("rate inválido");
  } catch {
    return { rate: 40, updatedAt: null, source: "fallback" };
  }
}

/** Convierte un monto en UYU a USD con la cotización dada. */
export function uyuToUsd(amountUyu: number, rate: number): number {
  if (!rate || rate <= 0) return 0;
  return amountUyu / rate;
}
