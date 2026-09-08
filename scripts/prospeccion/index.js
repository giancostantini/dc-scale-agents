/**
 * prospeccion — Prospector de Llamados (primer agente de la Gerencia de Ventas).
 *
 * Cada lunes busca LLAMADOS LABORALES públicos de marketing (community
 * manager, marketing digital, redes, growth, paid media…) en Uruguay +
 * Latam. La señal comercial: una empresa contratando marketing in-house
 * tiene la necesidad Y el presupuesto — candidata a tercerizar con la
 * agencia. Los hallazgos con score ≥ 4 se cargan como prospectos en el
 * pipeline (/pipeline); TODO lo encontrado va al reporte del run.
 *
 * GATES (Gerencia de Ventas — no negociables):
 *   - Este agente SOLO CARGA prospectos. Jamás contacta a nadie.
 *   - La redacción del outreach es el botón de mensaje de /pipeline
 *     (/api/generate-message). El ENVÍO es SIEMPRE humano.
 *
 * Fuentes: web search de Claude sobre resultados públicos (LinkedIn Jobs
 * indexado por buscadores, Computrabajo, BuscoJobs, portales). LinkedIn NO
 * se scrapea directo (login wall + ToS). Cobertura buena, no exhaustiva —
 * upgrade declarado a API de jobs con key si algún día hace falta.
 *
 * Config editable (el vault manda): vault/agents/prospeccion/busquedas.md
 * — keywords, geografías, exclusiones y guía de scoring. Editarlo cambia
 * la búsqueda desde la corrida siguiente.
 *
 * Uso:
 *   node scripts/prospeccion/index.js --brief /tmp/brief.json
 *   brief = { "source": "scheduled", "extraQuery"?: "texto extra de búsqueda" }
 *
 * Agente de AGENCIA (sin cliente): agent_runs usa el slug "_system"
 * (convención de evals/insights-aggregator); notifications van con
 * client=null + to_role=director.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  logAgentRun,
  logAgentError,
  updateAgentRun,
  registerAgentOutput,
  pushNotification,
  recordApiUsage,
} from "../lib/supabase.js";

const AGENT = "prospeccion";
const MODEL = "claude-sonnet-4-6";
const SCORE_MIN_PIPELINE = 4;

const __dirname = dirname(fileURLToPath(import.meta.url));
const VAULT = resolve(__dirname, "../../vault");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Los reads/writes de leads van directo por REST (helper local — supabase.js
// no exporta insert genérico, y su select() traga errores: acá el dedup es
// load-bearing, un fallo silencioso duplicaría prospectos).
const SUPABASE_URL = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
const SUPABASE_KEY = process.env.SUPABASE_KEY?.trim();

// ---------------------------------------------------------------------------
// Brief + config del vault
// ---------------------------------------------------------------------------

function loadBrief() {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--brief");
  if (idx !== -1 && args[idx + 1]) {
    const path = resolve(process.cwd(), args[idx + 1]);
    return JSON.parse(readFileSync(path, "utf-8"));
  }
  return {};
}

/** La config de búsqueda ES la del vault — sin ella no se corre (fail loud). */
function loadBusquedas() {
  const path = resolve(VAULT, "agents/prospeccion/busquedas.md");
  try {
    return readFileSync(path, "utf-8");
  } catch {
    throw new Error(
      "Falta vault/agents/prospeccion/busquedas.md (la config de búsqueda). " +
        "El Prospector no corre sin ella — el vault es la fuente de verdad.",
    );
  }
}

// ---------------------------------------------------------------------------
// Claude + web search (retry/backoff — mismo patrón que sector-trends)
// ---------------------------------------------------------------------------

