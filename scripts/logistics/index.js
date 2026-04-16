import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { parseBrief, DEFAULT_BRIEF } from "./brief-schema.js";
import { logAgentRun, logAgentError } from "../lib/supabase.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VAULT = resolve(__dirname, "../../vault");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || "giancostantini/Growth";

// --- CLI parsing ---
// Usage:
//   node index.js --brief path/to/brief.json      (full brief)
//   node index.js dmancuello schedule              (shorthand: client + mode)
//   node index.js                                  (defaults: schedule)

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

/**
 * Trigger Stock Agent via GitHub repository_dispatch.
 * Used after dispatching orders to reconcile inventory.
 */
async function triggerStockAgent(stockBrief) {
  if (!GITHUB_TOKEN) {
    console.warn("No GITHUB_TOKEN — cannot trigger Stock Agent.");
    return false;
  }
  const [owner, repo] = GITHUB_REPO.split("/");
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        event_type: "stock",
        client_payload: { brief: stockBrief },
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    console.warn(`Could not trigger Stock Agent: ${res.status} ${err}`);
    return false;
  }
  console.log("Stock Agent triggered via repository_dispatch");
  return true;
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
    logisticsLog: readVaultFile(`clients/${client}/logistics-log.md`),
    stockLog: readVaultFile(`clients/${client}/stock-log.md`),
    salesLog: readVaultFile(`clients/${client}/sales-log.md`),
    learningLog: readVaultFile(`clients/${client}/learning-log.md`),
  };

  const loaded = Object.entries(context).filter(([, v]) => v !== null).length;
  const total = Object.keys(context).length;
  console.log(`Vault context loaded: ${loaded}/${total} files found`);

  return context;
}

// --- Prompt Builders ---

function buildSchedulePrompt(ctx, brief) {
  return `Eres el Logistics Agent de D&C Scale Partners.

Tu trabajo es planificar los proximos envios del cliente, asignando fechas, transportistas y prioridades segun stock disponible y demanda.

CLIENTE: ${brief.client}
MODO: SCHEDULE — Planificacion de envios
FECHA: ${getTodayFormatted()}
LOOKBACK: ultimos ${brief.lookbackDays} dias
${brief.shippingCompany ? `TRANSPORTISTA PREFERIDO: ${brief.shippingCompany}` : ""}
${brief.dateRange ? `RANGO DE FECHAS: ${brief.dateRange.start} a ${brief.dateRange.end}` : ""}

--- ORDENES PENDIENTES ---
${brief.orders ? JSON.stringify(brief.orders, null, 2) : "No se proporcionaron ordenes especificas. Analizar el historial y stock para identificar envios pendientes."}

--- CONTEXTO DE LA AGENCIA ---
${ctx.agencyContext || "Sin contexto de agencia."}

--- MARCA DEL CLIENTE ---
${ctx.clientBrand || "Sin contexto de marca."}

--- ESTRATEGIA ACTIVA ---
${ctx.strategy || "Sin estrategia definida."}

--- HISTORIAL DE LOGISTICA ---
${ctx.logisticsLog || "Sin historial de logistica. Esta es la primera planificacion."}

--- LOG DE STOCK ---
${ctx.stockLog || "Sin log de stock."}

--- LOG DE VENTAS ---
${ctx.salesLog || "Sin log de ventas."}

--- LEARNING LOG ---
${ctx.learningLog || "Sin learning log."}

${brief.instructions ? `--- INSTRUCCIONES ADICIONALES ---\n${brief.instructions}` : ""}

---

IMPORTANTE: Analiza las ordenes pendientes, el stock disponible y el historial de envios para generar un plan de envios optimizado.

1. REVISAR ordenes pendientes y prioridades (urgent > normal > low)
2. VERIFICAR disponibilidad de stock para cada producto
3. ASIGNAR transportistas segun destino, costo y tiempos de entrega
4. PROGRAMAR fechas de envio considerando plazos de preparacion
5. IDENTIFICAR ordenes bloqueadas por falta de stock

---

GENERA EL SIGUIENTE PLAN (formato Markdown):

## Plan de Envios — ${getTodayISO()}

### Resumen ejecutivo
- Total ordenes a planificar
- Ordenes listas para envio
- Ordenes bloqueadas (falta de stock u otro motivo)
- Proximo envio programado
- Transportistas asignados

### Ordenes programadas

Para cada orden:
#### Orden [orderId]
| Campo | Valor |
|-------|-------|
| Productos | SKU x cantidad |
| Destino | destino |
| Prioridad | urgent/normal/low |
| Fecha envio programada | YYYY-MM-DD |
| Fecha entrega estimada | YYYY-MM-DD |
| Transportista | nombre |
| Stock disponible | Si/No |
| Notas | observaciones |

### Ordenes bloqueadas
Para cada orden bloqueada: razon, stock faltante, fecha estimada de disponibilidad.

### Asignacion de transportistas
| Transportista | Ordenes asignadas | Costo estimado | Tiempo estimado |
|---------------|-------------------|----------------|-----------------|

### Notas para el Consultant Agent
Decisiones que requieren aprobacion o alertas de stock critico.

---LOGISTICS_DATA_JSON---

Despues del separador, genera un JSON con esta estructura:
\`\`\`json
{
  "date": "${getTodayISO()}",
  "client": "${brief.client}",
  "mode": "schedule",
  "scheduledOrders": [
    {
      "orderId": "string",
      "products": [{ "sku": "string", "quantity": 0 }],
      "destination": "string",
      "scheduledShipDate": "YYYY-MM-DD",
      "estimatedDeliveryDate": "YYYY-MM-DD",
      "shippingCompany": "string",
      "priority": "urgent|normal|low",
      "stockAvailable": true,
      "notes": "string"
    }
  ],
  "summary": {
    "totalOrders": 0,
    "ordersReady": 0,
    "ordersBlocked": 0,
    "blockedReasons": ["string"],
    "nextShipmentDate": "YYYY-MM-DD"
  }
}
\`\`\``;
}

