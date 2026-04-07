import { readFileSync, writeFileSync, existsSync } from "fs";
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
//   node index.js dmancuello 042                   (shorthand: client + pieceId)
//   node index.js                                  (defaults)

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
    contentPieceId: args[1] || null,
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

function appendToVaultFile(relativePath, content) {
  const filePath = resolve(VAULT, relativePath);
  const existing = existsSync(filePath) ? readFileSync(filePath, "utf-8") : "";
  writeFileSync(filePath, existing + "\n" + content, "utf-8");
}

function writeVaultFile(relativePath, content) {
  const filePath = resolve(VAULT, relativePath);
  writeFileSync(filePath, content, "utf-8");
}

async function callClaude(prompt, maxTokens = 4096) {
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

function getNextPostId(socialLog) {
  if (!socialLog) return "001";
  const matches = socialLog.match(/## Post #(\d+)/g);
  if (!matches || matches.length === 0) return "001";
  const lastNum = Math.max(
    ...matches.map((m) => parseInt(m.replace("## Post #", ""), 10))
  );
  return String(lastNum + 1).padStart(3, "0");
}

// --- Context Loader ---

function loadClientContext(client) {
  console.log(`Loading vault context for client: ${client}`);

  const context = {
    agencyContext: readVaultFile("CLAUDE.md"),
    clientBrand: readVaultFile(`clients/${client}/claude-client.md`),
    strategy: readVaultFile(`clients/${client}/strategy.md`),
    contentCalendar: readVaultFile(`clients/${client}/content-calendar.md`),
    contentLibrary: readVaultFile(`clients/${client}/content-library.md`),
    learningLog: readVaultFile(`clients/${client}/learning-log.md`),
    metricsLog: readVaultFile(`clients/${client}/metrics-log.md`),
    socialMediaLog: readVaultFile(`clients/${client}/social-media-log.md`),
  };

  const loaded = Object.entries(context).filter(([, v]) => v !== null).length;
  const total = Object.keys(context).length;
  console.log(`Vault context loaded: ${loaded}/${total} files found`);

  return context;
}

// --- Content Piece Loader ---

function extractContentPiece(contentLibrary, pieceId) {
  if (!contentLibrary || !pieceId) return null;

  const pattern = new RegExp(
    `## Piece #${pieceId}[\\s\\S]*?(?=\\n## Piece #|$)`
  );
  const match = contentLibrary.match(pattern);
  return match ? match[0] : null;
}

// --- Platform-specific defaults ---

const PLATFORM_CONFIG = {
  instagram: {
    name: "Instagram",
    maxCaption: 2200,
    defaultHashtags: 8,
    features: ["hashtags", "emojis", "line-breaks", "mentions"],
    contentTypes: ["reel", "static-ad", "carousel", "story"],
    toneHint: "Visual, aspiracional, emojis moderados, hashtags estrategicos",
  },
  tiktok: {
    name: "TikTok",
    maxCaption: 4000,
    defaultHashtags: 5,
    features: ["hashtags", "trending-sounds", "direct-address"],
    contentTypes: ["reel", "story"],
    toneHint: "Directo, conversacional, trending, menos formal que IG",
  },
  linkedin: {
    name: "LinkedIn",
    maxCaption: 3000,
    defaultHashtags: 5,
    features: ["professional-tone", "storytelling", "line-breaks", "emojis-minimal"],
    contentTypes: ["static-ad", "carousel", "text-post"],
    toneHint: "Profesional pero cercano, storytelling, valor concreto, sin emojis excesivos",
  },
  facebook: {
    name: "Facebook",
    maxCaption: 63206,
    defaultHashtags: 3,
    features: ["emojis", "questions", "engagement-hooks"],
    contentTypes: ["reel", "static-ad", "carousel", "text-post"],
    toneHint: "Cercano, comunitario, invita a comentar, hashtags minimos",
  },
  twitter: {
    name: "Twitter / X",
    maxCaption: 280,
    defaultHashtags: 2,
    features: ["concise", "thread-potential", "hooks", "trending"],
    contentTypes: ["static-ad", "text-post", "reel"],
    toneHint: "Ultra conciso, impactante, hook en la primera linea, max 280 chars",
  },
};

// --- Prompt Builder ---

function buildPrompt(ctx, brief, contentPiece) {
  const platformsList = brief.platforms
    .map((p) => {
      const cfg = PLATFORM_CONFIG[p];
      return `### ${cfg.name}
- Max caption: ${cfg.maxCaption} chars
- Hashtags: max ${brief.maxHashtags || cfg.defaultHashtags}
- Tono: ${cfg.toneHint}
- Features: ${cfg.features.join(", ")}`;
    })
    .join("\n\n");

  const directives = [];
  if (brief.tone) directives.push(`TONO OVERRIDE: ${brief.tone}`);
  if (brief.angle) directives.push(`ANGULO/TEMA: ${brief.angle}`);
  if (brief.cta) directives.push(`CTA ESPECIFICO: ${brief.cta}`);
  if (brief.instructions) directives.push(`INSTRUCCIONES: ${brief.instructions}`);

  const directivesBlock =
    directives.length > 0
      ? `--- DIRECCION DEL POST ---\n${directives.join("\n")}`
      : "--- DIRECCION DEL POST ---\nSin directivas especificas. Adapta segun contexto de marca.";

  let contentBlock = "";
  if (contentPiece) {
    contentBlock = `--- CONTENIDO APROBADO (de content-library.md) ---
${contentPiece}`;
  } else if (brief.contentText) {
    contentBlock = `--- CONTENIDO A PUBLICAR ---
${brief.contentText}`;
  } else {
    contentBlock = `--- CONTENIDO ---
No se proporciono contenido especifico. Genera captions originales basados en el contexto de marca y la estrategia activa.`;
  }

  let schedulingBlock = "";
  if (brief.scheduledDate) {
    schedulingBlock = `--- PROGRAMACION ---
Fecha: ${brief.scheduledDate}
Hora: ${brief.scheduledTime || "a determinar por el agente"}`;
  } else if (brief.autoSchedule) {
    schedulingBlock = `--- PROGRAMACION ---
Seleccionar horario optimo basado en las metricas historicas del cliente.`;
  }

  let examplesBlock = "";
  if (brief.examples && brief.examples.length > 0) {
    examplesBlock = `--- EJEMPLOS DE REFERENCIA ---
${brief.examples
  .map(
    (ex, i) =>
      `Ejemplo ${i + 1} [${ex.platform}]: ${ex.url}\nNotas: ${ex.notes || "Usar como referencia general"}`
  )
  .join("\n\n")}`;
  }

  return `Eres el Social Media Agent de D&C Scale Partners.

Tu trabajo es tomar contenido aprobado y adaptarlo para CADA plataforma de redes sociales, generando captions optimizados, hashtags estrategicos, y recomendaciones de publicacion.

NO generas el contenido creativo (eso lo hace el Content Creator Agent). Tu adaptas, optimizas, y publicas.

CLIENTE: ${brief.client}
TIPO DE CONTENIDO: ${brief.contentType}
FECHA: ${getTodayFormatted()}
SOLICITADO POR: ${brief.source}
PLATAFORMAS: ${brief.platforms.map((p) => PLATFORM_CONFIG[p].name).join(", ")}

${directivesBlock}

${contentBlock}

--- CONTEXTO DE LA AGENCIA ---
${ctx.agencyContext || "Sin contexto de agencia."}

--- MARCA DEL CLIENTE ---
${ctx.clientBrand || "Sin contexto de marca. Usa buenas practicas genericas."}

--- ESTRATEGIA ACTIVA ---
${ctx.strategy || "Sin estrategia definida."}

--- APRENDIZAJES DE REDES ---
${ctx.learningLog || "Sin aprendizajes registrados."}

--- METRICAS HISTORICAS ---
${ctx.metricsLog || "Sin metricas disponibles."}

--- HISTORIAL DE PUBLICACIONES ---
${ctx.socialMediaLog || "Sin publicaciones previas registradas."}

${examplesBlock}

${schedulingBlock}

--- PLATAFORMAS Y REQUISITOS ---
${platformsList}

---

REGLAS DE PUBLICACION:
1. Cada plataforma tiene su propio caption — NUNCA copiar y pegar entre plataformas
2. Instagram: caption aspiracional + hashtags estrategicos (no genericos)
3. TikTok: directo, conversacional, trending, sin hashtags corporativos
4. LinkedIn: profesional, storytelling, valor de negocio, sin emojis excesivos
5. Facebook: cercano, invita a interaccion, pregunta al final
6. Twitter: impacto en 280 chars, hook brutal en la primera linea
7. Mantener la VOZ DE MARCA del cliente en todas las plataformas
8. Adaptar el CTA segun la plataforma (link in bio para IG, link directo para LinkedIn/Twitter, etc.)
9. Incluir horario optimo de publicacion para cada plataforma (basado en metricas o best practices)
10. Si hay contenido aprobado, extraer el mensaje central y adaptarlo — no inventar mensajes nuevos

---

GENERA LO SIGUIENTE (formato Markdown):

## Resumen de publicacion
- Contenido base (de donde viene)
- Plataformas destino
- Tipo de contenido
- Mensaje central identificado

${brief.platforms.map((p) => `## ${PLATFORM_CONFIG[p].name}

### Caption
(Caption completo listo para copiar y publicar)

### Hashtags
(Lista de hashtags optimizados para esta plataforma)

### Horario recomendado
(Dia y hora optimos, con razon)

### Notas de publicacion
(Instrucciones especificas: aspect ratio, primera imagen del carousel, sticker de encuesta si aplica, etc.)
`).join("\n")}

## Calendario de publicacion sugerido
Tabla con plataforma, fecha, hora, y estado.

## Notas para el Consultant Agent
Observaciones estrategicas: que testear, que metricas monitorear, cuando evaluar resultados.

---PUBLISH_DATA_JSON---

Despues del separador, genera un JSON con esta estructura exacta (para uso programatico):
\`\`\`json
{
  "client": "${brief.client}",
  "contentType": "${brief.contentType}",
  "contentPieceId": ${brief.contentPieceId ? `"${brief.contentPieceId}"` : "null"},
  "platforms": {
    ${brief.platforms.map((p) => `"${p}": {
      "caption": "caption completo",
      "hashtags": ["tag1", "tag2"],
      "suggestedTime": "HH:MM UTC",
      "suggestedDate": "${brief.scheduledDate || getTodayISO()}",
      "notes": "notas de publicacion"
    }`).join(",\n    ")}
  }
}
\`\`\`

Se estrategico, especifico al cliente, y diferenciado por plataforma.`;
}

// --- Social Media Log Entry ---

function buildLogEntry(postId, brief, output, publishData) {
  const platformsList = brief.platforms
    .map((p) => PLATFORM_CONFIG[p].name)
    .join(", ");

  return `
## Post #${postId} — ${brief.contentType}
Date: ${getTodayISO()} | Source: ${brief.source} | Status: ${brief.autoPublish ? "SCHEDULED" : "PENDING_APPROVAL"}
Content Type: ${brief.contentType}
Client: ${brief.client}
Platforms: ${platformsList}
${brief.contentPieceId ? `Content Piece: #${brief.contentPieceId}` : "Content: custom"}

### Adapted Content
${output}

### Publication Status
${brief.platforms
  .map(
    (p) =>
      `- [ ] ${PLATFORM_CONFIG[p].name}: ${brief.autoPublish ? "SCHEDULED" : "PENDING"}`
  )
  .join("\n")}

### Metrics (fill when available)
${brief.platforms
  .map(
    (p) =>
      `#### ${PLATFORM_CONFIG[p].name}
Reach: PENDING
Impressions: PENDING
Engagement: PENDING
Clicks: PENDING
Saves: PENDING
Shares: PENDING
Comments: PENDING`
  )
  .join("\n\n")}

### Auto-evaluation
Status: PENDING
Decision: PENDING
Learning: PENDING
`;
}

// --- Parse publish data JSON from output ---

function parsePublishData(output) {
  const separator = "---PUBLISH_DATA_JSON---";
  const idx = output.indexOf(separator);
  if (idx === -1) return null;

  const jsonPart = output.slice(idx + separator.length);
  const jsonMatch = jsonPart.match(/```json\s*([\s\S]*?)\s*```/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[1]);
  } catch {
    console.warn("Warning: could not parse publish data JSON");
    return null;
  }
}

// --- Main: exported for future use by Consultant Agent ---

export async function publishContent(briefInput) {
  const brief = parseBrief(briefInput);
  console.log(
    `Social Media Agent — ${brief.contentType} for ${brief.client} on ${brief.platforms.join(", ")} (source: ${brief.source})`
  );

  // Step 1: Load vault context
  const ctx = loadClientContext(brief.client);

  // Step 2: Load content piece if referenced
  let contentPiece = null;
  if (brief.contentPieceId) {
    contentPiece = extractContentPiece(
      ctx.contentLibrary,
      brief.contentPieceId
    );
    if (contentPiece) {
      console.log(`Loaded content piece #${brief.contentPieceId}`);
    } else {
      console.warn(
        `Warning: content piece #${brief.contentPieceId} not found in content-library.md`
      );
    }
  }

  // Step 3: Generate platform-adapted content
  console.log("Generating platform-adapted captions...");
  const prompt = buildPrompt(ctx, brief, contentPiece);
  const output = await callClaude(prompt, 6000);
  console.log("Captions generated successfully.");

  // Step 4: Parse structured publish data
  const publishData = parsePublishData(output);

  // Step 5: Register in social-media-log.md
  const postId = getNextPostId(ctx.socialMediaLog);
  const entry = buildLogEntry(postId, brief, output, publishData);
  appendToVaultFile(`clients/${brief.client}/social-media-log.md`, entry);
  console.log(`Registered as Post #${postId} in social-media-log.md`);

  // Step 6: Write individual publish files (for Blotato MCP integration)
  if (publishData && publishData.platforms) {
    for (const [platform, data] of Object.entries(publishData.platforms)) {
      const publishFile = {
        postId,
        client: brief.client,
        platform,
        contentType: brief.contentType,
        caption: data.caption,
        hashtags: data.hashtags,
        suggestedDate: data.suggestedDate,
        suggestedTime: data.suggestedTime,
        mediaPath: brief.mediaPath || null,
        mediaUrl: brief.mediaUrl || null,
        autoPublish: brief.autoPublish,
        notes: data.notes,
      };

      writeVaultFile(
        `clients/${brief.client}/social-media-queue/${getTodayISO()}-${platform}-${postId}.json`,
        JSON.stringify(publishFile, null, 2)
      );
    }
    console.log(
      `Wrote ${Object.keys(publishData.platforms).length} publish queue file(s)`
    );
  }

  // Step 7: Notify via Telegram
  const sourceLabel =
    {
      cli: "CLI manual",
      "consultant-agent": "Agente Consultor",
      dashboard: "Dashboard",
      "content-creator-agent": "Content Creator",
    }[brief.source] || brief.source;

  await sendTelegram(
    `*📱 Social Media Agent — Post #${postId}*
_${getTodayFormatted()}_

📋 *Tipo:* ${brief.contentType}
👤 *Cliente:* ${brief.client}
📡 *Solicitado por:* ${sourceLabel}
🌐 *Plataformas:* ${brief.platforms.map((p) => PLATFORM_CONFIG[p].name).join(", ")}
${brief.contentPieceId ? `🔗 *Pieza base:* #${brief.contentPieceId}` : ""}
📝 *Estado:* ${brief.autoPublish ? "SCHEDULED" : "PENDING_APPROVAL — revisar y aprobar"}

_vault/clients/${brief.client}/social-media-log.md_`
  );

  // Step 8: Generate report for Consultant Agent
  const report = {
    agent: "social-media",
    postId,
    client: brief.client,
    contentType: brief.contentType,
    platforms: brief.platforms,
    contentPieceId: brief.contentPieceId,
    status: brief.autoPublish ? "scheduled" : "pending_approval",
    publishData,
    registeredAt: `vault/clients/${brief.client}/social-media-log.md`,
    queueFiles: publishData
      ? Object.keys(publishData.platforms).map(
          (p) =>
            `vault/clients/${brief.client}/social-media-queue/${getTodayISO()}-${p}-${postId}.json`
        )
      : [],
    timestamp: new Date().toISOString(),
  };

  writeVaultFile(
    `clients/${brief.client}/agent-reports/social-media-${getTodayISO()}-${postId}.json`,
    JSON.stringify(report, null, 2)
  );

  // Step 9: Return result (for programmatic use by Consultant Agent)
  return {
    postId,
    client: brief.client,
    contentType: brief.contentType,
    platforms: brief.platforms,
    source: brief.source,
    status: brief.autoPublish ? "scheduled" : "pending_approval",
    output,
    publishData,
    registeredAt: `vault/clients/${brief.client}/social-media-log.md`,
  };
}

// --- CLI entry point ---

async function main() {
  const brief = loadBriefFromArgs();
  const result = await publishContent(brief);

  console.log("\n" + "=".repeat(60));
  console.log(`POST #${result.postId} — ${result.contentType.toUpperCase()}`);
  console.log(`Platforms: ${result.platforms.join(", ")}`);
  console.log(`Status: ${result.status}`);
  console.log("=".repeat(60) + "\n");
  console.log(result.output);
  console.log("\n" + "=".repeat(60));
}

main().catch(async (err) => {
  console.error("Social Media Agent failed:", err.message);
  try {
    await sendTelegram(
      `*❌ Social Media Agent — Error*\n\n\`${err.message}\``
    );
  } catch {
    // Silent fail
  }
  process.exit(1);
});
