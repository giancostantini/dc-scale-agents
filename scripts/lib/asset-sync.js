/**
 * Asset Sync — descarga los assets de un cliente desde Supabase Storage
 * (`client-assets/<clientId>/**`) al filesystem local. Recorre las
 * categorías + sub-categorías recursivamente, replicando la estructura.
 *
 * Estructura del bucket (post-refactor v2):
 *
 *   client-assets/<clientId>/
 *     ├── logo/                       (flat)
 *     ├── mascot/{color,trazo,sticker,logo}/
 *     ├── curvas/                     (flat)
 *     ├── ilustraciones/{color,trazo}/
 *     ├── tipografias/<font-family-slug>/
 *     ├── key-visuals/                (flat)
 *     └── brand-book/                 (flat, típicamente 1 PDF)
 *
 * Output del sync:
 *   - filesystem mirror en targetDir (ej. remotion-studio/public/assets/<clientId>)
 *   - assetMap[path] = { localPath, publicPath, category, subCategory, filename }
 *
 * Env vars: SUPABASE_URL + SUPABASE_KEY (service_role).
 */

import { writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync } from "fs";
import { resolve, dirname, relative } from "path";

const BUCKET = "client-assets";
const SUPABASE_URL = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
const SUPABASE_KEY = process.env.SUPABASE_KEY?.trim();

// Categorías top-level que esperamos en el bucket. Si en el futuro se
// agrega una nueva, agregar acá también (o detectar automáticamente).
const CATEGORIES = [
  "logo",
  "mascot",
  "curvas",
  "ilustraciones",
  "tipografias",
  "key-visuals",
  "brand-book",
];

function authHeaders() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  };
}

/**
 * Lista los items inmediatos de un prefix (no recursivo). Devuelve mix de
 * archivos y "folders" — los folders en Supabase Storage son ítems sin
 * `id` y sin `metadata`, los archivos tienen ambos.
 */
