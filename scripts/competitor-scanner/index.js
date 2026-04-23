/**
 * Competitor Scanner
 *
 * Reads `vault/clients/<slug>/competitors.md` (one per client), parses the
 * manually curated piece entries, and registers the ones not yet in
 * `competitor_pieces` on Supabase. The Consultor uses this table to inject
 * `examples[]` into Content Creator briefs.
 *
 * This MVP is intentionally pragmatic: the user / team adds URLs + hooks +
 * performance notes to the markdown file. The scanner keeps Supabase in sync.
 * When platform APIs are wired up in a later milestone, the scanner can be
 * extended to fetch metrics automatically.
 *
 * Cron: 0 14 * * 1,3,5 (Mon/Wed/Fri, 11am Montevideo)
 *
 * Usage (CLI):
 *   node scripts/competitor-scanner/index.js            (scans every client under vault/clients/)
 *   node scripts/competitor-scanner/index.js <slug>     (scans only one)
 */

import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import {
  select,
  upsertRows,
  logAgentRun,
  logAgentError,
  pushNotification,
} from "../lib/supabase.js";

const AGENT = "competitor-scanner";
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const CLIENTS_DIR = resolve(REPO_ROOT, "vault/clients");

function loadBriefFromArgs() {
  const args = process.argv.slice(2);
  const briefFlagIdx = args.indexOf("--brief");
  if (briefFlagIdx !== -1 && args[briefFlagIdx + 1]) {
    return JSON.parse(readFileSync(args[briefFlagIdx + 1], "utf-8"));
  }
  const positional = args.filter((a) => !a.startsWith("--"))[0];
  return { client: positional || null };
}

function listClients() {
  if (!existsSync(CLIENTS_DIR)) return [];
  return readdirSync(CLIENTS_DIR).filter((name) => {
    const full = join(CLIENTS_DIR, name);
    return statSync(full).isDirectory() && !name.startsWith(".");
  });
}

/**
 * Parse competitors.md. Entries are blocks separated by `---` lines and each
 * block has a header `@handle | plataforma | url` followed by key: value lines.
 * Lines under "## Piezas capturadas" heading are parsed; anything above is
 * treated as metadata and ignored.
 */
function parseCompetitorsFile(content) {
  if (!content) return [];

  const capturedIdx = content.indexOf("## Piezas capturadas");
  const body = capturedIdx >= 0 ? content.slice(capturedIdx) : content;

  // strip HTML comments so they don't confuse the parser
  const stripped = body.replace(/<!--[\s\S]*?-->/g, "");

  // blocks split on `---` between entries
  const blocks = stripped
    .split(/^---\s*$/m)
    .map((b) => b.trim())
    .filter(Boolean);

  const entries = [];

  for (const block of blocks) {
    const lines = block.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    const header = lines.find((l) => /@\S+\s*\|/.test(l));
    if (!header) continue;

    const [handlePart, platformPart, urlPart] = header.split("|").map((s) => s.trim());
    const competitor = handlePart.replace(/^@/, "");
    const platform = platformPart || null;
    const url = urlPart || null;
    if (!competitor || !url) continue;

    const entry = {
      competitor,
      platform,
      url,
      piece_type: null,
      hook: null,
      format: null,
      notes: null,
      performance_estimate: {},
    };

    for (const line of lines) {
      const m = line.match(/^([a-zA-Z_]+)\s*:\s*(.+)$/);
      if (!m) continue;
      const key = m[1].toLowerCase();
      const val = m[2].trim().replace(/^"|"$/g, "");
      if (key === "tipo" || key === "type") entry.piece_type = val;
      else if (key === "hook") entry.hook = val;
      else if (key === "format" || key === "formato") entry.format = val;
      else if (key === "notas" || key === "notes") entry.notes = val;
      else if (key === "performance") {
        // "views=12k, likes=800, comments=45"
        const kv = {};
        for (const pair of val.split(",")) {
          const [k, v] = pair.split("=").map((s) => s.trim());
          if (k && v) kv[k] = parseNumberWithSuffix(v);
        }
        entry.performance_estimate = kv;
      }
    }

    entries.push(entry);
  }

  return entries;
}

