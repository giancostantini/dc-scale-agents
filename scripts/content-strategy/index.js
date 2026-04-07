import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VAULT = resolve(__dirname, "../../vault");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const CLIENT = process.argv[2] || "dmancuello";

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

async function callClaude(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
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
  // Next Monday
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

  const days = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    days.push(fmt(day));
  }

  return {
    start: fmt(monday),
    end: fmt(sunday),
    days,
    isoStart: monday.toISOString().split("T")[0],
    isoEnd: sunday.toISOString().split("T")[0],
  };
}

// --- Main ---

async function run() {
  console.log(`Content Strategy Agent — generating calendar for ${CLIENT}...`);

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

  const prompt = `Eres el Content Strategy Agent de D&C Scale Partners, una agencia de crecimiento digital.

Tu trabajo es generar el CALENDARIO DE CONTENIDO SEMANAL para el cliente ${CLIENT}.
Semana: ${week.start} al ${week.end}
Dias: ${week.days.join(", ")}

--- CONTEXTO DE LA AGENCIA ---
${agencyContext || "Sin contexto de agencia."}

--- CONTEXTO DEL CLIENTE ---
${clientContext || "Sin contexto de cliente cargado aun."}

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

FORMATO DE SALIDA (Markdown estricto, usar exactamente esta estructura):

# Calendario de Contenido — ${CLIENT}

## Semana ${week.isoStart} — ${week.isoEnd}
Tema central: [tema unificador de la semana]

### [dia completo con fecha]
- **Plataforma:** [Instagram Reels / Instagram Stories / Instagram Carousel / TikTok / etc.]
- **Tipo:** [reel / static-ad / carousel / story / social-review]
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

Se concreto y especifico. Los hooks deben ser frases reales, no placeholders. Los angulos deben ser ideas concretas adaptadas al nicho del cliente.`;

  console.log("Calling Claude API...");
  const calendar = await callClaude(prompt);

  // Write calendar to vault
  console.log("Writing calendar to vault...");
  writeVaultFile(`clients/${CLIENT}/content-calendar.md`, calendar);

  // Write report for the Consultant Agent to pick up and relay via WhatsApp
  const report = {
    agent: "content-strategy",
    client: CLIENT,
    timestamp: new Date().toISOString(),
    week: { start: week.isoStart, end: week.isoEnd },
    calendar,
  };
  const reportsDir = resolve(VAULT, `clients/${CLIENT}/agent-reports`);
  const reportPath = resolve(reportsDir, `content-strategy-${week.isoStart}.json`);
  try {
    await import("fs").then((fs) => fs.mkdirSync(reportsDir, { recursive: true }));
  } catch {
    // directory already exists
  }
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");

  console.log("Content Strategy Agent completed successfully.");
  console.log(`Calendar written to: vault/clients/${CLIENT}/content-calendar.md`);
  console.log(`Report for Consultant Agent: vault/clients/${CLIENT}/agent-reports/content-strategy-${week.isoStart}.json`);
  console.log("\n--- Calendar generated ---\n");
  console.log(calendar);
}

run().catch((err) => {
  console.error("Content Strategy Agent failed:", err.message);
  process.exit(1);
});
