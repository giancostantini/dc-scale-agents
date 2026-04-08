import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { parseBrief, DEFAULT_BRIEF } from "./brief-schema.js";

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
//   node index.js dmancuello audit                 (shorthand: client + mode)
//   node index.js                                  (defaults: audit)

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

/**
 * Trigger Content Creator Agent via GitHub repository_dispatch.
 * Used when Meta Ads Agent needs a new ad creative.
 */
async function triggerContentCreator(contentBrief) {
  if (!GITHUB_TOKEN) {
    console.warn("No GITHUB_TOKEN — cannot trigger Content Creator. Writing brief to vault instead.");
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
        event_type: "content-creator",
        client_payload: { brief: contentBrief },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.warn(`Could not trigger Content Creator: ${res.status} ${err}`);
    return false;
  }

  console.log("Content Creator triggered via repository_dispatch");
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
    contentLibrary: readVaultFile(`clients/${client}/content-library.md`),
    contentCalendar: readVaultFile(`clients/${client}/content-calendar.md`),
    metricsLog: readVaultFile(`clients/${client}/metrics-log.md`),
    learningLog: readVaultFile(`clients/${client}/learning-log.md`),
    adsLog: readVaultFile(`clients/${client}/ads-log.md`),
    adsKnowledge: readVaultFile("agents/meta-ads/ads-strategies.md"),
  };

  const loaded = Object.entries(context).filter(([, v]) => v !== null).length;
  const total = Object.keys(context).length;
  console.log(`Vault context loaded: ${loaded}/${total} files found`);

  return context;
}

// --- Extract content piece from content-library ---

function extractContentPiece(contentLibrary, pieceId) {
  if (!contentLibrary || !pieceId) return null;

  const pattern = new RegExp(
    `## Pieza #${pieceId}[\\s\\S]*?(?=\\n## Pieza #|\\n*$)`,
    "g"
  );
  const match = pattern.exec(contentLibrary);
  return match ? match[0] : null;
}

// --- Prompt Builders ---

function buildAuditPrompt(ctx, brief) {
  return `Eres el Meta Ads Agent de D&C Scale Partners.

Tu trabajo es auditar las campanas activas de Meta Ads (Facebook + Instagram) y encontrar oportunidades de optimizacion.

CLIENTE: ${brief.client}
MODO: AUDIT — Analisis completo de campanas activas
FECHA: ${getTodayFormatted()}
LOOKBACK: ultimos ${brief.lookbackDays} dias

--- CONTEXTO DE LA AGENCIA ---
${ctx.agencyContext || "Sin contexto de agencia."}

--- MARCA DEL CLIENTE ---
${ctx.clientBrand || "Sin contexto de marca."}

--- ESTRATEGIA ACTIVA ---
${ctx.strategy || "Sin estrategia definida."}

--- HISTORIAL DE ADS ---
${ctx.adsLog || "Sin historial de ads. Este es el primer audit."}

--- METRICAS DE REDES SOCIALES ---
${ctx.metricsLog || "Sin metricas de redes sociales."}

--- KNOWLEDGE BASE DE ADS ---
${ctx.adsKnowledge || "Sin knowledge base de ads."}

--- LEARNING LOG ---
${ctx.learningLog || "Sin learning log."}

${brief.instructions ? `--- INSTRUCCIONES ADICIONALES ---\n${brief.instructions}` : ""}

---

IMPORTANTE: Como este agente corre automatizado y puede NO tener acceso directo a la Meta Ads API todavia, tu rol es:

1. ANALIZAR el historial de ads-log.md y metricas disponibles
2. IDENTIFICAR campanas con bajo ROAS, alto CPA, o audiencias saturadas
3. RECOMENDAR acciones concretas: pausar, escalar, cambiar audiencia, nuevo creativo
4. DETECTAR oportunidades basadas en el contenido organico que funciona (metricsLog)

---

GENERA EL SIGUIENTE REPORTE (formato Markdown):

## Audit de Meta Ads — ${getTodayISO()}

### Resumen ejecutivo
- Total campanas activas
- Gasto total del periodo
- ROAS promedio
- CPA promedio
- Hallazgo principal

### Campanas activas — Evaluacion

Para cada campana:
#### [Nombre de campana]
| Metrica | Valor | Benchmark | Evaluacion |
|---------|-------|-----------|------------|
| ROAS | X.X | X.X | OK/BAJO/ALTO |
| CPA | $X | $X | OK/ALTO/BAJO |
| CTR | X% | X% | OK/BAJO |
| CPM | $X | $X | OK/ALTO |
| Frecuencia | X | <2 | OK/ALTO |
| Relevance Score | X/10 | >7 | OK/BAJO |

**Evaluacion:** ESCALAR / MANTENER / OPTIMIZAR / PAUSAR
**Accion recomendada:** (que hacer especificamente)

### Oportunidades detectadas
1. Contenido organico con alto engagement que deberia pautarse
2. Audiencias no exploradas
3. Placements subutilizados

### Presupuesto — Redistribucion sugerida
| Campana | Budget actual | Budget sugerido | Razon |
|---------|--------------|-----------------|-------|

### Notas para el Consultant Agent
Decisiones estrategicas que requieren aprobacion.

---META_ADS_DATA_JSON---

Despues del separador, genera un JSON con esta estructura:
\`\`\`json
{
  "date": "${getTodayISO()}",
  "client": "${brief.client}",
  "mode": "audit",
  "campaigns": [
    {
      "name": "campaign name",
      "status": "active|paused",
      "evaluation": "scale|maintain|optimize|pause",
      "roas": 0,
      "cpa": 0,
      "ctr": 0,
      "spend": 0,
      "action": "description of recommended action"
    }
  ],
  "summary": {
    "totalCampaigns": 0,
    "totalSpend": 0,
    "avgRoas": 0,
    "avgCpa": 0,
    "topCampaign": "name",
    "mainFinding": "key insight"
  },
  "contentToBoost": ["pieceId1", "pieceId2"],
  "budgetReallocation": [
    { "campaign": "name", "currentBudget": 0, "suggestedBudget": 0 }
  ]
}
\`\`\``;
}

