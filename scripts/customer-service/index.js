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
//   node index.js dmancuello chat                  (shorthand — requires --brief for chat)
//   node index.js dmancuello faq                   (FAQ generation)
//   node index.js dmancuello report                (interaction report)

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
    customerMessage: args[2] || null,
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
    productCatalog: readVaultFile(`clients/${client}/product-catalog.md`),
    customerInteractionsLog: readVaultFile(`clients/${client}/customer-interactions-log.md`),
    learningLog: readVaultFile(`clients/${client}/learning-log.md`),
  };

  const loaded = Object.entries(context).filter(([, v]) => v !== null).length;
  const total = Object.keys(context).length;
  console.log(`Vault context loaded: ${loaded}/${total} files found`);

  return context;
}

// --- Prompt Builders ---

function buildChatPrompt(ctx, brief) {
  const brandName = brief.client.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const customerGreeting = brief.customerName ? `El cliente se llama ${brief.customerName}.` : "";

  const conversationHistoryBlock = brief.conversationHistory
    ? brief.conversationHistory
        .map((m) => `${m.role === "customer" ? "Cliente" : "Asistente"}: ${m.message}`)
        .join("\n")
    : "Nueva conversacion — este es el primer mensaje del cliente.";

  return `Eres el asistente virtual de la tienda ${brandName}. Representas a la marca directamente ante sus clientes.

REGLAS CRITICAS — LEE ANTES DE RESPONDER:
1. NUNCA menciones "D&C Scale", "D&C Scale Partners", ni que eres una inteligencia artificial o un bot. Eres el asistente de ${brandName}.
2. Se amable, cercano y profesional. Habla como un vendedor experimentado que conoce cada producto.
3. Cuando recomiendes productos, SIEMPRE incluye el link directo para comprar. Formato: "[Nombre del producto](URL)"
4. Si no sabes algo con certeza (stock exacto, fecha de entrega especifica), deci que vas a consultar con el equipo y que alguien se va a comunicar pronto.
5. Si detectas una queja seria, un pedido de devolucion, o un problema que no puedas resolver, marca escalationNeeded como true en el JSON.
6. Mantene las respuestas CORTAS y conversacionales, como un chat real. No escribas ensayos.
7. Maximo ${brief.maxProducts || 3} productos recomendados por respuesta.
8. Adapta tu tono al canal: ${brief.channel === "whatsapp" ? "informal, con emojis moderados" : brief.channel === "instagram-dm" ? "casual, visual" : brief.channel === "email" ? "mas formal y estructurado" : "amigable y directo"}.
9. Si el cliente pregunta por envios, tiempos de entrega o costos de envio, responde con la informacion disponible en el contexto.
10. Si el cliente esta decidido a comprar, guialo directamente al link del producto.

--- CONTEXTO DE LA MARCA ---
${ctx.clientBrand || "Sin contexto de marca disponible. Responde de forma generica pero profesional."}

--- ESTRATEGIA ACTIVA ---
${ctx.strategy || "Sin estrategia definida."}

--- CATALOGO DE PRODUCTOS ---
${ctx.productCatalog || "Sin catalogo de productos. No recomiendes productos especificos sin catalogo. Indica al cliente que puede ver los productos en la tienda."}

--- HISTORIAL DE INTERACCIONES ---
${ctx.customerInteractionsLog || "Sin historial de interacciones previas."}

--- LEARNING LOG ---
${ctx.learningLog || "Sin aprendizajes previos."}

${brief.instructions ? `--- INSTRUCCIONES ESPECIALES DEL EQUIPO ---\n${brief.instructions}` : ""}

---

CANAL: ${brief.channel || "web-chat"}
${customerGreeting}

--- HISTORIAL DE ESTA CONVERSACION ---
${conversationHistoryBlock}

--- MENSAJE DEL CLIENTE ---
${brief.customerMessage}

---

RESPONDE al cliente siguiendo las reglas. Despues del separador, genera el JSON de datos.

---CUSTOMER_SERVICE_DATA_JSON---

\`\`\`json
{
  "date": "${getTodayISO()}",
  "client": "${brief.client}",
  "mode": "chat",
  "conversationId": "${brief.conversationId}",
  "customerMessage": ${JSON.stringify(brief.customerMessage)},
  "agentResponse": "TU RESPUESTA AL CLIENTE AQUI — texto limpio sin markdown de JSON",
  "intent": "product-inquiry|purchase-help|complaint|general-question|shipping-status|return-request",
  "productsRecommended": [
    { "name": "nombre", "sku": "SKU-XXX", "url": "https://...", "price": 0 }
  ],
  "sentiment": "positive|neutral|negative",
  "escalationNeeded": false,
  "escalationReason": null
}
\`\`\``;
}