function buildDispatchPrompt(ctx, brief) {
  return `Eres el Logistics Agent de D&C Scale Partners.

Tu trabajo es ejecutar los envios confirmados: generar notificaciones para transportistas, actualizar el estado de las ordenes y registrar el impacto en stock.

CLIENTE: ${brief.client}
MODO: DISPATCH — Ejecucion de envios
FECHA: ${getTodayFormatted()}
${brief.shippingCompany ? `TRANSPORTISTA: ${brief.shippingCompany}` : ""}

--- ORDENES A DESPACHAR ---
${brief.orders ? JSON.stringify(brief.orders, null, 2) : "Revisar instrucciones adicionales."}

--- CONTEXTO DE LA AGENCIA ---
${ctx.agencyContext || "Sin contexto de agencia."}

--- MARCA DEL CLIENTE ---
${ctx.clientBrand || "Sin contexto de marca."}

--- ESTRATEGIA ACTIVA ---
${ctx.strategy || "Sin estrategia definida."}

--- HISTORIAL DE LOGISTICA ---
${ctx.logisticsLog || "Sin historial de logistica."}

--- LOG DE STOCK ---
${ctx.stockLog || "Sin log de stock."}

--- LOG DE VENTAS ---
${ctx.salesLog || "Sin log de ventas."}

--- LEARNING LOG ---
${ctx.learningLog || "Sin learning log."}

${brief.instructions ? `--- INSTRUCCIONES ADICIONALES ---\n${brief.instructions}` : ""}

---

EJECUTA EL DESPACHO DE LAS ORDENES:

1. CONFIRMAR que cada orden tiene stock disponible
2. ASIGNAR transportista y generar mensaje de notificacion para el carrier
3. REGISTRAR fecha de envio y tracking (PENDING hasta confirmacion real)
4. CALCULAR impacto en stock (cantidad enviada por SKU)
5. MARCAR si se debe disparar el Stock Agent para reconciliar inventario

---

GENERA EL SIGUIENTE REPORTE (formato Markdown):

## Despacho de Ordenes — ${getTodayISO()}

### Resumen
- Total ordenes despachadas
- Transportistas utilizados
- SKUs enviados y cantidades totales
- Stock Agent: se dispara / no se dispara

### Detalle de despachos

Para cada orden:
#### Orden [orderId]
| Campo | Valor |
|-------|-------|
| Transportista | nombre |
| Tracking | PENDING |
| Fecha envio | YYYY-MM-DD |
| Productos | SKU x cantidad |
| Destino | destino |
| Notificacion carrier | Enviada / Pendiente |

**Mensaje para transportista:**
> Texto del mensaje de notificacion al carrier.

### Impacto en stock
| SKU | Cantidad enviada | Stock restante estimado |
|-----|-----------------|------------------------|

### Notas para el Consultant Agent
Confirmacion de despachos y alertas de stock bajo.

---LOGISTICS_DATA_JSON---

\`\`\`json
{
  "date": "${getTodayISO()}",
  "client": "${brief.client}",
  "mode": "dispatch",
  "dispatches": [
    {
      "orderId": "string",
      "shippingCompany": "string",
      "trackingNumber": "PENDING",
      "shipDate": "${getTodayISO()}",
      "products": [{ "sku": "string", "quantity": 0 }],
      "destination": "string",
      "notificationSent": false,
      "carrierNotificationMessage": "string"
    }
  ],
  "stockImpact": [
    { "sku": "string", "quantityShipped": 0, "remainingStock": 0 }
  ],
  "triggerStockCheck": true
}
\`\`\``;
}

