/**
 * Insights Aggregator
 *
 * Reads `content_pieces.metrics` for every client and recomputes the
 * `content_insights` table — a ranked list of hooks, formats, angles and
 * publish times that performed best historically. The Consultant reads this
 * table before enriching a Content Creator brief, so each new piece is
 * optimized against what actually worked.
 *
 * Runs on a daily cron (`.github/workflows/insights-aggregator.yml`) after
 * social-media-metrics has refreshed piece metrics.
 *
 * Heuristic — score a piece by a normalized engagement proxy:
 *   score = views > 0 ? (engagement / views) * 1000 + log10(1 + views)
 *                     : 0
 * then average per (dimension, value) across a client's history.
 */

import { readFileSync } from "fs";
import {
  select,
  upsertRows,
  logAgentRun,
  logAgentError,
  pushNotification,
} from "../lib/supabase.js";

const AGENT = "insights-aggregator";

const DIMENSIONS = ["hook", "format", "angle", "publish_time"];
const MIN_SAMPLE = 2; // drop (dimension, value) pairs with fewer than N samples

function loadBriefFromArgs() {
  const args = process.argv.slice(2);
  const briefFlagIdx = args.indexOf("--brief");
  if (briefFlagIdx !== -1 && args[briefFlagIdx + 1]) {
    return JSON.parse(readFileSync(args[briefFlagIdx + 1], "utf-8"));
  }
  // Positional: first arg = client (optional — aggregates all clients when omitted)
  const positional = args.filter((a) => !a.startsWith("--"))[0];
  return { client: positional || null };
}

function scorePiece(piece) {
  const m = piece.metrics || {};
  const views = Number(m.views ?? m.impressions ?? 0);
  const engagement = Number(
    m.engagement ?? (Number(m.likes ?? 0) + Number(m.comments ?? 0) + Number(m.shares ?? 0))
  );
  if (!views && !engagement) return 0;
  const ratio = views > 0 ? (engagement / views) * 1000 : 0;
  const reach = Math.log10(1 + views);
  return Number((ratio + reach).toFixed(4));
}

function extractDimensionValue(piece, dimension) {
  switch (dimension) {
    case "hook":
      // Prefer metric-level hook if present; else metadata.hook; else first 60 chars of script
      return (
        piece.metrics?.hook ??
        piece.metadata?.hook ??
        (piece.structured?.hook ? piece.structured.hook : null)
      );
    case "format":
      return piece.script_format ?? piece.piece_type ?? null;
    case "angle":
      return piece.angle ?? null;
    case "publish_time": {
      const results = Array.isArray(piece.publish_results) ? piece.publish_results : [];
      const published = results.find((r) => r?.publishedAt || r?.published_at);
      const iso = published?.publishedAt ?? published?.published_at ?? null;
      if (!iso) return null;
      try {
        const d = new Date(iso);
        // bucket to HH:00 to reduce sparsity
        return `${String(d.getUTCHours()).padStart(2, "0")}:00`;
      } catch {
        return null;
      }
    }
    default:
      return null;
  }
}

function aggregateForClient(clientSlug, pieces) {
  const buckets = new Map(); // key: `${dim}::${value}` -> { dim, value, total, n }

  for (const piece of pieces) {
    const score = scorePiece(piece);
    if (!score) continue;

    for (const dim of DIMENSIONS) {
      const value = extractDimensionValue(piece, dim);
      if (!value) continue;
      const norm = String(value).trim().slice(0, 200);
      if (!norm) continue;
      const key = `${dim}::${norm}`;
      const cur = buckets.get(key) ?? { dim, value: norm, total: 0, n: 0 };
      cur.total += score;
      cur.n += 1;
      buckets.set(key, cur);
    }
  }

  const rows = [];
  for (const { dim, value, total, n } of buckets.values()) {
    if (n < MIN_SAMPLE) continue;
    rows.push({
      client: clientSlug,
      dimension: dim,
      value,
      score: Number((total / n).toFixed(4)),
      sample_size: n,
      computed_at: new Date().toISOString(),
    });
  }
  return rows;
}

export async function run(briefInput) {
  const startTime = Date.now();
  const brief = briefInput ?? loadBriefFromArgs();
  const onlyClient = brief?.client ?? null;

  console.log(
    `[${AGENT}] starting${onlyClient ? ` for client='${onlyClient}'` : " (all clients)"}`
  );

  const pieces = await select(
    "content_pieces",
    onlyClient ? { client: onlyClient } : {},
    "client,piece_id,piece_type,angle,script_format,publish_results,metrics,metadata,structured",
    { limit: 5000 }
  );

  if (!Array.isArray(pieces) || pieces.length === 0) {
    console.log(`[${AGENT}] no content_pieces found — nothing to aggregate.`);
    await logAgentRun(
      onlyClient ?? "_system",
      AGENT,
      "success",
      "no pieces to aggregate",
      {},
      { duration_ms: Date.now() - startTime }
    );
    return { clients: 0, insights: 0 };
  }

  const byClient = new Map();
  for (const p of pieces) {
    if (!byClient.has(p.client)) byClient.set(p.client, []);
    byClient.get(p.client).push(p);
  }

  let totalInsights = 0;
  for (const [clientSlug, clientPieces] of byClient.entries()) {
    const rows = aggregateForClient(clientSlug, clientPieces);
    if (rows.length === 0) continue;

    await upsertRows("content_insights", rows, "client,dimension,value");
    totalInsights += rows.length;
    console.log(`[${AGENT}] ${clientSlug}: ${rows.length} insights upserted.`);
  }

  const summary = `Aggregated ${totalInsights} insights across ${byClient.size} client(s)`;
  await logAgentRun(
    onlyClient ?? "_system",
    AGENT,
    "success",
    summary,
    { clients: byClient.size, insights: totalInsights },
    { duration_ms: Date.now() - startTime }
  );

  // Only notify when running for a specific client; system-wide nightly runs stay silent.
  if (onlyClient) {
    await pushNotification(
      onlyClient,
      "info",
      "Insights actualizados",
      summary,
      { agent: AGENT, link: `/cliente/${onlyClient}/agentes` }
    );
  }

  console.log(`[${AGENT}] done. ${summary}`);
  return { clients: byClient.size, insights: totalInsights };
}

// CLI entry point
import { pathToFileURL } from "url";
const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  run().catch(async (err) => {
    console.error(`[${AGENT}] failed:`, err.message);
    const brief = (() => {
      try {
        return loadBriefFromArgs();
      } catch {
        return { client: null };
      }
    })();
    await logAgentError(brief.client ?? "_system", AGENT, err, {});
    process.exit(1);
  });
}
