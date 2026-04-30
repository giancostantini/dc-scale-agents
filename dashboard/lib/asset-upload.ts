// ==================== UPLOAD A CLIENT-ASSETS BUCKET ====================
// Helper para subir assets visuales operativos a Supabase Storage,
// siguiendo la convención que usan los estudios de branding (Brandissimo
// y similares) — categorías top-level + sub-categorías para mascot/
// ilustraciones/tipografías.
//
// Estructura del bucket:
//
//   client-assets/<clientId>/
//     ├── logo/                       (flat)
//     ├── mascot/
//     │   ├── color/
//     │   ├── trazo/
//     │   ├── sticker/
//     │   └── logo/
//     ├── curvas/                     (flat)
//     ├── ilustraciones/
//     │   ├── color/
//     │   └── trazo/
//     ├── tipografias/
//     │   └── <font-family-slug>/    (sub-folders dinámicos, uno por font)
//     ├── key-visuals/                (flat)
//     └── brand-book/                 (flat — típicamente 1 PDF)
//
// Sin slots predefinidos. Cada categoría/sub-categoría es drag-drop
// multi-file. El manifest agrupa los archivos para que los agentes los
// consulten por path + filename.

import { getSupabase } from "./supabase/client";

const BUCKET = "client-assets";

// ============================================================
// Categorías y sub-categorías
// ============================================================

export type AssetCategory =
  | "logo"
  | "mascot"
  | "curvas"
  | "ilustraciones"
  | "tipografias"
  | "key-visuals"
  | "brand-book";

export const CATEGORIES: AssetCategory[] = [
  "logo",
  "mascot",
  "curvas",
  "ilustraciones",
  "tipografias",
  "key-visuals",
  "brand-book",
];

export const CATEGORY_LABELS: Record<AssetCategory, string> = {
  logo: "Logo",
  mascot: "Mascot / Personaje",
  curvas: "Curvas",
  ilustraciones: "Ilustraciones",
  tipografias: "Tipografías",
  "key-visuals": "Key visuals / Inspiración",
  "brand-book": "Brand Book",
};

export const CATEGORY_DESCRIPTIONS: Record<AssetCategory, string> = {
  logo: "Logotipo, isotipo, lockups. Multi-file. Preferente SVG.",
  mascot:
    "Personaje de la marca (e.g. Wizzo). 4 estilos: color, trazo, sticker, logo del personaje.",
  curvas: "Recursos gráficos derivados del logo (curva-W, formas firma, etc).",
  ilustraciones:
    "Ilustraciones del universo de marca, en color y/o trazo.",
  tipografias:
    "Fuentes oficiales del cliente (.otf/.ttf). Una sub-carpeta por font family.",
  "key-visuals":
    "Mockups del brandbook, ejemplos de posteo, capturas de competencia. Referencia compositiva, no se incluyen directos en piezas.",
  "brand-book":
    "El PDF master del brandbook. Solo 1 archivo, se reemplaza al re-subir.",
};

// Sub-categorías fijas (para mascot e ilustraciones). Tipografías tiene
// sub-categorías dinámicas (el usuario crea folders por font family).
export const FIXED_SUBCATEGORIES: Partial<Record<AssetCategory, string[]>> = {
  mascot: ["color", "trazo", "sticker", "logo"],
  ilustraciones: ["color", "trazo"],
};

export const SUBCATEGORY_LABELS: Record<string, string> = {
  color: "Color",
  trazo: "Trazo (line art)",
  sticker: "Sticker",
  logo: "Logo del personaje",
};

// ============================================================
// Tipos de archivo aceptados por categoría
// ============================================================

export const CATEGORY_ACCEPT: Record<AssetCategory, string> = {
  logo: "image/svg+xml,image/png,image/jpeg",
  mascot: "image/svg+xml,image/png,image/jpeg",
  curvas: "image/svg+xml,image/png",
  ilustraciones: "image/svg+xml,image/png,image/jpeg",
  tipografias: ".otf,.ttf,.woff,.woff2",
  "key-visuals": "image/png,image/jpeg,image/webp",
  "brand-book": "application/pdf",
};

// ============================================================
// Path builders
// ============================================================

export function buildAssetPath(
  clientId: string,
  category: AssetCategory,
  subCategory: string | null,
  filename: string,
): string {
  const sane = sanitizeFilename(filename);
  return subCategory
    ? `${clientId}/${category}/${subCategory}/${sane}`
    : `${clientId}/${category}/${sane}`;
}

export function sanitizeFilename(name: string): string {
  // Conservamos extensión + saneamos el resto. Mantenemos mayúsculas para
  // tipografías (los nombres tipo "Bricolage_Grotesque-Bold.ttf" tienen
  // sentido tal cual).
  const m = name.match(/^(.+)\.([a-zA-Z0-9]+)$/);
  if (!m) {
    return name.replace(/[^\w-]+/g, "_").slice(0, 80);
  }
  const base = m[1]
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9_.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  const ext = m[2].toLowerCase();
  return `${base || "asset"}.${ext}`;
}

/** Convierte "Bricolage Grotesque" → "bricolage-grotesque" para usar como
 *  slug de sub-categoría en tipografias. */
export function slugifyFontFamily(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// ============================================================
// Upload / Delete / List
// ============================================================

export interface UploadedAsset {
  category: AssetCategory;
  subCategory: string | null;
  filename: string;
  path: string;
  size: number;
  mimeType?: string;
}

/**
 * Sube un archivo al bucket client-assets. Si subCategory es null, el archivo
 * va directo en /<category>/. Si existe, va en /<category>/<subCategory>/.
 *
 * El upload es upsert true — re-subir el mismo archivo lo reemplaza.
 */
export async function uploadAsset(
  clientId: string,
  category: AssetCategory,
  subCategory: string | null,
  file: File,
): Promise<UploadedAsset> {
  if (!clientId || !/^[a-z0-9-]+$/.test(clientId)) {
    throw new Error(`Invalid clientId: ${clientId}`);
  }
  const path = buildAssetPath(clientId, category, subCategory, file.name);

  const supabase = getSupabase();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      upsert: true,
      contentType: file.type || "application/octet-stream",
    });
  if (error) throw error;

  return {
    category,
    subCategory,
    filename: sanitizeFilename(file.name),
    path,
    size: file.size,
    mimeType: file.type,
  };
}

/** Borra un asset por su path absoluto en el bucket. */
export async function deleteAsset(path: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

/** Genera signed URL temporaria (default 1h). Para uso desde Node-side
 *  cuando el bucket es privado. */
export async function getAssetSignedUrl(
  path: string,
  expiresIn = 3600,
): Promise<string | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error) {
    console.error("[asset-upload] signed URL failed:", error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}
