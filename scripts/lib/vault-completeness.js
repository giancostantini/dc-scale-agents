/**
 * vault-completeness.js — Guardrail anti-alucinación.
 *
 * El bootstrap de un cliente nuevo deja `claude-client.md` y `strategy.md`
 * con placeholders ("_A completar en el kickoff._") y sin `brand/`. Si un
 * agente corre sobre un vault así y NO lo detecta, rellena los huecos con
 * "buenas prácticas genéricas del sector" — que es exactamente lo que el
 * cliente percibe como alucinación.
 *
 * Este módulo detecta qué falta y arma un bloque de instrucción para inyectar
 * en el prompt: "no inventes estos datos; marcá FALTA INFO". Los agentes lo
 * usan para degradar con honestidad en vez de fabricar contexto.
 *
 * No lanza: si no encuentra un archivo, lo reporta como faltante.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// Marcadores que deja el scaffold del bootstrap (templates client-scaffold).
const PLACEHOLDER_PATTERNS = [
  /_a completar/i,
  /el consultor (va a |)actualiz/i,
  /el consultor y los agentes escriben/i,
];

// Secciones de claude-client.md que, en placeholder, fuerzan output genérico.
// El `heading` matchea el "## <heading>" del template (sin acentos, como el archivo).
const KEY_SECTIONS = [
  { heading: "Productos principales", label: "productos" },
  { heading: "Cliente ideal", label: "cliente ideal" },
  { heading: "Tono de comunicacion", label: "tono de comunicación" },
  { heading: "Propuesta de valor", label: "propuesta de valor" },
  { heading: "Restricciones", label: "restricciones" },
];

function readClientFile(vaultRoot, client, rel) {
  try {
    return readFileSync(resolve(vaultRoot, "clients", client, rel), "utf-8");
  } catch {
    return null;
  }
}

/** Extrae el cuerpo de una sección "## <heading>" hasta el próximo "## ". */
function extractSection(md, heading) {
  // headings del template son alfanuméricos + espacios → sin specials que escapar
  const re = new RegExp(`##\\s*${heading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, "i");
  const m = md.match(re);
  return m ? m[1].trim() : null;
}

/** True si el texto es un placeholder o son solo labels vacíos ("- Edad:"). */
function isPlaceholder(text) {
  const t = (text || "").trim();
  if (!t) return true;
  if (PLACEHOLDER_PATTERNS.some((re) => re.test(t))) return true;
  const lines = t.split("\n").map((l) => l.trim()).filter(Boolean);
  // Sección de puros labels sin valor: "- Edad:", "ROAS objetivo:", etc.
  const allEmptyLabels =
    lines.length > 0 &&
    lines.every(
      (l) => /^[-*]?\s*[\wáéíóúñ /()]+:\s*$/i.test(l) || /^#{1,6}\s/.test(l),
    );
  return allEmptyLabels;
}

/**
 * Evalúa qué tan completo está el vault "core" de un cliente.
 *
 * @returns {{ complete: boolean, score: number, missing: string[], hasBrand: boolean, exists: boolean }}
 */
export function assessClientVault(vaultRoot, client) {
  const claudeClient = readClientFile(vaultRoot, client, "claude-client.md");
  if (!claudeClient) {
    return {
      complete: false,
      score: 0,
      missing: ["claude-client.md (no existe)"],
      hasBrand: false,
      exists: false,
    };
  }

  const missing = [];
  for (const sec of KEY_SECTIONS) {
    const body = extractSection(claudeClient, sec.heading);
    if (!body || isPlaceholder(body)) missing.push(sec.label);
  }

  const strategy = readClientFile(vaultRoot, client, "strategy.md");
  if (!strategy || isPlaceholder(strategy)) missing.push("estrategia");

  const positioning = readClientFile(vaultRoot, client, "brand/positioning.md");
  const hasBrand = Boolean(positioning && positioning.trim().length > 0);
  if (!hasBrand) missing.push("brandbook (brand/)");

  const totalChecks = KEY_SECTIONS.length + 2; // + estrategia + brand
  const score = Math.max(0, 1 - missing.length / totalChecks);

  return {
    complete: missing.length === 0,
    score: Number(score.toFixed(2)),
    missing,
    hasBrand,
    exists: true,
  };
}

/**
 * Bloque de instrucción para inyectar en el prompt cuando el vault está flaco.
 * Devuelve "" si el vault está completo (no ensucia el prompt).
 */
export function buildVaultGuardrailBlock(assessment, client) {
  if (!assessment || assessment.complete) return "";
  return [
    `--- ⚠️ VAULT INCOMPLETO PARA "${client}" — LEER ANTES DE GENERAR ---`,
    `Faltan datos REALES del cliente: ${assessment.missing.join(", ")}.`,
    ``,
    `REGLAS CRÍTICAS (anti-alucinación):`,
    `1. NO inventes ni asumas esos datos faltantes. No los completes con "buenas prácticas genéricas del sector" como si fueran del cliente.`,
    `2. Donde necesites un dato que falta, escribí explícitamente "FALTA INFO: <qué necesitás del equipo>" en vez de fabricarlo.`,
    `3. Trabajá solo con lo que SÍ está cargado en el contexto. Es preferible un output más corto y honesto que uno completo pero inventado.`,
  ].join("\n");
}
