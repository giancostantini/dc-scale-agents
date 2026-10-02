/**
 * Growth de productos propios — capa de datos del calendario de contenido,
 * scopeada por `producto` (slug). Espeja content.ts de cliente pero contra
 * producto_content_posts / producto_settings (mig 108). Sin clientes.
 */

import { getSupabase } from "./supabase/client";
import type {
  ContentPost,
  ContentNetwork,
  ContentFormat,
  ContentFrequency,
  ContentMix,
  ContentPieceType,
  ContentStatus,
} from "./types";

interface Row {
  id: string;
  producto: string;
  date: string;
  time: string | null;
  network: ContentNetwork;
  networks: ContentNetwork[] | null;
  format: ContentFormat;
  brief: string;
  content_type: ContentPieceType | null;
  status: ContentStatus;
  image_url: string | null;
  pdf_url: string | null;
  asset_url: string | null;
  published_at: string | null;
  created_at: string;
}

/** Mapea una fila de producto a ContentPost (clientId = producto, para
 *  poder reusar los componentes/handlers de contenido de cliente). */
function fromRow(r: Row): ContentPost {
  const networks =
    r.networks && r.networks.length > 0 ? r.networks : r.network ? [r.network] : [];
  return {
    id: r.id,
    clientId: r.producto,
    date: r.date,
    time: r.time,
    network: r.network,
    networks,
    format: r.format,
    brief: r.brief,
    contentType: r.content_type ?? null,
    imageUrl: r.image_url ?? null,
    pdfUrl: r.pdf_url ?? null,
    assetUrl: r.asset_url ?? null,
    publishedAt: r.published_at ?? null,
    status: r.status,
    source: "manual",
    createdAt: r.created_at,
  };
}

export async function getProductoContent(producto: string): Promise<ContentPost[]> {
  const { data, error } = await getSupabase()
    .from("producto_content_posts")
    .select("*")
    .eq("producto", producto)
    .order("date", { ascending: true });
  if (error) return [];
  return (data as Row[]).map(fromRow);
}

export interface NewProductoPiece {
  producto: string;
  date: string;
  network: ContentNetwork;
  networks: ContentNetwork[];
  format: ContentFormat;
  brief: string;
  contentType: ContentPieceType | null;
  status: ContentStatus;
}

function toInsert(p: NewProductoPiece) {
  return {
    producto: p.producto,
    date: p.date,
    network: p.network,
    networks: p.networks,
    format: p.format,
    brief: p.brief,
    content_type: p.contentType,
    status: p.status,
  };
}

export async function addProductoContent(p: NewProductoPiece): Promise<void> {
  const { error } = await getSupabase()
    .from("producto_content_posts")
    .insert(toInsert(p));
  if (error) throw error;
}

export async function addProductoContentBatch(ps: NewProductoPiece[]): Promise<void> {
  if (ps.length === 0) return;
  const { error } = await getSupabase()
    .from("producto_content_posts")
    .insert(ps.map(toInsert));
  if (error) throw error;
}

export interface ProductoContentPatch {
  date?: string;
  brief?: string;
  status?: ContentStatus;
  contentType?: ContentPieceType | null;
  imageUrl?: string | null;
  pdfUrl?: string | null;
  assetUrl?: string | null;
  publishedAt?: string | null;
}

export async function updateProductoContent(
  id: string,
  patch: ProductoContentPatch,
): Promise<void> {
  const db: Record<string, unknown> = {};
  if (patch.date !== undefined) db.date = patch.date;
  if (patch.brief !== undefined) db.brief = patch.brief;
  if (patch.status !== undefined) db.status = patch.status;
  if (patch.contentType !== undefined) db.content_type = patch.contentType;
  if (patch.imageUrl !== undefined) db.image_url = patch.imageUrl;
  if (patch.pdfUrl !== undefined) db.pdf_url = patch.pdfUrl;
  if (patch.assetUrl !== undefined) db.asset_url = patch.assetUrl;
  if (patch.publishedAt !== undefined) db.published_at = patch.publishedAt;
  const { error } = await getSupabase()
    .from("producto_content_posts")
    .update(db)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteProductoContent(id: string): Promise<void> {
  await getSupabase().from("producto_content_posts").delete().eq("id", id);
}

/** Borra las piezas 'planned' de un rango (para rehacer/limpiar el mes). */
export async function deleteProductoPlannedBetween(
  producto: string,
  from: string,
  to: string,
): Promise<void> {
  await getSupabase()
    .from("producto_content_posts")
    .delete()
    .eq("producto", producto)
    .eq("status", "planned")
    .gte("date", from)
    .lte("date", to);
}

// ---- Settings (frecuencia + mix) ----
export interface ProductoSettings {
  content_frequency: ContentFrequency;
  content_mix: ContentMix;
}

export async function getProductoSettings(
  producto: string,
): Promise<ProductoSettings> {
  const { data } = await getSupabase()
    .from("producto_settings")
    .select("content_frequency, content_mix")
    .eq("producto", producto)
    .maybeSingle();
  return {
    content_frequency: (data?.content_frequency ?? {}) as ContentFrequency,
    content_mix: (data?.content_mix ?? {}) as ContentMix,
  };
}

export async function updateProductoSettings(
  producto: string,
  patch: Partial<ProductoSettings>,
): Promise<void> {
  const { error } = await getSupabase()
    .from("producto_settings")
    .upsert(
      {
        producto,
        ...(patch.content_frequency !== undefined
          ? { content_frequency: patch.content_frequency }
          : {}),
        ...(patch.content_mix !== undefined
          ? { content_mix: patch.content_mix }
          : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "producto" },
    );
  if (error) throw error;
}
