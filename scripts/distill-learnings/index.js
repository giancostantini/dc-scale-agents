/**
 * distill-learnings — destilador de aprendizajes (loop de aprendizaje compartido).
 *
 * Revisa las interacciones recientes del Consultor de Contenido de un cliente
 * (tabla `content_ideas_messages`, con su rating 👍/👎) y destila unos pocos
 * APRENDIZAJES nuevos: preferencias de estilo, anti-patrones (lo que recibió 👎),
 * temas que se repiten. Los guarda en `consultant_memory_v2` (scope_type='client',
 * kind='learning').
 *
 * Por qué acá: TODA la flota ya lee `consultant_memory_v2`
 * (scripts/lib/client-memory.js + consultor global + Consultor de Contenido), así
 * que escribir ahí afina a todos los agentes SIN sumar tokens por consulta. El
 * único gasto nuevo es esta pasada — barata: modelo Haiku, incremental (solo lo
 * nuevo desde la última corrida), capada.
 *
 * Uso (1 cliente por invocación, como sector-trends):
 *   node scripts/distill-learnings/index.js --brief /tmp/brief.json
 *   brief.json = { "client": "<slug>", "source": "scheduled" }
 */

import { readFileSync } from "node:fs";
import {
  select,
  upsertRows,
  logAgentRun,
  logAgentError,
  updateAgentRun,
} from "../lib/supabase.js";
import { fetchClientMemory } from "../lib/client-memory.js";
import { callClaude, CLAUDE_MODEL_HAIKU } from "../lib/anthropic.js";

const AGENT = "distill-learnings";
const MIN_NEW_MESSAGES = 4; // < 2 turnos nuevos → no vale la pasada
const MAX_TRANSCRIPT_MESSAGES = 40;
const MAX_MSG_CHARS = 500;
const MAX_NEW_LEARNINGS = 5;

const VALID_KINDS = ["preference", "constraint", "past_decision", "learning"];

const SYSTEM_PROMPT = `Sos un analista que destila APRENDIZAJES accionables para afinar a un Consultor de Contenido (un asistente que escribe el texto de placas/statics para redes, alineado a la marca de un cliente).

Te paso (1) la conversación reciente entre el equipo (la CM) y el consultor — con marcas [👍] / [👎] donde la CM calificó la respuesta — y (2) los aprendizajes que YA tenemos guardados de este cliente.

Tu tarea: devolver SOLO aprendizajes NUEVOS (que no estén ya en la lista). Enfocate en:
- Preferencias de estilo/forma que se repiten o que la CM marcó 👍 (ej. "prefiere títulos de 4-6 palabras", "le funcionan los carruseles de 5 placas").
- Anti-patrones: lo que recibió 👎 (ej. "evitar emojis en el título de la placa").
- Temas o ángulos que la CM pide seguido.
- Restricciones de marca que hayan surgido en la charla.

Reglas:
- Máximo ${MAX_NEW_LEARNINGS} aprendizajes. Si no hay nada nuevo y claro, devolvé [].
- Cada uno corto, concreto y accionable (una línea). Nada genérico ("hacer buen contenido" NO sirve).
- NO repitas ni reformules lo que ya está en "Aprendizajes actuales".
- kind: "preference" (gusto/forma), "constraint" (regla dura), o "learning" (patrón observado).

Devolvé SOLO un array JSON, sin texto adicional ni code fences:
[{"kind":"preference","content":"...","importance":3}]`;

/** Parseo del --brief (path a un JSON). */
function readBrief() {
  const idx = process.argv.indexOf("--brief");
  if (idx === -1 || !process.argv[idx + 1]) {
    throw new Error("Falta --brief /path/to/brief.json");
  }
  return JSON.parse(readFileSync(process.argv[idx + 1], "utf-8"));
}

/** created_at del último run exitoso de este agente para el cliente (marca incremental). */
async function lastSuccessAt(client) {
  const rows = await select(
    "agent_runs",
    { client, agent: AGENT, status: "success" },
    "created_at",
    { order: "created_at.desc", limit: 1 },
  );
  return rows[0]?.created_at ?? null;
}

/** Mensajes NUEVOS (desde lastRun) del Consultor de Contenido de este cliente. */
async function fetchNewMessages(client, sinceISO) {
  // content_ideas_messages se ata al cliente vía content_ideas_threads.
  const threads = await select(
    "content_ideas_threads",
    { client_id: client },
    "id",
    { limit: 50 },
  );
  if (!threads.length) return [];

  const all = [];
  for (const t of threads) {
    const msgs = await select(
      "content_ideas_messages",
      { thread_id: t.id },
      "role,content,rating,created_at",
      { order: "created_at.desc", limit: 60 },
    );
    all.push(...msgs);
  }
  // Filtrar a lo nuevo + ordenar cronológico.
  const fresh = all
    .filter((m) => !sinceISO || (m.created_at && m.created_at > sinceISO))
    .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
  return fresh.slice(-MAX_TRANSCRIPT_MESSAGES);
}

