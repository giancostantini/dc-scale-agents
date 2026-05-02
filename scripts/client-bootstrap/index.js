/**
 * Client Bootstrap — scaffolds the vault folder for a newly created client.
 *
 * Reads templates from vault/automation/templates/client-scaffold/ and writes
 * them to vault/clients/<slug>/ with placeholders replaced by real values.
 *
 * Invoked via repository_dispatch (event_type: client-bootstrap) from the
 * dashboard when a new client is created.
 *
 * Brief shape (passed as --brief /path/to/brief.json):
 *   {
 *     client:       string (slug)
 *     name:         string
 *     sector:       string
 *     country:      string
 *     type:         "gp" | "dev"
 *     fee:          number
 *     method:       string
 *     phase:        string
 *     runId:        number | null
 *   }
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, statSync, existsSync } from "fs";
import { resolve, dirname, join, relative } from "path";
import { fileURLToPath } from "url";
import { logAgentRun, logAgentError, updateAgentRun, registerAgentOutput, pushNotification } from "../lib/supabase.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const TEMPLATES = resolve(REPO_ROOT, "vault/automation/templates/client-scaffold");
const CLIENTS_DIR = resolve(REPO_ROOT, "vault/clients");

const TYPE_LABEL = { gp: "Growth Partner", dev: "Desarrollo" };

function loadBrief() {
  const args = process.argv.slice(2);
  const briefFlagIdx = args.indexOf("--brief");
  if (briefFlagIdx === -1 || !args[briefFlagIdx + 1]) {
    throw new Error("client-bootstrap requires --brief /path/to/brief.json");
  }
  const briefPath = resolve(process.cwd(), args[briefFlagIdx + 1]);
  let raw;
  try {
    raw = readFileSync(briefPath, "utf-8");
  } catch (err) {
    throw new Error(
      `No se pudo leer brief en ${briefPath}: ${err.message ?? err}`,
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Brief en ${briefPath} no es JSON válido: ${err.message ?? err}\n` +
        `Primeros 200 chars: ${raw.slice(0, 200)}`,
    );
  }

  // Validación de schema mínimo. Antes solo chequeaba client + name; ahora
  // también validamos type (debe ser "gp" o "dev") y sector con contenido.
  // Sin esto, el wizard puede mandar valores erróneos y el scaffold queda
  // con strings vacíos en los placeholders del template.
  if (!parsed.client || typeof parsed.client !== "string") {
    throw new Error("Brief.client (slug) es requerido y debe ser string");
  }
  if (!parsed.name || typeof parsed.name !== "string") {
    throw new Error("Brief.name es requerido y debe ser string");
  }
  if (parsed.type && !["gp", "dev"].includes(parsed.type)) {
    throw new Error(
      `Brief.type debe ser "gp" o "dev" (recibido: "${parsed.type}")`,
    );
  }
  return parsed;
}

function applyVars(content, vars) {
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.replaceAll(`{{${key}}}`, String(value ?? "")),
    content,
  );
}

/**
 * Detecta placeholders sin reemplazar en el output renderizado. Si un
 * template usa {{TYPO_VAR}} (variable mal escrita o agregada nueva al
 * template sin agregar al `vars`), applyVars la deja como está. Antes
 * eso quedaba silencioso en el output del cliente y los agentes leían
 * "{{TYPO_VAR}}" como string literal en sus prompts. Ahora avisamos.
 */
