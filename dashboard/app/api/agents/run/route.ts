/**
 * POST /api/agents/run
 *
 * Opens an agent_runs row (status:'running') and dispatches a GitHub Actions
 * workflow that will execute the agent. The workflow is expected to close the
 * run (update status to 'success' or 'error') when it finishes.
 *
 * Body:
 *   clientId: string         — e.g. "dmancuello"
 *   agent:    string         — event_type of the workflow (e.g. "content-creator")
 *   brief:    object         — agent-specific payload; runId is injected automatically
 *
 * Response:
 *   { runId, dispatched: true }
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { dispatchAgentWorkflow } from "@/lib/github-dispatch";

interface RunRequest {
  clientId: string;
  agent: string;
  brief?: Record<string, unknown>;
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

  const supabase = getSupabaseAdmin();

  const { data: run, error: insertError } = await supabase
    .from("agent_runs")
    .insert({
      client: clientId,
      agent,
      status: "running",
      summary: "dispatched from dashboard",
      metadata: { brief, source: "dashboard" },
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

  return Response.json({ runId: run.id, dispatched: true });
}