function buildOptimizePrompt(ctx, brief) {
  return `Eres el Logistics Agent de D&C Scale Partners.

Tu trabajo es analizar el rendimiento logistico del cliente y recomendar mejoras en tiempos de entrega, costos, transportistas y procesos.

CLIENTE: ${brief.client}
MODO: OPTIMIZE — Optimizacion logistica
FECHA: ${getTodayFormatted()}
LOOKBACK: ultimos ${brief.lookbackDays} dias
${brief.dateRange ? `RANGO DE FECHAS: ${brief.dateRange.start} a ${brief.dateRange.end}` : ""}

--- CONTEXTO DE LA AGENCIA ---
${ctx.agencyContext || "Sin contexto de agencia."}

--- MARCA DEL CLIENTE ---
${ctx.clientBrand || "Sin contexto de marca."}

--- ESTRATEGIA ACTIVA ---
${ctx.strategy || "Sin estrategia definida."}

--- HISTORIAL DE LOGISTICA ---
${ctx.logisticsLog || "Sin historial de logistica. No hay datos para optimizar."}

--- LOG DE STOCK ---
${ctx.stockLog || "Sin log de stock."}

--- LOG DE VENTAS ---
${ctx.salesLog || "Sin log de ventas."}

--- LEARNING LOG ---
${ctx.learningLog || "Sin learning log."}

${brief.instructions ? `--- INSTRUCCIONES ADICIONALES ---\n${brief.instructions}` : ""}

---

ANALIZA EL RENDIMIENTO LOGISTICO Y GENERA RECOMENDACIONES:

1. CALCULAR KPIs de logistica: tiempo promedio de entrega, tasa de entrega a tiempo, costo promedio por envio
2. COMPARAR transportistas: rendimiento, costo, confiabilidad
3. IDENTIFICAR cuellos de botella en el proceso de envio
4. DETECTAR patrones de devolucion y sus causas
5. RECOMENDAR mejoras concretas con impacto estimado

---

GENERA EL SIGUIENTE ANALISIS (formato Markdown):

## Optimizacion Logistica — ${getTodayISO()}

### KPIs actuales
| KPI | Valor actual | Benchmark | Evaluacion |
|-----|-------------|-----------|------------|
| Tiempo promedio de entrega | X dias | X dias | OK/ALTO |
| Tasa de entrega a tiempo | X% | 95% | OK/BAJO |
| Costo promedio por envio | $X | $X | OK/ALTO |
| Tasa de devoluciones | X% | <5% | OK/ALTO |
| Transportista principal | nombre | - | - |

### Cuellos de botella detectados
Para cada cuello de botella:
1. Descripcion del problema
2. Impacto cuantificado
3. Causa raiz probable
4. Solucion propuesta

### Comparacion de transportistas
| Transportista | Envios | Tiempo promedio | Tasa a tiempo | Costo promedio | Evaluacion |
|---------------|--------|-----------------|---------------|----------------|------------|

### Recomendaciones
Para cada recomendacion:
1. Accion concreta
2. Impacto esperado (ahorro, mejora de tiempo, etc.)
3. Dificultad de implementacion (baja/media/alta)
4. Prioridad (1-5)

### Notas para el Consultant Agent
Decisiones estrategicas que requieren aprobacion.

---LOGISTICS_DATA_JSON---

\`\`\`json
{
  "date": "${getTodayISO()}",
  "client": "${brief.client}",
  "mode": "optimize",
  "analysis": {
    "avgDeliveryTimeDays": 0,
    "onTimeDeliveryRate": 0,
    "avgShippingCost": 0,
    "returnsRate": 0,
    "topCarrier": "string",
    "bottlenecks": ["string"]
  },
  "recommendations": [
    {
      "action": "string",
      "expectedImpact": "string",
      "difficulty": "low|medium|high",
      "priority": 1
    }
  ]
}
\`\`\``;
}

