/**
 * POST /api/consultant/global
 *
 * Endpoint principal del widget global del Consultor. Streaming SSE.
 *
 * Auth:
 *   Header `Authorization: Bearer <supabase access token>`.
 *
 * Body (JSON):
 *   {
 *     messages: [{ role: "user"|"assistant", content: string }],
 *     conversationId?: string,         // si se omite, usa/crea la pinned del user
 *     activeClient?: string            // hint del frontend cuando estás en /cliente/[id]
 *   }
 *
 * Response (SSE, text/event-stream):
 *   data: {"type":"meta","conversationId":"..."}\n\n
 *   data: {"type":"delta","text":"..."}\n\n  (varios)
 *   data: {"type":"tool_use","name":"run_agent","input":{...}}\n\n
 *   data: {"type":"tool_result","name":"run_agent","ok":true,"detail":{...}}\n\n
 *   data: {"type":"done","usage":{...},"model":"..."}\n\n
 *   data: {"type":"error","message":"..."}\n\n        (en caso de fallo)
 *
 * Single-turn tool calls: el modelo decide dispatch + escribe respuesta en el
 * mismo turno. NO hay segunda llamada a Claude con el tool_result.
 */

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  loadCallerContext,
  loadGlobalContext,
  buildGlobalContextBlock,
  buildUserMemoryBlock,
  buildActiveClientBlock,
  GLOBAL_SYSTEM_PROMPT_BASE,
  type CallerContext,
} from "@/lib/consultant-global-context";
import { dispatchAgentWorkflow } from "@/lib/github-dispatch";
import { CLAUDE_MODEL_OPUS } from "@/lib/anthropic-model";
import { recordApiUsage } from "@/lib/api-usage";
import { enforceAgentGuardrails } from "@/lib/agent-guardrails";
import { getProcessStatus } from "@/lib/consultant-engine";
import { dispatchableAgentKeys } from "@/lib/agent-registry";
import { getPersona, type PersonaConfig } from "@/lib/consultant-personas";

export const dynamic = "force-dynamic";

const MODEL = CLAUDE_MODEL_OPUS;
const MAX_TOKENS = 2048;

// Derivado del registry (fuente única de la flota). La lista hardcodeada
// anterior incluía "content-creator" — agente ELIMINADO — así que todo
// dispatch de contenido desde el widget rebotaba contra los guardrails
// con "Agente desconocido".
const DISPATCHABLE_AGENTS: string[] = dispatchableAgentKeys();
type DispatchableAgent = string;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface RequestBody {
  messages: ChatMessage[];
  conversationId?: string;
  activeClient?: string;
  /** Persona (mig 097): general (default) o el gerente de una gerencia. */
  persona?: string;
}

const TITLE_MAX_CHARS = 60;

