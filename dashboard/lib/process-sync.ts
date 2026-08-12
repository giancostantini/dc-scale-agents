// ==================== PROCESS SYNC (Stage 3) — SERVER ONLY ====================
// Deriva el estado de los 3 procesos multi-paso desde las tablas fuente y
// lo upsertea en process_instances. Determinista e idempotente: correrlo
// N veces da el mismo resultado; borrar la tabla y correrlo la reconstruye.
//
// NO es un motor de workflows: acá no hay colas ni transiciones — es una
// FOTO consultable ("¿en qué paso está el cliente X?") + el gate que
// bloquea. El "empuje" real vive en los endpoints/workflows (aprobar fase
// → auto-draft de la siguiente; día 3 → draft del reporte mensual).

import { getSupabaseAdmin } from "@/lib/supabase/server";
import { currentMonthUY, addMonths } from "@/lib/tesoreria";

const PHASES = ["diagnostico", "estrategia", "setup", "lanzamiento"] as const;

interface DerivedInstance {
  process: "onboarding" | "content_cycle" | "monthly_report";
  client_id: string;
  period: string | null;
  step: string;
  status: "active" | "waiting_gate" | "done";
  gate: string | null;
  metadata: Record<string, unknown>;
}

/** Upsert de una instancia derivada, manteniendo steps_done como historial
 *  (agrega el paso anterior cuando cambia). */
