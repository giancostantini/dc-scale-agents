/**
 * Helpers para armar el bloque de contexto del Consultor IA del portal.
 * Lo usan tanto /api/portal/consultant (chat) como
 * /api/portal/consultant/welcome (mensaje inicial cacheado).
 *
 * Filtro de privacidad: SOLO data que el cliente puede ver según las
 * RLS de migration 007. Excluímos `notes` (internas del team), `leads`,
 * `prospect_campaigns`, `expenses`, `audit_log` y data de otros clientes.
 *
 * Incluido (visible al cliente):
 *   - clients (kpis, modules, phase, onboarding/brandingFiles)
 *   - objectives
 *   - phase_reports (TODOS los estados, no solo approved — el consultor
 *     necesita saber qué hay en draft/review para responder "en qué fase
 *     vamos" con honestidad)
 *   - production_campaigns
 *   - cal_events (próximas)
 *   - payments (últimos 6 meses)
 *   - client_requests (últimos 10 — qué pidió el cliente y en qué estado)
 *   - content_posts (publicados)
 *   - integrations (conectadas — qué stack está activo)
 *   - dev_tasks activas (solo si client.type = 'dev')
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

export interface ClientForContext {
  id: string;
  name: string;
  sector: string | null;
  type: string | null;
  phase: string | null;
  method: string | null;
  fee: number | string | null;
  kpis: Record<string, unknown> | null;
  modules: Record<string, boolean> | null;
  onboarding: Record<string, unknown> | null;
}

export interface ObjectivesForContext {
  period: string;
  period_type: string;
  items: { id: string; name: string; now: string; target: string; unit: string; pct: number }[];
}

export interface PhaseReportForContext {
  phase: string;
  status: string;
  content_md: string | null;
  approved_at: string | null;
  updated_at: string | null;
}

export interface ProdCampaignForContext {
  title: string;
  type: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
}

export interface EventForContext {
  title: string;
  date: string;
  time: string | null;
  type: string;
}

export interface PaymentForContext {
  month: string;
  status: string;
  paid_date: string | null;
}

export interface RequestForContext {
  type: string;
  title: string;
  description: string | null;
  status: string;
  urgency: string;
  submitted_at: string;
  response: string | null;
  metadata: Record<string, unknown> | null;
}

export interface ContentForContext {
  network: string;
  format: string | null;
  brief: string | null;
  date: string;
}

export interface IntegrationForContext {
  key: string;
  name: string;
  group_name: string;
  submitted_at: string | null;
}

export interface DevTaskForContext {
  title: string;
  status: string;
  priority: string;
  sprint: string | null;
  due_date: string | null;
}

export interface ClientContextBundle {
  client: ClientForContext;
  objectives: ObjectivesForContext | null;
  phaseReports: PhaseReportForContext[];
  prodCampaigns: ProdCampaignForContext[];
  events: EventForContext[];
  payments: PaymentForContext[];
  requests: RequestForContext[];
  content: ContentForContext[];
  integrations: IntegrationForContext[];
  devTasks: DevTaskForContext[];
}

/**
 * Carga todo el contexto del cliente desde Supabase con service role.
 * Filtra siempre por clientId — nunca leemos data de otros clientes.
 */
export async function loadClientContext(
  admin: SupabaseClient,
  clientId: string,
): Promise<ClientContextBundle | null> {
  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: client },
    { data: objectives },
    { data: phaseReports },
    { data: prodCampaigns },
    { data: events },
    { data: payments },
    { data: requests },
    { data: content },
    { data: integrations },
  ] = await Promise.all([
    admin
      .from("clients")
      .select("id, name, sector, type, phase, method, fee, kpis, modules, onboarding")
      .eq("id", clientId)
      .maybeSingle(),
    admin
      .from("objectives")
      .select("period, period_type, items")
      .eq("client_id", clientId)
      .maybeSingle(),
    admin
      .from("phase_reports")
      .select("phase, status, content_md, approved_at, updated_at")
      .eq("client_id", clientId)
      .order("updated_at", { ascending: false }),
    admin
      .from("production_campaigns")
      .select("title, type, status, start_date, end_date")
      .eq("client_id", clientId),
    admin
      .from("cal_events")
      .select("title, date, time, type")
      .eq("client_id", clientId)
      .gte("date", today)
      .order("date")
      .limit(5),
    admin
      .from("payments")
      .select("month, status, paid_date")
      .eq("client_id", clientId)
      .order("month", { ascending: false })
      .limit(6),
    admin
      .from("client_requests")
      .select("type, title, description, status, urgency, submitted_at, response, metadata")
      .eq("client_id", clientId)
      .order("submitted_at", { ascending: false })
      .limit(10),
    admin
      .from("content_posts")
      .select("network, format, brief, date")
      .eq("client_id", clientId)
      .eq("status", "published")
      .order("date", { ascending: false })
      .limit(8),
    admin
      .from("integrations")
      .select("key, name, group_name, submitted_at")
      .eq("client_id", clientId)
      .eq("status", "connected"),
  ]);

  if (!client) return null;

  // dev_tasks solo si el cliente es de tipo dev
  let devTasks: DevTaskForContext[] = [];
  if ((client as ClientForContext).type === "dev") {
    const { data } = await admin
      .from("dev_tasks")
      .select("title, status, priority, sprint, due_date")
      .eq("client_id", clientId)
      .neq("status", "done")
      .order("priority", { ascending: false })
      .limit(15);
    devTasks = (data ?? []) as DevTaskForContext[];
  }

  return {
    client: client as ClientForContext,
    objectives: objectives as ObjectivesForContext | null,
    phaseReports: (phaseReports ?? []) as PhaseReportForContext[],
    prodCampaigns: (prodCampaigns ?? []) as ProdCampaignForContext[],
    events: (events ?? []) as EventForContext[],
    payments: (payments ?? []) as PaymentForContext[],
    requests: (requests ?? []) as RequestForContext[],
    content: (content ?? []) as ContentForContext[],
    integrations: (integrations ?? []) as IntegrationForContext[],
    devTasks,
  };
}

