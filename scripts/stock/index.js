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

// --- CLI parsing ---
// Usage:
//   node index.js --brief path/to/brief.json      (full brief)
//   node index.js dmancuello status                (shorthand: client + mode)
//   node index.js                                  (defaults: status)

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

function buildStatusPrompt(ctx, brief) {
  return `Eres el Stock Agent de D&C Scale Partners.

Tu trabajo es analizar el estado actual del inventario del cliente y generar un snapshot completo de stock.

CLIENTE: ${brief.client}
MODO: STATUS — Snapshot actual de inventario
FECHA: ${getTodayFormatted()}
VENTANA DE VENTAS: ultimos ${brief.lookbackDays} dias
${brief.products ? `PRODUCTOS FILTRADOS: ${brief.products.join(", ")}` : "PRODUCTOS: todos"}
LEAD TIME PROVEEDOR: ${brief.supplierLeadTimeDays ? `${brief.supplierLeadTimeDays} dias (override)` : "Usar dato de stock-log o estimar"}
SAFETY STOCK: ${brief.safetyStockDays} dias de buffer

--- CONTEXTO DE LA AGENCIA ---
${ctx.agencyContext || "Sin contexto de agencia."}

--- MARCA DEL CLIENTE ---
${ctx.clientBrand || "Sin contexto de marca."}

--- ESTRATEGIA ACTIVA ---
${ctx.strategy || "Sin estrategia definida."}

--- STOCK LOG (historial de inventario) ---
${ctx.stockLog || "Sin historial de stock. Este es el primer analisis de inventario."}

--- SALES LOG (historial de ventas) ---
${ctx.salesLog || "Sin historial de ventas. Estimar tasas de venta basandose en el contexto del cliente."}

--- LEARNING LOG ---
${ctx.learningLog || "Sin learning log."}

${brief.instructions ? `--- INSTRUCCIONES ADICIONALES ---\n${brief.instructions}` : ""}

---

IMPORTANTE: Como este agente corre automatizado, tu rol es:

1. ANALIZAR el stock-log.md y sales-log.md para determinar niveles actuales de inventario
2. CALCULAR la tasa de ventas diaria por producto usando los ultimos ${brief.lookbackDays} dias
3. ESTIMAR dias restantes de stock por producto (stock actual / tasa diaria)
4. CLASIFICAR cada producto: healthy (>15 dias), low (7-15 dias), critical (1-7 dias), out-of-stock (0)
5. GENERAR un resumen ejecutivo con el estado general del inventario

Si no hay datos historicos, genera una estructura de ejemplo basada en el tipo de negocio del cliente e indica que los datos deben ser cargados.

---

GENERA EL SIGUIENTE REPORTE (formato Markdown):

## Estado de Inventario — ${getTodayISO()}

### Resumen ejecutivo
- Total de productos monitoreados
- Productos saludables / bajos / criticos / agotados
- Valor total estimado del inventario
- Hallazgo principal

### Tabla de inventario

| SKU | Producto | Stock actual | Ventas/dia | Dias restantes | Estado | Lead time |
|-----|----------|-------------|------------|----------------|--------|-----------|
| ... | ...      | ...         | ...        | ...            | ...    | ...       |

Para cada producto:
- **SKU**: codigo unico del producto
- **Producto**: nombre descriptivo
- **Stock actual**: unidades disponibles
- **Ventas/dia**: tasa de venta diaria promedio (ultimos ${brief.lookbackDays} dias)
- **Dias restantes**: stock actual / ventas por dia
- **Estado**: healthy / low / critical / out-of-stock
- **Lead time**: dias que tarda el proveedor en entregar

### Productos que requieren atencion
Lista de productos en estado critical o low con accion recomendada.

### Notas para el Consultant Agent
Decisiones estrategicas o alertas que requieren atencion del dueno.

---STOCK_DATA_JSON---

Despues del separador, genera un JSON con esta estructura:
\`\`\`json
{
  "date": "${getTodayISO()}",
  "client": "${brief.client}",
  "mode": "status",
  "products": [
    {
      "sku": "SKU-001",
      "name": "Nombre del producto",
      "currentStock": 0,
      "dailySalesRate": 0.0,
      "daysOfStockRemaining": 0,
      "status": "healthy|low|critical|out-of-stock",
      "supplierLeadTimeDays": 0
    }
  ],
  "summary": {
    "totalProducts": 0,
    "healthy": 0,
    "low": 0,
    "critical": 0,
    "outOfStock": 0,
    "totalInventoryValue": 0,
    "keyInsight": "hallazgo principal del analisis"
  }
}
\`\`\``;
}

