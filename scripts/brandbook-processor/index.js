/**
 * Brandbook Processor Agent
 *
 * Recibe el texto crudo del brandbook de un cliente y lo divide en 8 archivos
 * estructurados que viven en `vault/clients/<slug>/brand/`. Cada archivo es
 * lo que los agentes leen para "entender" la marca.
 *
 * Cuando se re-procesa (brief.reprocess=true), antes de sobrescribir mueve
 * los archivos actuales a `brand/_archive/<YYYY-MM-DD-HHmm>/` para no perder
 * versiones anteriores.
 *
 * Usage:
 *   node scripts/brandbook-processor/index.js --brief /tmp/brief.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { parseBrief } from "./brief-schema.js";
import {
  logAgentRun,
  logAgentError,
  updateAgentRun,
  registerAgentOutput,
  pushNotification,
} from "../lib/supabase.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VAULT = resolve(__dirname, "../../vault");
const AGENT = "brandbook-processor";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = "claude-sonnet-4-6";

/**
 * Las 8 secciones del brandbook estructurado. El orden es importante: el
 * processor le pide a Claude cada sección en este orden y los archivos se
 * generan con estos nombres exactos.
 */
const SECTIONS = [
  {
    key: "positioning",
    title: "Positioning",
    description:
      "Statement de posicionamiento, target/necesidad/producto/diferencial, misión, visión, valores de marca, slogan.",
  },
  {
    key: "voice-operational",
    title: "Voz Operativa",
    description:
      "Atributos de la voz de la marca cuando comunica como plataforma (T&C, procesos, confirmaciones, descripciones técnicas). Incluir ejemplos ✅/❌ por atributo. Listar lo que la voz NO es.",
  },
  {
    key: "voice-character",
    title: "Voz del Personaje",
    description:
      "Si el brandbook tiene un personaje/mascot/voice estratégica diferenciada de la voz operativa (e.g. WIZZO en WizTrip), describir su personalidad, atributos con ejemplos ✅/❌, su diccionario propio (términos exclusivos), y lo que NO es. Si el brandbook NO menciona un personaje, escribir un placeholder explícito.",
  },
  {
    key: "voice-decision",
    title: "Decisión de Voz",
    description:
      "Cuándo usar la voz operativa vs la voz del personaje. Tabla de decisión, mapping por tipo de pieza (reel, ad, email, página de producto, etc.). Si no hay personaje, esta sección puede ser breve y solo aclarar 'usar siempre la voz operativa'.",
  },
  {
    key: "visual-identity",
    title: "Identidad Visual",
    description:
      "Logo (concepto, variantes, área de resguardo, tamaños mínimos, USOS INCORRECTOS literal), paleta de colores con hex codes y nombres semánticos, tipografías con función (títulos / cuerpo / detalle), reglas de uso. Listar TODOS los hex codes que aparezcan.",
  },
  {
    key: "photography",
    title: "Fotografía",
    description:
      "Tipología de imagen — cuándo usar fotos aspiracionales vs funcionales, look & feel, qué SÍ y qué NO mostrar. Reglas para los agentes que generan briefs visuales.",
  },
  {
    key: "content-formats",
    title: "Formatos de Contenido",
    description:
      "Tipos de pieza definidos por el brandbook (publicitario, destinos, piques, marca, etc.) con su estructura (qué elementos lleva cada uno: logo, foto, texto, CTA). Voz dominante por formato. Reglas de mix/frecuencia.",
  },
  {
    key: "restrictions",
    title: "Restricciones",
    description:
      "Guard rails consolidados — qué NUNCA hacer en voz, copy, visual, fotografía, contenido y posicionamiento. Esto se referencia desde los agentes antes de aprobar piezas. Recoger TODAS las prohibiciones explícitas del brandbook.",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadBriefFromArgs() {
  const args = process.argv.slice(2);
  const briefFlagIdx = args.indexOf("--brief");
  if (briefFlagIdx === -1 || !args[briefFlagIdx + 1]) {
    throw new Error("brandbook-processor requires --brief /path/to/brief.json");
  }
  const path = resolve(process.cwd(), args[briefFlagIdx + 1]);
  return JSON.parse(readFileSync(path, "utf-8"));
}

async function callClaude(prompt, maxTokens = 16384) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
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

function buildPrompt(brief) {
  const sectionsList = SECTIONS.map(
    (s) => `- "${s.key}": ${s.title} — ${s.description}`,
  ).join("\n");

  const urlNote = brief.brandbookUrl
    ? `\nNOTA: el cliente también compartió el PDF master en ${brief.brandbookUrl}. No tenés acceso a ese PDF, solo al texto extraído. Indicá esa URL en \`positioning.md\` como referencia humana.`
    : "";

  return `Sos un experto en branding que transforma brandbooks en archivos estructurados que alimentan a agentes de IA de marketing.

Te paso el TEXTO COMPLETO del brandbook de un cliente. Tu trabajo es dividirlo en 8 archivos Markdown según las secciones definidas abajo. Los agentes (Content Creator, Strategy, SEO, etc.) van a leer cada archivo según necesidad.

CLIENTE: ${brief.client}
${urlNote}

--- TEXTO DEL BRANDBOOK ---
${brief.brandbookText}
--- FIN DEL TEXTO ---

SECCIONES A GENERAR (8 archivos):

${sectionsList}

REGLAS DE ESCRITURA:

1. **Cada sección debe ser un archivo Markdown completo**, con encabezado H1 (\`# Título — ${brief.client}\`), front matter de fuente ("> Fuente: brandbook procesado por brandbook-processor agent"), y secciones bien organizadas.

2. **Citá literal cuando el brandbook usa frases concretas** (slogan, valores con descripción, ejemplos do's/don'ts). No inventes ni parafrasees frases del posicionamiento — copialas tal cual.

3. **Si el brandbook NO contiene una sección** (e.g. el cliente no tiene un personaje/mascot, o no tiene tipología de fotografía), generá un placeholder claro:
   \`\`\`
   # Voz del Personaje — ${brief.client}

   Este cliente no tiene un personaje/mascot definido en su brandbook.

   Usar siempre la voz operativa (ver \`voice-operational.md\`).
   \`\`\`

4. **Para hex codes**: extraelos TODOS los que aparezcan en el texto, con sus nombres semánticos si los menciona.

5. **Para tipografías**: nombrarlas y asignarles su función (título / cuerpo / detalle) según el brandbook.

6. **Para restricciones**: hacer una lista exhaustiva. Recoger todas las "NO", "nunca", "evitar", "prohibido". Esta sección es guard rail.

7. **Reglas operativas para los agentes**: cada archivo debe terminar con una sección "## Reglas operativas para los agentes" con bullets accionables. Esto es lo que los agentes consultan al generar contenido.

8. **Tono de la documentación**: directo, profesional, sin floritura. Estos archivos son para máquinas y para humanos que quieren consultarlos.

FORMATO DE SALIDA:

Devolvé un único JSON parseable con esta estructura, **sin texto antes ni después, sin code fences, sin nada más**:

{
  "positioning": "# Positioning — ${brief.client}\\n\\n...",
  "voice-operational": "# Voz Operativa — ${brief.client}\\n\\n...",
  "voice-character": "# Voz del Personaje — ${brief.client}\\n\\n...",
  "voice-decision": "# Decisión de Voz — ${brief.client}\\n\\n...",
  "visual-identity": "# Identidad Visual — ${brief.client}\\n\\n...",
  "photography": "# Fotografía — ${brief.client}\\n\\n...",
  "content-formats": "# Formatos de Contenido — ${brief.client}\\n\\n...",
  "restrictions": "# Restricciones — ${brief.client}\\n\\n..."
}

Recordá: salida = JSON puro, parseable con JSON.parse(). Las strings de cada archivo van con saltos de línea como \\n.`;
}

function parseClaudeJsonOutput(raw) {
  // Sacar code fences si los hay (a veces el modelo los pone aunque le pidamos que no)
  let cleaned = raw.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7).trim();
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3).trim();
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3).trim();
  }
  return JSON.parse(cleaned);
}