function parseNumberWithSuffix(v) {
  const m = String(v).trim().toLowerCase().match(/^([\d.]+)([km])?$/);
  if (!m) return v;
  const num = parseFloat(m[1]);
  if (m[2] === "k") return num * 1000;
  if (m[2] === "m") return num * 1_000_000;
  return num;
}

async function scanClient(clientSlug) {
  const filePath = join(CLIENTS_DIR, clientSlug, "competitors.md");
  if (!existsSync(filePath)) {
    console.log(`[${AGENT}] ${clientSlug}: no competitors.md — skipping.`);
    return { captured: 0, total: 0 };
  }

  const raw = readFileSync(filePath, "utf-8");
  const entries = parseCompetitorsFile(raw);
  if (entries.length === 0) {
    console.log(`[${AGENT}] ${clientSlug}: competitors.md has no valid entries.`);
    return { captured: 0, total: 0 };
  }

  // Pull existing URLs so we only insert truly new pieces.
  const existing = await select(
    "competitor_pieces",
    { client: clientSlug },
    "url",
    { limit: 1000 }
  );
  const existingUrls = new Set((existing ?? []).map((r) => r.url).filter(Boolean));

  const fresh = entries
    .filter((e) => e.url && !existingUrls.has(e.url))
    .map((e) => ({
      client: clientSlug,
      competitor: e.competitor,
      platform: e.platform,
      url: e.url,
      piece_type: e.piece_type,
      hook: e.hook,
      format: e.format,
      performance_estimate: e.performance_estimate ?? {},
      notes: e.notes,
    }));

  if (fresh.length === 0) {
    console.log(
      `[${AGENT}] ${clientSlug}: ${entries.length} entries, 0 nuevas (ya capturadas).`
    );
    return { captured: 0, total: entries.length };
  }

  await upsertRows("competitor_pieces", fresh, "client,url");
  console.log(
    `[${AGENT}] ${clientSlug}: ${fresh.length} piezas nuevas capturadas de ${entries.length}.`
  );

  return { captured: fresh.length, total: entries.length };
}

export async function run(briefInput) {
  const startTime = Date.now();
  const brief = briefInput ?? loadBriefFromArgs();
  const onlyClient = brief?.client ?? null;

  const targets = onlyClient ? [onlyClient] : listClients();
  console.log(`[${AGENT}] scanning ${targets.length} client(s)…`);

  let totalCaptured = 0;
  let totalEntries = 0;

  for (const slug of targets) {
    try {
      const { captured, total } = await scanClient(slug);
      totalCaptured += captured;
      totalEntries += total;

      if (captured > 0) {
        await pushNotification(
          slug,
          "info",
          `Competencia: ${captured} piezas nuevas`,
          `Capturadas de competitors.md (${total} entradas totales).`,
          { agent: AGENT, link: `/cliente/${slug}/biblioteca/competencia` }
        );
      }
    } catch (err) {
      console.warn(`[${AGENT}] ${slug} failed: ${err.message}`);
    }
  }

  const summary = `Scan completo: ${totalCaptured} piezas nuevas, ${totalEntries} totales en ${targets.length} cliente(s).`;
  await logAgentRun(
    onlyClient ?? "_system",
    AGENT,
    "success",
    summary,
    { clients: targets.length, captured: totalCaptured, total: totalEntries },
    { duration_ms: Date.now() - startTime }
  );

  console.log(`[${AGENT}] done. ${summary}`);
  return { clients: targets.length, captured: totalCaptured, total: totalEntries };
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  run().catch(async (err) => {
    console.error(`[${AGENT}] failed:`, err.message);
    const brief = (() => {
      try {
        return loadBriefFromArgs();
      } catch {
        return { client: null };
      }
    })();
    await logAgentError(brief.client ?? "_system", AGENT, err, {});
    process.exit(1);
  });
}
