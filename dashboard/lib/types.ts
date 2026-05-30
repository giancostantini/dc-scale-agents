// ==================== TIPOS COMPARTIDOS ====================
// Estos tipos describen la forma de los datos en toda la app.
// Cuando conectemos Supabase, las queries van a devolver estos mismos tipos.

export type UserKey = "gianluca" | "federico" | "laura" | "martin" | "sofia";

export interface User {
  name: string;
  role: string;
  initials: string;
  isDirector: boolean;
}

export type ClientType = "gp" | "dev";
export type ClientStatus = "active" | "onboarding" | "dev";

export interface ClientKPIs {
  roas: string;
  leads: number;
  cac: string;
  invested: string;
  revenue: string;
  conv: string;
  /** Métricas detalladas por plataforma · cargadas manualmente desde
   *  /paid-media hasta que tengamos OAuth con Meta/Google. */
  paid_media?: PaidMediaMetrics;
}

export type PaidMediaPlatform = "meta" | "google" | "tiktok" | "email";

export interface PlatformMetrics {
  spent?: number;        // gasto del mes en USD
  impressions?: number;
  clicks?: number;
  ctr?: number;          // 0..1
  cpc?: number;          // USD por click
  cpm?: number;          // USD por 1000 impresiones
  conversions?: number;
  cpa?: number;          // USD por conversión
  roas?: number;         // x veces el gasto
  notes?: string;
}

export interface PaidMediaMetrics {
  meta?: PlatformMetrics;
  google?: PlatformMetrics;
  tiktok?: PlatformMetrics;
  email?: PlatformMetrics;
  /** ISO timestamp del último update */
  updated_at?: string;
  /** user_id del miembro que cargó */
  updated_by?: string;
}

export interface ClientModules {
  meta?: boolean;
  google?: boolean;
  content?: boolean;
  seo?: boolean;
  email?: boolean;
  analytics?: boolean;
  ugc?: boolean;
  cro?: boolean;
  reporting?: boolean;
}

// Metadata de un archivo subido al bucket "client-onboarding".
// Antes guardábamos solo el filename como placeholder; ahora guardamos
// path completo (para descargar después) + name original + bytes.
export interface OnboardingFile {
  path: string;                   // path en el bucket
  name: string;                   // filename original del usuario
  size: number;                   // bytes
  type?: string;                  // MIME
  url?: string;                   // public URL si el bucket es público
}

// Onboarding completo del cliente (wizard de creación).
// Se guarda en la columna `onboarding jsonb` de la tabla `clients`.
export interface ClientOnboarding {
  // Contrato
  contractDuration?: "6" | "12" | "18" | "24" | "open" | string;
  contractFile?: OnboardingFile | string; // string para compat con datos viejos
  startDate?: string;             // YYYY-MM-DD
  endDate?: string;
  feeVariableTiers?: string[];    // tramos escalonados de fee variable

  // Kickoff (el documento contiene propuesta/audiencia/tono/competidores/etc).
  kickoffFile?: OnboardingFile | string;

  // Branding (manual de marca, logos, paleta, tipografías, voz).
  brandingFiles?: (OnboardingFile | string)[];

  // Presupuestos default — soportan piso fijo + % sobre revenue.
  // Vive en el step "Contrato" del wizard; es información contractual,
  // no estratégica.
  budgetMarketing?: BudgetTier;
  budgetProduccion?: BudgetTier;

  // Dev
  devProjectType?: string;

  // Si true, es un lanzamiento de marca (negocio nuevo sin canales
  // activos). El reporte de Diagnóstico se adapta: 9 secciones en
  // vez de 12 (omite Estado de canales, Oportunidades de crecimiento
  // y Roadmap a 90 días — esos no aplican a un lanzamiento).
  isBrandLaunch?: boolean;
}

export interface BudgetTier {
  fixed?: number;        // mínimo garantizado USD/mes
  revenuePct?: number;   // % sobre revenue mensual
}

export interface Sprint {
  name: string;
  status: "done" | "active" | "pending";
}

export interface ClientExternalLinks {
  /** URL del dashboard del cliente en Espor.ai (paid media análisis). */
  espor_ai_url?: string;
  /** URL del Looker Studio con métricas generales del negocio. */
  looker_studio_url?: string;
  /** URL de la carpeta de Microsoft Teams con docs del cliente. */
  teams_folder_url?: string;
}

