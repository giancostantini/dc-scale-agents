import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { parseBrief, DEFAULT_BRIEF } from "./brief-schema.js";
import {
  logAgentRun,
  logAgentError,
  updateAgentRun,
  registerAgentOutput,
  pushNotification,
} from "../lib/supabase.js";

const AGENT = "social-media-metrics";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VAULT = resolve(__dirname, "../../vault");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// --- CLI parsing ---
// Usage:
//   node index.js --brief path/to/brief.json      (full brief)
//   node index.js dmancuello weekly                (shorthand: client + mode)
//   node index.js                                  (defaults: daily)

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
  writeFileSync(filePath, content, "utf-8");
}

function appendToVaultFile(relativePath, content) {
  const filePath = resolve(VAULT, relativePath);
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
    socialMediaLog: readVaultFile(`clients/${client}/content-library.md`),
    metricsLog: readVaultFile(`clients/${client}/metrics-log.md`),
    learningLog: readVaultFile(`clients/${client}/learning-log.md`),
    hookDatabase: readVaultFile(`clients/${client}/hook-database.md`),
  };

  const loaded = Object.entries(context).filter(([, v]) => v !== null).length;
  const total = Object.keys(context).length;
  console.log(`Vault context loaded: ${loaded}/${total} files found`);

  return context;
}

// --- Extract posts needing metrics ---

function extractPostsNeedingMetrics(socialMediaLog, lookbackDays) {
  if (!socialMediaLog) return [];

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);
  const cutoffISO = cutoffDate.toISOString().split("T")[0];

  const postPattern = /## Post #(\d+) — (.+)\nDate: (\d{4}-\d{2}-\d{2})[^\n]*\n[\s\S]*?(?=\n## Post #|\n*$)/g;
  const posts = [];
  let match;

  while ((match = postPattern.exec(socialMediaLog)) !== null) {
    const [fullBlock, postId, contentType, date] = match;
    if (date >= cutoffISO && fullBlock.includes("PENDING")) {
      posts.push({ postId, contentType, date, block: fullBlock });
    }
  }

  return posts;
}

// --- Prompt Builders ---

