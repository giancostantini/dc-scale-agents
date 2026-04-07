import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
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
//   node index.js dmancuello reel                  (shorthand)
//   node index.js                                  (defaults)

function loadBriefFromArgs() {
  const args = process.argv.slice(2);

  // Full brief mode
  const briefFlagIdx = args.indexOf("--brief");
  if (briefFlagIdx !== -1 && args[briefFlagIdx + 1]) {
    const briefPath = resolve(process.cwd(), args[briefFlagIdx + 1]);
    const raw = JSON.parse(readFileSync(briefPath, "utf-8"));
    return parseBrief({ ...raw, source: raw.source || "cli" });
  }

  // Shorthand mode
  return parseBrief({
    client: args[0] || DEFAULT_BRIEF.client,
    pieceType: args[1] || DEFAULT_BRIEF.pieceType,
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

function getNextPieceId(contentLibrary) {
  if (!contentLibrary) return "001";
  const matches = contentLibrary.match(/## Piece #(\d+)/g);
  if (!matches || matches.length === 0) return "001";
  const lastNum = Math.max(
    ...matches.map((m) => parseInt(m.replace("## Piece #", ""), 10))
  );
  return String(lastNum + 1).padStart(3, "0");
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
    contentCalendar: readVaultFile(`clients/${client}/content-calendar.md`),
    hookDatabase: readVaultFile("agents/content-creator/hook-database.md"),
    winningFormats: readVaultFile("agents/content-creator/winning-formats.md"),
    learningLog: readVaultFile(`clients/${client}/learning-log.md`),
    adsLibrary: readVaultFile(`clients/${client}/ads-library.md`),
    contentLibrary: readVaultFile(`clients/${client}/content-library.md`),
  };

  const loaded = Object.entries(context).filter(([, v]) => v !== null).length;
  const total = Object.keys(context).length;
  console.log(`Vault context loaded: ${loaded}/${total} files found`);

  return context;
}

// --- Reference Examples Loader ---

function loadExampleReferences(client, brief) {
  const refs = [];

  // 1. Examples from the brief (sent by Consultant Agent or dashboard)
  if (brief.examples && brief.examples.length > 0) {
    for (const ex of brief.examples) {
      refs.push({
        type: ex.type,
        source: ex.url || ex.filePath || "unknown",
        notes: ex.notes || "Use as general reference",
      });
    }
  }

  // 2. Examples from the client's references directory in vault
  const refsDir = resolve(VAULT, `clients/${client}/references`);
  if (existsSync(refsDir)) {
    try {
      const files = readdirSync(refsDir);
      const indexFile = files.find((f) => f === "references.md");
      if (indexFile) {
        const indexContent = readVaultFile(
          `clients/${client}/references/references.md`
        );
        if (indexContent) {
          refs.push({
            type: "index",
            source: "vault references catalog",
            notes: indexContent,
          });
        }
      }
    } catch {
      // No references directory, that's fine
    }
  }

  return refs;
}

// --- Prompt Builder ---

function buildPrompt(ctx, brief, examples) {
  const pieceTypeDescriptions = {
    reel: "Reel/TikTok de video corto (15-60 segundos)",
    "static-ad": "Static Ad — desglose de producto para TOF/conversion directa",
    "social-review":
      "Social Review — prueba social para MOF/audiencias tibias",
    "headline-ad": "Headline Ad — retargeting para BOF/cerrar indecisos",
    "collage-ad": "Collage Ad — estilo UGC para TOF/feed organico",
    carousel: "Carousel — secuencia de imagenes para educacion o producto",
  };

  // Build creative direction section from brief
  const directives = [];
  if (brief.objective) directives.push(`OBJETIVO: ${brief.objective}`);
  if (brief.scriptFormat)
    directives.push(`FORMATO DE SCRIPT: usar "${brief.scriptFormat}"`);
  if (brief.emotionalTrigger)
    directives.push(`TRIGGER EMOCIONAL: usar "${brief.emotionalTrigger}"`);
  if (brief.hookStyle)
    directives.push(`ESTILO DE HOOK: ${brief.hookStyle}`);
  if (brief.tone) directives.push(`TONO: ${brief.tone}`);
  if (brief.angle) directives.push(`ANGULO/TEMA: ${brief.angle}`);
  if (brief.targetAudience)
    directives.push(`AUDIENCIA OBJETIVO: ${brief.targetAudience}`);
  if (brief.cta) directives.push(`CTA ESPECIFICO: ${brief.cta}`);
  if (brief.instructions)
    directives.push(`INSTRUCCIONES ADICIONALES: ${brief.instructions}`);

  const directivesBlock =
    directives.length > 0
      ? `--- DIRECCION CREATIVA (del ${brief.source === "consultant-agent" ? "Agente Consultor" : brief.source === "dashboard" ? "dueno del negocio" : "operador"}) ---\n${directives.join("\n")}`
      : "--- DIRECCION CREATIVA ---\nSin directivas especificas. Usa tu mejor criterio basado en el contexto del cliente.";

  // Build examples section
  let examplesBlock = "";
  if (examples.length > 0) {
    examplesBlock = `--- EJEMPLOS DE REFERENCIA ---
Usa estos ejemplos como inspiracion. Analiza que funciona en ellos y aplica esos principios.
${examples
  .map(
    (ex, i) =>
      `\nEjemplo ${i + 1} [${ex.type}]: ${ex.source}\nNotas: ${ex.notes}`
  )
  .join("\n")}`;
  }

  // Build voice section for video types
  let voiceBlock = "";
  if (
    brief.pieceType === "reel" &&
    brief.voice
  ) {
    voiceBlock = `--- CONFIGURACION DE VOZ ---
Estilo: ${brief.voice.style || "narration"}
Idioma: ${brief.voice.language || "es"}
Nota: generar el texto de narracion optimizado para este estilo de voz.`;
  }

  return `Eres el Content Creator Agent de D&C Scale Partners.

Tu trabajo es generar contenido LISTO PARA PRODUCCION. No generas borradores — generas piezas completas que un editor o herramienta automatizada puede producir directamente.

TIPO DE PIEZA: ${pieceTypeDescriptions[brief.pieceType] || brief.pieceType}
CLIENTE: ${brief.client}
FECHA: ${getTodayFormatted()}
SOLICITADO POR: ${brief.source}

${directivesBlock}

--- CONTEXTO DE LA AGENCIA ---
${ctx.agencyContext || "Sin contexto de agencia."}

--- MARCA DEL CLIENTE ---
${ctx.clientBrand || "Sin contexto de marca cargado. Usa buenas practicas genericas para eCommerce artesanal de cuero."}

--- ESTRATEGIA ACTIVA ---
${ctx.strategy || "Sin estrategia definida aun."}

--- CALENDARIO DE CONTENIDO ---
${ctx.contentCalendar || "Sin calendario. Genera contenido basado en la estrategia y marca."}

--- HOOKS GANADORES ---
${ctx.hookDatabase || "Sin hooks registrados aun. Genera hooks originales siguiendo las reglas."}

--- FORMATOS GANADORES ---
${ctx.winningFormats || "Sin formatos registrados. Usa estructuras probadas."}

--- APRENDIZAJES ---
${ctx.learningLog || "Sin aprendizajes registrados."}

--- ADS LIBRARY ---
${ctx.adsLibrary || "Sin ads activos registrados."}

${examplesBlock}

${voiceBlock}

---

REGLAS DE ORO (SIEMPRE APLICAR):
1. Primer segundo = pattern interruption + claridad inmediata
2. El cerebro decide en 0.2s si quedarse o scrollear
3. 6 cortes/cambios en los primeros 3 segundos
4. Maximo 3 elementos en pantalla simultaneamente
5. Triple hook: visual + textual (<7 palabras) + verbal
6. No revelar la solucion al inicio — mantener intriga
7. Un trigger emocional por video (enojo/asombro/empatia/miedo)
8. CTA unico y directo al final — nunca dos acciones

FORMATOS DE SCRIPT:
A) "Double Drop" (ideal para ads de conversion):
   Problema → Solucion parcial → Problema peor → Solucion final + CTA

B) "Direct Value" (compartible/educativo):
   Promesa clara → 3 puntos concretos → Ejemplo real → CTA (guardar/comentar)

C) "3x Ranking" (viral/alcance):
   Malo → Normal → Excelente (mejor siempre al final)

TEMPLATES DE HOOK TEXTUAL (<7 palabras):
→ "Asi se hace en [X] horas"
→ "El error que te cuesta clientes"
→ "Nadie te muestra esto"
→ "Esto cambio todo para nosotros"
→ "No compres hasta ver esto"

---

${brief.pieceType === "reel" ? REEL_OUTPUT_FORMAT : STATIC_OUTPUT_FORMAT}`;
}

const REEL_OUTPUT_FORMAT = `GENERA LO SIGUIENTE (formato Markdown):

## Resumen
- Objetivo (viral/ventas/valor)
- Formato de script elegido (A/B/C) y por que
- Trigger emocional elegido
- Plataformas destino
- Duracion estimada

## Triple Hook
- **Visual:** que se ve en el primer frame
- **Textual:** texto en pantalla (<7 palabras)
- **Verbal:** que dice la voz/narrador

## Script completo
Escena por escena:
\`\`\`
Escena X [Xs-Xs]:
  Visual: que se ve (descripcion precisa para Remotion)
  Texto en pantalla: (texto exacto, posicion, tamano)
  Narracion: (texto exacto para voz)
  Musica/SFX: (tipo de sonido)
  Transicion: tipo de corte al siguiente
\`\`\`

## Storyboard de produccion
Descripcion de cada frame clave con especificaciones tecnicas para Remotion:
- Resolucion: 1080x1920 (9:16)
- Safe zones: no texto en los 150px superiores ni 250px inferiores (UI de IG/TikTok)
- Fuentes, tamanos, colores exactos
- Tipo de animacion por elemento

## Texto de narracion completo
El texto completo que se enviara a ElevenLabs, con marcas de pausa y enfasis.

## Captions listos para publicar
### Instagram
(Caption completo con emojis y hashtags, max 8 hashtags)

### TikTok
(Caption corto y directo)

## Metadata
- hook_category: [categoria]
- script_format: [A/B/C]
- emotional_trigger: [cual]
- estimated_duration_seconds: [numero]
- assets_needed: [lista de assets: fotos, capturas, musica, voz]
- music_style: [genero/mood para buscar en Pixabay]

Se directo, creativo, y especifico al contexto del cliente.`;

const STATIC_OUTPUT_FORMAT = `GENERA LO SIGUIENTE (formato Markdown):

## Resumen
- Tipo de static y objetivo
- Funnel stage (TOF/MOF/BOF)
- Plataformas destino

## Direccion visual
- Layout detallado (que va arriba, centro, abajo)
- Elemento dominante (que ve primero el ojo)
- Paleta de colores a usar
- Estilo visual (premium/artesanal/lifestyle/organic/minimalist/ugc)

## Textos exactos
- **Headline:** (max 7 palabras)
- **Subheadline:** (si aplica)
- **Callouts:** (beneficios clave, 2-4 bullets)
- **CTA:** (texto del boton/accion)

## Brief para NanoBanana Pro
\`\`\`
Brand: [nombre]
Piece type: [tipo]
Product: [producto con descripcion]
Main message: [headline]
Key benefit: [beneficio principal]
Visual style: [estilo]
Palette: [colores]
Dominant element: [elemento principal]
CTA: [accion]
Safe zones: respetar margenes para mobile
DON'T include: [restricciones]
\`\`\`

## Captions listos para publicar
### Instagram
(Caption completo con emojis y hashtags, max 8 hashtags)

### Facebook Ads
(Copy para ad si aplica)

## Metadata
- static_type: [tipo]
- funnel_stage: [TOF/MOF/BOF]
- headline: [texto]
- assets_needed: [fotos de producto, capturas, etc.]

Se directo, creativo, y especifico al contexto del cliente.`;

// --- Content Library Registration ---

function buildContentEntry(pieceId, brief, scriptOutput) {
  const briefSummary = [];
  if (brief.objective) briefSummary.push(`Objective: ${brief.objective}`);
  if (brief.scriptFormat)
    briefSummary.push(`Script format: ${brief.scriptFormat}`);
  if (brief.angle) briefSummary.push(`Angle: ${brief.angle}`);
  if (brief.instructions)
    briefSummary.push(`Instructions: ${brief.instructions}`);
  if (brief.examples && brief.examples.length > 0)
    briefSummary.push(
      `References: ${brief.examples.length} example(s) provided`
    );

  return `
## Piece #${pieceId} — ${brief.pieceType}
Date: ${getTodayISO()} | Source: ${brief.source} | Status: DRAFT
Type: ${brief.pieceType}
Client: ${brief.client}
${briefSummary.length > 0 ? `Brief: ${briefSummary.join(" | ")}` : "Brief: defaults (no specific direction)"}

### Generated Content
${scriptOutput}

### Production Status
- [ ] Script approved
- [ ] Assets gathered
- [ ] ${brief.pieceType === "reel" ? "Video produced (Remotion)" : "Static produced (NanoBanana Pro)"}
- [ ] ${brief.pieceType === "reel" ? "Voice generated (ElevenLabs)" : "N/A"}
- [ ] Published
- [ ] Metrics collected

### Real Metrics (fill when arriving)
3s retention: PENDING
Watch time %: PENDING
Saves: PENDING
Shares: PENDING
Comments: PENDING
Likes: PENDING
Reach: PENDING

### Auto-evaluation
Status: PENDING
Decision: PENDING
Learning: PENDING
`;
}

// --- Main: exported for future use by Consultant Agent ---

export async function createContent(briefInput) {
  const brief = parseBrief(briefInput);
  console.log(
    `Content Creator Agent — ${brief.pieceType} for ${brief.client} (source: ${brief.source})`
  );

  // Step 1: Load vault context
  const ctx = loadClientContext(brief.client);

  // Step 2: Load reference examples
  const examples = loadExampleReferences(brief.client, brief);
  if (examples.length > 0) {
    console.log(`Loaded ${examples.length} reference example(s)`);
  }

  // Step 3: Generate content
  console.log("Generating content...");
  const prompt = buildPrompt(ctx, brief, examples);
  const output = await callClaude(prompt);
  console.log("Content generated successfully.");

  // Step 4: Register in content-library.md
  const pieceId = getNextPieceId(ctx.contentLibrary);
  const entry = buildContentEntry(pieceId, brief, output);
  appendToVaultFile(`clients/${brief.client}/content-library.md`, entry);
  console.log(`Registered as Piece #${pieceId} in content-library.md`);

  // Step 5: Notify via Telegram
  const sourceLabel = {
    cli: "CLI manual",
    "consultant-agent": "Agente Consultor",
    dashboard: "Dashboard",
    "strategy-agent": "Calendario",
  }[brief.source] || brief.source;

  await sendTelegram(
    `*🎬 Content Creator — Pieza #${pieceId}*
_${getTodayFormatted()}_

📋 *Tipo:* ${brief.pieceType}
👤 *Cliente:* ${brief.client}
📡 *Solicitado por:* ${sourceLabel}
${brief.angle ? `🎯 *Angulo:* ${brief.angle}` : ""}
${brief.instructions ? `📝 *Instrucciones:* ${brief.instructions}` : ""}
📝 *Estado:* DRAFT — revisar y aprobar

_vault/clients/${brief.client}/content-library.md_`
  );

  // Step 6: Return result (for programmatic use by Consultant Agent)
  return {
    pieceId,
    client: brief.client,
    pieceType: brief.pieceType,
    source: brief.source,
    output,
    registeredAt: `vault/clients/${brief.client}/content-library.md`,
  };
}

// --- CLI entry point ---

async function main() {
  const brief = loadBriefFromArgs();
  const result = await createContent(brief);

  console.log("\n" + "=".repeat(60));
  console.log(`PIEZA #${result.pieceId} — ${result.pieceType.toUpperCase()}`);
  console.log("=".repeat(60) + "\n");
  console.log(result.output);
  console.log("\n" + "=".repeat(60));
}

main().catch(async (err) => {
  console.error("Content Creator failed:", err.message);
  try {
    await sendTelegram(
      `*❌ Content Creator Agent — Error*\n\n\`${err.message}\``
    );
  } catch {
    // Silent fail
  }
  process.exit(1);
});