/**
 * Frecuencia semanal de publicación por "slot" (red × formato).
 *
 * Ej:
 *   { ig_feed: 3, ig_story: 7, ig_reel: 2, tt_video: 3, in_feed: 2 }
 *   = Instagram: 3 feeds + 7 stories + 2 reels por semana,
 *     TikTok: 3 videos por semana,
 *     LinkedIn: 2 feeds por semana.
 *
 * BACK-COMPAT: las keys legacy "ig", "tt", "in", "fb" (sin sufijo de
 * formato) se aceptan y se interpretan como "feed". Los helpers que
 * leen este objeto las normalizan a "ig_feed", etc.
 */
export type ContentSlotKey =
  // Instagram
  | "ig_feed"
  | "ig_story"
  | "ig_reel"
  // TikTok
  | "tt_video"
  | "tt_story"
  // LinkedIn
  | "in_feed"
  // Facebook
  | "fb_feed"
  | "fb_story"
  | "fb_reel"
  // YouTube
  | "yt_video"
  | "yt_short"
  // Legacy (se interpretan como *_feed)
  | "ig"
  | "tt"
  | "in"
  | "fb";

export type ContentFrequency = Partial<Record<ContentSlotKey, number>>;

/** Red social a nivel network (sin formato). Es el subset de
 *  ContentSlotKey que representa solo la red.  */
export type ContentNetworkKey = "ig" | "tt" | "in" | "fb" | "yt";

/** Mix porcentual de tipos de contenido para una red. Los 3 valores
 *  deberían sumar 100 pero no se valida estrictamente — el calendario
 *  normaliza si no llegan a 100. */
export interface ContentTypeMix {
  /** Contenido de VALOR: educativo, informativo, expertise. */
  valor?: number;
  /** Contenido de OFERTA: comercial, promo, descuento, CTA directo. */
  oferta?: number;
  /** Contenido de ENGAGEMENT: conversacional, behind-the-scenes,
   *  polls, UGC, comunidad. */
  engagement?: number;
}

/** Distribución de tipos de contenido por red. Estructura del JSONB en
 *  clients.content_mix. */
export type ContentMix = Partial<Record<ContentNetworkKey, ContentTypeMix>>;

/** Notas de estrategia por mes. Key = "YYYY-MM", value = markdown.
 *  Aparecen en el PDF del roadmap como página intercalada. */
export type RoadmapMonthNotes = Record<string, string>;

export interface Client {
  id: string;
  initials: string;
  name: string;
  sector: string;
  type: ClientType;
  status: ClientStatus;
  phase: string;
  fee: number;
  method: string;
  modules?: ClientModules;
  kpis?: ClientKPIs;
  progress?: number;
  sprints?: Sprint[];
  onboarding?: ClientOnboarding;
  /** URLs a herramientas externas (Espor.ai, Looker Studio, Teams).
   *  Las configura el director desde Analítica / Biblioteca. */
  external_links?: ClientExternalLinks;
  /** URL pública del dashboard Looker Studio del cliente. El portal lo
   *  expone como CTA en el sidebar (reemplaza los KPI charts internos). */
  looker_studio_url?: string | null;
  /** Frecuencia semanal de publicación por red. El planificador la
   *  usa para marcar los días "sugeridos" en el calendario. */
  content_frequency?: ContentFrequency;
  /** Mix % de tipos de contenido (valor/oferta/engagement) por red.
   *  El calendario lo usa para auto-asignar el tipo de cada posteo
   *  sugerido (chip V/O/E). */
  content_mix?: ContentMix;
  /** Texto de estrategia desarrollado por mes. Key = "YYYY-MM",
   *  value = markdown. Aparece en el PDF del roadmap. */
  roadmap_month_notes?: RoadmapMonthNotes;
  /** Contacto principal del cliente (cargado desde el onboarding). */
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  country?: string | null;
  /** Identificador fiscal (CUIT/RUT/NIT) — migración 039. */
  tax_id?: string | null;
  /** Fecha de creación (ISO) del cliente. */
  created_at?: string | null;
}

// ==================== PIPELINE / CRM ====================

export type PipelineStage =
  | "prospecto"
  | "contacto"
  | "propuesta"
  | "negociacion"
  | "cerrado";

export type LeadSource = "linkedin" | "email" | "manual" | "referido";

export interface Lead {
  id: string;
  name: string;
  company: string;
  sector: string;
  type: ClientType;
  value: number;              // USD/mes
  stage: PipelineStage;
  source: LeadSource;
  note?: string;
  createdAt: string;          // ISO
  meetingBooked?: boolean;
}