async function callClaudeWebSearch(
  prompt,
  { maxTokens = 6000, maxSearches = 10 } = {},
  attempt = 1,
) {
  const MAX_ATTEMPTS = 3;
  if (!ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY no está seteada. El agente prospeccion requiere acceso a Claude API.",
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
  recordApiUsage({
    source: `agent:${AGENT}`,
    model: MODEL,
    usage: data.usage,
  }).catch(() => {});
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
// Estructurar hallazgos vía tool_use FORZADO (segunda llamada, sin web search).
// El schema valida el output → no hay JSON truncado. Si falla, [] (non-fatal):
// el reporte markdown igual se guarda.
// ---------------------------------------------------------------------------

const REPORT_TOOL = {
  name: "report_prospectos",
  description:
    "Reporta los llamados laborales encontrados como prospectos estructurados, extraídos del análisis provisto.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        description: "Los llamados laborales encontrados (todos, incluso score bajo).",
        items: {
          type: "object",
          properties: {
            empresa: { type: "string", description: "Nombre de la empresa que publica el llamado." },
            puesto: { type: "string", description: "Puesto buscado, corto (ej. 'Community Manager')." },
            ubicacion: { type: "string", description: "Ciudad/país del llamado." },
            url: { type: "string", description: "URL del llamado (real, del análisis — no inventar)." },
            fuente: { type: "string", description: "Dónde se publicó (LinkedIn, Computrabajo, BuscoJobs, etc.)." },
            senal: { type: "string", description: "Por qué es candidata a tercerizar con la agencia, 1 frase." },
            sector: { type: "string", description: "Rubro de la empresa (ej. 'gastronomía', 'retail')." },
            score: {
              type: "integer",
              minimum: 1,
              maximum: 5,
              description: "Fit con la agencia según la guía de scoring de la config.",
            },
            pitch_angle: { type: "string", description: "Ángulo de pitch sugerido, 1 frase." },
          },
          required: ["empresa", "puesto", "score"],
        },
      },
    },
    required: ["items"],
  },
};

async function structureProspects(rawText, busquedasMd, attempt = 1) {
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
        tool_choice: { type: "tool", name: "report_prospectos" },
        messages: [
          {
            role: "user",
            content: `Extraé los llamados laborales del siguiente análisis como prospectos estructurados. Aplicá la guía de scoring y las exclusiones de la config. NO inventes empresas, URLs ni datos que no estén en el análisis.\n\nCONFIG (scoring + exclusiones):\n${busquedasMd}\n\nANÁLISIS:\n${rawText}`,
          },
        ],
      }),
    });
  } catch (err) {
    if (attempt < MAX_ATTEMPTS) {
      const delay = 1000 * Math.pow(2, attempt - 1);
      console.warn(
        `[${AGENT}] structureProspects network error (attempt ${attempt}): ${err.message}. Retry en ${delay}ms...`,
      );
      await new Promise((r) => setTimeout(r, delay));
      return structureProspects(rawText, busquedasMd, attempt + 1);
    }
    console.warn(`[${AGENT}] structureProspects falló (network) — sigo sin items: ${err.message}`);
    return [];
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "(sin body)");
    const isRetriable = res.status === 429 || res.status >= 500;
    if (isRetriable && attempt < MAX_ATTEMPTS) {
      const delay = 1000 * Math.pow(2, attempt - 1);
      console.warn(
        `[${AGENT}] structureProspects ${res.status} (attempt ${attempt}). Retry en ${delay}ms...`,
      );
      await new Promise((r) => setTimeout(r, delay));
      return structureProspects(rawText, busquedasMd, attempt + 1);
    }
    console.warn(`[${AGENT}] structureProspects API error ${res.status}: ${errText} — sigo sin items.`);
    return [];
  }

  const data = await res.json();
  recordApiUsage({
    source: `agent:${AGENT}`,
    model: MODEL,
    usage: data.usage,
  }).catch(() => {});

  const toolBlock = (data?.content ?? []).find((b) => b.type === "tool_use");
  const items = toolBlock?.input?.items;
  return Array.isArray(items) ? items : [];
}

// ---------------------------------------------------------------------------
// Leads (REST local con throw — el dedup no puede fallar en silencio)
// ---------------------------------------------------------------------------

function requireSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("SUPABASE_URL / SUPABASE_KEY no están seteadas.");
  }
}