function buildReportPrompt(ctx, brief) {
  return `Eres el Logistics Agent de D&C Scale Partners.

Tu trabajo es generar un reporte completo del rendimiento logistico del cliente con KPIs, comparacion de transportistas y aprendizajes.

CLIENTE: ${brief.client}
MODO: REPORT — Reporte de performance logistica
FECHA: ${getTodayFormatted()}
PERIODO: ultimos ${brief.lookbackDays} dias
${brief.dateRange ? `RANGO DE FECHAS: ${brief.dateRange.start} a ${brief.dateRange.end}` : ""}

--- CONTEXTO DE LA AGENCIA ---
${ctx.agencyContext || "Sin contexto de agencia."}

--- MARCA DEL CLIENTE ---
${ctx.clientBrand || "Sin contexto de marca."}

--- ESTRATEGIA ACTIVA ---
${ctx.strategy || "Sin estrategia definida."}

--- HISTORIAL DE LOGISTICA ---
${ctx.logisticsLog || "Sin historial de logistica. Este es el primer reporte."}

--- LOG DE STOCK ---
${ctx.stockLog || "Sin log de stock."}

--- LOG DE VENTAS ---
${ctx.salesLog || "Sin log de ventas."}

--- LEARNING LOG ---
${ctx.learningLog || "Sin learning log."}

${brief.instructions ? `--- INSTRUCCIONES ADICIONALES ---\n${brief.instructions}` : ""}

---

GENERA EL REPORTE DE PERFORMANCE LOGISTICA:

1. CONSOLIDAR todos los envios del periodo
2. CALCULAR KPIs principales: total envios, tasa a tiempo, costo total y por orden
3. EVALUAR rendimiento por transportista
4. IDENTIFICAR tendencias y patrones
5. EXTRAER aprendizajes para el learning log

---

GENERA EL SIGUIENTE REPORTE (formato Markdown):

## Reporte de Logistica — ${getTodayISO()}

### KPIs del periodo
| KPI | Valor | Periodo anterior | Variacion |
|-----|-------|------------------|-----------|
| Total envios | X | X | +X% |
| Tasa entrega a tiempo | X% | X% | +X pp |
| Tiempo promedio entrega | X dias | X dias | -X dias |
| Costo total de envio | $X | $X | +X% |
| Costo promedio por orden | $X | $X | -X% |
| Tasa de devoluciones | X% | X% | -X pp |

### Performance por transportista
| Transportista | Envios | Tasa a tiempo | Tiempo prom. | Costo prom. | Devoluciones | Evaluacion |
|---------------|--------|---------------|-------------|-------------|-------------|------------|

### Top destinos
| Destino | Envios | Tiempo prom. | Costo prom. |
|---------|--------|-------------|-------------|

### Incidencias del periodo
Para cada incidencia: descripcion, orden afectada, resolucion, aprendizaje.

### Tendencias
- Volumen de envios (creciendo/estable/bajando)
- Costos (mejorando/estables/empeorando)
- Tiempos de entrega (mejorando/estables/empeorando)
- Devoluciones (causas principales)

### Recomendaciones
1. Acciones para mejorar KPIs
2. Cambios de transportista sugeridos
3. Optimizaciones de proceso
4. Preparacion para picos de demanda

### Aprendizajes clave
Insights para el learning log del cliente.

### Notas para el Consultant Agent
Resumen ejecutivo y decisiones pendientes.

---LOGISTICS_DATA_JSON---

\`\`\`json
{
  "date": "${getTodayISO()}",
  "client": "${brief.client}",
  "mode": "report",
  "period": {
    "start": "YYYY-MM-DD",
    "end": "${getTodayISO()}",
    "days": ${brief.lookbackDays}
  },
  "kpis": {
    "totalShipments": 0,
    "onTimeRate": 0,
    "avgDeliveryDays": 0,
    "totalShippingCost": 0,
    "costPerOrder": 0,
    "returnsRate": 0
  },
  "carrierPerformance": [
    {
      "carrier": "string",
      "shipments": 0,
      "onTimeRate": 0,
      "avgDeliveryDays": 0,
      "avgCost": 0,
      "returnsRate": 0,
      "evaluation": "excellent|good|average|poor"
    }
  ],
  "recommendations": ["string"],
  "learnings": ["string"]
}
\`\`\``;
}

