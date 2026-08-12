/**
 * POST /api/cron/meta-insights — Stage 2a · Ingestión de métricas Meta
 *
 * Corre 1×/día (workflow "Meta Insights") y trae las métricas de pauta de
 * AYER para cada cliente con `meta_ad_account_id` configurado, usando el
 * token de agencia (System User del Business Manager):
 *
 *   env META_SYSTEM_USER_TOKEN — permisos ads_read + read_insights.
 *
 * Escribe paid_media_daily (upsert idempotente por cliente+día+plataforma)
 * y refresca clients.kpis.paid_media.meta con el acumulado del mes, así el
 * dashboard existente muestra datos vivos sin tocar la UI.
 *
 * Sin token o sin clientes configurados → responde ok con configured:false
 * (no es un error: la infraestructura queda lista y se enchufa después).
 * Token inválido/vencido → notificación error al director (máx 1/día).
 *
 * Body opcional: { since: "YYYY-MM-DD", until: "YYYY-MM-DD" } para backfill
 * (máx 31 días por corrida).
 *
 * Auth: header `x-internal-secret` = CRON_SECRET.
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireInternalSecret } from "@/lib/auth-guard";
import { todayUY } from "@/lib/tesoreria";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const GRAPH = "https://graph.facebook.com/v21.0";

interface InsightRow {
  date_start: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  actions?: { action_type: string; value: string }[];
  action_values?: { action_type: string; value: string }[];
  purchase_roas?: { action_type: string; value: string }[];
}

function num(v: string | number | null | undefined): number {
  const n = typeof v === "string" ? parseFloat(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Suma la primera action que matchee (Meta duplica purchase/omni_purchase). */
function actionValue(
  list: { action_type: string; value: string }[] | undefined,
  types: string[],
): number {
  if (!list) return 0;
  for (const t of types) {
    const hit = list.find((a) => a.action_type === t);
    if (hit) return num(hit.value);
  }
  return 0;
}

function mapInsight(row: InsightRow) {
  const purchases = actionValue(row.actions, ["omni_purchase", "purchase"]);
  const leads = actionValue(row.actions, ["lead", "onsite_conversion.lead_grouped"]);
  const conversions = purchases > 0 ? purchases : leads;
  const conversionValue = actionValue(row.action_values, ["omni_purchase", "purchase"]);
  const spend = num(row.spend);
  const roas =
    row.purchase_roas?.[0]?.value != null
      ? num(row.purchase_roas[0].value)
      : conversionValue > 0 && spend > 0
        ? conversionValue / spend
        : null;
  return {
    spend,
    impressions: Math.round(num(row.impressions)),
    clicks: Math.round(num(row.clicks)),
    ctr: row.ctr != null ? num(row.ctr) : null,
    cpc: row.cpc != null ? num(row.cpc) : null,
    cpm: row.cpm != null ? num(row.cpm) : null,
    conversions: conversions || null,
    conversion_value: conversionValue || null,
    roas,
  };
}