function buildFaqPrompt(ctx, brief) {
  return `Eres el Customer Service Agent de D&C Scale Partners (uso interno — NO customer-facing).

Tu trabajo es generar un documento de FAQ (preguntas frecuentes) basado en el catalogo de productos y el contexto del cliente. Este FAQ se usara para entrenar al chatbot y como referencia rapida.

CLIENTE: ${brief.client}
MODO: FAQ — Generacion de preguntas frecuentes
FECHA: ${getTodayFormatted()}

--- CONTEXTO DE LA AGENCIA ---
${ctx.agencyContext || "Sin contexto de agencia."}

--- MARCA DEL CLIENTE ---
${ctx.clientBrand || "Sin contexto de marca."}

--- ESTRATEGIA ACTIVA ---
${ctx.strategy || "Sin estrategia definida."}

--- CATALOGO DE PRODUCTOS ---
${ctx.productCatalog || "Sin catalogo de productos. Genera FAQs genericas para eCommerce."}

--- HISTORIAL DE INTERACCIONES ---
${ctx.customerInteractionsLog || "Sin historial. Genera FAQs basadas en preguntas tipicas del tipo de negocio."}

--- LEARNING LOG ---
${ctx.learningLog || "Sin learning log."}

${brief.instructions ? `--- INSTRUCCIONES ADICIONALES ---\n${brief.instructions}` : ""}

---

GENERA un FAQ completo organizado por categorias:

1. PRODUCTOS: preguntas sobre productos, materiales, cuidado, tallas, personalizacion
2. ENVIOS: tiempos de entrega, costos, zonas de cobertura, seguimiento
3. DEVOLUCIONES: politica de cambios, plazos, proceso, condiciones
4. PAGOS: metodos aceptados, cuotas, monedas, facturacion
5. GENERAL: horarios, contacto, ubicacion, sobre la marca

Para cada FAQ incluye:
- La pregunta tal como la haria un cliente
- La respuesta en tono de la marca (amigable, profesional)
- Productos relacionados (SKU) si aplica

Si hay historial de interacciones, prioriza las preguntas que mas se repiten.

---

GENERA EL SIGUIENTE DOCUMENTO (formato Markdown):

## FAQ — ${brief.client} — ${getTodayISO()}

### Productos
#### P: [pregunta]
R: [respuesta]
_Productos relacionados: SKU-XXX, SKU-YYY_

### Envios
#### P: [pregunta]
R: [respuesta]

### Devoluciones y cambios
#### P: [pregunta]
R: [respuesta]

### Pagos
#### P: [pregunta]
R: [respuesta]

### General
#### P: [pregunta]
R: [respuesta]

---CUSTOMER_SERVICE_DATA_JSON---

\`\`\`json
{
  "date": "${getTodayISO()}",
  "client": "${brief.client}",
  "mode": "faq",
  "faqs": [
    {
      "category": "products|shipping|returns|payment|general",
      "question": "pregunta del cliente",
      "answer": "respuesta en tono de marca",
      "relatedProducts": ["SKU-XXX"]
    }
  ],
  "summary": {
    "totalFaqs": 0,
    "categories": ["products", "shipping", "returns", "payment", "general"]
  }
}
\`\`\``;
}

