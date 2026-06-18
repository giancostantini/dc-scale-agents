/**
 * Consultor de Contenido — agente del portal de EQUIPO (director / team).
 *
 * Chat por cliente que propone ideas de contenido alineadas a la marca
 * (brandbook + estrategia del vault) Y a las últimas tendencias del nicho
 * (agente sector-trends). Complementa al Asistente Creativo: acá se idea
 * en conversación; el Asistente Creativo formaliza una idea en brief.
 *
 * Persistencia (migración 077): un hilo por (team_member, cliente) en
 * `content_ideas_threads` + mensajes en `content_ideas_messages`. Tablas
 * SOLO-EQUIPO — el cliente nunca las ve (a diferencia del consultor del
 * portal, que comparte tablas que el cliente puede listar por client_id).
 *
 *   GET  → { messages: [{ role, content }] }  (hilo del caller, o vacío)
 *   POST { messages: [{ role, content }] } → { reply }
 *
 * Auth: director (global) o team asignado al cliente. El cliente final NO
 * puede usarlo (requireClientAccess + rechazo explícito de role='client').
 */

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { requireClientAccess } from "@/lib/auth-guard";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { CLAUDE_MODEL_SONNET } from "@/lib/anthropic-model";
import { recordApiUsage } from "@/lib/api-usage";
import {
  CONTENT_CONSULTANT_SYSTEM_PROMPT,
  buildContentConsultantContext,
} from "@/lib/content-consultant";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MODEL = CLAUDE_MODEL_SONNET;

interface Message {
  role: "user" | "assistant";
  content: string;
}

