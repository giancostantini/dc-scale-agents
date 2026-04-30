// ==================== ASSET MANIFEST GENERATOR ====================
// Genera el archivo `vault/clients/<slug>/brand/assets.md` que cataloga
// todos los assets visuales operativos del cliente. Los agentes leen este
// manifest (via brand-loader / vault-loader) cuando generan contenido.
//
// El manifest se regenera automáticamente cuando se sube/borra un asset
// desde la UI. Es la fuente de verdad: refleja exactamente lo que está
// en el bucket client-assets.
//
// Estructura del manifest (alineada con las categorías + sub-categorías):
//
//   ## Logo
//     - <filename> (path: <clientId>/logo/<filename>)
//
//   ## Mascot / Personaje
//     ### Color
//       - <filename> (path: <clientId>/mascot/color/<filename>)
//     ### Trazo
//     ### Sticker
//     ### Logo del personaje
//
//   ## Curvas
//     - <filename>
//
//   ## Ilustraciones
//     ### Color
//     ### Trazo
//
//   ## Tipografías
//     ### <font-family-1>
//       - <filename>.otf
//     ### <font-family-2>
//
//   ## Key visuals / Inspiración
//
//   ## Brand Book

import { createClient } from "@supabase/supabase-js";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_DESCRIPTIONS,
  FIXED_SUBCATEGORIES,
  SUBCATEGORY_LABELS,
  type AssetCategory,
} from "./asset-upload";

const BUCKET = "client-assets";

// ============================================================
// Tipos
// ============================================================

interface SupabaseFile {
  name: string;
  metadata?: { size?: number; mimetype?: string } | null;
  id?: string | null; // null = es folder
}

export interface AssetEntry {
  filename: string;
  size?: number;
  path: string;
}

/**
 * Listado anidado de assets por categoría → sub-categoría → archivos.
 * Para categorías sin sub-categoría (logo, curvas, key-visuals, brand-book),
 * los archivos viven en `_root` (string especial).
 */
export type AssetsByCategory = Record<
  AssetCategory,
  Record<string, AssetEntry[]>
>;

// ============================================================
// Listing recursivo (server-side, usa service_role para bypass RLS)
// ============================================================

function makeServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      "asset-manifest: faltan env vars (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Lista los archivos directos de un prefix (no recursivo). Devuelve solo
 * archivos (no folders).
 */
async function listDirectFiles(
  client: ReturnType<typeof makeServerSupabase>,
  prefix: string,
): Promise<SupabaseFile[]> {
  const { data, error } = await client.storage
    .from(BUCKET)
    .list(prefix, { limit: 200, sortBy: { column: "name", order: "asc" } });
  if (error) {
    console.warn(`[asset-manifest] list ${prefix} failed:`, error.message);
    return [];
  }
  // En Supabase Storage, los "folders" tienen id=null y los archivos
  // tienen id no-null + metadata con size/mimetype.
  return (data ?? [])
    .filter(
      (f) =>
        !!f.name &&
        f.name !== ".emptyFolderPlaceholder" &&
        !!f.id &&
        !!f.metadata,
    )
    .map(
      (f): SupabaseFile => ({
        name: f.name,
        metadata: f.metadata,
        id: f.id,
      }),
    );
}

/**
 * Lista folders (sub-categorías) de un prefix. Para tipografías con
 * sub-folders dinámicos por font family.
 */
async function listSubFolders(
  client: ReturnType<typeof makeServerSupabase>,
  prefix: string,
): Promise<string[]> {
  const { data, error } = await client.storage
    .from(BUCKET)
    .list(prefix, { limit: 200, sortBy: { column: "name", order: "asc" } });
  if (error) return [];
  return (data ?? [])
    .filter(
      (f) =>
        !!f.name &&
        f.name !== ".emptyFolderPlaceholder" &&
        // folder = sin id (id null) y sin metadata
        (!f.id || !f.metadata),
    )
    .map((f) => f.name);
}

/**
 * Carga el árbol completo de assets de un cliente. Recorre las categorías
 * y sub-categorías (fijas + dinámicas para tipografías) y arma el listado.
 */
export async function loadClientAssets(
  clientId: string,
): Promise<AssetsByCategory> {
  const client = makeServerSupabase();
  const out = {} as AssetsByCategory;

  for (const category of CATEGORIES) {
    out[category] = {};

    const fixedSubs = FIXED_SUBCATEGORIES[category];

    if (fixedSubs && fixedSubs.length > 0) {
      // Categoría con sub-folders fijos (mascot, ilustraciones)
      for (const sub of fixedSubs) {
        const files = await listDirectFiles(
          client,
          `${clientId}/${category}/${sub}`,
        );
        out[category][sub] = files.map((f) => ({
          filename: f.name,
          size: f.metadata?.size ?? 0,
          path: `${clientId}/${category}/${sub}/${f.name}`,
        }));
      }
    } else if (category === "tipografias") {
      // Sub-folders dinámicos por font family
      const subFolders = await listSubFolders(client, `${clientId}/tipografias`);
      for (const sub of subFolders) {
        const files = await listDirectFiles(
          client,
          `${clientId}/tipografias/${sub}`,
        );
        out[category][sub] = files.map((f) => ({
          filename: f.name,
          size: f.metadata?.size ?? 0,
          path: `${clientId}/tipografias/${sub}/${f.name}`,
        }));
      }
    } else {
      // Categoría flat (logo, curvas, key-visuals, brand-book)
      const files = await listDirectFiles(client, `${clientId}/${category}`);
      out[category]["_root"] = files.map((f) => ({
        filename: f.name,
        size: f.metadata?.size ?? 0,
        path: `${clientId}/${category}/${f.name}`,
      }));
    }
  }

  return out;
}

