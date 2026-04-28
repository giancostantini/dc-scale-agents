import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  logAgentRun,
  logAgentError,
  updateAgentRun,
  registerAgentOutput,
  pushNotification,
} from "../lib/supabase.js";
import { loadBrandFiles, buildBrandBlock } from "../lib/brand-loader.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VAULT = resolve(__dirname, "../../vault");
const AGENT = "content-strategy";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

function loadBrief() {
  const args = process.argv.slice(2);
  const briefFlagIdx = args.indexOf("--brief");
  if (briefFlagIdx !== -1 && args[briefFlagIdx + 1]) {
    const path = resolve(process.cwd(), args[briefFlagIdx + 1]);
    if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8"));
  }
  const positional = args.filter((a) => !a.startsWith("--"))[0];
  return { client: positional };
}

const BRIEF = loadBrief();
const CLIENT = BRIEF.client;
const RUN_ID = BRIEF.runId ?? null;

if (!CLIENT || typeof CLIENT !== "string" || !CLIENT.trim()) {
  console.error(
    `[${AGENT}] client slug missing — brief must include a 'client' string (no hay defaults)`,
  );
  process.exit(1);
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
  writeFileSync(resolve(VAULT, relativePath), content, "utf-8");
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
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

// --- Dates ---

function getWeekRange() {
  const now = new Date();
  const monday = new Date(now);
  const dayOfWeek = now.getDay();
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  monday.setDate(now.getDate() + daysUntilMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmt = (d) =>
    d.toLocaleDateString("es-UY", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });

  const fmtISO = (d) => d.toISOString().split("T")[0];

  const days = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    days.push({ label: fmt(day), iso: fmtISO(day) });
  }

  return {
    start: fmt(monday),
    end: fmt(sunday),
    days,
    isoStart: fmtISO(monday),
    isoEnd: fmtISO(sunday),
  };
}

// --- Main ---

/**
 * Formatea el objeto `prioritize` (top hooks/formats/angles/publish_times)
 * como bullets por dimensión para inyectar en el prompt.
 */
function formatPrioritize(prioritize) {
  if (!prioritize || typeof prioritize !== "object") return "";
  const labels = {
    hook: "Hooks que mejor performan",
    format: "Formatos ganadores",
    angle: "Ángulos top",
    publish_time: "Horarios de publicación con mejor engagement",
  };
  const sections = [];
  for (const [dim, label] of Object.entries(labels)) {
    const values = prioritize[dim];
    if (Array.isArray(values) && values.length > 0) {
      sections.push(`${label}: ${values.slice(0, 5).join(" · ")}`);
    }
  }
  return sections.join("\n");
}