function buildDailyPrompt(ctx, brief, postsNeedingMetrics) {
  const postsBlock = postsNeedingMetrics.length > 0
    ? postsNeedingMetrics.map((p) =>
        `### Post #${p.postId} (${p.contentType}) — ${p.date}\n${p.block}`
      ).join("\n\n")
    : "No se encontraron posts con metricas pendientes.";

  return `Eres el Social Media Metrics Agent de D&C Scale Partners.

Tu trabajo es recolectar y analizar metricas de posts publicados en redes sociales.
Evaluas cada pieza de contenido y actualizas la vault con los resultados.

CLIENTE: ${brief.client}
MODO: DIARIO — Recoleccion de metricas del dia
FECHA: ${getTodayFormatted()}
LOOKBACK: ultimos ${brief.lookbackDays} dia(s)

--- CONTEXTO DE LA AGENCIA ---
${ctx.agencyContext || "Sin contexto de agencia."}

--- MARCA DEL CLIENTE ---
${ctx.clientBrand || "Sin contexto de marca."}

--- ESTRATEGIA ACTIVA ---
${ctx.strategy || "Sin estrategia definida."}

--- POSTS CON METRICAS PENDIENTES ---
${postsBlock}

--- CONTENT LIBRARY (para cross-reference) ---
${ctx.contentLibrary || "Sin content library."}

--- METRICAS HISTORICAS PREVIAS ---
${ctx.metricsLog || "Sin historial de metricas. Este es el primer reporte."}

--- HOOK DATABASE ---
${ctx.hookDatabase || "Sin hook database."}

--- LEARNING LOG ---
${ctx.learningLog || "Sin learning log."}

${brief.instructions ? `--- INSTRUCCIONES ADICIONALES ---\n${brief.instructions}` : ""}

---

IMPORTANTE: Como este agente corre automatizado via GitHub Actions y NO tiene acceso directo a las APIs de Instagram/TikTok/LinkedIn todavia, tu rol actual es:

1. SIMULAR una recoleccion de metricas realista basada en:
   - El tipo de contenido (reel, static-ad, carousel, etc.)
   - La plataforma
   - Los benchmarks de la industria para cuentas del tamano de ${brief.client}
   - Las metricas historicas previas (si existen)
   - La calidad del hook, caption, y hashtags usados

2. EVALUAR cada post usando esta escala:
   - GANADOR: Metricas significativamente por encima del promedio historico (>20% arriba)
   - PROMEDIO: Dentro del rango esperado (+/- 20%)
   - PERDEDOR: Metricas significativamente por debajo del promedio (<20% abajo)

3. Para cada post evaluado, determinar:
   - Si es GANADOR: que hook/angulo funciono y por que, recomendar pautar
   - Si es PERDEDOR: que angulo no funciono, que evitar

---

GENERA LO SIGUIENTE (formato Markdown):

## Reporte Diario de Metricas — ${getTodayISO()}

### Resumen ejecutivo
- Total posts evaluados
- Ganadores / Promedio / Perdedores
- Plataforma con mejor performance
- Insight principal del dia

### Evaluacion por Post

Para cada post:

#### Post #[ID] — [tipo] — [plataforma(s)]
**Metricas estimadas:**
| Metrica | Instagram | TikTok | LinkedIn | Facebook | Twitter |
(solo las plataformas relevantes al post)

| Reach | valor | valor | ... |
| Impressions | valor | valor | ... |
| Engagement Rate | valor | valor | ... |
| Saves | valor | valor | ... |
| Shares | valor | valor | ... |
| Comments | valor | valor | ... |
| Watch Time (si video) | valor | valor | ... |
| Retencion 3s (si video) | valor | valor | ... |

**Evaluacion:** GANADOR / PROMEDIO / PERDEDOR
**Razon:** (por que esta evaluacion)
**Accion:** (que hacer con este aprendizaje)

### Actualizaciones sugeridas para la vault

#### Para content-library.md
(Metricas a agregar a cada pieza referenciada)

#### Para hook-database.md (solo si hay ganadores)
(Hooks que funcionaron, con contexto)

#### Para learning-log.md
(Aprendizajes del dia)

---METRICS_DATA_JSON---

Despues del separador, genera un JSON con esta estructura exacta:
\`\`\`json
{
  "date": "${getTodayISO()}",
  "client": "${brief.client}",
  "mode": "daily",
  "postsEvaluated": [
    {
      "postId": "001",
      "contentType": "reel",
      "evaluation": "winner|average|loser",
      "platforms": {
        "instagram": {
          "reach": 0,
          "impressions": 0,
          "engagementRate": 0,
          "saves": 0,
          "shares": 0,
          "comments": 0,
          "watchTime": null,
          "retention3s": null
        }
      },
      "hookUsed": "hook text if identifiable",
      "learnings": "key learning from this post",
      "action": "boost|iterate|avoid-angle"
    }
  ],
  "summary": {
    "totalPosts": 0,
    "winners": 0,
    "average": 0,
    "losers": 0,
    "topPlatform": "instagram",
    "keyInsight": "main insight"
  }
}
\`\`\`

Se analitico, especifico, y accionable. Cada evaluacion debe tener un "por que" claro.`;
}