function buildReportPrompt(ctx, brief) {
  return `Eres el Customer Service Agent de D&C Scale Partners (uso interno).

Tu trabajo es analizar las interacciones con clientes del periodo y generar un reporte con patrones, KPIs de atencion y recomendaciones.

CLIENTE: ${brief.client}
MODO: REPORT — Analisis de interacciones con clientes
FECHA: ${getTodayFormatted()}
PERIODO: ultimos ${brief.lookbackDays} dias

--- CONTEXTO DE LA AGENCIA ---
${ctx.agencyContext || "Sin contexto de agencia."}

--- MARCA DEL CLIENTE ---
${ctx.clientBrand || "Sin contexto de marca."}

--- ESTRATEGIA ACTIVA ---
${ctx.strategy || "Sin estrategia definida."}

--- CATALOGO DE PRODUCTOS ---
${ctx.productCatalog || "Sin catalogo de productos."}

--- HISTORIAL DE INTERACCIONES ---
${ctx.customerInteractionsLog || "Sin historial de interacciones. Generar reporte con estructura vacia e indicar que los datos se iran acumulando."}

--- LEARNING LOG ---
${ctx.learningLog || "Sin learning log."}

${brief.instructions ? `--- INSTRUCCIONES ADICIONALES ---\n${brief.instructions}` : ""}

---

ANALIZA las interacciones del periodo y genera:

1. KPIs de atencion: total conversaciones, tasa de resolucion, tasa de escalacion, satisfaccion estimada
2. Desglose por intent: cuantas consultas de cada tipo
3. Productos mas consultados: cuales generan mas preguntas
4. Sentimiento general: distribucion positivo/neutro/negativo
5. Preguntas mas frecuentes: top 5 temas
6. Recomendaciones: como mejorar la atencion, que informacion falta, que automatizar

---

GENERA EL SIGUIENTE REPORTE (formato Markdown):

## Reporte de Atencion al Cliente — ${getTodayISO()}

### KPIs del periodo
| KPI | Valor |
|-----|-------|
| Total conversaciones | X |
| Tiempo promedio de respuesta | X min |
| Tasa de resolucion | X% |
| Tasa de escalacion | X% |
| Satisfaccion estimada | X/5 |

### Desglose por tipo de consulta
| Intent | Cantidad | Porcentaje |
|--------|----------|-----------|
| Consulta de producto | X | X% |
| Ayuda con compra | X | X% |
| Queja | X | X% |
| Pregunta general | X | X% |
| Estado de envio | X | X% |
| Devolucion | X | X% |

### Productos mas consultados
| SKU | Producto | Consultas | Tipo de consulta mas comun |
|-----|----------|-----------|---------------------------|

### Sentimiento
| Sentimiento | Cantidad | Porcentaje |
|-------------|----------|-----------|
| Positivo | X | X% |
| Neutro | X | X% |
| Negativo | X | X% |

### Top 5 preguntas frecuentes
1. [Pregunta] — X veces
2. [Pregunta] — X veces
3. [Pregunta] — X veces
4. [Pregunta] — X veces
5. [Pregunta] — X veces

### Escalaciones
Para cada escalacion: motivo, resolucion, aprendizaje.

### Recomendaciones
1. [Recomendacion con impacto esperado]
2. [Recomendacion]
3. [Recomendacion]

### Aprendizajes para el learning-log
- [Aprendizaje 1]
- [Aprendizaje 2]

### Notas para el Consultant Agent
Patrones detectados y decisiones que requieren atencion del dueno.

---CUSTOMER_SERVICE_DATA_JSON---

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
    "totalConversations": 0,
    "avgResponseTime": "X min",
    "resolutionRate": 0.0,
    "escalationRate": 0.0,
    "satisfactionScore": 0.0
  },
  "intentBreakdown": {
    "product-inquiry": 0,
    "purchase-help": 0,
    "complaint": 0,
    "general-question": 0,
    "shipping-status": 0,
    "return-request": 0
  },
  "topQuestions": ["pregunta 1", "pregunta 2", "pregunta 3"],
  "productsMostAskedAbout": ["SKU-XXX", "SKU-YYY"],
  "sentimentDistribution": { "positive": 0, "neutral": 0, "negative": 0 },
  "recommendations": ["recomendacion 1", "recomendacion 2"],
  "learnings": ["aprendizaje 1", "aprendizaje 2"]
}
\`\`\``;
}

