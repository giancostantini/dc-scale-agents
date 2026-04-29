// ==================== UPLOAD A CLIENT-ASSETS BUCKET ====================
// Helper para subir assets visuales operativos a Supabase Storage.
//
// Diferencia con `lib/upload.ts` (bucket client-onboarding):
//   - lib/upload.ts: archivos del wizard de onboarding (kickoff, branding zip)
//     que viven sueltos sin estructura. Path: <wizardId>/<folder>/<filename>.
//   - lib/asset-upload.ts: assets operativos catalogados por categoría, que
//     los agentes referencian para generar contenido. Path:
//     <clientId>/<category>/<canonicalName>.{ext}
//
// El bucket client-assets se crea con migración 006 + policies que permiten
// INSERT/SELECT/UPDATE a cualquier authenticated, DELETE solo a directores.

import { getSupabase } from "./supabase/client";

const BUCKET = "client-assets";

export type AssetCategory = "logo" | "mascot" | "patterns" | "inspiration";

export interface UploadedAsset {
  /** Canonical name dentro de la categoría (e.g. "wizzo-color-magia"). */
  canonicalName: string;
  /** Path completo en el bucket. */
  path: string;
  /** Nombre original del archivo subido. */
  originalName: string;
  /** Bytes. */
  size: number;
  /** Tipo MIME. */
  type?: string;
  /** Categoría del asset. */
  category: AssetCategory;
  /** Metadata específica de la categoría (e.g. style+expression para mascot). */
  metadata: AssetMetadata;
  /** URL pública o signed URL para uso inmediato. */
  url?: string;
}

/** Metadata flexible que depende de la categoría del asset. */
export type AssetMetadata =
  | LogoMetadata
  | MascotMetadata
  | PatternMetadata
  | InspirationMetadata;

export interface LogoMetadata {
  category: "logo";
  /** Variante del logo. */
  variant: "logotipo" | "isotipo" | "logotipo-tagline";
  /** Versión cromática. */
  colorVariant: "color" | "blanco" | "negro";
}

export interface MascotMetadata {
  category: "mascot";
  /** Nombre del personaje (e.g. "wizzo"). */
  mascotName: string;
  /** Estilo gráfico. */
  style: "color" | "line" | "sticker";
  /** Expresión / pose. */
  expression: string; // "standard" | "error" | "festejo" | "muybien" | "saludo" | "magia" | "pensando" | "baile" | string custom
}

export interface PatternMetadata {
  category: "patterns";
  /** Nombre del patrón (e.g. "curva-w"). */
  patternName: string;
  /** Variante. */
  variant?: string;
}

export interface InspirationMetadata {
  category: "inspiration";
  /** Tipo de inspiración. */
  type: "post" | "ad" | "mockup" | "reference" | "other";
  /** Descripción libre. */
  description?: string;
}

// ============================================================
// Canonical name helpers — definen las convenciones de naming
// ============================================================

export function buildCanonicalName(meta: AssetMetadata): string {
  if (meta.category === "logo") {
    return `${meta.variant}-${meta.colorVariant}`;
  }
  if (meta.category === "mascot") {
    return `${meta.mascotName}-${meta.style}-${meta.expression}`;
  }
  if (meta.category === "patterns") {
    return meta.variant
      ? `${meta.patternName}-${meta.variant}`
      : meta.patternName;
  }
  // inspiration
  const slug = meta.description
    ? meta.description
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40)
    : `${meta.type}-${Date.now().toString(36)}`;
  return `${meta.type}-${slug}`;
}

export function buildAssetPath(
  clientId: string,
  category: AssetCategory,
  canonicalName: string,
  extension: string,
): string {
  return `${clientId}/${category}/${canonicalName}.${extension.replace(/^\./, "")}`;
}

function fileExtension(filename: string): string {
  const m = filename.match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toLowerCase() : "bin";
}

// ============================================================
// Upload + delete + signed URL
// ============================================================

