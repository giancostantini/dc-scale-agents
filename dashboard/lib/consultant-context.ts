/**
 * Helpers para armar el bloque de contexto del Consultor IA del portal.
 * Lo usan tanto /api/portal/consultant (chat) como
 * /api/portal/consultant/welcome (mensaje inicial cacheado).
 *
 * Convención: SOLO data que el cliente puede ver. NO leer notes internas,
 * leads, prospect campaigns, payments del team, etc.
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

export interface ClientContextBundle {
  client: ClientForContext;
  objectives: ObjectivesForContext | null;
  phaseReports: PhaseReportForContext[];
  prodCampaigns: ProdCampaignForContext[];
  events: EventForContext[];
  payments: PaymentForContext[];
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
  ] = await Promise.all([
    admin
      .from("clients")
      .select("id, name, sector, type, phase, method, fee, kpis, modules")
      .eq("id", clientId)
      .maybeSingle(),
    admin
      .from("objectives")
      .select("period, period_type, items")
      .eq("client_id", clientId)
      .maybeSingle(),
    admin
      .from("phase_reports")
      .select("phase, status, content_md, approved_at")
      .eq("client_id", clientId)
      .eq("status", "approved"),
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
  ]);

  if (!client) return null;

  return {
    client: client as ClientForContext,
    objectives: objectives as ObjectivesForContext | null,
    phaseReports: (phaseReports ?? []) as PhaseReportForContext[],
    prodCampaigns: (prodCampaigns ?? []) as ProdCampaignForContext[],
    events: (events ?? []) as EventForContext[],
    payments: (payments ?? []) as PaymentForContext[],
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
 * de Claude. Igual de detallado para chat y welcome.
 */
export function buildClientContextBlock(bundle: ClientContextBundle): string {
  const { client, objectives, phaseReports, prodCampaigns, events, payments } = bundle;
  const lines: string[] = ["CONTEXTO DEL CLIENTE (datos reales — usá esto, no inventes):"];

  lines.push("");
  lines.push("## Cliente");
  lines.push(`- Nombre: ${client.name}`);
  if (client.sector) lines.push(`- Sector: ${client.sector}`);
  if (client.method) lines.push(`- Método: ${client.method}`);
  if (client.phase) lines.push(`- Fase actual: ${client.phase}`);

  if (client.kpis && Object.keys(client.kpis).length > 0) {
    lines.push("");
    lines.push("## KPIs del mes actual");
    for (const [k, v] of Object.entries(client.kpis)) {
      lines.push(`- ${k}: ${v ?? "—"}`);
    }
  }

  if (objectives && objectives.items?.length > 0) {
    lines.push("");
    lines.push(`## Objetivos · ${objectives.period}`);
    for (const o of objectives.items) {
      lines.push(`- ${o.name}: ${o.now}${o.unit} / ${o.target}${o.unit} (${o.pct}%)`);
    }
  }

  if (phaseReports.length > 0) {
    lines.push("");
    lines.push("## Reportes aprobados (resumen ejecutivo de cada uno)");
    for (const r of phaseReports) {
      lines.push("");
      lines.push(`### ${r.phase}`);
      const summary = extractSummary(r.content_md);
      lines.push(summary || "(sin resumen)");
    }
  }

  if (prodCampaigns.length > 0) {
    lines.push("");
    lines.push("## Campañas de producción");
    for (const c of prodCampaigns) {
      const period = [c.start_date, c.end_date].filter(Boolean).join(" → ");
      lines.push(`- ${c.title} (${c.type}) · ${c.status}${period ? ` · ${period}` : ""}`);
    }
  }

  if (events.length > 0) {
    lines.push("");
    lines.push("## Próximas reuniones");
    for (const e of events) {
      lines.push(`- ${e.date}${e.time ? ` ${e.time}` : ""} · ${e.title} (${e.type})`);
    }
  }

  if (payments.length > 0) {
    lines.push("");
    lines.push("## Estado de pagos (últimos 6 meses)");
    for (const p of payments) {
      lines.push(`- ${p.month}: ${p.status}${p.paid_date ? ` (pagado el ${p.paid_date.slice(0, 10)})` : ""}`);
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
 * del welcome quedó stale. Si cambia KPIs, count de reports
 * approved, o count de eventos próximos, regeneramos.
 *
 * No incluímos el contenido completo de phase_reports porque
 * son largos — el count + approved_at más reciente alcanza para
 * detectar novedad real.
 */
export function computeDataSignature(bundle: ClientContextBundle): string {
  const payload = JSON.stringify({
    kpis: bundle.client.kpis ?? {},
    phase: bundle.client.phase,
    reportsCount: bundle.phaseReports.length,
    lastReportApprovedAt: bundle.phaseReports
      .map((r) => r.approved_at)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null,
    eventsCount: bundle.events.length,
    objectives: bundle.objectives?.items?.map((i) => `${i.name}:${i.pct}`) ?? [],
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}