function archiveCurrentBrand(client) {
  const brandDir = resolve(VAULT, "clients", client, "brand");
  if (!existsSync(brandDir)) return null;

  const existingFiles = readdirSync(brandDir).filter((f) =>
    f.endsWith(".md"),
  );
  if (existingFiles.length === 0) return null;

  const now = new Date();
  const stamp = now
    .toISOString()
    .slice(0, 16)
    .replace(/[T:]/g, "-")
    .replace(/-(\d{2})$/, "$1");
  // formato: YYYY-MM-DD-HHmm
  const archiveDir = resolve(brandDir, "_archive", stamp);
  mkdirSync(archiveDir, { recursive: true });

  for (const filename of existingFiles) {
    const src = resolve(brandDir, filename);
    const dst = resolve(archiveDir, filename);
    renameSync(src, dst);
  }
  return { stamp, count: existingFiles.length, archiveDir };
}

function writeBrandFiles(client, brandbookText, files) {
  const brandDir = resolve(VAULT, "clients", client, "brand");
  mkdirSync(brandDir, { recursive: true });

  const writtenFiles = [];
  for (const section of SECTIONS) {
    const content = files[section.key];
    if (!content || typeof content !== "string") {
      console.warn(
        `[${AGENT}] sección "${section.key}" missing en respuesta de Claude — skipping`,
      );
      continue;
    }
    const filepath = resolve(brandDir, `${section.key}.md`);
    writeFileSync(filepath, content, "utf-8");
    writtenFiles.push(`${section.key}.md`);
  }

  return writtenFiles;
}