/** Ayer en hora Uruguay (el día completo más reciente). */
function yesterdayUY(): string {
  const today = todayUY();
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const guard = requireInternalSecret(req);
  if (!guard.ok) return guard.response;

  const token = process.env.META_SYSTEM_USER_TOKEN?.trim();
  const supabase = getSupabaseAdmin();

  let since = yesterdayUY();
  let until = since;
  try {
    const body = (await req.json()) as { since?: string; until?: string };
    if (body?.since && /^\d{4}-\d{2}-\d{2}$/.test(body.since)) since = body.since;
    if (body?.until && /^\d{4}-\d{2}-\d{2}$/.test(body.until)) until = body.until;
  } catch {
    // sin body → ayer
  }
  const rangeDays =
    (Date.parse(`${until}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`)) / 86400000 + 1;
  if (rangeDays < 1 || rangeDays > 31) {
    return Response.json({ error: "Rango inválido (máx 31 días)." }, { status: 400 });
  }

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, meta_ad_account_id, kpis")
    .not("meta_ad_account_id", "is", null);

  const configured = (clients ?? []).filter((c) => (c.meta_ad_account_id ?? "").trim());

  if (!token || configured.length === 0) {
    return Response.json({
      ok: true,
      configured: false,
      detail: !token
        ? "META_SYSTEM_USER_TOKEN no está seteado en Vercel — la ingestión queda dormida."
        : "Ningún cliente tiene meta_ad_account_id cargado.",
    });
  }

  const results: { client: string; days: number; error?: string }[] = [];
  let tokenBroken = false;

  for (const client of configured) {
    const account = client.meta_ad_account_id!.trim();
    const actId = account.startsWith("act_") ? account : `act_${account}`;
    try {
      const params = new URLSearchParams({
        level: "account",
        time_increment: "1",
        time_range: JSON.stringify({ since, until }),
        fields:
          "spend,impressions,clicks,ctr,cpc,cpm,actions,action_values,purchase_roas",
        access_token: token,
      });
      const res = await fetch(`${GRAPH}/${actId}/insights?${params.toString()}`, {
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      });
      const json = (await res.json()) as {
        data?: InsightRow[];
        error?: { message: string; code: number };
      };
      if (json.error) {
        // 190 = token inválido/vencido — es global, no del cliente.
        if (json.error.code === 190) tokenBroken = true;
        throw new Error(`Meta API ${json.error.code}: ${json.error.message}`);
      }

      const rows = (json.data ?? []).map((r) => ({
        client_id: client.id,
        date: r.date_start,
        platform: "meta",
        raw: r as unknown,
        ...mapInsight(r),
      }));

      if (rows.length > 0) {
        const { error: upsertErr } = await supabase
          .from("paid_media_daily")
          .upsert(rows, { onConflict: "client_id,date,platform" });
        if (upsertErr) throw new Error(`upsert: ${upsertErr.message}`);
      }

      // ---- Refrescar snapshot mensual en kpis.paid_media.meta ----
      const monthStart = `${until.slice(0, 7)}-01`;
      const { data: monthRows } = await supabase
        .from("paid_media_daily")
        .select("spend, impressions, clicks, conversions, conversion_value")
        .eq("client_id", client.id)
        .eq("platform", "meta")
        .gte("date", monthStart)
        .lte("date", until);
      const agg = (monthRows ?? []).reduce(
        (s, r) => ({
          spend: s.spend + num(r.spend as unknown as string),
          impressions: s.impressions + num(r.impressions as unknown as string),
          clicks: s.clicks + num(r.clicks as unknown as string),
          conversions: s.conversions + num(r.conversions as unknown as string),
          value: s.value + num(r.conversion_value as unknown as string),
        }),
        { spend: 0, impressions: 0, clicks: 0, conversions: 0, value: 0 },
      );
      const kpis = (client.kpis ?? {}) as Record<string, unknown>;
      const paidMedia = (kpis.paid_media ?? {}) as Record<string, unknown>;
      paidMedia.meta = {
        spent: Math.round(agg.spend * 100) / 100,
        impressions: agg.impressions,
        clicks: agg.clicks,
        ctr: agg.impressions > 0 ? agg.clicks / agg.impressions : undefined,
        cpc: agg.clicks > 0 ? agg.spend / agg.clicks : undefined,
        cpm: agg.impressions > 0 ? (agg.spend / agg.impressions) * 1000 : undefined,
        conversions: agg.conversions || undefined,
        cpa: agg.conversions > 0 ? agg.spend / agg.conversions : undefined,
        roas: agg.spend > 0 && agg.value > 0 ? agg.value / agg.spend : undefined,
        notes: "auto · Meta Insights (mes a la fecha)",
      };
      paidMedia.updated_at = new Date().toISOString();
      kpis.paid_media = paidMedia;
      await supabase.from("clients").update({ kpis }).eq("id", client.id);

      results.push({ client: client.id, days: rows.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      console.error(`[meta-insights] ${client.id}:`, message);
      results.push({ client: client.id, days: 0, error: message });
    }
  }

  // ---- Token roto → avisar al director (1×/día) ----
  if (tokenBroken) {
    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("agent", "meta-insights")
      .gte("created_at", todayUY())
      .limit(1);
    if (!existing || existing.length === 0) {
      await supabase.from("notifications").insert({
        client: null,
        agent: "meta-insights",
        level: "error",
        title: "Token de Meta inválido o vencido",
        body: "La ingestión de métricas de pauta no puede leer la API de Meta (error 190). Regenerá el token del System User en Business Settings y actualizá META_SYSTEM_USER_TOKEN en Vercel.",
        link: "/finanzas",
        to_role: "director",
        email_sent: false,
      });
    }
  }

  const failed = results.filter((r) => r.error).length;
  return Response.json({
    ok: true,
    configured: true,
    since,
    until,
    clients: results,
    failed,
  });
}
