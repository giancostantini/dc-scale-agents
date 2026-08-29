// ==================== DIGESTS JERÁRQUICOS (mig 096) — SERVER ONLY ====================
// La jerarquía Gerente de Proyecto → Gerente de Área → Gerente General,
// implementada como pipeline de DATOS (principio #4: coordinación por datos
// y eventos, no charlas agente→agente):
//
//   1. buildClientDigest — el "Gerente de Proyecto" de cada cliente arma su
//      parte diario: procesos, runs, contenido, pagos, solicitudes, agenda,
//      restricciones de memoria. Determinista, CERO llamadas a Claude.
//   2. buildAreaDigest — cada gerencia agrega los digests de cliente que le
//      tocan + sus fuentes propias (finanzas el snapshot de tesorería,
//      operaciones la salud de la flota, etc.).
//   3. loadGerenciasBlock — el Gerente General recibe los 6 digests YA
//      preparados inyectados a su system prompt: responde "con la info
//      precisa porque antes le preguntó al gerente del área", sin cadenas
//      de agentes ni segunda llamada.
//
// Refresh: runDigestSync corre al final del cron diario de process-sync y
// on-demand vía /api/cron/digest-sync. Un cliente/área que falla no corta
// el resto (patrón `|| warning`).

import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getProcessStatus } from "@/lib/consultant-engine";
import { AGENT_REGISTRY } from "@/lib/agent-registry";
import {
  GERENCIAS,
  gerenciasVisibles,
  type GerenciaDef,
  type GerenciaSlug,
} from "@/lib/gerencias";
import { loadFinanceContext } from "@/lib/finance-context";
import { currentMonthUY } from "@/lib/tesoreria";
import type { CallerContext } from "@/lib/consultant-global-context";

// Caps de tamaño (chars) — el bloque del GG junta 6 áreas y no puede
// desbordar el system prompt.
const CLIENT_MD_CAP = 1800;
const AREA_MD_CAP = 2200;
const BLOCK_CAP = 13000;

export type Severity = "ok" | "warn" | "crit";

const SEV_ICON: Record<Severity, string> = { ok: "🟢", warn: "🟡", crit: "🔴" };

function maxSeverity(list: Severity[]): Severity {
  if (list.includes("crit")) return "crit";
  if (list.includes("warn")) return "warn";
  return "ok";
}

function cap(text: string, limit: number): string {
  return text.length <= limit ? text : text.slice(0, limit - 1).trimEnd() + "…";
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString();
}

// ---------------------------------------------------------------------------
// Nivel 1 — digest de CLIENTE (Gerente de Proyecto)
// ---------------------------------------------------------------------------

interface ClientDigestData {
  severity: Severity;
  cliente: {
    name: string;
    sector: string | null;
    phase: string | null;
    status: string | null;
    type: string | null;
  };
  procesos: Array<{ process: string; step: string; status: string; gate: string | null }>;
  runs7d: {
    total: number;
    error: number;
    porAgente: Record<string, { total: number; error: number }>;
  };
  errores: string[];
  contenido: { total: number; draft: number; scheduled: number; published: number };
  pagos: { abiertos: number; late: number; meses: string[] };
  solicitudes: { abiertas: number; urgentes: number };
  eventosProximos: Array<{ date: string; title: string }>;
  constraints: string[];
}

export interface ClientDigest {
  key: string;
  title: string;
  content_md: string;
  data: ClientDigestData;
}

interface ClientRowLite {
  id: string;
  name: string;
  sector: string | null;
  type: string | null;
  phase: string | null;
  status: string | null;
}