// ===========================================================================
// Entrypoint
// ===========================================================================

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!url || !anonKey || !serviceKey || !anthropicKey) {
    return jsonError("Servidor no configurado: faltan env vars.", 500);
  }

  // ---- Auth ----
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return jsonError("Sin sesión", 401);

  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user: authUser },
  } = await callerClient.auth.getUser();
  if (!authUser) return jsonError("No autenticado", 401);

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const caller = await loadCallerContext(admin, authUser.id);
  if (!caller) {
    return jsonError(
      "Este consultor es para el equipo (director / team). Si sos cliente, usá el portal.",
      403,
    );
  }

  // ---- Body ----
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonError("Body inválido", 400);
  }
  const { messages, activeClient } = body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return jsonError("Faltan messages[]", 400);
  }
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUserMessage || !lastUserMessage.content?.trim()) {
    return jsonError("El último mensaje debe ser del user con contenido.", 400);
  }

  // ---- Persona (mig 095): valida existencia + rol server-side ----
  const persona = getPersona(body.persona);
  if (!persona) {
    return jsonError(`Persona desconocida: '${body.persona}'`, 400);
  }
  if (!persona.allowedRoles.includes(caller.role)) {
    return jsonError(
      `La persona '${persona.name}' es solo para: ${persona.allowedRoles.join(", ")}.`,
      403,
    );
  }

  // ---- Conversation: usar/crear la pinned de ESTA persona del user ----
  const conversation = await ensurePinnedConversation(
    admin,
    caller.userId,
    lastUserMessage.content,
    persona.id,
  );
  if (!conversation) {
    return jsonError("No se pudo crear la conversación pinned.", 500);
  }

  // ---- Persistir mensaje del user ANTES de llamar a Claude ----
  await admin.from("consultant_messages").insert({
    conversation_id: conversation.id,
    role: "user",
    content: lastUserMessage.content,
    is_welcome: false,
    is_briefing: false,
  });

  // ---- Cargar contexto global + activo ----
  const ctx = await loadGlobalContext(admin, caller, {
    activeClientHint: activeClient ?? null,
    lastUserMessage: lastUserMessage.content,
  });

  // Contexto extra de la persona (digests de gerencias / snapshot financiero)
  // — se carga por turno porque las tools son single-turn: si no está en el
  // system, el gerente respondería sin verlo. Recibe el caller para filtrar
  // por rol (team no ve finanzas/ventas).
  let personaExtraContext: string | null = null;
  if (persona.loadExtraContext) {
    try {
      personaExtraContext = await persona.loadExtraContext(caller);
    } catch (err) {
      console.warn(`[consultant/global] extraContext de '${persona.id}' falló:`, err);
    }
  }

  const systemBlocks = buildSystemBlocks(ctx, persona, personaExtraContext);
  const anthropic = new Anthropic({ apiKey: anthropicKey });

  // ---- Stream ----
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: Record<string, unknown>) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      }

      send({ type: "meta", conversationId: conversation!.id });

      try {
        const claudeStream = anthropic.messages.stream({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: systemBlocks,
          tools: buildTools(persona),
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        });

        // Stream text deltas como llegan
        claudeStream.on("text", (delta: string) => {
          if (delta) send({ type: "delta", text: delta });
        });

        const finalMessage = await claudeStream.finalMessage();

        // Extraer texto final + tool_use blocks
        let assistantText = "";
        const toolUses: Array<{
          id: string;
          name: string;
          input: Record<string, unknown>;
        }> = [];
        for (const block of finalMessage.content) {
          if (block.type === "text") assistantText += block.text;
          if (block.type === "tool_use") {
            toolUses.push({
              id: block.id,
              name: block.name,
              input: block.input as Record<string, unknown>,
            });
          }
        }

        // Ejecutar tool_use blocks server-side (single-turn — no se loopea)
        const toolResults: Array<{
          name: string;
          ok: boolean;
          detail: Record<string, unknown>;
        }> = [];

        for (const tu of toolUses) {
          send({ type: "tool_use", name: tu.name, input: tu.input });

          if (tu.name === "save_memory") {
            const result = await handleSaveMemory(admin, caller, tu.input);
            toolResults.push({ name: "save_memory", ...result });
            send({ type: "tool_result", name: "save_memory", ...result });
          } else if (tu.name === "get_process_status") {
            const result = await handleGetProcessStatus(caller, tu.input);
            toolResults.push({ name: "get_process_status", ...result });
            send({ type: "tool_result", name: "get_process_status", ...result });
          } else if (tu.name === "run_agent") {
            const result = await handleRunAgent(admin, caller, tu.input, persona);
            toolResults.push({ name: "run_agent", ...result });
            send({ type: "tool_result", name: "run_agent", ...result });
          }
        }

        // Si el modelo dispatchó sin texto, redactar fallback corto
        let finalText = assistantText.trim();
        if (!finalText && toolResults.length > 0) {
          const dispatched = toolResults.find(
            (t) => t.name === "run_agent" && t.ok,
          );
          if (dispatched) {
            const agent = dispatched.detail.agent as string | undefined;
            finalText = agent
              ? `Listo, dispatché ${agent}. Te aviso cuando termine.`
              : "Listo, dispatché el agente.";
          } else {
            finalText = "Procesado.";
          }
        }

        // Persistir respuesta del assistant + bump conversation
        const persistContent =
          buildAssistantPersistedContent(finalText, toolResults);
        await admin.from("consultant_messages").insert({
          conversation_id: conversation!.id,
          role: "assistant",
          content: persistContent,
          is_welcome: false,
          is_briefing: false,
        });

        const updatePayload: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };
        if (!conversation!.title) {
          const trimmed = lastUserMessage.content.trim().replace(/\s+/g, " ");
          updatePayload.title =
            trimmed.length > TITLE_MAX_CHARS
              ? trimmed.slice(0, TITLE_MAX_CHARS).trim() + "…"
              : trimmed;
        }
        await admin
          .from("consultant_conversations")
          .update(updatePayload)
          .eq("id", conversation!.id);

        await recordApiUsage({
          source: "dashboard:consultant-global",
          model: finalMessage.model,
          usage: finalMessage.usage,
        });

        send({
          type: "done",
          model: finalMessage.model,
          usage: {
            input: finalMessage.usage.input_tokens,
            output: finalMessage.usage.output_tokens,
            cacheCreation: finalMessage.usage.cache_creation_input_tokens ?? 0,
            cacheRead: finalMessage.usage.cache_read_input_tokens ?? 0,
          },
        });
      } catch (err) {
        const msg =
          err instanceof Anthropic.AuthenticationError
            ? "ANTHROPIC_API_KEY inválida."
            : err instanceof Anthropic.RateLimitError
            ? "Rate limit. Esperá unos segundos."
            : err instanceof Anthropic.APIError
            ? `Claude: ${err.message}`
            : err instanceof Error
            ? err.message
            : "Error inesperado";
        send({ type: "error", message: msg });
        console.error("[consultant/global] error:", err);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

// ===========================================================================
// Helpers
// ===========================================================================

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

interface PinnedConversation {
  id: string;
  title: string | null;
}

/**
 * Busca la conversación pinned (scope='global', is_pinned=true) del user. Si
 * no existe, la crea. La primera pregunta del user actualiza el title.
 */
async function ensurePinnedConversation(
  admin: SupabaseClient,
  userId: string,
  firstUserMessage: string,
  persona: string,
): Promise<PinnedConversation | null> {
  const { data: existing } = await admin
    .from("consultant_conversations")
    .select("id, title")
    .eq("user_id", userId)
    .eq("scope", "global")
    .eq("persona", persona)
    .eq("is_pinned", true)
    .maybeSingle();

  if (existing) {
    return existing as PinnedConversation;
  }

  const trimmed = firstUserMessage.trim().replace(/\s+/g, " ");
  const title =
    trimmed.length > TITLE_MAX_CHARS
      ? trimmed.slice(0, TITLE_MAX_CHARS).trim() + "…"
      : trimmed;

  const { data: created, error } = await admin
    .from("consultant_conversations")
    .insert({
      scope: "global",
      user_id: userId,
      client_id: null,
      is_pinned: true,
      persona,
      title,
    })
    .select("id, title")
    .single();

  if (error || !created) {
    console.error(
      "[consultant/global] ensurePinnedConversation insert failed:",
      error,
    );
    return null;
  }
  return created as PinnedConversation;
}

interface CacheableTextBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}