function findUnresolvedPlaceholders(content) {
  const matches = content.match(/\{\{[A-Z_][A-Z0-9_]*\}\}/g);
  return matches ? Array.from(new Set(matches)) : [];
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

async function main() {
  const brief = loadBrief();
  const clientDir = join(CLIENTS_DIR, brief.client);
  const vars = {
    CLIENT_NAME: brief.name,
    CLIENT_SECTOR: brief.sector ?? "",
    CLIENT_COUNTRY: brief.country ?? "",
    CLIENT_TYPE: brief.type ?? "gp",
    CLIENT_TYPE_LABEL: TYPE_LABEL[brief.type] ?? "Growth Partner",
    CLIENT_FEE: brief.fee ?? "",
    CLIENT_METHOD: brief.method ?? "",
    CLIENT_PHASE: brief.phase ?? "Onboarding · Diagnostico",
    ONBOARDED_AT: new Date().toISOString().slice(0, 10),
  };

  const runId = brief.runId ?? null;

  if (existsSync(clientDir)) {
    const summary = `vault/clients/${brief.client} ya existe; no se sobreescribe`;
    console.log(`[client-bootstrap] ${summary}`);
    if (runId) {
      await updateAgentRun(runId, { status: "success", summary_md: summary });
    } else {
      await logAgentRun(brief.client, "client-bootstrap", "success", summary, { skipped: true });
    }
    return;
  }

  mkdirSync(clientDir, { recursive: true });

  const templateFiles = walk(TEMPLATES);
  const writtenFiles = [];
  const unresolvedReport = [];
  for (const tpl of templateFiles) {
    const relPath = relative(TEMPLATES, tpl).replace(/\.template\.md$/, ".md");
    const outPath = join(clientDir, relPath);
    mkdirSync(dirname(outPath), { recursive: true });
    const rendered = applyVars(readFileSync(tpl, "utf-8"), vars);
    const unresolved = findUnresolvedPlaceholders(rendered);
    if (unresolved.length > 0) {
      unresolvedReport.push({ file: relPath, placeholders: unresolved });
    }
    writeFileSync(outPath, rendered, "utf-8");
    writtenFiles.push(relPath);
  }

  if (unresolvedReport.length > 0) {
    // No tiramos error — el scaffold se creó OK. Pero loggeamos warning
    // ruidoso para que sea evidente que hay variables que no se mapean.
    // El director puede ver esto en el agent_output del run y decidir
    // si agregar la variable al brief o quitar el placeholder del template.
    console.warn(
      `[client-bootstrap] WARNING: ${unresolvedReport.length} archivo(s) tienen placeholders sin reemplazar:`,
    );
    for (const { file, placeholders } of unresolvedReport) {
      console.warn(`  ${file}: ${placeholders.join(", ")}`);
    }
  }

  // Empty asset dirs that agents expect
  for (const d of ["statics", "videos", "agent-reports"]) {
    mkdirSync(join(clientDir, d), { recursive: true });
  }

  const summary = `Scaffold inicial para ${brief.name} (${brief.client}) — ${writtenFiles.length} archivos`;
  console.log(`[client-bootstrap] ${summary}`);

  if (runId) {
    await updateAgentRun(runId, { status: "success", summary, summary_md: summary });
  } else {
    await logAgentRun(brief.client, "client-bootstrap", "success", summary, { files: writtenFiles });
  }

  // Si hubo placeholders sin reemplazar, agregar la info al output para que
  // el director lo vea desde el dashboard sin tener que leer logs.
  const bodyMd =
    `Se crearon ${writtenFiles.length} archivos en \`vault/clients/${brief.client}/\`:\n\n` +
    writtenFiles.map((f) => `- ${f}`).join("\n") +
    (unresolvedReport.length > 0
      ? `\n\n⚠️ **${unresolvedReport.length} archivo(s) con placeholders sin reemplazar:**\n` +
        unresolvedReport
          .map(
            ({ file, placeholders }) =>
              `- \`${file}\`: ${placeholders.join(", ")}`,
          )
          .join("\n") +
        `\n\nEsto significa que el template usa variables que no están en el brief. Editar el template o agregar las variables al wizard.`
      : "");

  await registerAgentOutput(runId, brief.client, "client-bootstrap", {
    output_type: "report",
    title: `Vault inicializada para ${brief.name}`,
    body_md: bodyMd,
    structured: {
      files: writtenFiles,
      client: brief.client,
      unresolved_placeholders: unresolvedReport.length > 0 ? unresolvedReport : null,
    },
  });

  await pushNotification(
    brief.client,
    "success",
    `${brief.name} listo en la vault`,
    `Los agentes ya pueden leer el contexto del cliente.`,
    { agent: "client-bootstrap", link: `/cliente/${brief.client}` },
  );
}

try {
  await main();
} catch (err) {
  console.error("[client-bootstrap] error:", err);
  const brief = (() => {
    try { return loadBrief(); } catch { return { client: "_unknown" }; }
  })();
  try {
    await logAgentError(brief.client, "client-bootstrap", err);
    if (brief.runId) {
      await updateAgentRun(brief.runId, {
        status: "error",
        summary: err.message,
      });
    }
  } catch (logErr) {
    console.error("[client-bootstrap] failed to log error:", logErr.message);
  }
  // Drain antes de exit: HTTP/Supabase clients pueden tener requests en flight
  await new Promise((r) => setTimeout(r, 800));
  process.exit(1);
}
