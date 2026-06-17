/**
 * Registro de gasto de la API de Claude desde el dashboard. Llamar tras cada
 * respuesta, pasando `response.usage`. Fire-and-forget: nunca rompe el endpoint
 * (si falla, solo se pierde la métrica). Server-only (service-role).
 *
 * Convención de `source`: 'dashboard:<route>' — ej. 'dashboard:consultant',
 * 'dashboard:phases-generate'.
 */

import { getSupabaseAdmin } from "@/lib/supabase/server";

interface UsageLike {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export async function recordApiUsage(params: {
  source: string;
  clientId?: string | null;
  model: string;
  usage: UsageLike | null | undefined;
}): Promise<void> {
  const { source, clientId = null, model, usage } = params;
  if (!usage) return;
  try {
    const admin = getSupabaseAdmin();
    await admin.from("api_usage").insert({
      source,
      client_id: clientId,
      model,
      input_tokens: usage.input_tokens ?? 0,
      output_tokens: usage.output_tokens ?? 0,
      cache_read_tokens: usage.cache_read_input_tokens ?? 0,
      cache_creation_tokens: usage.cache_creation_input_tokens ?? 0,
    });
  } catch (err) {
    console.warn(
      "[api-usage] record failed (non-fatal):",
      err instanceof Error ? err.message : err,
    );
  }
}
