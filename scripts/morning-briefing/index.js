import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VAULT = resolve(__dirname, "../../vault");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// --- Helpers ---

function readVaultFile(relativePath) {
  try {
    return readFileSync(resolve(VAULT, relativePath), "utf-8");
  } catch {
    return null;
  }
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
      model: "claude-sonnet-4-6-20250514",
      max_tokens: 1024,
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

// --- Main ---

async function run() {
  console.log("Morning Briefing Agent — starting...");

  // Read vault context
  const clientContext = readVaultFile("clients/dmancuello/claude-client.md");
  const learningLog = readVaultFile("clients/dmancuello/learning-log.md");
  const metricsLog = readVaultFile("clients/dmancuello/metrics-log.md");
  const contentCalendar = readVaultFile("clients/dmancuello/content-calendar.md");

  const today = new Date().toLocaleDateString("es-UY", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const prompt = `Eres el Morning Briefing Agent de D&C Scale Partners, una agencia de crecimiento digital.

Tu trabajo es generar un briefing matutino conciso para el equipo sobre el cliente DMancuello.

Fecha de hoy: ${today}

--- CONTEXTO DEL CLIENTE ---
${clientContext || "Sin contexto de cliente cargado aún."}

--- LEARNING LOG ---
${learningLog || "Sin aprendizajes registrados aún."}

--- METRICAS ---
${metricsLog || "Sin métricas registradas aún."}

--- CALENDARIO DE CONTENIDO ---
${contentCalendar || "Sin calendario de contenido aún."}

---

Genera un briefing matutino en formato Telegram (Markdown simple). Estructura:

*☀️ Morning Briefing — DMancuello*
_${today}_

📊 *Resumen de métricas* (si hay datos, sino indica que faltan)
📝 *Contenido pendiente hoy* (si hay calendario, sino sugiere prioridades)
💡 *Recordatorio clave* (del learning log o una sugerencia táctica)
🎯 *Foco del día* (una acción concreta para hoy)

Sé directo, útil y breve. Máximo 800 caracteres. Si no hay datos reales, genera un briefing útil basado en buenas prácticas para un eCommerce artesanal de cuero.`;

  console.log("Calling Claude API...");
  const briefing = await callClaude(prompt);

  console.log("Sending to Telegram...");
  await sendTelegram(briefing);

  console.log("Morning Briefing sent successfully.");
}

run().catch((err) => {
  console.error("Morning Briefing failed:", err.message);
  process.exit(1);
});