function buildForecastPrompt(ctx, brief) {
  return `Eres el Stock Agent de D&C Scale Partners.

Tu trabajo es predecir fechas de agotamiento de stock y generar un calendario de reposicion con cantidades recomendadas.

CLIENTE: ${brief.client}
MODO: FORECAST — Proyeccion de agotamiento y plan de reposicion
FECHA: ${getTodayFormatted()}
VENTANA DE VENTAS: ultimos ${brief.lookbackDays} dias
${brief.products ? `PRODUCTOS FILTRADOS: ${brief.products.join(", ")}` : "PRODUCTOS: todos"}
LEAD TIME PROVEEDOR: ${brief.supplierLeadTimeDays ? `${brief.supplierLeadTimeDays} dias (override)` : "Usar dato de stock-log o estimar"}
SAFETY STOCK: ${brief.safetyStockDays} dias de buffer

--- CONTEXTO DE LA AGENCIA ---
${ctx.agencyContext || "Sin contexto de agencia."}

--- MARCA DEL CLIENTE ---
${ctx.clientBrand || "Sin contexto de marca."}

--- ESTRATEGIA ACTIVA ---
${ctx.strategy || "Sin estrategia definida."}

--- STOCK LOG (historial de inventario) ---
${ctx.stockLog || "Sin historial de stock. Este es el primer analisis."}

--- SALES LOG (historial de ventas) ---
${ctx.salesLog || "Sin historial de ventas. Estimar tasas de venta basandose en el contexto."}

--- LEARNING LOG ---
${ctx.learningLog || "Sin learning log."}

${brief.instructions ? `--- INSTRUCCIONES ADICIONALES ---\n${brief.instructions}` : ""}

---

IMPORTANTE: Tu rol es:

1. CALCULAR la velocidad de ventas por producto usando los ultimos ${brief.lookbackDays} dias
2. PROYECTAR la fecha de agotamiento de cada producto (stock actual / tasa diaria)
3. CALCULAR la fecha de reorden: fecha de agotamiento - lead time del proveedor - ${brief.safetyStockDays} dias de safety stock
4. DETERMINAR la cantidad a reordenar: suficiente para cubrir el lead time + safety stock + margen de ${brief.lookbackDays} dias de ventas proyectadas
5. CLASIFICAR la urgencia: immediate (reordenar ya), soon (esta semana), planned (proximas 2 semanas), no-action (stock suficiente)
6. CONSIDERAR tendencias: si las ventas estan acelerando o desacelerando, ajustar la proyeccion

La formula base de reorder point es:
Reorder Point = (Ventas diarias x Lead time) + (Ventas diarias x Safety stock days)

Si no hay datos historicos, genera una estructura de ejemplo e indica que los datos reales deben ser cargados.

---

GENERA EL SIGUIENTE REPORTE (formato Markdown):

## Forecast de Stock — ${getTodayISO()}

### Resumen de proyeccion
- Productos que necesitan reposicion inmediata
- Productos que necesitan reposicion esta semana
- Productos con stock saludable
- Proximo vencimiento critico (producto + fecha)

### Calendario de reposicion

| SKU | Producto | Stock actual | Ventas/dia | Agotamiento est. | Fecha reorden | Cantidad | Urgencia |
|-----|----------|-------------|------------|-------------------|---------------|----------|----------|
| ... | ...      | ...         | ...        | ...               | ...           | ...      | ...      |

### Detalle por producto

Para cada producto que requiere accion:
#### [SKU] — [Nombre]
- **Stock actual:** X unidades
- **Tasa de ventas:** X.X unidades/dia (tendencia: subiendo/estable/bajando)
- **Fecha estimada de agotamiento:** YYYY-MM-DD
- **Lead time del proveedor:** X dias
- **Safety stock requerido:** X unidades (${brief.safetyStockDays} dias)
- **Reorder point:** X unidades
- **Fecha recomendada de reorden:** YYYY-MM-DD
- **Cantidad a pedir:** X unidades (cobertura para X dias)
- **Urgencia:** immediate / soon / planned / no-action
- **Razonamiento:** explicacion de la recomendacion

### Alertas de tendencia
- Productos con aceleracion de ventas (riesgo de quedarse sin stock antes de lo proyectado)
- Productos con desaceleracion (posible sobrestock)
- Estacionalidad detectada

### Notas para el Consultant Agent
Decisiones de compra que requieren aprobacion del dueno.

---STOCK_DATA_JSON---

\`\`\`json
{
  "date": "${getTodayISO()}",
  "client": "${brief.client}",
  "mode": "forecast",
  "forecasts": [
    {
      "sku": "SKU-001",
      "name": "Nombre del producto",
      "currentStock": 0,
      "dailySalesRate": 0.0,
      "supplierLeadTimeDays": 0,
      "projectedStockoutDate": "YYYY-MM-DD",
      "reorderDate": "YYYY-MM-DD",
      "reorderQuantity": 0,
      "reorderUrgency": "immediate|soon|planned|no-action",
      "reasoning": "explicacion de la recomendacion"
    }
  ],
  "summary": {
    "totalProducts": 0,
    "immediate": 0,
    "soon": 0,
    "planned": 0,
    "noAction": 0,
    "nextCriticalProduct": "SKU-XXX",
    "nextCriticalDate": "YYYY-MM-DD",
    "keyInsight": "hallazgo principal de la proyeccion"
  }
}
\`\`\``;
}