function buildCreatePrompt(ctx, brief) {
  const existingCreative = brief.existingPieceId
    ? extractContentPiece(ctx.contentLibrary, brief.existingPieceId)
    : null;

  return `Eres el Meta Ads Agent de D&C Scale Partners.

Tu trabajo es disenar una nueva campana de Meta Ads (Facebook + Instagram) completa.

CLIENTE: ${brief.client}
MODO: CREATE — Crear nueva campana
FECHA: ${getTodayFormatted()}

--- PARAMETROS DE LA CAMPANA ---
Objetivo: ${brief.campaignObjective || "sales (default)"}
Nombre: ${brief.campaignName || "auto-generar basado en objetivo y fecha"}
Presupuesto diario: ${brief.dailyBudget ? `$${brief.dailyBudget} USD` : "Recomendar basado en objetivo"}
Presupuesto total: ${brief.totalBudget ? `$${brief.totalBudget} USD` : "No definido"}
ROAS target: ${brief.roasTarget || "Recomendar basado en industria"}
Audiencia: ${brief.targetAudience || "Definir basado en cliente y objetivo"}
Paises: ${brief.targetCountries ? brief.targetCountries.join(", ") : "UY (default, expandir segun estrategia)"}
Placements: ${brief.placements ? brief.placements.join(", ") : "Automatico (recomendar)"}

--- CREATIVO DISPONIBLE ---
${existingCreative || "No hay creativo asignado. Se necesita solicitar al Content Creator Agent."}

${brief.requestCreative && !existingCreative ? `
--- NOTA: SOLICITAR CREATIVO ---
No hay creativo disponible. Debes generar un brief para el Content Creator Agent.
Tipo de creativo solicitado: ${brief.creativeType || "static-ad"}
Incluye el brief completo en el JSON de salida (campo "contentCreatorBrief").
` : ""}

--- CONTEXTO DE LA AGENCIA ---
${ctx.agencyContext || "Sin contexto de agencia."}

--- MARCA DEL CLIENTE ---
${ctx.clientBrand || "Sin contexto de marca."}

--- ESTRATEGIA ACTIVA ---
${ctx.strategy || "Sin estrategia definida."}

--- HISTORIAL DE ADS ---
${ctx.adsLog || "Sin historial de ads."}

--- CONTENT LIBRARY ---
${ctx.contentLibrary || "Sin content library."}

--- KNOWLEDGE BASE DE ADS ---
${ctx.adsKnowledge || "Sin knowledge base de ads."}

--- LEARNING LOG ---
${ctx.learningLog || "Sin learning log."}

${brief.instructions ? `--- INSTRUCCIONES ADICIONALES ---\n${brief.instructions}` : ""}

---

GENERA LA ESTRUCTURA COMPLETA DE LA CAMPANA:

## Nueva Campana — ${getTodayISO()}

### Estructura de campana

#### Nivel Campana
- Nombre: [nombre descriptivo]
- Objetivo: [objetivo Meta]
- Tipo de compra: Auction
- Presupuesto: [CBO o ABO, con monto]
- Fecha inicio: ${getTodayISO()}
- Optimizacion: [tipo]

#### Nivel Ad Set(s)
Para cada ad set (minimo 2 para testing):

**Ad Set 1 — [nombre descriptivo]**
- Audiencia: [descripcion detallada]
- Edad: [rango]
- Genero: [all/male/female]
- Intereses: [lista]
- Lookalikes: [si aplica]
- Exclusiones: [compradores recientes, etc.]
- Placements: [lista]
- Presupuesto: [si ABO]
- Programacion: [horarios optimos]

#### Nivel Ad(s)
Para cada ad:

**Ad 1 — [nombre descriptivo]**
- Formato: [single image/video/carousel]
- Creativo: [Pieza #XX de content-library o "SOLICITAR AL CONTENT CREATOR"]
- Copy primario: [texto completo]
- Headline: [titulo]
- Descripcion: [link description]
- CTA button: [Shop Now/Learn More/etc.]
- URL destino: [landing page]
- UTM parameters: [utm_source, utm_medium, utm_campaign, utm_content]

### Estrategia de testing
- Que se esta testeando (audiencia/creativo/copy)
- Metricas de decision
- Cuando evaluar (dias)
- Criterio para escalar ganador

### Presupuesto y proyecciones
| Escenario | ROAS | CPA | Revenue estimado | Gasto |
|-----------|------|-----|------------------|-------|
| Conservador | X | $X | $X | $X |
| Esperado | X | $X | $X | $X |
| Optimista | X | $X | $X | $X |

${brief.requestCreative && !existingCreative ? `
### Brief para Content Creator Agent
Genera el brief completo que el Meta Ads Agent enviara al Content Creator para producir el creativo necesario.
` : ""}

### Notas para el Consultant Agent
Decisiones que requieren aprobacion antes de lanzar.

---META_ADS_DATA_JSON---

\`\`\`json
{
  "date": "${getTodayISO()}",
  "client": "${brief.client}",
  "mode": "create",
  "campaign": {
    "name": "campaign name",
    "objective": "${brief.campaignObjective || "sales"}",
    "dailyBudget": ${brief.dailyBudget || 0},
    "status": "draft",
    "adSets": [
      {
        "name": "ad set name",
        "audience": "audience description",
        "countries": ${JSON.stringify(brief.targetCountries || ["UY"])},
        "placements": ["feed", "stories"]
      }
    ],
    "ads": [
      {
        "name": "ad name",
        "format": "single_image|video|carousel",
        "contentPieceId": "${brief.existingPieceId || "PENDING"}",
        "headline": "headline text",
        "cta": "SHOP_NOW",
        "destinationUrl": "https://..."
      }
    ]
  },
  ${brief.requestCreative && !existingCreative ? `"contentCreatorBrief": {
    "client": "${brief.client}",
    "pieceType": "${brief.creativeType || "static-ad"}",
    "source": "meta-ads-agent",
    "objective": "sales",
    "targetAudience": "${brief.targetAudience || ""}",
    "cta": "",
    "instructions": "Creativo para campana de Meta Ads. [DETALLAR]"
  },` : ""}
  "testing": {
    "variable": "audience|creative|copy",
    "evaluationDays": 3,
    "scaleCriteria": "ROAS > ${brief.roasTarget || 2.0}"
  }
}
\`\`\``;
}

