/**
 * Asset Sync — descarga los assets de un cliente desde Supabase Storage
 * (`client-assets/<clientId>/*`) al filesystem local, listo para que
 * Remotion los consuma como `/assets/<clientId>/...`.
 *
 * Uso típico desde produce-video.js (antes del render):
 *
 *   const assetMap = await syncClientAssets(
 *     "wiztrip",
 *     resolve(REMOTION_DIR, "public/assets/wiztrip")
 *   );
 *   // assetMap = {
 *   //   "wizzo-color-magia": "/assets/wiztrip/mascot/wizzo-color-magia.png",
 *   //   "logotipo-blanco": "/assets/wiztrip/logo/logotipo-blanco.svg",
 *   //   ...
 *   // }
 *
 * Después la composición Remotion puede hacer:
 *   <Img src={staticFile("assets/wiztrip/mascot/wizzo-color-magia.png")} />
 *
 * Env vars consumidas:
 *   SUPABASE_URL  — proyecto del dashboard
 *   SUPABASE_KEY  — service_role (para listar y descargar todos los assets)
 */

import { writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync } from "fs";
import { resolve, dirname } from "path";

const BUCKET = "client-assets";

// Strip whitespace y trailing slash igual que en lib/supabase.js
const SUPABASE_URL = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
const SUPABASE_KEY = process.env.SUPABASE_KEY?.trim();

const CATEGORIES = ["logo", "mascot", "patterns", "inspiration"];

function authHeaders() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  };
}

/**
 * Lista los archivos de una "carpeta" del bucket via Storage REST API.
 */