// ============================================================
// Render del manifest a Markdown
// ============================================================

function totalCount(assets: AssetsByCategory): number {
  let n = 0;
  for (const cat of CATEGORIES) {
    for (const sub of Object.values(assets[cat] ?? {})) {
      n += sub.length;
    }
  }
  return n;
}

function categoryCount(
  assets: AssetsByCategory,
  category: AssetCategory,
): number {
  return Object.values(assets[category] ?? {}).reduce(
    (acc, sub) => acc + sub.length,
    0,
  );
}

function renderEntry(entry: AssetEntry): string {
  const sizeKB = entry.size ? ` · ${(entry.size / 1024).toFixed(1)} KB` : "";
  return `- \`${entry.filename}\`${sizeKB} (path: \`${entry.path}\`)`;
}

export function renderManifestMarkdown(
  clientId: string,
  clientName: string,
  assets: AssetsByCategory,
): string {
  const generated = new Date().toISOString().replace("T", " ").slice(0, 16);
  const lines: string[] = [];

  lines.push(`# Asset Library — ${clientName}`);
  lines.push("");
  lines.push(
    "> Generado automáticamente. **NO editar a mano** — los cambios se pierden cuando se re-genera.",
  );
  lines.push(`> Última actualización: ${generated} UTC`);
  lines.push("");
  lines.push(
    "Los agentes leen este manifest cuando generan contenido visual. Cuando un script o storyboard referencia un asset, debe usar el **filename exacto + path** que está abajo. NO inventar paths nuevos. Si un asset que se necesita no está acá, indicarlo como dependencia faltante (`MISSING_ASSET: <descripción>`).",
  );
  lines.push("");
  lines.push("---");
  lines.push("");

  // ====== Resumen ======
  const total = totalCount(assets);
  lines.push(`## Resumen`);
  lines.push("");
  lines.push(`- **Total**: ${total} assets`);
  for (const category of CATEGORIES) {
    const n = categoryCount(assets, category);
    if (n > 0) {
      lines.push(`- ${CATEGORY_LABELS[category]}: ${n}`);
    }
  }
  lines.push("");

  if (total === 0) {
    lines.push(
      `> ⚠️ Este cliente no tiene assets cargados todavía. Subir desde \`/cliente/${clientId}/brandbook/assets\`.`,
    );
    lines.push("");
    return lines.join("\n");
  }

  lines.push("---");
  lines.push("");

  // ====== Por categoría ======
  for (const category of CATEGORIES) {
    const subMap = assets[category];
    if (!subMap) continue;
    const n = categoryCount(assets, category);
    if (n === 0) continue;

    lines.push(`## ${CATEGORY_LABELS[category]}`);
    lines.push("");
    lines.push(`*${CATEGORY_DESCRIPTIONS[category]}*`);
    lines.push("");

    const fixedSubs = FIXED_SUBCATEGORIES[category];
    const dynamicSub = !fixedSubs && category === "tipografias";

    if (fixedSubs) {
      // mascot, ilustraciones — sub-tabs fijas
      for (const sub of fixedSubs) {
        const entries = subMap[sub] ?? [];
        if (entries.length === 0) continue;
        lines.push(`### ${SUBCATEGORY_LABELS[sub] ?? sub}`);
        lines.push("");
        for (const e of entries) lines.push(renderEntry(e));
        lines.push("");
      }
    } else if (dynamicSub) {
      // tipografias — sub-folders por font family
      const subKeys = Object.keys(subMap).sort();
      for (const sub of subKeys) {
        const entries = subMap[sub];
        if (entries.length === 0) continue;
        // El sub es el slug — para mostrar el nombre real, capitalizamos
        const niceName = sub
          .split("-")
          .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
          .join(" ");
        lines.push(`### ${niceName}`);
        lines.push("");
        for (const e of entries) lines.push(renderEntry(e));
        lines.push("");
      }
    } else {
      // logo, curvas, key-visuals, brand-book — flat
      const entries = subMap["_root"] ?? [];
      for (const e of entries) lines.push(renderEntry(e));
      lines.push("");
    }
  }

  // ====== Reglas operativas ======
  lines.push("---");
  lines.push("");
  lines.push("## Reglas operativas para los agentes");
  lines.push("");
  lines.push(
    "1. **Referenciar por path**: cuando el script o storyboard pida un asset, indicar el `path` exacto del manifest (e.g. `wiztrip/mascot/color/wizzo-magia.svg`).",
  );
  lines.push(
    "2. **Si un asset que necesitás no está acá**, no inventes paths. Indicalo como `MISSING_ASSET: <descripción de lo que necesitás>` en el output. El equipo lo subirá.",
  );
  lines.push(
    "3. **Filenames son descriptivos** — los diseñadores nombran los archivos de forma sensata (ej. `wizzo-magia.svg`, `logotipo-blanco.svg`). Usá esa pista para elegir el correcto según el momento.",
  );
  lines.push(
    "4. **Para mascot**, elegir el estilo apropiado al contexto: `color` para frames hero, `trazo`/line para watermarks, `sticker` para overlays sobre fotos.",
  );
  lines.push(
    "5. **Para tipografías custom** (sub-folders en `tipografias/`), Remotion las puede cargar como local fonts — más fiel al brandbook que las equivalentes de Google Fonts. Si la font del brandbook está acá, preferirla sobre la versión de Google Fonts.",
  );

  return lines.join("\n");
}