function buildAlertPrompt(ctx, brief) {
  return `Eres el Stock Agent de D&C Scale Partners.

Tu trabajo es hacer un chequeo urgente de inventario y reportar SOLO los productos que estan por debajo del umbral de seguridad.

CLIENTE: ${brief.client}
MODO: ALERT — Chequeo urgente de stock bajo
FECHA: ${getTodayFormatted()}
VENTANA DE VENTAS: ultimos ${brief.lookbackDays} dias
${brief.products ? `PRODUCTOS FILTRADOS: ${brief.products.join(", ")}` : "PRODUCTOS: todos"}
LEAD TIME PROVEEDOR: ${brief.supplierLeadTimeDays ? `${brief.supplierLeadTimeDays} dias (override)` : "Usar dato de stock-log o estimar"}
SAFETY STOCK: ${brief.safetyStockDays} dias de buffer
UMBRAL DE ALERTA: ${brief.alertThreshold} (critical = agotamiento inminente en <3 dias, warning = stock bajo en <10 dias, all = ambos)

--- CONTEXTO DE LA AGENCIA ---
${ctx.agencyContext || "Sin contexto de agencia."}

--- MARCA DEL CLIENTE ---
${ctx.clientBrand || "Sin contexto de marca."}

--- ESTRATEGIA ACTIVA ---
${ctx.strategy || "Sin estrategia definida."}

--- STOCK LOG (historial de inventario) ---
${ctx.stockLog || "Sin historial de stock."}

--- SALES LOG (historial de ventas) ---
${ctx.salesLog || "Sin historial de ventas."}

--- LEARNING LOG ---
${ctx.learningLog || "Sin learning log."}

${brief.instructions ? `--- INSTRUCCIONES ADICIONALES ---\n${brief.instructions}` : ""}

---

IMPORTANTE: Este modo es para situaciones urgentes. Tu rol es:

1. IDENTIFICAR rapidamente todos los productos por debajo del umbral de seguridad
2. FILTRAR segun el nivel de alerta solicitado:
   - "critical": solo productos con < 3 dias de stock restante o agotados
   - "warning": productos con < 10 dias de stock restante
   - "all": todos los productos con algun nivel de alerta (critical + warning)
3. Para cada producto en alerta, RECOMENDAR una accion inmediata
4. CALCULAR la cantidad de reposicion urgente necesaria
5. PRIORIZAR los productos por severidad (criticos primero)

Si no hay productos en alerta, indicar que el inventario esta saludable.

---

GENERA EL SIGUIENTE REPORTE (formato Markdown):

## Alerta de Stock — ${getTodayISO()}

### Estado de alerta
- Nivel de filtro: ${brief.alertThreshold}
- Productos en alerta critica: X
- Productos en alerta warning: X
- Productos saludables (no listados): X

${brief.alertThreshold === "critical" ? "Solo se muestran productos en estado CRITICO (< 3 dias de stock)." : brief.alertThreshold === "warning" ? "Se muestran productos en estado WARNING (< 10 dias) y CRITICO." : "Se muestran todos los productos con algun nivel de alerta."}

### Alertas activas

Para cada producto en alerta (ordenados por severidad):

#### [CRITICAL/WARNING] [SKU] — [Nombre]
- **Stock actual:** X unidades
- **Ventas/dia:** X.X
- **Dias restantes:** X
- **Fecha estimada de agotamiento:** YYYY-MM-DD
- **Accion recomendada:** [descripcion especifica]
- **Cantidad a pedir urgente:** X unidades

### Resumen de acciones requeridas
1. Reposiciones urgentes (listar con cantidades)
2. Contactar proveedores (cuales y por que)
3. Acciones alternativas (productos sustitutos, preventa, etc.)

### Notas para el Consultant Agent
Alertas que requieren accion inmediata del dueno.

---STOCK_DATA_JSON---

\`\`\`json
{
  "date": "${getTodayISO()}",
  "client": "${brief.client}",
  "mode": "alert",
  "alertThreshold": "${brief.alertThreshold}",
  "alerts": [
    {
      "sku": "SKU-001",
      "name": "Nombre del producto",
      "severity": "critical|warning",
      "currentStock": 0,
      "daysRemaining": 0,
      "estimatedStockoutDate": "YYYY-MM-DD",
      "recommendedAction": "descripcion de la accion a tomar",
      "reorderQuantity": 0
    }
  ],
  "summary": {
    "totalAlerts": 0,
    "critical": 0,
    "warning": 0,
    "healthyProducts": 0,
    "mostUrgentProduct": "SKU-XXX",
    "keyInsight": "hallazgo principal de las alertas"
  }
}
\`\`\``;
}

