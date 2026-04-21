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
}

export interface ClientModules {
  meta?: boolean;
  google?: boolean;
  content?: boolean;
  seo?: boolean;
  email?: boolean;
  analytics?: boolean;
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
