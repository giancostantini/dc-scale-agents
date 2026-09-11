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
 * QUÉ BUSCA (mig 100): las **campañas de prospección activas** del CRM son
 * la config operativa — una corrida por campaña, con su ICP (geografías,
 * puestos, rubros, señales, exclusiones y tope). Los leads quedan atados a
 * su campaña (`campaign_id`), así las métricas del panel salen de datos
 * reales. Si no hay campañas activas, corre con el ICP de fallback del
 * vault, exactamente como antes.
 *
 * Config del método (el vault manda): vault/agents/prospeccion/busquedas.md
 * — guía de scoring, exclusiones duras, fuentes e ICP de fallback. Editarlo
 * cambia la búsqueda desde la corrida siguiente.
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
/** Tope de campañas por corrida (2 llamadas a Claude cada una). */
const MAX_CAMPAIGNS_PER_RUN = 5;
/** Prospectos por campaña: el daily_volume de la campaña, acotado. */
const DEFAULT_CAP = 30;
const HARD_CAP = 50;

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

/**
 * Campañas de prospección activas (mig 100). Son la config operativa: cada
 * una define un ICP y el agente busca una vez por campaña. Si no hay
 * ninguna, el agente corre con el ICP de fallback del vault (modo previo).
 */
async function fetchActiveCampaigns() {
  requireSupabase();
  const cols = [
    "id",
    "name",
    "countries",
    "regions",
    "cities",
    "industries",
    "roles",
    "seniorities",
    "buying_signals",
    "excluded_companies",
    "company_size_min",
    "company_size_max",
    "revenue_range",
    "daily_volume",
  ].join(",");
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/prospect_campaigns?status=eq.active&select=${cols}`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    },
  );
  if (!res.ok) {
    const detail = await res.text();
    // Tabla vieja o sin migrar: seguimos en modo fallback en vez de morir.
    console.warn(
      `[${AGENT}] no pude leer prospect_campaigns (${detail.slice(0, 160)}) — sigo con el ICP del vault.`,
    );
    return [];
  }
  return await res.json();
}

async function postLeads(rows) {
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
  return res;
}

/** Columnas que agrega la mig 100 — si no está aplicada, PostgREST rechaza
 *  el batch entero y perderíamos la corrida del lunes. */
const MIG_100_COLS = ["campaign_id", "score", "source_url"];

async function insertLeads(rows) {
  requireSupabase();
  if (rows.length === 0) return;

  const res = await postLeads(rows);
  if (res.ok) return;

  const detail = await res.text();
  // Fallback: reintentar sin las columnas de la mig 100. Ruidoso, pero el
  // prospecto entra igual (la señal y la URL viven también en `note`).
  if (MIG_100_COLS.some((c) => detail.includes(c))) {
    console.warn(
      `::warning::[${AGENT}] la migración 100 no está aplicada — cargo los leads sin campaign_id/score/source_url. Aplicala en el SQL editor.`,
    );
    const minimal = rows.map((r) => {
      const copy = { ...r };
      for (const c of MIG_100_COLS) delete copy[c];
      return copy;
    });
    const retry = await postLeads(minimal);
    if (retry.ok) return;
    throw new Error(`insert de leads falló (retry sin mig 100): ${await retry.text()}`);
  }

  throw new Error(`insert de leads falló: ${detail}`);
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

function leadRowFromItem(item, today, campaign) {
  return {
    name: `Buscan: ${item.puesto}`.slice(0, 120),
    company: item.empresa,
    sector: item.sector?.trim() || "—",
    type: "gp",
    value: 0,
    stage: "prospecto",
    source: /linkedin/i.test(item.fuente ?? "") ? "linkedin" : "otro",
    note: buildNote(item, today),
    // Mig 100: trazabilidad. Antes el score y la URL solo vivían embebidos
    // en `note` y se perdían para cualquier query.
    campaign_id: campaign?.id ?? null,
    score: item.score ?? null,
    source_url: item.url ?? null,
  };
}

// ---------------------------------------------------------------------------
// Prompt de búsqueda
// ---------------------------------------------------------------------------

const list = (arr) => (Array.isArray(arr) ? arr.filter(Boolean) : []);

/**
 * Bloque de ICP derivado de la campaña. Nota honesta: tamaño de empresa y
 * facturación NO son verificables por búsqueda web, así que van como
 * preferencia de priorización, no como filtro duro.
 */
function buildIcpBlock(campaign) {
  if (!campaign) return "";
  const geos = [
    ...list(campaign.countries),
    ...list(campaign.regions),
    ...list(campaign.cities),
  ];
  const lines = [`\nICP DE LA CAMPAÑA ACTIVA "${campaign.name}" (manda sobre las keywords y geografías genéricas de la config):`];
  if (geos.length) lines.push(`- Geografías objetivo: ${geos.join(", ")}`);
  if (list(campaign.roles).length) {
    lines.push(`- Puestos a buscar: ${list(campaign.roles).join(", ")}`);
  }
  if (list(campaign.seniorities).length) {
    lines.push(`- Seniority del decisor: ${list(campaign.seniorities).join(", ")}`);
  }
  if (list(campaign.industries).length) {
    lines.push(`- Rubros objetivo: ${list(campaign.industries).join(", ")}`);
  }
  if (list(campaign.buying_signals).length) {
    lines.push(
      `- Señales de compra a priorizar: ${list(campaign.buying_signals).join(", ")}`,
    );
  }
  if (list(campaign.excluded_companies).length) {
    lines.push(
      `- EXCLUIR explícitamente estas empresas: ${list(campaign.excluded_companies).join(", ")}`,
    );
  }
  const size =
    campaign.company_size_min && campaign.company_size_max
      ? `${campaign.company_size_min}-${campaign.company_size_max} empleados`
      : null;
  if (size || campaign.revenue_range) {
    lines.push(
      `- Preferencia (NO verificable por web, usala solo para priorizar el score): ${[size, campaign.revenue_range].filter(Boolean).join(" · ")}`,
    );
  }
  const cap = campaign.daily_volume ?? 30;
  lines.push(`- Reportá hasta ${cap} llamados en esta corrida.`);
  return lines.join("\n") + "\n";
}

function buildSearchPrompt(busquedasMd, extraQuery, campaign) {
  return `Sos el Prospector de Llamados de D&C Scale Partners (agencia de growth marketing, Uruguay). Tu trabajo HOY: encontrar LLAMADOS LABORALES PÚBLICOS Y VIGENTES donde una empresa busca contratar roles de marketing in-house. La señal comercial: si una empresa busca contratar un community manager o un rol de marketing, tiene la necesidad y el presupuesto — es candidata a tercerizar ese trabajo con una agencia.

CONFIG DE BÚSQUEDA (scoring, exclusiones duras, fuentes e ICP de fallback — respetala al pie de la letra):
${busquedasMd}
${buildIcpBlock(campaign)}${extraQuery ? `\nBÚSQUEDA EXTRA pedida en este run: "${extraQuery}"\n` : ""}
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

/** Una sección por campaña (o una sola si corrió en modo fallback). */
function buildReportMd(results, today, totalInserted) {
  const lines = [`# Prospección de llamados — ${today}`, ""];
  const campañas = results.filter((r) => r.campaign).length;
  lines.push(
    campañas > 0
      ? `**${totalInserted} prospectos nuevos** de ${results.reduce((n, r) => n + r.items.length, 0)} llamados, en ${campañas} campaña(s) activa(s).`
      : `**${totalInserted} prospectos nuevos**. Sin campañas activas: corrí con el ICP de fallback del vault.`,
    "",
  );

  for (const r of results) {
    lines.push(`## ${r.campaign ? r.campaign.name : "Sin campaña (ICP del vault)"}`);
    if (r.error) {
      lines.push("", `⚠ Esta campaña falló: ${r.error}`, "");
      continue;
    }
    if (r.items.length === 0) {
      lines.push("", "Sin llamados encontrados (o la estructuración falló).", "");
      continue;
    }
    lines.push("", "| Empresa | Puesto | Score | Estado | Señal |", "|---|---|---|---|---|");
    for (const it of r.items) {
      const norm = normalizeCompany(it.empresa);
      const estado = r.insertedCompanies.has(norm)
        ? "✅ cargado a /pipeline"
        : r.dupCompanies.has(norm)
          ? "↩ ya estaba en el pipeline"
          : (it.score ?? 0) >= SCORE_MIN_PIPELINE
            ? "— (tope de la campaña alcanzado)"
            : `score ${it.score} < ${SCORE_MIN_PIPELINE} (solo reporte)`;
      lines.push(
        `| ${it.empresa} | ${it.puesto}${it.ubicacion ? ` (${it.ubicacion})` : ""} | ${it.score} | ${estado} | ${(it.senal ?? "").slice(0, 140)}${it.url ? ` — [aviso](${it.url})` : ""} |`,
      );
    }
    if (r.sources.length > 0) {
      lines.push("", "<details><summary>Fuentes consultadas</summary>", "");
      for (const s of r.sources.slice(0, 15)) lines.push(`- [${s.title}](${s.url})`);
      lines.push("", "</details>");
    }
    lines.push("");
  }

  lines.push(
    "_Este agente SOLO carga prospectos. La redacción del mensaje es asistida y el ENVÍO es SIEMPRE humano._",
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

  // Campañas activas = la config operativa (mig 100). Sin ninguna, [null]
  // hace UNA corrida con el ICP de fallback del vault — idéntico al
  // comportamiento previo a las campañas.
  const campaigns = await fetchActiveCampaigns();
  const targets = campaigns.length > 0 ? campaigns.slice(0, MAX_CAMPAIGNS_PER_RUN) : [null];
  console.log(
    `[${AGENT}] campañas activas: ${campaigns.length}${campaigns.length > MAX_CAMPAIGNS_PER_RUN ? ` (corro las primeras ${MAX_CAMPAIGNS_PER_RUN})` : ""}`,
  );

  // Dedup contra TODO el pipeline (incluye descartados: si lo rechazaron,
  // no vuelve a entrar). Se lee una sola vez para toda la corrida.
  const existing = await fetchExistingCompanies();
  // Acumula entre campañas: la campaña B no puede recargar lo que cargó A.
  const seen = new Set();

  const results = [];
  let totalInserted = 0;

  for (const campaign of targets) {
    const label = campaign ? campaign.name : "ICP del vault";
    try {
      const { text: rawText, sources } = await callClaudeWebSearch(
        buildSearchPrompt(busquedasMd, brief.extraQuery, campaign),
        { maxTokens: 6000, maxSearches: 10 },
      );
      const items = await structureProspects(rawText, busquedasMd);
      console.log(`[${AGENT}] "${label}": ${items.length} llamados estructurados.`);

      const cap = Math.min(campaign?.daily_volume ?? DEFAULT_CAP, HARD_CAP);
      const insertedCompanies = new Set();
      const dupCompanies = new Set();
      const toInsert = [];

      for (const it of items) {
        const norm = normalizeCompany(it.empresa);
        if (!norm) continue;
        if (existing.has(norm) || seen.has(norm)) {
          dupCompanies.add(norm);
          continue;
        }
        if ((it.score ?? 0) < SCORE_MIN_PIPELINE) continue;
        if (toInsert.length >= cap) break;
        toInsert.push(leadRowFromItem(it, today, campaign));
        insertedCompanies.add(norm);
        seen.add(norm);
      }

      await insertLeads(toInsert);
      totalInserted += toInsert.length;
      console.log(
        `[${AGENT}] "${label}": ${toInsert.length} cargados (dup: ${dupCompanies.size}).`,
      );
      results.push({ campaign, items, insertedCompanies, dupCompanies, sources, error: null });
    } catch (err) {
      // Principio #7: una campaña que falla no corta el resto.
      const msg = err instanceof Error ? err.message : "unknown";
      console.warn(`::warning::[${AGENT}] la campaña "${label}" falló: ${msg}`);
      results.push({
        campaign,
        items: [],
        insertedCompanies: new Set(),
        dupCompanies: new Set(),
        sources: [],
        error: msg,
      });
    }
  }

  const fallaron = results.filter((r) => r.error).length;
  if (fallaron === results.length) {
    throw new Error(
      `todas las campañas fallaron (${results.map((r) => r.error).join(" | ")})`,
    );
  }

  // Reporte + cierre
  const reportMd = buildReportMd(results, today, totalInserted);
  await registerAgentOutput(runId, "_system", AGENT, {
    output_type: "report",
    title: `Prospección ${today}: ${totalInserted} prospectos nuevos`,
    body_md: reportMd,
    structured: {
      campaigns: results.map((r) => ({
        id: r.campaign?.id ?? null,
        name: r.campaign?.name ?? null,
        items: r.items,
        inserted: r.insertedCompanies.size,
        error: r.error,
      })),
      totalInserted,
    },
    dedupKey: `prospeccion-${today}`,
  });

  const scope =
    campaigns.length > 0
      ? `${results.length} campaña(s)${fallaron > 0 ? `, ${fallaron} con error` : ""}`
      : "sin campañas activas (ICP del vault)";
  const summary = `${totalInserted} prospectos nuevos en /pipeline — ${scope}.`;
  if (runId) {
    await updateAgentRun(runId, {
      status: "success",
      summary,
      metadata: { campaigns: campaigns.length, inserted: totalInserted, failed: fallaron },
    });
  }

  await pushNotification(
    null,
    totalInserted > 0 ? "success" : "info",
    `Prospección semanal: ${totalInserted} prospectos nuevos`,
    `${summary} Revisalos en el CRM — la redacción del mensaje es asistida y el envío es siempre humano.`,
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