function buildReportPrompt(ctx, brief) {
  return `Eres el Stock Agent de D&C Scale Partners.

Tu trabajo es generar un reporte semanal completo de salud del inventario con KPIs, tendencias y recomendaciones.

CLIENTE: ${brief.client}
MODO: REPORT — Reporte semanal de salud de inventario
FECHA: ${getTodayFormatted()}
VENTANA DE ANALISIS: ultimos ${brief.lookbackDays} dias
${brief.products ? `PRODUCTOS FILTRADOS: ${brief.products.join(", ")}` : "PRODUCTOS: todos"}
LEAD TIME PROVEEDOR: ${brief.supplierLeadTimeDays ? `${brief.supplierLeadTimeDays} dias (override)` : "Usar dato de stock-log o estimar"}
SAFETY STOCK: ${brief.safetyStockDays} dias de buffer

--- CONTEXTO DE LA AGENCIA ---
${ctx.agencyContext || "Sin contexto de agencia."}

--- MARCA DEL CLIENTE ---
${ctx.clientBrand || "Sin contexto de marca."}

--- ESTRATEGIA ACTIVA ---
${ctx.strategy || "Sin estrategia definida."}

--- STOCK LOG (historial de inventario) ---
${ctx.stockLog || "Sin historial de stock. Este es el primer reporte."}

--- SALES LOG (historial de ventas) ---
${ctx.salesLog || "Sin historial de ventas. Estimar basandose en el contexto del cliente."}

--- LEARNING LOG ---
${ctx.learningLog || "Sin learning log."}

${brief.instructions ? `--- INSTRUCCIONES ADICIONALES ---\n${brief.instructions}` : ""}

---

IMPORTANTE: Este es un reporte integral. Tu rol es:

1. CALCULAR KPIs clave del inventario:
   - Rotacion de inventario (Inventory Turnover): ventas del periodo / stock promedio
   - Dias promedio de stock: stock promedio / ventas diarias promedio
   - Eventos de agotamiento: cuantas veces un producto llego a 0 en el periodo
   - Total de unidades vendidas en el periodo
   - Producto mas vendido y producto mas lento
2. ANALIZAR tendencias por producto: subiendo, estable, bajando
3. GENERAR una tabla completa con cada producto y su performance
4. PRODUCIR recomendaciones accionables basadas en los datos
5. IDENTIFICAR aprendizajes para el learning-log

Si no hay datos historicos suficientes, generar la estructura del reporte con datos de ejemplo e indicar que los datos reales deben ser cargados progresivamente.

---

GENERA EL SIGUIENTE REPORTE (formato Markdown):

## Reporte de Stock — ${getTodayISO()}

### KPIs del periodo (ultimos ${brief.lookbackDays} dias)
| KPI | Valor | Periodo anterior | Variacion |
|-----|-------|------------------|-----------|
| Rotacion de inventario | X.X | X.X | +X% |
| Dias promedio de stock | X | X | -X dias |
| Eventos de agotamiento | X | X | +X |
| Unidades vendidas | X | X | +X% |
| Valor del inventario actual | $X | $X | +X% |
| Fill rate (pedidos completos) | X% | X% | +X pp |

### Producto estrella
- **SKU:** [sku]
- **Nombre:** [nombre]
- **Unidades vendidas:** X (X% del total)
- **Tasa diaria:** X.X
- **Stock restante:** X dias
- **Por que funciona:** [analisis]

### Producto mas lento
- **SKU:** [sku]
- **Nombre:** [nombre]
- **Unidades vendidas:** X
- **Tasa diaria:** X.X
- **Stock restante:** X dias
- **Recomendacion:** [liquidar / promocionar / discontinuar]

### Tabla de productos — Performance completa

| SKU | Producto | Vendidos | Ventas/dia | Stock actual | Dias restantes | Tendencia | Estado |
|-----|----------|----------|------------|-------------|----------------|-----------|--------|
| ... | ...      | ...      | ...        | ...         | ...            | ...       | ...    |

### Tendencias detectadas
- Productos con aceleracion de ventas: [lista con datos]
- Productos con desaceleracion: [lista con datos]
- Estacionalidad observada: [si aplica]
- Correlacion con campanas de marketing: [si aplica]

### Recomendaciones
1. [Recomendacion 1 — con datos que la respaldan]
2. [Recomendacion 2 — con datos]
3. [Recomendacion 3 — con datos]
4. [Recomendacion 4 — con datos]
5. [Recomendacion 5 — con datos]

### Aprendizajes para el learning-log
- [Aprendizaje 1]
- [Aprendizaje 2]
- [Aprendizaje 3]

### Notas para el Consultant Agent
Resumen ejecutivo y decisiones pendientes de stock.

---STOCK_DATA_JSON---

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
    "inventoryTurnover": 0.0,
    "averageDaysOfStock": 0,
    "stockoutEvents": 0,
    "totalUnitsSold": 0,
    "topSellingProduct": "SKU-XXX",
    "slowestProduct": "SKU-YYY",
    "totalInventoryValue": 0,
    "fillRate": 0.0
  },
  "products": [
    {
      "sku": "SKU-001",
      "name": "Nombre del producto",
      "unitsSold": 0,
      "dailySalesRate": 0.0,
      "currentStock": 0,
      "daysOfStockRemaining": 0,
      "trend": "up|stable|down",
      "status": "healthy|low|critical|out-of-stock"
    }
  ],
  "recommendations": [
    "recomendacion 1",
    "recomendacion 2",
    "recomendacion 3"
  ],
  "learnings": [
    "aprendizaje 1",
    "aprendizaje 2"
  ]
}
\`\`\``;
}

