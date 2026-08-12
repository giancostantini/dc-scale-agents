/**
 * POST /api/cron/organic-insights — Stage 2b · Ingestión orgánica de IG
 *
 * Corre 1×/día (workflow "Organic Insights") y para cada cliente con
 * `meta_ig_user_id`:
 *   1. Trae la media reciente del IG business account (últimos ~25 posts:
 *      caption, fecha, tipo, permalink, likes, comments).
 *   2. Pide los insights de cada media (reach, saved, shares, views — lo
 *      que el tipo soporte; si un metric no aplica, cae a reach solo).
 *   3. Upsert en organic_posts (idempotente por media_id).
 *   4. Matcher determinístico contra content_posts del planner (network
 *      'ig', fecha ±2 días, sin match previo) → copia las métricas a
 *      content_posts.metrics. Eso es lo que social-media-metrics lee como
 *      FUENTE DURA para elegir winners reales.
 *
 * Token: el mismo de agencia (META_SYSTEM_USER_TOKEN) con permisos
 * pages_read_engagement + instagram_basic + instagram_manage_insights.
 * Sin token o sin clientes → ok configured:false (dormida, no rota).
 *
 * Auth: header `x-internal-secret` = CRON_SECRET.
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireInternalSecret } from "@/lib/auth-guard";
import { todayUY } from "@/lib/tesoreria";
import { emitEvent, processEvents } from "@/lib/events";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const GRAPH = "https://graph.facebook.com/v21.0";
const MEDIA_LIMIT = 25;

interface MediaItem {
  id: string;
  caption?: string;
  timestamp?: string;
  media_type?: string;
  permalink?: string;
  like_count?: number;
  comments_count?: number;
}

interface MetaError {
  message: string;
  code: number;
}

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
}

/** Insights de una media. Si el set completo falla (metric no soportado
 *  por el tipo), reintenta con reach solo. Nunca lanza. */
async function fetchMediaInsights(
  mediaId: string,
  token: string,
): Promise<Record<string, number> | null> {
  for (const metricSet of ["reach,saved,shares,views", "reach"]) {
    try {
      const res = await fetch(
        `${GRAPH}/${mediaId}/insights?metric=${metricSet}&access_token=${encodeURIComponent(token)}`,
        { signal: AbortSignal.timeout(15_000), cache: "no-store" },
      );
      const json = (await res.json()) as {
        data?: { name: string; values?: { value: number }[] }[];
        error?: MetaError;
      };
      if (json.error) {
        if (json.error.code === 190) throw new TokenError(json.error.message);
        continue; // probar el set reducido
      }
      const out: Record<string, number> = {};
      for (const m of json.data ?? []) {
        out[m.name] = num(m.values?.[0]?.value);
      }
      return out;
    } catch (err) {
      if (err instanceof TokenError) throw err;
      // timeout / red → probar set reducido o rendirse en silencio
    }
  }
  return null;
}

class TokenError extends Error {}

