/**
 * coverage — ¿el proveedor de contactos sirve para NUESTRO mercado?
 *
 * Antes de pagar una suscripción de enriquecimiento, esto la mide contra
 * las empresas que ya tenemos en el pipeline y responde con números:
 * cuántas encuentra, en cuántas hay alguien con el cargo que buscamos, y
 * de esas cuántas tienen email disponible.
 *
 * IMPORTANTE: usa SOLO la búsqueda de personas → **gasta cero créditos**.
 * El revelado de datos (lo que cuesta) no se toca acá.
 *
 * Por qué existe: Apollo es fuerte en EEUU y, dentro de Latam, en Brasil y
 * México. Uruguay —nuestro mercado principal— es de sus zonas más flojas.
 * En vez de asumir, medimos.
 *
 * Uso:
 *   node scripts/prospeccion/coverage.js            (20 empresas del pipeline)
 *   node scripts/prospeccion/coverage.js --limit 40
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  logAgentRun,
  logAgentError,
  updateAgentRun,
  registerAgentOutput,
  pushNotification,
} from "../lib/supabase.js";
import { enrichmentStatus, measureCoverage, checkBudget } from "../lib/enrichment.js";

const AGENT = "prospeccion-coverage";
const __dirname = dirname(fileURLToPath(import.meta.url));
const VAULT = resolve(__dirname, "../../vault");

const SUPABASE_URL = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
const SUPABASE_KEY = process.env.SUPABASE_KEY?.trim();

function argValue(flag, fallback) {
  const args = process.argv.slice(2);
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

/** Títulos objetivo: los de la campaña activa, o los del método del vault. */
async function loadTargeting() {
  const titles = new Set();
  const seniorities = new Set();
  const locations = new Set();

  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/prospect_campaigns?status=eq.active&select=roles,seniorities,countries,cities`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } },
      );
      if (res.ok) {
        for (const c of await res.json()) {
          for (const r of c.roles ?? []) titles.add(r);
          for (const s of c.seniorities ?? []) seniorities.add(s);
          for (const g of [...(c.countries ?? []), ...(c.cities ?? [])]) locations.add(g);
        }
      }
    } catch {
      /* seguimos con el fallback del vault */
    }
  }

  if (titles.size === 0) {
    // Fallback: los puestos del método.
    try {
      const md = readFileSync(resolve(VAULT, "agents/prospeccion/busquedas.md"), "utf-8");
      const seccion = md.split(/^## /m).find((s) => s.toLowerCase().startsWith("keywords"));
      for (const line of (seccion ?? "").split("\n")) {
        const m = line.match(/^-\s*(.+)$/);
        if (m) for (const kw of m[1].split("/")) titles.add(kw.trim());
      }
    } catch {
      /* sin vault, buscamos genérico */
    }
  }
  if (titles.size === 0) {
    ["marketing manager", "community manager", "head of marketing"].forEach((t) => titles.add(t));
  }
  if (locations.size === 0) locations.add("Uruguay");

  return {
    titles: [...titles].slice(0, 12),
    seniorities: [...seniorities],
    locations: [...locations].slice(0, 5),
  };
}

async function fetchCompanies(limit) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("SUPABASE_URL / SUPABASE_KEY no están seteadas.");
  }
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/leads?select=company,company_domain&order=created_at.desc&limit=${limit}`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } },
  );
  if (!res.ok) throw new Error(`no pude leer leads: ${await res.text()}`);
  const rows = await res.json();
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const key = String(r.company ?? "").toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ company: r.company, domain: r.company_domain ?? null });
  }
  return out;
}