function writeArchiveSource(client, archiveStamp, brandbookText, brandbookUrl) {
  if (!archiveStamp) return;
  const archiveDir = resolve(
    VAULT,
    "clients",
    client,
    "brand",
    "_archive",
    archiveStamp,
  );
  mkdirSync(archiveDir, { recursive: true });
  const meta = [
    `# Source — ${archiveStamp}`,
    "",
    `Cliente: ${client}`,
    `Archivado: ${new Date().toISOString()}`,
    brandbookUrl ? `URL del PDF master: ${brandbookUrl}` : "",
    "",
    "## Brandbook text que generó esta versión",
    "",
    "```",
    brandbookText,
    "```",
  ]
    .filter(Boolean)
    .join("\n");
  writeFileSync(resolve(archiveDir, "source.md"), meta, "utf-8");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function run(briefInput) {
  const startTime = Date.now();
  const raw = briefInput ?? loadBriefFromArgs();
  const brief = parseBrief(raw);
  const runId = brief.runId ?? null;
  const isReprocess = !!brief.reprocess;

  console.log(
    `[${AGENT}] starting · client=${brief.client} runId=${runId} reprocess=${isReprocess} text=${brief.brandbookText.length}chars`,
  );

  // 1. Si es reprocess (o si el folder ya tiene archivos), archivar la versión actual
  let archiveInfo = null;
  if (isReprocess) {
    archiveInfo = archiveCurrentBrand(brief.client);
    if (archiveInfo) {
      console.log(
        `[${AGENT}] archived ${archiveInfo.count} files from previous version → _archive/${archiveInfo.stamp}/`,
      );
    }
  } else {
    // En primer procesado, si por alguna razón ya hay archivos, también archivamos
    // (e.g. el wizard se reusó sin pasar reprocess=true).
    const brandDir = resolve(VAULT, "clients", brief.client, "brand");
    if (existsSync(brandDir)) {
      const files = readdirSync(brandDir).filter((f) => f.endsWith(".md"));
      if (files.length > 0) {
        archiveInfo = archiveCurrentBrand(brief.client);
        if (archiveInfo) {
          console.log(
            `[${AGENT}] non-empty brand/ found, archived to _archive/${archiveInfo.stamp}/`,
          );
        }
      }
    }
  }

  // 2. Llamar a Claude para generar las 8 secciones
  console.log(`[${AGENT}] calling Claude (model=${MODEL})...`);
  const prompt = buildPrompt(brief);
  const claudeRaw = await callClaude(prompt, 16384);

  let files;
  try {
    files = parseClaudeJsonOutput(claudeRaw);
  } catch (parseErr) {
    throw new Error(
      `Claude output no es JSON válido: ${parseErr.message}\n\n--- raw output (primeros 1000 chars) ---\n${claudeRaw.slice(0, 1000)}`,
    );
  }

  // 3. Escribir los archivos
  const writtenFiles = writeBrandFiles(brief.client, brief.brandbookText, files);
  console.log(
    `[${AGENT}] wrote ${writtenFiles.length}/${SECTIONS.length} files: ${writtenFiles.join(", ")}`,
  );

  // 4. Si archivamos, guardar el source.md con el brandbookText original
  if (archiveInfo) {
    writeArchiveSource(
      brief.client,
      archiveInfo.stamp,
      brief.brandbookText,
      brief.brandbookUrl,
    );
  }

  // 5. Notificar
  const summary = `Brandbook procesado · ${writtenFiles.length} archivos${
    archiveInfo ? ` · versión anterior archivada` : ""
  }`;

  const bodyMd = [
    `Brandbook procesado para **${brief.client}**.`,
    "",
    "Archivos generados en `vault/clients/" + brief.client + "/brand/`:",
    ...writtenFiles.map((f) => `- ${f}`),
    "",
    archiveInfo
      ? `Versión anterior archivada en \`brand/_archive/${archiveInfo.stamp}/\` (${archiveInfo.count} archivos).`
      : "",
    "",
    brief.brandbookUrl ? `PDF master: ${brief.brandbookUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  await registerAgentOutput(runId, brief.client, AGENT, {
    output_type: "report",
    title: `Brandbook procesado · ${brief.client}`,
    body_md: bodyMd,
    structured: {
      files: writtenFiles,
      archived: archiveInfo
        ? { stamp: archiveInfo.stamp, count: archiveInfo.count }
        : null,
      reprocess: isReprocess,
      brandbookUrl: brief.brandbookUrl ?? null,
    },
  });

  if (runId) {
    await updateAgentRun(runId, {
      status: "success",
      summary,
      summary_md: bodyMd,
      performance: { duration_ms: Date.now() - startTime },
    });
  } else {
    await logAgentRun(
      brief.client,
      AGENT,
      "success",
      summary,
      { reprocess: isReprocess, files: writtenFiles },
      { duration_ms: Date.now() - startTime },
    );
  }

  await pushNotification(
    brief.client,
    "success",
    `Brandbook listo para ${brief.client}`,
    `Los agentes ya pueden generar contenido respetando la marca.`,
    { agent: AGENT, link: `/cliente/${brief.client}/brandbook` },
  );

  console.log(`[${AGENT}] done.`);

  return {
    client: brief.client,
    runId,
    files: writtenFiles,
    archived: archiveInfo,
  };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const isMain =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  try {
    await run();
  } catch (err) {
    console.error(`[${AGENT}] failed:`, err.message);
    const fallbackBrief = (() => {
      try {
        return loadBriefFromArgs();
      } catch {
        return { client: "_unknown", runId: null };
      }
    })();
    await logAgentError(fallbackBrief.client ?? "_unknown", AGENT, err);
    if (fallbackBrief.runId) {
      await updateAgentRun(fallbackBrief.runId, {
        status: "error",
        summary: err.message,
      });
    }
    process.exit(1);
  }
}
