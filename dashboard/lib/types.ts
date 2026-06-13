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
  /** Costo one-time de producción de la herramienta (USD). */
  devProductionCost?: number;
  /** Mantenimiento mensual recurrente (USD). Se usa como `fee`
   *  cuando el cliente es de tipo dev — alimenta el MRR. */
  devMaintenanceCost?: number;
  /** PDF con el documento del proyecto de desarrollo. Separado del
   *  kickoffFile (que se usa solo para GP). */
  devProjectFile?: OnboardingFile | string;
  /** Fecha objetivo de entrega del producto (YYYY-MM-DD). */
  devDeliveryDate?: string;
  /** IDs (auth.users.id) de los miembros del equipo asignados al
   *  proyecto de desarrollo. Al crear el cliente se inserta una
   *  fila por usuario en client_assignments. */
  devAssignedUserIds?: string[];

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

/**
 * URLs públicos del perfil del cliente en cada red social. Se cargan
 * en /configuracion del cliente y se usan en el preview del feed
 * (/contenido) para:
 *   - Linkear el avatar/handle al perfil real (target=_blank).
 *   - Extraer el handle del path del URL para mostrarlo en el header
 *     (ej. https://instagram.com/wiztrip → @wiztrip).
 *
 * Todos opcionales — un cliente puede no tener cuenta en alguna red.
 * Persistido como jsonb en clients.social_links (migración 067).
 */
export interface ClientSocialLinks {
  ig?: string;
  fb?: string;
  tt?: string;
  in?: string;
}

/**
 * Datos "visuales" del perfil del cliente en una red. Se usan SOLO
 * para que el preview del feed parezca el perfil real:
 *   - bio: 1-3 líneas que aparecen bajo el handle.
 *   - followers: cantidad de seguidores (entero).
 *   - following: cantidad siguiendo (opcional, IG/TT lo muestran).
 *
 * No traemos esto de las APIs de Meta/TikTok porque requiere
 * OAuth + aprobación de Meta Business. El director los carga
 * manualmente y los actualiza cuando quiere.
 */
export interface ClientSocialProfile {
  bio?: string;
  followers?: number;
  following?: number;
}

/**
 * Mapa de perfiles por red — keys ig/fb/tt/in. Cada red puede tener
 * (o no) sus datos visuales. Persistido como jsonb en
 * clients.social_profiles (migración 068).
 */
export interface ClientSocialProfiles {
  ig?: ClientSocialProfile;
  fb?: ClientSocialProfile;
  tt?: ClientSocialProfile;
  in?: ClientSocialProfile;
}

/**
 * Formatea un número de seguidores estilo redes sociales:
 *   1234 → "1.234"
 *   12345 → "12,3K"
 *   1234567 → "1,2M"
 *
 * Usa coma decimal (es-UY) para los abreviados. Si el valor es
 * undefined/null/NaN devuelve "—" para que el header siga
 * dibujándose con look natural ("— seguidores").
 */
export function formatSocialCount(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (n >= 1_000_000) {
    const v = (n / 1_000_000).toFixed(1).replace(".", ",");
    return v.endsWith(",0") ? `${v.slice(0, -2)}M` : `${v}M`;
  }
  if (n >= 10_000) {
    const v = (n / 1_000).toFixed(1).replace(".", ",");
    return v.endsWith(",0") ? `${v.slice(0, -2)}K` : `${v}K`;
  }
  // Hasta 9.999 mostramos completo con separador de miles.
  return n.toLocaleString("es-UY");
}

/**
 * Extrae el handle del URL de un perfil de red social. Tolerante
 * con / final, querystring, www., subdominios. Si no puede extraer,
 * devuelve null. Útil para mostrar "@usuario" en el header del feed.
 */