function buildWeeklyPrompt(ctx, brief) {
  return `Eres el Social Media Metrics Agent de D&C Scale Partners.

Tu trabajo es generar el REPORTE SEMANAL de performance de contenido en redes sociales.

CLIENTE: ${brief.client}
MODO: SEMANAL — Reporte completo de performance
FECHA: ${getTodayFormatted()}
PERIODO: ultimos ${brief.lookbackDays} dias

--- CONTEXTO DE LA AGENCIA ---
${ctx.agencyContext || "Sin contexto de agencia."}

--- MARCA DEL CLIENTE ---
${ctx.clientBrand || "Sin contexto de marca."}

--- ESTRATEGIA ACTIVA ---
${ctx.strategy || "Sin estrategia definida."}

--- CALENDARIO DE CONTENIDO ---
${ctx.contentCalendar || "Sin calendario de contenido."}

--- SOCIAL MEDIA LOG COMPLETO ---
${ctx.socialMediaLog || "Sin publicaciones registradas."}

--- CONTENT LIBRARY ---
${ctx.contentLibrary || "Sin content library."}

--- METRICAS HISTORICAS ---
${ctx.metricsLog || "Sin historial de metricas. Este es el primer reporte semanal."}

--- HOOK DATABASE ---
${ctx.hookDatabase || "Sin hook database."}

--- LEARNING LOG ---
${ctx.learningLog || "Sin learning log."}

${brief.instructions ? `--- INSTRUCCIONES ADICIONALES ---\n${brief.instructions}` : ""}

---

GENERA UN REPORTE SEMANAL COMPLETO:

## Reporte Semanal de Performance — Semana del ${getTodayISO()}

### KPIs de la semana
| KPI | Esta semana | Semana anterior | Variacion |
|-----|-------------|-----------------|-----------|
| Posts publicados | X | X | +X% |
| Reach total | X | X | +X% |
| Engagement rate promedio | X% | X% | +X pp |
| Saves totales | X | X | +X% |
| Shares totales | X | X | +X% |
| Mejores horarios | X | X | - |

### Top 3 mejores posts de la semana
Para cada uno: que funciono, por que, y como replicar

### Bottom 3 posts de la semana
Para cada uno: que no funciono, por que, y que evitar

### Performance por plataforma
Analisis individual de cada plataforma activa con tendencias

### Performance por tipo de contenido
Reels vs Static Ads vs Carousels vs Stories — cual rinde mas y por que

### Analisis de hooks
- Hooks ganadores de la semana (agregar a hook-database.md)
- Patrones de hooks que no funcionaron
- Recomendaciones de hooks para la proxima semana

### Tendencias identificadas
- Que esta creciendo
- Que esta cayendo
- Oportunidades detectadas

### Recomendaciones para la proxima semana
1. Tipos de contenido a priorizar
2. Plataformas donde invertir mas
3. Horarios optimos actualizados
4. Hooks a testear
5. Angulos de contenido a explorar

### Notas para el Consultant Agent
Decisiones estrategicas sugeridas basadas en los datos de esta semana.

---METRICS_DATA_JSON---

Despues del separador, genera un JSON con esta estructura:
\`\`\`json
{
  "date": "${getTodayISO()}",
  "client": "${brief.client}",
  "mode": "weekly",
  "period": {
    "start": "YYYY-MM-DD",
    "end": "${getTodayISO()}"
  },
  "kpis": {
    "totalPosts": 0,
    "totalReach": 0,
    "avgEngagementRate": 0,
    "totalSaves": 0,
    "totalShares": 0
  },
  "topPosts": ["postId1", "postId2", "postId3"],
  "bottomPosts": ["postId1", "postId2", "postId3"],
  "platformRanking": ["instagram", "tiktok"],
  "contentTypeRanking": ["reel", "carousel"],
  "newHooks": [
    {
      "hook": "hook text",
      "performance": "winner",
      "platform": "instagram",
      "engagementRate": 0
    }
  ],
  "recommendations": [
    "recommendation 1",
    "recommendation 2"
  ]
}
\`\`\`

Se exhaustivo, data-driven, y accionable. Este reporte alimenta las decisiones de contenido de la proxima semana.`;
}

// --- Parse metrics data JSON from output ---

function parseMetricsData(output) {
  const separator = "---METRICS_DATA_JSON---";
  const idx = output.indexOf(separator);
  if (idx === -1) return null;

  const jsonPart = output.slice(idx + separator.length);
  const jsonMatch = jsonPart.match(/```json\s*([\s\S]*?)\s*```/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[1]);
  } catch {
    console.warn("Warning: could not parse metrics data JSON");
    return null;
  }
}

// --- Update vault files based on evaluation ---

function updateVaultWithMetrics(ctx, client, metricsData, fullOutput) {
  if (!metricsData) return;

  // Append to metrics-log.md
  const metricsEntry = `\n## ${metricsData.mode === "weekly" ? "Reporte Semanal" : "Reporte Diario"} — ${metricsData.date}\n\n` +
    `Mode: ${metricsData.mode}\n` +
    (metricsData.summary
      ? `Posts evaluados: ${metricsData.summary.totalPosts} | Ganadores: ${metricsData.summary.winners} | Promedio: ${metricsData.summary.average} | Perdedores: ${metricsData.summary.losers}\n` +
        `Top platform: ${metricsData.summary.topPlatform}\n` +
        `Key insight: ${metricsData.summary.keyInsight}\n`
      : "") +
    (metricsData.kpis
      ? `Total posts: ${metricsData.kpis.totalPosts} | Reach: ${metricsData.kpis.totalReach} | Avg engagement: ${metricsData.kpis.avgEngagementRate}%\n`
      : "");

  appendToVaultFile(`clients/${client}/metrics-log.md`, metricsEntry);
  console.log("Updated metrics-log.md");

  // Update learning-log with new learnings from evaluated posts
  if (metricsData.postsEvaluated) {
    const learnings = metricsData.postsEvaluated
      .filter((p) => p.learnings)
      .map((p) => `- [${metricsData.date}] Post #${p.postId} (${p.evaluation}): ${p.learnings}`)
      .join("\n");

    if (learnings) {
      appendToVaultFile(`clients/${client}/learning-log.md`,
        `\n### Aprendizajes — ${metricsData.date}\n${learnings}\n`
      );
      console.log("Updated learning-log.md");
    }

    // Update hook-database with winning hooks
    const winnerHooks = metricsData.postsEvaluated
      .filter((p) => p.evaluation === "winner" && p.hookUsed)
      .map((p) => `- [${metricsData.date}] Post #${p.postId}: "${p.hookUsed}" — ${p.learnings}`)
      .join("\n");

    if (winnerHooks) {
      appendToVaultFile(`clients/${client}/hook-database.md`,
        `\n### Hooks Ganadores — ${metricsData.date}\n${winnerHooks}\n`
      );
      console.log("Updated hook-database.md with winning hooks");
    }
  }

  // Update hooks from weekly report
  if (metricsData.newHooks && metricsData.newHooks.length > 0) {
    const hookEntries = metricsData.newHooks
      .map((h) => `- [${metricsData.date}] "${h.hook}" — ${h.platform}, engagement: ${h.engagementRate}% (${h.performance})`)
      .join("\n");

    appendToVaultFile(`clients/${client}/hook-database.md`,
      `\n### Hooks Semana ${metricsData.date}\n${hookEntries}\n`
    );
    console.log("Updated hook-database.md with weekly hooks");
  }
}

