import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { parseBrief, DEFAULT_BRIEF } from "./brief-schema.js";
import { produceVideo } from "./produce-video.js";
import { produceVoice } from "./produce-voice.js";
import { produceStatic } from "./produce-static.js";
import { publishContent } from "./produce-publish.js";
import { loadBrandFiles, buildBrandBlock } from "../lib/brand-loader.js";
import {
  logAgentRun,
  logAgentError,
  registerContentPiece,
  updateAgentRun,
  registerAgentOutput,
  pushNotification,
  fetchClient,
} from "../lib/supabase.js";

const AGENT = "content-creator";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VAULT = resolve(__dirname, "../../vault");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// --- CLI parsing ---
// Usage:
//   node index.js --brief path/to/brief.json      (full brief)
//   node index.js <client-slug> reel               (shorthand)
// Requiere client slug — falla si no se pasa.

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
  mkdirSync(dirname(filePath), { recursive: true });
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

async function loadClientContext(client) {
  console.log(`Loading vault context for client: ${client}`);

  const [clientRow] = await Promise.all([fetchClient(client)]);

  // Brand: Content Creator necesita TODO el brandbook (genera piezas con
  // tono, voz, paleta, restricciones, formatos).
  const brand = loadBrandFiles(VAULT, client, "*");

  const context = {
    clientRow,
    sector: clientRow?.sector ?? null,
    modules: clientRow?.modules ?? null,
    agencyContext: readVaultFile("CLAUDE.md"),
    clientBrand: readVaultFile(`clients/${client}/claude-client.md`),
    strategy: readVaultFile(`clients/${client}/strategy.md`),
    contentCalendar: readVaultFile(`clients/${client}/content-calendar.md`),
    hookDatabase: readVaultFile("agents/content-creator/hook-database.md"),
    winningFormats: readVaultFile("agents/content-creator/winning-formats.md"),
    learningLog: readVaultFile(`clients/${client}/learning-log.md`),
    adsLibrary: readVaultFile(`clients/${client}/ads-library.md`),
    contentLibrary: readVaultFile(`clients/${client}/content-library.md`),
    brand,
    brandBlock: buildBrandBlock(brand),
  };

  const fileKeys = [
    "agencyContext",
    "clientBrand",
    "strategy",
    "contentCalendar",
    "hookDatabase",
    "winningFormats",
    "learningLog",
    "adsLibrary",
    "contentLibrary",
  ];
  const loaded = fileKeys.filter((k) => context[k] !== null).length;
  console.log(`Vault context loaded: ${loaded}/${fileKeys.length} files found`);
  if (context.sector) console.log(`Client sector (from Supabase): ${context.sector}`);

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

  if (brief.prioritize && typeof brief.prioritize === "object") {
    const p = brief.prioritize;
    if (Array.isArray(p.hook) && p.hook.length) {
      directives.push(
        `HOOKS QUE FUNCIONARON HISTORICAMENTE (priorizá uno de estos o algo en la misma linea): ${p.hook.join(" | ")}`
      );
    }
    if (Array.isArray(p.format) && p.format.length) {
      directives.push(`FORMATOS TOP (usá uno salvo que el brief pida otra cosa): ${p.format.join(" | ")}`);
    }
    if (Array.isArray(p.angle) && p.angle.length) {
      directives.push(`ANGULOS TOP (inspirarse): ${p.angle.join(" | ")}`);
    }
    if (Array.isArray(p.publish_time) && p.publish_time.length) {
      directives.push(`MEJORES HORARIOS DE PUBLICACION: ${p.publish_time.join(", ")}`);
    }
  }

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

--- MARCA DEL CLIENTE (overview) ---
${ctx.clientBrand || `Sin contexto de marca cargado. Sector: ${ctx.sector || "sin especificar"}. Usa buenas practicas genericas del sector.`}

${ctx.brandBlock}

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

REGLAS DE ASSETS VISUALES:
9. Si el cliente tiene un asset library (sección \`brand/assets.md\` arriba),
   referenciá los assets por su **canonical name exacto** (ej: \`wizzo-color-magia\`,
   \`logotipo-blanco\`, \`curva-w-violeta\`). NO inventes nombres ni paths.
10. Para mascot/personaje: usá la expresión correcta según el momento emocional
    del frame (ver descripciones de uso en assets.md). Ejemplos:
    - revelación / "el pique de Wizzo" → \`<mascot>-color-magia\`
    - cierre celebratorio → \`<mascot>-color-festejo\` o \`<mascot>-color-baile\`
    - advertencia / trampa turística → \`<mascot>-color-error\`
    - apertura de pieza → \`<mascot>-color-saludo\`
11. Si necesitás un asset que NO está en assets.md, listalo al final como
    \`MISSING_ASSET: <descripción>\` para que el equipo sepa qué subir.
12. En cada frame del Storyboard, donde uses un asset visual, indicá:
    \`Asset: <canonical-name>\` (NO un path, NO una URL).

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
- assets_used: [lista de canonical names del asset library que el script referencia, e.g. wizzo-color-magia, logotipo-blanco, curva-w-violeta]
- assets_missing: [lista de assets que serían ideales pero NO están en el library; cada uno como "tipo: descripción", e.g. "footage: persona caminando callejuela Trastevere POV"]
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
  const startTime = Date.now();
  console.log(
    `Content Creator Agent — ${brief.pieceType} for ${brief.client} (source: ${brief.source})`
  );

  // Step 1: Load vault context + client row from Supabase
  const ctx = await loadClientContext(brief.client);

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

  // Step 4b: Fase 3 — Produce static with Google AI / NanoBanana Pro (if enabled)
  let staticResult = null;
  if (brief.produceStatic && brief.pieceType !== "reel") {
    try {
      staticResult = await produceStatic(brief, output, pieceId);
      console.log(`Static produced: ${staticResult.filePath}`);
    } catch (err) {
      console.error(`Static production failed: ${err.message}`);
    }
  }

  // Step 4c: Fase 3 — Generate voice with ElevenLabs (if enabled)
  let voiceResult = null;
  if (brief.generateVoice && brief.pieceType === "reel") {
    try {
      voiceResult = await produceVoice(brief, output, pieceId);
      console.log(`Voice generated: ${voiceResult.filePath}`);
    } catch (err) {
      console.error(`Voice generation failed: ${err.message}`);
    }
  }

  // Step 4c: Fase 2 — Produce video with Remotion (if enabled)
  // Voice is generated first so Remotion can include it in the composition
  let videoPath = null;
  let videoError = null;
  let videoErrorStderr = null;
  let videoErrorStage = null;
  let compositionTsx = null;
  let compositionFile = null;
  if (brief.produceVideo && brief.pieceType === "reel") {
    try {
      const briefWithVoice = voiceResult
        ? { ...brief, _voicePath: voiceResult.remotionPath }
        : brief;
      const result = await produceVideo(briefWithVoice, output, pieceId);
      videoPath = result.outputPath;
      compositionTsx = result.compositionTsx ?? null;
      compositionFile = result.compositionFile ?? null;
      console.log(`Video produced: ${videoPath}`);
    } catch (err) {
      videoError = err.message;
      videoErrorStderr = err._stderr ?? null;
      videoErrorStage = err._stage ?? null;
      compositionTsx = err._compositionTsx ?? null;
      compositionFile = err._compositionFile ?? null;
      console.error(`Video production failed: ${videoError}`);
      console.log("Produce manually with: cd remotion-studio && npm run studio");
    }
  }

  // Step 5: Fase 4 — Publish with Blotato (if enabled)
  let publishResults = null;
  if (brief.autoPublish) {
    const mediaPath = videoPath || staticResult?.filePath || null;
    try {
      publishResults = await publishContent(brief, output, mediaPath);
      const published = publishResults.filter((r) => r.status === "published");
      console.log(`Published to ${published.length} platform(s): ${published.map((r) => r.platform).join(", ")}`);
    } catch (err) {
      console.error(`Publishing failed: ${err.message}`);
    }
  }

  const isPublished = publishResults?.some((r) => r.status === "published");
  const pieceStatus = isPublished
    ? "published"
    : videoPath || staticResult
    ? "produced"
    : "draft";
  const shortSummary = `Pieza #${pieceId} ${brief.pieceType} — ${pieceStatus}`;

  // Step 7: Log to Supabase
  try {
    await registerContentPiece({
      client: brief.client,
      piece_id: pieceId,
      piece_type: brief.pieceType,
      source: brief.source,
      objective: brief.objective || null,
      angle: brief.angle || null,
      script_format: brief.scriptFormat || null,
      emotional_trigger: brief.emotionalTrigger || null,
      platforms: brief.crossPost?.length
        ? [brief._strategy?.platform, ...brief.crossPost].filter(Boolean)
        : [brief._strategy?.platform].filter(Boolean),
      video_path: videoPath || null,
      voice_path: voiceResult?.filePath || null,
      static_path: staticResult?.filePath || null,
      publish_results: publishResults || [],
      status: pieceStatus,
    });
  } catch (err) {
    console.warn(`[${AGENT}] registerContentPiece failed (non-fatal): ${err.message}`);
  }

  const runId = brief.runId ?? null;

  await registerAgentOutput(runId, brief.client, AGENT, {
    output_type: "content-piece",
    title: `Pieza #${pieceId} — ${brief.pieceType}`,
    body_md: output,
    structured: {
      pieceId,
      pieceType: brief.pieceType,
      angle: brief.angle ?? null,
      objective: brief.objective ?? null,
      status: pieceStatus,
      videoPath: videoPath ?? null,
      videoError: videoError ?? null,
      videoErrorStderr: videoErrorStderr ?? null,
      videoErrorStage: videoErrorStage ?? null,
      compositionTsx: compositionTsx ?? null,
      compositionFile: compositionFile ?? null,
      voicePath: voiceResult?.filePath ?? null,
      staticPath: staticResult?.filePath ?? null,
      publishResults: publishResults ?? [],
    },
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
      { pieceId, pieceType: brief.pieceType, source: brief.source },
      { duration_ms: Date.now() - startTime },
    );
  }

  await pushNotification(
    brief.client,
    isPublished ? "success" : "info",
    `Pieza #${pieceId} ${isPublished ? "publicada" : "lista"}`,
    `${brief.pieceType}${brief.angle ? ` · ${brief.angle}` : ""}`,
    {
      agent: AGENT,
      link: `/cliente/${brief.client}/biblioteca`,
      to_user_id: brief.triggered_by_user_id ?? null,
    },
  );

  return {
    pieceId,
    client: brief.client,
    pieceType: brief.pieceType,
    source: brief.source,
    output,
    staticPath: staticResult?.filePath || null,
    voicePath: voiceResult?.filePath || null,
    videoPath,
    publishResults,
    registeredAt: `vault/clients/${brief.client}/content-library.md`,
  };
}

// --- CLI entry point ---

async function main() {
  const brief = loadBriefFromArgs();
  try {
    const result = await createContent(brief);
    console.log("\n" + "=".repeat(60));
    console.log(`PIEZA #${result.pieceId} — ${result.pieceType.toUpperCase()}`);
    console.log("=".repeat(60) + "\n");
    console.log(result.output);
    console.log("\n" + "=".repeat(60));
  } catch (err) {
    console.error(`[${AGENT}] failed:`, err.message);
    await logAgentError(brief.client, AGENT, err, {});
    if (brief.runId) {
      await updateAgentRun(brief.runId, { status: "error", summary: err.message });
    }
    await pushNotification(brief.client, "error", `Content Creator falló`, err.message, {
      agent: AGENT,
      to_user_id: brief.triggered_by_user_id ?? null,
    });
    process.exit(1);
  }
}

main();
