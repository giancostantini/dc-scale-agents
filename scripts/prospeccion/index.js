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
 * CONTACTO: tras cargar los prospectos hace UNA pasada de busqueda web para
 * completar web, telefono y casilla de contacto de las empresas con mejor
 * score. Lo que se consigue de fuentes publicas es contacto de EMPRESA, no
 * del decisor: por eso va a company_email y NO a contact_email, que es el
 * unico que habilita el envio automatico de la cola. (Se evaluo Apollo y se
 * descarto: cobertura floja en Uruguay + API de plan pago.)
 *
 * Uso:
 *   node scripts/prospeccion/index.js --brief /tmp/brief.json
 *   brief = {
 *     "source": "scheduled" | "dashboard",
 *     "extraQuery"?: "texto extra de busqueda",
 *     "campaignId"?: "uuid"   // corrida dirigida a UNA campana
 *   }
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
/** Empresas a las que se les busca contacto publico por corrida. */
const MAX_CONTACT_LOOKUPS = 8;

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
            senal: { type: "string", description: "Por qué es candidata, 1 frase. Para vertical 'dev', incluí el proceso manual concreto que menciona el aviso (planillas, carga manual, conciliación, seguimiento por WhatsApp…) — es el dato más valioso." },
            sector: { type: "string", description: "Rubro de la empresa (ej. 'gastronomía', 'retail')." },
            vertical: {
              type: "string",
              enum: ["growth", "dev"],
              description:
                "growth = busca marketing in-house (CM, redes, paid media, contenido). dev = busca perfiles de tecnología/datos, o el aviso describe un proceso manual y repetitivo que se puede automatizar.",
            },
            score: {
              type: "integer",
              minimum: 1,
              maximum: 5,
              description: "Fit con la agencia según la guía de scoring de la config.",
            },
            pitch_angle: { type: "string", description: "Ángulo de pitch sugerido, 1 frase." },
            fecha_publicacion: {
              type: "string",
              description:
                "La fecha de publicación TAL COMO LA MUESTRA EL AVISO, textual: 'hace 5 días', 'Publicado el 3/9/2026', '2026-09-03'. Si el aviso no muestra ninguna, dejá el campo VACÍO — no la estimes ni la deduzcas.",
            },
            requisitos: {
              type: "string",
              description:
                "Qué se pretende en el puesto: 2-4 frases con lo que pide el aviso (experiencia, herramientas, modalidad, responsabilidades). Es el material del primer mensaje — cuanto más concreto, mejor.",
            },
            email_contacto: {
              type: "string",
              description:
                "Email que aparezca EN EL AVISO para postularse o contactar. Vacío si no muestra ninguno (LinkedIn casi nunca lo muestra). No inventes.",
            },
          },
          required: ["empresa", "puesto", "score", "vertical"],
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
async function fetchActiveCampaigns(campaignId = null) {
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
  // Corrida dirigida (el dashboard al crear una campaña): solo esa.
  const filtro = campaignId
    ? `id=eq.${encodeURIComponent(campaignId)}&status=eq.active`
    : "status=eq.active";
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/prospect_campaigns?${filtro}&select=${cols}`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    },
  );
  if (!res.ok) {
    const detail = await res.text();
    // En una corrida dirigida no podemos degradar: si la query falla, caer
    // al ICP del vault cargaría prospectos de otro perfil.
    if (campaignId) {
      throw new Error(`no pude leer la campaña ${campaignId}: ${detail.slice(0, 200)}`);
    }
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
      // representation: necesitamos los id para completar el contacto después.
      Prefer: "return=representation",
    },
    body: JSON.stringify(rows),
  });
  return res;
}

/**
 * Columnas que agregan las migraciones y que el prospecto puede sobrevivir
 * sin ellas (la señal y la URL viven también en `note`). Si la migración no
 * está aplicada, se sacan de a una y el lead entra igual — ruidoso, pero la
 * corrida del lunes no se pierde.
 */
const OPTIONAL_LEAD_COLS = new Set([
  // mig 100
  "campaign_id", "score", "source_url", "company_domain", "contact_email",
  "contact_role", "linkedin_url", "enriched_at", "enrichment_source",
  // mig 101
  "job_title", "job_location", "posted_at", "posted_at_text",
  "role_requirements", "contact_phone", "company_email", "company_website",
]);

/** @returns {Promise<Array>} las filas insertadas (con id). */
async function insertLeads(rows) {
  requireSupabase();
  if (rows.length === 0) return [];

  let payload = rows;
  // Una vuelta por columna faltante. El tope evita un loop infinito si el
  // error menciona algo que no sabemos sacar.
  for (let i = 0; i < OPTIONAL_LEAD_COLS.size + 1; i++) {
    const res = await postLeads(payload);
    if (res.ok) return await res.json();

    const detail = await res.text();
    // PostgREST: "Could not find the 'job_title' column of 'leads' ..."
    const col = /'([a-z_]+)' column/.exec(detail)?.[1];
    if (!col || !OPTIONAL_LEAD_COLS.has(col)) {
      throw new Error(`insert de leads falló: ${detail}`);
    }
    console.warn(
      `::warning::[${AGENT}] la columna '${col}' no existe todavía — reintento sin ella. Aplicá la migración pendiente en el SQL editor.`,
    );
    payload = payload.map((r) => {
      const copy = { ...r };
      delete copy[col];
      return copy;
    });
  }
  throw new Error("insert de leads falló: demasiadas columnas faltantes");
}

// ---------------------------------------------------------------------------
// Fecha de publicación del aviso
// ---------------------------------------------------------------------------

const MESES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

/**
 * Normaliza lo que diga el aviso ("hace 5 días", "3 de septiembre",
 * "2026-09-03") a una fecha YYYY-MM-DD. NUNCA inventa: el texto crudo se
 * guarda siempre, así "el aviso no tenía fecha" y "no la pude parsear"
 * quedan distinguibles.
 */
function parsePostedAt(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return { postedAt: null, postedAtText: null };
  const t = text.toLowerCase();
  const out = { postedAt: null, postedAtText: text.slice(0, 120) };

  const now = new Date();
  const utc = (y, m, d) => Date.UTC(y, m - 1, d);
  const todayUTC = utc(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
  const DAY = 86400000;
  let ms = null;
  let m;

  if (/\bhoy\b/.test(t)) ms = todayUTC;
  else if (/\banteayer\b/.test(t)) ms = todayUTC - 2 * DAY;
  else if (/\bayer\b/.test(t)) ms = todayUTC - DAY;
  else if ((m = /hace\s+(\d{1,3})\s*(d[ií]a|semana|mes)/.exec(t))) {
    const mult = m[2].startsWith("d") ? 1 : m[2].startsWith("s") ? 7 : 30;
    ms = todayUTC - Number(m[1]) * mult * DAY;
  } else if ((m = /(\d{1,3})\s+(day|week|month)s?\s+ago/.exec(t))) {
    const mult = m[2] === "day" ? 1 : m[2] === "week" ? 7 : 30;
    ms = todayUTC - Number(m[1]) * mult * DAY;
  } else if ((m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t))) {
    ms = utc(Number(m[1]), Number(m[2]), Number(m[3]));
  } else if ((m = /(\d{1,2})\s+de\s+([a-zñáéíóú]+)(?:\s+de\s+(\d{4}))?/.exec(t)) && MESES[m[2]]) {
    const y = m[3] ? Number(m[3]) : now.getUTCFullYear();
    ms = utc(y, MESES[m[2]], Number(m[1]));
    // "3 de diciembre" visto en marzo es del año pasado.
    if (!m[3] && ms > todayUTC) ms = utc(y - 1, MESES[m[2]], Number(m[1]));
  } else if ((m = /(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/.exec(t))) {
    // Convención es-LA: día primero.
    const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    ms = utc(y, Number(m[2]), Number(m[1]));
  }

  // Clamp de sanidad: un aviso no se publica en el futuro, y un parseo que
  // da 1970 es un bug, no un dato. Ante la duda, null.
  if (ms == null || Number.isNaN(ms)) return out;
  if (ms > todayUTC || todayUTC - ms > 400 * DAY) return out;
  out.postedAt = new Date(ms).toISOString().slice(0, 10);
  return out;
}

async function patchLead(id, patch) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/leads?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    console.warn(`[${AGENT}] patch del lead ${id} falló: ${await res.text()}`);
  }
}

// ---------------------------------------------------------------------------
// Contacto público de la empresa (reemplaza al enriquecimiento por proveedor)
// ---------------------------------------------------------------------------
// Apollo se descartó: su cobertura en Uruguay —nuestro mercado #1— es floja.
// El contacto sale del aviso y de la web institucional de la empresa.
//
// HONESTIDAD: esto consigue contacto de EMPRESA (info@, teléfono de la web),
// casi nunca el mail nominal del decisor. Por eso va a company_email y NO a
// contact_email, que es el único que habilita el envío automático.
//
// Corre UNA VEZ POR CORRIDA, después del dedup y del cap: recién ahí se sabe
// a quién vale la pena buscarle contacto.

const CONTACT_TOOL = {
  name: "report_contactos",
  description: "Reporta los datos de contacto público encontrados por empresa.",
  input_schema: {
    type: "object",
    properties: {
      contactos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            empresa: { type: "string", description: "Nombre de la empresa, igual al que te pasaron." },
            web: { type: "string", description: "Web institucional (URL completa). Vacío si no encontraste." },
            email: { type: "string", description: "Email de contacto de la empresa (info@, contacto@…). Vacío si no hay." },
            telefono: { type: "string", description: "Teléfono de contacto. Vacío si no hay." },
            linkedin: { type: "string", description: "URL del perfil de LinkedIn DE LA EMPRESA. Vacío si no hay." },
          },
          required: ["empresa"],
        },
      },
    },
    required: ["contactos"],
  },
};

/** Búsqueda + estructuración del contacto público. Non-fatal: si falla, los
 *  prospectos ya están cargados y eso es lo que importa. */
async function buscarContactos(empresas) {
  if (empresas.length === 0) return [];

  const lista = empresas.map((e) => `- ${e.company}`).join("\n");
  const prompt = `Buscá los datos de CONTACTO PÚBLICO de estas empresas (Uruguay y Latam). Para cada una: su web institucional, el email de contacto que publique (info@, contacto@, ventas@), el teléfono y el LinkedIn de la empresa.

EMPRESAS:
${lista}

REGLAS:
1. Buscá el sitio oficial de cada empresa y su página de contacto. Si no tiene web, fijate si tiene página de LinkedIn.
2. NO inventes nada: si no encontrás un dato, dejá el campo vacío. Un email inventado es peor que ninguno.
3. NO busques el email personal de ningún empleado — solo datos de contacto institucionales publicados por la empresa.
4. Devolvé el nombre de la empresa EXACTAMENTE como te lo pasé, para poder cruzarlo.`;

  const { text } = await callClaudeWebSearch(prompt, {
    maxTokens: 4000,
    maxSearches: Math.min(2 * empresas.length, 15),
  });
  if (!text.trim()) return [];

  // Estructuración forzada (sin web search), mismo patrón que los prospectos.
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 3000,
      tools: [CONTACT_TOOL],
      tool_choice: { type: "tool", name: "report_contactos" },
      messages: [
        {
          role: "user",
          content: `Extraé los datos de contacto del siguiente análisis. Solo lo que realmente aparece — campos vacíos si no está.\n\n${text}`,
        },
      ],
    }),
  });
  if (!res.ok) {
    console.warn(`[${AGENT}] estructuración de contactos falló: ${res.status}`);
    return [];
  }
  const data = await res.json();
  recordApiUsage({ source: `agent:${AGENT}`, model: MODEL, usage: data.usage }).catch(() => {});
  const block = (data?.content ?? []).find((b) => b.type === "tool_use");
  return Array.isArray(block?.input?.contactos) ? block.input.contactos : [];
}

/** Completa el contacto de los leads recién cargados. */
async function completarContactos(insertedLeads) {
  // Los mejores primero: si hay muchos, priorizamos por score.
  const candidatos = [...insertedLeads]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, MAX_CONTACT_LOOKUPS);
  if (candidatos.length === 0) return { completados: 0 };

  const contactos = await buscarContactos(candidatos);
  const byName = new Map(
    contactos.map((c) => [normalizeCompany(c.empresa), c]),
  );

  let completados = 0;
  for (const lead of candidatos) {
    const c = byName.get(normalizeCompany(lead.company));
    if (!c) continue;
    const patch = {};
    if (c.web?.trim()) patch.company_website = c.web.trim();
    if (c.telefono?.trim()) patch.contact_phone = c.telefono.trim();
    // Solo si el aviso no trajo uno: el del aviso es más específico.
    if (c.email?.trim() && !lead.company_email) patch.company_email = c.email.trim();
    if (c.linkedin?.trim()) patch.linkedin_url = c.linkedin.trim();
    if (Object.keys(patch).length === 0) continue;
    patch.enriched_at = new Date().toISOString();
    patch.enrichment_source = "web";
    await patchLead(lead.id, patch);
    completados += 1;
  }
  return { completados, buscados: candidatos.length };
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
  const publicado = parsePostedAt(item.fecha_publicacion);
  const avisoEmail = item.email_contacto?.trim() || null;
  return {
    name: `Buscan: ${item.puesto}`.slice(0, 120),
    company: item.empresa,
    sector: item.sector?.trim() || "—",
    // El CRM distingue las dos verticales (etiqueta de la card y campos de
    // cotización distintos: fee+bono para growth, producción+mantenimiento
    // para desarrollo). Default conservador a growth.
    type: item.vertical === "dev" ? "dev" : "gp",
    value: 0,
    stage: "prospecto",
    source: /linkedin/i.test(item.fuente ?? "") ? "linkedin" : "otro",
    note: buildNote(item, today),
    // Mig 100: trazabilidad. Antes el score y la URL solo vivían embebidos
    // en `note` y se perdían para cualquier query.
    campaign_id: campaign?.id ?? null,
    score: item.score ?? null,
    source_url: item.url ?? null,
    // Mig 101: el aviso, en campos propios (la card los muestra separados).
    job_title: item.puesto?.trim() || null,
    job_location: item.ubicacion?.trim() || null,
    posted_at: publicado.postedAt,
    posted_at_text: publicado.postedAtText,
    role_requirements: item.requisitos?.trim() || null,
    // El email del aviso es casi siempre una casilla de CVs (rrhh@, cv@):
    // va a company_email, NO a contact_email. Esa promoción la decide un
    // humano desde la ficha — mandar un pitch frío a RRHH quema la marca.
    company_email: avisoEmail,
    enrichment_source: avisoEmail ? "aviso" : null,
    enriched_at: avisoEmail ? new Date().toISOString() : null,
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
  return `Sos el Prospector de Llamados de D&C Scale Partners (Uruguay). La agencia tiene DOS verticales y vos buscás señales de compra para las dos en LLAMADOS LABORALES PÚBLICOS Y VIGENTES:

1. GROWTH (vertical "growth"): la empresa busca marketing in-house — community manager, redes, marketing digital, paid media, contenido. Señal: tiene la necesidad y el presupuesto de marketing; tercerizarlo con la agencia es una alternativa directa.

2. DESARROLLO / automatización e IA (vertical "dev"): la empresa busca perfiles de tecnología o datos (desarrollador, analista de datos, BI, automatización, implementación de ERP), O BIEN el aviso describe un PROCESO MANUAL Y REPETITIVO: planillas de Excel, carga manual de datos, facturación, conciliación, control de stock, seguimiento de pedidos o consultas por WhatsApp, reportes armados a mano. Señal: hay un problema operativo con presupuesto asignado, y parte de eso se resuelve automatizando en vez de (o antes de) sumar gente. Cuando el aviso describe el proceso manual, CAPTURALO TEXTUALMENTE en la señal: es lo más valioso que vas a encontrar.

Clasificá cada hallazgo en una de las dos verticales.

CONFIG DE BÚSQUEDA (scoring, exclusiones duras, fuentes e ICP de fallback — respetala al pie de la letra):
${busquedasMd}
${buildIcpBlock(campaign)}${extraQuery ? `\nBÚSQUEDA EXTRA pedida en este run: "${extraQuery}"\n` : ""}
INSTRUCCIONES:
1. Usá la web search para buscar llamados VIGENTES (publicados en los últimos ~30 días) combinando las keywords con las geografías de la config. Repartí las búsquedas entre las DOS verticales. Buscá en: LinkedIn Jobs (resultados públicos indexados, ej. "site:linkedin.com/jobs community manager Uruguay"), Computrabajo, BuscoJobs y portales locales.
2. Por cada llamado real que encuentres, reportá: EMPRESA (el dato más importante — si el aviso es de una consultora de RRHH y no se sabe la empresa final, decilo), PUESTO, UBICACIÓN, URL del aviso, FUENTE, VERTICAL (growth o dev), por qué es candidata (SEÑAL), SECTOR de la empresa, SCORE 1-5 según la guía de la config, y un ÁNGULO DE PITCH de una frase.
3. Aplicá las exclusiones de la config (agencias de marketing contratando para sí, software factories y consultoras de IT contratando devs, freelance puro, etc.).
4. ÁNGULO DE PITCH para la vertical dev: SIEMPRE aditivo. Nunca "no contrates a esa persona" ni "reemplazá el puesto" — el ángulo es que un sistema absorbe la parte repetitiva para que quien entre haga el trabajo que importa.
5. NO inventes llamados ni empresas: solo lo que realmente encontraste, con su URL. Si encontrás pocos, está bien — mejor 3 reales que 10 inventados.

Al final escribí un análisis en texto con TODOS los llamados encontrados y sus datos.`;
}

// ---------------------------------------------------------------------------
// Reporte del run
// ---------------------------------------------------------------------------

/** Una sección por campaña (o una sola si corrió en modo fallback). */
function buildReportMd(results, today, totalInserted, contacto) {
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
    lines.push(
      "",
      "| Empresa | Vertical | Puesto | Score | Estado | Señal |",
      "|---|---|---|---|---|---|",
    );
    for (const it of r.items) {
      const norm = normalizeCompany(it.empresa);
      const estado = r.insertedCompanies.has(norm)
        ? "✅ cargado a /pipeline"
        : r.dupCompanies.has(norm)
          ? "↩ ya estaba en el pipeline"
          : (it.score ?? 0) >= SCORE_MIN_PIPELINE
            ? "— (tope de la campaña alcanzado)"
            : `score ${it.score} < ${SCORE_MIN_PIPELINE} (solo reporte)`;
      const vert = it.vertical === "dev" ? "⚙ Desarrollo" : "📣 Growth";
      lines.push(
        `| ${it.empresa} | ${vert} | ${it.puesto}${it.ubicacion ? ` (${it.ubicacion})` : ""} | ${it.score} | ${estado} | ${(it.senal ?? "").slice(0, 140)}${it.url ? ` — [aviso](${it.url})` : ""} |`,
      );
    }
    if (r.sources.length > 0) {
      lines.push("", "<details><summary>Fuentes consultadas</summary>", "");
      for (const s of r.sources.slice(0, 15)) lines.push(`- [${s.title}](${s.url})`);
      lines.push("", "</details>");
    }
    lines.push("");
  }

  if (contacto) {
    lines.push("## Contacto", "");
    lines.push(
      `Datos de contacto encontrados en **${contacto.completados}** de ${contacto.buscados ?? 0} empresas (web institucional, telefono, casilla de contacto).`,
      "",
      "Lo que se consigue por fuentes publicas es contacto de EMPRESA, no el mail del decisor: queda en la ficha como casilla de la empresa y **no habilita el envio automatico**. Para eso, cargale a mano el mail del decisor desde la ficha del prospecto.",
      "",
    );
    if (contacto.error) lines.push(`No se pudo completar: ${contacto.error}`, "");
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

  // Corrida dirigida: el dashboard manda campaignId al crear una campaña.
  const campaignId =
    typeof brief.campaignId === "string" && brief.campaignId.trim()
      ? brief.campaignId.trim()
      : null;

  const runId = await logAgentRun("_system", AGENT, "running", "Buscando llamados laborales…", {
    source: brief.source ?? "manual",
    extraQuery: brief.extraQuery ?? null,
    campaignId,
  });
  currentRunId = runId;

  // Campañas activas = la config operativa (mig 100). Sin ninguna, [null]
  // hace UNA corrida con el ICP de fallback del vault — idéntico al
  // comportamiento previo a las campañas.
  const campaigns = await fetchActiveCampaigns(campaignId);

  // Dirigida a una campaña que ya no está activa (la pausaron o borraron):
  // NO caemos al ICP del vault, eso cargaría prospectos de otro perfil.
  if (campaignId && campaigns.length === 0) {
    const summary = "La campaña pedida ya no está activa — no se buscó nada.";
    console.log(`[${AGENT}] ${summary}`);
    if (runId) await updateAgentRun(runId, { status: "success", summary });
    return;
  }

  const targets = campaignId
    ? campaigns
    : campaigns.length > 0
      ? campaigns.slice(0, MAX_CAMPAIGNS_PER_RUN)
      : [null];
  console.log(
    campaignId
      ? `[${AGENT}] corrida dirigida a la campaña "${campaigns[0]?.name ?? campaignId}"`
      : `[${AGENT}] campañas activas: ${campaigns.length}${campaigns.length > MAX_CAMPAIGNS_PER_RUN ? ` (corro las primeras ${MAX_CAMPAIGNS_PER_RUN})` : ""}`,
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

      // Devuelve las filas con su id: las necesitamos para completar el
      // contacto despues.
      const insertadas = await insertLeads(toInsert);
      totalInserted += toInsert.length;
      console.log(
        `[${AGENT}] "${label}": ${toInsert.length} cargados (dup: ${dupCompanies.size}).`,
      );
      results.push({
        campaign,
        items,
        insertedCompanies,
        dupCompanies,
        sources,
        inserted: insertadas,
        error: null,
      });
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
        inserted: [],
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

  // Contacto publico de las empresas nuevas. Una pasada por corrida, despues
  // del dedup: recien aca se sabe a quien vale la pena buscarle contacto.
  // Non-fatal: los prospectos ya estan cargados.
  let contacto = { completados: 0, buscados: 0 };
  try {
    const nuevos = results.flatMap((r) => r.inserted ?? []);
    contacto = await completarContactos(nuevos);
    console.log(
      `[${AGENT}] contacto completado en ${contacto.completados}/${contacto.buscados ?? 0} empresas.`,
    );
  } catch (err) {
    console.warn(`::warning::[${AGENT}] la busqueda de contacto fallo: ${err.message}`);
    contacto = { completados: 0, buscados: 0, error: err.message };
  }

  // Reporte + cierre
  const reportMd = buildReportMd(results, today, totalInserted, contacto);
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