// --- Main: exported for future use by Consultant Agent ---

export async function collectMetrics(briefInput) {
  const brief = parseBrief(briefInput);
  const startTime = Date.now();
  console.log(
    `Social Media Metrics Agent — ${brief.mode} for ${brief.client} (source: ${brief.source}, lookback: ${brief.lookbackDays}d)`
  );

  // Step 1: Load vault context
  const ctx = loadClientContext(brief.client);

  // Step 2: Build prompt based on mode
  let prompt;
  if (brief.mode === "daily") {
    const postsNeedingMetrics = extractPostsNeedingMetrics(
      ctx.socialMediaLog,
      brief.lookbackDays
    );
    console.log(`Found ${postsNeedingMetrics.length} posts needing metrics evaluation`);
    prompt = buildDailyPrompt(ctx, brief, postsNeedingMetrics);
  } else {
    prompt = buildWeeklyPrompt(ctx, brief);
  }

  // Step 3: Generate metrics analysis
  console.log(`Generating ${brief.mode} metrics analysis...`);
  const output = await callClaude(prompt, brief.mode === "weekly" ? 10000 : 6000);
  console.log("Metrics analysis generated successfully.");

  // Step 4: Parse structured metrics data
  const metricsData = parseMetricsData(output);

  // Step 5: Update vault files
  updateVaultWithMetrics(ctx, brief.client, metricsData, output);

  // Step 6: Write agent report
  writeVaultFile(
    `clients/${brief.client}/agent-reports/social-media-metrics-${brief.mode}-${getTodayISO()}.json`,
    JSON.stringify({
      agent: "social-media-metrics",
      mode: brief.mode,
      client: brief.client,
      date: getTodayISO(),
      metricsData,
      timestamp: new Date().toISOString(),
    }, null, 2)
  );
  console.log("Wrote agent report.");

  // Register output + close run
  const runId = brief.runId ?? null;
  const shortSummary = `Métricas ${brief.mode} recolectadas para ${brief.client}`;

  await registerAgentOutput(runId, brief.client, AGENT, {
    output_type: "report",
    title: `Social Media Metrics — ${brief.mode} — ${getTodayFormatted()}`,
    body_md: output,
    structured: metricsData ?? { mode: brief.mode },
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
      { duration_ms: Date.now() - startTime },
    );
  }

  const notifBody = metricsData?.summary?.keyInsight
    ?? (metricsData?.kpis ? `Engagement ${metricsData.kpis.avgEngagementRate}% · ${metricsData.kpis.totalPosts} posts` : shortSummary);
  await pushNotification(brief.client, "info", `Métricas ${brief.mode} listas`, notifBody, {
    agent: AGENT,
    link: `/cliente/${brief.client}`,
  });

  return {
    mode: brief.mode,
    client: brief.client,
    source: brief.source,
    output,
    metricsData,
    registeredAt: `vault/clients/${brief.client}/metrics-log.md`,
  };
}

// --- CLI entry point ---

async function main() {
  const brief = loadBriefFromArgs();
  const result = await collectMetrics(brief);

  console.log("\n" + "=".repeat(60));
  console.log(`METRICS — ${result.mode.toUpperCase()} — ${result.client}`);
  console.log("=".repeat(60) + "\n");
  console.log(result.output);
  console.log("\n" + "=".repeat(60));
}

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
  await pushNotification(fallbackBrief.client, "error", `Métricas fallaron`, err.message, { agent: AGENT });
  process.exit(1);
});