async function listFolder(prefix) {
  const url = `${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      prefix,
      limit: 200,
      sortBy: { column: "name", order: "asc" },
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`asset-sync: list ${prefix} → ${res.status}: ${txt.slice(0, 200)}`);
  }
  return await res.json();
}

/**
 * Descarga un archivo del bucket y lo escribe a disco.
 */
async function downloadObject(objectPath, targetFile) {
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectPath}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(
      `asset-sync: download ${objectPath} → ${res.status}: ${txt.slice(0, 200)}`,
    );
  }
  const buf = Buffer.from(await res.arrayBuffer());
  mkdirSync(dirname(targetFile), { recursive: true });
  writeFileSync(targetFile, buf);
  return buf.length;
}

/**
 * Saca la extensión de un filename (sin el punto).
 */
function fileExtension(filename) {
  const m = filename.match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toLowerCase() : "";
}

/**
 * Convierte filename "wizzo-color-magia.png" → canonical name "wizzo-color-magia".
 */
function stripExtension(filename) {
  return filename.replace(/\.[a-zA-Z0-9]+$/, "");
}

/**
 * Sincroniza TODOS los assets del cliente al targetDir local.
 *
 * @param {string} clientId — slug del cliente
 * @param {string} targetDir — directorio local donde guardar (ej. remotion-studio/public/assets/<clientId>)
 * @param {Object} [opts]
 * @param {boolean} [opts.purgeStale=true] — borrar archivos locales que ya no están en el bucket
 * @returns {Promise<{
 *   assetMap: Record<string, { localPath: string, publicPath: string, category: string, filename: string }>,
 *   downloaded: number,
 *   purged: number,
 *   errors: string[],
 * }>}
 *
 * `localPath` es absoluto (filesystem). `publicPath` es relativo al
 * `public/` de Remotion, listo para usar con `staticFile()`.
 */
export async function syncClientAssets(clientId, targetDir, opts = {}) {
  const { purgeStale = true } = opts;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("asset-sync: faltan env vars SUPABASE_URL / SUPABASE_KEY");
  }
  if (!clientId || !/^[a-z0-9-]+$/.test(clientId)) {
    throw new Error(`asset-sync: clientId inválido: ${clientId}`);
  }

  console.log(`[asset-sync] sincronizando ${clientId} → ${targetDir}`);

  const assetMap = {};
  const errors = [];
  let downloaded = 0;

  // Descubrir todos los archivos remotos primero
  const remoteFiles = []; // { category, name, path }
  for (const category of CATEGORIES) {
    try {
      const list = await listFolder(`${clientId}/${category}`);
      for (const f of list) {
        if (!f.name || f.name === ".emptyFolderPlaceholder") continue;
        if (!f.id) continue; // skip subfolders
        remoteFiles.push({
          category,
          name: f.name,
          path: `${clientId}/${category}/${f.name}`,
        });
      }
    } catch (err) {
      errors.push(`list ${category}: ${err.message}`);
    }
  }

  // Descargar todo en paralelo (con límite suave — Storage es rápido)
  const tasks = remoteFiles.map(async (file) => {
    const localFile = resolve(targetDir, file.category, file.name);
    const publicPath = `assets/${clientId}/${file.category}/${file.name}`;
    const canonicalName = stripExtension(file.name);
    try {
      await downloadObject(file.path, localFile);
      downloaded++;
      assetMap[canonicalName] = {
        localPath: localFile,
        publicPath,
        category: file.category,
        filename: file.name,
      };
    } catch (err) {
      errors.push(`download ${file.path}: ${err.message}`);
    }
  });
  await Promise.all(tasks);

  // Purga: borrar archivos locales que ya no están en remoto
  let purged = 0;
  if (purgeStale && existsSync(targetDir)) {
    const localFilesByCategory = {};
    for (const category of CATEGORIES) {
      const catDir = resolve(targetDir, category);
      if (!existsSync(catDir)) continue;
      try {
        localFilesByCategory[category] = readdirSync(catDir).filter((n) => {
          const full = resolve(catDir, n);
          return statSync(full).isFile();
        });
      } catch {
        localFilesByCategory[category] = [];
      }
    }
    const remoteSet = new Set(
      remoteFiles.map((f) => `${f.category}/${f.name}`),
    );
    for (const [category, files] of Object.entries(localFilesByCategory)) {
      for (const filename of files) {
        const key = `${category}/${filename}`;
        if (!remoteSet.has(key)) {
          try {
            rmSync(resolve(targetDir, category, filename));
            purged++;
          } catch (err) {
            errors.push(`purge ${key}: ${err.message}`);
          }
        }
      }
    }
  }

  console.log(
    `[asset-sync] ${clientId}: ${downloaded} descargados, ${purged} purgados, ${Object.keys(assetMap).length} disponibles, ${errors.length} errores`,
  );
  if (errors.length > 0) {
    for (const e of errors) console.warn(`[asset-sync]   error: ${e}`);
  }

  return { assetMap, downloaded, purged, errors };
}

/**
 * Renderiza el assetMap como un bloque Markdown que se puede inyectar en
 * el prompt de Claude para que sepa qué assets hay disponibles localmente
 * y con qué path referencialos.
 */
export function buildAssetMapBlock(assetMap) {
  const entries = Object.entries(assetMap);
  if (entries.length === 0) {
    return "ASSETS DISPONIBLES (sincronizados al filesystem): ninguno. Si tu storyboard referencia assets visuales por canonical name, listalos como faltantes — el equipo va a tener que subirlos.";
  }
  const byCategory = {};
  for (const [canonical, info] of entries) {
    (byCategory[info.category] ??= []).push({ canonical, ...info });
  }
  const lines = ["ASSETS DISPONIBLES localmente (sincronizados desde el library):"];
  for (const [category, list] of Object.entries(byCategory)) {
    lines.push(`\n## ${category}`);
    for (const item of list) {
      lines.push(`- \`${item.canonical}\` → public path: \`${item.publicPath}\``);
    }
  }
  lines.push("");
  lines.push(
    "Cuando uses un asset en el código Remotion, importá `staticFile` de remotion y usá: `<Img src={staticFile(\"<publicPath>\")} />`. NO inventes paths que no estén en esta lista — eso rompe el render.",
  );
  return lines.join("\n");
}
