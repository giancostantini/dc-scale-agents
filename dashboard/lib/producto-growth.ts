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

// ============================================================
// Pauta publicitaria (producto_campaigns)
// ============================================================
export type CampaignPlatform = "meta" | "google" | "tiktok" | "linkedin" | "otra";
export type CampaignStatus = "activa" | "pausada" | "finalizada";

export interface ProductoCampaign {
  id: string;
  producto: string;
  nombre: string;
  plataforma: CampaignPlatform;
  estado: CampaignStatus;
  inversion: number;
  moneda: string;
  alcance: number;
  leads: number;
  fechaInicio: string | null;
  fechaFin: string | null;
  notas: string;
  createdAt: string;
}

export type NewCampaign = Omit<ProductoCampaign, "id" | "createdAt">;

function campaignFromRow(r: Record<string, unknown>): ProductoCampaign {
  return {
    id: r.id as string,
    producto: r.producto as string,
    nombre: r.nombre as string,
    plataforma: r.plataforma as CampaignPlatform,
    estado: r.estado as CampaignStatus,
    inversion: Number(r.inversion ?? 0),
    moneda: (r.moneda as string) ?? "UYU",
    alcance: Number(r.alcance ?? 0),
    leads: Number(r.leads ?? 0),
    fechaInicio: (r.fecha_inicio as string) ?? null,
    fechaFin: (r.fecha_fin as string) ?? null,
    notas: (r.notas as string) ?? "",
    createdAt: r.created_at as string,
  };
}

function campaignToRow(c: Partial<NewCampaign>): Record<string, unknown> {
  const db: Record<string, unknown> = {};
  if (c.producto !== undefined) db.producto = c.producto;
  if (c.nombre !== undefined) db.nombre = c.nombre;
  if (c.plataforma !== undefined) db.plataforma = c.plataforma;
  if (c.estado !== undefined) db.estado = c.estado;
  if (c.inversion !== undefined) db.inversion = c.inversion;
  if (c.moneda !== undefined) db.moneda = c.moneda;
  if (c.alcance !== undefined) db.alcance = c.alcance;
  if (c.leads !== undefined) db.leads = c.leads;
  if (c.fechaInicio !== undefined) db.fecha_inicio = c.fechaInicio;
  if (c.fechaFin !== undefined) db.fecha_fin = c.fechaFin;
  if (c.notas !== undefined) db.notas = c.notas;
  return db;
}

export async function getProductoCampaigns(producto: string): Promise<ProductoCampaign[]> {
  const { data, error } = await getSupabase()
    .from("producto_campaigns")
    .select("*")
    .eq("producto", producto)
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data as Record<string, unknown>[]).map(campaignFromRow);
}

export async function addProductoCampaign(c: NewCampaign): Promise<void> {
  const { error } = await getSupabase().from("producto_campaigns").insert(campaignToRow(c));
  if (error) throw error;
}

export async function updateProductoCampaign(id: string, patch: Partial<NewCampaign>): Promise<void> {
  const { error } = await getSupabase()
    .from("producto_campaigns")
    .update(campaignToRow(patch))
    .eq("id", id);
  if (error) throw error;
}

export async function deleteProductoCampaign(id: string): Promise<void> {
  await getSupabase().from("producto_campaigns").delete().eq("id", id);
}

// ============================================================
// Producciones (producto_producciones)
// ============================================================
export type ProduccionTipo = "video" | "foto" | "diseno" | "copy" | "campana" | "otra";
export type ProduccionEstado = "idea" | "en_curso" | "revision" | "entregada";

export interface ProductoProduccion {
  id: string;
  producto: string;
  titulo: string;
  tipo: ProduccionTipo;
  estado: ProduccionEstado;
  presupuesto: number;
  ejecutado: number;
  moneda: string;
  fechaEntrega: string | null;
  notas: string;
  createdAt: string;
}

export type NewProduccion = Omit<ProductoProduccion, "id" | "createdAt">;

function produccionFromRow(r: Record<string, unknown>): ProductoProduccion {
  return {
    id: r.id as string,
    producto: r.producto as string,
    titulo: r.titulo as string,
    tipo: r.tipo as ProduccionTipo,
    estado: r.estado as ProduccionEstado,
    presupuesto: Number(r.presupuesto ?? 0),
    ejecutado: Number(r.ejecutado ?? 0),
    moneda: (r.moneda as string) ?? "UYU",
    fechaEntrega: (r.fecha_entrega as string) ?? null,
    notas: (r.notas as string) ?? "",
    createdAt: r.created_at as string,
  };
}

