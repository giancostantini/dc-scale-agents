/**
 * Morning Briefing Agent
 *
 * Generates a concise daily briefing for a client from their vault context
 * (claude-client.md, learning-log, metrics-log, content-calendar). Registers
 * the briefing in agent_outputs so the dashboard can render it, and pushes a
 * notification to the bell.
 *
 * Usage:
 *   node scripts/morning-briefing/index.js --brief /tmp/brief.json
 *   node scripts/morning-briefing/index.js <client>           (legacy CLI)
 *   node scripts/morning-briefing/index.js                    (defaults dmancuello)
 *
 * Brief shape:
 *   { client: string, runId?: number, mode?: string }
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  logAgentRun,
  logAgentError,
  updateAgentRun,
  registerAgentOutput,
  pushNotification,
} from "../lib/supabase.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VAULT = resolve(__dirname, "../../vault");
const AGENT = "morning-briefing";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

function readVaultFile(relativePath) {
  try {
    return readFileSync(resolve(VAULT, relativePath), "utf-8");
  } catch {
    return null;
  }
}

function loadBrief() {
  const args = process.argv.slice(2);
  const briefFlagIdx = args.indexOf("--brief");
  if (briefFlagIdx !== -1 && args[briefFlagIdx + 1]) {
    const path = resolve(process.cwd(), args[briefFlagIdx + 1]);
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, "utf-8"));
    }
  }
  // Legacy: positional client slug
  const positional = args.filter((a) => !a.startsWith("--"))[0];
  return { client: positional || "dmancuello" };
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
      model: "claude-sonnet-4-6",
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

async function run() {
  const startTime = Date.now();
  const brief = loadBrief();
  const { client, runId = null } = brief;
  console.log(`[${AGENT}] starting for client='${client}' runId=${runId}`);

  const base = `clients/${client}`;
  const clientContext = readVaultFile(`${base}/claude-client.md`);
  const learningLog = readVaultFile(`${base}/learning-log.md`);
  const metricsLog = readVaultFile(`${base}/metrics-log.md`);
  const contentCalendar = readVaultFile(`${base}/content-calendar.md`);

  const today = new Date().toLocaleDateString("es-UY", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const prompt = `Eres el Morning Briefing Agent de D&C Scale Partners.

Tu trabajo es generar un briefing matutino conciso para el equipo sobre el cliente '${client}'.

Fecha de hoy: ${today}

--- CONTEXTO DEL CLIENTE (claude-client.md) ---
${clientContext || "Sin contexto de cliente cargado aún."}

--- LEARNING LOG ---
${learningLog || "Sin aprendizajes registrados aún."}

--- METRICAS ---
${metricsLog || "Sin métricas registradas aún."}

--- CALENDARIO DE CONTENIDO ---
${contentCalendar || "Sin calendario de contenido aún."}

---

Genera un briefing matutino en Markdown simple. Estructura:

*☀️ Morning Briefing — ${client}*
_${today}_

📊 *Resumen de métricas* (si hay datos, sino indicá que faltan)
📝 *Contenido pendiente hoy* (si hay calendario, sino sugerí prioridades)
💡 *Recordatorio clave* (del learning log o una sugerencia táctica)
🎯 *Foco del día* (una acción concreta para hoy)

Sé directo, útil y breve. Máximo 800 caracteres. Basate en el contexto del cliente; si falta info, indicalo sin inventar datos.`;

  console.log(`[${AGENT}] calling Claude...`);
  const briefing = await callClaude(prompt);

  const shortSummary = `Briefing matutino generado para ${client}`;

  await registerAgentOutput(runId, client, AGENT, {
    output_type: "report",
    title: `Morning Briefing — ${today}`,
    body_md: briefing,
    structured: { date: today, char_count: briefing.length },
  });

  if (runId) {
    await updateAgentRun(runId, {
      status: "success",
      summary: shortSummary,
      summary_md: briefing,
      performance: { duration_ms: Date.now() - startTime },
    });
  } else {
    await logAgentRun(
      client,
      AGENT,
      "success",
      shortSummary,
      {},
      { duration_ms: Date.now() - startTime },
    );
  }

  await pushNotification(client, "info", `Morning briefing listo`, shortSummary, {
    agent: AGENT,
    link: `/cliente/${client}`,
  });

  console.log(`[${AGENT}] done.`);
}

run().catch(async (err) => {
  console.error(`[${AGENT}] failed:`, err.message);
  const brief = (() => {
    try {
      return loadBrief();
    } catch {
      return { client: "_unknown" };
    }
  })();
  await logAgentError(brief.client, AGENT, err, {});
  if (brief.runId) {
    await updateAgentRun(brief.runId, { status: "error", summary: err.message });
  }
  await pushNotification(brief.client, "error", `Morning briefing falló`, err.message, {
    agent: AGENT,
  });
  process.exit(1);
});
