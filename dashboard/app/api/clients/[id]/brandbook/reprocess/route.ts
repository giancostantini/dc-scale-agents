/**
 * POST /api/clients/[id]/brandbook/reprocess
 *
 * Re-procesa el brandbook de un cliente que ya existe. Dispatcha el
 * brandbook-processor con `reprocess: true`, lo cual archiva la versión
 * actual del brand/ a `_archive/<timestamp>/` antes de escribir la nueva.
 *
 * Body:
 *   { brandbookText: string (≥200), brandbookUrl?: string }
 *
 * Response:
 *   { runId, dispatched: true }
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { dispatchAgentWorkflow } from "@/lib/github-dispatch";

interface PostBody {
  brandbookText: string;
  brandbookUrl?: string;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await context.params;
  if (!clientId || !/^[a-z0-9-]+$/.test(clientId)) {
    return Response.json({ error: "Invalid client id" }, { status: 400 });
  }

  let body: PostBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    !body.brandbookText ||
    typeof body.brandbookText !== "string" ||
    body.brandbookText.length < 200
  ) {
    return Response.json(
      {
        error: `brandbookText required (mínimo 200 chars). Recibido: ${
          body.brandbookText?.length ?? 0
        }`,
      },
      { status: 400 },
    );
  }
  if (body.brandbookText.length > 200_000) {
    return Response.json(
      { error: `brandbookText too large (${body.brandbookText.length} chars). Máx 200000.` },
      { status: 413 },
    );
  }

  const supabase = getSupabaseAdmin();

  // Verificar que el cliente existe
  const { data: clientRow } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .single();
  if (!clientRow) {
    return Response.json(
      { error: `Cliente '${clientId}' no existe` },
      { status: 404 },
    );
  }

  // Crear agent_runs row
  const { data: run, error: insertError } = await supabase
    .from("agent_runs")
    .insert({
      client: clientId,
      agent: "brandbook-processor",
      status: "running",
      summary: "re-procesando brandbook",
      metadata: {
        source: "dashboard",
        reprocess: true,
        brandbookUrl: body.brandbookUrl ?? null,
        chars: body.brandbookText.length,
      },
      performance: {},
    })
    .select()
    .single();

  if (insertError || !run) {
    return Response.json(
      {
        error: `Failed to open agent_runs row: ${insertError?.message ?? "unknown"}`,
      },
      { status: 500 },
    );
  }

  try {
    await dispatchAgentWorkflow({
      eventType: "brandbook-processor",
      payload: {
        runId: run.id,
        brief: {
          client: clientId,
          brandbookText: body.brandbookText,
          brandbookUrl: body.brandbookUrl ?? null,
          source: "dashboard",
          reprocess: true,
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
      {
        error: err instanceof Error ? err.message : "dispatch failed",
        runId: run.id,
      },
      { status: 502 },
    );
  }

  return Response.json({ runId: run.id, dispatched: true });
}
