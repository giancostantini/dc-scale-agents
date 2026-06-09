/**
 * Helpers para gestión de documentos financieros/contables.
 *
 * Modelo:
 *  - El bucket "finanzas-documents" almacena los archivos físicos.
 *  - La tabla finanzas_documents tiene metadata (nombre, carpeta,
 *    tipo, tamaño, quién lo subió, etc).
 *
 * Convención del path en bucket:
 *   {folder}/{timestamp}-{filename}
 *   ej: facturas_venta/1716831234-Factura_0001-001234.pdf
 */

import { getSupabase } from "./supabase/client";

export type DocumentFolder =
  | "facturas_venta"
  | "facturas_compra"
  | "recibos"
  | "contratos"
  | "balances"
  | "liquidaciones"
  | "impuestos"
  | "otros";

export const FOLDER_LABEL: Record<DocumentFolder, string> = {
  facturas_venta: "Facturas de Venta",
  facturas_compra: "Facturas de Compra",
  recibos: "Recibos",
  contratos: "Contratos",
  balances: "Balances",
  liquidaciones: "Liquidaciones",
  impuestos: "Impuestos",
  otros: "Otros",
};

export interface FinanzasDocument {
  id: string;
  file_name: string;
  storage_path: string;
  folder: DocumentFolder;
  doc_type: string | null;
  size_bytes: number;
  mime_type: string | null;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  notes: string | null;
  pending_review: boolean;
  shared: boolean;
  created_at: string;
  updated_at: string;
}

export async function listDocuments(): Promise<FinanzasDocument[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("finanzas_documents")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("listDocuments:", error);
    return [];
  }
  return (data ?? []) as FinanzasDocument[];
}

export interface UploadDocumentInput {
  file: File;
  folder: DocumentFolder;
  docType?: string;
  notes?: string;
}

/**
 * Sube el archivo al bucket + crea row de metadata.
 * Devuelve el documento creado.
 */
export async function uploadDocument(
  input: UploadDocumentInput,
): Promise<FinanzasDocument> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sin sesión");

  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .maybeSingle();

  // Path: {folder}/{timestamp}-{filename}
  const safeName = input.file.name.replace(/[^\w.\-]/g, "_");
  const timestamp = Date.now();
  const storagePath = `${input.folder}/${timestamp}-${safeName}`;

  // Subir al bucket
  const { error: uploadErr } = await supabase.storage
    .from("finanzas-documents")
    .upload(storagePath, input.file, {
      contentType: input.file.type,
      upsert: false,
    });
  if (uploadErr) throw new Error(`Error subiendo archivo: ${uploadErr.message}`);

  // Crear row de metadata
  const { data, error } = await supabase
    .from("finanzas_documents")
    .insert({
      file_name: input.file.name,
      storage_path: storagePath,
      folder: input.folder,
      doc_type: input.docType ?? null,
      size_bytes: input.file.size,
      mime_type: input.file.type || null,
      uploaded_by: user.id,
      uploaded_by_name: profile?.name ?? user.email ?? "Desconocido",
      notes: input.notes ?? null,
      pending_review: false,
      shared: false,
    })
    .select("*")
    .single();

  if (error) {
    // Limpiar el archivo del bucket si falló el insert
    await supabase.storage.from("finanzas-documents").remove([storagePath]);
    throw new Error(`Error guardando metadata: ${error.message}`);
  }

  return data as FinanzasDocument;
}

export async function deleteDocument(doc: FinanzasDocument): Promise<void> {
  const supabase = getSupabase();
  // Borrar del bucket
  await supabase.storage
    .from("finanzas-documents")
    .remove([doc.storage_path]);
  // Borrar row de metadata
  const { error } = await supabase
    .from("finanzas_documents")
    .delete()
    .eq("id", doc.id);
  if (error) throw error;
}

/** URL firmada (signed URL) válida por 1 hora para descargar el doc. */
export async function getDocumentDownloadUrl(
  doc: FinanzasDocument,
): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase.storage
    .from("finanzas-documents")
    .createSignedUrl(doc.storage_path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

/** Formatea bytes en KB/MB/GB. */
export function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