// Seniority alineado con Apollo.io
export type Seniority =
  | "founder"
  | "c_suite"
  | "vp"
  | "head"
  | "director"
  | "manager"
  | "senior"
  | "entry";

export type CampaignCTA = "calendly" | "landing" | "custom";

export interface ProspectCampaign {
  id: string;
  name: string;
  status: "active" | "paused";

  // Geografía (arrays para multi-selección)
  countries: string[];
  regions: string[];
  cities: string[];

  // Target company
  industries: string[];
  companySizeMin?: number;
  companySizeMax?: number;
  revenueRange?: string;
  buyingSignals: string[];
  excludedCompanies: string[];

  // Target person
  roles: string[];
  seniorities: Seniority[];

  // Messaging strategy
  cta: CampaignCTA;
  ctaUrl?: string;
  messageTone?: string;
  valueAngle?: string;

  // Volume & pacing
  dailyVolume: number;
  followUps: number;

  // Canales de contacto
  channels: string[];

  // Stats (runtime, actualizadas por el agente)
  leadsFound: number;
  contacted: number;
  replied: number;
  meetings: number;

  // Compat: descripciones derivadas para display (DB legacy columns)
  country: string;
  demographics: string;
  clientType: string;

  createdAt: string;
}

// ==================== CALENDAR ====================

export type EventType =
  | "reunion"
  | "cobro"
  | "reporte"
  | "dev"
  | "contenido"
  | "pauta";

export interface CalEvent {
  id: string;
  title: string;
  type: EventType;
  date: string;               // YYYY-MM-DD (start)
  /** Fecha de fin (inclusiva). Si está, el evento es multi-día y se
   *  renderiza como banda horizontal en el calendario. NULL/undefined
   *  → evento de 1 solo día. */
  end_date?: string | null;
  time: string;               // HH:mm
  duration: number;           // minutos
  clientId?: string;          // referencia a client.id
  clientLabel: string;        // etiqueta para mostrar
  participants?: string;
  notes?: string;
  meetLink?: string;
  synced?: boolean;           // Google Calendar
}

// ==================== FINANZAS ====================

export type ExpenseCategory =
  | "equipo"        // funcionales (sueldos / contractors)
  | "tools"         // SaaS, software
  | "ia"            // créditos / suscripciones de IA
  | "produccion"    // contenido, creatives de ads, eventos
  | "impuestos"     // impuestos pagados
  | "mkt_interno"   // ads para D&C, branding propio
  | "otros";

/** Labels canónicos para mostrar en UI. */
export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  equipo: "Funcionales",
  tools: "Tools",
  ia: "IA",
  produccion: "Producción",
  impuestos: "Impuestos",
  mkt_interno: "Mkt interno",
  otros: "Varios",
};

/** Tipo de recurrencia del egreso. */
export type ExpenseRecurrence = "one_time" | "monthly_fixed";

/** Métodos de pago compartidos con manual_revenues. */
export type ExpensePaymentMethod =
  | "efectivo"
  | "transferencia"
  | "tarjeta"
  | "cheque"
  | "mp"
  | "crypto"
  | "otro";

export type ExpenseStatus = "paid" | "pending" | "cancelled";

export interface Expense {
  id: string;
  date: string;               // YYYY-MM-DD
  concept: string;
  category: ExpenseCategory;
  assignedTo: string;         // "Interno" o clientId o nombre miembro
  amount: number;             // positivo; se trata como egreso
  /** Si el egreso es único (default) o se repite cada mes. */
  recurrence: ExpenseRecurrence;
  /** Solo aplica si recurrence='monthly_fixed'. Hasta qué mes corre.
   *  NULL = vigente sin fin. */
  recurrenceEndDate?: string | null;
  /** Si el egreso se carga contra el presupuesto MKT de un cliente,
   *  acá va el clientId. NULL = corporativo / no asignado a MKT. */
  mktBudgetClientId?: string | null;
  /** Nombre del proveedor (texto libre por ahora). */
  providerName?: string | null;
  /** Método de pago. */
  paymentMethod?: ExpensePaymentMethod | null;
  /** % de IVA (default 22% UY). */
  ivaPct?: number;
  /** URL a la factura adjunta. */
  invoiceUrl?: string | null;
  /** Estado del egreso. */
  status?: ExpenseStatus;
}