export async function buildClientDigest(client: ClientRowLite): Promise<ClientDigest> {
  const admin = getSupabaseAdmin();
  const month = currentMonthUY();
  const clientId = client.id;

  const [
    procesos,
    { data: runs },
    { data: posts },
    { data: pagos },
    { data: requests },
    { data: eventos },
    { data: constraintRows },
  ] = await Promise.all([
    getProcessStatus(clientId).catch(() => []),
    admin
      .from("agent_runs")
      .select("agent, status, summary, created_at")
      .eq("client", clientId)
      .gte("created_at", daysAgoIso(7))
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("content_posts")
      .select("status")
      .eq("client_id", clientId)
      .gte("date", `${month}-01`)
      .lte("date", `${month}-31`),
    admin
      .from("payments")
      .select("month, status")
      .eq("client_id", clientId)
      .in("status", ["pending", "late"]),
    admin
      .from("client_requests")
      .select("urgency, status")
      .eq("client_id", clientId)
      .in("status", ["pending", "reviewing"]),
    admin
      .from("cal_events")
      .select("title, date")
      .eq("client_id", clientId)
      .gte("date", new Date().toISOString().slice(0, 10))
      .order("date")
      .limit(5),
    admin
      .from("consultant_memory_v2")
      .select("content, importance")
      .eq("scope_type", "client")
      .eq("client_id", clientId)
      .eq("kind", "constraint")
      .order("importance", { ascending: false })
      .limit(3),
  ]);

  // Runs de la semana: totales + errores por agente
  const porAgente: Record<string, { total: number; error: number }> = {};
  const errores: string[] = [];
  for (const r of runs ?? []) {
    const agg = porAgente[r.agent] ?? { total: 0, error: 0 };
    agg.total++;
    if (r.status === "error") {
      agg.error++;
      if (errores.length < 5) {
        errores.push(`${r.agent}: ${(r.summary ?? "sin detalle").slice(0, 90)}`);
      }
    }
    porAgente[r.agent] = agg;
  }
  const runsTotal = runs?.length ?? 0;
  const runsError = (runs ?? []).filter((r) => r.status === "error").length;

  const contenido = { total: 0, draft: 0, scheduled: 0, published: 0 };
  for (const p of posts ?? []) {
    contenido.total++;
    if (p.status === "draft") contenido.draft++;
    if (p.status === "scheduled") contenido.scheduled++;
    if (p.status === "published") contenido.published++;
  }

  const late = (pagos ?? []).filter((p) => p.status === "late").length;
  const urgentes = (requests ?? []).filter((r) => r.urgency === "high" || r.urgency === "urgent").length;
  const gatesAbiertos = procesos.filter((p) => p.gate).length;

  const severity: Severity =
    runsError > 0 || late > 0
      ? "crit"
      : gatesAbiertos > 0 || (requests?.length ?? 0) > 0
      ? "warn"
      : "ok";

  const data: ClientDigestData = {
    severity,
    cliente: {
      name: client.name,
      sector: client.sector,
      phase: client.phase,
      status: client.status,
      type: client.type,
    },
    procesos: procesos.map((p) => ({
      process: p.process,
      step: p.step,
      status: p.status,
      gate: p.gate,
    })),
    runs7d: { total: runsTotal, error: runsError, porAgente },
    errores,
    contenido,
    pagos: {
      abiertos: pagos?.length ?? 0,
      late,
      meses: (pagos ?? []).map((p) => `${p.month} (${p.status})`).slice(0, 6),
    },
    solicitudes: { abiertas: requests?.length ?? 0, urgentes },
    eventosProximos: (eventos ?? []).map((e) => ({ date: e.date, title: e.title })),
    constraints: (constraintRows ?? []).map((c) => c.content as string),
  };

  // Narrativa corta para inyectar a prompts (el jsonb queda para agregación/UI)
  const lines: string[] = [];
  lines.push(
    `${SEV_ICON[severity]} **${client.name}** (${[client.sector, client.phase, client.status].filter(Boolean).join(" · ") || "sin meta"})`,
  );
  if (procesos.length > 0) {
    lines.push(
      `- Procesos: ${procesos
        .map((p) => `${p.process}${p.period ? ` ${p.period}` : ""} en "${p.step}"${p.gate ? ` (gate: ${p.gate})` : p.status === "done" ? " ✓" : ""}`)
        .join(" · ")}`,
    );
  }
  lines.push(
    `- Runs 7d: ${runsTotal}${runsError > 0 ? ` (${runsError} con ERROR: ${errores.join(" | ")})` : " · sin errores"}`,
  );
  lines.push(
    `- Contenido ${month}: ${contenido.total} piezas (${contenido.draft} draft / ${contenido.scheduled} programadas / ${contenido.published} publicadas)`,
  );
  lines.push(
    data.pagos.abiertos > 0
      ? `- Pagos abiertos: ${data.pagos.meses.join(", ")}${late > 0 ? " ⚠ HAY ATRASADOS" : ""}`
      : "- Pagos: al día",
  );
  if (data.solicitudes.abiertas > 0) {
    lines.push(`- Solicitudes abiertas: ${data.solicitudes.abiertas}${urgentes > 0 ? ` (${urgentes} urgentes)` : ""}`);
  }
  if (data.eventosProximos.length > 0) {
    lines.push(`- Agenda: ${data.eventosProximos.map((e) => `${e.date} ${e.title}`).join(" · ")}`);
  }
  if (data.constraints.length > 0) {
    lines.push(`- Restricciones a respetar: ${data.constraints.join(" | ")}`);
  }

  return {
    key: clientId,
    title: `${client.name} — Gerente de Proyecto`,
    content_md: cap(lines.join("\n"), CLIENT_MD_CAP),
    data,
  };
}

