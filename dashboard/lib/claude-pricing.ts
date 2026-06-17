/**
 * Precios de la API de Claude (USD por 1M tokens) + cálculo de costo de una
 * fila de `api_usage`. Centralizado acá para que el panel de gasto calcule el
 * costo al leer (así un cambio de precios aplica retroactivo a los datos ya
 * registrados; guardamos tokens crudos, no dólares).
 *
 * Actualizá la tabla si Anthropic cambia precios.
 */

interface Price {
  input: number;
  output: number;
}

const PRICING: Record<string, Price> = {
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-opus-4-6": { input: 5, output: 25 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-sonnet-4-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

function priceFor(model: string): Price {
  if (PRICING[model]) return PRICING[model];
  // Fallback por familia si el ID exacto no está en la tabla.
  if (model.includes("opus")) return { input: 5, output: 25 };
  if (model.includes("haiku")) return { input: 1, output: 5 };
  return { input: 3, output: 15 }; // sonnet / default
}

export interface UsageRow {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
}

/**
 * Costo USD de una fila de api_usage.
 *
 * Nota: `input_tokens` de la API es el input NO cacheado (los cache reads/writes
 * se reportan aparte). Precios relativos al input: cache-read ≈ 0.1×,
 * cache-write ≈ 1.25×.
 */
export function costUsd(row: UsageRow): number {
  const p = priceFor(row.model);
  const inTok = row.input_tokens ?? 0;
  const cacheRead = row.cache_read_tokens ?? 0;
  const cacheCreate = row.cache_creation_tokens ?? 0;
  const outTok = row.output_tokens ?? 0;
  return (
    (inTok * p.input +
      cacheRead * p.input * 0.1 +
      cacheCreate * p.input * 1.25 +
      outTok * p.output) /
    1_000_000
  );
}