export function extractHandleFromUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    // Path lookup: queda /usuario o /@usuario o /company/empresa (LI).
    const segments = u.pathname.split("/").filter(Boolean);
    if (segments.length === 0) return null;
    // LinkedIn: /in/usuario o /company/empresa — el handle es el segundo.
    if (segments[0] === "in" || segments[0] === "company") {
      return segments[1] ? `@${segments[1]}` : null;
    }
    // IG/TT/FB: el handle es el primer segmento. TT pone @ adelante a veces.
    const raw = segments[0].replace(/^@/, "");
    if (!raw) return null;
    return `@${raw}`;
  } catch {
    return null;
  }
}

export interface ClientExternalLinks {
  /** URL del dashboard del cliente en Espor.ai (paid media análisis). */
  espor_ai_url?: string;
  /** URL del Looker Studio con métricas generales del negocio. */
  looker_studio_url?: string;
  /** URL de la carpeta de OneDrive (o SharePoint) con docs del cliente.
   *  El nombre del campo `teams_folder_url` quedó del pasado cuando
   *  usábamos Microsoft Teams para esto — lo dejamos sin renombrar
   *  para no migrar la columna en DB. */
  teams_folder_url?: string;
  /** URL al Meta Business Suite del cliente (planner de IG/FB). Se usa
   *  como destino del botón "Programar" cuando se hace click en una
   *  publicación de IG o FB en el calendario. Si no está seteado,
   *  caemos a https://business.facebook.com/latest/home como fallback
   *  universal. Patrón típico:
   *    https://business.facebook.com/latest/home?asset_id=<page_id>  */
  meta_business_suite_url?: string;
  /** ID del Ad Account del cliente en Meta Ads Manager (sin el prefijo
   *  "act_"). Se usa desde /meta para pushear campañas generadas con
   *  Claude. Ejemplo: 123456789012345. El director lo obtiene desde
   *  Ads Manager → Configuración del negocio → Cuentas publicitarias. */
  meta_ad_account_id?: string;
  /** ID numérico de la Facebook Page del cliente que se asocia a las
   *  AdCreatives cuando pusheamos campañas. Cada Ad necesita una Page
   *  dueña que la publique. Se consigue en business.facebook.com →
   *  Configuración del negocio → Páginas → seleccionar la Page → ID
   *  (o en facebook.com/<page> → "Acerca de" → ID). NO es el username,
   *  es el número (ej. 100123456789012). Si no está seteado per-cliente,
   *  el endpoint /api/meta/push-campaign cae a la env var META_PAGE_ID
   *  como fallback global. */
  meta_page_id?: string;
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
  /** URLs a herramientas externas (Espor.ai, Looker Studio, OneDrive).
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
  /** Catálogo de clasificaciones editoriales custom del cliente.
   *  El director las gestiona desde /configuracion. Si está vacío
   *  o null, se usan los DEFAULTS (valor/conversion/aspiracional).
   *  Migración 066. */
  content_classifications?: ClientContentClassification[] | null;
  /** URLs de los perfiles del cliente en cada red. Lo carga el director
   *  en /configuracion. Se usa para linkear el avatar/handle del
   *  preview feed al perfil real. Migración 067. */
  social_links?: ClientSocialLinks | null;
  /** Datos visuales del perfil por red (bio + seguidores + siguiendo).
   *  Para que el preview del feed se vea como el perfil real.
   *  Migración 068. */
  social_profiles?: ClientSocialProfiles | null;
  /** Texto de estrategia desarrollado por mes. Key = "YYYY-MM",
   *  value = markdown. Aparece en el PDF del roadmap. */
  roadmap_month_notes?: RoadmapMonthNotes;
  /** Contacto principal del cliente (cargado desde el onboarding). */
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  country?: string | null;
  /** Identificador fiscal (CUIT/RUT/NIT) — migración 039.
   *  Mantenemos por compat; los datos nuevos van a `rut`. */
  tax_id?: string | null;
  /** Razón social legal del cliente — puede diferir del nombre
   *  comercial (`name`). Se usa en facturación. Migración 054. */
  razon_social?: string | null;
  /** RUT / NIT del cliente — migración 054. Se muestra en el perfil
   *  del cliente y se auto-rellena al crear una factura. */
  rut?: string | null;
  /** URL del sitio web del cliente (migración 053). Usada como contexto
   *  adicional para los agentes (asistente creativo, estrategia). */
  website_url?: string | null;
  /** Fecha de creación (ISO) del cliente. */
  created_at?: string | null;
  /** Cuenta bancaria default donde se acreditan los pagos del cliente
   *  (migración 044). Cuando se marca un payment como 'paid', se
   *  crea un movimiento de entrada automáticamente. */
  default_cuenta_id?: string | null;
  /** URL pública del logo del cliente (migración 048).
   *  NULL = fallback a iniciales. */
  logo_url?: string | null;
  /** Distribución de dividendos específica para este cliente
   *  (migración 052). Si está NULL o `use_default=true`, se usa la
   *  config global de `dividend_config`. */
  dividend_distribution?: ClientDividendDistribution | null;
}