/** Entry del calendario de pago variable de un cliente.
 *
 *  Define un TRAMO con monto vigente entre startMonth y endMonth
 *  (ambos inclusive). Si endMonth es null, vigente sin cierre.
 *
 *  Resolución del fee de un mes M (ver effectiveFeeForMonth):
 *    - busca el tramo donde M está dentro del rango [start, end]
 *    - si hay varios, gana el de startMonth más reciente
 *    - si no hay ninguno aplicable → fallback a client.fee
 */
export interface ClientFeeSchedule {
  id: string;
  clientId: string;
  /** YYYY-MM — inicio del tramo (inclusive). */
  startMonth: string;
  /** YYYY-MM — fin del tramo (inclusive). NULL = sin cierre. */
  endMonth?: string | null;
  amount: number;
  currency: string;
  notes?: string | null;
}

/** Presupuesto mensual de marketing que otorga un cliente GP.
 *  Singleton por cliente — al editar se reemplaza el monto. */
export interface ClientMktBudget {
  clientId: string;
  monthlyAmount: number;
  currency: string;
  startDate: string;          // YYYY-MM-DD
  endDate?: string | null;    // null = vigente
  notes?: string | null;
  updatedAt: string;
}

export interface InvoicePayment {
  clientId: string;
  month: string;              // YYYY-MM
  status: "paid" | "pending" | "late";
  paidDate?: string;
  /** Importe del cobro de este mes. Si está, sobreescribe el
   *  client.fee — sirve para descuentos puntuales, ajustes o extras
   *  cuando el director cobra distinto al contrato. */
  amountOverride?: number | null;
  /** Nota libre del director (motivo del override / extras / etc). */
  note?: string | null;
}

// ==================== OBJETIVOS DEL CLIENTE ====================

export interface ObjectiveItem {
  id: string;
  name: string;
  now: string;
  target: string;
  unit: string;
  pct: number;
}

export interface ClientObjectives {
  clientId: string;
  period: string;
  periodType: "monthly" | "quarterly" | "semester" | "annual";
  startDate: string;
  endDate: string;
  items: ObjectiveItem[];
  updatedAt: string;
  updatedBy: string;
}

// ==================== NOTAS INTERNAS ====================

export interface ClientNote {
  id: string;
  clientId: string;
  author: string;
  title: string;
  content: string;
  createdAt: string;
}

// ==================== DEV TASKS / SPRINTS ====================

export type TaskStatus = "pending" | "active" | "done";
export type TaskPriority = "baja" | "media" | "alta" | "critica";

export interface DevTask {
  id: string;
  clientId: string;
  sprint?: string;
  title: string;
  description?: string;
  assignee: string;
  priority: TaskPriority;
  status: TaskStatus;
  type?: string;
  estimatedHours?: number;
  startDate?: string;
  dueDate?: string;
  createdAt: string;
}

// ==================== CAMPAÑAS DE PRODUCCIÓN (CLIENTE) ====================

export interface CampaignExpense {
  label: string;
  amount: number;
}

export interface ProductionCampaign {
  id: string;
  clientId: string;
  title: string;
  type: string;
  description: string;
  status: "active" | "done";
  budget: number;
  spent: number;
  hasResult: boolean;
  items: CampaignExpense[];
  startDate?: string;
  endDate?: string;
  resultFiles?: number;
  createdAt: string;
}

// ==================== CONTENIDO PROGRAMADO ====================

export type ContentNetwork = "ig" | "tt" | "in" | "fb";
export type ContentFormat = "reel" | "post" | "carrusel" | "story";
export type ContentStatus = "draft" | "scheduled" | "published";

export interface ContentPost {
  id: string;
  clientId: string;
  date: string;
  time: string;
  network: ContentNetwork;
  format: ContentFormat;
  brief: string;
  copy?: string;
  status: ContentStatus;
  source: "ai" | "manual";
  createdAt: string;
}

// ==================== ROUTING (AUTORIZACIONES) ====================

export interface RoutingRule {
  id: string;
  clientId: string;
  task: string;
  executor: string;
  condition: string;
  requiresAuth: boolean;
  createdAt: string;
}

// ==================== INTEGRACIONES POR CLIENTE ====================

export interface Integration {
  id: string;
  clientId: string;
  key: string;                    // "meta_ads", "google_ads", etc
  name: string;
  group: string;
  status: "connected" | "pending" | "disconnected";
  account?: string;
  // Migration 014: credenciales/IDs cargadas por el cliente desde el portal.
  // Shape libre por integración — ver lib/integration-tutorials.ts.
  credentials?: Record<string, string>;
  submittedBy?: string | null;    // user id del que cargó las credenciales
  submittedAt?: string | null;    // ISO timestamp
}

