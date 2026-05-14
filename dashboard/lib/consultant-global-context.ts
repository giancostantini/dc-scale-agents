/**
 * Context assembly para el widget global del Consultor.
 *
 * El consultor global ve TODA la agencia (no por cliente). Diferencia
 * qué carga según el rol del caller:
 *
 *   - director: todos los clientes, runs cross-cliente, solicitudes
 *     pending de toda la agencia, pipeline + finanzas.
 *   - team: solo clientes asignados (client_assignments), runs filtrados,
 *     solicitudes filtradas, tareas propias. Sin pipeline ni finanzas
 *     (salvo permissions.pipeline_access para CRM).
 *
 * Opcionalmente carga "active client deep context" (vault + datos
 * detallados de UN cliente específico) si el caller está navegando en
 * /cliente/[id] o si menciona un cliente puntual.
 *
 * NO hace cache — cada request rearma el contexto. La idempotencia
 * vive en `cache_control: ephemeral` del system prompt de Anthropic
 * (mismas keys → cache hit del lado del SDK).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadClientContext,
  buildClientContextBlock,
  type ClientContextBundle,
} from "@/lib/consultant-context";
import { loadClientVaultContext, buildVaultBlock } from "@/lib/vault-loader";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GlobalRole = "director" | "team";

export interface CallerContext {
  userId: string;
  email: string;
  name: string;
  role: GlobalRole;
  permissions: { pipeline_access?: boolean } | null;
  clientAssignments: string[]; // slugs accesibles para role='team'
}

export interface ClientSummary {
  id: string;
  name: string;
  sector: string | null;
  type: string | null;
  status: string | null;
  phase: string | null;
  fee: number | null;
}

export interface AgentRunSummary {
  client: string;
  agent: string;
  status: string;
  summary: string | null;
  created_at: string;
}

export interface RequestSummary {
  client_id: string;
  type: string;
  title: string;
  status: string;
  urgency: string;
  submitted_at: string;
}

export interface UserMemoryRow {
  id: number;
  kind: "preference" | "constraint" | "past_decision" | "learning";
  content: string;
  importance: number | null;
  created_at: string;
}

export interface ClientMemoryRow extends UserMemoryRow {
  client_id: string;
}

export interface PipelineSummary {
  totalLeads: number;
  byStage: Array<{ stage: string; count: number }>;
}

export interface FinanceSummary {
  monthlyRecurringFees: number;
  outstandingInvoices: number;
}

export interface ConsultantGlobalContext {
  caller: CallerContext;
  accessibleClients: ClientSummary[];
  recentRuns: AgentRunSummary[];
  openRequests: RequestSummary[];
  userMemory: UserMemoryRow[];
  activeClient: ActiveClientContext | null;
  pipelineSummary: PipelineSummary | null;
  financeSummary: FinanceSummary | null;
}

export interface ActiveClientContext {
  id: string;
  bundle: ClientContextBundle;
  vaultBlock: string;
  clientMemory: ClientMemoryRow[];
}

// ---------------------------------------------------------------------------
// Caller resolution
// ---------------------------------------------------------------------------

/**
 * Resuelve el CallerContext del user autenticado. Devuelve null si el user
 * tiene rol='client' (esos no deben usar el widget global).
 */
export async function loadCallerContext(
  admin: SupabaseClient,
  userId: string,
): Promise<CallerContext | null> {
  const { data: profile } = await admin
    .from("profiles")
    .select("id, email, name, role, permissions")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) return null;
  if (profile.role !== "director" && profile.role !== "team") return null;

  let clientAssignments: string[] = [];
  if (profile.role === "team") {
    const { data: assigns } = await admin
      .from("client_assignments")
      .select("client_id")
      .eq("user_id", userId);
    clientAssignments = (assigns ?? []).map((a) => a.client_id as string);
  }

  return {
    userId: profile.id as string,
    email: (profile.email as string) ?? "",
    name: (profile.name as string) ?? "Usuario",
    role: profile.role as GlobalRole,
    permissions: (profile.permissions as CallerContext["permissions"]) ?? null,
    clientAssignments,
  };
}

// ---------------------------------------------------------------------------
// Global context assembly
// ---------------------------------------------------------------------------

