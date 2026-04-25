// ==================== UPLOAD A SUPABASE STORAGE ====================
// Helper para subir archivos del wizard de cliente (kickoff + branding)
// y guardar la referencia (path/URL pública) en el onboarding jsonb.
//
// Bucket usado: "client-onboarding"
// Estructura:
//   client-onboarding/{wizardSessionId}/kickoff/{filename}
//   client-onboarding/{wizardSessionId}/branding/{filename}
//
// El bucket debe existir + tener policies de Storage que permitan a
// authenticated users INSERT/SELECT. Ver instrucciones en
// supabase/migrations/005_storage_bucket.sql.

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
 * Sube un archivo individual y devuelve metadata.
 * Si el upload falla, lanza el error de Supabase tal cual.
 */
export async function uploadFile(
  file: File,
  folder: string,
): Promise<UploadedFile> {
  const supabase = getSupabase();

  // Sanear el nombre: sin acentos ni espacios, conserva la extensión.
  const safeName = file.name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${folder}/${Date.now()}_${safeName}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      upsert: false,
      contentType: file.type || "application/octet-stream",
    });

  if (error) throw error;

  // URL pública (sólo válida si el bucket está marcado como public).
  // Si no es público, generamos signed URL al leer.
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);

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
