/**
 * GET /api/usage?days=30
 *
 * Panel de gasto de la API de Claude. Solo director. Agrega `api_usage` del
 * rango pedido y calcula el costo USD con la tabla de precios. Devuelve totales
 * + desglose por source (agente/endpoint), por cliente y por modelo.
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth-guard";
import { costUsd, type UsageRow } from "@/lib/claude-pricing";

export const dynamic = "force-dynamic";

interface Bucket {
  cost: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

function add(map: Map<string, Bucket>, key: string, row: UsageRow, cost: number) {
  const cur =
    map.get(key) ??
    { cost: 0, calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
  cur.cost += cost;
  cur.calls += 1;
  cur.inputTokens += row.input_tokens ?? 0;
  cur.outputTokens += row.output_tokens ?? 0;
  cur.cacheReadTokens += row.cache_read_tokens ?? 0;
  map.set(key, cur);
}

function toSorted(map: Map<string, Bucket>) {
  return [...map.entries()]
    .map(([key, b]) => ({ key, ...b }))
    .sort((a, b) => b.cost - a.cost);
}

export async function GET(req: NextRequest) {
  const access = await requireRole(req, ["director"]);
  if (!access.ok) return access.response;

  const daysRaw = Number(req.nextUrl.searchParams.get("days") ?? "30");
  const days = Math.min(Math.max(Number.isFinite(daysRaw) ? daysRaw : 30, 1), 365);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("api_usage")
    .select(
      "source, client_id, model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, created_at",
    )
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(50000);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as (UsageRow & {
    source: string;
    client_id: string | null;
  })[];

  let totalCost = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  const bySource = new Map<string, Bucket>();
  const byClient = new Map<string, Bucket>();
  const byModel = new Map<string, Bucket>();

  for (const r of rows) {
    const c = costUsd(r);
    totalCost += c;
    totalInput += r.input_tokens ?? 0;
    totalOutput += r.output_tokens ?? 0;
    totalCacheRead += r.cache_read_tokens ?? 0;
    add(bySource, r.source ?? "?", r, c);
    add(byClient, r.client_id ?? "(sin cliente)", r, c);
    add(byModel, r.model ?? "?", r, c);
  }

  return Response.json({
    days,
    calls: rows.length,
    totalCost,
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    cacheReadTokens: totalCacheRead,
    bySource: toSorted(bySource),
    byClient: toSorted(byClient),
    byModel: toSorted(byModel),
  });
}
