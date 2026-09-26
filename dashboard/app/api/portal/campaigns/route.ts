/**
 * GET /api/portal/campaigns
 *
 * Campañas de Meta del cliente del portal: cuáles están corriendo y cómo
 * rinden en los últimos 7 días y en el mes. Lee meta_campaigns_daily (mig
 * 106, la llena /api/cron/meta-insights) con service role.
 *
 * Decisión de Gian (2026-09-26): el cliente ve SOLO resultados. Nunca se
 * devuelven inversión, CPC ni costo por resultado — el filtro es acá, en el
 * server (la tabla no tiene policy para role='client').
 *
 * Response: {
 *   updatedTo: "YYYY-MM-DD" | null,   // último día con datos
 *   campaigns: [{ id, name, status, active, objective, resultType,
 *                 last7: Metrics, month: Metrics }]
 * }
 * Metrics = { results, impressions, clicks, ctr, roas }
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

interface Row {
  date: string;
  campaign_id: string;
  campaign_name: string;
  effective_status: string | null;
  objective: string | null;
  spend: number | string;
  impressions: number | string;
  clicks: number | string;
  results: number | string | null;
  result_type: string | null;
  conversion_value: number | string | null;
}

interface Acc {
  results: number;
  impressions: number;
  clicks: number;
  value: number;
  spend: number;
}

const n = (v: unknown) => {
  const x = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : 0;
  return Number.isFinite(x) ? x : 0;
};

function empty(): Acc {
  return { results: 0, impressions: 0, clicks: 0, value: 0, spend: 0 };
}

function add(a: Acc, r: Row) {
  a.results += n(r.results);
  a.impressions += n(r.impressions);
  a.clicks += n(r.clicks);
  a.value += n(r.conversion_value);
  a.spend += n(r.spend);
}

/** Solo lo que el cliente puede ver: sin spend. El ROAS es un ratio. */
function publicMetrics(a: Acc) {
  return {
    results: Math.round(a.results),
    impressions: Math.round(a.impressions),
    clicks: Math.round(a.clicks),
    ctr: a.impressions > 0 ? a.clicks / a.impressions : null,
    roas: a.spend > 0 && a.value > 0 ? a.value / a.spend : null,
  };
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Activa",
  PAUSED: "Pausada",
  CAMPAIGN_PAUSED: "Pausada",
  ADSET_PAUSED: "Pausada",
  IN_PROCESS: "En revisión",
  WITH_ISSUES: "Con problemas",
  PENDING_REVIEW: "En revisión",
  DISAPPROVED: "Rechazada",
  ARCHIVED: "Finalizada",
  DELETED: "Finalizada",
};

export async function GET(req: NextRequest) {
  const access = await requireRole(req, ["client"]);
  if (!access.ok) return access.response;

  const admin = getSupabaseAdmin();
  const { data: profile } = await admin
    .from("profiles")
    .select("client_id")
    .eq("id", access.userId)
    .maybeSingle();
  const clientId = profile?.client_id as string | null;
  if (!clientId) {
    return Response.json({ error: "Tu cuenta no está vinculada a una empresa." }, { status: 403 });
  }

  // Ventana: mes en curso y 7 días (lo más largo de los dos, ~31 días).
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 35);
  const { data, error } = await admin
    .from("meta_campaigns_daily")
    .select(
      "date, campaign_id, campaign_name, effective_status, objective, spend, impressions, clicks, results, result_type, conversion_value",
    )
    .eq("client_id", clientId)
    .gte("date", from.toISOString().slice(0, 10))
    .order("date", { ascending: false });

  if (error) {
    // Sin la migración 106 la tabla no existe: el portal muestra "sin datos".
    return Response.json({ updatedTo: null, campaigns: [] });
  }

  const rows = (data ?? []) as Row[];
  const updatedTo = rows[0]?.date ?? null;
  if (!updatedTo) return Response.json({ updatedTo: null, campaigns: [] });

  const last7From = new Date(`${updatedTo}T00:00:00Z`);
  last7From.setUTCDate(last7From.getUTCDate() - 6);
  const last7Iso = last7From.toISOString().slice(0, 10);
  const monthIso = `${updatedTo.slice(0, 7)}-01`;

  const byCampaign = new Map<
    string,
    { row: Row; last7: Acc; month: Acc; resultType: string | null }
  >();
  for (const r of rows) {
    let c = byCampaign.get(r.campaign_id);
    if (!c) {
      // rows vienen de más nuevo a más viejo → la primera es el estado actual.
      c = { row: r, last7: empty(), month: empty(), resultType: null };
      byCampaign.set(r.campaign_id, c);
    }
    if (!c.resultType && r.result_type) c.resultType = r.result_type;
    if (r.date >= last7Iso) add(c.last7, r);
    if (r.date >= monthIso) add(c.month, r);
  }

  const campaigns = [...byCampaign.entries()]
    .map(([id, c]) => {
      const status = c.row.effective_status ?? "";
      return {
        id,
        name: c.row.campaign_name || "Campaña sin nombre",
        status: STATUS_LABEL[status] ?? "Sin datos",
        active: status === "ACTIVE",
        objective: c.row.objective,
        resultType: c.resultType,
        last7: publicMetrics(c.last7),
        month: publicMetrics(c.month),
      };
    })
    // Sin actividad en el mes y no activa → no suma nada al cliente.
    .filter((c) => c.active || c.month.impressions > 0)
    .sort((a, b) => Number(b.active) - Number(a.active) || b.month.results - a.month.results);

  return Response.json({ updatedTo, campaigns });
}
