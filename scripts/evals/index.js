/**
 * evals — juez semanal de los 3 sets dorados (Stage 2c).
 *
 * Para cada set (fases / creative / trends):
 *   1. Carga la RUBRIC versionada (vault/agency/evals/rubric-<set>.md).
 *   2. Junta CANDIDATOS recientes del sistema (drafts y aprobados) y
 *      GOLDENS (outputs ya aprobados por los socios — la aprobación en el
 *      dashboard ES la curaduría del set dorado).
 *   3. Haiku evalúa cada candidato contra la rubric con los goldens como
 *      referencia → score 0-100 + verdict + razones (JSON estricto con
 *      parse defensivo + 1 retry — patrón #4 del repo).
 *   4. Escribe eval_runs + notificación resumen al director.
 *
 * "Evals verdes" (trigger H2): promedio ≥75 en 30 días sin fails repetidos.
 *
 * Uso:
 *   node scripts/evals/index.js --brief /tmp/brief.json
 *   brief = { "set": "all" | "fases" | "creative" | "trends", "source": "scheduled" }
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  select,
  logAgentRun,
  logAgentError,
  updateAgentRun,
  pushNotification,
} from "../lib/supabase.js";
import { callClaude, CLAUDE_MODEL_HAIKU } from "../lib/anthropic.js";

const AGENT = "evals";
const MAX_ITEMS_PER_SET = 6;
const MAX_ITEM_CHARS = 7000;
const MAX_GOLDEN_CHARS = 2500;

const __dirname = dirname(fileURLToPath(import.meta.url));
const VAULT = resolve(__dirname, "../../vault");

// El insert de eval_runs va directo por REST (helper local — supabase.js
// no exporta insert genérico).
const SUPABASE_URL = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
const SUPABASE_KEY = process.env.SUPABASE_KEY?.trim();

async function insertEvalRows(rows) {
  if (!SUPABASE_URL || !SUPABASE_KEY || rows.length === 0) return;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/eval_runs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    throw new Error(`insert eval_runs falló: ${await res.text()}`);
  }
}

function readRubric(set) {
  const path = resolve(VAULT, `agency/evals/rubric-${set}.md`);
  return readFileSync(path, "utf8");
}

function clip(text, max) {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}\n[...recortado...]` : text;
}

// ---------------------------------------------------------------------------
// Candidatos + goldens por set
// ---------------------------------------------------------------------------

async function gatherFases() {
  const rows = await select(
    "phase_reports",
    {},
    "client_id, phase, status, version, content_md, generated_at",
    { order: "generated_at.desc", limit: 25 },
  );
  const withContent = (rows ?? []).filter((r) => r.content_md);
  const candidates = withContent.slice(0, MAX_ITEMS_PER_SET).map((r) => ({
    ref: `phase:${r.client_id}:${r.phase}:v${r.version ?? 1}`,
    label: `${r.client_id} · ${r.phase} (${r.status})`,
    content: clip(r.content_md, MAX_ITEM_CHARS),
  }));
  const goldens = withContent
    .filter((r) => r.status === "approved")
    .slice(0, 2)
    .map((r) => clip(r.content_md, MAX_GOLDEN_CHARS));
  return { candidates, goldens };
}

async function gatherCreative() {
  const rows = await select(
    "content_posts",
    { source: "ai" },
    "id, client_id, date, network, format, status, idea, copy, brief, cta",
    { order: "date.desc", limit: 40 },
  );
  const toText = (p) =>
    `RED: ${p.network} · FORMATO: ${p.format} · FECHA: ${p.date}\nIDEA: ${p.idea ?? "-"}\nCOPY: ${p.copy ?? "-"}\nBRIEF: ${p.brief ?? "-"}\nCTA: ${p.cta ?? "-"}`;
  const all = rows ?? [];
  const candidates = all.slice(0, MAX_ITEMS_PER_SET).map((p) => ({
    ref: `post:${p.id}`,
    label: `${p.client_id} · ${p.network}/${p.format} ${p.date} (${p.status})`,
    content: clip(toText(p), MAX_ITEM_CHARS),
  }));
  const goldens = all
    .filter((p) => p.status === "scheduled" || p.status === "published")
    .slice(0, 3)
    .map((p) => clip(toText(p), MAX_GOLDEN_CHARS));
  return { candidates, goldens };
}

async function gatherTrends() {
  const rows = await select(
    "agent_outputs",
    { agent: "sector-trends" },
    "id, client, title, body_md, created_at",
    { order: "created_at.desc", limit: 8 },
  );
  const withBody = (rows ?? []).filter((r) => r.body_md);
  const candidates = withBody.slice(0, MAX_ITEMS_PER_SET).map((r) => ({
    ref: `output:${r.id}`,
    label: `${r.client ?? "agencia"} · ${(r.title ?? "trends").slice(0, 60)}`,
    content: clip(r.body_md, MAX_ITEM_CHARS),
  }));
  // El reporte más viejo del lote sirve de referencia anti-refrito.
  const goldens = withBody.slice(-1).map((r) => clip(r.body_md, MAX_GOLDEN_CHARS));
  return { candidates, goldens };
}

const SETS = {
  fases: gatherFases,
  creative: gatherCreative,
  trends: gatherTrends,
};

// ---------------------------------------------------------------------------
// Juez
// ---------------------------------------------------------------------------

function parseVerdict(text) {
  // JSON estricto pedido; parse defensivo: buscar el primer {...}.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    const score = Math.round(Number(parsed.score));
    const verdict = parsed.verdict === "pass" ? "pass" : parsed.verdict === "fail" ? "fail" : null;
    if (!Number.isFinite(score) || score < 0 || score > 100 || !verdict) return null;
    const reasons = Array.isArray(parsed.reasons)
      ? parsed.reasons.filter((r) => typeof r === "string").slice(0, 6)
      : [];
    return { score, verdict, reasons };
  } catch {
    return null;
  }
}

async function judge(set, rubric, goldens, item) {
  const goldenBlock =
    goldens.length > 0
      ? `EJEMPLOS APROBADOS POR LOS SOCIOS (el estándar real — usalos como vara):\n${goldens
          .map((g, i) => `--- GOLDEN ${i + 1} ---\n${g}`)
          .join("\n\n")}`
      : "SIN GOLDENS TODAVÍA (no hay outputs aprobados de este tipo — evaluá solo contra la rubric).";

  const prompt = `Evaluá este output del set "${set}" contra la rubric. Sé exigente pero justo: la rubric manda, los goldens calibran.

=== RUBRIC ===
${rubric}

=== ${goldenBlock}

=== OUTPUT A EVALUAR (${item.label}) ===
${item.content}

Respondé SOLO este JSON (sin texto antes ni después):
{"score": <0-100 según los pesos de la rubric>, "verdict": "pass"|"fail" (según la regla Verdict de la rubric), "reasons": ["máx 6 razones concretas, las que restaron puntos primero"]}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const { text } = await callClaude(prompt, {
      model: CLAUDE_MODEL_HAIKU,
      maxTokens: 600,
      source: `agent:${AGENT}`,
    });
    const parsed = parseVerdict(text);
    if (parsed) return parsed;
    console.warn(`  juez devolvió JSON inválido (intento ${attempt}/2)`);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function loadBrief() {
  const idx = process.argv.indexOf("--brief");
  if (idx === -1 || !process.argv[idx + 1]) return { set: "all", source: "manual" };
  return JSON.parse(readFileSync(process.argv[idx + 1], "utf8"));
}

async function main() {
  const brief = loadBrief();
  const setsToRun =
    brief.set && brief.set !== "all" ? [brief.set] : Object.keys(SETS);
  const batchId = randomUUID();
  console.log(`Evals — sets: ${setsToRun.join(", ")} · batch ${batchId}`);

  const run = await logAgentRun("_system", AGENT, "running", `evals: ${setsToRun.join(",")}`);
  const runId = run?.id ?? null;

  const summary = [];
  try {
    for (const set of setsToRun) {
      if (!SETS[set]) {
        console.warn(`Set desconocido: ${set} — salteado`);
        continue;
      }
      const rubric = readRubric(set);
      const { candidates, goldens } = await SETS[set]();
      console.log(`[${set}] ${candidates.length} candidatos · ${goldens.length} goldens`);
      if (candidates.length === 0) {
        summary.push(`${set}: sin outputs para evaluar todavía`);
        continue;
      }

      const rows = [];
      for (const item of candidates) {
        const result = await judge(set, rubric, goldens, item);
        if (!result) {
          console.warn(`  ${item.ref}: juez sin verdict válido — salteado`);
          continue;
        }
        console.log(`  ${item.ref}: ${result.score} (${result.verdict})`);
        rows.push({
          batch_id: batchId,
          set,
          item_ref: item.ref,
          item_label: item.label,
          score: result.score,
          verdict: result.verdict,
          reasons: result.reasons,
          model: CLAUDE_MODEL_HAIKU,
        });
      }
      await insertEvalRows(rows);

      const avg =
        rows.length > 0
          ? Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length)
          : 0;
      const fails = rows.filter((r) => r.verdict === "fail");
      summary.push(
        `${set}: promedio ${avg}/100 (${rows.length} evaluados${fails.length > 0 ? `, ${fails.length} FAIL: ${fails.map((f) => f.item_label).join("; ").slice(0, 150)}` : ", 0 fails"})`,
      );
    }

    await pushNotification(
      null,
      summary.some((s) => s.includes("FAIL")) ? "warning" : "info",
      "Evals semanales — sets dorados",
      `${summary.join("\n")}\nVerde = promedio ≥75 sin fails repetidos (trigger H2). Detalle en eval_runs; rubrics editables en vault/agency/evals/.`,
      { agent: AGENT, to_role: "director", dedupKey: `evals-${new Date().toISOString().slice(0, 10)}` },
    );

    if (runId) {
      await updateAgentRun(runId, {
        status: "success",
        summary: summary.join(" · ").slice(0, 400),
      });
    }
    console.log("Evals OK:", summary.join(" · "));
  } catch (err) {
    console.error("Evals ERROR:", err);
    await logAgentError("_system", AGENT, err);
    if (runId) {
      await updateAgentRun(runId, { status: "error", summary: String(err.message ?? err) });
    }
    // Drain: que los logs lleguen a Supabase antes de salir (patrón #5).
    await new Promise((r) => setTimeout(r, 800));
    process.exit(1);
  }
}

main();