function buildOptimizePrompt(ctx, brief) {
  return `Eres el Meta Ads Agent de D&C Scale Partners.

Tu trabajo es optimizar campanas activas de Meta Ads basandote en datos de performance.

CLIENTE: ${brief.client}
MODO: OPTIMIZE — Optimizacion de campanas activas
FECHA: ${getTodayFormatted()}
LOOKBACK: ultimos ${brief.lookbackDays} dias
${brief.campaignIds ? `CAMPANAS TARGET: ${brief.campaignIds.join(", ")}` : "CAMPANAS: todas las activas"}
ROAS TARGET: ${brief.roasTarget || "Usar benchmark de la industria"}

--- CONTEXTO DE LA AGENCIA ---
${ctx.agencyContext || "Sin contexto de agencia."}

--- MARCA DEL CLIENTE ---
${ctx.clientBrand || "Sin contexto de marca."}

--- ESTRATEGIA ACTIVA ---
${ctx.strategy || "Sin estrategia definida."}

--- HISTORIAL DE ADS ---
${ctx.adsLog || "Sin historial de ads."}

--- METRICAS DE REDES SOCIALES (para cross-reference) ---
${ctx.metricsLog || "Sin metricas organicas."}

--- KNOWLEDGE BASE DE ADS ---
${ctx.adsKnowledge || "Sin knowledge base de ads."}

--- LEARNING LOG ---
${ctx.learningLog || "Sin learning log."}

${brief.instructions ? `--- INSTRUCCIONES ADICIONALES ---\n${brief.instructions}` : ""}

---

GENERA RECOMENDACIONES DE OPTIMIZACION:

## Optimizacion de Campanas — ${getTodayISO()}

### Cambios inmediatos (ejecutar ahora)
Para cada cambio:
- Campana/Ad Set afectado
- Que cambiar: budget/audiencia/placement/creativo/schedule
- Valor actual → Valor nuevo
- Razon basada en datos

### Creativos que necesitan refresh
- Ads con fatigue (frecuencia > 2.5, CTR cayendo)
- Recomendar tipo de nuevo creativo
- Brief sugerido para Content Creator Agent

### Audiencias — Hallazgos
- Segmentos que mejor convierten
- Segmentos a excluir
- Lookalikes a crear

### Presupuesto — Redistribucion
| Campana/Ad Set | Budget actual | Accion | Budget nuevo | Razon |
|----------------|--------------|--------|-------------|-------|

### Proyeccion post-optimizacion
| KPI | Actual | Proyectado | Variacion |
|-----|--------|-----------|-----------|

---META_ADS_DATA_JSON---

\`\`\`json
{
  "date": "${getTodayISO()}",
  "client": "${brief.client}",
  "mode": "optimize",
  "changes": [
    {
      "campaign": "name",
      "adSet": "name or null",
      "changeType": "budget|audience|placement|creative|schedule|pause",
      "currentValue": "current",
      "newValue": "new",
      "reason": "why"
    }
  ],
  "creativesNeeded": [
    {
      "forCampaign": "campaign name",
      "creativeType": "static-ad|reel",
      "reason": "ad fatigue|low ctr|new test",
      "contentCreatorBrief": {
        "client": "${brief.client}",
        "pieceType": "static-ad",
        "source": "meta-ads-agent",
        "objective": "sales",
        "instructions": "details"
      }
    }
  ],
  "budgetChanges": [
    { "campaign": "name", "currentBudget": 0, "newBudget": 0 }
  ]
}
\`\`\``;
}