async function listPrefix(prefix) {
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

function isFile(item) {
  return !!item.id && !!item.metadata;
}

function isFolder(item) {
  return (!item.id || !item.metadata) && !!item.name;
}

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
 * Recorre recursivamente la estructura del bucket bajo `<clientId>/<category>/`
 * y devuelve la lista plana de archivos encontrados con su sub-path relativo.
 */
async function discoverFiles(clientId, category) {
  const root = `${clientId}/${category}`;
  const out = []; // { remotePath, relPath, subCategory, filename }

  // Nivel 1 — archivos directos + sub-folders
  let level1;
  try {
    level1 = await listPrefix(root);
  } catch (err) {
    console.warn(`[asset-sync] listing ${root}: ${err.message}`);
    return out;
  }

  for (const item of level1) {
    if (item.name === ".emptyFolderPlaceholder") continue;
    if (isFile(item)) {
      // Archivo directo en /<category>/<filename>
      out.push({
        remotePath: `${root}/${item.name}`,
        relPath: `${category}/${item.name}`,
        subCategory: null,
        filename: item.name,
      });
    } else if (isFolder(item)) {
      // Sub-folder — listar archivos adentro (asumimos solo 1 nivel más;
      // no soportamos sub-sub-folders por convención)
      const subPrefix = `${root}/${item.name}`;
      let level2;
      try {
        level2 = await listPrefix(subPrefix);
      } catch (err) {
        console.warn(`[asset-sync] listing ${subPrefix}: ${err.message}`);
        continue;
      }
      for (const subItem of level2) {
        if (subItem.name === ".emptyFolderPlaceholder") continue;
        if (isFile(subItem)) {
          out.push({
            remotePath: `${subPrefix}/${subItem.name}`,
            relPath: `${category}/${item.name}/${subItem.name}`,
            subCategory: item.name,
            filename: subItem.name,
          });
        }
      }
    }
  }

  return out;
}

/**
 * Sincroniza TODOS los assets del cliente al targetDir local.
 *
 * @returns {Promise<{
 *   assetMap: Record<string, { localPath, publicPath, category, subCategory, filename }>,
 *   downloaded: number,
 *   purged: number,
 *   errors: string[],
 * }>}
 *
 * El key del assetMap es el `relPath` (ej. "mascot/color/wizzo-magia.svg")
 * para que el código que renderiza pueda referenciar assets por ese path.
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

  // Descubrir todos los archivos remotos
  const remoteFiles = [];
  for (const category of CATEGORIES) {
    const files = await discoverFiles(clientId, category);
    remoteFiles.push(...files);
  }

  const assetMap = {};
  const errors = [];
  let downloaded = 0;

  // Descargar
  const tasks = remoteFiles.map(async (file) => {
    const localFile = resolve(targetDir, file.relPath);
    const publicPath = `assets/${clientId}/${file.relPath}`;
    try {
      await downloadObject(file.remotePath, localFile);
      downloaded++;
      assetMap[file.relPath] = {
        localPath: localFile,
        publicPath,
        category: file.relPath.split("/")[0],
        subCategory: file.subCategory,
        filename: file.filename,
      };
    } catch (err) {
      errors.push(`download ${file.remotePath}: ${err.message}`);
    }
  });
  await Promise.all(tasks);

  // Purga: borrar archivos locales que ya no están remotos
  let purged = 0;
  if (purgeStale && existsSync(targetDir)) {
    const remoteRelSet = new Set(remoteFiles.map((f) => f.relPath));
    function walkAndPurge(dir) {
      let entries;
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }
      for (const name of entries) {
        const full = resolve(dir, name);
        let st;
        try {
          st = statSync(full);
        } catch {
          continue;
        }
        if (st.isDirectory()) {
          walkAndPurge(full);
        } else {
          const rel = relative(targetDir, full).replace(/\\/g, "/");
          if (!remoteRelSet.has(rel)) {
            try {
              rmSync(full);
              purged++;
            } catch {
              // ignore
            }
          }
        }
      }
    }
    walkAndPurge(targetDir);
  }

  console.log(
    `[asset-sync] ${clientId}: ${downloaded} descargados, ${purged} purgados, ${Object.keys(assetMap).length} disponibles, ${errors.length} errores`,
  );
  if (errors.length > 0) {
    for (const e of errors.slice(0, 5)) console.warn(`[asset-sync]   error: ${e}`);
  }

  return { assetMap, downloaded, purged, errors };
}

/**
 * Renderiza el assetMap como un bloque Markdown que se inyecta en el prompt
 * de Claude para que sepa qué assets hay disponibles y con qué publicPath
 * referenciarlos.
 */
export function buildAssetMapBlock(assetMap) {
  const entries = Object.entries(assetMap);
  if (entries.length === 0) {
    return "ASSETS DISPONIBLES (sincronizados al filesystem): ninguno. Si el storyboard referencia assets visuales, listalos como faltantes — el equipo va a tener que subirlos.";
  }

  // Agrupar por categoría/sub-categoría para legibilidad
  const grouped = {};
  for (const [relPath, info] of entries) {
    const cat = info.category;
    const subKey = info.subCategory ?? "_root";
    grouped[cat] ??= {};
    grouped[cat][subKey] ??= [];
    grouped[cat][subKey].push({ relPath, ...info });
  }

  const lines = ["ASSETS DISPONIBLES localmente (sincronizados desde el library):", ""];
  for (const [cat, subs] of Object.entries(grouped)) {
    lines.push(`## ${cat}`);
    for (const [subKey, list] of Object.entries(subs)) {
      if (subKey !== "_root") {
        lines.push(`### ${subKey}`);
      }
      for (const item of list) {
        lines.push(`- \`${item.relPath}\` → \`<Img src={staticFile("${item.publicPath}")} />\``);
      }
    }
    lines.push("");
  }
  lines.push(
    "Cuando uses un asset, usá EXACTAMENTE el publicPath listado arriba con `staticFile(...)`. NO inventes paths que no estén en esta lista. Si necesitás un asset que no está, agregá un comentario `// TODO MISSING ASSET: <descripción>` en el código.",
  );
  return lines.join("\n");
}
