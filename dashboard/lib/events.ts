// ==================== EVENTOS (Stage 5) — SERVER ONLY ====================
// Emisión y procesamiento del outbox `events` (mig 092). Los triggers SQL
// insertan; acá viven los HANDLERS — cada evento GREEN empuja el paso
// siguiente hasta el gate humano, nunca a través de él.
//
// Regla anti-teatro: los handlers reusan los caminos existentes
// (dispatchAgentRun con guardrails, phase-autogen de Stage 3, process-sync)
// — este archivo solo conecta eventos con esos caminos.

import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getAgentEntry } from "@/lib/agent-registry";
import { dispatchAgentWorkflow } from "@/lib/github-dispatch";
import { dispatchAgentRun } from "@/lib/consultant-engine";
import { runProcessSync } from "@/lib/process-sync";
import { getAutonomySetting } from "@/lib/autonomy";
import { sendEmail } from "@/lib/email";

export type EventType =
  | "cliente.creado"
  | "cliente.activado"
  | "pieza.publicada"
  | "metricas.actualizadas"
  | "reporte.drafteado";

interface EventRow {
  id: number;
  type: string;
  client_id: string | null;
  payload: Record<string, unknown>;
}

/** Emite un evento al outbox (para emisores server-side como los crons —
 *  los writes de UI ya emiten vía triggers SQL). */
export async function emitEvent(
  type: EventType,
  clientId: string | null,
  payload: Record<string, unknown> = {},
): Promise<void> {
  const admin = getSupabaseAdmin();
  const { error } = await admin.from("events").insert({
    type,
    client_id: clientId,
    payload,
  });
  if (error) console.error(`[events] emit ${type} falló:`, error.message);
}

interface HandlerResult {
  status: "processed" | "skipped" | "error";
  detail: string;
}

async function handleClienteCreado(ev: EventRow): Promise<HandlerResult> {
  if (!ev.client_id) return { status: "skipped", detail: "sin client_id" };
  const entry = getAgentEntry("client-research");
  if (!entry || entry.status !== "active") {
    return {
      status: "skipped",
      detail:
        "client-research está pausado en el registry — activalo (status: 'active') para research automático al crear clientes.",
    };
  }
  const result = await dispatchAgentRun({
    clientId: ev.client_id,
    agent: "client-research",
    brief: {},
    reason: "evento cliente.creado",
    source: "event:cliente.creado",
    role: "director",
  });
  return result.ok
    ? { status: "processed", detail: `client-research dispatchado (run #${result.runId})` }
    : { status: "error", detail: result.error };
}

async function handleClienteActivado(ev: EventRow): Promise<HandlerResult> {
  if (!ev.client_id) return { status: "skipped", detail: "sin client_id" };
  const admin = getSupabaseAdmin();

  const [{ data: client }, { data: report }] = await Promise.all([
    admin.from("clients").select("id, type, onboarding").eq("id", ev.client_id).maybeSingle(),
    admin
      .from("phase_reports")
      .select("status")
      .eq("client_id", ev.client_id)
      .eq("phase", "diagnostico")
      .maybeSingle(),
  ]);

  if (!client) return { status: "skipped", detail: "cliente no existe" };
  if (client.type === "dev") {
    return { status: "skipped", detail: "cliente DEV — sin fases de growth" };
  }
  if (report && ["draft", "approved", "generating"].includes(report.status)) {
    return {
      status: "skipped",
      detail: `diagnóstico ya en estado '${report.status}' — nada que empujar`,
    };
  }
  const onboarding = (client.onboarding ?? {}) as { kickoffFile?: unknown };
  if (!onboarding.kickoffFile) {
    return {
      status: "skipped",
      detail: "sin kickoff cargado — el diagnóstico se genera cuando esté (gate de datos)",
    };
  }

  try {
    await dispatchAgentWorkflow({
      eventType: "phase-autogen",
      payload: { clientId: ev.client_id, phase: "diagnostico" },
    });
  } catch (err) {
    return {
      status: "error",
      detail: err instanceof Error ? err.message : "dispatch phase-autogen falló",
    };
  }

  await admin.from("notifications").upsert(
    {
      client: ev.client_id,
      agent: "events",
      level: "info",
      title: "Diagnóstico en preparación (cliente activado)",
      body: "El cliente pasó a activo con kickoff cargado, así que el sistema ya está generando el draft del Diagnóstico (~3-5 min). Queda en draft para tu revisión.",
      link: `/cliente/${ev.client_id}`,
      to_role: "director",
      email_sent: false,
      dedup_key: `event-diagnostico-${ev.client_id}`,
    },
    { onConflict: "dedup_key", ignoreDuplicates: true },
  );

  return { status: "processed", detail: "phase-autogen (diagnostico) dispatchado" };
}