function buildSystemBlocks(
  ctx: Awaited<ReturnType<typeof loadGlobalContext>>,
  persona: PersonaConfig,
  personaExtraContext: string | null,
): CacheableTextBlock[] {
  const blocks: CacheableTextBlock[] = [
    {
      // Base + identidad de la persona. Cacheable: el par (base, persona)
      // es estable entre turnos de un mismo chat.
      type: "text",
      text: persona.systemExtra
        ? `${GLOBAL_SYSTEM_PROMPT_BASE}\n\n${persona.systemExtra}`
        : GLOBAL_SYSTEM_PROMPT_BASE,
      cache_control: { type: "ephemeral" },
    },
    // Contexto extra de la persona. Los digests (cambian 1×/día) se cachean;
    // los snapshots vivos (finanzas) no. Con esto quedan ≤3 breakpoints de
    // cache (máximo de la API: 4).
    ...(personaExtraContext
      ? [
          {
            type: "text" as const,
            text: personaExtraContext,
            ...(persona.cacheExtraContext
              ? { cache_control: { type: "ephemeral" as const } }
              : {}),
          },
        ]
      : []),
    {
      // Contexto agregado de toda la agencia para el caller. Cambia entre
      // turnos (runs nuevos, requests nuevas), no cacheamos.
      type: "text",
      text: buildGlobalContextBlock(ctx),
    },
    {
      type: "text",
      text: buildUserMemoryBlock(ctx.userMemory),
    },
  ];

  if (ctx.activeClient) {
    blocks.push({
      // Vault + bundle del cliente activo. Cachear porque es grande y rara
      // vez cambia entre turnos consecutivos.
      type: "text",
      text: buildActiveClientBlock(ctx.activeClient),
      cache_control: { type: "ephemeral" },
    });
  }

  return blocks;
}

