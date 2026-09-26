/**
 * Contexto extra del asesor del PORTAL para que pueda recomendar (no solo
 * resumir): rendimiento de campañas de Meta, lo que publica la competencia
 * y los aprendizajes de la cuenta. Lo usan /api/portal/consultant (chat +
 * welcome) y el job de oportunidades (/api/cron/portal-opportunities).
 *
 * Reglas de lo que llega al cliente:
 *   - Campañas: solo resultados, CTR y ROAS — nunca inversión ni costos
 *     (decisión de Gian, igual que /api/portal/campaigns).
 *   - Aprendizajes: solo kind='learning' (las preference/constraint/
 *     past_decision pueden ser notas internas del equipo).
 * Todo es tolerante a tablas que falten (migraciones sin correr → vacío).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

export interface CampaignInsight {
  name: string;
  active: boolean;
  resultType: string | null;
  results7: number;
  results30: number;
  ctr30: number | null;
  roas30: number | null;
  /** Resultados por cada 1.000 impresiones: comparable sin mostrar costos. */
  resultsPerK30: number | null;
}

export interface CompetitorInsight {
  competitor: string;
  platform: string | null;
  format: string | null;
  hook: string | null;
  notes: string | null;
  captured_at: string | null;
}

export interface PortalInsights {
  campaigns: CampaignInsight[];
  campaignsUpdatedTo: string | null;
  competitors: CompetitorInsight[];
  learnings: string[];
}

const n = (v: unknown) => {
  const x = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : 0;
  return Number.isFinite(x) ? x : 0;
};

export async function loadPortalInsights(
  admin: SupabaseClient,
  clientId: string,
): Promise<PortalInsights> {
  const since = new Date();
  since.setDate(since.getDate() - 31);

  const [camp, comp, mem] = await Promise.all([
    admin
      .from("meta_campaigns_daily")
      .select("date, campaign_id, campaign_name, effective_status, impressions, clicks, results, result_type, spend, conversion_value")
      .eq("client_id", clientId)
      .gte("date", since.toISOString().slice(0, 10))
      .order("date", { ascending: false }),
    admin
      .from("competitor_pieces")
      .select("competitor, platform, format, hook, notes, captured_at")
      .eq("client", clientId)
      .eq("archived", false)
      .order("captured_at", { ascending: false })
      .limit(15),
    admin
      .from("consultant_memory_v2")
      .select("content, importance, created_at")
      .eq("scope_type", "client")
      .eq("client_id", clientId)
      .eq("kind", "learning")
      .or("expires_at.is.null,expires_at.gt.now()")
      .order("importance", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  // ---- Campañas: agregado 7 / 30 días por campaña ----
  const rows = (camp.error ? [] : camp.data ?? []) as Array<Record<string, unknown>>;
  const updatedTo = (rows[0]?.date as string | undefined) ?? null;
  const campaigns: CampaignInsight[] = [];
  if (updatedTo) {
    const d7 = new Date(`${updatedTo}T00:00:00Z`);
    d7.setUTCDate(d7.getUTCDate() - 6);
    const since7 = d7.toISOString().slice(0, 10);
    const by = new Map<
      string,
      { name: string; status: string | null; type: string | null; r7: number; r30: number; imp: number; clk: number; spend: number; value: number }
    >();
    for (const r of rows) {
      const id = r.campaign_id as string;
      let a = by.get(id);
      if (!a) {
        a = { name: (r.campaign_name as string) || "Campaña", status: (r.effective_status as string) ?? null, type: null, r7: 0, r30: 0, imp: 0, clk: 0, spend: 0, value: 0 };
        by.set(id, a);
      }
      if (!a.type && r.result_type) a.type = r.result_type as string;
      const res = n(r.results);
      a.r30 += res;
      if ((r.date as string) >= since7) a.r7 += res;
      a.imp += n(r.impressions);
      a.clk += n(r.clicks);
      a.spend += n(r.spend);
      a.value += n(r.conversion_value);
    }
    for (const a of by.values()) {
      if (a.status !== "ACTIVE" && a.imp === 0) continue;
      campaigns.push({
        name: a.name,
        active: a.status === "ACTIVE",
        resultType: a.type,
        results7: Math.round(a.r7),
        results30: Math.round(a.r30),
        ctr30: a.imp > 0 ? a.clk / a.imp : null,
        roas30: a.spend > 0 && a.value > 0 ? a.value / a.spend : null,
        resultsPerK30: a.imp > 0 ? (a.r30 / a.imp) * 1000 : null,
      });
    }
    campaigns.sort((x, y) => Number(y.active) - Number(x.active) || y.results30 - x.results30);
  }

  return {
    campaigns: campaigns.slice(0, 12),
    campaignsUpdatedTo: updatedTo,
    competitors: (comp.error ? [] : comp.data ?? []) as CompetitorInsight[],
    learnings: ((mem.error ? [] : mem.data ?? []) as Array<{ content: string }>).map((m) => m.content),
  };
}

export function buildPortalInsightsBlock(ins: PortalInsights): string {
  const lines: string[] = ["DATOS PARA RECOMENDAR (reales — citá el dato cuando recomiendes):"];

  lines.push("");
  lines.push("## Campañas de Meta (últimos 30 días)");
  if (ins.campaigns.length === 0) {
    lines.push("- Todavía no hay datos de campañas conectados.");
  } else {
    lines.push(`Datos hasta ${ins.campaignsUpdatedTo}. Sin inversión ni costos: no los tenés y no los des.`);
    for (const c of ins.campaigns) {
      const type = c.resultType ?? "resultados";
      const parts = [
        `${c.results7} ${type} en 7 días`,
        `${c.results30} en 30 días`,
        c.ctr30 != null ? `CTR ${(c.ctr30 * 100).toFixed(2)}%` : null,
        c.resultsPerK30 != null ? `${c.resultsPerK30.toFixed(2)} ${type} cada 1.000 impresiones` : null,
        c.roas30 != null ? `ROAS ${c.roas30.toFixed(1)}x` : null,
      ].filter(Boolean);
      lines.push(`- ${c.name} (${c.active ? "activa" : "pausada/terminada"}): ${parts.join(" · ")}`);
    }
  }

  lines.push("");
  lines.push("## Lo que publica la competencia (relevado por el equipo)");
  if (ins.competitors.length === 0) {
    lines.push("- Sin relevamiento de competencia cargado.");
  } else {
    for (const c of ins.competitors) {
      const bits = [c.platform, c.format].filter(Boolean).join(" · ");
      const hook = c.hook ? ` — "${c.hook.slice(0, 140)}"` : "";
      const notes = c.notes ? ` (${c.notes.slice(0, 120)})` : "";
      lines.push(`- ${c.competitor}${bits ? ` [${bits}]` : ""}${hook}${notes}`);
    }
  }

  if (ins.learnings.length > 0) {
    lines.push("");
    lines.push("## Aprendizajes de la cuenta");
    for (const l of ins.learnings) lines.push(`- ${l.slice(0, 240)}`);
  }

  return lines.join("\n");
}

/** Firma para invalidar el cache del welcome cuando cambian estos datos. */
export function portalInsightsSignature(ins: PortalInsights): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        c: ins.campaigns.map((c) => `${c.name}:${c.active}:${c.results7}:${c.results30}`),
        u: ins.campaignsUpdatedTo,
        k: ins.competitors.map((c) => `${c.competitor}:${c.captured_at}`),
        l: ins.learnings.length,
      }),
    )
    .digest("hex")
    .slice(0, 12);
}
