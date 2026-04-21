import { getSupabase } from "./supabase/client";
import type { AgentRun, AgentOutput, ClientModules } from "./types";

export interface AgentDef {
  key: string;
  name: string;
  desc: string;
  defaultBrief: Record<string, unknown>;
  /** If true, card is hidden when the client's modules don't include it. */
  moduleGate?: "content" | "seo" | "analytics" | "ecommerce";
}

export const AGENT_CATALOG: AgentDef[] = [
  {
    key: "content-creator",
    name: "Content Creator",
    desc: "Genera piezas listas para producción (reels, static ads, social reviews).",
    defaultBrief: { pieceType: "reel" },
    moduleGate: "content",
  },
  {
    key: "content-strategy",
    name: "Content Strategy",
    desc: "Calendario editorial semanal con briefs por pieza.",
    defaultBrief: {},
    moduleGate: "content",
  },
  {
    key: "reporting-performance",
    name: "Analytics / Reporting",
    desc: "Reports diarios/semanales/mensuales + insights en lenguaje natural.",
    defaultBrief: { mode: "daily" },
    moduleGate: "analytics",
  },
  {
    key: "morning-briefing",
    name: "Morning Briefing",
    desc: "Briefing matutino con estado del día y tareas prioritarias.",
    defaultBrief: {},
  },
  {
    key: "seo",
    name: "SEO",
    desc: "Keyword research, blog posts, meta tags optimizados.",
    defaultBrief: { pieceType: "blog-post" },
    moduleGate: "seo",
  },
  {
    key: "social-media-metrics",
    name: "Social Metrics",
    desc: "Evalúa performance de piezas publicadas y alimenta el learning loop.",
    defaultBrief: { mode: "daily" },
    moduleGate: "content",
  },
  {
    key: "stock",
    name: "Stock",
    desc: "Status / forecast / alert de inventario.",
    defaultBrief: { mode: "status" },
    moduleGate: "ecommerce",
  },
  {
    key: "logistics",
    name: "Logistics",
    desc: "Schedule / dispatch / optimize de envíos.",
    defaultBrief: { mode: "schedule" },
    moduleGate: "ecommerce",
  },
];

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