/**
 * Sube un asset al bucket client-assets siguiendo la convención de naming.
 * Si ya existe un asset con el mismo path, lo sobrescribe (upsert true).
 *
 * @param clientId — slug del cliente
 * @param meta — metadata categorizada (define el canonical name)
 * @param file — archivo a subir
 * @returns metadata del asset subido
 */
export async function uploadAsset(
  clientId: string,
  meta: AssetMetadata,
  file: File,
): Promise<UploadedAsset> {
  if (!clientId || !/^[a-z0-9-]+$/.test(clientId)) {
    throw new Error(`Invalid clientId: ${clientId}`);
  }

  const canonicalName = buildCanonicalName(meta);
  const ext = fileExtension(file.name);
  const path = buildAssetPath(clientId, meta.category, canonicalName, ext);

  const supabase = getSupabase();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      upsert: true, // sobrescribir si ya existe (caso típico: re-subir versión nueva)
      contentType: file.type || "application/octet-stream",
    });

  if (error) throw error;

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);

  return {
    canonicalName,
    path,
    originalName: file.name,
    size: file.size,
    type: file.type,
    category: meta.category,
    metadata: meta,
    url: pub.publicUrl,
  };
}

/**
 * Genera una signed URL temporaria (1h por default) para descargar un asset.
 * El bucket es privado, así que la URL pública del paso anterior solo
 * funciona si se usa con auth — para uso desde Remotion (que es node-side
 * sin auth de browser) usar signed URLs.
 */
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

/**
 * Borra un asset. Solo directores pueden hacer esto (RLS lo bloquea para
 * roles inferiores).
 */
export async function deleteAsset(path: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

/**
 * Lista todos los assets de un cliente, agrupados por categoría.
 * Útil para construir el manifest assets.md y para la UI de gestión.
 */
export async function listClientAssets(
  clientId: string,
): Promise<Record<AssetCategory, Array<{ path: string; name: string; size: number }>>> {
  const supabase = getSupabase();
  const out: Record<AssetCategory, Array<{ path: string; name: string; size: number }>> = {
    logo: [],
    mascot: [],
    patterns: [],
    inspiration: [],
  };

  for (const category of ["logo", "mascot", "patterns", "inspiration"] as const) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(`${clientId}/${category}`, { limit: 200, sortBy: { column: "name", order: "asc" } });
    if (error) {
      console.warn(`[asset-upload] list ${category} failed:`, error.message);
      continue;
    }
    for (const file of data ?? []) {
      if (file.name === ".emptyFolderPlaceholder") continue;
      out[category].push({
        path: `${clientId}/${category}/${file.name}`,
        name: file.name,
        size: file.metadata?.size ?? 0,
      });
    }
  }
  return out;
}

// ============================================================
// Constantes de catálogo — para la UI y el manifest
// ============================================================

export const WIZZO_EXPRESSIONS = [
  { key: "standard", label: "Estándar" },
  { key: "error", label: "Error" },
  { key: "festejo", label: "Festejo" },
  { key: "muybien", label: "Muy bien" },
  { key: "saludo", label: "Saludo" },
  { key: "magia", label: "Magia" },
  { key: "pensando", label: "Pensando" },
  { key: "baile", label: "Baile" },
] as const;

export const MASCOT_STYLES = [
  { key: "color", label: "Color" },
  { key: "line", label: "Trazo (line art)" },
  { key: "sticker", label: "Sticker" },
] as const;

export const LOGO_VARIANTS = [
  { key: "logotipo", label: "Logotipo (completo)" },
  { key: "isotipo", label: "Isotipo (solo símbolo)" },
  { key: "logotipo-tagline", label: "Logotipo + Tagline" },
] as const;

export const LOGO_COLOR_VARIANTS = [
  { key: "color", label: "Color" },
  { key: "blanco", label: "Blanco (sobre fondo oscuro)" },
  { key: "negro", label: "Negro (sobre fondo claro)" },
] as const;
