/**
 * POST /api/consultant
 *
 * In-process chat endpoint for the Consultant Agent. The Consultant is the
 * single human-facing interface per client — it either answers directly from
 * the client's Supabase context, or dispatches a specific agent (content
 * creator, analytics, etc.) via repository_dispatch.
 *
 * For the MVP the Consultant is one-shot: the model either replies or asks
 * to dispatch an agent. If it dispatches, we open an agent_runs row, fire
 * the workflow, and reply with a confirmation. Multi-turn tool use (loop the
 * tool result back to Claude) is deferred.
 *
 * Body:
 *   clientId: string
 *   messages: { role: "user" | "assistant"; content: string }[]
 *
 * Response:
 *   { reply, dispatched?: { agent, runId }, usage, model }
 */

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { dispatchAgentWorkflow } from "@/lib/github-dispatch";
import { loadClientVaultContext, buildVaultBlock } from "@/lib/vault-loader";

const MODEL = "claude-opus-4-7";

const DISPATCHABLE_AGENTS = [
  "content-creator",
  "content-strategy",
  "reporting-performance",
  "morning-briefing",
  "seo",
  "social-media-metrics",
  "stock",
  "logistics",
] as const;

type DispatchableAgent = (typeof DISPATCHABLE_AGENTS)[number];

const SYSTEM_PROMPT = `Sos el Consultor de D&C Scale Partners para un cliente específico. Tu rol:

1. Sos el ÚNICO punto de contacto humano con el dueño del negocio del cliente.
2. Conocés el contexto del cliente (sector, fase, método, runs recientes).
3. Respondés directo cuando la pregunta es de contexto/estado.
4. Si el dueño pide algo operativo (generar contenido, analítica, SEO, logística, stock), dispatchás el agente correspondiente vía la tool \`run_agent\`.

Reglas:
- Tono rioplatense, directo, sin jerga corporativa ("transformar", "potenciar", "sinergia" están prohibidas).
- Si falta info para dispatchar un agente, pedila al usuario en vez de inventarla.
- Si ya hay un agent_run reciente que responde lo que piden, citalo en lugar de disparar uno nuevo.
- Respuestas cortas por default (2-4 oraciones). El dueño está ocupado.

Agentes que podés dispatchar:
- content-creator: genera piezas (reel, static-ad, social-review, etc). Brief mínimo: pieceType, angle.
- content-strategy: calendario semanal. Brief mínimo: ninguno (usa contexto del vault).
- reporting-performance: analytics (daily, weekly, monthly, insights, query). Brief: mode, y si es query también question.
- morning-briefing: briefing matutino. Brief: ninguno.
- seo: keyword research, blog posts, meta tags. Brief: pieceType + targetKeyword o topic.
- social-media-metrics: evalúa performance de piezas publicadas. Brief: mode.
- stock: status / forecast / alert de inventario (solo ecommerce). Brief: mode.
- logistics: schedule / dispatch / optimize envíos (solo ecommerce). Brief: mode.

Si dispatchás, confirmá brevemente qué dispatchaste y qué esperar (tiempo estimado, dónde va a aparecer el output).

Memoria progresiva:
- Antes de responder recibís un bloque "MEMORIA DEL CLIENTE" con preferencias, restricciones, decisiones pasadas y aprendizajes. Usalos para afinar las respuestas y los briefs.
- Cuando el dueño deje caer una preferencia nueva ("prefiero copy punchy", "no usar humor negro", "apuntá a compradoras 30-50"), una restricción ("no hablar de precios"), o una decisión importante, LLAMÁ a la tool \`save_memory\` para guardarla. No pidas permiso: guardala en silencio.
- Importance guide: preferencia genérica=2, preferencia fuerte=3, constraint dura=4-5.`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface RequestBody {
  clientId: string;
  messages: ChatMessage[];
}

interface AgentRunRow {
  agent: string;
  status: string;
  summary: string | null;
  created_at: string;
}

