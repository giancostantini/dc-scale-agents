/**
 * Sector Trends Agent — tendencias del nicho, por cliente, semanales.
 *
 * Trae con BÚSQUEDA WEB las tendencias recientes y ACCIONABLES del nicho del
 * cliente — con foco principal en CONTENIDO (qué se está volviendo viral, qué
 * genera tráfico, qué convierte) además de noticias/publicidad/ofertas del
 * sector. Cada tendencia cita su fuente con link.
 *
 * Específico a la EMPRESA y su MERCADO (no genérico del rubro mundial).
 *
 * Escribe:
 *  - `vault/clients/<slug>/sector-trends.md` (CLIENT-VISIBLE) — última foto.
 *    Lo lee el portal/Advisor Y los agentes de contenido (retroalimentación).
 *  - `agent_outputs` (output_type="sector-trends") con items estructurados —
 *    fuente de datos para el portal, el mail y la vista interna consolidada.
 *
 * Guardrail anti-alucinación: si no hay señales reales, lo dice; no inventa.
 *
 * Usage:
 *   node scripts/sector-trends/index.js --brief /tmp/brief.json
 *   brief: { client, seed?: { website?, socials?, notes? }, runId?, triggered_by_user_id? }
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const VAULT = resolve(__dirname, "../../vault");
const AGENT = "sector-trends";
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

function writeVaultFile(rel, content) {
  // mkdirSync recursive: si el vault del cliente no existe, sin esto
  // writeFileSync tira ENOENT y se pierde el output.
  const filePath = resolve(VAULT, rel);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf-8");
}

// ---------------------------------------------------------------------------
// Claude + web search (retry/backoff — mismo patrón que client-research)
// ---------------------------------------------------------------------------

async function callClaudeWebSearch(
  prompt,
  { maxTokens = 4096, maxSearches = 6 } = {},
  attempt = 1,
) {
  const MAX_ATTEMPTS = 3;
  if (!ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY no está seteada. El agente sector-trends requiere acceso a Claude API.",
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
  return extractTextAndSources(data);
}

/** Concatena los bloques de texto + junta fuentes (citations + resultados crudos). */
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
// Estructura los ítems vía tool_use FORZADO (segunda llamada, sin web search).
// La API valida el input contra el schema → el JSON no puede salir truncado ni
// mal escapado (era la causa del "Unterminated string" / "0 items"). Si falla,
// devuelve [] (non-fatal): el agente igual guarda el markdown + fuentes.
// ---------------------------------------------------------------------------

const REPORT_TOOL = {
  name: "report_sector_trends",
  description:
    "Reporta las tendencias del nicho como ítems estructurados, extraídos del análisis provisto.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        description: "5 a 10 tendencias accionables del análisis.",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Título corto de la tendencia." },
            summary: { type: "string", description: "1-2 frases accionables." },
            category: {
              type: "string",
              enum: [
                "contenido",
                "trafico",
                "ventas",
                "noticias",
                "publicidad",
                "estacional",
              ],
            },
            sourceTitle: { type: "string", description: "Nombre de la fuente." },
            sourceUrl: { type: "string", description: "URL de la fuente." },
          },
          required: ["title"],
        },
      },
    },
    required: ["items"],
  },
};