/** Carga el hilo del caller para este cliente (memoria entre sesiones). */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;

  const access = await requireClientAccess(req, clientId);
  if (!access.ok) return access.response;
  if (access.role === "client") {
    return Response.json(
      { error: "El Consultor de Contenido es para el equipo." },
      { status: 403 },
    );
  }

  const admin = getSupabaseAdmin();
  const { data: thread } = await admin
    .from("content_ideas_threads")
    .select("id")
    .eq("client_id", clientId)
    .eq("user_id", access.userId)
    .maybeSingle();

  if (!thread) return Response.json({ messages: [] });

  const { data: msgs } = await admin
    .from("content_ideas_messages")
    .select("id, role, content, rating")
    .eq("thread_id", thread.id)
    .order("created_at", { ascending: true });

  return Response.json({ messages: msgs ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;

  const access = await requireClientAccess(req, clientId);
  if (!access.ok) return access.response;
  if (access.role === "client") {
    return Response.json(
      { error: "El Consultor de Contenido es para el equipo." },
      { status: 403 },
    );
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return Response.json(
      { error: "Servidor no configurado (falta ANTHROPIC_API_KEY)." },
      { status: 500 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { messages?: Message[] };
  const incoming = Array.isArray(body.messages) ? body.messages : [];
  const messages: Message[] = incoming.filter(
    (m): m is Message =>
      !!m &&
      (m.role === "user" || m.role === "assistant") &&
      typeof m.content === "string" &&
      m.content.trim().length > 0,
  );

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) {
    return Response.json({ error: "Mensaje vacío." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // 1. Asegurar el hilo único (user_id + client_id).
  let threadId: string;
  const { data: existing } = await admin
    .from("content_ideas_threads")
    .select("id")
    .eq("client_id", clientId)
    .eq("user_id", access.userId)
    .maybeSingle();

  if (existing) {
    threadId = existing.id as string;
  } else {
    const title = lastUser.content.trim().replace(/\s+/g, " ").slice(0, 60);
    const { data: created, error: createErr } = await admin
      .from("content_ideas_threads")
      .insert({ client_id: clientId, user_id: access.userId, title })
      .select("id")
      .single();
    if (createErr || !created) {
      console.error("[content-consultant] create thread error:", createErr);
      return Response.json(
        { error: "No pude iniciar el hilo." },
        { status: 500 },
      );
    }
    threadId = created.id as string;
  }

  // 2. Contexto: marca + docs (vault completo) + tendencias + datos Supabase.
  const ctx = await buildContentConsultantContext(admin, clientId);

  const systemBlocks: Array<{
    type: "text";
    text: string;
    cache_control?: { type: "ephemeral" };
  }> = [
    {
      type: "text",
      text: CONTENT_CONSULTANT_SYSTEM_PROMPT,
      cache_control: { type: "ephemeral" },
    },
    { type: "text", text: ctx.contextBlock },
  ];
  if (ctx.vaultBlock) {
    systemBlocks.push({
      type: "text",
      text: ctx.vaultBlock,
      cache_control: { type: "ephemeral" },
    });
  }
  if (ctx.trendsBlock) {
    systemBlocks.push({
      type: "text",
      text: ctx.trendsBlock,
      cache_control: { type: "ephemeral" },
    });
  }
  if (ctx.learningsBlock) {
    // Directivas + aprendizajes acumulados (memoria del cliente). Es lo que
    // hace que el consultor se afine con el tiempo. Cacheado (estable en la sesión).
    systemBlocks.push({
      type: "text",
      text: ctx.learningsBlock,
      cache_control: { type: "ephemeral" },
    });
  }

  const anthropic = new Anthropic({ apiKey: anthropicKey });

  let response;
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1800,
      system: systemBlocks,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
  } catch (err) {
    console.error("[content-consultant] anthropic error:", err);
    return Response.json(
      {
        error: "El consultor no pudo responder.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }

  const textBlock = response.content.find((b) => b.type === "text");
  const reply =
    textBlock && textBlock.type === "text"
      ? textBlock.text.trim()
      : "No tengo una respuesta para eso ahora.";

  // 4. Persistir el turno (user + assistant) recién ahora — así un fallo de
  //    la API no deja un mensaje 'user' colgado que rompa la alternancia del
  //    próximo turno (Anthropic exige user/assistant alternados).
  //    Inserts SECUENCIALES (no un array): así cada fila toma un now()
  //    distinto y el ORDER BY created_at del GET las devuelve en orden.
  await admin.from("content_ideas_messages").insert({
    thread_id: threadId,
    role: "user",
    content: lastUser.content.trim(),
  });
  const { data: assistantMsg } = await admin
    .from("content_ideas_messages")
    .insert({ thread_id: threadId, role: "assistant", content: reply })
    .select("id")
    .single();
  await admin
    .from("content_ideas_threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", threadId);

  await recordApiUsage({
    source: "dashboard:content-consultant",
    clientId,
    model: response.model,
    usage: response.usage,
  });

  // messageId → el panel lo usa para el 👍/👎 sobre esta respuesta.
  return Response.json({ reply, messageId: assistantMsg?.id ?? null });
}

/**
 * PATCH → setea el rating 👍/👎 de una respuesta del asistente.
 * Body: { messageId: string, rating: 1 | -1 | null }.
 * Solo el dueño del hilo (caller) puede calificar, y solo mensajes del asistente.
 * Es la señal de calidad que consume el destilador de aprendizajes.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;

  const access = await requireClientAccess(req, clientId);
  if (!access.ok) return access.response;
  if (access.role === "client") {
    return Response.json(
      { error: "El Consultor de Contenido es para el equipo." },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    messageId?: string;
    rating?: number | null;
  };
  const messageId = body.messageId;
  const rating = body.rating ?? null;
  if (!messageId) {
    return Response.json({ error: "messageId requerido." }, { status: 400 });
  }
  if (rating !== 1 && rating !== -1 && rating !== null) {
    return Response.json(
      { error: "rating inválido (1, -1 o null)." },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdmin();

  // Verificar pertenencia: el mensaje (assistant) debe estar en un hilo del
  // caller para ESTE cliente. Dos queries simples (claro y robusto).
  const { data: msg } = await admin
    .from("content_ideas_messages")
    .select("id, role, thread_id")
    .eq("id", messageId)
    .maybeSingle();
  if (!msg || msg.role !== "assistant") {
    return Response.json({ error: "Mensaje no encontrado." }, { status: 404 });
  }
  const { data: thread } = await admin
    .from("content_ideas_threads")
    .select("user_id, client_id")
    .eq("id", msg.thread_id)
    .maybeSingle();
  if (
    !thread ||
    thread.client_id !== clientId ||
    thread.user_id !== access.userId
  ) {
    return Response.json({ error: "Sin acceso a ese mensaje." }, { status: 403 });
  }

  await admin
    .from("content_ideas_messages")
    .update({ rating })
    .eq("id", messageId);

  return Response.json({ ok: true });
}