function produccionToRow(p: Partial<NewProduccion>): Record<string, unknown> {
  const db: Record<string, unknown> = {};
  if (p.producto !== undefined) db.producto = p.producto;
  if (p.titulo !== undefined) db.titulo = p.titulo;
  if (p.tipo !== undefined) db.tipo = p.tipo;
  if (p.estado !== undefined) db.estado = p.estado;
  if (p.presupuesto !== undefined) db.presupuesto = p.presupuesto;
  if (p.ejecutado !== undefined) db.ejecutado = p.ejecutado;
  if (p.moneda !== undefined) db.moneda = p.moneda;
  if (p.fechaEntrega !== undefined) db.fecha_entrega = p.fechaEntrega;
  if (p.notas !== undefined) db.notas = p.notas;
  return db;
}

export async function getProductoProducciones(producto: string): Promise<ProductoProduccion[]> {
  const { data, error } = await getSupabase()
    .from("producto_producciones")
    .select("*")
    .eq("producto", producto)
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data as Record<string, unknown>[]).map(produccionFromRow);
}

export async function addProductoProduccion(p: NewProduccion): Promise<void> {
  const { error } = await getSupabase().from("producto_producciones").insert(produccionToRow(p));
  if (error) throw error;
}

export async function updateProductoProduccion(id: string, patch: Partial<NewProduccion>): Promise<void> {
  const { error } = await getSupabase()
    .from("producto_producciones")
    .update(produccionToRow(patch))
    .eq("id", id);
  if (error) throw error;
}

export async function deleteProductoProduccion(id: string): Promise<void> {
  await getSupabase().from("producto_producciones").delete().eq("id", id);
}

// ============================================================
// Prospección (producto_prospectos)
// ============================================================
export type ProspectoEtapa = "nuevo" | "contactado" | "propuesta" | "ganado" | "perdido";

export interface ProductoProspecto {
  id: string;
  producto: string;
  nombre: string;
  empresa: string;
  contacto: string;
  etapa: ProspectoEtapa;
  valor: number;
  moneda: string;
  notas: string;
  createdAt: string;
}

export type NewProspecto = Omit<ProductoProspecto, "id" | "createdAt">;

function prospectoFromRow(r: Record<string, unknown>): ProductoProspecto {
  return {
    id: r.id as string,
    producto: r.producto as string,
    nombre: r.nombre as string,
    empresa: (r.empresa as string) ?? "",
    contacto: (r.contacto as string) ?? "",
    etapa: r.etapa as ProspectoEtapa,
    valor: Number(r.valor ?? 0),
    moneda: (r.moneda as string) ?? "UYU",
    notas: (r.notas as string) ?? "",
    createdAt: r.created_at as string,
  };
}

function prospectoToRow(p: Partial<NewProspecto>): Record<string, unknown> {
  const db: Record<string, unknown> = {};
  if (p.producto !== undefined) db.producto = p.producto;
  if (p.nombre !== undefined) db.nombre = p.nombre;
  if (p.empresa !== undefined) db.empresa = p.empresa;
  if (p.contacto !== undefined) db.contacto = p.contacto;
  if (p.etapa !== undefined) db.etapa = p.etapa;
  if (p.valor !== undefined) db.valor = p.valor;
  if (p.moneda !== undefined) db.moneda = p.moneda;
  if (p.notas !== undefined) db.notas = p.notas;
  return db;
}

export async function getProductoProspectos(producto: string): Promise<ProductoProspecto[]> {
  const { data, error } = await getSupabase()
    .from("producto_prospectos")
    .select("*")
    .eq("producto", producto)
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data as Record<string, unknown>[]).map(prospectoFromRow);
}

export async function addProductoProspecto(p: NewProspecto): Promise<void> {
  const { error } = await getSupabase().from("producto_prospectos").insert(prospectoToRow(p));
  if (error) throw error;
}

export async function updateProductoProspecto(id: string, patch: Partial<NewProspecto>): Promise<void> {
  const { error } = await getSupabase()
    .from("producto_prospectos")
    .update(prospectoToRow(patch))
    .eq("id", id);
  if (error) throw error;
}

export async function deleteProductoProspecto(id: string): Promise<void> {
  await getSupabase().from("producto_prospectos").delete().eq("id", id);
}