// --- Parse structured data from output ---

function parseLogisticsData(output) {
  const separator = "---LOGISTICS_DATA_JSON---";
  const idx = output.indexOf(separator);
  if (idx === -1) return null;

  const jsonPart = output.slice(idx + separator.length);
  const jsonMatch = jsonPart.match(/```json\s*([\s\S]*?)\s*```/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[1]);
  } catch {
    console.warn("Warning: could not parse Logistics data JSON");
    return null;
  }
}

// --- Update vault files ---

function updateVaultWithLogisticsData(ctx, client, logisticsData, fullOutput, mode) {
  if (!logisticsData) return;

  // Append to logistics-log.md
  const modeLabels = {
    schedule: "Planificacion de Envios",
    dispatch: "Despacho de Ordenes",
    optimize: "Optimizacion Logistica",
    report: "Reporte Logistico",
  };

  let logEntry = `\n## ${modeLabels[mode]} — ${logisticsData.date}\n\n` +
    `Mode: ${mode}\n`;

  if (logisticsData.summary) {
    logEntry += `Total ordenes: ${logisticsData.summary.totalOrders} | Listas: ${logisticsData.summary.ordersReady} | Bloqueadas: ${logisticsData.summary.ordersBlocked} | Proximo envio: ${logisticsData.summary.nextShipmentDate}\n`;
  }

  if (logisticsData.dispatches) {
    logEntry += `Despachos: ${logisticsData.dispatches.length} ordenes | Stock check: ${logisticsData.triggerStockCheck ? "Si" : "No"}\n`;
  }

  if (logisticsData.kpis) {
    logEntry += `Envios: ${logisticsData.kpis.totalShipments} | A tiempo: ${logisticsData.kpis.onTimeRate}% | Costo total: $${logisticsData.kpis.totalShippingCost} | Costo/orden: $${logisticsData.kpis.costPerOrder}\n`;
  }

  if (logisticsData.analysis) {
    logEntry += `Entrega prom: ${logisticsData.analysis.avgDeliveryTimeDays} dias | A tiempo: ${logisticsData.analysis.onTimeDeliveryRate}% | Costo prom: $${logisticsData.analysis.avgShippingCost} | Carrier top: ${logisticsData.analysis.topCarrier}\n`;
  }

  appendToVaultFile(`clients/${client}/logistics-log.md`, logEntry);
  console.log("Updated logistics-log.md");

  // Update learning-log with logistics insights
  const learnings = [];

  if (logisticsData.summary?.blockedReasons?.length > 0) {
    learnings.push(`- [${logisticsData.date}] Logistica Schedule: Ordenes bloqueadas por: ${logisticsData.summary.blockedReasons.join(", ")}`);
  }

  if (logisticsData.analysis?.bottlenecks?.length > 0) {
    for (const bottleneck of logisticsData.analysis.bottlenecks.slice(0, 3)) {
      learnings.push(`- [${logisticsData.date}] Logistica Optimize: Cuello de botella: ${bottleneck}`);
    }
  }

  if (logisticsData.recommendations) {
    const recs = Array.isArray(logisticsData.recommendations)
      ? logisticsData.recommendations
      : [];
    for (const rec of recs.slice(0, 3)) {
      const recText = typeof rec === "string" ? rec : rec.action || JSON.stringify(rec);
      learnings.push(`- [${logisticsData.date}] Logistica ${mode}: ${recText}`);
    }
  }

  if (logisticsData.learnings) {
    for (const learning of logisticsData.learnings.slice(0, 3)) {
      learnings.push(`- [${logisticsData.date}] Logistica Report: ${learning}`);
    }
  }

  if (learnings.length > 0) {
    appendToVaultFile(
      `clients/${client}/learning-log.md`,
      `\n### Aprendizajes Logistica — ${logisticsData.date}\n${learnings.join("\n")}\n`
    );
    console.log("Updated learning-log.md with logistics learnings");
  }
}