function buildTranscript(messages) {
  return messages
    .map((m) => {
      const body =
        m.content.length > MAX_MSG_CHARS
          ? m.content.slice(0, MAX_MSG_CHARS) + "…"
          : m.content;
      if (m.role === "user") return `CM: ${body}`;
      const mark = m.rating === 1 ? " [👍]" : m.rating === -1 ? " [👎]" : "";
      return `Consultor${mark}: ${body}`;
    })
    .join("\n");
}

/** Parseo defensivo del array JSON que devuelve Haiku. */
function parseLearnings(text) {
  if (!text) return [];
  let raw = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return [];
  let arr;
  try {
    arr = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .filter(
      (x) =>
        x &&
        typeof x.content === "string" &&
        x.content.trim().length > 0 &&
        VALID_KINDS.includes(x.kind),
    )
    .slice(0, MAX_NEW_LEARNINGS)
    .map((x) => ({
      kind: x.kind,
      content: x.content.trim(),
      importance: Math.min(5, Math.max(1, Number(x.importance) || 3)),
    }));
}

/** Dedup local contra la memoria existente (evita reinsertar lo mismo). */
function dropDuplicates(candidates, existing) {
  const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const seen = new Set(existing.map((e) => norm(e.content)));
  const out = [];
  for (const c of candidates) {
    const n = norm(c.content);
    if (seen.has(n)) continue;
    // descarte por inclusión (uno contiene al otro)
    if ([...seen].some((s) => s.includes(n) || n.includes(s))) continue;
    seen.add(n);
    out.push(c);
  }
  return out;
}

async function run() {
  const startTime = Date.now();
  const brief = readBrief();
  const client = brief.client;
  if (!client) throw new Error("brief.client requerido");

  const sinceISO = await lastSuccessAt(client);
  const messages = await fetchNewMessages(client, sinceISO);

  if (messages.length < MIN_NEW_MESSAGES) {
    await logAgentRun(
      client,
      AGENT,
      "success",
      `Sin novedades suficientes (${messages.length} mensajes nuevos)`,
      { new_messages: messages.length, since: sinceISO },
      { duration_ms: Date.now() - startTime },
    );
    console.log(`[${AGENT}] ${client}: sin novedades (${messages.length} msgs).`);
    return;
  }

  const existing = await fetchClientMemory(client, 30);
  const existingList = existing.length
    ? existing.map((e) => `- [${e.kind}] ${e.content}`).join("\n")
    : "(ninguno todavía)";

  const prompt = [
    "CONVERSACIÓN RECIENTE (CM ↔ Consultor de Contenido):",
    buildTranscript(messages),
    "",
    "APRENDIZAJES ACTUALES (no los repitas):",
    existingList,
  ].join("\n");

  const { text } = await callClaude(prompt, {
    model: CLAUDE_MODEL_HAIKU,
    maxTokens: 1024,
    system: SYSTEM_PROMPT,
    source: `agent:${AGENT}`,
    client,
  });

  const candidates = parseLearnings(text);
  const fresh = dropDuplicates(candidates, existing);

  if (fresh.length > 0) {
    await upsertRows(
      "consultant_memory_v2",
      fresh.map((f) => ({
        scope_type: "client",
        client_id: client,
        kind: f.kind,
        content: f.content,
        importance: f.importance,
      })),
    );
  }

  await logAgentRun(
    client,
    AGENT,
    "success",
    `${fresh.length} aprendizaje(s) nuevo(s) de ${messages.length} mensajes`,
    {
      new_messages: messages.length,
      learnings_added: fresh.length,
      since: sinceISO,
    },
    { duration_ms: Date.now() - startTime },
  );
  console.log(
    `[${AGENT}] ${client}: +${fresh.length} aprendizajes (de ${messages.length} msgs nuevos).`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch(async (err) => {
    console.error(`[${AGENT}] error:`, err);
    let client = "unknown";
    try {
      client = readBrief().client ?? "unknown";
    } catch {
      /* brief ilegible */
    }
    await logAgentError(client, AGENT, err).catch(() => {});
    // Drain de los logs HTTP antes de morir (patrón de robustez del repo).
    await new Promise((r) => setTimeout(r, 800));
    process.exit(1);
  });
}