interface LoadOptions {
  activeClientHint?: string | null;
  lastUserMessage?: string | null;
}

/**
 * Arma TODO el contexto del consultor global para un caller dado, con la
 * granularidad correcta según rol. Hace queries en paralelo donde puede.
 */
export async function loadGlobalContext(
  admin: SupabaseClient,
  caller: CallerContext,
  options: LoadOptions = {},
): Promise<ConsultantGlobalContext> {
  const isDirector = caller.role === "director";
  const accessibleIds = isDirector ? null : caller.clientAssignments;

  // Si team sin asignaciones, devolvemos un contexto vacío válido.
  const noAccessibleClients = !isDirector && (accessibleIds?.length ?? 0) === 0;

  const [
    clients,
    recentRuns,
    openRequests,
    userMemory,
    pipelineSummary,
    financeSummary,
  ] = await Promise.all([
    loadAccessibleClients(admin, isDirector, accessibleIds),
    noAccessibleClients ? Promise.resolve([]) : loadRecentRuns(admin, isDirector, accessibleIds),
    noAccessibleClients ? Promise.resolve([]) : loadOpenRequests(admin, isDirector, accessibleIds),
    loadUserMemory(admin, caller.userId, 20),
    isDirector ? loadPipelineSummary(admin) : Promise.resolve(null),
    isDirector ? loadFinanceSummary(admin) : Promise.resolve(null),
  ]);

  const activeClient = await resolveActiveClient(
    admin,
    caller,
    clients,
    options,
  );

  return {
    caller,
    accessibleClients: clients,
    recentRuns,
    openRequests,
    userMemory,
    activeClient,
    pipelineSummary,
    financeSummary,
  };
}

