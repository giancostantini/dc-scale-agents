// ==================== AGENT GUARDRAILS (Stage 4) — SERVER ONLY ====================
// Permisos por rol + techo de gasto mensual por agente, derivados del
// registry (fuente única de la flota). Lo consumen /api/agents/run y la
// tool run_agent de los consultores — un solo lugar para las reglas.
//
// Filosofía: fail loudly. Si un agente llegó a su techo de gasto, el error
// dice cuánto gastó, cuál es el límite y dónde se ajusta — nada de fallar
// en silencio ni de "reintentá más tarde".

import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  getAgentEntry,
  DEFAULT_AGENT_MONTHLY_LIMIT_USD,
} from "@/lib/agent-registry";
import { costUsd, type UsageRow } from "@/lib/claude-pricing";

export type GuardrailVerdict =
  | { ok: true; spentUsd: number; limitUsd: number }
  | { ok: false; status: number; error: string };

/** Mes actual en hora Uruguay (YYYY-MM). */
function currentMonthUY(): string {
  return new Date()
    .toLocaleDateString("en-CA", { timeZone: "America/Montevideo" })
    .slice(0, 7);
}

/** Gasto del mes de un agente (api_usage, source 'agent:<key>'). */
export async function agentMonthlySpendUsd(agentKey: string): Promise<number> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("api_usage")
    .select("model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens")
    .eq("source", `agent:${agentKey}`)
    .gte("created_at", `${currentMonthUY()}-01`);
  if (error || !data) return 0;
  return (data as UsageRow[]).reduce((s, row) => s + costUsd(row), 0);
}

/**
 * Valida rol + gasto antes de disparar un agente. `role` es el rol del
 * humano (o del consultor actuando en su nombre) que pide el dispatch.
 */
export async function enforceAgentGuardrails(
  agentKey: string,
  role: "director" | "team",
): Promise<GuardrailVerdict> {
  const entry = getAgentEntry(agentKey);
  if (!entry) {
    return {
      ok: false,
      status: 400,
      error: `Agente desconocido: '${agentKey}' (no está en el registry).`,
    };
  }

  const roles = entry.dispatchRoles ?? ["director", "team"];
  if (!roles.includes(role)) {
    return {
      ok: false,
      status: 403,
      error: `El agente '${agentKey}' solo puede dispararlo: ${roles.join(", ")}. Tu rol: ${role}.`,
    };
  }

  const limitUsd = entry.monthlyCostLimitUsd ?? DEFAULT_AGENT_MONTHLY_LIMIT_USD;
  if (limitUsd <= 0) {
    return { ok: true, spentUsd: 0, limitUsd: 0 };
  }

  const spentUsd = await agentMonthlySpendUsd(agentKey);
  if (spentUsd >= limitUsd) {
    return {
      ok: false,
      status: 429,
      error: `El agente '${agentKey}' alcanzó su techo de gasto mensual: USD ${spentUsd.toFixed(2)} de ${limitUsd} permitidos. Se resetea el mes próximo, o subí monthlyCostLimitUsd en dashboard/lib/agent-registry.ts.`,
    };
  }

  return { ok: true, spentUsd, limitUsd };
}