function buildReport(results, targeting, budget) {
  const total = results.length;
  const conAlguien = results.filter((r) => r.found > 0).length;
  const conEmail = results.filter((r) => r.withEmail > 0).length;
  const pct = (n) => (total === 0 ? "0%" : `${Math.round((n / total) * 100)}%`);

  const lines = [
    "# ¿Sirve el enriquecimiento para nuestro mercado?",
    "",
    `Medido sobre **${total} empresas reales** del pipeline. Esta prueba **no gastó créditos** (solo búsqueda, sin revelar datos).`,
    "",
    "| Métrica | Resultado |",
    "|---|---|",
    `| Empresas donde encontró a alguien | **${conAlguien}/${total}** (${pct(conAlguien)}) |`,
    `| Empresas con al menos un contacto con email | **${conEmail}/${total}** (${pct(conEmail)}) |`,
    "",
    `Cargos buscados: ${targeting.titles.join(", ")}`,
    `Ubicaciones: ${targeting.locations.join(", ")}`,
    "",
    "## Cómo leerlo",
    "",
    "- **Arriba de 60% con email**: el proveedor sirve, la suscripción se paga sola.",
    "- **Entre 30% y 60%**: sirve a medias — conviene usarlo solo para las empresas más grandes y seguir a mano con el resto.",
    "- **Abajo de 30%**: no lo pagues para este mercado. Es el escenario más probable en Uruguay, donde la cobertura de Apollo es floja; mejor buscar el contacto a mano o probar otro proveedor.",
    "",
    "## Detalle por empresa",
    "",
    "| Empresa | Personas | Con email | Cargos encontrados |",
    "|---|---|---|---|",
  ];
  for (const r of results) {
    lines.push(
      `| ${r.company} | ${r.error ? "—" : r.found} | ${r.error ? "—" : r.withEmail} | ${r.error ? `⚠ ${r.error.slice(0, 80)}` : r.sampleTitles.join(", ") || "—"} |`,
    );
  }
  if (budget && !budget.ok) {
    lines.push("", `_No pude leer el saldo de la cuenta: ${budget.reason}_`);
  }
  return lines.join("\n");
}

async function run() {
  const limit = Math.min(parseInt(argValue("--limit", "20"), 10) || 20, 60);

  const status = enrichmentStatus();
  if (!status.configured) {
    console.log(`[${AGENT}] ${status.reason}`);
    console.log(
      `[${AGENT}] Para medir cobertura: conseguí una API key de Apollo (necesita plan pago), seteala como APOLLO_API_KEY y volvé a correr esto. No se gastan créditos.`,
    );
    return;
  }

  const runId = await logAgentRun("_system", AGENT, "running", "Midiendo cobertura…", { limit });

  const [companies, targeting, budget] = await Promise.all([
    fetchCompanies(limit),
    loadTargeting(),
    checkBudget(),
  ]);

  if (companies.length === 0) {
    throw new Error("No hay empresas en el pipeline para medir. Corré el Prospector primero.");
  }

  console.log(`[${AGENT}] midiendo ${companies.length} empresas…`);
  const { results } = await measureCoverage(companies, targeting);

  const conEmail = results.filter((r) => r.withEmail > 0).length;
  const pct = Math.round((conEmail / results.length) * 100);
  const reportMd = buildReport(results, targeting, budget);

  await registerAgentOutput(runId, "_system", AGENT, {
    output_type: "report",
    title: `Cobertura del enriquecimiento: ${pct}% de las empresas con email`,
    body_md: reportMd,
    structured: { results, targeting, pct },
  });

  const summary = `${pct}% de ${results.length} empresas del pipeline tienen un contacto con email disponible.`;
  if (runId) await updateAgentRun(runId, { status: "success", summary });

  await pushNotification(
    null,
    pct >= 30 ? "info" : "warning",
    `Cobertura del enriquecimiento: ${pct}%`,
    `${summary} ${pct < 30 ? "Debajo del 30% no conviene pagar la suscripción para este mercado — ver el reporte." : "Ver el detalle en el reporte del run."}`,
    { agent: AGENT, link: "/hub/agentes", to_role: "director" },
  );

  console.log(`[${AGENT}] listo: ${summary}`);
  console.log(reportMd);
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  try {
    await run();
  } catch (err) {
    console.error(`[${AGENT}] ERROR:`, err.message);
    await logAgentError("_system", AGENT, err).catch(() => {});
    await new Promise((r) => setTimeout(r, 800));
    process.exit(1);
  }
}