function normalizeCompany(name) {
  return String(name ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}

/** TODAS las companies del pipeline, incluidas las perdidas (un lead
 *  marcado lost fue evaluado y descartado — no se re-carga). */
async function fetchExistingCompanies() {
  requireSupabase();
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/leads?select=company&limit=2000`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    },
  );
  if (!res.ok) {
    throw new Error(`lectura de leads para dedup falló: ${await res.text()}`);
  }
  const rows = await res.json();
  return new Set(rows.map((r) => normalizeCompany(r.company)).filter(Boolean));
}

async function insertLeads(rows) {
  requireSupabase();
  if (rows.length === 0) return;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    throw new Error(`insert de leads falló: ${await res.text()}`);
  }
}

/** Note compacto (≤300 chars): el kanban lo renderiza completo sin clamp. */
function buildNote(item, today) {
  const parts = [
    item.senal,
    item.pitch_angle ? `Ángulo: ${item.pitch_angle}` : null,
    item.url,
    `prospeccion ${today}`,
  ].filter(Boolean);
  let note = parts.join(" · ");
  if (note.length > 300) note = note.slice(0, 297) + "…";
  return note;
}

function leadRowFromItem(item, today) {
  return {
    name: `Buscan: ${item.puesto}`.slice(0, 120),
    company: item.empresa,
    sector: item.sector?.trim() || "—",
    type: "gp",
    value: 0,
    stage: "prospecto",
    source: /linkedin/i.test(item.fuente ?? "") ? "linkedin" : "otro",
    note: buildNote(item, today),
  };
}

// ---------------------------------------------------------------------------
// Prompt de búsqueda
// ---------------------------------------------------------------------------

function buildSearchPrompt(busquedasMd, extraQuery) {
  return `Sos el Prospector de Llamados de D&C Scale Partners (agencia de growth marketing, Uruguay). Tu trabajo HOY: encontrar LLAMADOS LABORALES PÚBLICOS Y VIGENTES donde una empresa busca contratar roles de marketing in-house. La señal comercial: si una empresa busca contratar un community manager o un rol de marketing, tiene la necesidad y el presupuesto — es candidata a tercerizar ese trabajo con una agencia.

CONFIG DE BÚSQUEDA (keywords, geografías, exclusiones, scoring — respetala al pie de la letra):
${busquedasMd}
${extraQuery ? `\nBÚSQUEDA EXTRA pedida en este run: "${extraQuery}"\n` : ""}
INSTRUCCIONES:
1. Usá la web search para buscar llamados VIGENTES (publicados en los últimos ~30 días) combinando las keywords con las geografías de la config. Buscá en: LinkedIn Jobs (resultados públicos indexados, ej. "site:linkedin.com/jobs community manager Uruguay"), Computrabajo, BuscoJobs y portales locales.
2. Por cada llamado real que encuentres, reportá: EMPRESA (el dato más importante — si el aviso es de una consultora de RRHH y no se sabe la empresa final, decilo), PUESTO, UBICACIÓN, URL del aviso, FUENTE, por qué es candidata (SEÑAL), SECTOR de la empresa, SCORE 1-5 según la guía de la config, y un ÁNGULO DE PITCH de una frase.
3. Aplicá las exclusiones de la config (agencias contratando para sí, freelance puro, etc.).
4. NO inventes llamados ni empresas: solo lo que realmente encontraste, con su URL. Si encontrás pocos, está bien — mejor 3 reales que 10 inventados.

Al final escribí un análisis en texto con TODOS los llamados encontrados y sus datos.`;
}

// ---------------------------------------------------------------------------
// Reporte del run
// ---------------------------------------------------------------------------

function buildReportMd(items, insertedCompanies, dupCompanies, sources, today) {
  const lines = [`# Prospección de llamados — ${today}`, ""];
  if (items.length === 0) {
    lines.push("Sin llamados encontrados en esta corrida (o la estructuración falló — ver texto del run).");
  } else {
    lines.push("| Empresa | Puesto | Score | Estado | Señal |");
    lines.push("|---|---|---|---|---|");
    for (const it of items) {
      const norm = normalizeCompany(it.empresa);
      const estado = insertedCompanies.has(norm)
        ? "✅ cargado a /pipeline"
        : dupCompanies.has(norm)
        ? "↩ ya estaba en el pipeline"
        : `score ${it.score} < ${SCORE_MIN_PIPELINE} (solo reporte)`;
      lines.push(
        `| ${it.empresa} | ${it.puesto}${it.ubicacion ? ` (${it.ubicacion})` : ""} | ${it.score} | ${estado} | ${(it.senal ?? "").slice(0, 140)}${it.url ? ` — [aviso](${it.url})` : ""} |`,
      );
    }
  }
  if (sources.length > 0) {
    lines.push("", "## Fuentes consultadas");
    for (const s of sources.slice(0, 15)) lines.push(`- [${s.title}](${s.url})`);
  }
  lines.push(
    "",
    "_Este agente SOLO carga prospectos. Redacción: botón de mensaje en /pipeline. Envío: SIEMPRE humano._",
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/** Hoisted para que el catch del entry point pueda cerrar el run en error. */
let currentRunId = null;

async function run() {
  const brief = loadBrief();
  const today = new Date().toISOString().slice(0, 10);
  const busquedasMd = loadBusquedas();

  const runId = await logAgentRun("_system", AGENT, "running", "Buscando llamados laborales…", {
    source: brief.source ?? "manual",
    extraQuery: brief.extraQuery ?? null,
  });
  currentRunId = runId;

  // 1) Búsqueda con web search
  const { text: rawText, sources } = await callClaudeWebSearch(
    buildSearchPrompt(busquedasMd, brief.extraQuery),
    { maxTokens: 6000, maxSearches: 10 },
  );
  console.log(`[${AGENT}] análisis: ${rawText.length} chars, ${sources.length} fuentes.`);

  // 2) Estructurar (non-fatal)
  const items = await structureProspects(rawText, busquedasMd);
  console.log(`[${AGENT}] llamados estructurados: ${items.length}`);

  // 3) Dedup contra el pipeline completo (incl. lost) + score mínimo
  const existing = await fetchExistingCompanies();
  const insertedCompanies = new Set();
  const dupCompanies = new Set();
  const toInsert = [];
  for (const it of items) {
    const norm = normalizeCompany(it.empresa);
    if (!norm) continue;
    if (existing.has(norm) || insertedCompanies.has(norm)) {
      dupCompanies.add(norm);
      continue;
    }
    if ((it.score ?? 0) >= SCORE_MIN_PIPELINE) {
      toInsert.push(leadRowFromItem(it, today));
      insertedCompanies.add(norm);
    }
  }

  // 4) Cargar prospectos
  await insertLeads(toInsert);
  console.log(`[${AGENT}] prospectos cargados: ${toInsert.length} (dup: ${dupCompanies.size})`);

  // 5) Reporte + cierre
  const reportMd = buildReportMd(items, insertedCompanies, dupCompanies, sources, today);
  await registerAgentOutput(runId, "_system", AGENT, {
    output_type: "report",
    title: `Prospección ${today}: ${toInsert.length} prospectos nuevos de ${items.length} llamados`,
    body_md: reportMd,
    structured: { items, inserted: toInsert.length, duplicates: dupCompanies.size },
    dedupKey: `prospeccion-${today}`,
  });

  const summary = `${toInsert.length} prospectos nuevos en /pipeline (${items.length} llamados encontrados, ${dupCompanies.size} ya estaban).`;
  if (runId) {
    await updateAgentRun(runId, { status: "success", summary });
  }

  await pushNotification(
    null,
    toInsert.length > 0 ? "success" : "info",
    `Prospección semanal: ${toInsert.length} prospectos nuevos`,
    `${summary} Revisalos en el pipeline — el mensaje se redacta con el botón de cada card y el envío es siempre humano.`,
    {
      agent: AGENT,
      link: "/pipeline",
      to_role: "director",
      dedupKey: `prospeccion-${today}`,
    },
  );

  console.log(`[${AGENT}] listo: ${summary}`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const isMain =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  try {
    await run();
  } catch (err) {
    console.error(`[${AGENT}] ERROR:`, err.message);
    if (currentRunId) {
      await updateAgentRun(currentRunId, {
        status: "error",
        summary: err.message,
      }).catch(() => {});
    } else {
      await logAgentError("_system", AGENT, err).catch(() => {});
    }
    await pushNotification(
      null,
      "error",
      "Prospección falló",
      err.message,
      { agent: AGENT, to_role: "director" },
    ).catch(() => {});
    // Drain: que los logs lleguen a Supabase antes de morir.
    await new Promise((r) => setTimeout(r, 800));
    process.exit(1);
  }
}