function buildReportPrompt(ctx, brief) {
  return `Eres el Meta Ads Agent de D&C Scale Partners.

Tu trabajo es generar un reporte completo de performance de Meta Ads.

CLIENTE: ${brief.client}
MODO: REPORT — Reporte de performance
FECHA: ${getTodayFormatted()}
PERIODO: ultimos ${brief.lookbackDays} dias

--- CONTEXTO DE LA AGENCIA ---
${ctx.agencyContext || "Sin contexto de agencia."}

--- MARCA DEL CLIENTE ---
${ctx.clientBrand || "Sin contexto de marca."}

--- ESTRATEGIA ACTIVA ---
${ctx.strategy || "Sin estrategia definida."}

--- HISTORIAL DE ADS ---
${ctx.adsLog || "Sin historial de ads. Este es el primer reporte."}

--- METRICAS DE REDES SOCIALES ---
${ctx.metricsLog || "Sin metricas organicas."}

--- CONTENT LIBRARY (para cross-reference creativos) ---
${ctx.contentLibrary || "Sin content library."}

--- KNOWLEDGE BASE DE ADS ---
${ctx.adsKnowledge || "Sin knowledge base de ads."}

--- LEARNING LOG ---
${ctx.learningLog || "Sin learning log."}

${brief.instructions ? `--- INSTRUCCIONES ADICIONALES ---\n${brief.instructions}` : ""}

---

GENERA EL REPORTE DE PERFORMANCE:

## Reporte de Meta Ads — ${getTodayISO()}

### KPIs del periodo
| KPI | Valor | Periodo anterior | Variacion |
|-----|-------|------------------|-----------|
| Gasto total | $X | $X | +X% |
| ROAS | X.X | X.X | +X% |
| CPA | $X | $X | -X% |
| CTR promedio | X% | X% | +X pp |
| CPM promedio | $X | $X | +X% |
| Conversiones | X | X | +X% |
| Revenue atribuido | $X | $X | +X% |

### Top 3 campanas
Para cada una: que funciono, creativos ganadores, audiencias top

### Bottom 3 campanas
Para cada una: que no funciono, por que, accion tomada

### Performance por objetivo
| Objetivo | Campanas | Gasto | ROAS | CPA |
|----------|----------|-------|------|-----|

### Performance por placement
| Placement | Impresiones | CTR | CPA | ROAS |
|-----------|------------|-----|-----|------|

### Creativos — Analisis
- Creativos ganadores (formatos, estilos, hooks que funcionan en ads)
- Creativos perdedores
- Recomendaciones para Content Creator Agent

### Audiencias — Insights
- Segmentos top por ROAS
- Segmentos top por volumen
- Oportunidades de expansion

### Recomendaciones
1. Campanas a escalar
2. Campanas a pausar
3. Nuevas campanas a crear
4. Creativos a solicitar
5. Audiencias a testear

### Notas para el Consultant Agent
Resumen ejecutivo y decisiones pendientes.

---META_ADS_DATA_JSON---

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
    "totalSpend": 0,
    "roas": 0,
    "cpa": 0,
    "ctr": 0,
    "cpm": 0,
    "conversions": 0,
    "revenue": 0
  },
  "topCampaigns": ["name1", "name2", "name3"],
  "bottomCampaigns": ["name1", "name2"],
  "creativesWinners": ["pieceId or description"],
  "creativesNeeded": ["type and reason"],
  "recommendations": ["recommendation 1", "recommendation 2"]
}
\`\`\``;
}

