/**
 * Brand loader — helper compartido para agentes que corren en GHA y leen
 * el `brand/` del cliente desde el filesystem (el repo está checkout-eado).
 *
 * En Vercel, los fast-path agents reciben `vaultContext` precargado con
 * loadClientBrand() del vault-loader.ts. Este módulo NO se usa allí.
 *
 * Cada agente declara su whitelist de archivos del brand/. Si pasa "*",
 * lee todos. Si pasa una lista, solo lee esos. Si un archivo no existe,
 * se omite silenciosamente (el cliente puede no tener todas las secciones).
 */

import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";

/**
 * Lee los archivos del `brand/` de un cliente y devuelve un map
 * `{ "positioning": "...", "voice-operational": "...", ... }`.
 *
 * @param {string} vaultRoot — ruta absoluta al folder `vault/` del repo.
 * @param {string} client    — slug del cliente.
 * @param {"*"|string[]} whitelist — lista de archivos a leer (sin extensión)
 *                                    o "*" para todos los `.md` directos.
 * @returns {Record<string, string>} — map de archivos cargados.
 */
export function loadBrandFiles(vaultRoot, client, whitelist = "*") {
  const brandDir = resolve(vaultRoot, "clients", client, "brand");

  let availableFiles;
  try {
    availableFiles = readdirSync(brandDir).filter((f) => f.endsWith(".md"));
  } catch {
    // El folder no existe (cliente sin brandbook procesado todavía).
    return {};
  }

  const filesToLoad =
    whitelist === "*"
      ? availableFiles
      : whitelist.map((name) => (name.endsWith(".md") ? name : `${name}.md`));

  const out = {};
  for (const filename of filesToLoad) {
    if (!availableFiles.includes(filename)) continue;
    try {
      const content = readFileSync(resolve(brandDir, filename), "utf-8");
      const key = filename.replace(/\.md$/, "");
      out[key] = content;
    } catch {
      // skip silently
    }
  }
  return out;
}

/**
 * Renderiza el `brand/` cargado como un bloque para inyectar en el prompt
 * de un agente. Cada archivo aparece como sub-sección con header.
 */
export function buildBrandBlock(brand, sectionTitle = "BRANDBOOK DEL CLIENTE") {
  const entries = Object.entries(brand).filter(
    ([, body]) => body && body.trim().length > 0,
  );
  if (entries.length === 0) {
    return `${sectionTitle}: (sin brandbook procesado todavía)`;
  }

  const TITLES = {
    "positioning": "Positioning",
    "voice-operational": "Voz Operativa",
    "voice-character": "Voz del Personaje",
    "voice-decision": "Decisión de Voz",
    "visual-identity": "Identidad Visual",
    "photography": "Fotografía",
    "content-formats": "Formatos de Contenido",
    "restrictions": "Restricciones",
  };

  const parts = [`${sectionTitle}:`];
  for (const [key, body] of entries) {
    const title = TITLES[key] ?? key;
    parts.push(`\n## ${key} (${title})\n${body}`);
  }
  return parts.join("\n");
}