// --- Parse structured data from output ---

function parseStockData(output) {
  const separator = "---STOCK_DATA_JSON---";
  const idx = output.indexOf(separator);
  if (idx === -1) return null;

  const jsonPart = output.slice(idx + separator.length);
  const jsonMatch = jsonPart.match(/```json\s*([\s\S]*?)\s*```/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[1]);
  } catch {
    console.warn("Warning: could not parse Stock data JSON");
    return null;
  }
}

// --- Update vault files ---

function updateVaultWithStockData(ctx, client, stockData, fullOutput, mode) {
  if (!stockData) return;

  // Append to stock-log.md
  const modeLabels = {
    status: "Status",
    forecast: "Forecast",
    alert: "Alerta",
    report: "Reporte",
  };

  let logEntry = `\n## ${modeLabels[mode]} — ${stockData.date}\n\n` +
    `Mode: ${mode}\n`;

  if (stockData.summary) {
    if (mode === "status") {
      logEntry += `Productos: ${stockData.summary.totalProducts} | Healthy: ${stockData.summary.healthy} | Low: ${stockData.summary.low} | Critical: ${stockData.summary.critical} | Agotados: ${stockData.summary.outOfStock} | Insight: ${stockData.summary.keyInsight}\n`;
    } else if (mode === "forecast") {
      logEntry += `Productos: ${stockData.summary.totalProducts} | Inmediato: ${stockData.summary.immediate} | Pronto: ${stockData.summary.soon} | Planificado: ${stockData.summary.planned} | Sin accion: ${stockData.summary.noAction} | Insight: ${stockData.summary.keyInsight}\n`;
    } else if (mode === "alert") {
      logEntry += `Alertas: ${stockData.summary.totalAlerts} | Criticas: ${stockData.summary.critical} | Warning: ${stockData.summary.warning} | Saludables: ${stockData.summary.healthyProducts} | Insight: ${stockData.summary.keyInsight}\n`;
    }
  }

  if (stockData.kpis) {
    logEntry += `Rotacion: ${stockData.kpis.inventoryTurnover} | Dias promedio: ${stockData.kpis.averageDaysOfStock} | Agotamientos: ${stockData.kpis.stockoutEvents} | Vendidos: ${stockData.kpis.totalUnitsSold} | Top: ${stockData.kpis.topSellingProduct} | Lento: ${stockData.kpis.slowestProduct}\n`;
  }

  if (stockData.period) {
    logEntry += `Periodo: ${stockData.period.start} a ${stockData.period.end} (${stockData.period.days} dias)\n`;
  }

  appendToVaultFile(`clients/${client}/stock-log.md`, logEntry);
  console.log("Updated stock-log.md");

  // Update learning-log with stock insights
  const learnings = [];

  if (stockData.summary?.keyInsight) {
    learnings.push(`- [${stockData.date}] Stock ${modeLabels[mode]}: ${stockData.summary.keyInsight}`);
  }

  if (stockData.recommendations) {
    for (const rec of stockData.recommendations.slice(0, 3)) {
      learnings.push(`- [${stockData.date}] Stock ${mode}: ${rec}`);
    }
  }

  if (stockData.learnings) {
    for (const learning of stockData.learnings.slice(0, 3)) {
      learnings.push(`- [${stockData.date}] Stock aprendizaje: ${learning}`);
    }
  }

  if (learnings.length > 0) {
    appendToVaultFile(
      `clients/${client}/learning-log.md`,
      `\n### Aprendizajes Stock — ${stockData.date}\n${learnings.join("\n")}\n`
    );
    console.log("Updated learning-log.md with stock learnings");
  }
}