// ==================== AGENTES ====================

export type AgentRunStatus = "running" | "success" | "error";

export interface AgentRun {
  id: number;
  client: string;
  agent: string;
  status: AgentRunStatus;
  summary: string | null;
  summary_md: string | null;
  metadata: Record<string, unknown>;
  performance: Record<string, unknown>;
  created_at: string;
  updated_at: string | null;
}

export type AgentOutputType =
  | "report"
  | "content-piece"
  | "diagnostic"
  | "strategy"
  | "brief"
  | "analysis";

export interface AgentOutput {
  id: number;
  run_id: number | null;
  client: string;
  agent: string;
  output_type: AgentOutputType | string;
  title: string | null;
  body_md: string | null;
  structured: Record<string, unknown>;
  created_at: string;
}

export interface ContentPieceRow {
  id: number;
  client: string;
  piece_id: string;
  piece_type: string;
  source: string | null;
  objective: string | null;
  angle: string | null;
  script_format: string | null;
  emotional_trigger: string | null;
  platforms: string[] | null;
  video_path: string | null;
  voice_path: string | null;
  static_path: string | null;
  publish_results: unknown[];
  status: "draft" | "published" | "evaluated" | string;
  metrics: Record<string, unknown>;
  created_at: string;
}

// ==================== PHASE REPORTS ====================

export type PhaseKey = "diagnostico" | "estrategia" | "setup" | "lanzamiento";

export type PhaseStatus =
  | "pending"
  | "generating"
  | "draft"
  | "changes_requested"
  | "approved";

export interface PhaseReport {
  id: string;
  client_id: string;
  phase: PhaseKey;
  status: PhaseStatus;
  content_md: string | null;
  feedback: string | null;
  version: number;
  model: string | null;
  usage: Record<string, unknown> | null;
  generated_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  /** Path en bucket "client-onboarding" del PDF subido por el director.
   *  Si está seteado, ese PDF es canónico y se sirve tal cual al
   *  descargar o mostrar al cliente, en vez de re-renderizar desde
   *  content_md. */
  pdf_path: string | null;
  /** Análisis crítico cacheado del reporte (markdown). Lo genera un
   *  agente cuando el director lo pide. Se invalida (NULL) cuando
   *  content_md cambia. */
  review_md: string | null;
  created_at: string;
  updated_at: string;
}

// Orden secuencial de las fases — usado para desbloquear la siguiente
// cuando una se aprueba.
export const PHASE_ORDER: PhaseKey[] = [
  "diagnostico",
  "estrategia",
  "setup",
  "lanzamiento",
];

export function nextPhase(current: PhaseKey): PhaseKey | null {
  const idx = PHASE_ORDER.indexOf(current);
  if (idx === -1 || idx === PHASE_ORDER.length - 1) return null;
  return PHASE_ORDER[idx + 1];
}

// ==================== CLIENT REQUESTS · Solicitudes del cliente ====================
// Inbox de cosas que el cliente carga desde su portal: ofertas
// (campañas/promos específicas) y acciones (ideas/pedidos libres).

export type ClientRequestType = "oferta" | "accion";

export type ClientRequestUrgency = "baja" | "media" | "alta";

export type ClientRequestStatus =
  | "pending"
  | "reviewing"
  | "in_progress"
  | "done"
  | "rejected";

// Metadata específica por tipo. Schema flexible vía jsonb.
export interface OfertaMetadata {
  startDate?: string;
  endDate?: string;
  discountPct?: number;
  product?: string;
}

export interface AccionMetadata {
  area?: "ads" | "contenido" | "seo" | "dev" | "otro";
  desiredDate?: string;
}

export interface ClientRequest {
  id: string;
  client_id: string;
  type: ClientRequestType;
  title: string;
  description: string;
  metadata: OfertaMetadata | AccionMetadata | Record<string, unknown>;
  urgency: ClientRequestUrgency;
  status: ClientRequestStatus;
  submitted_by: string;
  submitted_at: string;
  assigned_to: string | null;
  response: string | null;
  created_at: string;
  updated_at: string;
}

export type NotificationLevel = "info" | "success" | "warning" | "error";

export interface Notification {
  id: number;
  client: string;
  agent: string | null;
  level: NotificationLevel;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}
