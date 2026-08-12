// ==================== CONSULTANT ENGINE (Stage 4) — SERVER ONLY ====================
// Motor común de los consultores IA: las piezas que TODOS comparten viven
// acá, cada endpoint queda como una config fina (prompt + tools + forma de
// respuesta). Extraído de /api/consultant y /api/consultant/global, que
// tenían copias divergentes de lo mismo.
//
// Piezas:
//   · Memoria v2 (recall + block + save) — scope client.
//   · Estado de procesos (Stage 3) — query + bloque para el prompt.
//   · dispatchAgentRun — el ÚNICO camino por el que un consultor dispara
//     un agente: guardrails del registry (rol + techo de gasto) → abre
//     agent_runs → repository_dispatch. Falla ruidoso con el motivo.

import { getSupabaseAdmin } from "@/lib/supabase/server";
import { dispatchAgentWorkflow } from "@/lib/github-dispatch";
import { enforceAgentGuardrails } from "@/lib/agent-guardrails";

// ---------------------------------------------------------------------------
// Memoria (consultant_memory_v2, scope client)
// ---------------------------------------------------------------------------

export interface MemoryRow {
  id: number;
  kind: "preference" | "constraint" | "past_decision" | "learning";
  content: string;
  importance: number | null;
  created_at: string;
}