function buildTogglePrompt(ctx, brief) {
  return `Eres el Meta Ads Agent de D&C Scale Partners.

Tu trabajo es ${brief.toggleAction === "activate" ? "ACTIVAR" : "DESACTIVAR"} campanas de Meta Ads.

CLIENTE: ${brief.client}
MODO: TOGGLE — ${brief.toggleAction === "activate" ? "Activar" : "Desactivar"} campanas
FECHA: ${getTodayFormatted()}

--- CAMPANAS TARGET ---
${brief.campaignIds ? `IDs: ${brief.campaignIds.join(", ")}` : ""}
${brief.campaignName ? `Nombre: ${brief.campaignName}` : ""}
Accion: ${brief.toggleAction.toUpperCase()}

--- HISTORIAL DE ADS ---
${ctx.adsLog || "Sin historial de ads."}

--- ESTRATEGIA ACTIVA ---
${ctx.strategy || "Sin estrategia definida."}

${brief.instructions ? `--- INSTRUCCIONES ADICIONALES ---\n${brief.instructions}` : ""}

---

IMPORTANTE: Como el acceso directo a la Meta Ads API puede no estar disponible todavia, genera:

1. Los comandos exactos que se ejecutarian en la Meta Ads API
2. El registro para ads-log.md
3. Impacto esperado en presupuesto

## Toggle de Campanas — ${getTodayISO()}

### Campanas ${brief.toggleAction === "activate" ? "activadas" : "desactivadas"}

Para cada campana:
- Nombre / ID
- Estado anterior → Estado nuevo
- Razon
- Impacto en gasto diario

### Impacto en presupuesto
| Metrica | Antes | Despues | Variacion |
|---------|-------|---------|-----------|

### Notas para el Consultant Agent
Confirmacion de la accion y proximos pasos sugeridos.

---META_ADS_DATA_JSON---

\`\`\`json
{
  "date": "${getTodayISO()}",
  "client": "${brief.client}",
  "mode": "toggle",
  "action": "${brief.toggleAction}",
  "campaigns": [
    {
      "name": "campaign name",
      "id": "campaign id",
      "previousStatus": "active|paused",
      "newStatus": "${brief.toggleAction === "activate" ? "active" : "paused"}",
      "dailyBudgetImpact": 0
    }
  ],
  "totalBudgetImpact": 0
}
\`\`\``;
}

// --- Parse structured data from output ---