// --- Main: exported for future use by Consultant Agent ---

export async function runLogisticsAgent(briefInput) {
  // Step 1: Parse and validate brief
  const brief = parseBrief(briefInput);
  const startTime = Date.now();
  console.log(
    `Logistics Agent — ${brief.mode} for ${brief.client} (source: ${brief.source})`
  );

  // Step 2: Load vault context
  const ctx = loadClientContext(brief.client);

  // Step 3: Build prompt based on mode
  const promptBuilders = {
    schedule: buildSchedulePrompt,
    dispatch: buildDispatchPrompt,
    optimize: buildOptimizePrompt,
    report: buildReportPrompt,
  };

  const prompt = promptBuilders[brief.mode](ctx, brief);

  // Step 4: Generate analysis via Claude
  console.log(`Generating ${brief.mode} analysis...`);
  const maxTokens = {
    schedule: 6000,
    dispatch: 6000,
    optimize: 8000,
    report: 10000,
  }[brief.mode] || 8000;
  const output = await callClaude(prompt, maxTokens);
  console.log(`${brief.mode} analysis generated successfully.`);

  // Step 5: Parse structured data
  const logisticsData = parseLogisticsData(output);

  // Step 6: Update vault files
  updateVaultWithLogisticsData(ctx, brief.client, logisticsData, output, brief.mode);

  // Step 6b: Trigger Stock Agent if dispatch mode and stock check requested
  let stockAgentResult = null;
  if (brief.mode === "dispatch") {
    const shouldTrigger =
      brief.triggerStockCheck ||
      (logisticsData && logisticsData.triggerStockCheck);

    if (shouldTrigger) {
      console.log("Dispatch complete — triggering Stock Agent for inventory reconciliation...");
      const triggered = await triggerStockAgent({
        client: brief.client,
        mode: "alert",
        source: "logistics-agent",
      });
      stockAgentResult = { triggered };
    }
  }

  // Step 7: Write agent report
  writeVaultFile(
    `clients/${brief.client}/agent-reports/logistics-${brief.mode}-${getTodayISO()}.json`,
    JSON.stringify(
      {
        agent: "logistics",
        mode: brief.mode,
        client: brief.client,
        date: getTodayISO(),
        logisticsData,
        stockAgentResult,
        timestamp: new Date().toISOString(),
      },
      null,
      2
    )
  );
  console.log("Wrote agent report.");

  // Step 8: Notify via Telegram
  const sourceLabel = {
    cli: "CLI manual",
    "consultant-agent": "Agente Consultor",
    dashboard: "Dashboard",
    "github-actions": "GitHub Actions",
  }[brief.source] || brief.source;

  const modeEmoji = {
    schedule: "\u{1F4C5}",
    dispatch: "\u{1F69A}",
    optimize: "\u26A1",
    report: "\u{1F4CA}",
  };

  const modeLabel = {
    schedule: "Planificacion de Envios",
    dispatch: "Despacho de Ordenes",
    optimize: "Optimizacion Logistica",
    report: "Reporte Logistico",
  };

  let telegramSummary = `*${modeEmoji[brief.mode]} Logistics Agent — ${modeLabel[brief.mode]}*
_${getTodayFormatted()}_

\u{1F464} *Cliente:* ${brief.client}
\u{1F4E1} *Solicitado por:* ${sourceLabel}`;

  if (logisticsData?.summary) {
    telegramSummary += `
\u{1F4CB} *Total ordenes:* ${logisticsData.summary.totalOrders}
\u2705 *Listas:* ${logisticsData.summary.ordersReady}
\u{1F6AB} *Bloqueadas:* ${logisticsData.summary.ordersBlocked}
\u{1F4C6} *Proximo envio:* ${logisticsData.summary.nextShipmentDate}`;
  }

  if (logisticsData?.dispatches) {
    telegramSummary += `
\u{1F4E6} *Despachos:* ${logisticsData.dispatches.length} ordenes
\u{1F4E6} *SKUs impactados:* ${logisticsData.stockImpact?.length || 0}`;
  }

  if (logisticsData?.kpis) {
    telegramSummary += `
\u{1F69A} *Envios:* ${logisticsData.kpis.totalShipments}
\u{1F3AF} *A tiempo:* ${logisticsData.kpis.onTimeRate}%
\u{1F4B0} *Costo total:* $${logisticsData.kpis.totalShippingCost}
\u{1F4B5} *Costo/orden:* $${logisticsData.kpis.costPerOrder}`;
  }

  if (logisticsData?.analysis) {
    telegramSummary += `
\u23F1 *Entrega prom:* ${logisticsData.analysis.avgDeliveryTimeDays} dias
\u{1F3AF} *A tiempo:* ${logisticsData.analysis.onTimeDeliveryRate}%
\u{1F4B0} *Costo prom:* $${logisticsData.analysis.avgShippingCost}
\u{1F3C6} *Top carrier:* ${logisticsData.analysis.topCarrier}`;
  }

  if (stockAgentResult) {
    telegramSummary += `
\u{1F4E6} *Stock Agent:* ${stockAgentResult.triggered ? "Activado para reconciliar inventario" : "No se pudo activar"}`;
  }

  telegramSummary += `\n\n_vault/clients/${brief.client}/logistics-log.md_`;

  await sendTelegram(telegramSummary);

  // Step 9: Return result (for Consultant Agent)
  await logAgentRun(brief.client, "logistics", "success", `Logistics ejecutado: modo ${brief.mode}.`, { mode: brief.mode, source: brief.source }, { duration_ms: Date.now() - startTime });
  return {
    mode: brief.mode,
    client: brief.client,
    source: brief.source,
    output,
    logisticsData,
    stockAgentResult,
    registeredAt: `vault/clients/${brief.client}/logistics-log.md`,
  };
}

// --- CLI entry point ---

async function main() {
  const brief = loadBriefFromArgs();
  const result = await runLogisticsAgent(brief);

  console.log("\n" + "=".repeat(60));
  console.log(`LOGISTICS — ${result.mode.toUpperCase()} — ${result.client}`);
  console.log("=".repeat(60) + "\n");
  console.log(result.output);

  if (result.stockAgentResult) {
    console.log("\n" + "-".repeat(40));
    console.log("STOCK AGENT INTEGRATION:");
    console.log(
      result.stockAgentResult.triggered
        ? "Stock Agent triggered via repository_dispatch"
        : "Stock Agent could not be triggered (check GITHUB_TOKEN)"
    );
    console.log("-".repeat(40));
  }

  console.log("\n" + "=".repeat(60));
}

main().catch(async (err) => {
  console.error("Logistics Agent failed:", err.message);
  await logAgentError("unknown", "logistics", err, {});
  try {
    await sendTelegram(`*\u274C Logistics Agent — Error*\n\n\`${err.message}\``);
  } catch {
    // Silent fail
  }
  process.exit(1);
});