// --- Parse structured data from output ---

function parseCustomerServiceData(output) {
  const separator = "---CUSTOMER_SERVICE_DATA_JSON---";
  const idx = output.indexOf(separator);
  if (idx === -1) return null;

  const jsonPart = output.slice(idx + separator.length);
  const jsonMatch = jsonPart.match(/```json\s*([\s\S]*?)\s*```/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[1]);
  } catch {
    console.warn("Warning: could not parse Customer Service data JSON");
    return null;
  }
}

// --- Update vault files ---

function updateVaultWithCustomerData(ctx, client, csData, fullOutput, mode) {
  if (!csData) return;

  if (mode === "chat") {
    // Log conversation turn
    const logEntry = `\n### Conversacion ${csData.conversationId} — ${csData.date}
- Canal: ${csData.channel || "web-chat"}
- Intent: ${csData.intent}
- Sentiment: ${csData.sentiment}
- Escalacion: ${csData.escalationNeeded ? `SI — ${csData.escalationReason}` : "No"}
- Productos recomendados: ${csData.productsRecommended?.map((p) => p.sku).join(", ") || "ninguno"}
- Cliente: ${csData.customerMessage?.slice(0, 100)}...
- Respuesta: ${csData.agentResponse?.slice(0, 100)}...
`;
    appendToVaultFile(`clients/${client}/customer-interactions-log.md`, logEntry);
    console.log("Updated customer-interactions-log.md");
  }

  if (mode === "report") {
    // Log report summary
    const logEntry = `\n## Reporte de Atencion — ${csData.date}
Conversaciones: ${csData.kpis?.totalConversations} | Resolucion: ${csData.kpis?.resolutionRate}% | Escalacion: ${csData.kpis?.escalationRate}% | Satisfaccion: ${csData.kpis?.satisfactionScore}/5
`;
    appendToVaultFile(`clients/${client}/customer-interactions-log.md`, logEntry);

    // Learnings
    const learnings = [];
    if (csData.recommendations) {
      for (const rec of csData.recommendations.slice(0, 3)) {
        learnings.push(`- [${csData.date}] Customer Service: ${rec}`);
      }
    }
    if (csData.learnings) {
      for (const learning of csData.learnings.slice(0, 3)) {
        learnings.push(`- [${csData.date}] Customer Service aprendizaje: ${learning}`);
      }
    }
    if (learnings.length > 0) {
      appendToVaultFile(
        `clients/${client}/learning-log.md`,
        `\n### Aprendizajes Customer Service — ${csData.date}\n${learnings.join("\n")}\n`
      );
      console.log("Updated learning-log.md with customer service learnings");
    }
  }
}

// --- Main: exported for future use by Consultant Agent ---

