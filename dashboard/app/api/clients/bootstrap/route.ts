/**
 * POST /api/clients/bootstrap
 *
 * Called right after a client row is inserted in the `clients` table.
 * Opens an agent_runs row (agent: client-bootstrap, status: running) and
 * dispatches the client-bootstrap GitHub workflow to scaffold the vault.
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { dispatchAgentWorkflow } from "@/lib/github-dispatch";
import { logAction } from "@/lib/audit";

interface BootstrapBody {
  clientId: string;
  name: string;
  sector?: string;
  country?: string;
  type?: "gp" | "dev";
  fee?: number;
  method?: string;
  phase?: string;
  /** Texto crudo del brandbook que el usuario pegó/extrajo en el wizard.
   *  Si viene (≥200 chars), dispatchamos también el brandbook-processor en
   *  paralelo. Si no viene, los agentes operan sin contexto de marca hasta
   *  que se procese desde la pantalla del cliente. */
  brandbookText?: string;
  brandbookUrl?: string;
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

  // Leer JWT para identificar el director que crea el cliente. Las notifs
  // que generen los agentes (client-bootstrap, brandbook-processor) van
  // a llevar to_user_id de este actor para que solo él las vea.
  let triggeredByUserId: string | null = null;
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const callerToken = req.headers.get("authorization")?.replace("Bearer ", "");
  if (callerToken && supaUrl && anonKey) {
    try {
      const callerClient = createClient(supaUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${callerToken}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const {
        data: { user: caller },
      } = await callerClient.auth.getUser();
      if (caller) triggeredByUserId = caller.id;
    } catch (err) {
      console.warn(
        "[bootstrap] could not validate JWT (continuing without actor):",
        err,
      );
    }
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

  try {
    await dispatchAgentWorkflow({
      eventType: "client-bootstrap",
      payload: {
        runId: run.id,
        brief: {
          ...brief,
          runId: run.id,
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

  // ── Brandbook processor (si el wizard mandó texto del brandbook) ─────────
  // Esto corre EN PARALELO al client-bootstrap. Cuando ambos workflows
  // terminan (~30-60s), el cliente queda con vault scaffold + brand/.
  let brandbookRunId: number | null = null;
  if (
    typeof body.brandbookText === "string" &&
    body.brandbookText.trim().length >= 200
  ) {
    const { data: bbRun } = await supabase
      .from("agent_runs")
      .insert({
        client: clientId,
        agent: "brandbook-processor",
        status: "running",
        summary: "procesando brandbook desde wizard",
        metadata: {
          source: "dashboard",
          brandbookUrl: body.brandbookUrl ?? null,
          chars: body.brandbookText.length,
        },
        performance: {},
      })
      .select()
      .single();

    if (bbRun) {
      brandbookRunId = bbRun.id;
      try {
        await dispatchAgentWorkflow({
          eventType: "brandbook-processor",
          payload: {
            runId: bbRun.id,
            brief: {
              client: clientId,
              brandbookText: body.brandbookText,
              brandbookUrl: body.brandbookUrl ?? null,
              source: "dashboard",
              reprocess: false,
              runId: bbRun.id,
              triggered_by_user_id: triggeredByUserId,
            },
          },
        });
      } catch (err) {
        console.warn(
          "[bootstrap] brandbook-processor dispatch failed:",
          err instanceof Error ? err.message : err,
        );
        await supabase
          .from("agent_runs")
          .update({
            status: "error",
            summary:
              err instanceof Error ? err.message : "dispatch failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", bbRun.id);
      }
    }
  }

  await logAction({
    actorId: null, // bootstrap se dispara desde el wizard sin verificar rol acá; el authoring se cubre en el insert previo de clients
    action: "client.create",
    targetType: "client",
    targetId: clientId,
    metadata: {
      name,
      sector: brief.sector,
      type: brief.type,
      runId: run.id,
      brandbookRunId,
      hasBrandbookText: typeof body.brandbookText === "string" &&
        body.brandbookText.trim().length >= 200,
    },
  });

  return Response.json({
    runId: run.id,
    dispatched: true,
    brandbookRunId,
  });
}