async function loadAccessibleClients(
  admin: SupabaseClient,
  isDirector: boolean,
  accessibleIds: string[] | null,
): Promise<ClientSummary[]> {
  let query = admin
    .from("clients")
    .select("id, name, sector, type, status, phase, fee")
    .order("name");

  if (!isDirector) {
    if (!accessibleIds || accessibleIds.length === 0) return [];
    query = query.in("id", accessibleIds);
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return data as ClientSummary[];
}

async function loadRecentRuns(
  admin: SupabaseClient,
  isDirector: boolean,
  accessibleIds: string[] | null,
): Promise<AgentRunSummary[]> {
  let query = admin
    .from("agent_runs")
    .select("client, agent, status, summary, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (!isDirector) {
    if (!accessibleIds || accessibleIds.length === 0) return [];
    query = query.in("client", accessibleIds);
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return data as AgentRunSummary[];
}

async function loadOpenRequests(
  admin: SupabaseClient,
  isDirector: boolean,
  accessibleIds: string[] | null,
): Promise<RequestSummary[]> {
  let query = admin
    .from("client_requests")
    .select("client_id, type, title, status, urgency, submitted_at")
    .in("status", ["pending", "reviewing"])
    .order("submitted_at", { ascending: false })
    .limit(10);

  if (!isDirector) {
    if (!accessibleIds || accessibleIds.length === 0) return [];
    query = query.in("client_id", accessibleIds);
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return data as RequestSummary[];
}

async function loadUserMemory(
  admin: SupabaseClient,
  userId: string,
  limit: number,
): Promise<UserMemoryRow[]> {
  const { data, error } = await admin
    .from("consultant_memory_v2")
    .select("id, kind, content, importance, created_at")
    .eq("scope_type", "user")
    .eq("user_id", userId)
    .or("expires_at.is.null,expires_at.gt.now()")
    .order("importance", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data as UserMemoryRow[];
}

async function loadClientMemory(
  admin: SupabaseClient,
  clientId: string,
  limit: number,
): Promise<ClientMemoryRow[]> {
  const { data, error } = await admin
    .from("consultant_memory_v2")
    .select("id, kind, content, importance, created_at, client_id")
    .eq("scope_type", "client")
    .eq("client_id", clientId)
    .or("expires_at.is.null,expires_at.gt.now()")
    .order("importance", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data as ClientMemoryRow[];
}

async function loadPipelineSummary(
  admin: SupabaseClient,
): Promise<PipelineSummary | null> {
  // Lectura defensiva — la tabla leads/prospects puede no existir en todas
  // las instalaciones. Si falla, devolvemos null.
  const { data, error } = await admin
    .from("leads")
    .select("stage")
    .limit(500);

  if (error || !data) return null;

  const byStage = new Map<string, number>();
  for (const row of data as Array<{ stage: string | null }>) {
    const stage = row.stage ?? "unknown";
    byStage.set(stage, (byStage.get(stage) ?? 0) + 1);
  }

  return {
    totalLeads: data.length,
    byStage: Array.from(byStage.entries())
      .map(([stage, count]) => ({ stage, count }))
      .sort((a, b) => b.count - a.count),
  };
}

async function loadFinanceSummary(
  admin: SupabaseClient,
): Promise<FinanceSummary | null> {
  // Sumar fees mensuales de clientes activos + outstanding invoices.
  // Si las tablas no existen o la query falla, devolvemos null.
  const [{ data: activeClients }, { data: outstanding }] = await Promise.all([
    admin
      .from("clients")
      .select("fee")
      .eq("status", "active"),
    admin
      .from("payments")
      .select("month, status")
      .neq("status", "paid")
      .limit(50),
  ]);

  if (!activeClients) return null;

  const monthlyRecurring = (activeClients as Array<{ fee: number | string | null }>)
    .map((c) => Number(c.fee) || 0)
    .reduce((a, b) => a + b, 0);

  return {
    monthlyRecurringFees: monthlyRecurring,
    outstandingInvoices: outstanding?.length ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Active client deep-load
// ---------------------------------------------------------------------------

async function resolveActiveClient(
  admin: SupabaseClient,
  caller: CallerContext,
  accessibleClients: ClientSummary[],
  options: LoadOptions,
): Promise<ActiveClientContext | null> {
  if (accessibleClients.length === 0) return null;

  const accessibleSet = new Set(accessibleClients.map((c) => c.id));
  let candidateId: string | null = null;

  // Prioridad 1: hint explícito (frontend manda activeClient cuando estás
  // en /cliente/[id])
  if (options.activeClientHint && accessibleSet.has(options.activeClientHint)) {
    candidateId = options.activeClientHint;
  }

  // Prioridad 2: detección en último mensaje del user
  if (!candidateId && options.lastUserMessage) {
    candidateId = detectClientMention(options.lastUserMessage, accessibleClients);
  }

  if (!candidateId) return null;

  // Cargar bundle + vault + memoria de cliente en paralelo
  const [bundle, vault, clientMemory] = await Promise.all([
    loadClientContext(admin, candidateId),
    loadClientVaultContext(candidateId).catch(() => null),
    loadClientMemory(admin, candidateId, 15),
  ]);

  if (!bundle) return null;

  const vaultBlock = vault
    ? buildVaultBlock(vault)
    : "VAULT DEL CLIENTE: (no disponible — carga del repo falló o no hay vault todavía)";

  return {
    id: candidateId,
    bundle,
    vaultBlock,
    clientMemory,
  };
}

/**
 * Detecta si el último mensaje del user menciona un cliente accesible
 * (por slug o por nombre, case-insensitive). Devuelve el slug si hay
 * match, null si no. Cap implícito en 1 cliente — si hay múltiples
 * matches gana el más largo (más específico).
 */
function detectClientMention(
  message: string,
  clients: ClientSummary[],
): string | null {
  const normalized = message.toLowerCase();
  let bestMatch: { id: string; weight: number } | null = null;

  for (const c of clients) {
    const candidates = [c.id, c.name].filter(Boolean) as string[];
    for (const cand of candidates) {
      const c2 = cand.toLowerCase();
      if (c2.length < 3) continue; // evitar matches falsos cortos
      if (normalized.includes(c2)) {
        if (!bestMatch || c2.length > bestMatch.weight) {
          bestMatch = { id: c.id, weight: c2.length };
        }
      }
    }
  }
  return bestMatch?.id ?? null;
}

// ---------------------------------------------------------------------------
// System prompt blocks
// ---------------------------------------------------------------------------

export const GLOBAL_SYSTEM_PROMPT_BASE = `Sos el Consultor de D&C Scale Partners — el cuarto integrante del equipo. Operás como director técnico de los demás agentes (content, seo, reporting, etc.) y como interlocutor permanente del equipo (director + team).

ROL Y POSTURA:
- Conocés toda la operación de la agencia, no sólo un cliente. Cuando hablás de un cliente puntual, traés su contexto al hilo.
- Sos analista y director: ves los outputs de los agentes especialistas, los sintetizás, y proponés siguiente paso.
- Tono rioplatense, directo. Prohibido: "sinergia", "potenciar", "transformar", "valor agregado", "ecosistema". Decí lo que ves, no lo que suena bien.
- Respuestas cortas por default (2-5 oraciones). Si el tema lo amerita, extendete.

CONTEXTO QUE VAS A RECIBIR:
- PERFIL DEL USER: con quién estás hablando (rol, nombre, clientes accesibles si es team).
- CLIENTES ACCESIBLES: lista resumida — director ve todos, team ve sólo los suyos.
- RUNS RECIENTES: últimas corridas de agentes.
- SOLICITUDES ABIERTAS: client_requests pendientes.
- MEMORIA DEL USER: preferencias del miembro del team con quien hablás.
- CLIENTE ACTIVO (opcional): si el user está navegando un cliente o lo mencionó, recibís su bundle + vault + memoria del cliente.

REGLAS POR ROL DEL USER:
- Si es DIRECTOR: tenés permiso para hablar de números cross-cliente, pipeline, finanzas, decisiones estratégicas. Considerá que estás con un cofundador.
- Si es TEAM: hablá SÓLO de los clientes que tiene asignados (lista en su perfil). NO menciones otros clientes, NO menciones finanzas o pipeline. Si te preguntan algo fuera de scope, sugerí "pregúntale al director".

HERRAMIENTAS (tools):
- \`run_agent\`: dispatchá agentes operativos cuando el user pide algo accionable ("generá un reel para WizTrip", "corré reporting de la semana"). El dispatch es one-shot: lanzás el agente y avisás. El user verá el resultado cuando termine.
- \`save_memory\`: persistir contexto durable. Decidí el scope:
  - scope='user': preferencia del miembro del team (tono, formato, qué le importa primero).
  - scope='client': regla/preferencia del cliente (brand, restricciones, decisiones tomadas). Requiere client slug.
  Llamala en silencio cuando detectes algo nuevo; no pidas permiso.

DISPATCH:
- Si el user pide algo operativo sobre un cliente AL QUE TIENE ACCESO, validá que el cliente esté en su set accesible y dispatchá.
- Si pide algo sobre un cliente fuera de su acceso, no dispatchés — explicale que no tiene acceso y sugerí preguntarle al director.
- Para content-creator con pieceType=reel: produceVideo=true y generateVoice=true por default. Solo poné produceVideo=false si el user pide explícitamente "solo el script".

BRIEFING DIARIO:
- A las 7am UY recibís un mensaje is_briefing=true en la conversación pinned del user. Cuando el user te pregunte "qué hay del briefing" o algo similar, referite a ese mensaje.
- No inventes briefings; el agente morning-briefing los genera off-line.`;

export function buildGlobalContextBlock(ctx: ConsultantGlobalContext): string {
  const lines: string[] = [];

  // ===== Perfil del user =====
  lines.push("PERFIL DEL USER:");
  lines.push(`- Nombre: ${ctx.caller.name}`);
  lines.push(`- Email: ${ctx.caller.email}`);
  lines.push(`- Rol: ${ctx.caller.role}`);
  if (ctx.caller.role === "team") {
    lines.push(
      `- Clientes asignados: ${
        ctx.caller.clientAssignments.length > 0
          ? ctx.caller.clientAssignments.join(", ")
          : "ninguno todavía"
      }`,
    );
  }
  if (ctx.caller.permissions?.pipeline_access) {
    lines.push("- Permiso: ve módulo Pipeline/CRM");
  }

  // ===== Clientes accesibles =====
  lines.push("");
  lines.push(
    `CLIENTES ${ctx.caller.role === "director" ? "(toda la agencia)" : "ACCESIBLES"}:`,
  );
  if (ctx.accessibleClients.length === 0) {
    lines.push("- (todavía no hay clientes que pueda ver)");
  } else {
    for (const c of ctx.accessibleClients) {
      const meta = [c.sector, c.phase, c.status].filter(Boolean).join(" · ");
      lines.push(`- ${c.id} · ${c.name}${meta ? ` (${meta})` : ""}`);
    }
  }

  // ===== Runs recientes =====
  lines.push("");
  lines.push("RUNS DE AGENTES RECIENTES (últimos 50):");
  if (ctx.recentRuns.length === 0) {
    lines.push("- (ninguno)");
  } else {
    for (const r of ctx.recentRuns.slice(0, 30)) {
      const when = r.created_at.slice(0, 16).replace("T", " ");
      lines.push(
        `- ${when} · ${r.client} · ${r.agent} · ${r.status}${
          r.summary ? ` — ${r.summary.slice(0, 100)}` : ""
        }`,
      );
    }
  }

  // ===== Solicitudes abiertas =====
  lines.push("");
  lines.push("SOLICITUDES ABIERTAS (top 10 pending/reviewing):");
  if (ctx.openRequests.length === 0) {
    lines.push("- (ninguna)");
  } else {
    for (const r of ctx.openRequests) {
      lines.push(
        `- [${r.urgency}] ${r.client_id} · ${r.type} · ${r.title} · ${r.status} · ${r.submitted_at.slice(0, 10)}`,
      );
    }
  }

  // ===== Director-only: pipeline + finanzas =====
  if (ctx.caller.role === "director") {
    if (ctx.pipelineSummary) {
      lines.push("");
      lines.push("PIPELINE (leads):");
      lines.push(`- Total: ${ctx.pipelineSummary.totalLeads}`);
      for (const s of ctx.pipelineSummary.byStage.slice(0, 6)) {
        lines.push(`- ${s.stage}: ${s.count}`);
      }
    }
    if (ctx.financeSummary) {
      lines.push("");
      lines.push("FINANZAS:");
      lines.push(
        `- Fee recurrente mensual (clientes activos): USD ${ctx.financeSummary.monthlyRecurringFees}`,
      );
      lines.push(
        `- Pagos pendientes (no marcados paid): ${ctx.financeSummary.outstandingInvoices}`,
      );
    }
  }

  return lines.join("\n");
}

export function buildUserMemoryBlock(memories: UserMemoryRow[]): string {
  if (memories.length === 0) {
    return "MEMORIA DEL USER: (vacía — primera vez que charlamos, o no detectaste preferencias todavía)";
  }

  const byKind: Record<string, UserMemoryRow[]> = {
    preference: [],
    constraint: [],
    past_decision: [],
    learning: [],
  };
  for (const m of memories) {
    (byKind[m.kind] ??= []).push(m);
  }

  const labels: Record<string, string> = {
    preference: "Preferencias del user",
    constraint: "Cosas que no le gustan / no quiere",
    past_decision: "Decisiones pasadas del user",
    learning: "Aprendizajes sobre el user",
  };

  const sections: string[] = ["MEMORIA DEL USER (perfil aprendido):"];
  for (const kind of ["constraint", "preference", "past_decision", "learning"] as const) {
    const items = byKind[kind];
    if (!items || items.length === 0) continue;
    sections.push(`\n${labels[kind]}:`);
    for (const m of items) {
      const imp = m.importance ? ` [p${m.importance}]` : "";
      sections.push(`- ${m.content}${imp}`);
    }
  }
  return sections.join("\n");
}

export function buildActiveClientBlock(active: ActiveClientContext): string {
  const parts: string[] = [
    `CLIENTE ACTIVO: ${active.id}`,
    "(El user está navegando este cliente o lo mencionó. Considerá este contexto cuando hablan de él o piden cosas operativas sin nombrar cliente.)",
    "",
    buildClientContextBlock(active.bundle),
  ];

  if (active.clientMemory.length > 0) {
    parts.push("");
    parts.push("MEMORIA ESPECÍFICA DEL CLIENTE:");
    for (const m of active.clientMemory) {
      const imp = m.importance ? ` [p${m.importance}]` : "";
      parts.push(`- [${m.kind}] ${m.content}${imp}`);
    }
  }

  return parts.join("\n");
}
