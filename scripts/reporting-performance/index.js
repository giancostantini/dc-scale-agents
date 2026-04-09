import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { parseBrief, DEFAULT_BRIEF } from "./brief-schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VAULT = resolve(__dirname, "../../vault");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// --- CLI parsing ---
// Usage:
//   node index.js --brief path/to/brief.json      (full brief)
//   node index.js dmancuello metrics               (shorthand: client + mode)
//   node index.js                                  (defaults: metrics)

function loadBriefFromArgs() {
  const args = process.argv.slice(2);

  const briefFlagIdx = args.indexOf("--brief");
  if (briefFlagIdx !== -1 && args[briefFlagIdx + 1]) {
    const briefPath = resolve(process.cwd(), args[briefFlagIdx + 1]);
    const raw = JSON.parse(readFileSync(briefPath, "utf-8"));
    return parseBrief({ ...raw, source: raw.source || "cli" });
  }

  return parseBrief({
    client: args[0] || DEFAULT_BRIEF.client,
    mode: args[1] || DEFAULT_BRIEF.mode,
    source: "cli",
  });
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
      model: "claude-sonnet-4-20250514",
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

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  const res = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "Markdown",
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram error ${res.status}: ${err}`);
  }
}

function getTodayFormatted() {
  return new Date().toLocaleDateString("es-UY", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function getTodayISO() {
  return new Date().toISOString().split("T")[0];
}

// --- Context Loader ---

function loadClientContext(client) {
  console.log(`Loading vault context for client: ${client}`);

  const context = {
    agencyContext: readVaultFile("CLAUDE.md"),
    clientBrand: readVaultFile(`clients/${client}/claude-client.md`),
    strategy: readVaultFile(`clients/${client}/strategy.md`),
    performanceLog: readVaultFile(`clients/${client}/performance-log.md`),
    metricsLog: readVaultFile(`clients/${client}/metrics-log.md`),
    adsLog: readVaultFile(`clients/${client}/ads-log.md`),
    salesLog: readVaultFile(`clients/${client}/sales-log.md`),
    learningLog: readVaultFile(`clients/${client}/learning-log.md`),
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
KPIs PRIORITARIOS: AOV (ticket promedio), tasa de conversion, ROAS, CAC, LTV, tasa de abandono de carrito, revenue por canal, tasa de recompra.
BENCHMARKS TIPICOS: Conversion 1-3%, AOV depende del nicho, ROAS >3x es saludable, CAC debe ser <1/3 del LTV.`,
    services: `TIPO DE NEGOCIO: Servicios
KPIs PRIORITARIOS: CAC, LTV, tasa de retencion de clientes, margen por proyecto/servicio, revenue recurrente, NPS, tiempo de cierre de venta.
BENCHMARKS TIPICOS: Retencion >80% anual es buena, LTV/CAC >3x es saludable, margen bruto servicios 50-70%.`,
    "physical-retail": `TIPO DE NEGOCIO: Retail fisico
KPIs PRIORITARIOS: Ticket promedio, trafico en tienda, tasa de conversion en tienda, ventas por m2, rotacion de inventario, same-store growth, margen bruto.
BENCHMARKS TIPICOS: Conversion en tienda 20-30%, rotacion de inventario depende del rubro.`,
    saas: `TIPO DE NEGOCIO: SaaS
KPIs PRIORITARIOS: MRR, ARR, churn mensual, expansion revenue, LTV, CAC, payback period, NRR (Net Revenue Retention).
BENCHMARKS TIPICOS: Churn <5% mensual, NRR >100%, payback <12 meses, LTV/CAC >3x.`,
    "it-services": `TIPO DE NEGOCIO: Servicios IT
KPIs PRIORITARIOS: Margen por proyecto, tasa de utilizacion del equipo, tiempo de entrega, backlog en horas, revenue por empleado, tasa de retencion de clientes.
BENCHMARKS TIPICOS: Utilizacion 70-85%, margen bruto 40-60%, retencion >85%.`,
  };
  return guides[businessType] || `TIPO DE NEGOCIO: General\nKPIs PRIORITARIOS: Revenue, CAC, LTV, ROAS, conversion rate, margen bruto, margen neto, tasa de crecimiento.`;
}

