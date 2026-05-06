/**
 * POST /api/agents/run
 *
 * Opens an agent_runs row (status:'running'). For "fast" agents (quick, no
 * Remotion/ElevenLabs/Blotato), runs the agent in-process on the Vercel
 * function so the dashboard gets the output back in a few seconds. For
 * heavier agents, dispatches a GitHub Actions workflow; the workflow closes
 * the run (status success/error) when it finishes.
 *
 * Body:
 *   clientId: string         — e.g. "<client-slug>"
 *   agent:    string         — event_type of the workflow (e.g. "content-creator")
 *   brief:    object         — agent-specific payload; runId is injected automatically
 *
 * Response (heavy agent):  { runId, dispatched: true }
 * Response (fast agent):   { runId, dispatched: false, inProcess: true, result: {...} }
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { dispatchAgentWorkflow } from "@/lib/github-dispatch";
import { loadClientVaultContext } from "@/lib/vault-loader";
import { logAction } from "@/lib/audit";

interface RunRequest {
  clientId: string;
  agent: string;
  brief?: Record<string, unknown>;
}

/**
 * Whitelist of agents that are safe to run in-process inside a Vercel
 * serverless function. These must:
 *   - finish well under the platform timeout (60s Hobby / 300s Pro)
 *   - not rely on binaries like Remotion / ffmpeg
 *   - not touch ElevenLabs, Blotato, or any heavy pipeline
 *
 * The value is the `agent:mode` or plain `agent` string used in requests.
 * A module loader converts it to an import path.
 */
const FAST_AGENTS: Record<string, { module: string; exportName?: string }> = {
  "morning-briefing": {
    module: "../../../../../scripts/morning-briefing/index.js",
  },
  // reporting-performance only for cheap modes (query / insights). daily/weekly/monthly
  // can still pass through GHA via a different `agent` key if needed.
  "reporting-performance:query": {
    module: "../../../../../scripts/reporting-performance/index.js",
  },
  "reporting-performance:insights": {
    module: "../../../../../scripts/reporting-performance/index.js",
  },
};

function resolveFastAgent(agent: string, brief: Record<string, unknown>) {
  // direct match (e.g. "morning-briefing")
  if (FAST_AGENTS[agent]) return { key: agent, spec: FAST_AGENTS[agent] };
  // mode-scoped match (e.g. agent="reporting-performance", brief.mode="query")
  const mode = typeof brief.mode === "string" ? brief.mode : null;
  if (mode) {
    const combined = `${agent}:${mode}`;
    if (FAST_AGENTS[combined]) return { key: combined, spec: FAST_AGENTS[combined] };
  }
  return null;
}

export async function POST(req: NextRequest) {
  let body: RunRequest;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { clientId, agent, brief = {} } = body;
  if (!clientId || !agent) {
    return Response.json(
      { error: "Missing required fields: clientId, agent" },
      { status: 400 },
    );
  }

  // Leer JWT del caller para identificar el actor que dispara el agente.
  // Este user_id se propaga al brief y los agentes lo usan para crear
  // notifs personales (to_user_id) — sin esto las notifs quedan globales
  // del rol team y todos los del equipo + directores las ven.
  // Si falla la auth, igual permitimos pero sin actor (fallback to_role).
  let triggeredByUserId: string | null = null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const callerToken = req.headers.get("authorization")?.replace("Bearer ", "");
  if (callerToken && url && anonKey) {
    try {
      const callerClient = createClient(url, anonKey, {
        global: { headers: { Authorization: `Bearer ${callerToken}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const {
        data: { user: caller },
      } = await callerClient.auth.getUser();
      if (caller) triggeredByUserId = caller.id;
    } catch (err) {
      console.warn(
        "[agents/run] could not validate JWT (continuing without actor):",
        err,
      );
    }
  }

  const supabase = getSupabaseAdmin();

  const { data: run, error: insertError } = await supabase
    .from("agent_runs")
    .insert({
      client: clientId,
      agent,
      status: "running",
      summary: "dispatched from dashboard",
      // Guardamos el actor en metadata.triggered_by_user_id para
      // poder reconstruir auditoría aunque el agente falle antes
      // de leer el brief.
      metadata: {
        brief,
        source: "dashboard",
        triggered_by_user_id: triggeredByUserId,
      },
      performance: {},
    })
    .select()
    .single();

  if (insertError || !run) {
    return Response.json(
      { error: `Failed to open agent_runs row: ${insertError?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  const fastMatch = resolveFastAgent(agent, brief);

  if (fastMatch) {
    // Fast-path: run the agent in-process. The agent itself closes the run
    // (updateAgentRun) and registers outputs, so we just relay the result.
    try {
      // Precargamos el vault del cliente vía GitHub Contents API. Sin esto,
      // el agente intenta `readFileSync` sobre `vault/...` que NO está
      // bundleado en Vercel (next.config.ts solo trazea ../scripts/**), y
      // termina con prompt vacío de contexto.
      const [mod, vaultContext] = await Promise.all([
        import(fastMatch.spec.module),
        loadClientVaultContext(clientId).catch((err) => {
          console.warn(
            `[agents/run] loadClientVaultContext falló para ${clientId}:`,
            err.message,
          );
          return null;
        }),
      ]);

      const runFn = fastMatch.spec.exportName
        ? mod[fastMatch.spec.exportName]
        : mod.run;

      if (typeof runFn !== "function") {
        throw new Error(
          `Fast agent '${fastMatch.key}' module has no 'run' export`,
        );
      }

      const result = await runFn({
        ...brief,
        client: clientId,
        runId: run.id,
        source: "dashboard",
        triggered_by_user_id: triggeredByUserId,
        vaultContext,
      });

      return Response.json({
        runId: run.id,
        dispatched: false,
        inProcess: true,
        result,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "in-process run failed";
      await supabase
        .from("agent_runs")
        .update({
          status: "error",
          summary: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", run.id);

      return Response.json(
        { error: message, runId: run.id },
        { status: 500 },
      );
    }
  }

  // Heavy-path: dispatch to GitHub Actions.
  try {
    await dispatchAgentWorkflow({
      eventType: agent,
      payload: {
        runId: run.id,
        brief: {
          ...brief,
          client: clientId,
          source: "dashboard",
          runId: run.id,
          // Propagamos el actor para que el agente pueda crear notifs
          // personales (to_user_id) cuando termine. Sin esto, las notifs
          // quedan to_role='team' y todo el equipo las ve.
          triggered_by_user_id: triggeredByUserId,
        },
      },
    });
  } catch (err) {
    await supabase
      .from("agent_runs")
      .update({
        status: "error",
        summary: err instanceof Error ? err.message : "dispatch failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    return Response.json(
      { error: err instanceof Error ? err.message : "dispatch failed", runId: run.id },
      { status: 502 },
    );
  }

  await logAction({
    actorId: null,
    action: "agent.dispatch",
    targetType: "agent_run",
    targetId: String(run.id),
    metadata: { agent, clientId, fast: false },
  });

  return Response.json({ runId: run.id, dispatched: true });
}