interface ClientRow {
  id: string;
  name: string;
  sector: string | null;
  type: string | null;
  phase: string | null;
  method: string | null;
  fee: number | null;
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { clientId, messages } = body;
  if (!clientId || !Array.isArray(messages) || messages.length === 0) {
    return Response.json(
      { error: "Missing required fields: clientId, messages[]" },
      { status: 400 },
    );
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY no configurada en Vercel env vars." },
      { status: 500 },
    );
  }

  const supabase = getSupabaseAdmin();

  const [{ data: client }, { data: recentRuns }, memories, vault] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, sector, type, phase, method, fee")
      .eq("id", clientId)
      .single<ClientRow>(),
    supabase
      .from("agent_runs")
      .select("agent, status, summary, created_at")
      .eq("client", clientId)
      .order("created_at", { ascending: false })
      .limit(10)
      .returns<AgentRunRow[]>(),
    recallMemories(supabase, clientId, 20),
    // Vault — cargado del repo via GitHub Contents API. Si falla la red,
    // seguimos sin vault para no romper el chat (degraded mode).
    loadClientVaultContext(clientId).catch((err) => {
      console.warn("[consultant] loadClientVaultContext falló:", err.message);
      return { claudeClient: null, strategy: null, learningLog: null, callsLog: null };
    }),
  ]);

  if (!client) {
    return Response.json({ error: `Client '${clientId}' not found` }, { status: 404 });
  }

  const contextBlock = buildContextBlock(client, recentRuns ?? []);
  const memoryBlock = buildMemoryBlock(memories);
  const vaultBlock = buildVaultBlock(vault);

  const anthropic = new Anthropic();

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
        {
          // Vault del cliente — narrativa rica (brandbook, estrategia, calls).
          // Cacheable porque cambia cada minutos, no entre turnos del chat.
          type: "text",
          text: vaultBlock,
          cache_control: { type: "ephemeral" },
        },
        {
          type: "text",
          text: contextBlock,
        },
        {
          type: "text",
          text: memoryBlock,
        },
      ],
      tools: [
        {
          name: "run_agent",
          description:
            "Dispatch a specific agent via GitHub Actions. Use this when the owner asks for something operative (generate content, run analytics, SEO piece, check stock, etc.). Returns immediately; the agent runs in the background and its output will appear in the dashboard.",
          input_schema: {
            type: "object",
            properties: {
              agent: {
                type: "string",
                enum: [...DISPATCHABLE_AGENTS],
                description: "The agent to dispatch.",
              },
              brief: {
                type: "object",
                description:
                  "Agent-specific brief. Include only the fields the agent needs (e.g. pieceType + angle for content-creator, mode + question for reporting-performance query).",
              },
              reason: {
                type: "string",
                description: "One-sentence note on why this dispatch, shown to the owner.",
              },
            },
            required: ["agent", "brief"],
          },
        },
        {
          name: "save_memory",
          description:
            "Persist a piece of durable context about this client (preference, constraint, past decision, or learning). Call this silently when the owner drops a new preference or restriction; the next conversation starts with it loaded.",
          input_schema: {
            type: "object",
            properties: {
              kind: {
                type: "string",
                enum: ["preference", "constraint", "past_decision", "learning"],
                description:
                  "preference = gusto/tono/estilo del dueño; constraint = cosa que no se debe hacer; past_decision = decisión tomada y por qué; learning = aprendizaje de lo que funcionó o no.",
              },
              content: {
                type: "string",
                description: "La memoria en sí, en una oración. Escribí en primera persona (del cliente) cuando corresponda: 'Prefiero copy corto'.",
              },
              importance: {
                type: "integer",
                minimum: 1,
                maximum: 5,
                description: "1=trivia, 3=preferencia relevante, 5=regla dura inviolable.",
              },
            },
            required: ["kind", "content"],
          },
        },
      ],
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const toolBlocks = response.content.filter((b) => b.type === "tool_use");

    let dispatched: { agent: string; runId: number } | null = null;
    let memorySaved: { kind: string; content: string } | null = null;

    // Handle save_memory first — it's silent and doesn't affect dispatch flow.
    for (const block of toolBlocks) {
      if (block.type === "tool_use" && block.name === "save_memory") {
        const input = block.input as {
          kind: "preference" | "constraint" | "past_decision" | "learning";
          content: string;
          importance?: number;
        };
        if (input.content && input.kind) {
          await rememberMemory(supabase, clientId, input.kind, input.content, input.importance);
          memorySaved = { kind: input.kind, content: input.content };
        }
      }
    }

    const toolBlock = toolBlocks.find(
      (b) => b.type === "tool_use" && b.name === "run_agent",
    );

    if (toolBlock && toolBlock.type === "tool_use" && toolBlock.name === "run_agent") {
      const input = toolBlock.input as {
        agent: DispatchableAgent;
        brief: Record<string, unknown>;
        reason?: string;
      };

      if (!DISPATCHABLE_AGENTS.includes(input.agent)) {
        return Response.json(
          { error: `Unknown agent '${input.agent}'` },
          { status: 400 },
        );
      }

      // Brief enrichment basado en datos históricos del cliente. Cada agente
      // recibe lo que le sirve: content-creator y content-strategy reciben
      // `prioritize` (top hooks/formats/angles); content-creator también
      // recibe `examples[]` con piezas de competencia. social-media-metrics
      // recibe `historicalBaseline` para detectar outliers.
      const enrichedBrief = await enrichBriefForAgent(
        supabase,
        clientId,
        input.agent,
        input.brief,
      );

      const { data: run, error: insertError } = await supabase
        .from("agent_runs")
        .insert({
          client: clientId,
          agent: input.agent,
          status: "running",
          summary: input.reason ?? "dispatched from consultant",
          metadata: { brief: enrichedBrief, source: "consultant", reason: input.reason },
          performance: {},
        })
        .select()
        .single();

      if (insertError || !run) {
        return Response.json(
          { error: `Failed to open agent_runs row: ${insertError?.message ?? "unknown"}` },
          { status: 500 },
        );
      }

      try {
        await dispatchAgentWorkflow({
          eventType: input.agent,
          payload: {
            runId: run.id,
            brief: { ...enrichedBrief, client: clientId, source: "consultant", runId: run.id },
          },
        });
        dispatched = { agent: input.agent, runId: run.id };
      } catch (err) {
        await supabase
          .from("agent_runs")
          .update({
            status: "error",
            summary: err instanceof Error ? err.message : "dispatch failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", run.id);

        return Response.json(
          {
            error: err instanceof Error ? err.message : "dispatch failed",
            runId: run.id,
          },
          { status: 502 },
        );
      }
    }

    const reply =
      textBlock && textBlock.type === "text"
        ? textBlock.text.trim()
        : dispatched
        ? `Dispatché el agente ${dispatched.agent}. Te aviso cuando termine.`
        : "Procesado.";

    return Response.json({
      reply,
      dispatched,
      memorySaved,
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
        cacheCreation: response.usage.cache_creation_input_tokens ?? 0,
        cacheRead: response.usage.cache_read_input_tokens ?? 0,
      },
      model: response.model,
    });
  } catch (err) {
    console.error("Consultant error:", err);
    if (err instanceof Anthropic.AuthenticationError) {
      return Response.json({ error: "ANTHROPIC_API_KEY inválida o revocada." }, { status: 401 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "Rate limit alcanzado. Esperá unos segundos." }, { status: 429 });
    }
    if (err instanceof Anthropic.APIError) {
      return Response.json(
        { error: `Claude API: ${err.message}` },
        { status: err.status ?? 500 },
      );
    }
    return Response.json({ error: "Error inesperado" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Consultant memory — progressive context written during conversation
// ---------------------------------------------------------------------------

interface MemoryRow {
  id: number;
  kind: "preference" | "constraint" | "past_decision" | "learning";
  content: string;
  importance: number | null;
  created_at: string;
}

async function recallMemories(
  supabase: SupabaseAdminClient,
  clientId: string,
  limit: number,
): Promise<MemoryRow[]> {
  const { data, error } = await supabase
    .from("consultant_memory")
    .select("id, kind, content, importance, created_at")
    .eq("client", clientId)
    .or("expires_at.is.null,expires_at.gt.now()")
    .order("importance", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<MemoryRow[]>();

  if (error || !data) return [];
  return data;
}

async function rememberMemory(
  supabase: SupabaseAdminClient,
  clientId: string,
  kind: MemoryRow["kind"],
  content: string,
  importance?: number,
): Promise<void> {
  const clampedImportance =
    typeof importance === "number"
      ? Math.max(1, Math.min(5, Math.round(importance)))
      : 3;

  await supabase.from("consultant_memory").insert({
    client: clientId,
    kind,
    content: content.slice(0, 1000),
    importance: clampedImportance,
  });
}

function buildMemoryBlock(memories: MemoryRow[]): string {
  if (memories.length === 0) {
    return "MEMORIA DEL CLIENTE: (vacía — esta es la primera conversación relevante)";
  }

  const byKind: Record<string, MemoryRow[]> = {
    preference: [],
    constraint: [],
    past_decision: [],
    learning: [],
  };
  for (const m of memories) {
    (byKind[m.kind] ?? (byKind[m.kind] = [])).push(m);
  }

  const labels: Record<string, string> = {
    preference: "Preferencias",
    constraint: "Restricciones (no cruzar)",
    past_decision: "Decisiones pasadas",
    learning: "Aprendizajes",
  };

  const sections: string[] = ["MEMORIA DEL CLIENTE:"];
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

interface InsightRow {
  dimension: string;
  value: string;
  score: number | null;
  sample_size: number | null;
}

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

/**
 * Read top-5 insights per dimension for a client and return them as a
 * `prioritize` object Content Creator understands. Returns null if the
 * table is empty for this client.
 */
async function loadPrioritizeFromInsights(
  supabase: SupabaseAdminClient,
  clientId: string,
): Promise<{
  hook?: string[];
  format?: string[];
  angle?: string[];
  publish_time?: string[];
} | null> {
  const { data, error } = await supabase
    .from("content_insights")
    .select("dimension, value, score, sample_size")
    .eq("client", clientId)
    .order("score", { ascending: false })
    .limit(200)
    .returns<InsightRow[]>();

  if (error || !data || data.length === 0) return null;

  const byDim = new Map<string, string[]>();
  for (const row of data) {
    if (!row.value) continue;
    const arr = byDim.get(row.dimension) ?? [];
    if (arr.length < 5) arr.push(row.value);
    byDim.set(row.dimension, arr);
  }

  const prioritize: Record<string, string[]> = {};
  for (const dim of ["hook", "format", "angle", "publish_time"]) {
    const arr = byDim.get(dim);
    if (arr && arr.length > 0) prioritize[dim] = arr;
  }

  return Object.keys(prioritize).length > 0 ? prioritize : null;
}

interface CompetitorPieceRow {
  competitor: string;
  platform: string | null;
  url: string | null;
  piece_type: string | null;
  hook: string | null;
  format: string | null;
  notes: string | null;
  captured_at: string;
}

/**
 * Load up to 3 recent non-archived competitor pieces and shape them as
 * Content Creator `examples[]` entries. These go into the brief so the
 * piece is generated with reference material from real competition.
 */
async function loadCompetitorExamples(
  supabase: SupabaseAdminClient,
  clientId: string,
): Promise<Array<{ type: string; url: string; notes: string }> | null> {
  const { data, error } = await supabase
    .from("competitor_pieces")
    .select("competitor, platform, url, piece_type, hook, format, notes, captured_at")
    .eq("client", clientId)
    .eq("archived", false)
    .order("captured_at", { ascending: false })
    .limit(3)
    .returns<CompetitorPieceRow[]>();

  if (error || !data || data.length === 0) return null;

  return data
    .filter((row) => row.url)
    .map((row) => {
      const typeMap: Record<string, string> = {
        reel: "video",
        short: "video",
        tiktok: "video",
        static: "static",
        carousel: "static",
      };
      const type =
        (row.piece_type && typeMap[row.piece_type.toLowerCase()]) || "video";
      const parts: string[] = [];
      if (row.competitor) parts.push(`competidor: ${row.competitor}`);
      if (row.format) parts.push(`formato: ${row.format}`);
      if (row.hook) parts.push(`hook: "${row.hook}"`);
      if (row.notes) parts.push(row.notes);
      return {
        type,
        url: row.url as string,
        notes: parts.join(" · ") || "Pieza de competencia capturada",
      };
    });
}

/**
 * Enriquece el brief de un agente con datos históricos del cliente.
 *
 * - content-creator    → prioritize (top hooks/formats/angles) + examples[]
 *                        (piezas de competencia)
 * - content-strategy   → prioritize (qué formatos / horarios funcionaron mejor)
 * - social-media-metrics → historicalBaseline (score promedio para outliers)
 * - resto              → sin enrichment (devuelve copia del brief original)
 *
 * Cada agente decide en su prompt si usar o no el campo enriquecido. Los
 * agentes que ignoran el campo no rompen — es opt-in del lado del agente.
 */
async function enrichBriefForAgent(
  supabase: SupabaseAdminClient,
  clientId: string,
  agent: string,
  brief: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const enriched: Record<string, unknown> = { ...brief };

  if (agent === "content-creator") {
    const [prioritize, competitorExamples] = await Promise.all([
      loadPrioritizeFromInsights(supabase, clientId),
      loadCompetitorExamples(supabase, clientId),
    ]);
    if (prioritize) enriched.prioritize = prioritize;
    if (competitorExamples && competitorExamples.length > 0) {
      const existing = Array.isArray(enriched.examples)
        ? (enriched.examples as unknown[])
        : [];
      enriched.examples = [...existing, ...competitorExamples];
    }
    return enriched;
  }

  if (agent === "content-strategy") {
    const prioritize = await loadPrioritizeFromInsights(supabase, clientId);
    if (prioritize) enriched.prioritize = prioritize;
    return enriched;
  }

  if (agent === "social-media-metrics") {
    const baseline = await loadHistoricalBaseline(supabase, clientId);
    if (baseline) enriched.historicalBaseline = baseline;
    return enriched;
  }

  return enriched;
}

/**
 * Score promedio histórico del cliente, agregado de `content_insights`.
 * Sirve a social-media-metrics para detectar outliers (piezas que
 * superan ampliamente la baseline = ganadoras).
 */
async function loadHistoricalBaseline(
  supabase: SupabaseAdminClient,
  clientId: string,
): Promise<{ avgScore: number; sampleSize: number } | null> {
  const { data, error } = await supabase
    .from("content_insights")
    .select("score, sample_size")
    .eq("client", clientId)
    .returns<Array<{ score: number | null; sample_size: number | null }>>();

  if (error || !data || data.length === 0) return null;

  let weightedSum = 0;
  let totalSamples = 0;
  for (const row of data) {
    if (typeof row.score !== "number" || typeof row.sample_size !== "number") continue;
    weightedSum += row.score * row.sample_size;
    totalSamples += row.sample_size;
  }
  if (totalSamples === 0) return null;

  return {
    avgScore: Number((weightedSum / totalSamples).toFixed(2)),
    sampleSize: totalSamples,
  };
}

function buildContextBlock(client: ClientRow, recentRuns: AgentRunRow[]): string {
  const lines: string[] = ["CONTEXTO DEL CLIENTE:"];
  lines.push(`- Nombre: ${client.name} (slug: ${client.id})`);
  if (client.sector) lines.push(`- Sector: ${client.sector}`);
  if (client.type) lines.push(`- Tipo de servicio: ${client.type === "gp" ? "Growth Partner" : "Desarrollo"}`);
  if (client.phase) lines.push(`- Fase: ${client.phase}`);
  if (client.method) lines.push(`- Método: ${client.method}`);
  if (client.fee) lines.push(`- Fee mensual: USD ${client.fee}`);

  if (recentRuns.length > 0) {
    lines.push("");
    lines.push("RUNS RECIENTES (últimas 10):");
    for (const r of recentRuns) {
      const when = new Date(r.created_at).toISOString().slice(0, 16).replace("T", " ");
      lines.push(`- ${when} · ${r.agent} · ${r.status}${r.summary ? ` — ${r.summary}` : ""}`);
    }
  } else {
    lines.push("");
    lines.push("RUNS RECIENTES: ninguno todavía.");
  }

  return lines.join("\n");
}