// --- Prompt Builders ---

function buildMetricsPrompt(ctx, brief) {
  return `Eres el Reporting Performance Agent de D&C Scale Partners.

Tu trabajo es calcular y analizar los KPIs clave del negocio del cliente, adaptandote al tipo de negocio.

CLIENTE: ${brief.client}
MODO: METRICS — Calculo de KPIs del periodo
FECHA: ${getTodayFormatted()}
PERIODO: ultimos ${brief.lookbackDays} dias
${brief.focusAreas ? `AREAS DE FOCO: ${brief.focusAreas.join(", ")}` : "AREAS DE FOCO: todas"}
${brief.revenueData ? `DATOS DE REVENUE PROPORCIONADOS: ${JSON.stringify(brief.revenueData)}` : ""}

${getBusinessTypeGuide(brief.businessType)}

--- CONTEXTO DE LA AGENCIA ---
${ctx.agencyContext || "Sin contexto de agencia."}

--- MARCA DEL CLIENTE ---
${ctx.clientBrand || "Sin contexto de marca."}

--- ESTRATEGIA ACTIVA ---
${ctx.strategy || "Sin estrategia definida."}

--- PERFORMANCE LOG (historial de KPIs) ---
${ctx.performanceLog || "Sin historial de performance. Este es el primer calculo de KPIs."}

--- METRICAS DE REDES SOCIALES ---
${ctx.metricsLog || "Sin metricas de redes."}

--- HISTORIAL DE ADS ---
${ctx.adsLog || "Sin historial de ads."}

--- LOG DE VENTAS ---
${ctx.salesLog || "Sin log de ventas."}

--- LEARNING LOG ---
${ctx.learningLog || "Sin learning log."}

${brief.instructions ? `--- INSTRUCCIONES ADICIONALES ---\n${brief.instructions}` : ""}

---

IMPORTANTE: Tu rol es:

1. CALCULAR todos los KPIs relevantes para el tipo de negocio del cliente
2. COMPARAR con el periodo anterior (si hay datos historicos en performance-log)
3. IDENTIFICAR tendencias: subiendo, estable, bajando para cada KPI clave
4. EVALUAR la salud general del negocio: healthy, attention-needed, critical
5. DESTACAR el mejor KPI y el peor KPI con explicacion

Si no hay datos suficientes para calcular un KPI, indicar "sin datos" y explicar que datos se necesitan.
Si se proporcionaron revenueData, usar esos numeros como base. Si no, estimar basandose en el contexto disponible.

---

GENERA EL SIGUIENTE REPORTE (formato Markdown):

## KPIs del Negocio — ${getTodayISO()}

### Resumen ejecutivo
- Health score: healthy / attention-needed / critical
- Mejor KPI: [nombre] — [valor] — [por que es bueno]
- Peor KPI: [nombre] — [valor] — [que hacer]
- Hallazgo principal

### Tabla de KPIs
| KPI | Valor actual | Periodo anterior | Variacion | Tendencia |
|-----|-------------|------------------|-----------|-----------|
| Revenue | $X | $X | +X% | up/stable/down |
| Ad Spend | $X | $X | +X% | up/stable/down |
| CAC | $X | $X | -X% | up/stable/down |
| LTV | $X | $X | +X% | up/stable/down |
| ROAS | X.X | X.X | +X% | up/stable/down |
| Tasa de conversion | X% | X% | +X pp | up/stable/down |
| Margen bruto | X% | X% | +X pp | up/stable/down |
| Margen neto | X% | X% | +X pp | up/stable/down |
| AOV / Ticket promedio | $X | $X | +X% | up/stable/down |
| Retencion de clientes | X% | X% | +X pp | up/stable/down |
| Crecimiento de revenue | X% | X% | +X pp | up/stable/down |

### Analisis por area
Para cada area de foco, explicar la situacion actual, que esta funcionando y que no.

### Alertas
- KPIs que estan fuera de benchmark o empeorando
- Acciones inmediatas recomendadas

### Notas para el Consultant Agent
Resumen de la salud del negocio y decisiones pendientes.

---PERFORMANCE_DATA_JSON---

\`\`\`json
{
  "date": "${getTodayISO()}",
  "client": "${brief.client}",
  "mode": "metrics",
  "businessType": "${brief.businessType || "general"}",
  "period": {
    "start": "YYYY-MM-DD",
    "end": "${getTodayISO()}",
    "days": ${brief.lookbackDays}
  },
  "kpis": {
    "revenue": 0,
    "adSpend": 0,
    "cac": 0,
    "ltv": 0,
    "roas": 0.0,
    "conversionRate": 0.0,
    "grossMargin": 0.0,
    "netMargin": 0.0,
    "averageOrderValue": 0,
    "customerRetentionRate": 0.0,
    "revenueGrowthRate": 0.0
  },
  "trends": {
    "revenue": "up|stable|down",
    "cac": "up|stable|down",
    "roas": "up|stable|down",
    "conversion": "up|stable|down"
  },
  "summary": {
    "healthScore": "healthy|attention-needed|critical",
    "topKpi": "nombre del mejor KPI",
    "worstKpi": "nombre del peor KPI",
    "keyInsight": "hallazgo principal"
  }
}
\`\`\``;
}