/**
 * Helper para crear un Supabase client admin (service role).
 * Centraliza para no repetir en cada endpoint.
 */
export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Arma el bloque de contexto en markdown para pasar al system prompt
 * de Claude. Incluye todas las fuentes visibles al cliente para que
 * el consultor pueda responder con conocimiento real del estado.
 */
export function buildClientContextBlock(bundle: ClientContextBundle): string {
  const {
    client,
    objectives,
    phaseReports,
    prodCampaigns,
    events,
    payments,
    requests,
    content,
    integrations,
    devTasks,
  } = bundle;

  const lines: string[] = ["CONTEXTO DEL CLIENTE (datos reales — usá esto, no inventes):"];

  // ===== Cliente =====
  lines.push("");
  lines.push("## Cliente");
  lines.push(`- Nombre: ${client.name}`);
  if (client.sector) lines.push(`- Sector: ${client.sector}`);
  if (client.type) lines.push(`- Tipo de cuenta: ${client.type === "gp" ? "Growth Partner" : "Dev"}`);
  if (client.method) lines.push(`- Método contratado: ${client.method}`);
  if (client.phase) lines.push(`- Fase activa: **${client.phase}**`);
  if (client.fee) lines.push(`- Fee mensual: US$ ${client.fee}`);

  // Módulos contratados
  if (client.modules && Object.keys(client.modules).length > 0) {
    const active = Object.entries(client.modules)
      .filter(([, v]) => v === true)
      .map(([k]) => k);
    if (active.length > 0) {
      lines.push(`- Módulos activos: ${active.join(", ")}`);
    }
  }

  // ===== KPIs =====
  if (client.kpis && Object.keys(client.kpis).length > 0) {
    lines.push("");
    lines.push("## KPIs del mes actual");
    for (const [k, v] of Object.entries(client.kpis)) {
      lines.push(`- ${k}: ${v ?? "—"}`);
    }
  }

  // ===== Objetivos =====
  if (objectives && objectives.items?.length > 0) {
    lines.push("");
    lines.push(`## Objetivos · ${objectives.period}`);
    for (const o of objectives.items) {
      lines.push(`- ${o.name}: ${o.now}${o.unit} / ${o.target}${o.unit} (${o.pct}%)`);
    }
  }

  // ===== Fases del negocio (TODOS los reportes, no solo approved) =====
  if (phaseReports.length > 0) {
    lines.push("");
    lines.push("## Fases del negocio");
    lines.push(`Fase actual: ${client.phase ?? "—"}`);
    lines.push("");
    lines.push("Estado de cada reporte de fase:");
    for (const r of phaseReports) {
      const stateMark = r.status === "approved"
        ? "✓ aprobado"
        : r.status === "review"
          ? "○ en revisión"
          : r.status === "draft"
            ? "○ borrador"
            : r.status;
      lines.push(`- **${r.phase}**: ${stateMark}${r.approved_at ? ` (aprobado ${r.approved_at.slice(0, 10)})` : ""}`);
    }
    // Solo incluímos resumen ejecutivo de los aprobados
    const approved = phaseReports.filter((r) => r.status === "approved");
    if (approved.length > 0) {
      lines.push("");
      lines.push("Resumen ejecutivo de los reportes aprobados:");
      for (const r of approved) {
        lines.push("");
        lines.push(`### ${r.phase}`);
        const summary = extractSummary(r.content_md);
        lines.push(summary || "(sin resumen)");
      }
    }
  }

  // ===== Solicitudes del cliente =====
  if (requests.length > 0) {
    lines.push("");
    lines.push("## Solicitudes que cargó el cliente (últimas 10)");
    for (const r of requests) {
      const submitted = r.submitted_at.slice(0, 10);
      lines.push(`- [${r.type}] ${r.title} · ${r.status} · ${r.urgency} · enviada ${submitted}${r.response ? " · respondida" : ""}`);
      if (r.description && r.description.length > 0) {
        const desc = r.description.length > 140 ? r.description.slice(0, 140) + "…" : r.description;
        lines.push(`  ${desc}`);
      }
    }
  }

  // ===== Campañas de producción =====
  if (prodCampaigns.length > 0) {
    lines.push("");
    lines.push("## Campañas de producción");
    for (const c of prodCampaigns) {
      const period = [c.start_date, c.end_date].filter(Boolean).join(" → ");
      lines.push(`- ${c.title} (${c.type}) · ${c.status}${period ? ` · ${period}` : ""}`);
    }
  }

  // ===== Contenido publicado =====
  if (content.length > 0) {
    lines.push("");
    lines.push("## Contenido publicado (últimos 8)");
    for (const c of content) {
      const fmt = c.format ? ` · ${c.format}` : "";
      const brief = c.brief ? ` — ${c.brief.slice(0, 80)}${c.brief.length > 80 ? "…" : ""}` : "";
      lines.push(`- ${c.date.slice(0, 10)} · ${c.network}${fmt}${brief}`);
    }
  }

  // ===== Próximas reuniones =====
  if (events.length > 0) {
    lines.push("");
    lines.push("## Próximas reuniones");
    for (const e of events) {
      lines.push(`- ${e.date}${e.time ? ` ${e.time}` : ""} · ${e.title} (${e.type})`);
    }
  }

  // ===== Integraciones conectadas =====
  if (integrations.length > 0) {
    lines.push("");
    lines.push("## Herramientas conectadas (stack del cliente)");
    const byGroup = new Map<string, string[]>();
    for (const i of integrations) {
      const arr = byGroup.get(i.group_name) ?? [];
      arr.push(i.name);
      byGroup.set(i.group_name, arr);
    }
    for (const [g, items] of byGroup) {
      lines.push(`- ${g}: ${items.join(", ")}`);
    }
  } else {
    lines.push("");
    lines.push("## Herramientas conectadas");
    lines.push("- Ninguna conectada todavía. Las conexiones las gestiona el equipo de D&C con los programadores del cliente — el cliente no las configura desde el portal.");
  }

  // ===== Assets cargados (branding) =====
  const branding = (client.onboarding?.brandingFiles ?? []) as Array<unknown>;
  if (Array.isArray(branding) && branding.length > 0) {
    lines.push("");
    lines.push("## Assets de marca cargados");
    const names = branding
      .map((f) => (typeof f === "string" ? f : ((f as { name?: string })?.name ?? "")))
      .filter(Boolean);
    for (const n of names.slice(0, 12)) {
      lines.push(`- ${n}`);
    }
    if (names.length > 12) {
      lines.push(`- … y ${names.length - 12} más`);
    }
  }

  // ===== Pagos =====
  if (payments.length > 0) {
    lines.push("");
    lines.push("## Estado de pagos (últimos 6 meses)");
    for (const p of payments) {
      lines.push(`- ${p.month}: ${p.status}${p.paid_date ? ` (pagado el ${p.paid_date.slice(0, 10)})` : ""}`);
    }
  }

  // ===== Dev tasks (solo si type=dev) =====
  if (devTasks.length > 0) {
    lines.push("");
    lines.push("## Tareas de desarrollo activas");
    for (const t of devTasks) {
      const sprint = t.sprint ? ` · sprint ${t.sprint}` : "";
      const due = t.due_date ? ` · due ${t.due_date}` : "";
      lines.push(`- [${t.priority}] ${t.title} · ${t.status}${sprint}${due}`);
    }
  }

  return lines.join("\n");
}