function parseMetaAdsData(output) {
  const separator = "---META_ADS_DATA_JSON---";
  const idx = output.indexOf(separator);
  if (idx === -1) return null;

  const jsonPart = output.slice(idx + separator.length);
  const jsonMatch = jsonPart.match(/```json\s*([\s\S]*?)\s*```/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[1]);
  } catch {
    console.warn("Warning: could not parse Meta Ads data JSON");
    return null;
  }
}

// --- Update vault files ---

function updateVaultWithAdsData(ctx, client, adsData, fullOutput, mode) {
  if (!adsData) return;

  // Append to ads-log.md
  const modeLabels = {
    audit: "Audit",
    create: "Nueva Campana",
    optimize: "Optimizacion",
    report: "Reporte",
    toggle: "Toggle",
  };

  const logEntry = `\n## ${modeLabels[mode]} — ${adsData.date}\n\n` +
    `Mode: ${mode}\n` +
    (adsData.summary
      ? `Campanas: ${adsData.summary.totalCampaigns} | Gasto: $${adsData.summary.totalSpend} | ROAS: ${adsData.summary.avgRoas} | Hallazgo: ${adsData.summary.mainFinding}\n`
      : "") +
    (adsData.kpis
      ? `Gasto: $${adsData.kpis.totalSpend} | ROAS: ${adsData.kpis.roas} | CPA: $${adsData.kpis.cpa} | Conversiones: ${adsData.kpis.conversions}\n`
      : "") +
    (adsData.campaign
      ? `Campana: ${adsData.campaign.name} | Objetivo: ${adsData.campaign.objective} | Estado: ${adsData.campaign.status}\n`
      : "") +
    (adsData.action
      ? `Accion: ${adsData.action} | Campanas: ${adsData.campaigns?.length || 0}\n`
      : "");

  appendToVaultFile(`clients/${client}/ads-log.md`, logEntry);
  console.log("Updated ads-log.md");

  // Update learning-log with ads insights
  const learnings = [];
  if (adsData.summary?.mainFinding) {
    learnings.push(`- [${adsData.date}] Ads Audit: ${adsData.summary.mainFinding}`);
  }
  if (adsData.recommendations) {
    for (const rec of adsData.recommendations.slice(0, 3)) {
      learnings.push(`- [${adsData.date}] Ads ${mode}: ${rec}`);
    }
  }

  if (learnings.length > 0) {
    appendToVaultFile(
      `clients/${client}/learning-log.md`,
      `\n### Aprendizajes Ads — ${adsData.date}\n${learnings.join("\n")}\n`
    );
    console.log("Updated learning-log.md with ads learnings");
  }
}

// --- Handle Content Creator integration ---

async function handleContentCreatorRequest(client, adsData) {
  // Check if the output includes a content creator brief (from create or optimize modes)
  const contentBrief = adsData.contentCreatorBrief
    || (adsData.creativesNeeded && adsData.creativesNeeded[0]?.contentCreatorBrief);

  if (!contentBrief) return null;

  console.log("Meta Ads Agent needs a creative from Content Creator...");

  // Always write the brief to vault (as fallback and for traceability)
  const briefFilename = `${getTodayISO()}-meta-ads-${contentBrief.pieceType || "static-ad"}.json`;
  writeVaultFile(
    `clients/${client}/content-briefs/${briefFilename}`,
    JSON.stringify(contentBrief, null, 2)
  );
  console.log(`Wrote content brief to content-briefs/${briefFilename}`);

  // Try to trigger Content Creator via repository_dispatch
  const triggered = await triggerContentCreator(contentBrief);

  return {
    briefFile: briefFilename,
    triggered,
    brief: contentBrief,
  };
}

// --- Main: exported for future use by Consultant Agent ---