export async function runCustomerServiceAgent(briefInput) {
  const brief = parseBrief(briefInput);
  const startTime = Date.now();
  console.log(
    `Customer Service Agent — ${brief.mode} for ${brief.client} (source: ${brief.source})`
  );

  // Step 1: Load vault context
  const ctx = loadClientContext(brief.client);

  // Step 2: Build prompt based on mode
  const promptBuilders = {
    chat: buildChatPrompt,
    faq: buildFaqPrompt,
    report: buildReportPrompt,
  };

  const prompt = promptBuilders[brief.mode](ctx, brief);

  // Step 3: Generate response
  console.log(`Generating ${brief.mode} response...`);
  const maxTokensMap = {
    chat: 2000,
    faq: 8000,
    report: 8000,
  };
  const maxTokens = maxTokensMap[brief.mode];
  const output = await callClaude(prompt, maxTokens);
  console.log(`${brief.mode} response generated successfully.`);

  // Step 4: Parse structured data
  const csData = parseCustomerServiceData(output);

  // Step 5: Update vault files
  updateVaultWithCustomerData(ctx, brief.client, csData, output, brief.mode);

  // Step 6: Write agent report
  writeVaultFile(
    `clients/${brief.client}/agent-reports/customer-service-${brief.mode}-${getTodayISO()}.json`,
    JSON.stringify(
      {
        agent: "customer-service",
        mode: brief.mode,
        client: brief.client,
        date: getTodayISO(),
        csData,
        timestamp: new Date().toISOString(),
      },
      null,
      2
    )
  );
  console.log("Wrote agent report.");

  // Step 7: Notify via Telegram (monitoring for D&C team — NOT sent to customer)
  const sourceLabel = {
    cli: "CLI manual",
    "consultant-agent": "Agente Consultor",
    dashboard: "Dashboard",
    "github-actions": "GitHub Actions",
    webhook: "Webhook (real-time)",
  }[brief.source] || brief.source;

  const modeEmoji = {
    chat: "\u{1F4AC}",
    faq: "\u2753",
    report: "\u{1F4CA}",
  };

  const modeLabel = {
    chat: "Chat con Cliente",
    faq: "FAQ Generada",
    report: "Reporte de Atencion",
  };

  let telegramSummary = `*${modeEmoji[brief.mode]} Customer Service — ${modeLabel[brief.mode]}*
_${getTodayFormatted()}_

\u{1F464} *Cliente:* ${brief.client}
\u{1F4E1} *Source:* ${sourceLabel}`;

  if (brief.mode === "chat" && csData) {
    telegramSummary += `
\u{1F4AC} *Canal:* ${brief.channel || "web-chat"}
\u{1F3AF} *Intent:* ${csData.intent}
\u{1F60A} *Sentiment:* ${csData.sentiment}
\u{1F6D2} *Productos rec:* ${csData.productsRecommended?.length || 0}`;
    if (csData.escalationNeeded) {
      telegramSummary += `
\u{1F6A8} *ESCALACION:* ${csData.escalationReason}`;
    }
  }

  if (brief.mode === "faq" && csData?.summary) {
    telegramSummary += `
\u2753 *FAQs generadas:* ${csData.summary.totalFaqs}
\u{1F4C2} *Categorias:* ${csData.summary.categories?.join(", ")}`;
  }

  if (brief.mode === "report" && csData?.kpis) {
    telegramSummary += `
\u{1F4AC} *Conversaciones:* ${csData.kpis.totalConversations}
\u2705 *Resolucion:* ${csData.kpis.resolutionRate}%
\u{1F6A8} *Escalacion:* ${csData.kpis.escalationRate}%
\u2B50 *Satisfaccion:* ${csData.kpis.satisfactionScore}/5`;
  }

  telegramSummary += `\n\n_vault/clients/${brief.client}/customer-interactions-log.md_`;

  await sendTelegram(telegramSummary);

  // Step 8: Return result (for Consultant Agent or webhook)
  await logAgentRun(brief.client, "customer-service", "success", `Customer Service ejecutado: modo ${brief.mode}.`, { mode: brief.mode, source: brief.source }, { duration_ms: Date.now() - startTime });
  return {
    mode: brief.mode,
    client: brief.client,
    source: brief.source,
    output,
    csData,
    // For chat mode, the agentResponse is the key field for delivery to customer
    agentResponse: csData?.agentResponse || null,
    registeredAt: `vault/clients/${brief.client}/customer-interactions-log.md`,
  };
}

// --- CLI entry point ---

async function main() {
  const brief = loadBriefFromArgs();
  const result = await runCustomerServiceAgent(brief);

  console.log("\n" + "=".repeat(60));
  console.log(`CUSTOMER SERVICE — ${result.mode.toUpperCase()} — ${result.client}`);
  console.log("=".repeat(60) + "\n");

  if (result.mode === "chat" && result.agentResponse) {
    console.log("RESPUESTA AL CLIENTE:");
    console.log("-".repeat(40));
    console.log(result.agentResponse);
    console.log("-".repeat(40));
  }

  console.log(result.output);
  console.log("\n" + "=".repeat(60));
}

main().catch(async (err) => {
  console.error("Customer Service Agent failed:", err.message);
  await logAgentError("unknown", "customer-service", err, {});
  try {
    await sendTelegram(`*\u{274C} Customer Service Agent — Error*\n\n\`${err.message}\``);
  } catch {
    /* silent */
  }
  process.exit(1);
});