function buildMarketPrompt(ctx, brief) {
  return `Eres el Reporting Performance Agent de D&C Scale Partners.

Tu trabajo es analizar el posicionamiento del cliente en el mercado, comparar con la competencia y generar un analisis SWOT con recomendaciones estrategicas.

CLIENTE: ${brief.client}
MODO: MARKET — Analisis competitivo y de mercado
FECHA: ${getTodayFormatted()}
PERIODO DE REFERENCIA: ultimos ${brief.lookbackDays} dias
${brief.competitors ? `COMPETIDORES A ANALIZAR: ${brief.competitors.join(", ")}` : "COMPETIDORES: identificar los principales del mercado"}

${getBusinessTypeGuide(brief.businessType)}

--- CONTEXTO DE LA AGENCIA ---
${ctx.agencyContext || "Sin contexto de agencia."}

--- MARCA DEL CLIENTE ---
${ctx.clientBrand || "Sin contexto de marca."}

--- ESTRATEGIA ACTIVA ---
${ctx.strategy || "Sin estrategia definida."}

--- PERFORMANCE LOG ---
${ctx.performanceLog || "Sin historial de performance."}

--- METRICAS DE REDES SOCIALES ---
${ctx.metricsLog || "Sin metricas de redes."}

--- HISTORIAL DE ADS ---
${ctx.adsLog || "Sin historial de ads."}

--- LOG DE VENTAS ---
${ctx.salesLog || "Sin log de ventas."}

--- LEARNING LOG ---
${ctx.learningLog || "Sin learning log."}

${brief.instructions ? `--- INSTRUCCIONES ADICIONALES ---\n${brief.instructions}` : ""}

---

IMPORTANTE: Tu rol es:

1. ANALIZAR la posicion competitiva del cliente en su mercado
2. GENERAR un analisis SWOT basado en los datos disponibles
3. COMPARAR con competidores (si se proporcionaron) o identificar los principales
4. ESTABLECER benchmarks de la industria para contextualizar los KPIs del cliente
5. IDENTIFICAR oportunidades de mercado no explotadas
6. RECOMENDAR acciones estrategicas basadas en el posicionamiento

Basa el analisis en los datos de la vault (ventas, ads, metricas), el contexto del cliente y conocimiento general del mercado. Si no tienes datos especificos de competidores, genera estimaciones razonables basadas en el tipo de negocio y mercado.

---

GENERA EL SIGUIENTE ANALISIS (formato Markdown):

## Analisis de Mercado — ${getTodayISO()}

### Posicionamiento actual
Descripcion de donde esta el cliente en relacion al mercado. Fortalezas y debilidades clave.

### Analisis SWOT
#### Fortalezas
- [Fortaleza 1 — con datos que la respaldan]
- [Fortaleza 2]

#### Debilidades
- [Debilidad 1 — con datos]
- [Debilidad 2]

#### Oportunidades
- [Oportunidad 1 — por que es viable ahora]
- [Oportunidad 2]

#### Amenazas
- [Amenaza 1 — nivel de riesgo]
- [Amenaza 2]

### Analisis de competidores
| Competidor | Market share est. | Diferenciador clave | Posicion de precio | Evaluacion |
|------------|-------------------|--------------------|--------------------|------------|

Para cada competidor:
- Que hacen bien
- Donde son debiles
- Como nos diferenciamos

### Benchmarks de la industria
| Metrica | Nuestro valor | Benchmark industria | Posicion |
|---------|--------------|---------------------|----------|
| CAC | $X | $X | Above/At/Below |
| ROAS | X.X | X.X | Above/At/Below |
| Conversion | X% | X% | Above/At/Below |
| AOV | $X | $X | Above/At/Below |

### Oportunidades de mercado
Para cada oportunidad:
1. Descripcion
2. Tamano estimado
3. Barrera de entrada
4. Tiempo para capitalizar

### Recomendaciones estrategicas
1. [Recomendacion — con impacto esperado y prioridad]
2. [Recomendacion]
3. [Recomendacion]

### Notas para el Consultant Agent
Decisiones estrategicas que requieren discusion con el dueno.

---PERFORMANCE_DATA_JSON---

\`\`\`json
{
  "date": "${getTodayISO()}",
  "client": "${brief.client}",
  "mode": "market",
  "businessType": "${brief.businessType || "general"}",
  "marketPosition": {
    "strengths": ["fortaleza 1", "fortaleza 2"],
    "weaknesses": ["debilidad 1", "debilidad 2"],
    "opportunities": ["oportunidad 1", "oportunidad 2"],
    "threats": ["amenaza 1", "amenaza 2"]
  },
  "competitorAnalysis": [
    {
      "name": "nombre",
      "estimatedMarketShare": "X%",
      "keyDifferentiator": "diferenciador",
      "pricePosition": "lower|similar|higher"
    }
  ],
  "industryBenchmarks": {
    "avgCac": 0,
    "avgRoas": 0.0,
    "avgConversionRate": 0.0,
    "avgAov": 0
  },
  "recommendations": ["recomendacion 1", "recomendacion 2"],
  "learnings": ["aprendizaje 1", "aprendizaje 2"]
}
\`\`\``;
}