export async function runMetaAds(briefInput) {
  const brief = parseBrief(briefInput);
  console.log(
    `Meta Ads Agent — ${brief.mode} for ${brief.client} (source: ${brief.source})`
  );

  // Step 1: Load vault context
  const ctx = loadClientContext(brief.client);

  // Step 2: Build prompt based on mode
  const promptBuilders = {
    audit: buildAuditPrompt,
    create: buildCreatePrompt,
    optimize: buildOptimizePrompt,
    report: buildReportPrompt,
    toggle: buildTogglePrompt,
  };

  const prompt = promptBuilders[brief.mode](ctx, brief);

  // Step 3: Generate analysis
  console.log(`Generating ${brief.mode} analysis...`);
  const maxTokens = brief.mode === "create" ? 10000 : brief.mode === "report" ? 10000 : 8000;
  const output = await callClaude(prompt, maxTokens);
  console.log(`${brief.mode} analysis generated successfully.`);

  // Step 4: Parse structured data
  const adsData = parseMetaAdsData(output);

  // Step 5: Update vault files
  updateVaultWithAdsData(ctx, brief.client, adsData, output, brief.mode);

  // Step 6: Handle Content Creator integration (if creative needed)
  let contentCreatorResult = null;
  if (adsData && (brief.mode === "create" || brief.mode === "optimize")) {
    contentCreatorResult = await handleContentCreatorRequest(brief.client, adsData);
  }

  // Step 7: Write agent report
  writeVaultFile(
    `clients/${brief.client}/agent-reports/meta-ads-${brief.mode}-${getTodayISO()}.json`,
    JSON.stringify(
      {
        agent: "meta-ads",
        mode: brief.mode,
        client: brief.client,
        date: getTodayISO(),
        adsData,
        contentCreatorResult,
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
    audit: "🔍",
    create: "🚀",
    optimize: "⚡",
    report: "📊",
    toggle: "🔄",
  };

  const modeLabel = {
    audit: "Audit",
    create: "Nueva Campana",
    optimize: "Optimizacion",
    report: "Reporte",
    toggle: `Toggle (${brief.toggleAction})`,
  };

  let telegramSummary = `*${modeEmoji[brief.mode]} Meta Ads Agent — ${modeLabel[brief.mode]}*
_${getTodayFormatted()}_

👤 *Cliente:* ${brief.client}
📡 *Solicitado por:* ${sourceLabel}`;

  if (adsData?.summary) {
    telegramSummary += `
📋 *Campanas:* ${adsData.summary.totalCampaigns}
💰 *Gasto:* $${adsData.summary.totalSpend}
📈 *ROAS:* ${adsData.summary.avgRoas}
💡 *Hallazgo:* ${adsData.summary.mainFinding}`;
  }

  if (adsData?.kpis) {
    telegramSummary += `
💰 *Gasto:* $${adsData.kpis.totalSpend}
📈 *ROAS:* ${adsData.kpis.roas}
🎯 *CPA:* $${adsData.kpis.cpa}
🛒 *Conversiones:* ${adsData.kpis.conversions}`;
  }

  if (adsData?.campaign) {
    telegramSummary += `
🏷 *Campana:* ${adsData.campaign.name}
🎯 *Objetivo:* ${adsData.campaign.objective}
📋 *Estado:* ${adsData.campaign.status}`;
  }

  if (contentCreatorResult) {
    telegramSummary += `
🎨 *Creativo solicitado:* ${contentCreatorResult.triggered ? "Content Creator activado" : `Brief guardado: ${contentCreatorResult.briefFile}`}`;
  }

  telegramSummary += `\n\n_vault/clients/${brief.client}/ads-log.md_`;

  await sendTelegram(telegramSummary);

  // Step 9: Return result (for Consultant Agent)
  return {
    mode: brief.mode,
    client: brief.client,
    source: brief.source,
    output,
    adsData,
    contentCreatorResult,
    registeredAt: `vault/clients/${brief.client}/ads-log.md`,
  };
}

// --- CLI entry point ---

async function main() {
  const brief = loadBriefFromArgs();
  const result = await runMetaAds(brief);

  console.log("\n" + "=".repeat(60));
  console.log(`META ADS — ${result.mode.toUpperCase()} — ${result.client}`);
  console.log("=".repeat(60) + "\n");
  console.log(result.output);

  if (result.contentCreatorResult) {
    console.log("\n" + "-".repeat(40));
    console.log("CONTENT CREATOR INTEGRATION:");
    console.log(
      result.contentCreatorResult.triggered
        ? "Content Creator Agent triggered via repository_dispatch"
        : `Brief saved to: vault/clients/${result.client}/content-briefs/${result.contentCreatorResult.briefFile}`
    );
    console.log("-".repeat(40));
  }

  console.log("\n" + "=".repeat(60));
}

main().catch(async (err) => {
  console.error("Meta Ads Agent failed:", err.message);
  try {
    await sendTelegram(
      `*❌ Meta Ads Agent — Error*\n\n\`${err.message}\``
    );
  } catch {
    // Silent fail
  }
  process.exit(1);
});