// --- Main: exported for future use by Consultant Agent ---

export async function runStockAgent(briefInput) {
  const brief = parseBrief(briefInput);
  const startTime = Date.now();
  console.log(
    `Stock Agent — ${brief.mode} for ${brief.client} (source: ${brief.source})`
  );

  // Step 1: Load vault context
  const ctx = loadClientContext(brief.client);

  // Step 2: Build prompt based on mode
  const promptBuilders = {
    status: buildStatusPrompt,
    forecast: buildForecastPrompt,
    alert: buildAlertPrompt,
    report: buildReportPrompt,
  };

  const prompt = promptBuilders[brief.mode](ctx, brief);

  // Step 3: Generate analysis
  console.log(`Generating ${brief.mode} analysis...`);
  const maxTokensMap = {
    status: 4000,
    forecast: 6000,
    alert: 4000,
    report: 8000,
  };
  const maxTokens = maxTokensMap[brief.mode];
  const output = await callClaude(prompt, maxTokens);
  console.log(`${brief.mode} analysis generated successfully.`);

  // Step 4: Parse structured data
  const stockData = parseStockData(output);

  // Step 5: Update vault files
  updateVaultWithStockData(ctx, brief.client, stockData, output, brief.mode);

  // Step 6: Write agent report
  writeVaultFile(
    `clients/${brief.client}/agent-reports/stock-${brief.mode}-${getTodayISO()}.json`,
    JSON.stringify(
      {
        agent: "stock",
        mode: brief.mode,
        client: brief.client,
        date: getTodayISO(),
        stockData,
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
    status: "\u{1F4E6}",
    forecast: "\u{1F52E}",
    alert: "\u{1F6A8}",
    report: "\u{1F4CA}",
  };

  const modeLabel = {
    status: "Status de Inventario",
    forecast: "Forecast de Reposicion",
    alert: "Alerta de Stock",
    report: "Reporte Semanal",
  };

  let telegramSummary = `*${modeEmoji[brief.mode]} Stock Agent — ${modeLabel[brief.mode]}*
_${getTodayFormatted()}_

\u{1F464} *Cliente:* ${brief.client}
\u{1F4E1} *Solicitado por:* ${sourceLabel}`;

  if (stockData?.summary && brief.mode === "status") {
    telegramSummary += `
\u{1F4E6} *Productos:* ${stockData.summary.totalProducts}
\u{2705} *Healthy:* ${stockData.summary.healthy}
\u{26A0}\u{FE0F} *Low:* ${stockData.summary.low}
\u{1F534} *Critical:* ${stockData.summary.critical}
\u{274C} *Agotados:* ${stockData.summary.outOfStock}
\u{1F4A1} *Insight:* ${stockData.summary.keyInsight}`;
  }

  if (stockData?.summary && brief.mode === "forecast") {
    telegramSummary += `
\u{1F534} *Inmediato:* ${stockData.summary.immediate}
\u{1F7E1} *Pronto:* ${stockData.summary.soon}
\u{1F7E2} *Planificado:* ${stockData.summary.planned}
\u{2705} *Sin accion:* ${stockData.summary.noAction}
\u{1F4A1} *Insight:* ${stockData.summary.keyInsight}`;
  }

  if (stockData?.summary && brief.mode === "alert") {
    telegramSummary += `
\u{1F6A8} *Alertas:* ${stockData.summary.totalAlerts}
\u{1F534} *Criticas:* ${stockData.summary.critical}
\u{26A0}\u{FE0F} *Warning:* ${stockData.summary.warning}
\u{1F4A1} *Insight:* ${stockData.summary.keyInsight}`;
  }

  if (stockData?.kpis) {
    telegramSummary += `
\u{1F504} *Rotacion:* ${stockData.kpis.inventoryTurnover}
\u{1F4C5} *Dias promedio stock:* ${stockData.kpis.averageDaysOfStock}
\u{1F6D2} *Unidades vendidas:* ${stockData.kpis.totalUnitsSold}
\u{1F3C6} *Top producto:* ${stockData.kpis.topSellingProduct}
\u{1F422} *Mas lento:* ${stockData.kpis.slowestProduct}`;
  }

  telegramSummary += `\n\n_vault/clients/${brief.client}/stock-log.md_`;

  await sendTelegram(telegramSummary);

  // Step 8: Return result (for Consultant Agent)
  await logAgentRun(brief.client, "stock", "success", `Stock ejecutado: modo ${brief.mode}.`, { mode: brief.mode, source: brief.source }, { duration_ms: Date.now() - startTime });
  return {
    mode: brief.mode,
    client: brief.client,
    source: brief.source,
    output,
    stockData,
    registeredAt: `vault/clients/${brief.client}/stock-log.md`,
  };
}

// --- CLI entry point ---

async function main() {
  const brief = loadBriefFromArgs();
  const result = await runStockAgent(brief);

  console.log("\n" + "=".repeat(60));
  console.log(`STOCK — ${result.mode.toUpperCase()} — ${result.client}`);
  console.log("=".repeat(60) + "\n");
  console.log(result.output);
  console.log("\n" + "=".repeat(60));
}

main().catch(async (err) => {
  console.error("Stock Agent failed:", err.message);
  await logAgentError("unknown", "stock", err, {});
  try {
    await sendTelegram(`*\u{274C} Stock Agent — Error*\n\n\`${err.message}\``);
  } catch {
    /* silent */
  }
  process.exit(1);
});