function buildReportPrompt(ctx, brief) {
  return `Eres el Reporting Performance Agent de D&C Scale Partners.

Tu trabajo es generar un reporte completo de performance del negocio con resumen ejecutivo, KPIs, analisis por canal, y acciones a seguir.

CLIENTE: ${brief.client}
MODO: REPORT — Reporte completo de performance
FECHA: ${getTodayFormatted()}
PERIODO: ultimos ${brief.lookbackDays} dias
${brief.focusAreas ? `AREAS DE FOCO: ${brief.focusAreas.join(", ")}` : "AREAS DE FOCO: todas"}
${brief.revenueData ? `DATOS DE REVENUE: ${JSON.stringify(brief.revenueData)}` : ""}

${getBusinessTypeGuide(brief.businessType)}

--- CONTEXTO DE LA AGENCIA ---
${ctx.agencyContext || "Sin contexto de agencia."}

--- MARCA DEL CLIENTE ---
${ctx.clientBrand || "Sin contexto de marca."}

--- ESTRATEGIA ACTIVA ---
${ctx.strategy || "Sin estrategia definida."}

--- PERFORMANCE LOG ---
${ctx.performanceLog || "Sin historial de performance. Este es el primer reporte."}

--- METRICAS DE REDES SOCIALES ---
${ctx.metricsLog || "Sin metricas de redes."}

--- HISTORIAL DE ADS ---
${ctx.adsLog || "Sin historial de ads."}

--- LOG DE VENTAS ---
${ctx.salesLog || "Sin log de ventas."}

--- LEARNING LOG ---
${ctx.learningLog || "Sin learning log."}

${brief.instructions ? `--- INSTRUCCIONES ADICIONALES ---\n${brief.instructions}` : ""}

---

GENERA UN REPORTE INTEGRAL DE PERFORMANCE:

1. RESUMEN EJECUTIVO: 3-5 oraciones que capturen el estado del negocio
2. KPIs COMPLETOS: todos los KPIs relevantes con comparacion al periodo anterior
3. DESGLOSE POR CANAL: organico, paid social, SEO, directo, email — revenue, gasto, ROAS, contribucion
4. ACCIONES PRIORITARIAS: items concretos ordenados por impacto esperado
5. APRENDIZAJES: que funciono, que no, que cambio

---

GENERA EL SIGUIENTE REPORTE (formato Markdown):

## Reporte de Performance — ${getTodayISO()}

### Resumen ejecutivo
[3-5 oraciones con los hallazgos mas importantes, salud del negocio, y prioridad #1]

### KPIs del periodo
| KPI | Valor actual | Periodo anterior | Variacion | Estado |
|-----|-------------|------------------|-----------|--------|
| Revenue total | $X | $X | +X% | OK/ALERTA |
| Ad Spend total | $X | $X | +X% | OK/ALTO |
| CAC | $X | $X | -X% | OK/ALTO |
| LTV | $X | $X | +X% | OK/BAJO |
| ROAS global | X.X | X.X | +X% | OK/BAJO |
| Tasa de conversion | X% | X% | +X pp | OK/BAJO |
| Margen bruto | X% | X% | +X pp | OK/BAJO |
| Margen neto | X% | X% | +X pp | OK/BAJO |
| AOV | $X | $X | +X% | OK/BAJO |
| Retencion | X% | X% | +X pp | OK/BAJO |
| Crecimiento | X% | X% | +X pp | OK/BAJO |

### Performance por canal
| Canal | Revenue | Gasto | ROAS | Contribucion | Tendencia |
|-------|---------|-------|------|-------------|-----------|
| Organico | $X | $0 | - | X% | up/stable/down |
| Paid Social | $X | $X | X.X | X% | up/stable/down |
| SEO | $X | $0 | - | X% | up/stable/down |
| Directo | $X | $0 | - | X% | up/stable/down |
| Email | $X | $X | X.X | X% | up/stable/down |

### Canal estrella
Cual es el canal con mejor performance y por que. Recomendacion de escalamiento.

### Canal problematico
Cual es el canal con peor performance. Diagnostico y recomendacion.

### Items de accion
Para cada item:
| Prioridad | Area | Accion | Impacto esperado |
|-----------|------|--------|------------------|
| HIGH | canal/kpi | accion concreta | resultado esperado |
| MEDIUM | canal/kpi | accion | resultado |
| LOW | canal/kpi | accion | resultado |

### Aprendizajes del periodo
- [Que funciono y por que]
- [Que no funciono y que cambiar]
- [Patron nuevo detectado]

### Notas para el Consultant Agent
Resumen para discutir con el dueno. Decisiones pendientes. Proximos pasos criticos.

---PERFORMANCE_DATA_JSON---

\`\`\`json
{
  "date": "${getTodayISO()}",
  "client": "${brief.client}",
  "mode": "report",
  "businessType": "${brief.businessType || "general"}",
  "period": {
    "start": "YYYY-MM-DD",
    "end": "${getTodayISO()}",
    "days": ${brief.lookbackDays}
  },
  "executiveSummary": "resumen en 2-3 oraciones",
  "kpis": {
    "revenue": 0,
    "adSpend": 0,
    "cac": 0,
    "ltv": 0,
    "roas": 0.0,
    "conversionRate": 0.0,
    "grossMargin": 0.0,
    "netMargin": 0.0,
    "averageOrderValue": 0,
    "customerRetentionRate": 0.0,
    "revenueGrowthRate": 0.0
  },
  "channelBreakdown": [
    {
      "channel": "organic|paid-social|seo|direct|email",
      "revenue": 0,
      "spend": 0,
      "roas": 0.0,
      "contribution": 0.0
    }
  ],
  "actionItems": [
    {
      "priority": "high|medium|low",
      "area": "area afectada",
      "action": "accion concreta",
      "expectedImpact": "impacto esperado"
    }
  ],
  "recommendations": ["recomendacion 1", "recomendacion 2"],
  "learnings": ["aprendizaje 1", "aprendizaje 2"]
}
\`\`\``;
}