async function handlePiezaPublicada(ev: EventRow): Promise<HandlerResult> {
  if (!ev.client_id) return { status: "skipped", detail: "sin client_id" };
  // El tracking de métricas lo hace organic-insights (diario). Acá solo
  // actualizamos el estado del ciclo al instante.
  await runProcessSync(ev.client_id);
  return { status: "processed", detail: "content_cycle re-sincronizado" };
}

async function handleMetricasActualizadas(ev: EventRow): Promise<HandlerResult> {
  if (!ev.client_id) return { status: "skipped", detail: "sin client_id" };
  const result = await dispatchAgentRun({
    clientId: ev.client_id,
    agent: "social-media-metrics",
    brief: { mode: "daily" },
    reason: `evento metricas.actualizadas (${ev.payload.matched ?? "?"} piezas con métricas nuevas)`,
    source: "event:metricas.actualizadas",
    role: "director",
  });
  return result.ok
    ? {
        status: "processed",
        detail: `social-media-metrics dispatchado (run #${result.runId}) — evaluación con datos reales`,
      }
    : { status: "error", detail: result.error };
}

/**
 * Stage 6 — el consumidor real de autonomy_settings. El reporte mensual se
 * drafteó (evento del trigger en agent_outputs):
 *   gated (default)  → no hace nada nuevo: el flujo sigue siendo revisión
 *                      del director y envío manual.
 *   auto_sampled     → lo manda por mail al cliente SOLO si los socios
 *                      promovieron el tipo, con spot-check: sample_rate %
 *                      de los reportes quedan retenidos para revisión.
 */
async function handleReporteDrafteado(ev: EventRow): Promise<HandlerResult> {
  if (!ev.client_id) return { status: "skipped", detail: "sin client_id" };
  const setting = await getAutonomySetting("monthly_report");

  if (setting.mode === "gated") {
    return {
      status: "skipped",
      detail: "monthly_report está gated (default) — revisión del director y envío manual, como siempre",
    };
  }

  const admin = getSupabaseAdmin();
  const outputId = Number(ev.payload.output_id ?? 0);

  // Spot-check determinista por output_id: sample_rate % quedan en revisión.
  if (outputId % 100 < setting.sample_rate) {
    await admin.from("notifications").upsert(
      {
        client: ev.client_id,
        agent: "autonomy",
        level: "warning",
        title: `Spot-check: reporte mensual de ${ev.client_id} retenido para revisión`,
        body: `El tipo monthly_report está promovido a auto-envío, pero este reporte cayó en el muestreo (${setting.sample_rate}%). Revisalo y mandalo manualmente — así validamos que la autonomía siga mereciéndose.`,
        link: `/cliente/${ev.client_id}`,
        to_role: "director",
        email_sent: false,
        dedup_key: `spot-check-${outputId}`,
      },
      { onConflict: "dedup_key", ignoreDuplicates: true },
    );
    return { status: "processed", detail: `retenido por spot-check (${setting.sample_rate}%)` };
  }

  const [{ data: output }, { data: client }] = await Promise.all([
    admin.from("agent_outputs").select("title, body_md").eq("id", outputId).maybeSingle(),
    admin
      .from("clients")
      .select("name, contact_email, contact_name")
      .eq("id", ev.client_id)
      .maybeSingle(),
  ]);
  if (!output?.body_md) return { status: "error", detail: `output ${outputId} sin body_md` };
  if (!client?.contact_email) {
    return { status: "error", detail: "cliente sin contact_email — no se puede auto-enviar" };
  }

  const escaped = (output.body_md as string)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  try {
    await sendEmail({
      to: client.contact_email as string,
      subject: `Reporte mensual de performance — ${client.name} — D&C Scale`,
      html: `<div style="font-family:sans-serif;max-width:640px;margin:0 auto"><p>Hola ${client.contact_name ?? ""}!</p><p>Te compartimos el reporte mensual de performance:</p><pre style="white-space:pre-wrap;font-family:inherit;background:#f6f4ef;padding:16px;border-radius:8px">${escaped}</pre><p>Cualquier duda, respondé este mail.<br/>— D&amp;C Scale Partners</p></div>`,
    });
  } catch (err) {
    return {
      status: "error",
      detail: `envío falló: ${err instanceof Error ? err.message : "?"}`,
    };
  }

  await admin.from("notifications").upsert(
    {
      client: ev.client_id,
      agent: "autonomy",
      level: "success",
      title: `Reporte mensual auto-enviado a ${client.name}`,
      body: `monthly_report está promovido a auto-envío (spot-check ${setting.sample_rate}%). Se mandó a ${client.contact_email}. Rollback cuando quieran: UPDATE autonomy_settings SET mode='gated' WHERE output_type='monthly_report';`,
      link: `/cliente/${ev.client_id}`,
      to_role: "director",
      email_sent: false,
      dedup_key: `auto-sent-${outputId}`,
    },
    { onConflict: "dedup_key", ignoreDuplicates: true },
  );

  return { status: "processed", detail: `auto-enviado a ${client.contact_email}` };
}