function buildTools(persona: PersonaConfig): Anthropic.Tool[] {
  const tools: Anthropic.Tool[] = [];

  if (persona.tools.runAgent) {
    // Enum restringido a la flota de la persona (y validado DE NUEVO
    // server-side en handleRunAgent — el enum solo guía al modelo).
    const agentEnum = persona.allowedAgentKeys ?? DISPATCHABLE_AGENTS;
    tools.push({
      name: "run_agent",
      description:
        "Dispatch un agente operativo vía GitHub Actions. Single-turn: lanzás el agente y avisás. El user verá el resultado cuando termine — no esperás la salida en este mismo turno.",
      input_schema: {
        type: "object",
        properties: {
          agent: {
            type: "string",
            enum: [...agentEnum],
            description: "El agente a dispatchar.",
          },
          client: {
            type: "string",
            description:
              "Slug del cliente sobre el que corre el agente. Tiene que estar en los clientes accesibles del user.",
          },
          brief: {
            type: "object",
            description:
              "Brief específico del agente (ej. pieceType+angle para creative-assistant, mode+question para reporting query). NO incluyas 'client' acá — va en el campo de arriba.",
          },
          reason: {
            type: "string",
            description: "Una frase corta sobre el porqué del dispatch.",
          },
        },
        required: ["agent", "client", "brief"],
      },
    });
  }

  if (persona.tools.processStatus) {
    tools.push({
      name: "get_process_status",
      description:
        "Estado de los procesos multi-paso (onboarding, ciclo de contenido del mes, reporte mensual) de un cliente o de todos. Usala cuando pregunten '¿en qué estamos con X?', '¿qué sigue?', o antes de proponer arrancar un ciclo — así proponés el paso que destrabe el gate real, no uno inventado.",
      input_schema: {
        type: "object",
        properties: {
          client: {
            type: "string",
            description:
              "Slug del cliente. Omitilo para ver el estado de TODOS los clientes accesibles.",
          },
        },
      },
    });
  }

  if (persona.tools.saveMemory) {
    tools.push({
      name: "save_memory",
      description:
        "Guardar una pieza de contexto durable (preference, constraint, past_decision, learning). Llamala en silencio cuando detectes algo nuevo del user (scope='user') o del cliente activo (scope='client'). No pidas permiso.",
      input_schema: {
        type: "object",
        properties: {
          scope: {
            type: "string",
            enum: ["user", "client"],
            description:
              "user = preferencia/regla del miembro del team con quien hablás. client = preferencia/regla atada a un cliente (requiere field 'client').",
          },
          client: {
            type: "string",
            description:
              "Slug del cliente. Requerido si scope='client'. Tiene que estar en los clientes accesibles del user.",
          },
          kind: {
            type: "string",
            enum: ["preference", "constraint", "past_decision", "learning"],
          },
          content: {
            type: "string",
            description:
              "La memoria en una oración, primera persona cuando aplique ('Prefiero copy corto').",
          },
          importance: {
            type: "integer",
            minimum: 1,
            maximum: 5,
            description: "1=trivia, 3=preferencia, 5=regla dura.",
          },
        },
        required: ["scope", "kind", "content"],
      },
    });
  }

  return tools;
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

interface ToolResult {
  ok: boolean;
  detail: Record<string, unknown>;
}

async function handleSaveMemory(
  admin: SupabaseClient,
  caller: CallerContext,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const scope = input.scope as "user" | "client";
  const kind = input.kind as
    | "preference"
    | "constraint"
    | "past_decision"
    | "learning";
  const content = (input.content as string | undefined)?.slice(0, 1000);
  const importance =
    typeof input.importance === "number"
      ? Math.max(1, Math.min(5, Math.round(input.importance)))
      : 3;

  if (!scope || !kind || !content) {
    return { ok: false, detail: { error: "Faltan scope/kind/content." } };
  }

  if (scope === "user") {
    const { error } = await admin.from("consultant_memory_v2").insert({
      scope_type: "user",
      user_id: caller.userId,
      kind,
      content,
      importance,
    });
    if (error) return { ok: false, detail: { error: error.message } };
    return { ok: true, detail: { scope: "user", kind, content } };
  }

  // scope='client'
  const client = input.client as string | undefined;
  if (!client) {
    return { ok: false, detail: { error: "scope=client requiere field 'client'." } };
  }
  if (
    caller.role === "team" &&
    !caller.clientAssignments.includes(client)
  ) {
    return {
      ok: false,
      detail: { error: `No tenés acceso al cliente '${client}'.` },
    };
  }
  const { error } = await admin.from("consultant_memory_v2").insert({
    scope_type: "client",
    client_id: client,
    kind,
    content,
    importance,
  });
  if (error) return { ok: false, detail: { error: error.message } };
  return { ok: true, detail: { scope: "client", client, kind, content } };
}

/**
 * Estado de procesos (Stage 3/4). Team solo ve sus clientes asignados;
 * director ve todo.
 */
async function handleGetProcessStatus(
  caller: CallerContext,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const client = input.client as string | undefined;
  if (
    client &&
    caller.role === "team" &&
    !caller.clientAssignments.includes(client)
  ) {
    return { ok: false, detail: { error: `No tenés acceso al cliente '${client}'.` } };
  }
  const rows = await getProcessStatus(client);
  const visible =
    caller.role === "team"
      ? rows.filter((r) => caller.clientAssignments.includes(r.client_id))
      : rows;
  if (visible.length === 0) {
    return {
      ok: true,
      detail: { procesos: [], nota: "Sin instancias sincronizadas todavía (el sync corre a diario)." },
    };
  }
  return {
    ok: true,
    detail: {
      procesos: visible.map((r) => ({
        cliente: r.client_name ?? r.client_id,
        proceso: r.process,
        periodo: r.period,
        paso: r.step,
        estado: r.status,
        gate_bloqueante: r.gate,
      })),
    },
  };
}

async function handleRunAgent(
  admin: SupabaseClient,
  caller: CallerContext,
  input: Record<string, unknown>,
  persona: PersonaConfig,
): Promise<ToolResult> {
  const agent = input.agent as DispatchableAgent | undefined;
  const client = input.client as string | undefined;
  const brief = (input.brief as Record<string, unknown>) ?? {};
  const reason = input.reason as string | undefined;

  if (!agent || !DISPATCHABLE_AGENTS.includes(agent)) {
    return { ok: false, detail: { error: `Agente inválido: ${agent}` } };
  }
  // Restricción por persona (server-side — no confiamos solo en el enum):
  // un gerente de área solo dispatcha SU flota.
  if (!persona.tools.runAgent) {
    return {
      ok: false,
      detail: { error: `La persona '${persona.name}' no dispatcha agentes.` },
    };
  }
  if (persona.allowedAgentKeys && !persona.allowedAgentKeys.includes(agent)) {
    return {
      ok: false,
      detail: {
        error: `'${agent}' no es de la flota de ${persona.name} (${persona.allowedAgentKeys.join(", ")}). Pedíselo al Gerente General.`,
      },
    };
  }
  if (!client || typeof client !== "string") {
    return { ok: false, detail: { error: "Falta el slug del cliente." } };
  }
  if (
    caller.role === "team" &&
    !caller.clientAssignments.includes(client)
  ) {
    return {
      ok: false,
      detail: {
        error: `No tenés acceso al cliente '${client}'. Pedíselo al director.`,
      },
    };
  }

  // Guardrails del registry (Stage 4): rol permitido + techo de gasto
  // mensual del agente. El consultor le explica el motivo al usuario.
  const guard = await enforceAgentGuardrails(
    agent,
    caller.role === "director" ? "director" : "team",
  );
  if (!guard.ok) {
    return { ok: false, detail: { error: guard.error } };
  }

  // Insertar agent_runs row (status=running)
  const { data: run, error: insertError } = await admin
    .from("agent_runs")
    .insert({
      client,
      agent,
      status: "running",
      summary: reason ?? "dispatched from consultant (global)",
      metadata: {
        brief,
        source: "consultant-global",
        reason,
        triggered_by_user_id: caller.userId,
      },
      performance: {},
    })
    .select("id")
    .single();

  if (insertError || !run) {
    return {
      ok: false,
      detail: { error: `Error abriendo agent_runs: ${insertError?.message}` },
    };
  }

  try {
    await dispatchAgentWorkflow({
      eventType: agent,
      payload: {
        runId: run.id,
        brief: {
          ...brief,
          client,
          source: "consultant-global",
          runId: run.id,
          triggered_by_user_id: caller.userId,
        },
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "dispatch failed";
    await admin
      .from("agent_runs")
      .update({
        status: "error",
        summary: msg,
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    return { ok: false, detail: { error: msg, runId: run.id } };
  }

  return { ok: true, detail: { agent, client, runId: run.id, reason } };
}

/**
 * Concatena el texto del assistant + un resumen estructurado de tool calls
 * para persistir en consultant_messages.content. El client renderiza ambos.
 */
function buildAssistantPersistedContent(
  text: string,
  toolResults: Array<{ name: string; ok: boolean; detail: Record<string, unknown> }>,
): string {
  if (toolResults.length === 0) return text;
  // Sufijo machine-readable inline. El widget lo parsea si quiere mostrar
  // chips; si no, queda visible como texto plano y no rompe nada.
  const blocks = toolResults
    .map((t) => {
      if (t.name === "run_agent" && t.ok) {
        const agent = t.detail.agent as string | undefined;
        const client = t.detail.client as string | undefined;
        const runId = t.detail.runId as number | undefined;
        return `\n\n_[dispatch: ${agent} para ${client}${runId ? ` · run #${runId}` : ""}]_`;
      }
      if (t.name === "save_memory" && t.ok) {
        return ""; // memoria es silenciosa, no se muestra
      }
      if (!t.ok) {
        return `\n\n_[error en ${t.name}: ${t.detail.error}]_`;
      }
      return "";
    })
    .filter(Boolean)
    .join("");
  return text + blocks;
}