// --- Parse structured data from output ---

function parsePerformanceData(output) {
  const separator = "---PERFORMANCE_DATA_JSON---";
  const idx = output.indexOf(separator);
  if (idx === -1) return null;

  const jsonPart = output.slice(idx + separator.length);
  const jsonMatch = jsonPart.match(/```json\s*([\s\S]*?)\s*```/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[1]);
  } catch {
    console.warn("Warning: could not parse Performance data JSON");
    return null;
  }
}

// --- Update vault files ---

function updateVaultWithPerformanceData(ctx, client, perfData, fullOutput, mode) {
  if (!perfData) return;

  const modeLabels = {
    metrics: "KPIs",
    market: "Analisis de Mercado",
    report: "Reporte de Performance",
  };

  let logEntry = `\n## ${modeLabels[mode]} — ${perfData.date}\n\n` +
    `Mode: ${mode} | Business type: ${perfData.businessType || "general"}\n`;

  if (perfData.kpis) {
    logEntry += `Revenue: $${perfData.kpis.revenue} | Ad Spend: $${perfData.kpis.adSpend} | CAC: $${perfData.kpis.cac} | LTV: $${perfData.kpis.ltv} | ROAS: ${perfData.kpis.roas} | Conversion: ${perfData.kpis.conversionRate}% | Margen bruto: ${perfData.kpis.grossMargin}%\n`;
  }

  if (perfData.summary) {
    logEntry += `Health: ${perfData.summary.healthScore} | Top KPI: ${perfData.summary.topKpi} | Worst KPI: ${perfData.summary.worstKpi} | Insight: ${perfData.summary.keyInsight}\n`;
  }

  if (perfData.executiveSummary) {
    logEntry += `Resumen: ${perfData.executiveSummary}\n`;
  }

  if (perfData.marketPosition) {
    logEntry += `Fortalezas: ${perfData.marketPosition.strengths?.length || 0} | Debilidades: ${perfData.marketPosition.weaknesses?.length || 0} | Oportunidades: ${perfData.marketPosition.opportunities?.length || 0} | Amenazas: ${perfData.marketPosition.threats?.length || 0}\n`;
  }

  appendToVaultFile(`clients/${client}/performance-log.md`, logEntry);
  console.log("Updated performance-log.md");

  // Update learning-log
  const learnings = [];

  if (perfData.summary?.keyInsight) {
    learnings.push(`- [${perfData.date}] Performance ${modeLabels[mode]}: ${perfData.summary.keyInsight}`);
  }

  if (perfData.recommendations) {
    for (const rec of perfData.recommendations.slice(0, 3)) {
      learnings.push(`- [${perfData.date}] Performance ${mode}: ${rec}`);
    }
  }

  if (perfData.learnings) {
    for (const learning of perfData.learnings.slice(0, 3)) {
      learnings.push(`- [${perfData.date}] Performance aprendizaje: ${learning}`);
    }
  }

  if (learnings.length > 0) {
    appendToVaultFile(
      `clients/${client}/learning-log.md`,
      `\n### Aprendizajes Performance — ${perfData.date}\n${learnings.join("\n")}\n`
    );
    console.log("Updated learning-log.md with performance learnings");
  }
}