function extractSummary(markdown: string | null): string {
  if (!markdown) return "";
  const match = markdown.match(
    /##\s*Resumen ejecutivo\s*\n([\s\S]*?)(?=\n##\s+|$)/i,
  );
  if (match && match[1]) return match[1].trim();
  return markdown.trim().slice(0, 600);
}

/**
 * Hash de la "data state" del cliente para detectar si el cache
 * del welcome quedó stale. Cubre todas las fuentes que influyen en
 * la respuesta del consultor.
 */
export function computeDataSignature(bundle: ClientContextBundle): string {
  const payload = JSON.stringify({
    kpis: bundle.client.kpis ?? {},
    phase: bundle.client.phase,
    modules: bundle.client.modules ?? {},
    reports: bundle.phaseReports.map((r) => `${r.phase}:${r.status}:${r.approved_at ?? ""}`),
    eventsCount: bundle.events.length,
    requestsLastUpdate: bundle.requests.at(0)?.submitted_at ?? null,
    requestsCount: bundle.requests.length,
    contentCount: bundle.content.length,
    integrations: bundle.integrations.map((i) => i.key).sort(),
    objectives: bundle.objectives?.items?.map((i) => `${i.name}:${i.pct}`) ?? [],
    devTasksCount: bundle.devTasks.length,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}