const HANDLERS: Record<string, (ev: EventRow) => Promise<HandlerResult>> = {
  "cliente.creado": handleClienteCreado,
  "cliente.activado": handleClienteActivado,
  "pieza.publicada": handlePiezaPublicada,
  "metricas.actualizadas": handleMetricasActualizadas,
  "reporte.drafteado": handleReporteDrafteado,
};

export interface ProcessEventsResult {
  claimed: number;
  processed: number;
  skipped: number;
  errors: number;
}

/**
 * Procesa eventos pendientes (los más viejos primero). Claim atómico vía
 * update condicional para que el sweeper y el webhook no se pisen.
 * Dedup barato: pieza.publicada del mismo cliente se colapsa a un sync.
 */
export async function processEvents(limit = 25): Promise<ProcessEventsResult> {
  const admin = getSupabaseAdmin();

  const { data: pending } = await admin
    .from("events")
    .select("id")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  const ids = (pending ?? []).map((r) => r.id as number);
  if (ids.length === 0) return { claimed: 0, processed: 0, skipped: 0, errors: 0 };

  // Claim: solo los que siguen pending (otro proceso puede haberlos tomado).
  const { data: claimed } = await admin
    .from("events")
    .update({ status: "processing" })
    .in("id", ids)
    .eq("status", "pending")
    .select("id, type, client_id, payload");

  const events = (claimed ?? []) as EventRow[];
  const result: ProcessEventsResult = {
    claimed: events.length,
    processed: 0,
    skipped: 0,
    errors: 0,
  };

  // Colapsar pieza.publicada por cliente (un sync alcanza para N piezas).
  const seenSyncClients = new Set<string>();

  for (const ev of events) {
    let outcome: HandlerResult;
    try {
      if (ev.type === "pieza.publicada" && ev.client_id && seenSyncClients.has(ev.client_id)) {
        outcome = { status: "skipped", detail: "colapsado con otro pieza.publicada del batch" };
      } else {
        const handler = HANDLERS[ev.type];
        outcome = handler
          ? await handler(ev)
          : { status: "skipped", detail: `sin handler para '${ev.type}'` };
        if (ev.type === "pieza.publicada" && ev.client_id) {
          seenSyncClients.add(ev.client_id);
        }
      }
    } catch (err) {
      outcome = {
        status: "error",
        detail: err instanceof Error ? err.message : "handler exception",
      };
    }

    await admin
      .from("events")
      .update({
        status: outcome.status,
        detail: outcome.detail.slice(0, 500),
        processed_at: new Date().toISOString(),
      })
      .eq("id", ev.id);

    if (outcome.status === "processed") result.processed++;
    else if (outcome.status === "skipped") result.skipped++;
    else result.errors++;
  }

  return result;
}