/** Distribución de dividendos a aplicar sobre el net profit que viene
 *  de este cliente. Los 4 porcentajes deberían sumar 100 — el UI
 *  alerta si no, pero no bloquea (puede haber lógica intencional). */
export interface ClientDividendDistribution {
  /** Si true, ignorar los % y usar la config global de dividend_config.
   *  Cuando se setea en true, el resto de los campos pueden quedar
   *  como referencia histórica pero no afectan al cálculo. */
  use_default: boolean;
  partner_a_pct: number;
  partner_b_pct: number;
  inversiones_pct: number;
  back_pct: number;
}

/** Contacto del cliente (migración 049 — uno-a-muchos). */
export interface ClientContact {
  id: string;
  client_id: string;
  name: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

// ==================== PIPELINE / CRM ====================

export type PipelineStage =
  | "prospecto"
  | "contacto"
  | "propuesta"
  | "negociacion"
  | "cerrado";

export type LeadSource =
  | "linkedin"
  | "email"
  | "manual"
  | "referido"
  | "sitio_web"
  | "redes_sociales"
  | "eventos"
  | "otro";

export interface Lead {
  id: string;
  name: string;
  company: string;
  sector: string;
  type: ClientType;
  /** USD/mes — recurrente mensual (= fee_mensual si GP, costo_mantenimiento
   *  si IA). 0 cuando el lead está en prospección/contactado. */
  value: number;
  stage: PipelineStage;
  source: LeadSource;
  note?: string;
  createdAt: string;          // ISO
  meetingBooked?: boolean;
  /** Cuándo entró a la etapa actual — para alertas por tiempo */
  stageChangedAt?: string;
  /** Si el lead se descartó: fecha + razón + etapa de descarte */
  lostAt?: string | null;
  lostReason?: string | null;
  lostFromStage?: PipelineStage | null;
  /** Cotización desglosada — se completa al pasar a "propuesta" */
  feeMensual?: number | null;       // GP recurrente
  bono?: number | null;             // GP success fee
  costoProduccion?: number | null;  // IA one-time
  costoMantenimiento?: number | null; // IA recurrente
  /** Quién refirió el lead (solo si source === 'referido') */
  referrerName?: string | null;
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
  /** Día del mes (1-31) en que se debita un fijo mensual (tarjeta,
   *  débito automático, etc). Migración 056. Si está seteado para un
   *  monthly_fixed, el status del mes corriente se computa solo a
   *  partir de hoy vs payment_day. */
  paymentDay?: number | null;
  /** Cuenta bancaria desde la que se debita. Migración 059. NULL para
   *  egresos no bancarios (efectivo, cripto). Cuando está seteado, el
   *  sistema mantiene un movimiento de egreso asociado en esa cuenta. */
  cuentaId?: string | null;
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
  status: "paid" | "pending" | "late" | "cancelled";
  paidDate?: string;
  /** Importe del cobro de este mes. Si está, sobreescribe el
   *  client.fee — sirve para descuentos puntuales, ajustes o extras
   *  cuando el director cobra distinto al contrato. */
  amountOverride?: number | null;
  /** Nota libre del director (motivo del override / extras / etc). */
  note?: string | null;
  /** URL pública al PDF de la factura subida manualmente
   *  (migración 054). NULL = sin PDF cargado. */
  pdfUrl?: string | null;
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
export type ContentFormat =
  | "reel"
  | "post"
  | "carrusel"
  | "story"
  | "ugc"
  | "anuncio";
export type ContentStatus = "draft" | "scheduled" | "published";

/**
 * Clasificación editorial de una pieza de contenido. El catálogo de
 * clasificaciones VÁLIDAS vive en `clients.content_classifications`
 * (jsonb) — cada cliente define su propio set de categorías con
 * labels y colores. En content_posts.classification guardamos solo
 * el `id` de la categoría elegida (string libre).
 *
 * Defaults (cuando el cliente no configura nada): valor / conversion
 * / aspiracional — son los 3 históricos. Ver DEFAULT_CONTENT_CLASSIFICATIONS
 * y la migración 066.
 *
 * Tipo: string libre para soportar ids custom. En la UI sólo se ven
 * los ids del catálogo del cliente; si un post tiene un id que ya
 * no está en el catálogo (porque se renombró/borró), el helper
 * classificationMetaById devuelve null y el chip queda como "sin
 * clasificar" en el render.
 */
export type ContentClassification = string;

/**
 * Entrada del catálogo de clasificaciones de un cliente. id es la
 * clave estable que persistimos en content_posts.classification;
 * label es lo que se muestra en la UI; color es el accent del chip.
 */
export interface ClientContentClassification {
  id: string;
  label: string;
  color: string;
}

/**
 * Defaults del catálogo cuando un cliente no tiene clasificaciones
 * cargadas. Son los 3 históricos del enum viejo, idénticos en
 * label/color para no romper posts existentes.
 */
export const DEFAULT_CONTENT_CLASSIFICATIONS: ClientContentClassification[] = [
  { id: "valor", label: "Valor", color: "#2f7d4f" },
  { id: "conversion", label: "Conversión", color: "#b04b3a" },
  { id: "aspiracional", label: "Aspiracional", color: "#9b8259" },
];

/**
 * Devuelve el catálogo efectivo de clasificaciones de un cliente:
 * el suyo si está cargado, o los DEFAULTS si no. Garantiza array.
 */
export function classificationsFor(
  client:
    | { content_classifications?: ClientContentClassification[] | null }
    | null
    | undefined,
): ClientContentClassification[] {
  const c = client?.content_classifications;
  if (c && Array.isArray(c) && c.length > 0) return c;
  return DEFAULT_CONTENT_CLASSIFICATIONS;
}

/**
 * Forma enriquecida con campos derivados — `short` (primera letra)
 * y `bg` (color con baja alpha) — que necesita la UI de chips/tiles.
 * Lo devuelve classificationMetaById para que cada consumidor no
 * tenga que recalcular estos derivados.
 */
export interface EnrichedClassificationMeta {
  id: string;
  label: string;
  short: string;
  color: string;
  bg: string;
}

/**
 * Convierte un color hex (#RRGGBB) a rgba con la alpha pedida.
 * Usado para tintar fondos de chips con poca opacidad sin tener
 * que pre-calcularlos manualmente cuando el usuario elige color.
 * Si el color no es hex válido, fallback a rgba(0,0,0,alpha).
 */
function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Busca una clasificación por id en un catálogo. Devuelve null si
 * no existe (puede pasar con posts viejos cuando se renombró/borró);
 * para el render eso se traduce en "sin chip / sin color".
 *
 * Cuando existe, devuelve la forma ENRIQUECIDA con `short` y `bg`
 * derivados para que los consumidores no tengan que recalcularlos.
 */
export function classificationMetaById(
  classifications: ClientContentClassification[],
  id: string | null | undefined,
): EnrichedClassificationMeta | null {
  if (!id) return null;
  const c = classifications.find((c) => c.id === id);
  if (!c) return null;
  return {
    id: c.id,
    label: c.label,
    short: (c.label.trim()[0] ?? "?").toUpperCase(),
    color: c.color,
    bg: hexToRgba(c.color, 0.12),
  };
}

export interface ContentPost {
  id: string;
  clientId: string;
  /** Número secuencial PERSISTENTE por cliente (1, 2, 3…). Se muestra
   *  como "C-XXXX" en la UI. Lo asigna un trigger en DB al insertar
   *  (max(code) por client_id + 1) y nunca se reusa: si borrás una
   *  pieza, las posteriores conservan su número y la próxima nueva
   *  tomará un valor mayor a TODOS los que ya existieron, no el del
   *  hueco. Ver migración 050. */
  code?: number | null;
  date: string;
  time: string | null;
  /** Red "principal" — campo singular, mantenido por back-compat
   *  con código antiguo y como fallback cuando `networks` está vacío.
   *  Normalmente es igual a `networks[0]`. */
  network: ContentNetwork;
  /** Redes donde la pieza se publica. Una misma idea puede vivir en
   *  IG + FB simultáneamente sin duplicarse. Ver migración 065. */
  networks: ContentNetwork[];
  format: ContentFormat;
  /** Brief operativo / instrucciones de producción. */
  brief: string;
  /** Idea central de la pieza (concepto creativo). */
  idea?: string | null;
  /** Copy completo listo para publicar. */
  copy?: string | null;
  /** Call-to-action (típicamente para anuncios). */
  cta?: string | null;
  /** Influencer asignado cuando format=ugc. */
  influencer?: string | null;
  /** Miembro del equipo responsable de producir la pieza. */
  assignedTo?: string | null;
  /** Clasificación editorial — valor / conversion / aspiracional. */
  classification?: ContentClassification | null;
  /** URL pública de la imagen de preview de la pieza (Supabase Storage).
   *  Se usa SOLO para visualizar la grilla del feed — no es el creative
   *  final que se publica, eso vive en Drive/OneDrive. NULL = sin imagen,
   *  el tile usa el color de la clasificación. Ver migración 064. */
  imageUrl?: string | null;
  /** Link externo (OneDrive / Drive) al archivo FINAL del creative.
   *  Distinto de imageUrl (esa es la preview que vive en Supabase).
   *  El GP pega acá la URL de la carpeta o archivo donde se está
   *  produciendo / guardando la pieza. NULL = todavía no se subió a
   *  OneDrive. La tabla muestra un mini-icono 📎 cuando hay valor.
   *  Ver migración 071. */
  assetUrl?: string | null;
  status: ContentStatus;
  source: "ai" | "manual";
  createdAt: string;
}

// La constante CONTENT_CLASSIFICATION_META se removió en la
// migración 066. Antes era el catálogo fijo (3 hardcoded); ahora
// cada cliente tiene su propio catálogo en
// `clients.content_classifications`. Usá classificationsFor(client)
// + classificationMetaById(classifications, id) en su lugar — devuelve
// la misma forma { label, short, color, bg } pero por cliente.

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

export type ClientRequestType = "oferta" | "accion" | "recomendacion";

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

/**
 * Metadata para client_requests con type='recomendacion'.
 * El cliente carga estas desde /portal/agenda al apretar
 * "+ Recomendación" sobre una pieza concreta — referenciamos
 * el post por uuid + code C-XXXX + un excerpt de la idea para
 * que el director vea contexto sin tener que abrir el post.
 */
export interface RecomendacionMetadata {
  post_id?: string;
  post_code?: string;
  post_idea_excerpt?: string;
}

export interface ClientRequest {
  id: string;
  client_id: string;
  type: ClientRequestType;
  title: string;
  description: string;
  metadata:
    | OfertaMetadata
    | AccionMetadata
    | RecomendacionMetadata
    | Record<string, unknown>;
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
