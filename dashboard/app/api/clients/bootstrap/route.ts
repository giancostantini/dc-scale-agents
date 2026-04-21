/**
 * POST /api/clients/bootstrap
 *
 * Called right after a client row is inserted in the `clients` table.
 * Opens an agent_runs row (agent: client-bootstrap, status: running) and
 * dispatches the client-bootstrap GitHub workflow to scaffold the vault.
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { dispatchAgentWorkflow } from "@/lib/github-dispatch";

interface BootstrapBody {
  clientId: string;
  name: string;
  sector?: string;
  country?: string;
  type?: "gp" | "dev";
  fee?: number;
  method?: string;
  phase?: string;
}

export async function POST(req: NextRequest) {
  let body: BootstrapBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { clientId, name } = body;
  if (!clientId || !name) {
    return Response.json(
      { error: "Missing required fields: clientId, name" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();

  const brief = {
    client: clientId,
    name,
    sector: body.sector ?? "",
    country: body.country ?? "",
    type: body.type ?? "gp",
    fee: body.fee ?? null,
    method: body.method ?? "",
    phase: body.phase ?? "",
  };

  const { data: run, error: insertError } = await supabase
    .from("agent_runs")
    .insert({
      client: clientId,
      agent: "client-bootstrap",
      status: "running",
      summary: "scaffolding vault",
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
      eventType: "client-bootstrap",
      payload: {
        runId: run.id,
        brief: { ...brief, runId: run.id },
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