async function structureTrends(rawText, attempt = 1) {
  const MAX_ATTEMPTS = 3;
  if (!rawText || !rawText.trim()) return [];

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
        max_tokens: 4096,
        tools: [REPORT_TOOL],
        tool_choice: { type: "tool", name: "report_sector_trends" },
        messages: [
          {
            role: "user",
            content: `Extraé las tendencias del siguiente análisis como ítems estructurados (categoría correcta + fuente con su URL real cuando esté en el texto). NO inventes datos que no estén en el análisis.\n\n${rawText}`,
          },
        ],
      }),
    });
  } catch (err) {
    if (attempt < MAX_ATTEMPTS) {
      const delay = 1000 * Math.pow(2, attempt - 1);
      console.warn(
        `[${AGENT}] structureTrends network error (attempt ${attempt}): ${err.message}. Retry en ${delay}ms...`,
      );
      await new Promise((r) => setTimeout(r, delay));
      return structureTrends(rawText, attempt + 1);
    }
    console.warn(`[${AGENT}] structureTrends falló (network) — sigo sin items: ${err.message}`);
    return [];
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "(sin body)");
    const isRetriable = res.status === 429 || res.status >= 500;
    if (isRetriable && attempt < MAX_ATTEMPTS) {
      const delay = 1000 * Math.pow(2, attempt - 1);
      console.warn(
        `[${AGENT}] structureTrends ${res.status} (attempt ${attempt}). Retry en ${delay}ms...`,
      );
      await new Promise((r) => setTimeout(r, delay));
      return structureTrends(rawText, attempt + 1);
    }
    console.warn(`[${AGENT}] structureTrends API error ${res.status}: ${errText} — sigo sin items.`);
    return [];
  }

  const data = await res.json();
  const blocks = Array.isArray(data?.content) ? data.content : [];
  const toolBlock = blocks.find(
    (b) => b.type === "tool_use" && b.name === "report_sector_trends",
  );
  const items = toolBlock?.input?.items;
  if (!Array.isArray(items)) return [];
  return items.filter(
    (i) => i && typeof i.title === "string" && i.title.trim(),
  );
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildPrompt(client, clientRow, header, seed, today) {
  const name = clientRow?.name || client;
  const sector = clientRow?.sector || "(sin especificar)";

  const seedLines = [];
  if (seed?.website) seedLines.push(`- Web: ${seed.website}`);
  if (seed?.socials) {
    const s = Array.isArray(seed.socials) ? seed.socials.join(", ") : seed.socials;
    seedLines.push(`- Redes: ${s}`);
  }
  if (seed?.notes) seedLines.push(`- Notas del equipo: ${seed.notes}`);

  return `Sos un analista de tendencias de D&C Scale Partners. Tu trabajo es traer las TENDENCIAS más recientes y ACCIONABLES del nicho de un cliente, usando BÚSQUEDA WEB, citando la fuente (link) de cada una.

CLIENTE: ${name}
SECTOR / MERCADO: ${sector}
${seedLines.length ? `PISTAS DEL EQUIPO:\n${seedLines.join("\n")}` : ""}

--- CONTEXTO DE LA EMPRESA (de su vault; incluye país, productos, propuesta) ---
${header || "(sin claude-client.md)"}
--- FIN CONTEXTO ---

ENFOQUE (en orden de prioridad — lo más importante primero):
1. CONTENIDO que está funcionando AHORA en este nicho: qué formatos/hooks/temas se están volviendo virales y en qué plataformas (Instagram, TikTok, YouTube, etc.).
2. Qué tipo de contenido está generando más TRÁFICO / llegadas a la web en el rubro.
3. Qué está generando más VENTAS / conversión (ángulos, ofertas, promos que están convirtiendo).
4. Noticias y novedades del SECTOR que afecten al negocio.
5. PUBLICIDAD / campañas destacadas en el rubro.
6. ESTACIONALIDAD / fechas comerciales / cambios regulatorios próximos relevantes.

Tiene que ser específico a ESTA empresa y su mercado (${name}, ${sector}, según el contexto de arriba), NO genérico del rubro mundial.

REGLAS:
- Usá la herramienta de búsqueda web. Citá la fuente (link) de CADA tendencia.
- Si no encontrás señales reales para algo, escribilo ("Sin datos recientes para X") — NO inventes ni rellenes con genéricos.
- Priorizá lo accionable para generar contenido y campañas esta semana.

SALIDA — SOLO Markdown, SIN preámbulo ni introducción (NO escribas "Aquí está el informe", "Excelente…" ni un título general "## Tendencias…" — el sistema ya pone el título). Empezá DIRECTO en la primera sección "###". Omití una sección si no tiene datos reales. En total 5 a 10 tendencias accionables, cada una con su fuente (link) inline:
### 🎬 Contenido que está funcionando
- [tendencia] — por qué importa + plataforma · (fuente: <link>)
### 📈 Tráfico a la web
### 🛒 Ventas / conversión
### 📰 Noticias del sector
### 📣 Publicidad / campañas
### 🗓️ Estacional / próximo`;
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
      "sector-trends requiere brief.client (slug del cliente). No hay defaults.",
    );
  }

  console.log(`[${AGENT}] buscando tendencias del nicho para ${client}...`);

  const clientRow = await fetchClient(client);
  const header = readVaultFile(`clients/${client}/claude-client.md`);
  const seed = brief.seed ?? null;
  const today = new Date().toISOString().slice(0, 10);

  const prompt = buildPrompt(client, clientRow, header, seed, today);
  const { text, sources } = await callClaudeWebSearch(prompt, {
    maxTokens: 6000,
    maxSearches: 6,
  });

  if (!text) {
    throw new Error(
      "Claude devolvió tendencias vacías (¿la búsqueda web no trajo resultados?).",
    );
  }

  // Limpieza defensiva: si el modelo agregó preámbulo antes del markdown,
  // recortamos hasta el primer heading (### / ##) para no guardar basura.
  const headingIdx = text.search(/^#{1,6}\s/m);
  const bodyMd = headingIdx > 0 ? text.slice(headingIdx).trim() : text;

  // 2da llamada: estructurar los ítems con tool_use forzado (robusto). Si
  // falla, items = [] y la página igual muestra el markdown (body_md) + fuentes.
  const items = await structureTrends(bodyMd);
  const displayName = clientRow?.name || client;

  const sourcesBlock = sources.length
    ? `\n## Fuentes\n${sources.map((s) => `- [${s.title}](${s.url})`).join("\n")}`
    : `\n## Fuentes\n_Sin fuentes citadas — revisar antes de usar._`;

  // sector-trends.md = última foto (CLIENT-VISIBLE). La lee el portal/Advisor
  // y los agentes de contenido (retroalimentación). El histórico vive en
  // agent_outputs (un registro por corrida).
  const vaultDoc = [
    `# Tendencias del nicho — ${displayName}`,
    ``,
    `> Generado automáticamente por el agente \`sector-trends\` (búsqueda web) el ${today}.`,
    `> Tendencias recientes y accionables del nicho. Cada ítem cita su fuente.`,
    ``,
    bodyMd,
    sourcesBlock,
    ``,
  ].join("\n");

  writeVaultFile(`clients/${client}/sector-trends.md`, vaultDoc);
  console.log(
    `[${AGENT}] sector-trends.md escrito (${items.length} items, ${sources.length} fuentes)`,
  );

  const summary = `Tendencias de ${displayName}: ${items.length} ítems, ${sources.length} fuentes`;

  await registerAgentOutput(runId, client, AGENT, {
    output_type: "sector-trends",
    title: `Tendencias del nicho — ${displayName} (${today})`,
    body_md: `${bodyMd}\n${sourcesBlock}`,
    structured: { items, sources, generatedAt: today },
  });

  if (runId) {
    await updateAgentRun(runId, {
      status: "success",
      summary,
      summary_md: `${bodyMd}\n${sourcesBlock}`,
      performance: { duration_ms: Date.now() - startTime, items: items.length, sources: sources.length },
    });
  } else {
    await logAgentRun(
      client,
      AGENT,
      "success",
      summary,
      { items: items.length, sources: sources.length },
      { duration_ms: Date.now() - startTime },
    );
  }

  await pushNotification(
    client,
    "info",
    `Tendencias del sector actualizadas`,
    `${items.length} tendencias nuevas para ${displayName}, con fuentes. Vistas en el portal.`,
    {
      agent: AGENT,
      link: `/cliente/${client}/biblioteca`,
      to_user_id: brief.triggered_by_user_id ?? null,
    },
  );

  console.log(`[${AGENT}] done.`);
  return { client, items: items.length, sources: sources.length };
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
        `sector-trends falló`,
        err.message,
        { agent: AGENT, to_user_id: fb.triggered_by_user_id ?? null },
      );
    } catch (logErr) {
      console.error(`[${AGENT}] failed to log error:`, logErr.message);
    }
    await new Promise((r) => setTimeout(r, 800));
    process.exit(1);
  }
}
