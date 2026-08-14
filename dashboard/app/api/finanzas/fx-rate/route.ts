/**
 * GET /api/finanzas/fx-rate
 *
 * Devuelve la cotización del día USD → UYU (cuántos pesos uruguayos
 * vale 1 dólar). La usa el Panel principal de Finanzas para convertir
 * los ingresos/egresos en pesos a dólares y mostrar todo en USD.
 *
 * Fuente: open.er-api.com (free tier de exchangerate-api, sin API key).
 * Si la fuente falla, devolvemos un fallback constante para que el
 * dashboard no se rompa — el `source` indica cuál se usó.
 *
 * Cache: 6 horas. El tipo de cambio no se mueve tanto intradía y
 * evita pegarle a la API en cada carga.
 */

export const revalidate = 21600; // 6h

/** Fallback si la API externa no responde. Aproximado — el UI avisa
 *  que es un valor de reserva. */
const FALLBACK_USD_UYU = 40;

export async function GET() {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      // Revalida cada 6h a nivel del data cache de Next.
      next: { revalidate: 21600 },
    });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const data = (await res.json()) as {
      result?: string;
      rates?: Record<string, number>;
      time_last_update_utc?: string;
    };
    const rate = data.rates?.UYU;
    if (data.result !== "success" || typeof rate !== "number" || rate <= 0) {
      throw new Error("respuesta sin UYU");
    }
    return Response.json({
      rate,
      updatedAt: data.time_last_update_utc ?? null,
      source: "open.er-api.com",
    });
  } catch (err) {
    console.warn("[fx-rate] fallback:", (err as Error).message);
    return Response.json({
      rate: FALLBACK_USD_UYU,
      updatedAt: null,
      source: "fallback",
    });
  }
}