export async function recallClientMemories(
  clientId: string,
  limit = 20,
): Promise<MemoryRow[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("consultant_memory_v2")
    .select("id, kind, content, importance, created_at")
    .eq("scope_type", "client")
    .eq("client_id", clientId)
    .or("expires_at.is.null,expires_at.gt.now()")
    .order("importance", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<MemoryRow[]>();
  if (error || !data) return [];
  return data;
}

export async function saveClientMemory(
  clientId: string,
  kind: MemoryRow["kind"],
  content: string,
  importance?: number,
): Promise<void> {
  const admin = getSupabaseAdmin();
  const clamped =
    typeof importance === "number"
      ? Math.max(1, Math.min(5, Math.round(importance)))
      : 3;
  await admin.from("consultant_memory_v2").insert({
    scope_type: "client",
    client_id: clientId,
    kind,
    content: content.slice(0, 1000),
    importance: clamped,
  });
}

export function buildMemoryBlock(memories: MemoryRow[]): string {
  if (memories.length === 0) {
    return "MEMORIA DEL CLIENTE: (vacía — esta es la primera conversación relevante)";
  }
  const labels: Record<string, string> = {
    preference: "Preferencias",
    constraint: "Restricciones (no cruzar)",
    past_decision: "Decisiones pasadas",
    learning: "Aprendizajes",
  };
  const byKind: Record<string, MemoryRow[]> = {};
  for (const m of memories) {
    (byKind[m.kind] ?? (byKind[m.kind] = [])).push(m);
  }
  const sections: string[] = ["MEMORIA DEL CLIENTE:"];
  for (const kind of ["constraint", "preference", "past_decision", "learning"] as const) {
    const items = byKind[kind];
    if (!items || items.length === 0) continue;
    sections.push(`\n${labels[kind]}:`);
    for (const m of items) {
      sections.push(`- ${m.content}${m.importance && m.importance >= 4 ? " [IMPORTANTE]" : ""}`);
    }
  }
  return sections.join("\n");
}

// ---------------------------------------------------------------------------
// Estado de procesos (process_instances, Stage 3)
// ---------------------------------------------------------------------------

export interface ProcessStatusRow {
  process: string;
  client_id: string;
  client_name?: string;
  period: string | null;
  step: string;
  status: string;
  gate: string | null;
  updated_at: string;
}

const PROCESS_LABEL: Record<string, string> = {
  onboarding: "Onboarding",
  content_cycle: "Ciclo de contenido",
  monthly_report: "Reporte mensual",
};

/** Estado de procesos de un cliente, o de todos si clientId es undefined. */
export async function getProcessStatus(
  clientId?: string,
): Promise<ProcessStatusRow[]> {
  const admin = getSupabaseAdmin();
  let query = admin
    .from("process_instances")
    .select("process, client_id, period, step, status, gate, updated_at")
    .order("client_id", { ascending: true })
    .order("process", { ascending: true });
  if (clientId) query = query.eq("client_id", clientId);
  const { data, error } = await query;
  if (error || !data) return [];

  const rows = data as ProcessStatusRow[];
  // Nombres para que el consultor hable de clientes, no de slugs.
  const ids = [...new Set(rows.map((r) => r.client_id))];
  if (ids.length > 0) {
    const { data: clients } = await admin
      .from("clients")
      .select("id, name")
      .in("id", ids);
    const nameById = new Map((clients ?? []).map((c) => [c.id, c.name]));
    for (const r of rows) r.client_name = nameById.get(r.client_id) ?? r.client_id;
  }
  return rows;
}

/** Bloque de prompt con el estado de procesos (para inyectar al contexto). */
export function buildProcessBlock(rows: ProcessStatusRow[]): string {
  if (rows.length === 0) {
    return "ESTADO DE PROCESOS: (sin instancias sincronizadas todavía — el sync corre a diario)";
  }
  const lines = rows.map((r) => {
    const proc = PROCESS_LABEL[r.process] ?? r.process;
    const period = r.period ? ` ${r.period}` : "";
    const gate = r.gate ? ` — BLOQUEADO por gate humano: ${r.gate}` : "";
    const done = r.status === "done" ? " ✓ completo" : "";
    return `- ${proc}${period}: paso "${r.step}"${done}${gate}`;
  });
  return `ESTADO DE PROCESOS (derivado del sistema, Stage 3):\n${lines.join("\n")}\nCuando el usuario pregunte "¿en qué estamos?" o "¿qué sigue?", respondé desde acá y proponé la acción que destrabe el gate (generar/aprobar/revisar). Si pide arrancar el ciclo de contenido del mes, dispatchá content-strategy; los gates humanos no se saltean nunca.`;
}

// ---------------------------------------------------------------------------
// Dispatch de agentes (run_agent) — camino único con guardrails
// ---------------------------------------------------------------------------

export interface DispatchAgentInput {
  clientId: string;
  agent: string;
  brief: Record<string, unknown>;
  reason?: string;
  /** 'consultant' | 'consultant-global' — para trazabilidad en agent_runs. */
  source: string;
  /** Rol del humano en cuyo nombre se dispara (guardrails del registry). */
  role: "director" | "team";
  triggeredByUserId?: string | null;
}

export type DispatchAgentResult =
  | { ok: true; runId: number }
  | { ok: false; status: number; error: string; runId?: number };

export async function dispatchAgentRun(
  input: DispatchAgentInput,
): Promise<DispatchAgentResult> {
  const guard = await enforceAgentGuardrails(input.agent, input.role);
  if (!guard.ok) {
    return { ok: false, status: guard.status, error: guard.error };
  }

  const admin = getSupabaseAdmin();
  const { data: run, error: insertError } = await admin
    .from("agent_runs")
    .insert({
      client: input.clientId,
      agent: input.agent,
      status: "running",
      summary: input.reason ?? `dispatched from ${input.source}`,
      metadata: {
        brief: input.brief,
        source: input.source,
        reason: input.reason,
        triggered_by_user_id: input.triggeredByUserId ?? null,
      },
      performance: {},
    })
    .select("id")
    .single();

  if (insertError || !run) {
    return {
      ok: false,
      status: 500,
      error: `Error abriendo agent_runs: ${insertError?.message ?? "unknown"}`,
    };
  }

  try {
    await dispatchAgentWorkflow({
      eventType: input.agent,
      payload: {
        runId: run.id,
        brief: {
          ...input.brief,
          client: input.clientId,
          source: input.source,
          runId: run.id,
          triggered_by_user_id: input.triggeredByUserId ?? null,
        },
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "dispatch failed";
    await admin
      .from("agent_runs")
      .update({ status: "error", summary: msg, updated_at: new Date().toISOString() })
      .eq("id", run.id);
    return { ok: false, status: 502, error: msg, runId: run.id };
  }

  return { ok: true, runId: run.id };
}
