import { getSupabase } from "./supabase/client";
import { agentCatalog } from "./agent-registry";
import type { AgentRun, AgentOutput, ClientModules } from "./types";

export interface AgentDef {
  key: string;
  name: string;
  desc: string;
  defaultBrief: Record<string, unknown>;
  /** If true, card is hidden when the client's modules don't include it. */
  moduleGate?: "content" | "seo" | "analytics" | "ecommerce";
}

/**
 * El catálogo se DERIVA del registry único (lib/agent-registry.ts, flag
 * uiCatalog) — Stage 0. Antes era una lista literal acá que driftaba del
 * resto del sistema (llegó a ofrecer un agente ya eliminado).
 * Morning Briefing no aparece como card a propósito: se muestra como panel
 * del día del cliente vía /api/clients/[id]/briefing/latest.
 */
export const AGENT_CATALOG: AgentDef[] = agentCatalog();

export function filterAgentsForClient(
  agents: AgentDef[],
  modules: ClientModules | null | undefined,
  clientType?: string,
): AgentDef[] {
  if (!modules && !clientType) return agents;
  const ext = modules as (ClientModules & { ecommerce?: boolean }) | null | undefined;
  return agents.filter((a) => {
    if (!a.moduleGate) return true;
    if (a.moduleGate === "ecommerce") {
      const sector = typeof clientType === "string" ? clientType.toLowerCase() : "";
      return sector.includes("ecommerce") || Boolean(ext?.ecommerce);
    }
    return Boolean(modules?.[a.moduleGate]);
  });
}

export async function getRecentRuns(
  clientId: string,
  limit = 30,
): Promise<AgentRun[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("agent_runs")
    .select("*")
    .eq("client", clientId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("getRecentRuns error:", error);
    return [];
  }
  return (data ?? []) as AgentRun[];
}

export async function getAllRecentRuns(limit = 60): Promise<AgentRun[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("agent_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("getAllRecentRuns error:", error);
    return [];
  }
  return (data ?? []) as AgentRun[];
}

export async function getOutputsForRun(runId: number): Promise<AgentOutput[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("agent_outputs")
    .select("*")
    .eq("run_id", runId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("getOutputsForRun error:", error);
    return [];
  }
  return (data ?? []) as AgentOutput[];
}

export async function runAgent(
  clientId: string,
  agent: string,
  brief: Record<string, unknown>,
): Promise<{ runId: number } | { error: string }> {
  const res = await fetch("/api/agents/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, agent, brief }),
  });
  const data = (await res.json()) as { runId?: number; error?: string };
  if (!res.ok || !data.runId) {
    return { error: data.error ?? `HTTP ${res.status}` };
  }
  return { runId: data.runId };
}