export async function POST(req: NextRequest) {
  const guard = requireInternalSecret(req);
  if (!guard.ok) return guard.response;

  const token = process.env.META_SYSTEM_USER_TOKEN?.trim();
  const supabase = getSupabaseAdmin();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, meta_ig_user_id")
    .not("meta_ig_user_id", "is", null);

  const configured = (clients ?? []).filter((c) => (c.meta_ig_user_id ?? "").trim());

  if (!token || configured.length === 0) {
    return Response.json({
      ok: true,
      configured: false,
      detail: !token
        ? "META_SYSTEM_USER_TOKEN no está seteado — la ingestión orgánica queda dormida."
        : "Ningún cliente tiene meta_ig_user_id cargado.",
    });
  }

  const results: { client: string; media: number; matched: number; error?: string }[] = [];
  let tokenBroken = false;

  for (const client of configured) {
    try {
      // ---- 1. Media reciente ----
      const params = new URLSearchParams({
        fields: "id,caption,timestamp,media_type,permalink,like_count,comments_count",
        limit: String(MEDIA_LIMIT),
        access_token: token,
      });
      const res = await fetch(
        `${GRAPH}/${client.meta_ig_user_id!.trim()}/media?${params.toString()}`,
        { signal: AbortSignal.timeout(20_000), cache: "no-store" },
      );
      const json = (await res.json()) as { data?: MediaItem[]; error?: MetaError };
      if (json.error) {
        if (json.error.code === 190) tokenBroken = true;
        throw new Error(`Meta API ${json.error.code}: ${json.error.message}`);
      }
      const media = json.data ?? [];

      // ---- 2. Insights por media + upsert ----
      const rows = [];
      for (const m of media) {
        let insights: Record<string, number> | null = null;
        try {
          insights = await fetchMediaInsights(m.id, token);
        } catch (err) {
          if (err instanceof TokenError) {
            tokenBroken = true;
            throw new Error(`Meta API 190: ${err.message}`);
          }
        }
        rows.push({
          client_id: client.id,
          network: "ig",
          media_id: m.id,
          published_at: m.timestamp ?? null,
          caption: m.caption?.slice(0, 500) ?? null,
          permalink: m.permalink ?? null,
          media_type: m.media_type ?? null,
          like_count: m.like_count ?? null,
          comments_count: m.comments_count ?? null,
          metrics: insights,
          fetched_at: new Date().toISOString(),
        });
      }
      if (rows.length > 0) {
        const { error: upsertErr } = await supabase
          .from("organic_posts")
          .upsert(rows, { onConflict: "media_id" });
        if (upsertErr) throw new Error(`upsert organic_posts: ${upsertErr.message}`);
      }

      // ---- 3. Matcher → content_posts.metrics ----
      const { data: unmatched } = await supabase
        .from("organic_posts")
        .select("id, media_id, published_at, like_count, comments_count, metrics")
        .eq("client_id", client.id)
        .is("matched_post_id", null)
        .not("published_at", "is", null);

      const { data: candidates } = await supabase
        .from("content_posts")
        .select("id, date, status, metrics")
        .eq("client_id", client.id)
        .eq("network", "ig")
        .in("status", ["published", "scheduled"]);

      const usedPostIds = new Set<string>();
      const { data: alreadyMatched } = await supabase
        .from("organic_posts")
        .select("matched_post_id")
        .eq("client_id", client.id)
        .not("matched_post_id", "is", null);
      for (const r of alreadyMatched ?? []) {
        if (r.matched_post_id) usedPostIds.add(r.matched_post_id as string);
      }

      let matched = 0;
      for (const org of unmatched ?? []) {
        const pubDate = (org.published_at as string).slice(0, 10);
        let best: { id: string; diff: number } | null = null;
        for (const post of candidates ?? []) {
          if (usedPostIds.has(post.id as string)) continue;
          const diff = Math.abs(
            (Date.parse(`${pubDate}T00:00:00Z`) -
              Date.parse(`${post.date}T00:00:00Z`)) /
              86400000,
          );
          if (diff <= 2 && (!best || diff < best.diff)) {
            best = { id: post.id as string, diff };
          }
        }
        if (!best) continue;

        const m = (org.metrics ?? {}) as Record<string, number>;
        const pieceMetrics = {
          reach: m.reach ?? null,
          views: m.views ?? null,
          saves: m.saved ?? null,
          shares: m.shares ?? null,
          likes: org.like_count ?? null,
          comments: org.comments_count ?? null,
          source: "ig",
          media_id: org.media_id,
          updated_at: new Date().toISOString(),
        };
        const [{ error: e1 }, { error: e2 }] = await Promise.all([
          supabase
            .from("organic_posts")
            .update({ matched_post_id: best.id })
            .eq("id", org.id),
          supabase.from("content_posts").update({ metrics: pieceMetrics }).eq("id", best.id),
        ]);
        if (!e1 && !e2) {
          usedPostIds.add(best.id);
          matched++;
        }
      }

      // Evento formal (Stage 5): hay métricas nuevas matcheadas → el
      // handler dispara social-media-metrics para que evalúe con datos
      // reales. Se procesa inline al final (y el sweeper barre si falla).
      if (matched > 0) {
        await emitEvent("metricas.actualizadas", client.id, { matched });
      }

      results.push({ client: client.id, media: rows.length, matched });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      console.error(`[organic-insights] ${client.id}:`, message);
      results.push({ client: client.id, media: 0, matched: 0, error: message });
    }
  }

  // ---- Token roto → notificación con dedup_key (idempotencia mig 090) ----
  if (tokenBroken) {
    await supabase.from("notifications").upsert(
      {
        client: null,
        agent: "organic-insights",
        level: "error",
        title: "Token de Meta inválido para insights orgánicos",
        body: "La ingestión orgánica no puede leer la API (error 190). Verificá que el System User tenga instagram_basic + instagram_manage_insights + pages_read_engagement y regenerá META_SYSTEM_USER_TOKEN en Vercel.",
        link: "/finanzas",
        to_role: "director",
        email_sent: false,
        dedup_key: `organic-insights-token-${todayUY()}`,
      },
      { onConflict: "dedup_key", ignoreDuplicates: true },
    );
  }

  // Procesar los eventos recién emitidos en el mismo run (real-time para
  // metricas.actualizadas sin depender del sweeper diario). Best-effort.
  let eventsResult = null;
  try {
    eventsResult = await processEvents(10);
  } catch (err) {
    console.warn("[organic-insights] processEvents falló (el sweeper barre):", err);
  }

  const failed = results.filter((r) => r.error).length;
  return Response.json({ ok: true, configured: true, clients: results, failed, events: eventsResult });
}
