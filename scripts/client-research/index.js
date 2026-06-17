/**
 * Client Research Agent — enriquecimiento progresivo de clientes "flacos".
 *
 * Cuando un cliente nuevo no tiene material cargado (caso Glassy Waves: solo
 * identidad, kickoff vacío, sin brand/), este agente investiga la empresa con
 * BÚSQUEDA WEB real y vuelca lo que encuentra al vault — SIEMPRE citando la
 * fuente con link, y marcado como "provisional / sin validar".
 *
 * Reglas clave (anti-alucinación):
 *  - Escribe a `learning-log.md`, que es INTERNO (el Consultor-Cliente NO lo lee
 *    — ver vault/CLAUDE.md "Visibilidad al cliente"). NO toca `claude-client.md`
 *    (los campos canónicos). El equipo revisa y "promueve" a mano lo que confirme.
 *  - Cada afirmación con su fuente. Si no encuentra algo, lo dice — no inventa.
 *
 * Usage:
 *   node scripts/client-research/index.js --brief /tmp/brief.json
 *   brief: { client, seed?: { website?, socials?, notes? }, runId?, triggered_by_user_id? }
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import {
  fetchClient,
  logAgentRun,
  logAgentError,
  updateAgentRun,
  registerAgentOutput,
  pushNotification,
} from "../lib/supabase.js";
import { recordApiUsage } from "../lib/supabase.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VAULT = resolve(__dirname, "../../vault");
const AGENT = "client-research";
const MODEL = "claude-sonnet-4-6";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ---------------------------------------------------------------------------
// Brief + vault helpers
// ---------------------------------------------------------------------------

function loadBrief() {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--brief");
  if (idx !== -1 && args[idx + 1]) {
    const path = resolve(process.cwd(), args[idx + 1]);
    return JSON.parse(readFileSync(path, "utf-8"));
  }
  const positional = args.filter((a) => !a.startsWith("--"))[0];
  return { client: positional };
}

function readVaultFile(rel) {
  try {
    return readFileSync(resolve(VAULT, rel), "utf-8");
  } catch {
    return null;
  }
}

function appendToVaultFile(rel, content) {
  // mkdirSync recursive: si el vault del cliente no existe todavía, sin esto
  // writeFileSync tira ENOENT y se pierde el output.
  const filePath = resolve(VAULT, rel);
  mkdirSync(dirname(filePath), { recursive: true });
  const existing = existsSync(filePath) ? readFileSync(filePath, "utf-8") : "";
  writeFileSync(filePath, existing + "\n" + content, "utf-8");
}

// ---------------------------------------------------------------------------
// Claude + web search (con retry/backoff, igual patrón que brandbook-processor)
// ---------------------------------------------------------------------------

async function callClaudeWebSearch(
  prompt,
  { maxTokens = 4096, maxSearches = 5 } = {},
  attempt = 1,
) {
  const MAX_ATTEMPTS = 3;
  if (!ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY no está seteada. El agente client-research requiere acceso a Claude API.",
    );
  }

  let res;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        // Server tool: Anthropic ejecuta las búsquedas y devuelve el texto final
        // con citations en una sola respuesta (no hay que hacer tool loop).
        tools: [
          { type: "web_search_20250305", name: "web_search", max_uses: maxSearches },
        ],
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch (err) {
    if (attempt < MAX_ATTEMPTS) {
      const delay = 1000 * Math.pow(2, attempt - 1);
      console.warn(
        `[${AGENT}] network error (attempt ${attempt}/${MAX_ATTEMPTS}): ${err.message}. Retry en ${delay}ms...`,
      );
      await new Promise((r) => setTimeout(r, delay));
      return callClaudeWebSearch(prompt, { maxTokens, maxSearches }, attempt + 1);
    }
    throw new Error(
      `Claude API network error tras ${MAX_ATTEMPTS} intentos: ${err.message ?? err}`,
    );
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "(sin body)");
    const isRetriable = res.status === 429 || res.status >= 500;
    if (isRetriable && attempt < MAX_ATTEMPTS) {
      const delay = 1000 * Math.pow(2, attempt - 1);
      console.warn(
        `[${AGENT}] Claude API ${res.status} (attempt ${attempt}/${MAX_ATTEMPTS}). Retry en ${delay}ms...`,
      );
      await new Promise((r) => setTimeout(r, delay));
      return callClaudeWebSearch(prompt, { maxTokens, maxSearches }, attempt + 1);
    }
    throw new Error(`Claude API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  recordApiUsage({
    source: "agent:client-research",
    model: "claude-sonnet-4-6",
    usage: data.usage,
  }).catch(() => {});
  return extractTextAndSources(data);
}

/**
 * Parsea la respuesta de web search: concatena los bloques de texto y junta
 * las fuentes (de las `citations` de cada bloque de texto + de los resultados
 * de búsqueda crudos como fallback).
 */