async function run() {
  const startTime = Date.now();
  console.log(`Content Strategy Agent — generating calendar for ${CLIENT}...`);

  // Brief enrichment — el Consultor (o el dashboard) puede mandar `prioritize`
  // con top hooks/formats/angles que funcionaron históricamente. Si viene,
  // lo inyectamos al prompt para que el calendario los priorice.
  const prioritize = BRIEF.prioritize || null;

  // Brand: Content Strategy necesita positioning + voice-decision +
  // content-formats para armar el calendario respetando la marca.
  const brand = loadBrandFiles(VAULT, CLIENT, [
    "positioning",
    "voice-decision",
    "content-formats",
  ]);
  const brandBlock = buildBrandBlock(brand);

  // Read all vault context
  const agencyContext = readVaultFile("CLAUDE.md");
  const clientContext = readVaultFile(`clients/${CLIENT}/claude-client.md`);
  const strategy = readVaultFile(`clients/${CLIENT}/strategy.md`);
  const prevCalendar = readVaultFile(`clients/${CLIENT}/content-calendar.md`);
  const contentLibrary = readVaultFile(`clients/${CLIENT}/content-library.md`);
  const learningLog = readVaultFile(`clients/${CLIENT}/learning-log.md`);
  const metricsLog = readVaultFile(`clients/${CLIENT}/metrics-log.md`);
  const campaignTemplates = readVaultFile(
    "agents/content-strategy/campaign-templates.md"
  );
  const winningFormats = readVaultFile(
    "agents/content-creator/winning-formats.md"
  );
  const hookDatabase = readVaultFile("agents/content-creator/hook-database.md");

  const week = getWeekRange();
  const daysLabels = week.days.map((d) => d.label).join(", ");
  const daysJSON = week.days
    .map((d) => `  "${d.label}": "${d.iso}"`)
    .join(",\n");

  const prompt = `Eres el Content Strategy Agent de D&C Scale Partners, una agencia de crecimiento digital.

Tu trabajo es generar el CALENDARIO DE CONTENIDO SEMANAL para el cliente ${CLIENT}.
Semana: ${week.start} al ${week.end}
Dias: ${daysLabels}

Mapeo de dias a fechas ISO:
{
${daysJSON}
}

--- CONTEXTO DE LA AGENCIA ---
${agencyContext || "Sin contexto de agencia."}

--- CONTEXTO DEL CLIENTE (overview) ---
${clientContext || "Sin contexto de cliente cargado aun."}

${brandBlock}

--- ESTRATEGIA ACTIVA ---
${strategy || "Sin estrategia definida aun."}

--- CALENDARIO PREVIO ---
${prevCalendar || "Sin calendario previo."}

--- CONTENT LIBRARY (piezas creadas) ---
${contentLibrary || "Sin piezas creadas aun."}

--- LEARNING LOG ---
${learningLog || "Sin aprendizajes registrados aun."}

--- METRICAS ---
${metricsLog || "Sin metricas registradas aun."}

--- CAMPAIGN TEMPLATES ---
${campaignTemplates || "Sin templates."}

--- FORMATOS GANADORES ---
${winningFormats || "Sin formatos ganadores registrados."}

--- HOOK DATABASE ---
${hookDatabase || "Sin hooks registrados."}

${
  prioritize
    ? `--- PRIORIDADES (datos reales del cliente — top performers históricos) ---
${formatPrioritize(prioritize)}

Estos hooks/formatos/ángulos/horarios funcionaron mejor que la baseline. Sesgá el calendario hacia ellos cuando aplique al objetivo de la pieza.`
    : ""
}

---

REGLAS DE PLANIFICACION:
1. Genera entre 5 y 7 publicaciones para la semana
2. Mix de funnel: ~40% TOF (awareness), ~35% MOF (consideracion), ~25% BOF (conversion)
3. No repetir el mismo angulo dos dias seguidos
4. Alternar formatos (no 3 reels seguidos)
5. Priorizar angulos que funcionaron segun el learning log
6. Si hay metricas reales, duplicar lo que funciona y descartar lo que no
7. Incluir al menos 1 pieza de prueba social por semana
8. Lunes y jueves: contenido educativo. Viernes y fines de semana: emocional/lifestyle
9. Si no hay datos reales del cliente, genera un plan basado en mejores practicas para su nicho

---

IMPORTANTE: Tu output debe tener EXACTAMENTE dos secciones separadas por la linea "---BRIEFS_JSON---".

SECCION 1: El calendario en Markdown legible (para humanos y el dashboard).
SECCION 2: Un array JSON con los briefs estructurados para el Content Creator Agent.

FORMATO SECCION 1 (Markdown):

# Calendario de Contenido — ${CLIENT}

## Semana ${week.isoStart} — ${week.isoEnd}
Tema central: [tema unificador de la semana]

### [dia completo con fecha]
- **Plataforma:** [Instagram Reels / Instagram Stories / Instagram Carousel / TikTok / etc.]
- **Tipo:** [reel / static-ad / carousel / social-review / headline-ad / collage-ad]
- **Funnel:** [TOF / MOF / BOF]
- **Angulo:** [tema concreto y especifico, NO generico]
- **Hook:** "[primera linea o primer segundo — concreto y provocador]"
- **CTA:** [accion esperada del usuario]
- **Notas:** [instrucciones claras para el Content Creator]

(Repetir para cada dia que tenga publicacion)

## Resumen de la semana
- TOF: X piezas
- MOF: X piezas
- BOF: X piezas
- Formatos: [lista de formatos usados]

---BRIEFS_JSON---

FORMATO SECCION 2 (JSON array):
Genera un array JSON valido. Cada objeto es un brief para el Content Creator Agent.
Los campos pieceType deben ser exactamente: "reel", "static-ad", "social-review", "headline-ad", "collage-ad", o "carousel".
El campo objective debe ser: "viral", "sales", "value", o "branding".

[
  {
    "date": "[YYYY-MM-DD]",
    "client": "${CLIENT}",
    "pieceType": "[tipo exacto]",
    "source": "strategy-agent",
    "objective": "[viral/sales/value/branding]",
    "scriptFormat": "[double-drop/direct-value/3x-ranking]" o null,
    "emotionalTrigger": "[anger/awe/empathy/fear]" o null,
    "hookStyle": "[hook concreto sugerido]",
    "tone": "[indicacion de tono]" o null,
    "angle": "[angulo concreto]",
    "targetAudience": "[segmento]" o null,
    "cta": "[CTA concreto]",
    "instructions": "[notas detalladas para el Content Creator]",
    "platform": "[instagram-reels/instagram-stories/tiktok/instagram-carousel/etc.]",
    "funnelStage": "[TOF/MOF/BOF]"
  }
]

Se concreto y especifico. Los hooks deben ser frases reales, no placeholders. Los angulos deben ser ideas concretas adaptadas al nicho del cliente.`;

  console.log("Calling Claude API...");
  const rawOutput = await callClaude(prompt, 6000);

  // --- Parse the two sections ---
  const separator = "---BRIEFS_JSON---";
  const separatorIdx = rawOutput.indexOf(separator);

  let calendarMd;
  let briefs = [];

  if (separatorIdx === -1) {
    // Fallback: no separator found, treat entire output as calendar
    console.warn("WARNING: No briefs JSON section found in output. Saving calendar only.");
    calendarMd = rawOutput;
  } else {
    calendarMd = rawOutput.substring(0, separatorIdx).trim();
    const jsonPart = rawOutput.substring(separatorIdx + separator.length).trim();

    // Extract JSON array (handle markdown code fences if Claude wraps it)
    const jsonClean = jsonPart.replace(/^```json?\n?/m, "").replace(/\n?```$/m, "");

    try {
      briefs = JSON.parse(jsonClean);
      console.log(`Parsed ${briefs.length} content briefs from strategy output.`);
    } catch (e) {
      console.error("WARNING: Failed to parse briefs JSON:", e.message);
      console.error("Raw JSON section:", jsonClean.substring(0, 500));
    }
  }

  // --- Write calendar markdown ---
  console.log("Writing calendar to vault...");
  writeVaultFile(`clients/${CLIENT}/content-calendar.md`, calendarMd);

  // --- Write individual brief files ---
  const briefsDir = resolve(VAULT, `clients/${CLIENT}/content-briefs`);
  ensureDir(briefsDir);

  // Clean previous briefs for this week
  try {
    const existing = readdirSync(briefsDir).filter((f) =>
      f.startsWith(week.isoStart)
    );
    for (const f of existing) {
      rmSync(resolve(briefsDir, f));
    }
  } catch {
    // directory might not exist yet
  }

  // Write each brief as a separate JSON file
  for (let i = 0; i < briefs.length; i++) {
    const brief = briefs[i];
    const seq = String(i + 1).padStart(2, "0");
    const date = brief.date || week.isoStart;
    const filename = `${date}-${brief.pieceType || "content"}-${seq}.json`;

    // Ensure required fields from Content Creator schema
    const fullBrief = {
      client: CLIENT,
      pieceType: brief.pieceType || "reel",
      source: "strategy-agent",
      objective: brief.objective || null,
      scriptFormat: brief.scriptFormat || null,
      emotionalTrigger: brief.emotionalTrigger || null,
      hookStyle: brief.hookStyle || null,
      tone: brief.tone || null,
      angle: brief.angle || null,
      targetAudience: brief.targetAudience || null,
      cta: brief.cta || null,
      instructions: brief.instructions || null,
      voice: null,
      visual: null,
      examples: [],
      calendarEntryId: `${date}-${seq}`,
      produceVideo: false,
      produceStatic: false,
      generateVoice: false,
      autoPublish: false,
      // Strategy-specific metadata (Content Creator ignores, Consultant Agent uses)
      _strategy: {
        date: brief.date || null,
        platform: brief.platform || null,
        funnelStage: brief.funnelStage || null,
      },
    };

    writeFileSync(
      resolve(briefsDir, filename),
      JSON.stringify(fullBrief, null, 2),
      "utf-8"
    );
  }

  console.log(`Wrote ${briefs.length} briefs to vault/clients/${CLIENT}/content-briefs/`);

  // --- Write report for Consultant Agent ---
  const reportsDir = resolve(VAULT, `clients/${CLIENT}/agent-reports`);
  ensureDir(reportsDir);

  const report = {
    agent: "content-strategy",
    client: CLIENT,
    timestamp: new Date().toISOString(),
    week: { start: week.isoStart, end: week.isoEnd },
    briefsGenerated: briefs.length,
    briefFiles: briefs.map((b, i) => {
      const seq = String(i + 1).padStart(2, "0");
      const date = b.date || week.isoStart;
      return `${date}-${b.pieceType || "content"}-${seq}.json`;
    }),
    calendar: calendarMd,
  };

  writeFileSync(
    resolve(reportsDir, `content-strategy-${week.isoStart}.json`),
    JSON.stringify(report, null, 2),
    "utf-8"
  );

  const shortSummary = `Calendario generado: ${briefs.length} briefs para semana ${week.isoStart}`;

  await registerAgentOutput(RUN_ID, CLIENT, AGENT, {
    output_type: "calendar",
    title: `Calendario semanal — ${week.isoStart} al ${week.isoEnd}`,
    body_md: calendarMd,
    structured: {
      week: { start: week.isoStart, end: week.isoEnd },
      briefsGenerated: briefs.length,
      briefs: briefs.map((b) => ({
        date: b.date,
        pieceType: b.pieceType,
        objective: b.objective,
        angle: b.angle,
        platform: b.platform,
        funnelStage: b.funnelStage,
      })),
    },
  });

  if (RUN_ID) {
    await updateAgentRun(RUN_ID, {
      status: "success",
      summary: shortSummary,
      summary_md: calendarMd,
      performance: { duration_ms: Date.now() - startTime },
    });
  } else {
    await logAgentRun(
      CLIENT,
      AGENT,
      "success",
      shortSummary,
      { briefsGenerated: briefs.length, week: week.isoStart },
      { duration_ms: Date.now() - startTime },
    );
  }

  await pushNotification(CLIENT, "success", `Calendario semanal listo`, shortSummary, {
    agent: AGENT,
    link: `/cliente/${CLIENT}/biblioteca`,
  });

  console.log(`[${AGENT}] done. ${shortSummary}`);
  console.log(`Calendar: vault/clients/${CLIENT}/content-calendar.md`);
  console.log(`Briefs:   vault/clients/${CLIENT}/content-briefs/ (${briefs.length} files)`);
  console.log(`Report:   vault/clients/${CLIENT}/agent-reports/content-strategy-${week.isoStart}.json`);
}

run().catch(async (err) => {
  console.error(`[${AGENT}] failed:`, err.message);
  await logAgentError(CLIENT, AGENT, err, {});
  if (RUN_ID) {
    await updateAgentRun(RUN_ID, { status: "error", summary: err.message });
  }
  await pushNotification(CLIENT, "error", `Content strategy falló`, err.message, { agent: AGENT });
  process.exit(1);
});
