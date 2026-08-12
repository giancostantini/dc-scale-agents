/**
 * POST /api/cron/budget-recommendations — Stage 6 · Recomendaciones de
 * presupuesto de ads (SIEMPRE YELLOW — jamás ejecuta cambios)
 *
 * Semanal (workflow "Autonomy Review"). Para cada cliente con ingestión de
 * pauta activa (paid_media_daily con datos):
 *   1. Señales DETERMINISTAS: últimos 28 días vs los 28 anteriores —
 *      spend, conversiones, CPA, ROAS y sus deltas.
 *   2. Sonnet redacta la recomendación SOBRE esas señales (redistribuir,
 *      escalar, frenar, qué no tocar) — nunca inventa números.
 *   3. Se guarda como agent_output (dedup por semana) + notificación.
 *
 * El push de cambios de presupuesto sigue siendo 100% humano
 * (/api/meta/push-campaign) — regla del roadmap: "cambios de presupuesto
 * sin humano: JAMÁS dentro de este roadmap".
 *
 * Sin datos de Insights → ok configured:false (dormida, no rota).
 * Auth: header `x-internal-secret` = CRON_SECRET.
 */

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireInternalSecret } from "@/lib/auth-guard";
import { CLAUDE_MODEL_SONNET } from "@/lib/anthropic-model";
import { recordApiUsage } from "@/lib/api-usage";
import { todayUY } from "@/lib/tesoreria";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
}

interface WindowAgg {
  days: number;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  value: number;
  cpa: number | null;
  roas: number | null;
}

function aggregate(rows: { date: string; spend: unknown; impressions: unknown; clicks: unknown; conversions: unknown; conversion_value: unknown }[]): WindowAgg {
  const agg = rows.reduce(
    (s, r) => ({
      spend: s.spend + num(r.spend),
      impressions: s.impressions + num(r.impressions),
      clicks: s.clicks + num(r.clicks),
      conversions: s.conversions + num(r.conversions),
      value: s.value + num(r.conversion_value),
    }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0, value: 0 },
  );
  return {
    days: rows.length,
    ...agg,
    spend: Math.round(agg.spend * 100) / 100,
    cpa: agg.conversions > 0 ? Math.round((agg.spend / agg.conversions) * 100) / 100 : null,
    roas: agg.spend > 0 && agg.value > 0 ? Math.round((agg.value / agg.spend) * 100) / 100 : null,
  };
}

const SYSTEM = `Sos el analista de paid media de D&C Scale Partners. Redactás la RECOMENDACIÓN SEMANAL de presupuesto de un cliente para los directores. Tono rioplatense directo.

Reglas absolutas:
- Usá SOLO los números del JSON de señales (28 días recientes vs 28 anteriores). Si un dato no está, no lo inventes.
- Sos una recomendación, NUNCA una orden ejecutada: los cambios de presupuesto los pushea un humano. Cerrá siempre con "Para aplicar: revisar y pushear manualmente".
- Estructura (markdown, sin título): 1) lectura en 2 líneas (mejoró/empeoró y por qué métrica), 2) 2-4 recomendaciones concretas con montos o % (escalar/frenar/redistribuir/testear), 3) qué NO tocar y por qué, 4) el cierre obligatorio.
- Máximo ~200 palabras.`;

export async function POST(req: NextRequest) {
  const guard = requireInternalSecret(req);
  if (!guard.ok) return guard.response;

  const supabase = getSupabaseAdmin();
  const today = todayUY();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, meta_ad_account_id")
    .not("meta_ad_account_id", "is", null);

  const configured = (clients ?? []).filter((c) => (c.meta_ad_account_id ?? "").trim());
  if (configured.length === 0) {
    return Response.json({
      ok: true,
      configured: false,
      detail: "Ningún cliente con ingestión de pauta — sin datos para recomendar.",
    });
  }

  // Semana ISO-ish para dedup (una recomendación por cliente por semana).
  const week = `${today.slice(0, 4)}-W${String(
    Math.ceil(
      (Date.parse(today) - Date.parse(`${today.slice(0, 4)}-01-01`)) / 604800000,
    ),
  ).padStart(2, "0")}`;

  const results: { client: string; status: string }[] = [];

  for (const client of configured) {
    try {
      const { data: rows } = await supabase
        .from("paid_media_daily")
        .select("date, spend, impressions, clicks, conversions, conversion_value")
        .eq("client_id", client.id)
        .eq("platform", "meta")
        .order("date", { ascending: false })
        .limit(56);

      const recent = (rows ?? []).slice(0, 28);
      const prior = (rows ?? []).slice(28, 56);
      if (recent.length < 14) {
        results.push({ client: client.id, status: "skip: <14 días de datos" });
        continue;
      }

      const signals = {
        cliente: client.name,
        ventana_reciente_28d: aggregate(recent),
        ventana_anterior_28d: prior.length >= 7 ? aggregate(prior) : null,
      };

      const anthropic = new Anthropic();
      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL_SONNET,
        max_tokens: 800,
        system: [{ type: "text", text: SYSTEM }],
        messages: [
          { role: "user", content: `Señales deterministas:\n${JSON.stringify(signals, null, 2)}` },
        ],
      });
      const block = response.content.find((b) => b.type === "text");
      const bodyMd = block && block.type === "text" ? block.text.trim() : null;
      await recordApiUsage({
        source: "cron:budget-recommendations",
        clientId: client.id,
        model: response.model,
        usage: response.usage,
      });
      if (!bodyMd) {
        results.push({ client: client.id, status: "error: respuesta vacía" });
        continue;
      }

      await supabase.from("agent_outputs").upsert(
        {
          run_id: null,
          client: client.id,
          agent: "budget-recommendations",
          output_type: "recommendation",
          title: `Recomendación de presupuesto — semana ${week}`,
          body_md: bodyMd,
          structured: signals as unknown,
          dedup_key: `budget-rec-${client.id}-${week}`,
        },
        { onConflict: "dedup_key", ignoreDuplicates: true },
      );

      await supabase.from("notifications").upsert(
        {
          client: client.id,
          agent: "budget-recommendations",
          level: "info",
          title: `Recomendación de presupuesto: ${client.name}`,
          body: `${bodyMd.slice(0, 300)}…\n\n(YELLOW: es una recomendación — aplicar cambios es siempre manual.)`,
          link: `/cliente/${client.id}`,
          to_role: "director",
          email_sent: false,
          dedup_key: `budget-rec-notif-${client.id}-${week}`,
        },
        { onConflict: "dedup_key", ignoreDuplicates: true },
      );

      results.push({ client: client.id, status: "ok" });
    } catch (err) {
      results.push({
        client: client.id,
        status: `error: ${err instanceof Error ? err.message : "?"}`,
      });
    }
  }

  return Response.json({ ok: true, configured: true, week, clients: results });
}