function extractTextAndSources(data) {
  const blocks = Array.isArray(data?.content) ? data.content : [];
  let text = "";
  const sourceMap = new Map(); // url -> title (dedupe por url)

  for (const b of blocks) {
    if (b.type === "text") {
      text += b.text;
      for (const c of b.citations ?? []) {
        if (c?.url) sourceMap.set(c.url, c.title || c.url);
      }
    } else if (b.type === "web_search_tool_result") {
      const results = Array.isArray(b.content) ? b.content : [];
      for (const r of results) {
        if (r?.type === "web_search_result" && r.url && !sourceMap.has(r.url)) {
          sourceMap.set(r.url, r.title || r.url);
        }
      }
    }
  }

  const sources = Array.from(sourceMap, ([url, title]) => ({ url, title }));
  return { text: text.trim(), sources };
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildPrompt(client, clientRow, header, seed) {
  const name = clientRow?.name || client;
  const sector = clientRow?.sector || "(desconocido)";

  const seedLines = [];
  if (seed?.website) seedLines.push(`- Web: ${seed.website}`);
  if (seed?.socials) {
    const s = Array.isArray(seed.socials) ? seed.socials.join(", ") : seed.socials;
    seedLines.push(`- Redes: ${s}`);
  }
  if (seed?.notes) seedLines.push(`- Notas del equipo: ${seed.notes}`);

  return `Sos un analista de research de D&C Scale Partners. Tu trabajo es investigar a un cliente del que tenemos POCA información, usando BÚSQUEDA WEB, para que el equipo y los agentes entiendan cómo trabajar para esa marca.

CLIENTE: ${name}
SECTOR: ${sector}
${seedLines.length ? `PISTAS DEL EQUIPO:\n${seedLines.join("\n")}` : "Sin pistas adicionales — arrancá por el nombre + sector."}

--- CONTEXTO ACTUAL DEL VAULT (puede estar casi vacío) ---
${header || "(sin claude-client.md)"}
--- FIN CONTEXTO ---

INSTRUCCIONES:
1. Usá la herramienta de búsqueda web para encontrar la empresa (sitio oficial, redes, prensa, reseñas).
2. Investigá y resumí, en español, lo siguiente:
   - Qué hace / productos o servicios principales
   - Propuesta de valor y diferencial
   - Cliente ideal aparente (a quién le vende)
   - Competidores directos
   - Tendencias o contexto del sector relevantes hoy
   - Canales donde está activa (Instagram, TikTok, web, etc.)
3. REGLA DE ORO — citá la fuente de CADA afirmación (referenciá el link inline). Si no encontrás un dato, escribí literalmente "No encontrado en la web — pedir al equipo". NO inventes ni asumas: es preferible decir "no encontrado" a rellenar con genéricos.
4. Cuidado con homónimos: si hay ambigüedad sobre cuál empresa es, decilo y mostrá las candidatas con sus links en vez de elegir una al azar.

FORMATO DE SALIDA (Markdown, sin texto antes ni después):
## Qué es ${name}
## Propuesta de valor y diferencial
## Cliente ideal (aparente)
## Competidores
## Tendencias del sector
## Canales activos
## Dudas / falta confirmar con el equipo

Recordá: esto es investigación PROVISIONAL para el equipo, no contenido para el cliente. Honestidad sobre completitud > parecer exhaustivo.`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function run(briefInput) {
  const startTime = Date.now();
  const brief = briefInput ?? loadBrief();
  const client = brief.client;
  const runId = brief.runId ?? null;

  if (!client || typeof client !== "string" || !client.trim()) {
    throw new Error(
      "client-research requiere brief.client (slug del cliente). No hay defaults.",
    );
  }

  console.log(`[${AGENT}] investigando ${client} vía búsqueda web...`);

  const clientRow = await fetchClient(client);
  const header = readVaultFile(`clients/${client}/claude-client.md`);
  const seed = brief.seed ?? null;

  const prompt = buildPrompt(client, clientRow, header, seed);
  const { text, sources } = await callClaudeWebSearch(prompt, {
    maxTokens: 4096,
    maxSearches: 5,
  });

  if (!text) {
    throw new Error(
      "Claude devolvió investigación vacía (¿la búsqueda web no trajo resultados?).",
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const sourcesBlock = sources.length
    ? `\n### Fuentes\n${sources.map((s) => `- [${s.title}](${s.url})`).join("\n")}`
    : `\n### Fuentes\n_No se registraron fuentes citadas — revisar manualmente antes de usar._`;

  const entry = [
    `\n---`,
    `## 🔎 Investigación automática (PROVISIONAL — sin validar) — ${today}`,
    `> Generado por el agente \`client-research\` vía búsqueda web. NO es canónico:`,
    `> el equipo revisa y promueve a \`claude-client.md\` solo lo que confirme.`,
    `> Este archivo (learning-log) es interno — el cliente NO lo ve.`,
    ``,
    text,
    sourcesBlock,
    ``,
  ].join("\n");

  appendToVaultFile(`clients/${client}/learning-log.md`, entry);
  console.log(
    `[${AGENT}] research escrito en learning-log.md (${sources.length} fuentes citadas)`,
  );

  const displayName = clientRow?.name || client;
  const summary = `Investigación web de ${displayName}: ${sources.length} fuentes`;
  const bodyMd = `${text}\n${sourcesBlock}`;

  await registerAgentOutput(runId, client, AGENT, {
    output_type: "client-research",
    title: `Investigación — ${displayName}`,
    body_md: bodyMd,
    structured: { sources, generatedAt: today, provisional: true },
  });

  if (runId) {
    await updateAgentRun(runId, {
      status: "success",
      summary,
      summary_md: bodyMd,
      performance: { duration_ms: Date.now() - startTime, sources: sources.length },
    });
  } else {
    await logAgentRun(
      client,
      AGENT,
      "success",
      summary,
      { sources: sources.length },
      { duration_ms: Date.now() - startTime },
    );
  }

  await pushNotification(
    client,
    "info",
    `Investigación lista para ${displayName}`,
    `${sources.length} fuentes citadas. Revisá en learning-log y promové a claude-client.md lo confirmado.`,
    {
      agent: AGENT,
      link: `/cliente/${client}/biblioteca`,
      to_user_id: brief.triggered_by_user_id ?? null,
    },
  );

  console.log(`[${AGENT}] done.`);
  return { client, sources: sources.length };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const isMain =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  try {
    await run();
  } catch (err) {
    console.error(`[${AGENT}] failed:`, err.message);
    const fb = (() => {
      try {
        return loadBrief();
      } catch {
        return { client: "_unknown", runId: null };
      }
    })();
    try {
      await logAgentError(fb.client ?? "_unknown", AGENT, err);
      if (fb.runId) {
        await updateAgentRun(fb.runId, { status: "error", summary: err.message });
      }
      await pushNotification(
        fb.client ?? "_unknown",
        "error",
        `client-research falló`,
        err.message,
        { agent: AGENT, to_user_id: fb.triggered_by_user_id ?? null },
      );
    } catch (logErr) {
      console.error(`[${AGENT}] failed to log error:`, logErr.message);
    }
    // Drain HTTP antes de exit para no perder el log del error.
    await new Promise((r) => setTimeout(r, 800));
    process.exit(1);
  }
}