async function upsertInstance(d: DerivedInstance): Promise<void> {
  const admin = getSupabaseAdmin();
  let query = admin
    .from("process_instances")
    .select("id, step, steps_done")
    .eq("process", d.process)
    .eq("client_id", d.client_id);
  query = d.period === null ? query.is("period", null) : query.eq("period", d.period);
  const { data: existing } = await query.maybeSingle();

  if (!existing) {
    await admin.from("process_instances").insert({
      process: d.process,
      client_id: d.client_id,
      period: d.period,
      step: d.step,
      status: d.status,
      gate: d.gate,
      metadata: d.metadata,
      steps_done: [],
    });
    return;
  }

  const stepsDone = Array.isArray(existing.steps_done)
    ? (existing.steps_done as { step: string; at: string }[])
    : [];
  if (existing.step !== d.step && existing.step) {
    stepsDone.push({ step: existing.step as string, at: new Date().toISOString() });
  }

  await admin
    .from("process_instances")
    .update({
      step: d.step,
      status: d.status,
      gate: d.gate,
      metadata: d.metadata,
      steps_done: stepsDone,
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id);
}

/** Onboarding: derivado de phase_reports. */
async function deriveOnboarding(clientIds: string[]): Promise<DerivedInstance[]> {
  const admin = getSupabaseAdmin();
  const { data: reports } = await admin
    .from("phase_reports")
    .select("client_id, phase, status")
    .in("client_id", clientIds);

  const byClient = new Map<string, Map<string, string>>();
  for (const r of reports ?? []) {
    if (!byClient.has(r.client_id)) byClient.set(r.client_id, new Map());
    byClient.get(r.client_id)!.set(r.phase, r.status);
  }

  const out: DerivedInstance[] = [];
  for (const clientId of clientIds) {
    const phases = byClient.get(clientId) ?? new Map<string, string>();
    let current: string | null = null;
    let gate: string | null = null;
    let status: DerivedInstance["status"] = "active";

    for (const phase of PHASES) {
      const st = phases.get(phase);
      if (st === "approved") continue;
      current = phase;
      if (st === "draft") {
        gate = "aprobacion_director";
        status = "waiting_gate";
      } else if (st === "generating") {
        gate = null; // avanzando solo
      } else {
        gate = "generar_draft"; // pending o inexistente
        status = "waiting_gate";
      }
      break;
    }

    if (!current) {
      out.push({
        process: "onboarding",
        client_id: clientId,
        period: null,
        step: "optimizacion",
        status: "done",
        gate: null,
        metadata: { fases_aprobadas: PHASES.length },
      });
    } else {
      out.push({
        process: "onboarding",
        client_id: clientId,
        period: null,
        step: current,
        status,
        gate,
        metadata: {
          fases_aprobadas: PHASES.filter((p) => phases.get(p) === "approved").length,
        },
      });
    }
  }
  return out;
}

/** Ciclo mensual de contenido: derivado de content_posts del mes. */
async function deriveContentCycle(clientIds: string[]): Promise<DerivedInstance[]> {
  const admin = getSupabaseAdmin();
  const month = currentMonthUY();
  const { data: posts } = await admin
    .from("content_posts")
    .select("client_id, status, metrics")
    .in("client_id", clientIds)
    .gte("date", `${month}-01`)
    .lte("date", `${month}-31`);

  const byClient = new Map<string, { total: number; draft: number; scheduled: number; published: number; withMetrics: number }>();
  for (const p of posts ?? []) {
    const agg = byClient.get(p.client_id) ?? {
      total: 0,
      draft: 0,
      scheduled: 0,
      published: 0,
      withMetrics: 0,
    };
    agg.total++;
    if (p.status === "draft") agg.draft++;
    if (p.status === "scheduled") agg.scheduled++;
    if (p.status === "published") {
      agg.published++;
      if (p.metrics) agg.withMetrics++;
    }
    byClient.set(p.client_id, agg);
  }

  const out: DerivedInstance[] = [];
  for (const clientId of clientIds) {
    const agg = byClient.get(clientId) ?? {
      total: 0,
      draft: 0,
      scheduled: 0,
      published: 0,
      withMetrics: 0,
    };
    let step: string;
    let gate: string | null = null;
    let status: DerivedInstance["status"] = "active";

    if (agg.total === 0) {
      step = "calendario";
      gate = "generar_calendario";
      status = "waiting_gate";
    } else if (agg.draft > 0) {
      step = "aprobacion_piezas";
      gate = "aprobar_piezas";
      status = "waiting_gate";
    } else if (agg.scheduled > 0) {
      step = "programado";
    } else if (agg.published > 0 && agg.withMetrics > 0) {
      step = "evaluado";
      status = "done";
    } else if (agg.published > 0) {
      step = "publicado";
    } else {
      step = "calendario";
      gate = "generar_calendario";
      status = "waiting_gate";
    }

    out.push({
      process: "content_cycle",
      client_id: clientId,
      period: month,
      step,
      status,
      gate,
      metadata: agg,
    });
  }
  return out;
}

/** Reporte mensual F5.5: derivado de agent_outputs + paid_media_daily. */
async function deriveMonthlyReport(clientIds: string[]): Promise<DerivedInstance[]> {
  const admin = getSupabaseAdmin();
  const month = currentMonthUY();
  const reportPeriod = addMonths(month, -1); // el reporte del mes pasado

  const [{ data: outputs }, { data: paidRows }] = await Promise.all([
    admin
      .from("agent_outputs")
      .select("client, created_at, structured")
      .eq("agent", "reporting-performance")
      .gte("created_at", `${month}-01`),
    admin
      .from("paid_media_daily")
      .select("client_id")
      .gte("date", `${reportPeriod}-01`)
      .lte("date", `${reportPeriod}-31`),
  ]);

  const hasDraft = new Set(
    (outputs ?? [])
      .filter((o) => {
        const mode = (o.structured as { mode?: string } | null)?.mode;
        return mode === "monthly";
      })
      .map((o) => o.client as string),
  );
  const hasData = new Set((paidRows ?? []).map((r) => r.client_id as string));

  const out: DerivedInstance[] = [];
  for (const clientId of clientIds) {
    let step: string;
    let gate: string | null = null;
    let status: DerivedInstance["status"] = "active";

    if (hasDraft.has(clientId)) {
      step = "revision_director";
      gate = "revision_director";
      status = "waiting_gate";
    } else if (hasData.has(clientId)) {
      step = "datos_listos";
      gate = null; // el cron del día 3 lo draftea solo
    } else {
      step = "sin_datos_auto";
      gate = null; // sale igual con los logs manuales del vault
    }

    out.push({
      process: "monthly_report",
      client_id: clientId,
      period: reportPeriod,
      step,
      status,
      gate,
      metadata: { draft: hasDraft.has(clientId), datos_auto: hasData.has(clientId) },
    });
  }
  return out;
}

export interface ProcessSyncResult {
  synced: number;
  byProcess: Record<string, number>;
}

/**
 * Re-deriva y persiste el estado de los procesos. Si `clientId` viene,
 * sincroniza solo ese cliente (para llamadas post-evento, ej. aprobar fase).
 */
export async function runProcessSync(clientId?: string): Promise<ProcessSyncResult> {
  const admin = getSupabaseAdmin();
  let query = admin.from("clients").select("id, type, status, modules");
  if (clientId) query = query.eq("id", clientId);
  const { data: clients } = await query;

  const gpClients = (clients ?? []).filter((c) => c.type === "gp");
  const onboardingIds = gpClients.map((c) => c.id as string);
  const activeGp = gpClients.filter((c) => c.status === "active" || c.status === "onboarding");
  const contentIds = activeGp
    .filter((c) => (c.modules as { content?: boolean } | null)?.content !== false)
    .map((c) => c.id as string);
  const reportIds = activeGp.map((c) => c.id as string);

  const [onb, cyc, rep] = await Promise.all([
    onboardingIds.length ? deriveOnboarding(onboardingIds) : [],
    contentIds.length ? deriveContentCycle(contentIds) : [],
    reportIds.length ? deriveMonthlyReport(reportIds) : [],
  ]);

  const all = [...onb, ...cyc, ...rep];
  for (const d of all) {
    await upsertInstance(d);
  }

  return {
    synced: all.length,
    byProcess: {
      onboarding: onb.length,
      content_cycle: cyc.length,
      monthly_report: rep.length,
    },
  };
}
