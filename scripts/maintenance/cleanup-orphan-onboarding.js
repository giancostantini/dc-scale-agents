/**
 * Cleanup orphan files in the `client-onboarding` storage bucket.
 *
 * El bucket guarda los archivos del wizard de NewClientModal en folders
 * `wizard-<id>/{kickoff,branding}/<file>`. Cuando el wizard finaliza, los
 * paths quedan referenciados en `clients.onboarding`. Cuando se cancela,
 * los archivos quedan huérfanos.
 *
 * El cleanup preventivo (codeado en NewClientModal) cubre cancelaciones
 * desde ahora en adelante. Este script borra los huérfanos retroactivos:
 * folders `wizard-*` cuyos archivos no aparecen en ningún `clients.onboarding`.
 *
 * Conservador: solo borra un folder si NINGÚN archivo dentro está referenciado
 * en algún cliente. No borra folders parcialmente referenciados.
 *
 * Conservador parte 2: filtro de edad (default 24h). No toca folders con
 * actividad reciente — protege wizards en curso.
 *
 * Uso:
 *   # Dry run (default — solo reporta qué borraría):
 *   node scripts/maintenance/cleanup-orphan-onboarding.js
 *
 *   # Aplicar (borra de verdad):
 *   node scripts/maintenance/cleanup-orphan-onboarding.js --apply
 *
 *   # Ajustar el umbral de edad mínima (en horas, default 24):
 *   node scripts/maintenance/cleanup-orphan-onboarding.js --min-age-hours 48
 *
 * Env vars requeridas:
 *   SUPABASE_URL  — https://<ref>.supabase.co
 *   SUPABASE_KEY  — service_role key (no anon, hace falta para listar/borrar
 *                   storage objects bypassando RLS)
 */

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const BUCKET = "client-onboarding";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Falta SUPABASE_URL o SUPABASE_KEY (debe ser la service_role key).");
  process.exit(1);
}

// ============ Args ============

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const minAgeIdx = args.indexOf("--min-age-hours");
const MIN_AGE_HOURS =
  minAgeIdx >= 0 && args[minAgeIdx + 1] ? Number(args[minAgeIdx + 1]) : 24;
const NOW = Date.now();
const MIN_AGE_MS = MIN_AGE_HOURS * 3600 * 1000;

// ============ Supabase REST helpers ============

function authHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function listFolder(prefix, limit = 1000, offset = 0) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      prefix,
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    }),
  });
  if (!res.ok) {
    throw new Error(`listFolder("${prefix}") ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function removePaths(paths) {
  if (paths.length === 0) return 0;
  // La API acepta hasta ~1000 prefixes por request. Batch defensivo.
  const BATCH = 100;
  let removed = 0;
  for (let i = 0; i < paths.length; i += BATCH) {
    const batch = paths.slice(i, i + BATCH);
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
      method: "DELETE",
      headers: authHeaders(),
      body: JSON.stringify({ prefixes: batch }),
    });
    if (!res.ok) {
      throw new Error(`removePaths ${res.status}: ${await res.text()}`);
    }
    const result = await res.json();
    removed += Array.isArray(result) ? result.length : batch.length;
  }
  return removed;
}

async function fetchClientsOnboarding() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/clients?select=id,onboarding`,
    { headers: authHeaders() },
  );
  if (!res.ok) {
    throw new Error(`fetchClientsOnboarding ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

// ============ Logic ============

function extractReferencedPaths(clients) {
  const out = new Set();
  const collect = (f) => {
    if (!f) return;
    const p = typeof f === "string" ? f : f?.path;
    if (typeof p === "string" && p.startsWith("wizard-")) {
      out.add(p);
    }
  };
  for (const c of clients) {
    const o = c.onboarding;
    if (!o || typeof o !== "object") continue;
    collect(o.contractFile);
    collect(o.kickoffFile);
    if (Array.isArray(o.brandingFiles)) {
      o.brandingFiles.forEach(collect);
    }
  }
  return out;
}

// Lista recursivamente todos los archivos bajo un prefix.
async function listAllFiles(prefix) {
  const result = [];
  async function walk(p) {
    let offset = 0;
    while (true) {
      const items = await listFolder(p, 1000, offset);
      if (!Array.isArray(items) || items.length === 0) break;
      for (const item of items) {
        const fullPath = p ? `${p}/${item.name}` : item.name;
        if (item.id) {
          // archivo
          result.push({
            path: fullPath,
            createdAt: item.created_at,
            updatedAt: item.updated_at,
            size: item.metadata?.size ?? 0,
          });
        } else {
          // folder
          await walk(fullPath);
        }
      }
      if (items.length < 1000) break;
      offset += items.length;
    }
  }
  await walk(prefix);
  return result;
}

function maxTimestampMs(files) {
  let max = 0;
  for (const f of files) {
    const t = new Date(f.updatedAt || f.createdAt || 0).getTime();
    if (t > max) max = t;
  }
  return max;
}

async function main() {
  console.log("=== Cleanup orphan onboarding files ===");
  console.log(`Bucket:        ${BUCKET}`);
  console.log(`Mode:          ${APPLY ? "APPLY (borrar)" : "DRY RUN (solo reportar)"}`);
  console.log(`Min age:       ${MIN_AGE_HOURS}h\n`);

  // 1. Cargar referencias
  const clients = await fetchClientsOnboarding();
  const referenced = extractReferencedPaths(clients);
  console.log(`Clientes:      ${clients.length}`);
  console.log(`Referenced:    ${referenced.size} paths`);

  // 2. Listar todos los wizard-* folders al root
  const rootItems = await listFolder("", 1000, 0);
  const wizardFolders = rootItems
    .filter((it) => !it.id && typeof it.name === "string" && it.name.startsWith("wizard-"))
    .map((it) => it.name);
  console.log(`Wizard folders en bucket: ${wizardFolders.length}\n`);

  // 3. Por cada folder, decidir si es huérfano completo
  let scannedFolders = 0;
  let orphanFolders = 0;
  let skippedRecent = 0;
  let skippedReferenced = 0;
  const pathsToDelete = [];
  let totalBytes = 0;

  for (const folder of wizardFolders) {
    scannedFolders++;
    const files = await listAllFiles(folder);
    if (files.length === 0) {
      // folder vacío — lo trato como huérfano (no aporta nada)
      orphanFolders++;
      continue;
    }
    const anyReferenced = files.some((f) => referenced.has(f.path));
    if (anyReferenced) {
      skippedReferenced++;
      continue;
    }
    const newest = maxTimestampMs(files);
    if (NOW - newest < MIN_AGE_MS) {
      skippedRecent++;
      console.log(`  [skip-recent] ${folder} (último archivo hace ${Math.round((NOW - newest) / 3600000)}h)`);
      continue;
    }
    orphanFolders++;
    for (const f of files) {
      pathsToDelete.push(f.path);
      totalBytes += f.size;
    }
    console.log(`  [orphan]      ${folder} (${files.length} archivos, ${(totalBytes / 1024 / 1024).toFixed(2)} MB)`);
  }

  console.log(`\nResumen:`);
  console.log(`  Folders escaneados:           ${scannedFolders}`);
  console.log(`  Folders huérfanos:            ${orphanFolders}`);
  console.log(`  Folders skipeados (referenciados): ${skippedReferenced}`);
  console.log(`  Folders skipeados (recientes):     ${skippedRecent}`);
  console.log(`  Archivos a borrar:            ${pathsToDelete.length}`);
  console.log(`  Tamaño total:                 ${(totalBytes / 1024 / 1024).toFixed(2)} MB\n`);

  if (pathsToDelete.length === 0) {
    console.log("Nada para borrar. ✓");
    return;
  }

  if (!APPLY) {
    console.log("DRY RUN — no se borró nada. Re-correr con --apply para borrar.");
    return;
  }

  console.log("Borrando…");
  const removed = await removePaths(pathsToDelete);
  console.log(`✓ Borrados ${removed}/${pathsToDelete.length} archivos.`);
}

main().catch((err) => {
  console.error("ERROR:", err.message || err);
  process.exit(1);
});
