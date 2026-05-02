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
}

export interface BudgetTier {
  fixed?: number;        // mínimo garantizado USD/mes
  revenuePct?: number;   // % sobre revenue mensual
}

export interface Sprint {
  name: string;
  status: "done" | "active" | "pending";
}

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

export type EventType = "reunion" | "cobro" | "reporte" | "dev" | "contenido";

export interface CalEvent {
  id: string;
  title: string;
  type: EventType;
  date: string;               // YYYY-MM-DD
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

export type ExpenseCategory = "equipo" | "tools" | "ia" | "produccion" | "otros";

export interface Expense {
  id: string;
  date: string;               // YYYY-MM-DD
  concept: string;
  category: ExpenseCategory;
  assignedTo: string;         // "Interno" o clientId o nombre miembro
  amount: number;             // positivo; se trata como egreso
}

export interface InvoicePayment {
  clientId: string;
  month: string;              // YYYY-MM
  status: "paid" | "pending" | "late";
  paidDate?: string;
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