// ---------------------------------------------------------------------------
// Nivel 2 — digest de ÁREA (gerencias)
// ---------------------------------------------------------------------------

/** Agentes (keys) que reportan a una gerencia, según el registry. */
function agentKeysDe(g: GerenciaDef): Set<string> {
  const areas = new Set<string>(g.areas);
  return new Set(AGENT_REGISTRY.filter((e) => areas.has(e.area)).map((e) => e.key));
}

/** Errores 7d de la flota de la gerencia, agregados de los digests de cliente. */
function erroresDeFlota(g: GerenciaDef, clientes: ClientDigest[]): string[] {
  const keys = agentKeysDe(g);
  const out: string[] = [];
  for (const c of clientes) {
    for (const [agent, agg] of Object.entries(c.data.runs7d.porAgente)) {
      if (agg.error > 0 && keys.has(agent)) {
        out.push(`${c.data.cliente.name} · ${agent} (${agg.error})`);
      }
    }
  }
  return out;
}

async function buildAreaDigest(
  g: GerenciaDef,
  clientes: ClientDigest[],
): Promise<{ key: GerenciaSlug; title: string; content_md: string; data: Record<string, unknown> }> {
  const admin = getSupabaseAdmin();
  const month = currentMonthUY();
  const lines: string[] = [];
  const flotaErrores = erroresDeFlota(g, clientes);
  let severity: Severity = flotaErrores.length > 0 ? "crit" : "ok";
  const data: Record<string, unknown> = {};

  if (g.slug === "marketing") {
    for (const c of clientes) {
      const cyc = c.data.procesos.find((p) => p.process === "content_cycle");
      const cont = c.data.contenido;
      lines.push(
        `- ${c.data.cliente.name}: ciclo en "${cyc?.step ?? "sin ciclo"}"${cyc?.gate ? ` (gate: ${cyc.gate})` : ""} · ${cont.total} piezas (${cont.draft}d/${cont.scheduled}s/${cont.published}p)`,
      );
      if (cyc?.gate) severity = maxSeverity([severity, "warn"]);
    }
    const { data: winners } = await admin
      .from("content_insights")
      .select("client, dimension, value, score")
      .order("score", { ascending: false })
      .limit(6);
    if (winners && winners.length > 0) {
      lines.push(
        `- Ganadores (insights): ${winners.map((w) => `${w.client}·${w.dimension}="${w.value}"`).join(" · ")}`,
      );
    }
    data.ciclos = clientes.map((c) => ({
      cliente: c.key,
      step: c.data.procesos.find((p) => p.process === "content_cycle")?.step ?? null,
      contenido: c.data.contenido,
    }));
  }

  if (g.slug === "analitica") {
    const [{ data: paid }, { data: evals }] = await Promise.all([
      admin.from("paid_media_daily").select("client_id").gte("date", daysAgoIso(7).slice(0, 10)),
      admin.from("eval_runs").select("set, score").gte("created_at", daysAgoIso(30)),
    ]);
    const paidByClient = new Map<string, number>();
    for (const r of paid ?? []) paidByClient.set(r.client_id, (paidByClient.get(r.client_id) ?? 0) + 1);
    lines.push(
      paidByClient.size > 0
        ? `- Ingesta Meta 7d: ${[...paidByClient.entries()].map(([c, n]) => `${c} (${n} filas)`).join(" · ")}`
        : "- Ingesta Meta 7d: sin filas (Stage 2 dormido sin token, o sin pauta)",
    );
    if (evals && evals.length > 0) {
      const bySet = new Map<string, { sum: number; n: number }>();
      for (const e of evals) {
        const agg = bySet.get(e.set) ?? { sum: 0, n: 0 };
        agg.sum += e.score;
        agg.n++;
        bySet.set(e.set, agg);
      }
      const avgTxt = [...bySet.entries()]
        .map(([s, a]) => `${s}: ${Math.round(a.sum / a.n)}/100 (${a.n})`)
        .join(" · ");
      lines.push(`- Evals 30d: ${avgTxt}`);
      const anyLow = [...bySet.values()].some((a) => a.sum / a.n < 75);
      if (anyLow) severity = maxSeverity([severity, "warn"]);
      data.evals = avgTxt;
    } else {
      lines.push("- Evals 30d: sin corridas todavía (cron de lunes)");
    }
    data.ingestaMeta = Object.fromEntries(paidByClient);
  }

  if (g.slug === "finanzas") {
    const fin = await loadFinanceContext().catch(() => null);
    if (fin) {
      // Sacamos el encabezado del snapshot (acá el header lo pone el área)
      lines.push(...fin.split("\n").slice(1));
      if (fin.includes("DESCALCE") || fin.includes("late")) severity = maxSeverity([severity, "warn"]);
    } else {
      lines.push("- Snapshot financiero no disponible (falló la carga)");
    }
    const conAtraso = clientes.filter((c) => c.data.pagos.late > 0);
    if (conAtraso.length > 0) {
      lines.push(`- ⚠ Clientes con pagos atrasados: ${conAtraso.map((c) => c.data.cliente.name).join(", ")}`);
      severity = "crit";
    }
    data.pagosLate = conAtraso.map((c) => c.key);
  }

  if (g.slug === "operaciones") {
    const [{ data: sysRuns }, { data: outbox }, { data: autonomy }] = await Promise.all([
      admin
        .from("agent_runs")
        .select("client, agent, status, summary")
        .eq("status", "error")
        .gte("created_at", daysAgoIso(7))
        .limit(30),
      admin.from("events").select("id").eq("status", "pending"),
      admin.from("autonomy_settings").select("output_type, mode, eligible_since"),
    ]);
    const erroresTodos = (sysRuns ?? []).map(
      (r) => `${r.client} · ${r.agent}: ${(r.summary ?? "").slice(0, 70)}`,
    );
    lines.push(
      erroresTodos.length > 0
        ? `- Runs con ERROR 7d (toda la flota): ${erroresTodos.length} → ${erroresTodos.slice(0, 6).join(" | ")}`
        : "- Flota sin errores en 7d",
    );
    if (erroresTodos.length > 0) severity = "crit";
    lines.push(
      (outbox?.length ?? 0) > 0
        ? `- Outbox de eventos: ${outbox!.length} pendientes (el sweeper corre a diario)`
        : "- Outbox de eventos: vacío",
    );
    const promoted = (autonomy ?? []).filter((a) => a.mode !== "gated");
    const eligible = (autonomy ?? []).filter((a) => a.eligible_since && a.mode === "gated");
    lines.push(
      `- Autonomía: ${promoted.length > 0 ? `auto_sampled: ${promoted.map((a) => a.output_type).join(", ")}` : "todo gated"}${eligible.length > 0 ? ` · ELEGIBLES para promover: ${eligible.map((a) => a.output_type).join(", ")}` : ""}`,
    );
    data.erroresFlota = erroresTodos.length;
    data.outboxPendientes = outbox?.length ?? 0;
  }

  if (g.slug === "clientes") {
    for (const c of clientes) {
      const onb = c.data.procesos.find((p) => p.process === "onboarding");
      const extra: string[] = [];
      if (c.data.solicitudes.abiertas > 0) {
        extra.push(`${c.data.solicitudes.abiertas} solicitudes${c.data.solicitudes.urgentes > 0 ? ` (${c.data.solicitudes.urgentes} urg.)` : ""}`);
      }
      if (c.data.eventosProximos.length > 0) {
        extra.push(`próximo: ${c.data.eventosProximos[0].date} ${c.data.eventosProximos[0].title}`);
      }
      lines.push(
        `- ${c.data.cliente.name}: onboarding "${onb?.step ?? "n/a"}"${onb?.gate ? ` (gate: ${onb.gate})` : ""}${extra.length > 0 ? ` · ${extra.join(" · ")}` : ""}`,
      );
      if (c.data.solicitudes.urgentes > 0) severity = maxSeverity([severity, "warn"]);
    }
    data.solicitudesAbiertas = clientes.reduce((n, c) => n + c.data.solicitudes.abiertas, 0);
  }

  if (g.slug === "ventas") {
    const { data: leads } = await admin.from("leads").select("stage").is("lost_at", null).limit(500);
    const byStage = new Map<string, number>();
    for (const l of leads ?? []) byStage.set(l.stage, (byStage.get(l.stage) ?? 0) + 1);
    lines.push(
      byStage.size > 0
        ? `- Pipeline: ${[...byStage.entries()].map(([s, n]) => `${s}: ${n}`).join(" · ")} (total ${leads?.length ?? 0})`
        : "- Pipeline: sin leads cargados",
    );
    data.pipeline = Object.fromEntries(byStage);
  }

  if (flotaErrores.length > 0) {
    lines.push(`- ⚠ Errores de MI flota 7d: ${flotaErrores.join(" · ")}`);
  }

  data.severity = severity;
  data.clientes = Object.fromEntries(clientes.map((c) => [c.key, c.data.severity]));

  const header = `${SEV_ICON[severity]} **Gerencia de ${g.label}** — estado ${month}`;
  return {
    key: g.slug,
    title: `Gerencia de ${g.label}`,
    content_md: cap([header, ...lines].join("\n"), AREA_MD_CAP),
    data,
  };
}

