// ==================== UPLOAD A SUPABASE STORAGE ====================
// Helper para subir archivos del wizard de cliente (kickoff + branding)
// y guardar la referencia (path/URL pública) en el onboarding jsonb.
//
// Buckets:
//   - "client-onboarding": PRIVADO. Para contratos/branding sensibles.
//     Path: <wizardSessionId>/kickoff/<filename>,
//           <wizardSessionId>/branding/<filename>.
//     Migración 005.
//   - "content-post-previews": PÚBLICO. Para imágenes de preview de
//     piezas de contenido. Los URLs son cargables directamente con
//     <img src> sin auth. Migración 069.

import { getSupabase } from "./supabase/client";

const BUCKET = "client-onboarding";

export interface UploadedFile {
  /** Path dentro del bucket — esto es lo que guardamos en la DB. */
  path: string;
  /** Nombre original del archivo. */
  name: string;
  /** Bytes. */
  size: number;
  /** Tipo MIME (puede faltar para algunos formatos). */
  type?: string;
  /** URL pública (si el bucket es público) o signed URL. */
  url?: string;
}

/**
 * Sube un archivo al bucket "client-onboarding" (PRIVADO — bueno
 * para contratos/branding, pero las URLs públicas NO funcionan en
 * `<img src>` desde el browser). Para imágenes que tienen que
 * cargarse en un `<img>` (preview de contenido) usá
 * `uploadContentPreview` que escribe al bucket público creado en la
 * migración 069.
 *
 * Si el upload falla, lanza el error de Supabase tal cual.
 */
export async function uploadFile(
  file: File,
  folder: string,
): Promise<UploadedFile> {
  return uploadToBucket(file, folder, BUCKET);
}

/** Bucket público para imágenes de preview de piezas de contenido.
 *  Creado en la migración 069 con public=true. */
const CONTENT_PREVIEWS_BUCKET = "content-post-previews";

/**
 * Sube una imagen de preview de pieza al bucket público
 * "content-post-previews". El URL devuelto se puede clavar directo
 * en `<img src>` sin auth. Pasá `folder = clientId` para que las
 * imágenes queden separadas por cliente.
 */
export async function uploadContentPreview(
  file: File,
  folder: string,
): Promise<UploadedFile> {
  return uploadToBucket(file, folder, CONTENT_PREVIEWS_BUCKET);
}

/** Helper común: sanitiza nombre + sube + devuelve UploadedFile con
 *  publicUrl. Si el bucket es privado el publicUrl existe pero un
 *  `<img src>` no lo carga; usalo solo para descargas con auth. */
async function uploadToBucket(
  file: File,
  folder: string,
  bucket: string,
): Promise<UploadedFile> {
  const supabase = getSupabase();

  // Sanear el nombre: sin acentos ni espacios, conserva la extensión.
  const safeName = file.name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${folder}/${Date.now()}_${safeName}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      upsert: false,
      contentType: file.type || "application/octet-stream",
    });

  if (error) throw error;

  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);

  return {
    path,
    name: file.name,
    size: file.size,
    type: file.type,
    url: pub.publicUrl,
  };
}

/**
 * Devuelve una signed URL temporaria (1 hora) para descargar un path
 * privado. Para buckets públicos no hace falta — usar el url ya guardado.
 */
export async function getDownloadUrl(
  path: string,
  expiresIn: number = 3600,
): Promise<string | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error) {
    console.error("getDownloadUrl error:", error);
    return null;
  }
  return data?.signedUrl ?? null;
}

/**
 * Borra un archivo del bucket. Lo usamos cuando el usuario re-sube
 * un kickoff (pisar el anterior).
 */
export async function deleteFile(path: string): Promise<void> {
  const supabase = getSupabase();
  await supabase.storage.from(BUCKET).remove([path]);
}

/**
 * Genera un wizard session id estable por modal-abierto. Lo usamos
 * como folder root para los archivos antes de tener un clientId.
 * Cuando el wizard finaliza, los paths quedan guardados en onboarding;
 * si se cancela, los archivos quedan huérfanos (lo aceptamos como
 * trade-off vs complicar con cleanup transaccional).
 */
export function makeWizardSessionId(): string {
  return `wizard-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Formatea bytes en human-readable (KB / MB / GB).
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
}
