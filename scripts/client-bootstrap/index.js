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
  const raw = JSON.parse(readFileSync(resolve(process.cwd(), args[briefFlagIdx + 1]), "utf-8"));
  if (!raw.client || !raw.name) {
    throw new Error("Brief must include 'client' (slug) and 'name'");
  }
  return raw;
}

function applyVars(content, vars) {
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.replaceAll(`{{${key}}}`, String(value ?? "")),
    content,
  );
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
  for (const tpl of templateFiles) {
    const relPath = relative(TEMPLATES, tpl).replace(/\.template\.md$/, ".md");
    const outPath = join(clientDir, relPath);
    mkdirSync(dirname(outPath), { recursive: true });
    const rendered = applyVars(readFileSync(tpl, "utf-8"), vars);
    writeFileSync(outPath, rendered, "utf-8");
    writtenFiles.push(relPath);
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

  await registerAgentOutput(runId, brief.client, "client-bootstrap", {
    output_type: "report",
    title: `Vault inicializada para ${brief.name}`,
    body_md: `Se crearon ${writtenFiles.length} archivos en \`vault/clients/${brief.client}/\`:\n\n${writtenFiles.map((f) => `- ${f}`).join("\n")}`,
    structured: { files: writtenFiles, client: brief.client },
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
  await logAgentError(brief.client, "client-bootstrap", err);
  if (brief.runId) {
    await updateAgentRun(brief.runId, { status: "error", summary: err.message });
  }
  process.exit(1);
}