// ---------------------------------------------------------------------------
// Sync — clientes primero, áreas después
// ---------------------------------------------------------------------------

export interface DigestSyncResult {
  clientes: number;
  areas: number;
  errores: string[];
}

/**
 * Reconstruye los digests. Con `clientId` reconstruye solo ese cliente (y
 * las áreas igual se rearman con los digests de cliente ya guardados de los
 * demás). Determinista, cero LLM.
 */
export async function runDigestSync(clientId?: string): Promise<DigestSyncResult> {
  const admin = getSupabaseAdmin();
  const errores: string[] = [];

  let query = admin
    .from("clients")
    .select("id, name, sector, type, phase, status")
    .neq("status", "archived");
  if (clientId) query = query.eq("id", clientId);
  const { data: clients } = await query;

  // 1) Digests de cliente (Gerentes de Proyecto)
  const built: ClientDigest[] = [];
  for (const c of clients ?? []) {
    try {
      const d = await buildClientDigest(c as ClientRowLite);
      built.push(d);
      const { error } = await admin.from("digests").upsert(
        {
          level: "cliente",
          key: d.key,
          title: d.title,
          content_md: d.content_md,
          data: d.data,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "level,key" },
      );
      if (error) errores.push(`upsert cliente ${c.id}: ${error.message}`);
    } catch (err) {
      errores.push(`cliente ${c.id}: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  // 2) Para las áreas necesitamos TODOS los clientes: si el sync fue de uno
  //    solo, completamos con lo persistido de los demás.
  let allClientDigests = built;
  if (clientId) {
    const { data: stored } = await admin
      .from("digests")
      .select("key, title, content_md, data")
      .eq("level", "cliente");
    const freshKeys = new Set(built.map((d) => d.key));
    allClientDigests = [
      ...built,
      ...((stored ?? []) as Array<{ key: string; title: string; content_md: string; data: ClientDigestData }>)
        .filter((d) => !freshKeys.has(d.key))
        .map((d) => ({ key: d.key, title: d.title, content_md: d.content_md, data: d.data })),
    ];
  }

  // 3) Digests de área (gerencias)
  let areasOk = 0;
  for (const g of GERENCIAS) {
    try {
      const d = await buildAreaDigest(g, allClientDigests);
      const { error } = await admin.from("digests").upsert(
        {
          level: "area",
          key: d.key,
          title: d.title,
          content_md: d.content_md,
          data: d.data,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "level,key" },
      );
      if (error) errores.push(`upsert area ${g.slug}: ${error.message}`);
      else areasOk++;
    } catch (err) {
      errores.push(`area ${g.slug}: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  return { clientes: built.length, areas: areasOk, errores };
}

// ---------------------------------------------------------------------------
// Bloques para prompts (lectura)
// ---------------------------------------------------------------------------

/**
 * Los 6 digests de área para el system del Gerente General. Team no recibe
 * finanzas/ventas (defensa doble con la RLS de la tabla). Devuelve null si
 * el cron nunca corrió — el GG lo dice en vez de inventar.
 */
export async function loadGerenciasBlock(caller: CallerContext): Promise<string | null> {
  const admin = getSupabaseAdmin();
  const visibles = gerenciasVisibles(caller.role);
  const { data } = await admin
    .from("digests")
    .select("key, content_md, updated_at")
    .eq("level", "area")
    .in("key", visibles.map((g) => g.slug));
  if (!data || data.length === 0) return null;

  const byKey = new Map(data.map((d) => [d.key as string, d]));
  const newest = data.reduce(
    (max, d) => ((d.updated_at as string) > max ? (d.updated_at as string) : max),
    "",
  );

  const parts: string[] = [
    `ESTADO POR GERENCIA (pipeline jerárquico: cada cliente tiene un Gerente de Proyecto que prepara su estado; cada gerencia agrega los de sus clientes + sus fuentes; vos, Gerente General, recibís esto YA preparado — respondé desde acá con precisión. Preparado: ${newest.slice(0, 16).replace("T", " ")} UTC. Si te preguntan por algo más fresco que esto, aclaralo y sugerí refrescar con el sync.)`,
  ];
  // Orden canónico del organigrama, no el de la query
  for (const g of visibles) {
    const d = byKey.get(g.slug);
    if (d) parts.push(`\n${d.content_md}`);
  }
  return cap(parts.join("\n"), BLOCK_CAP);
}

/** Digest de UNA gerencia (para las personas de área, ej. marketing). */
export async function loadAreaDigestBlock(slug: GerenciaSlug): Promise<string | null> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("digests")
    .select("content_md, updated_at")
    .eq("level", "area")
    .eq("key", slug)
    .maybeSingle();
  if (!data) return null;
  return `ESTADO PREPARADO DE TU GERENCIA (agregado diario de los Gerentes de Proyecto + fuentes del área; preparado ${(data.updated_at as string).slice(0, 16).replace("T", " ")} UTC):\n${data.content_md}`;
}

/** Digest del cliente (para el Gerente de Proyecto — /api/consultant). */
export async function loadClientDigestBlock(clientId: string): Promise<string | null> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("digests")
    .select("content_md, updated_at")
    .eq("level", "cliente")
    .eq("key", clientId)
    .maybeSingle();
  if (!data) return null;
  return `ESTADO PREPARADO DEL CLIENTE (digest diario del sistema — usalo para responder "¿en qué estamos?" sin inventar; preparado ${(data.updated_at as string).slice(0, 16).replace("T", " ")} UTC):\n${data.content_md}`;
}
