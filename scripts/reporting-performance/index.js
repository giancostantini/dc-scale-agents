/**
 * Analytics Agent (Reporting Performance) — v2
 *
 * Generates business-level analytics reports (daily, weekly, biweekly, monthly),
 * prioritized improvement insights, custom reports, and natural language answers.
 *
 * Phase 1 (current): simulated — Claude estimates KPIs from vault context
 * Phase 2: read historical snapshots from Supabase
 * Phase 3: connect Shopify, Meta, GA4, Google Ads APIs for real-time data
 *
 * Modes: daily | weekly | biweekly | monthly | insights | custom | query
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { parseBrief, DEFAULT_BRIEF } from "./brief-schema.js";
import {
  logAgentRun,
  logAgentError,
  updateAgentRun,
  registerAgentOutput,
  pushNotification,
} from "../lib/supabase.js";

const AGENT = "reporting-performance";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VAULT = resolve(__dirname, "../../vault");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// --- CLI parsing ---
// Usage:
//   node index.js --brief path/to/brief.json
//   node index.js <client-slug> daily
//   node index.js <client-slug> query "¿Qué canal tiene mejor ROAS?"
// Requiere client slug — falla si no se pasa.

function loadBriefFromArgs() {
  const args = process.argv.slice(2);

  const briefFlagIdx = args.indexOf("--brief");
  if (briefFlagIdx !== -1 && args[briefFlagIdx + 1]) {
    const briefPath = resolve(process.cwd(), args[briefFlagIdx + 1]);
    const raw = JSON.parse(readFileSync(briefPath, "utf-8"));
    return parseBrief({ ...raw, source: raw.source || "cli" });
  }

  const client = args[0] || DEFAULT_BRIEF.client;
  const mode = args[1] || DEFAULT_BRIEF.mode;
  const question = mode === "query" ? args.slice(2).join(" ") || null : null;

  return parseBrief({ client, mode, source: "cli", question });
}

// --- Helpers ---

function readVaultFile(relativePath) {
  try {
    return readFileSync(resolve(VAULT, relativePath), "utf-8");
  } catch {
    return null;
  }
}

function writeVaultFile(relativePath, content) {
  const filePath = resolve(VAULT, relativePath);
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, content, "utf-8");
}

function appendToVaultFile(relativePath, content) {
  const filePath = resolve(VAULT, relativePath);
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const existing = existsSync(filePath) ? readFileSync(filePath, "utf-8") : "";
  writeFileSync(filePath, existing + "\n" + content, "utf-8");
}

async function callClaude(prompt, maxTokens = 8192) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.content[0].text;
}

function getTodayISO() {
  return new Date().toISOString().split("T")[0];
}

function getTodayFormatted() {
  return new Date().toLocaleDateString("es-UY", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// --- Context Loader ---

function loadClientContext(client, vaultContext = null) {
  console.log(`Loading vault context for client: ${client}`);

  // Si vaultContext viene precargado (Vercel fast-path), usalo para los
  // archivos clave. El resto se leen del filesystem (GHA) o quedan null
  // (Vercel — esos archivos no se incluyen en el bundle).
  const context = {
    agencyContext: readVaultFile("CLAUDE.md"),
    clientBrand:
      vaultContext?.claudeClient ?? readVaultFile(`clients/${client}/claude-client.md`),
    strategy:
      vaultContext?.strategy ?? readVaultFile(`clients/${client}/strategy.md`),
    performanceLog: readVaultFile(`clients/${client}/performance-log.md`),
    metricsLog: readVaultFile(`clients/${client}/metrics-log.md`),
    adsLog: readVaultFile(`clients/${client}/ads-log.md`),
    salesLog: readVaultFile(`clients/${client}/sales-log.md`),
    contentLibrary: readVaultFile(`clients/${client}/content-library.md`),
    learningLog:
      vaultContext?.learningLog ?? readVaultFile(`clients/${client}/learning-log.md`),
    productCatalog: readVaultFile(`clients/${client}/product-catalog.md`),
  };

  const loaded = Object.entries(context).filter(([, v]) => v !== null).length;
  const total = Object.keys(context).length;
  console.log(`Vault context loaded: ${loaded}/${total} files found`);

  return context;
}

// --- Business Type KPI Guide ---

function getBusinessTypeGuide(businessType) {
  const guides = {
    ecommerce: `TIPO DE NEGOCIO: eCommerce
KPIs PRIORITARIOS: Revenue, AOV (ticket promedio), tasa de conversion, tasa de abandono de carrito, ROAS, CAC, LTV, LTV/CAC ratio, tasa de recompra, revenue por canal.
BENCHMARKS: Conversion 1-3%, abandono carrito 60-80% (bajar es enorme upside), ROAS >3x es saludable, CAC debe ser <1/3 del LTV, LTV/CAC >3x sano.`,
    services: `TIPO DE NEGOCIO: Servicios
KPIs PRIORITARIOS: CAC, LTV, retencion, margen por proyecto, revenue recurrente, NPS.
BENCHMARKS: Retencion >80% anual, LTV/CAC >3x, margen bruto 50-70%.`,
    "physical-retail": `TIPO DE NEGOCIO: Retail fisico
KPIs PRIORITARIOS: Ticket promedio, trafico en tienda, conversion en tienda, ventas/m2, rotacion inventario.
BENCHMARKS: Conversion tienda 20-30%.`,
    saas: `TIPO DE NEGOCIO: SaaS
KPIs PRIORITARIOS: MRR, ARR, churn, NRR, expansion revenue, LTV, CAC, payback.
BENCHMARKS: Churn <5%/mes, NRR >100%, payback <12 meses.`,
    "it-services": `TIPO DE NEGOCIO: Servicios IT
KPIs PRIORITARIOS: Margen por proyecto, utilizacion, delivery time, backlog.
BENCHMARKS: Utilizacion 70-85%, margen 40-60%.`,
  };
  return guides[businessType] || guides.ecommerce;
}

// --- Shared context block (reused across modes) ---

function buildContextBlock(ctx) {
  return `--- CONTEXTO DE LA AGENCIA ---
${ctx.agencyContext || "Sin contexto de agencia."}

--- MARCA DEL CLIENTE ---
${ctx.clientBrand || "Sin contexto de marca."}

--- ESTRATEGIA ACTIVA ---
${ctx.strategy || "Sin estrategia definida."}

--- HISTORIAL DE PERFORMANCE (reportes previos) ---
${ctx.performanceLog || "Sin historial de performance. Primer reporte."}

--- LOG DE VENTAS ---
${ctx.salesLog || "Sin log de ventas."}

--- HISTORIAL DE ADS ---
${ctx.adsLog || "Sin historial de ads."}

--- METRICAS DE CONTENIDO ---
${ctx.metricsLog || "Sin metricas de contenido."}

--- LIBRARY DE CONTENIDO ---
${ctx.contentLibrary || "Sin piezas registradas."}

--- CATALOGO DE PRODUCTOS ---
${ctx.productCatalog || "Sin catalogo."}

--- LEARNING LOG ---
${ctx.learningLog || "Sin learnings."}`;
}

// --- Prompt Builders per mode ---

function buildDailyPrompt(ctx, brief) {
  return `Eres el Analytics Agent de D&C Scale Partners.

Genera el REPORTE DIARIO del negocio. Es el "pulso del dia" — comparacion vs ayer, numeros clave, resumen narrativo.

CLIENTE: ${brief.client}
FECHA: ${getTodayFormatted()}
MODO: daily

${getBusinessTypeGuide(brief.businessType)}

${buildContextBlock(ctx)}

${brief.revenueData ? `--- DATOS DE HOY (proporcionados) ---\n${JSON.stringify(brief.revenueData, null, 2)}` : ""}

${brief.instructions ? `--- INSTRUCCIONES ADICIONALES ---\n${brief.instructions}` : ""}

---

IMPORTANTE: Tu rol es generar un reporte breve, accionable, que el dueño del negocio pueda leer en 60 segundos.

Si no hay datos reales suficientes, explicalo claramente y estima con rangos razonables basados en el contexto.

GENERA (formato Markdown):

## Reporte diario — ${getTodayISO()}

### Pulso del dia
- **Trafico vs ayer:** [+/- X%] · [sesiones] · [users]
- **Conversiones hoy:** [numero] · ROAS [Xx]
- **Inversion del dia:** [$X] · desglose por canal
- **Revenue estimado:** [$X]

### Resumen narrativo (2-3 oraciones)
Explica que tipo de dia fue, que lo impulso, que freno.

### Alertas del dia (si las hay)
- Campañas con CAC por encima del target
- Caidas de trafico o conversion inesperadas
- Nada si todo marcha estable

### Accion sugerida para hoy
Una sola accion concreta, priorizada.

---ANALYTICS_JSON---

\`\`\`json
{
  "date": "${getTodayISO()}",
  "client": "${brief.client}",
  "mode": "daily",
  "kpis": {
    "sessions": 0,
    "users": 0,
    "conversions": 0,
    "revenue": 0,
    "adSpend": 0,
    "roas": 0,
    "cac": 0
  },
  "deltaVsYesterday": {
    "traffic": "+X%",
    "conversions": "+X",
    "revenue": "+X%"
  },
  "narrative": "resumen en 2-3 oraciones",
  "alerts": ["alerta 1", "alerta 2"],
  "suggestedAction": "accion concreta"
}
\`\`\``;
}

function buildPeriodicPrompt(ctx, brief, periodLabel, comparisonLabel) {
  return `Eres el Analytics Agent de D&C Scale Partners.

Genera el REPORTE ${periodLabel.toUpperCase()} del negocio. Analisis completo con comparativa ${comparisonLabel}.

CLIENTE: ${brief.client}
FECHA: ${getTodayFormatted()}
MODO: ${brief.mode} (ultimos ${brief.lookbackDays} dias)

${getBusinessTypeGuide(brief.businessType)}
${brief.focusAreas ? `\nAREAS DE FOCO: ${brief.focusAreas.join(", ")}` : ""}

${buildContextBlock(ctx)}

${brief.revenueData ? `--- DATOS DEL PERIODO (proporcionados) ---\n${JSON.stringify(brief.revenueData, null, 2)}` : ""}

${brief.instructions ? `--- INSTRUCCIONES ADICIONALES ---\n${brief.instructions}` : ""}

---

GENERA (formato Markdown, apto para mostrar al cliente):

## Reporte ${periodLabel} — ${getTodayISO()}
Periodo: ultimos ${brief.lookbackDays} dias

### Resumen ejecutivo
- Health score: **healthy / attention-needed / critical**
- Mejor KPI: [nombre] — [valor] — [por que]
- Peor KPI / oportunidad mas grande: [nombre] — [valor] — [que hacer]
- Hallazgo principal del periodo

### KPIs principales
| KPI | Valor actual | ${comparisonLabel} | Variacion | Tendencia |
|-----|-------------|-------------------|-----------|-----------|
| Revenue | $X | $X | +X% | up/stable/down |
| Ventas (cantidad) | X | X | +X% | up/stable/down |
| AOV / Ticket promedio | $X | $X | +X% | up/stable/down |
| Tasa de conversion | X% | X% | +X pp | up/stable/down |
| Tasa de abandono carrito | X% | X% | -X pp | up/stable/down |
| CAC | $X | $X | -X% | up/stable/down |
| LTV | $X | $X | +X% | up/stable/down |
| LTV/CAC | X.Xx | X.Xx | +X% | up/stable/down |
| ROAS | X.Xx | X.Xx | +X% | up/stable/down |
| Sesiones | X | X | +X% | up/stable/down |
| Bounce rate | X% | X% | -X pp | up/stable/down |
| Tasa de recompra | X% | X% | +X pp | up/stable/down |

### Breakdown por canal
Revenue / CAC / ROAS por cada canal (organico, paid Meta, paid Google, email, referral).

### Top productos del periodo
Los 3-5 productos que mas vendieron, con unidades y revenue.

### Analisis de funnel
Visitantes → ATC → Checkout iniciado → Compra completada. Donde se pierde mas gente.

### Recomendaciones accionables (3-5)
Prioridad + accion + impacto estimado en $/leads.

---ANALYTICS_JSON---

\`\`\`json
{
  "date": "${getTodayISO()}",
  "client": "${brief.client}",
  "mode": "${brief.mode}",
  "period": { "days": ${brief.lookbackDays}, "end": "${getTodayISO()}" },
  "healthScore": "healthy|attention-needed|critical",
  "kpis": {
    "revenue": 0, "sales": 0, "aov": 0,
    "conversionRate": 0, "cartAbandonment": 0,
    "cac": 0, "ltv": 0, "ltvCacRatio": 0, "roas": 0,
    "sessions": 0, "bounceRate": 0, "repurchaseRate": 0
  },
  "channels": [
    { "name": "meta-ads", "revenue": 0, "cac": 0, "roas": 0 }
  ],
  "topProducts": [
    { "name": "", "units": 0, "revenue": 0 }
  ],
  "funnel": {
    "sessions": 0, "addToCart": 0, "checkoutStarted": 0, "purchased": 0
  },
  "recommendations": [
    { "priority": "ALTA|MEDIA|OPORTUNIDAD", "action": "", "impactEstimate": "" }
  ]
}
\`\`\``;
}

function buildInsightsPrompt(ctx, brief) {
  return `Eres el Analytics Agent de D&C Scale Partners.

Tu trabajo AHORA es generar "INPUTS CLAVE DE MEJORA" — una lista priorizada de acciones concretas con impacto estimado en revenue.

Este output alimenta directamente el dashboard del cliente (seccion "Inputs clave de mejora").

CLIENTE: ${brief.client}
FECHA: ${getTodayFormatted()}
LOOKBACK: ultimos ${brief.lookbackDays} dias

${getBusinessTypeGuide(brief.businessType)}

${buildContextBlock(ctx)}

${brief.instructions ? `--- INSTRUCCIONES ADICIONALES ---\n${brief.instructions}` : ""}

---

IMPORTANTE:
- Cada insight debe tener **impacto estimado cuantificado en $ o unidades** (ej. "+$2.400/mes en revenue", "+42 leads/mes")
- Priorizar: ALTA (bloqueante / gran oportunidad) / MEDIA (mejora clara) / OPORTUNIDAD (upside sin riesgo)
- Usar datos del contexto para justificar. Si no hay datos, indicar que se necesita medir.
- Generar ENTRE 3 Y 6 insights, no mas.

GENERA (formato Markdown + JSON al final):

## Inputs clave de mejora — ${getTodayISO()}

### [ALTA | MEDIA | OPORTUNIDAD] — Titulo del insight (1 linea accionable)
**Contexto:** por que es importante, que metrica/dato lo evidencia.
**Impacto estimado:** +$X/mes en revenue (o +X leads, +X conversiones).
**Accion recomendada:** proximo paso concreto.

(repetir para cada insight)

---INSIGHTS_JSON---

\`\`\`json
{
  "date": "${getTodayISO()}",
  "client": "${brief.client}",
  "mode": "insights",
  "insights": [
    {
      "priority": "ALTA|MEDIA|OPORTUNIDAD",
      "title": "",
      "context": "",
      "impactEstimate": "",
      "recommendedAction": ""
    }
  ]
}
\`\`\``;
}

function buildCustomPrompt(ctx, brief) {
  const typeGuides = {
    "channel-deep-dive": "Analisis profundo de un canal especifico: performance, ROI, tendencias, oportunidades.",
    "cohort-analysis": "Analisis por cohortes: como se comportan los usuarios segun su mes de primera compra.",
    "funnel": "Analisis completo del funnel: donde se pierde gente, conversion por step, oportunidades.",
    "ltv-cac": "Deep dive en LTV/CAC por canal, segmento y cohorte. Tiempo de payback.",
    "forecast": "Proyeccion de revenue, ventas y KPIs para el proximo mes basada en tendencia actual.",
    "free-form": "Reporte custom segun los filtros y description del brief.",
  };

  const guide = typeGuides[brief.customReportType] || typeGuides["free-form"];

  return `Eres el Analytics Agent de D&C Scale Partners.

Generas un REPORTE CUSTOM on-demand.

TIPO DE REPORTE: ${brief.customReportType || "free-form"}
DESCRIPCION: ${guide}
CLIENTE: ${brief.client}
FECHA: ${getTodayFormatted()}
LOOKBACK: ${brief.lookbackDays} dias
${brief.customFilters ? `FILTROS: ${JSON.stringify(brief.customFilters)}` : ""}

${getBusinessTypeGuide(brief.businessType)}

${buildContextBlock(ctx)}

${brief.instructions ? `--- INSTRUCCIONES / DESCRIPCION DEL REPORTE ---\n${brief.instructions}` : ""}

---

GENERA un reporte en Markdown con la estructura apropiada para el tipo solicitado. Incluye:
- Resumen ejecutivo
- KPIs relevantes para este analisis (no todos, solo los que importan)
- Hallazgos concretos con datos
- Recomendaciones accionables al final

Se riguroso con los numeros. Si no hay datos suficientes, indicalo y sugiere que se necesita medir.`;
}

function buildQueryPrompt(ctx, brief) {
  return `Eres el Analytics Agent de D&C Scale Partners.

El dueno del negocio te hizo la siguiente consulta en lenguaje natural. Responde de forma directa, breve y basada en datos.

CLIENTE: ${brief.client}
FECHA: ${getTodayFormatted()}

PREGUNTA:
"${brief.question}"

${getBusinessTypeGuide(brief.businessType)}

${buildContextBlock(ctx)}

---

IMPORTANTE:
- Responde en maximo 3-4 parrafos, usando los datos del contexto.
- Si no hay datos suficientes, decilo claramente y explica que se necesita medir.
- Da numeros concretos cuando puedas. No inventes datos que no tenes.
- Si la pregunta requiere accion, termina con 1-2 recomendaciones.

Responde ahora:`;
}

// --- Parsers ---

function extractJsonBlock(output, marker) {
  try {
    const markerIdx = output.indexOf(marker);
    if (markerIdx === -1) return null;
    const afterMarker = output.slice(markerIdx);
    const jsonMatch = afterMarker.match(/```json\s*([\s\S]*?)\s*```/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[1]);
  } catch (err) {
    console.warn(`Could not parse JSON block (${marker}): ${err.message}`);
    return null;
  }
}

// --- Main: exported for programmatic use ---

export async function runAnalyticsAgent(briefInput) {
  const brief = parseBrief(briefInput);
  const startTime = Date.now();
  console.log(
    `Analytics Agent — ${brief.mode} for ${brief.client} (source: ${brief.source})`
  );

  // vaultContext viene del fast-path en Vercel (precargado via GitHub API).
  // En GHA no viene — se lee del filesystem.
  const ctx = loadClientContext(brief.client, briefInput?.vaultContext ?? null);

  // Build prompt based on mode
  let prompt;
  let jsonMarker = "---ANALYTICS_JSON---";
  switch (brief.mode) {
    case "daily":
      prompt = buildDailyPrompt(ctx, brief);
      break;
    case "weekly":
      prompt = buildPeriodicPrompt(ctx, brief, "semanal", "semana anterior");
      break;
    case "biweekly":
      prompt = buildPeriodicPrompt(ctx, brief, "quincenal", "quincena anterior");
      break;
    case "monthly":
      prompt = buildPeriodicPrompt(ctx, brief, "mensual", "mes anterior");
      break;
    case "insights":
      prompt = buildInsightsPrompt(ctx, brief);
      jsonMarker = "---INSIGHTS_JSON---";
      break;
    case "custom":
      prompt = buildCustomPrompt(ctx, brief);
      jsonMarker = null;
      break;
    case "query":
      prompt = buildQueryPrompt(ctx, brief);
      jsonMarker = null;
      break;
    default:
      throw new Error(`Unknown mode: ${brief.mode}`);
  }

  console.log("Calling Claude API...");
  const output = await callClaude(prompt);
  console.log("Report generated.");

  // Parse structured data if available
  const structuredData = jsonMarker ? extractJsonBlock(output, jsonMarker) : null;

  // Write outputs
  const today = getTodayISO();
  const reportEntry = `\n\n---\n\n## ${brief.mode.toUpperCase()} report — ${today}\nSource: ${brief.source}\n\n${output}`;

  // Query mode doesn't persist to performance-log (it's ephemeral)
  if (brief.mode !== "query") {
    appendToVaultFile(`clients/${brief.client}/performance-log.md`, reportEntry);
    console.log(`Appended to performance-log.md`);

    // Write structured JSON for dashboard consumption
    if (structuredData) {
      const fileName =
        brief.mode === "insights"
          ? `insights-${today}.json`
          : `analytics-${brief.mode}-${today}.json`;
      writeVaultFile(
        `clients/${brief.client}/agent-reports/${fileName}`,
        JSON.stringify(structuredData, null, 2)
      );
      console.log(`Wrote structured report: agent-reports/${fileName}`);
    }
  }

  const runId = brief.runId ?? null;
  const shortSummary = `Analytics ${brief.mode} generado para ${brief.client}`;

  await registerAgentOutput(runId, brief.client, AGENT, {
    output_type: "report",
    title: `Analytics — ${brief.mode} — ${getTodayFormatted()}`,
    body_md: output,
    structured: structuredData ?? { mode: brief.mode },
  });

  if (runId) {
    await updateAgentRun(runId, {
      status: "success",
      summary: shortSummary,
      summary_md: output,
      performance: { duration_ms: Date.now() - startTime },
    });
  } else {
    await logAgentRun(
      brief.client,
      AGENT,
      "success",
      shortSummary,
      { mode: brief.mode, source: brief.source },
      { duration_ms: Date.now() - startTime }
    );
  }

  const shouldNotify = ["daily", "weekly", "biweekly", "monthly", "insights"].includes(brief.mode);
  if (shouldNotify) {
    let notifBody = shortSummary;
    if (structuredData) {
      if (brief.mode === "daily" && structuredData.narrative) {
        notifBody = structuredData.narrative.slice(0, 240);
      } else if (brief.mode === "insights" && structuredData.insights) {
        const altas = structuredData.insights.filter((i) => i.priority === "ALTA");
        notifBody = `${structuredData.insights.length} insights generados (${altas.length} prioridad ALTA)`;
      } else if (structuredData.healthScore) {
        notifBody = `Health: ${structuredData.healthScore}`;
      }
    }
    await pushNotification(brief.client, "info", `Analytics ${brief.mode} listo`, notifBody, {
      agent: AGENT,
      link: `/cliente/${brief.client}`,
    });
  }

  return {
    mode: brief.mode,
    client: brief.client,
    source: brief.source,
    output,
    structuredData,
    registeredAt: brief.mode === "query" ? null : `vault/clients/${brief.client}/performance-log.md`,
  };
}

// --- CLI entry point ---

async function main() {
  const brief = loadBriefFromArgs();
  const result = await runAnalyticsAgent(brief);

  console.log("\n" + "=".repeat(60));
  console.log(`ANALYTICS — ${result.mode.toUpperCase()} — ${result.client}`);
  console.log("=".repeat(60) + "\n");
  console.log(result.output);
  console.log("\n" + "=".repeat(60));
}

// Export a programmatic alias so callers can use a uniform `run(brief)` signature.
export const run = runAnalyticsAgent;

// --- CLI entry point (only when invoked directly) ---

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  main().catch(async (err) => {
    console.error(`[${AGENT}] failed:`, err.message);
    const fallbackBrief = (() => {
      try {
        return loadBriefFromArgs();
      } catch {
        return { client: "_unknown", runId: null };
      }
    })();
    await logAgentError(fallbackBrief.client, AGENT, err, {});
    if (fallbackBrief.runId) {
      await updateAgentRun(fallbackBrief.runId, { status: "error", summary: err.message });
    }
    await pushNotification(fallbackBrief.client, "error", `Analytics falló`, err.message, { agent: AGENT });
    process.exit(1);
  });
}