// --- Main: exported for future use by Consultant Agent ---

export async function runReportingAgent(briefInput) {
  const brief = parseBrief(briefInput);
  console.log(
    `Reporting Performance Agent — ${brief.mode} for ${brief.client} (source: ${brief.source})`
  );

  // Step 1: Load vault context
  const ctx = loadClientContext(brief.client);

  // Step 2: Build prompt based on mode
  const promptBuilders = {
    metrics: buildMetricsPrompt,
    market: buildMarketPrompt,
    report: buildReportPrompt,
  };

  const prompt = promptBuilders[brief.mode](ctx, brief);

  // Step 3: Generate analysis
  console.log(`Generating ${brief.mode} analysis...`);
  const maxTokensMap = {
    metrics: 6000,
    market: 8000,
    report: 10000,
  };
  const maxTokens = maxTokensMap[brief.mode];
  const output = await callClaude(prompt, maxTokens);
  console.log(`${brief.mode} analysis generated successfully.`);

  // Step 4: Parse structured data
  const perfData = parsePerformanceData(output);

  // Step 5: Update vault files
  updateVaultWithPerformanceData(ctx, brief.client, perfData, output, brief.mode);

  // Step 6: Write agent report
  writeVaultFile(
    `clients/${brief.client}/agent-reports/reporting-performance-${brief.mode}-${getTodayISO()}.json`,
    JSON.stringify(
      {
        agent: "reporting-performance",
        mode: brief.mode,
        client: brief.client,
        date: getTodayISO(),
        perfData,
        timestamp: new Date().toISOString(),
      },
      null,
      2
    )
  );
  console.log("Wrote agent report.");

  // Step 7: Notify via Telegram
  const sourceLabel = {
    cli: "CLI manual",
    "consultant-agent": "Agente Consultor",
    dashboard: "Dashboard",
    "github-actions": "GitHub Actions",
  }[brief.source] || brief.source;

  const modeEmoji = {
    metrics: "\u{1F4C8}",
    market: "\u{1F30E}",
    report: "\u{1F4CA}",
  };

  const modeLabel = {
    metrics: "KPIs del Negocio",
    market: "Analisis de Mercado",
    report: "Reporte de Performance",
  };

  let telegramSummary = `*${modeEmoji[brief.mode]} Reporting Performance — ${modeLabel[brief.mode]}*
_${getTodayFormatted()}_

\u{1F464} *Cliente:* ${brief.client}
\u{1F4E1} *Solicitado por:* ${sourceLabel}
\u{1F3E2} *Tipo:* ${brief.businessType || "general"}`;

  if (perfData?.kpis) {
    telegramSummary += `
\u{1F4B0} *Revenue:* $${perfData.kpis.revenue}
\u{1F4B8} *Ad Spend:* $${perfData.kpis.adSpend}
\u{1F3AF} *ROAS:* ${perfData.kpis.roas}
\u{1F4B5} *CAC:* $${perfData.kpis.cac}
\u{1F4C8} *LTV:* $${perfData.kpis.ltv}
\u{1F6D2} *Conversion:* ${perfData.kpis.conversionRate}%`;
  }

  if (perfData?.summary) {
    telegramSummary += `
\u{1F3E5} *Health:* ${perfData.summary.healthScore}
\u{1F4A1} *Insight:* ${perfData.summary.keyInsight}`;
  }

  if (perfData?.marketPosition) {
    telegramSummary += `
\u{1F4AA} *Fortalezas:* ${perfData.marketPosition.strengths?.length || 0}
\u{26A0}\u{FE0F} *Debilidades:* ${perfData.marketPosition.weaknesses?.length || 0}
\u{1F31F} *Oportunidades:* ${perfData.marketPosition.opportunities?.length || 0}
\u{1F6A8} *Amenazas:* ${perfData.marketPosition.threats?.length || 0}`;
  }

  if (perfData?.executiveSummary) {
    telegramSummary += `\n\u{1F4DD} *Resumen:* ${perfData.executiveSummary.slice(0, 200)}...`;
  }

  telegramSummary += `\n\n_vault/clients/${brief.client}/performance-log.md_`;

  await sendTelegram(telegramSummary);

  // Step 8: Return result (for Consultant Agent)
  return {
    mode: brief.mode,
    client: brief.client,
    source: brief.source,
    output,
    perfData,
    registeredAt: `vault/clients/${brief.client}/performance-log.md`,
  };
}

// --- CLI entry point ---

async function main() {
  const brief = loadBriefFromArgs();
  const result = await runReportingAgent(brief);

  console.log("\n" + "=".repeat(60));
  console.log(`REPORTING PERFORMANCE — ${result.mode.toUpperCase()} — ${result.client}`);
  console.log("=".repeat(60) + "\n");
  console.log(result.output);
  console.log("\n" + "=".repeat(60));
}

main().catch(async (err) => {
  console.error("Reporting Performance Agent failed:", err.message);
  try {
    await sendTelegram(`*\u{274C} Reporting Performance Agent — Error*\n\n\`${err.message}\``);
  } catch {
    /* silent */
  }
  process.exit(1);
});
