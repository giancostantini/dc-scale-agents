// ==================== CAPA DE PERSISTENCIA ====================
// Migrado de localStorage a Supabase. Todas las funciones son async.
// Los nombres de las funciones se mantienen para que el resto del código
// casi no tenga que cambiar — solo agregar `await`.

import { getSupabase } from "./supabase/client";
import { listProfiles } from "./team";
import type {
  Client,
  ClientFeeSchedule,
  ClientMktBudget,
  ClientOnboarding,
  Lead,
  ProspectCampaign,
  CalEvent,
  Expense,
  InvoicePayment,
  PipelineStage,
  ClientObjectives,
  ClientNote,
  DevTask,
  ProductionCampaign,
  ContentPost,
  RoutingRule,
  Integration,
  LeadSource,
  ClientType,
  EventType,
  ExpenseCategory,
  TaskPriority,
  TaskStatus,
  ContentNetwork,
  ContentFormat,
  ContentStatus,
} from "./types";

// ==================== HELPERS ====================

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || `cliente-${Date.now()}`
  );
}

export function makeInitials(name: string): string {
  const caps = name.match(/[A-Z]/g);
  if (caps && caps.length >= 2) return caps.slice(0, 2).join("");
  const words = name.trim().split(/\s+/).filter((w) => w.length > 0);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return "??";
}

// ============ Row mappers (snake_case DB → camelCase TS) ============

interface ClientRow {
  id: string;
  initials: string;
  name: string;
  sector: string;
  type: ClientType;
  status: Client["status"];
  phase: string;
  fee: number | string;
  method: string;
  modules: Record<string, boolean> | null;
  kpis: Client["kpis"] | null;
  progress: number | null;
  sprints: Client["sprints"] | null;
  fee_variable: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  country: string | null;
  onboarding: ClientOnboarding | null;
  external_links: Client["external_links"] | null;
  looker_studio_url: string | null;
  content_frequency: Client["content_frequency"] | null;
  content_mix: Client["content_mix"] | null;
  roadmap_month_notes: Client["roadmap_month_notes"] | null;
  tax_id?: string | null;
  created_at?: string | null;
  default_cuenta_id?: string | null;
}

function clientFromRow(r: ClientRow): Client {
  return {
    id: r.id,
    initials: r.initials,
    name: r.name,
    sector: r.sector,
    type: r.type,
    status: r.status,
    phase: r.phase,
    fee: typeof r.fee === "string" ? parseFloat(r.fee) : r.fee,
    method: r.method,
    modules: (r.modules ?? undefined) as Client["modules"],
    kpis: (r.kpis ?? undefined) as Client["kpis"],
    progress: r.progress ?? undefined,
    sprints: r.sprints ?? undefined,
    onboarding: r.onboarding ?? undefined,
    external_links: r.external_links ?? undefined,
    looker_studio_url: r.looker_studio_url,
    content_frequency: r.content_frequency ?? undefined,
    content_mix: r.content_mix ?? undefined,
    roadmap_month_notes: r.roadmap_month_notes ?? undefined,
    contact_name: r.contact_name,
    contact_email: r.contact_email,
    contact_phone: r.contact_phone,
    country: r.country,
    tax_id: r.tax_id ?? null,
    created_at: r.created_at ?? null,
    default_cuenta_id: r.default_cuenta_id ?? null,
  };
}

// ==================== CLIENTS ====================

export async function getClients(): Promise<Client[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getClients error:", error);
    return [];
  }
  return (data as ClientRow[]).map(clientFromRow);
}

export async function getClient(id: string): Promise<Client | undefined> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return undefined;
  return clientFromRow(data as ClientRow);
}

export interface AddClientInput {
  name: string;
  sector: string;
  country: string;
  type: ClientType;
  fee: number;
  method: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  feeVariable?: string;
  modules?: Partial<Client["modules"]>;
  onboarding?: ClientOnboarding;
  /** Cuenta bancaria donde se acreditan los pagos (default).
   *  Cuando se marca una factura como pagada, se crea un movimiento
   *  ingreso automáticamente en esta cuenta. */
  defaultCuentaId?: string | null;
}

export async function addClient(data: AddClientInput): Promise<Client> {
  const supabase = getSupabase();

  // Generar ID único basado en el nombre
  const baseId = slugify(data.name);
  const existing = await getClients();
  let id = baseId;
  let suffix = 2;
  while (existing.some((c) => c.id === id)) {
    id = `${baseId}-${suffix++}`;
  }

  // Default modules según tipo, mergeando con lo que mande el wizard
  const defaultGpModules = {
    meta: true,
    google: true,
    content: true,
    analytics: true,
  };
  const modulesValue: Record<string, boolean> | null =
    data.type === "gp"
      ? { ...defaultGpModules, ...(data.modules ?? {}) }
      : null;

  const newRow: Partial<ClientRow> = {
    id,
    initials: makeInitials(data.name),
    name: data.name,
    sector: `${data.sector} · ${data.country}`,
    type: data.type,
    status: data.type === "dev" ? "dev" : "onboarding",
    phase:
      data.type === "dev"
        ? "En desarrollo · Sprint 1"
        : "On-boarding · Diagnóstico",
    fee: data.fee,
    method: data.method,
    modules: modulesValue,
    kpis:
      data.type === "gp"
        ? { roas: "—", leads: 0, cac: "—", invested: "—", revenue: "—", conv: "—" }
        : null,
    progress: data.type === "dev" ? 0 : null,
    sprints:
      data.type === "dev"
        ? [
            { name: "Sprint 1 · Discovery", status: "active" },
            { name: "Sprint 2 · Arquitectura", status: "pending" },
          ]
        : null,
    fee_variable: data.feeVariable ?? null,
    contact_name: data.contactName ?? null,
    contact_email: data.contactEmail ?? null,
    contact_phone: data.contactPhone ?? null,
    country: data.country,
    onboarding: data.onboarding ?? {},
    default_cuenta_id: data.defaultCuentaId ?? null,
  };

  const { data: inserted, error } = await supabase
    .from("clients")
    .insert(newRow)
    .select()
    .single();

  if (error) throw error;
  return clientFromRow(inserted as ClientRow);
}

export async function deleteClient(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Actualiza el fee de contrato (base) del cliente. Este fee es el
 * fallback cuando ningún tramo (client_fee_schedules) cubre el mes
 * consultado. Se usa desde el modal "Editar acuerdo anual" en
 * Finanzas → Clientes.
 */
export async function updateClientFee(
  clientId: string,
  fee: number,
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("clients")
    .update({ fee })
    .eq("id", clientId);
  if (error) throw error;
}

/**
 * Cuenta bancaria default donde se acreditan los pagos del cliente.
 * Pasar null para limpiar.
 */
export async function updateClientDefaultCuenta(
  clientId: string,
  cuentaId: string | null,
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("clients")
    .update({ default_cuenta_id: cuentaId })
    .eq("id", clientId);
  if (error) throw error;
}

/**
 * Actualiza la frecuencia semanal de contenido por red social.
 * Reemplaza el JSONB entero (no es merge — el director define todas
 * las redes que usa en una sola pasada).
 */
export async function updateClientContentFrequency(
  clientId: string,
  freq: Client["content_frequency"],
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("clients")
    .update({ content_frequency: freq ?? {} })
    .eq("id", clientId);
  if (error) throw error;
}

/**
 * Actualiza el mix porcentual de contenido (valor/oferta/engagement)
 * por red. Reemplaza el JSONB completo. Usado desde el modal de
 * Frecuencia, donde el director también edita el mix.
 */
export async function updateClientContentMix(
  clientId: string,
  mix: Client["content_mix"],
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("clients")
    .update({ content_mix: mix ?? {} })
    .eq("id", clientId);
  if (error) throw error;
}

/**
 * Actualiza la nota de estrategia de un mes específico del roadmap.
 * Merge sobre el JSONB actual (no reemplaza otros meses).
 *
 * monthKey: "YYYY-MM"
 * text: markdown plain. Pasar string vacío "" o null para borrar la
 *       nota de ese mes.
 */
export async function updateRoadmapMonthNote(
  clientId: string,
  monthKey: string,
  text: string | null,
): Promise<void> {
  const supabase = getSupabase();
  // Leemos el actual y mergeamos. No usamos jsonb_set por simplicidad.
  const { data: row, error: selErr } = await supabase
    .from("clients")
    .select("roadmap_month_notes")
    .eq("id", clientId)
    .maybeSingle();
  if (selErr) throw selErr;
  const current =
    (row?.roadmap_month_notes as Record<string, string> | null) ?? {};
  const next: Record<string, string> = { ...current };
  if (!text || !text.trim()) {
    delete next[monthKey];
  } else {
    next[monthKey] = text;
  }
  const { error } = await supabase
    .from("clients")
    .update({ roadmap_month_notes: next })
    .eq("id", clientId);
  if (error) throw error;
}

/**
 * Actualiza solo el campo external_links de un cliente (merge sobre
 * el JSONB actual). Usado desde la UI de Analítica (Espor.ai / Looker
 * Studio URL) y Biblioteca (Teams folder URL).
 */
export async function updateClientExternalLinks(
  clientId: string,
  patch: Partial<Client["external_links"] & object>,
): Promise<void> {
  const supabase = getSupabase();

  // Leer el objeto actual para hacer merge (no queremos sobreescribir
  // los otros campos si solo se actualiza uno).
  const { data: current, error: readErr } = await supabase
    .from("clients")
    .select("external_links")
    .eq("id", clientId)
    .maybeSingle();
  if (readErr) throw readErr;

  const merged = {
    ...((current?.external_links as Record<string, unknown>) ?? {}),
    ...patch,
  };

  const { error: updErr } = await supabase
    .from("clients")
    .update({ external_links: merged })
    .eq("id", clientId);
  if (updErr) throw updErr;
}

// ==================== LEADS ====================

interface LeadRow {
  id: string;
  name: string;
  company: string;
  sector: string;
  type: ClientType;
  value: number | string;
  stage: PipelineStage;
  source: LeadSource;
  note: string | null;
  meeting_booked: boolean | null;
  created_at: string;
  // Migración 042
  stage_changed_at?: string | null;
  lost_at?: string | null;
  lost_reason?: string | null;
  lost_from_stage?: PipelineStage | null;
  // Migración 043 — cotización desglosada + referido
  fee_mensual?: number | string | null;
  bono?: number | string | null;
  costo_produccion?: number | string | null;
  costo_mantenimiento?: number | string | null;
  referrer_name?: string | null;
}

function leadFromRow(r: LeadRow): Lead {
  const num = (v: unknown) =>
    v == null ? null : typeof v === "string" ? parseFloat(v) : Number(v);
  return {
    id: r.id,
    name: r.name,
    company: r.company,
    sector: r.sector,
    type: r.type,
    value: typeof r.value === "string" ? parseFloat(r.value) : r.value,
    stage: r.stage,
    source: r.source,
    note: r.note ?? undefined,
    meetingBooked: r.meeting_booked ?? undefined,
    createdAt: r.created_at,
    stageChangedAt: r.stage_changed_at ?? r.created_at,
    lostAt: r.lost_at ?? null,
    lostReason: r.lost_reason ?? null,
    lostFromStage: r.lost_from_stage ?? null,
    feeMensual: num(r.fee_mensual),
    bono: num(r.bono),
    costoProduccion: num(r.costo_produccion),
    costoMantenimiento: num(r.costo_mantenimiento),
    referrerName: r.referrer_name ?? null,
  };
}

/** Leads activos (no descartados). */
export async function getLeads(): Promise<Lead[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .is("lost_at", null)
    .order("created_at", { ascending: false });
  if (error) {
    // Fallback si la migración 042 no se aplicó aún
    if (`${error.message ?? ""}`.toLowerCase().includes("lost_at")) {
      const fallback = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false });
      if (fallback.error) return [];
      return (fallback.data as LeadRow[]).map(leadFromRow);
    }
    return [];
  }
  return (data as LeadRow[]).map(leadFromRow);
}

/** Leads marcados como perdidos. */
export async function getLostLeads(): Promise<Lead[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .not("lost_at", "is", null)
    .order("lost_at", { ascending: false });
  if (error) return [];
  return (data as LeadRow[]).map(leadFromRow);
}

export async function addLead(data: Omit<Lead, "id" | "createdAt">): Promise<Lead> {
  const supabase = getSupabase();
  const { data: inserted, error } = await supabase
    .from("leads")
    .insert({
      name: data.name,
      company: data.company,
      sector: data.sector,
      type: data.type,
      value: data.value ?? 0,
      stage: data.stage,
      source: data.source,
      note: data.note ?? null,
      meeting_booked: data.meetingBooked ?? false,
      referrer_name: data.referrerName ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return leadFromRow(inserted as LeadRow);
}

export async function updateLeadStage(id: string, stage: PipelineStage): Promise<void> {
  const supabase = getSupabase();
  // El trigger de DB ya actualiza stage_changed_at. Si la migración
  // no está aplicada, lo dejamos pasar igual.
  await supabase.from("leads").update({ stage }).eq("id", id);
}

/** Actualizar el valor (cotización) del lead. */
export async function updateLeadValue(id: string, value: number): Promise<void> {
  const supabase = getSupabase();
  await supabase.from("leads").update({ value }).eq("id", id);
}

/**
 * Guarda la cotización desglosada del lead al pasar a "propuesta".
 *   · Growth Partner: fee_mensual + bono. value = fee_mensual.
 *   · IA / Desarrollo: costo_produccion + costo_mantenimiento.
 *     value = costo_mantenimiento.
 *
 * Pasar null para limpiar un campo.
 */
export interface UpdateLeadQuoteInput {
  feeMensual?: number | null;
  bono?: number | null;
  costoProduccion?: number | null;
  costoMantenimiento?: number | null;
}

export async function updateLeadQuote(
  id: string,
  type: "gp" | "dev",
  patch: UpdateLeadQuoteInput,
): Promise<void> {
  const supabase = getSupabase();
  // El "value" recurrente que alimenta los KPIs es:
  //   GP  → fee_mensual
  //   IA  → costo_mantenimiento
  const recurring =
    type === "gp"
      ? (patch.feeMensual ?? 0)
      : (patch.costoMantenimiento ?? 0);
  await supabase
    .from("leads")
    .update({
      fee_mensual: patch.feeMensual ?? null,
      bono: patch.bono ?? null,
      costo_produccion: patch.costoProduccion ?? null,
      costo_mantenimiento: patch.costoMantenimiento ?? null,
      value: recurring,
    })
    .eq("id", id);
}

/**
 * Marca un lead como "perdido" en lugar de borrarlo. Queda
 * archivado para verlo en el reporte de oportunidades descartadas.
 */
export async function markLeadLost(
  id: string,
  reason: string | null,
  fromStage: PipelineStage,
): Promise<void> {
  const supabase = getSupabase();
  await supabase
    .from("leads")
    .update({
      lost_at: new Date().toISOString(),
      lost_reason: reason ?? null,
      lost_from_stage: fromStage,
    })
    .eq("id", id);
}

/** Restaurar lead (sacarlo de "perdido"). */
export async function restoreLead(id: string): Promise<void> {
  const supabase = getSupabase();
  await supabase
    .from("leads")
    .update({ lost_at: null, lost_reason: null, lost_from_stage: null })
    .eq("id", id);
}

export async function deleteLead(id: string): Promise<void> {
  const supabase = getSupabase();
  await supabase.from("leads").delete().eq("id", id);
}

// ==================== PROSPECT CAMPAIGNS ====================

interface CampaignRow {
  id: string;
  name: string;
  country: string;
  demographics: string;
  client_type: string;
  channels: string[];
  status: "active" | "paused";
  leads_found: number;
  contacted: number;
  replied: number;
  meetings: number;
  created_at: string;
  // Nuevas columnas (Fase 1)
  countries: string[] | null;
  regions: string[] | null;
  cities: string[] | null;
  industries: string[] | null;
  company_size_min: number | null;
  company_size_max: number | null;
  revenue_range: string | null;
  buying_signals: string[] | null;
  excluded_companies: string[] | null;
  roles: string[] | null;
  seniorities: string[] | null;
  cta: ProspectCampaign["cta"] | null;
  cta_url: string | null;
  message_tone: string | null;
  value_angle: string | null;
  daily_volume: number | null;
  follow_ups: number | null;
}

function campaignFromRow(r: CampaignRow): ProspectCampaign {
  return {
    id: r.id,
    name: r.name,
    status: r.status,

    countries: r.countries ?? (r.country ? [r.country] : []),
    regions: r.regions ?? [],
    cities: r.cities ?? [],

    industries: r.industries ?? [],
    companySizeMin: r.company_size_min ?? undefined,
    companySizeMax: r.company_size_max ?? undefined,
    revenueRange: r.revenue_range ?? undefined,
    buyingSignals: r.buying_signals ?? [],
    excludedCompanies: r.excluded_companies ?? [],

    roles: r.roles ?? [],
    seniorities: (r.seniorities ?? []) as ProspectCampaign["seniorities"],

    cta: (r.cta ?? "calendly"),
    ctaUrl: r.cta_url ?? undefined,
    messageTone: r.message_tone ?? undefined,
    valueAngle: r.value_angle ?? undefined,

    dailyVolume: r.daily_volume ?? 30,
    followUps: r.follow_ups ?? 3,

    channels: r.channels,

    leadsFound: r.leads_found,
    contacted: r.contacted,
    replied: r.replied,
    meetings: r.meetings,

    // compat display
    country: r.country,
    demographics: r.demographics,
    clientType: r.client_type,

    createdAt: r.created_at,
  };
}

export async function getCampaigns(): Promise<ProspectCampaign[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("prospect_campaigns")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data as CampaignRow[]).map(campaignFromRow);
}

export async function addCampaign(
  data: Omit<
    ProspectCampaign,
    "id" | "createdAt" | "leadsFound" | "contacted" | "replied" | "meetings"
  >,
): Promise<ProspectCampaign> {
  const supabase = getSupabase();

  // Derivamos strings compat para las columnas legacy (country, demographics, client_type)
  const countryLegacy = data.countries[0] ?? data.country ?? "—";
  const demographicsLegacy =
    data.demographics ||
    [data.roles.join(", "), data.seniorities.join(", ")]
      .filter(Boolean)
      .join(" · ") ||
    "—";
  const clientTypeLegacy =
    data.clientType ||
    [
      data.industries.join(", "),
      data.companySizeMin && data.companySizeMax
        ? `${data.companySizeMin}-${data.companySizeMax} empleados`
        : "",
    ]
      .filter(Boolean)
      .join(" · ") ||
    "—";

  const { data: inserted, error } = await supabase
    .from("prospect_campaigns")
    .insert({
      // Legacy compat columns
      name: data.name,
      country: countryLegacy,
      demographics: demographicsLegacy,
      client_type: clientTypeLegacy,
      channels: data.channels,
      status: data.status,
      // Nuevas columnas estructuradas
      countries: data.countries,
      regions: data.regions,
      cities: data.cities,
      industries: data.industries,
      company_size_min: data.companySizeMin ?? null,
      company_size_max: data.companySizeMax ?? null,
      revenue_range: data.revenueRange ?? null,
      buying_signals: data.buyingSignals,
      excluded_companies: data.excludedCompanies,
      roles: data.roles,
      seniorities: data.seniorities,
      cta: data.cta,
      cta_url: data.ctaUrl ?? null,
      message_tone: data.messageTone ?? null,
      value_angle: data.valueAngle ?? null,
      daily_volume: data.dailyVolume,
      follow_ups: data.followUps,
    })
    .select()
    .single();
  if (error) throw error;
  return campaignFromRow(inserted as CampaignRow);
}

export async function deleteCampaign(id: string): Promise<void> {
  const supabase = getSupabase();
  await supabase.from("prospect_campaigns").delete().eq("id", id);
}

// ==================== CALENDAR EVENTS ====================

interface EventRow {
  id: string;
  title: string;
  type: EventType;
  date: string;
  end_date: string | null;
  time: string;
  duration: number;
  client_id: string | null;
  client_label: string;
  participants: string | null;
  notes: string | null;
  meet_link: string | null;
  synced: boolean | null;
}

function eventFromRow(r: EventRow): CalEvent {
  return {
    id: r.id,
    title: r.title,
    type: r.type,
    date: r.date,
    end_date: r.end_date,
    time: r.time,
    duration: r.duration,
    clientId: r.client_id ?? undefined,
    clientLabel: r.client_label,
    participants: r.participants ?? undefined,
    notes: r.notes ?? undefined,
    meetLink: r.meet_link ?? undefined,
    synced: r.synced ?? undefined,
  };
}

export async function getEvents(): Promise<CalEvent[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("cal_events")
    .select("*")
    .order("date", { ascending: true });
  if (error) return [];
  return (data as EventRow[]).map(eventFromRow);
}

export async function addEvent(data: Omit<CalEvent, "id">): Promise<CalEvent> {
  const supabase = getSupabase();
  const { data: inserted, error } = await supabase
    .from("cal_events")
    .insert({
      title: data.title,
      type: data.type,
      date: data.date,
      end_date: data.end_date ?? null,
      time: data.time,
      duration: data.duration,
      client_id: data.clientId ?? null,
      client_label: data.clientLabel,
      participants: data.participants ?? null,
      notes: data.notes ?? null,
      meet_link: data.meetLink ?? null,
      synced: data.synced ?? false,
    })
    .select()
    .single();
  if (error) throw error;
  return eventFromRow(inserted as EventRow);
}

export async function deleteEvent(id: string): Promise<void> {
  const supabase = getSupabase();
  await supabase.from("cal_events").delete().eq("id", id);
}

/**
 * Actualiza un evento existente. Pasa solo los campos que querés
 * cambiar; los demás quedan como están.
 */
export async function updateEvent(
  id: string,
  patch: Partial<Omit<CalEvent, "id">>,
): Promise<CalEvent> {
  const supabase = getSupabase();
  // Mapeo camelCase → snake_case para los campos que difieren
  const dbPatch: Record<string, unknown> = {};
  if (patch.title !== undefined) dbPatch.title = patch.title;
  if (patch.type !== undefined) dbPatch.type = patch.type;
  if (patch.date !== undefined) dbPatch.date = patch.date;
  if (patch.end_date !== undefined) dbPatch.end_date = patch.end_date;
  if (patch.time !== undefined) dbPatch.time = patch.time;
  if (patch.duration !== undefined) dbPatch.duration = patch.duration;
  if (patch.clientId !== undefined) dbPatch.client_id = patch.clientId ?? null;
  if (patch.clientLabel !== undefined) dbPatch.client_label = patch.clientLabel;
  if (patch.participants !== undefined)
    dbPatch.participants = patch.participants ?? null;
  if (patch.notes !== undefined) dbPatch.notes = patch.notes ?? null;
  if (patch.meetLink !== undefined)
    dbPatch.meet_link = patch.meetLink ?? null;
  if (patch.synced !== undefined) dbPatch.synced = patch.synced;

  const { data, error } = await supabase
    .from("cal_events")
    .update(dbPatch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return eventFromRow(data as EventRow);
}

// ==================== EXPENSES ====================

interface ExpenseRow {
  id: string;
  date: string;
  concept: string;
  category: ExpenseCategory;
  assigned_to: string;
  amount: number | string;
  recurrence: "one_time" | "monthly_fixed" | null;
  recurrence_end_date: string | null;
  mkt_budget_client_id: string | null;
  provider_name: string | null;
  payment_method: string | null;
  iva_pct: number | string | null;
  invoice_url: string | null;
  status: string | null;
}

function expenseFromRow(r: ExpenseRow): Expense {
  return {
    id: r.id,
    date: r.date,
    concept: r.concept,
    category: r.category,
    assignedTo: r.assigned_to,
    amount: typeof r.amount === "string" ? parseFloat(r.amount) : r.amount,
    recurrence: r.recurrence ?? "one_time",
    recurrenceEndDate: r.recurrence_end_date ?? null,
    mktBudgetClientId: r.mkt_budget_client_id ?? null,
    providerName: r.provider_name ?? null,
    paymentMethod:
      (r.payment_method as
        | "efectivo"
        | "transferencia"
        | "tarjeta"
        | "cheque"
        | "mp"
        | "crypto"
        | "otro"
        | null) ?? null,
    ivaPct:
      r.iva_pct == null
        ? 22
        : typeof r.iva_pct === "string"
          ? parseFloat(r.iva_pct)
          : r.iva_pct,
    invoiceUrl: r.invoice_url ?? null,
    status: (r.status as "paid" | "pending" | "cancelled" | null) ?? "paid",
  };
}

export async function getExpenses(): Promise<Expense[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .order("date", { ascending: false });
  if (error) return [];
  return (data as ExpenseRow[]).map(expenseFromRow);
}

export async function addExpense(data: Omit<Expense, "id">): Promise<Expense> {
  const supabase = getSupabase();
  const { data: inserted, error } = await supabase
    .from("expenses")
    .insert({
      date: data.date,
      concept: data.concept,
      category: data.category,
      assigned_to: data.assignedTo,
      amount: data.amount,
      recurrence: data.recurrence ?? "one_time",
      recurrence_end_date: data.recurrenceEndDate ?? null,
      mkt_budget_client_id: data.mktBudgetClientId ?? null,
      provider_name: data.providerName ?? null,
      payment_method: data.paymentMethod ?? null,
      iva_pct: data.ivaPct ?? 22,
      invoice_url: data.invoiceUrl ?? null,
      status: data.status ?? "paid",
    })
    .select()
    .single();
  if (error) throw error;
  return expenseFromRow(inserted as ExpenseRow);
}

/** Update parcial de un expense. */
export async function updateExpense(
  id: string,
  patch: Partial<Omit<Expense, "id">>,
): Promise<Expense> {
  const supabase = getSupabase();
  const dbPatch: Record<string, unknown> = {};
  if (patch.date !== undefined) dbPatch.date = patch.date;
  if (patch.concept !== undefined) dbPatch.concept = patch.concept;
  if (patch.category !== undefined) dbPatch.category = patch.category;
  if (patch.assignedTo !== undefined) dbPatch.assigned_to = patch.assignedTo;
  if (patch.amount !== undefined) dbPatch.amount = patch.amount;
  if (patch.recurrence !== undefined) dbPatch.recurrence = patch.recurrence;
  if (patch.recurrenceEndDate !== undefined)
    dbPatch.recurrence_end_date = patch.recurrenceEndDate;
  if (patch.mktBudgetClientId !== undefined)
    dbPatch.mkt_budget_client_id = patch.mktBudgetClientId;
  if (patch.providerName !== undefined)
    dbPatch.provider_name = patch.providerName;
  if (patch.paymentMethod !== undefined)
    dbPatch.payment_method = patch.paymentMethod;
  if (patch.ivaPct !== undefined) dbPatch.iva_pct = patch.ivaPct;
  if (patch.invoiceUrl !== undefined) dbPatch.invoice_url = patch.invoiceUrl;
  if (patch.status !== undefined) dbPatch.status = patch.status;

  const { data, error } = await supabase
    .from("expenses")
    .update(dbPatch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return expenseFromRow(data as ExpenseRow);
}

export async function deleteExpense(id: string): Promise<void> {
  const supabase = getSupabase();
  await supabase.from("expenses").delete().eq("id", id);
}

// ==================== CLIENT MKT BUDGETS ====================

interface MktBudgetRow {
  client_id: string;
  monthly_amount: number | string;
  currency: string;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  updated_at: string;
}

function mktBudgetFromRow(r: MktBudgetRow): ClientMktBudget {
  return {
    clientId: r.client_id,
    monthlyAmount:
      typeof r.monthly_amount === "string"
        ? parseFloat(r.monthly_amount)
        : r.monthly_amount,
    currency: r.currency,
    startDate: r.start_date,
    endDate: r.end_date,
    notes: r.notes,
    updatedAt: r.updated_at,
  };
}

export async function listClientMktBudgets(): Promise<ClientMktBudget[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("client_mkt_budgets")
    .select("*");
  if (error) {
    console.error("listClientMktBudgets:", error);
    return [];
  }
  return (data as MktBudgetRow[]).map(mktBudgetFromRow);
}

// ==================== CLIENT FEE SCHEDULES ====================

interface FeeScheduleRow {
  id: string;
  client_id: string;
  start_month: string;
  end_month: string | null;
  amount: number | string;
  currency: string;
  notes: string | null;
}

function feeScheduleFromRow(r: FeeScheduleRow): ClientFeeSchedule {
  return {
    id: r.id,
    clientId: r.client_id,
    startMonth: r.start_month,
    endMonth: r.end_month,
    amount: typeof r.amount === "string" ? parseFloat(r.amount) : r.amount,
    currency: r.currency,
    notes: r.notes,
  };
}

export async function listFeeSchedules(): Promise<ClientFeeSchedule[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("client_fee_schedules")
    .select("*")
    .order("start_month", { ascending: true });
  if (error) {
    console.error("listFeeSchedules:", error);
    return [];
  }
  return (data as FeeScheduleRow[]).map(feeScheduleFromRow);
}

export async function listFeeSchedulesForClient(
  clientId: string,
): Promise<ClientFeeSchedule[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("client_fee_schedules")
    .select("*")
    .eq("client_id", clientId)
    .order("start_month", { ascending: true });
  if (error) return [];
  return (data as FeeScheduleRow[]).map(feeScheduleFromRow);
}

/** Upsert por (client_id, start_month).
 *  endMonth nullable: si está, el tramo se cierra ese mes; si no,
 *  vigente sin cierre. */
export async function upsertFeeSchedule(
  clientId: string,
  startMonth: string,
  amount: number,
  currency = "USD",
  notes: string | null = null,
  endMonth: string | null = null,
): Promise<void> {
  const supabase = getSupabase();
  await supabase.from("client_fee_schedules").upsert(
    {
      client_id: clientId,
      start_month: startMonth,
      end_month: endMonth,
      amount,
      currency,
      notes,
    },
    { onConflict: "client_id,start_month" },
  );
}

export async function deleteFeeSchedule(id: string): Promise<void> {
  const supabase = getSupabase();
  await supabase.from("client_fee_schedules").delete().eq("id", id);
}

/** Calcula el fee efectivo de un cliente para un mes específico
 *  basado en su calendario de pago acotado.
 *
 *  Algoritmo:
 *   - Filtra tramos del cliente donde startMonth <= yyyymm y
 *     (endMonth IS NULL OR endMonth >= yyyymm) — sea contiene M.
 *   - De los aplicables, gana el de startMonth más reciente.
 *   - Si ninguno aplica → null (caller usa client.fee como fallback).
 */
export function effectiveFeeForMonth(
  schedules: ClientFeeSchedule[],
  clientId: string,
  yyyymm: string,
): number | null {
  const applicable = schedules
    .filter(
      (s) =>
        s.clientId === clientId &&
        s.startMonth <= yyyymm &&
        (!s.endMonth || s.endMonth >= yyyymm),
    )
    .sort((a, b) => b.startMonth.localeCompare(a.startMonth));
  return applicable.length > 0 ? applicable[0].amount : null;
}

/** MRR efectivo del mes pasado por argumento.
 *  Suma sobre todos los clientes el effective fee de ese mes.
 *  Si no hay schedule para un cliente, usa client.fee del contrato. */
export function computeMonthlyMrr(
  clients: Client[],
  schedules: ClientFeeSchedule[],
  yyyymm: string,
): number {
  return clients.reduce((sum, c) => {
    const scheduled = effectiveFeeForMonth(schedules, c.id, yyyymm);
    return sum + (scheduled ?? c.fee);
  }, 0);
}

/** Upsert: si existe el budget de ese cliente lo reemplaza con el
 *  nuevo monto. Si pasás monthlyAmount=0 (o negativo) lo eliminamos. */
export async function setClientMktBudget(
  clientId: string,
  monthlyAmount: number,
  currency = "USD",
  startDate?: string,
  endDate?: string | null,
  notes?: string | null,
): Promise<void> {
  const supabase = getSupabase();
  if (monthlyAmount <= 0) {
    await supabase.from("client_mkt_budgets").delete().eq("client_id", clientId);
    return;
  }
  await supabase.from("client_mkt_budgets").upsert(
    {
      client_id: clientId,
      monthly_amount: monthlyAmount,
      currency,
      start_date: startDate ?? new Date().toISOString().slice(0, 10),
      end_date: endDate ?? null,
      notes: notes ?? null,
    },
    { onConflict: "client_id" },
  );
}

// Genera expenses (categoría=equipo) para todos los miembros del equipo
// con payment_type ∈ {fijo, mixto} y payment_amount > 0, en el mes dado.
//
// Idempotente: detecta duplicados por (concept, mes). Correrlo dos veces
// el mismo mes no crea expenses extra; los conceptos canónicos son
// `Nómina · ${profile.name}`.
//
// Si payment_currency != USD, se inserta el monto sin conversión (se asume
// que el usuario ya lo configuró en USD). No es ideal pero es suficiente.
export async function generateTeamPayroll(monthYYYYMM: string): Promise<{
  created: number;
  skipped: number;
  eligible: number;
}> {
  const profiles = await listProfiles();
  const eligible = profiles.filter(
    (p) =>
      (p.payment_type === "fijo" || p.payment_type === "mixto") &&
      typeof p.payment_amount === "number" &&
      (p.payment_amount as number) > 0,
  );
  if (eligible.length === 0) {
    return { created: 0, skipped: 0, eligible: 0 };
  }

  const [yearStr, monthStr] = monthYYYYMM.split("-");
  const year = Number(yearStr);
  const monthNum = Number(monthStr);
  const monthStart = `${monthYYYYMM}-01`;
  // Último día del mes = primer día del mes siguiente - 1ms.
  const nextMonthFirst = new Date(
    Date.UTC(monthNum === 12 ? year + 1 : year, monthNum === 12 ? 0 : monthNum, 1),
  );
  const lastDay = new Date(nextMonthFirst.getTime() - 86400000);
  const monthEnd = lastDay.toISOString().slice(0, 10);

  const supabase = getSupabase();
  const { data: existing } = await supabase
    .from("expenses")
    .select("concept")
    .eq("category", "equipo")
    .gte("date", monthStart)
    .lte("date", monthEnd);
  const existingConcepts = new Set(
    (existing as Array<{ concept: string }> | null ?? []).map((e) => e.concept),
  );

  let created = 0;
  let skipped = 0;
  for (const p of eligible) {
    const concept = `Nómina · ${p.name}`;
    if (existingConcepts.has(concept)) {
      skipped++;
      continue;
    }
    await addExpense({
      date: monthEnd,
      concept,
      category: "equipo",
      assignedTo: "Interno",
      amount: p.payment_amount as number,
      recurrence: "monthly_fixed",
      recurrenceEndDate: null,
      mktBudgetClientId: null,
    });
    created++;
  }

  return { created, skipped, eligible: eligible.length };
}

// ==================== PAYMENTS ====================

export async function getPayments(): Promise<InvoicePayment[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("payments").select("*");
  if (error) return [];
  return (
    data as Array<{
      client_id: string;
      month: string;
      status: InvoicePayment["status"];
      paid_date: string | null;
      amount_override: number | null;
      note: string | null;
    }>
  ).map((r) => ({
    clientId: r.client_id,
    month: r.month,
    status: r.status,
    paidDate: r.paid_date ?? undefined,
    amountOverride: r.amount_override ?? null,
    note: r.note ?? null,
  }));
}

export async function setPaymentStatus(
  clientId: string,
  month: string,
  status: InvoicePayment["status"],
): Promise<void> {
  const supabase = getSupabase();
  const paid_date = status === "paid" ? new Date().toISOString() : null;
  await supabase.from("payments").upsert(
    { client_id: clientId, month, status, paid_date },
    { onConflict: "client_id,month" },
  );
  // Si el pago cambia a 'paid' y el cliente tiene cuenta default,
  // creamos el movimiento de ingreso automáticamente (si no existía
  // uno previo para este payment).
  if (status === "paid") {
    try {
      await autoCreatePaymentMovement(clientId, month);
    } catch (err) {
      // No queremos romper el setPaymentStatus si la creación
      // del movimiento falla — el director puede cargar a mano.
      console.error("autoCreatePaymentMovement:", err);
    }
  }
}

/**
 * Cuando una factura se marca como pagada, crea un movimiento de
 * ingreso en la cuenta bancaria default del cliente (si tiene una
 * configurada). Idempotente — usa una descripción canónica para
 * evitar duplicar el movimiento si se marca pagada / no-pagada /
 * pagada nuevamente.
 *
 * No-op si:
 *   · El cliente no tiene default_cuenta_id configurado.
 *   · Ya existe un movimiento con la descripción canónica.
 */
async function autoCreatePaymentMovement(
  clientId: string,
  month: string,
): Promise<void> {
  const supabase = getSupabase();

  // 1. Datos del cliente: cuenta default + nombre
  const { data: client, error: cliErr } = await supabase
    .from("clients")
    .select("name, default_cuenta_id, fee")
    .eq("id", clientId)
    .maybeSingle();
  if (cliErr || !client) return;
  const cuentaId = (client as { default_cuenta_id?: string | null }).default_cuenta_id;
  if (!cuentaId) return;

  // 2. Importe del payment (override > schedule > fee base)
  const { data: payment } = await supabase
    .from("payments")
    .select("amount_override")
    .eq("client_id", clientId)
    .eq("month", month)
    .maybeSingle();
  const override = (payment as { amount_override?: number | string | null } | null)?.amount_override;
  // Fee schedule efectivo para el mes
  const schedules = await listFeeSchedulesForClient(clientId);
  const scheduled = effectiveFeeForMonth(schedules, clientId, month);
  const fee =
    (override == null
      ? null
      : typeof override === "string"
        ? parseFloat(override)
        : Number(override)) ??
    scheduled ??
    (typeof client.fee === "string" ? parseFloat(client.fee) : Number(client.fee));
  if (!fee || fee <= 0) return;

  // 3. Descripción canónica + chequeo de existencia (idempotente)
  const description = `Cobro factura ${month} · ${client.name}`;
  const { data: existing } = await supabase
    .from("cuenta_movimientos")
    .select("id")
    .eq("cuenta_id", cuentaId)
    .eq("description", description)
    .maybeSingle();
  if (existing) return;

  // 4. Crear el movimiento
  const today = new Date().toISOString().slice(0, 10);
  const { error: movErr } = await supabase.from("cuenta_movimientos").insert({
    cuenta_id: cuentaId,
    fecha: today,
    description,
    category: "ingreso",
    entry_amount: fee,
    exit_amount: 0,
  });
  if (movErr) {
    console.error("autoCreatePaymentMovement insert:", movErr);
  }
}

/**
 * Actualiza el importe del cobro de un mes (override del fee del
 * contrato) y/o la nota libre. Si pasás amountOverride=null se elimina
 * el override y se vuelve a usar el client.fee.
 *
 * Idempotente: si no existe el row del payment todavía, lo crea con
 * status='pending'.
 */
export async function setPaymentAmount(
  clientId: string,
  month: string,
  amountOverride: number | null,
  note?: string | null,
): Promise<void> {
  const supabase = getSupabase();
  // Leer status actual para no resetearlo
  const { data: existing } = await supabase
    .from("payments")
    .select("status, paid_date")
    .eq("client_id", clientId)
    .eq("month", month)
    .maybeSingle();
  await supabase.from("payments").upsert(
    {
      client_id: clientId,
      month,
      status: existing?.status ?? "pending",
      paid_date: existing?.paid_date ?? null,
      amount_override: amountOverride,
      note: note ?? null,
    },
    { onConflict: "client_id,month" },
  );
}

/**
 * Elimina por completo el registro de payment de un cliente para un
 * mes específico. Vuelve a estado "sin registro" (= 'pending' por
 * default cuando se calculan KPIs). Útil cuando el director quiere
 * "borrar" un cobro mal cargado.
 */
export async function deletePayment(
  clientId: string,
  month: string,
): Promise<void> {
  const supabase = getSupabase();
  await supabase
    .from("payments")
    .delete()
    .eq("client_id", clientId)
    .eq("month", month);
}

// ==================== OBJECTIVES ====================

interface ObjRow {
  client_id: string;
  period: string;
  period_type: ClientObjectives["periodType"];
  start_date: string;
  end_date: string;
  items: ClientObjectives["items"];
  updated_at: string;
  updated_by: string;
}

function objFromRow(r: ObjRow): ClientObjectives {
  return {
    clientId: r.client_id,
    period: r.period,
    periodType: r.period_type,
    startDate: r.start_date,
    endDate: r.end_date,
    items: r.items,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  };
}

export async function getObjectives(clientId: string): Promise<ClientObjectives | undefined> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("objectives")
    .select("*")
    .eq("client_id", clientId)
    .maybeSingle();
  if (error || !data) return undefined;
  return objFromRow(data as ObjRow);
}

export async function saveObjectives(obj: ClientObjectives): Promise<void> {
  const supabase = getSupabase();
  await supabase.from("objectives").upsert({
    client_id: obj.clientId,
    period: obj.period,
    period_type: obj.periodType,
    start_date: obj.startDate,
    end_date: obj.endDate,
    items: obj.items,
    updated_at: obj.updatedAt,
    updated_by: obj.updatedBy,
  });
}

// ==================== NOTES ====================

interface NoteRow {
  id: string;
  client_id: string;
  author: string;
  title: string;
  content: string;
  created_at: string;
}

function noteFromRow(r: NoteRow): ClientNote {
  return {
    id: r.id,
    clientId: r.client_id,
    author: r.author,
    title: r.title,
    content: r.content,
    createdAt: r.created_at,
  };
}

export async function getNotes(clientId: string): Promise<ClientNote[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data as NoteRow[]).map(noteFromRow);
}

export async function addNote(
  data: Omit<ClientNote, "id" | "createdAt">,
): Promise<ClientNote> {
  const supabase = getSupabase();
  const { data: inserted, error } = await supabase
    .from("notes")
    .insert({
      client_id: data.clientId,
      author: data.author,
      title: data.title,
      content: data.content,
    })
    .select()
    .single();
  if (error) throw error;
  return noteFromRow(inserted as NoteRow);
}

export async function deleteNote(id: string): Promise<void> {
  const supabase = getSupabase();
  await supabase.from("notes").delete().eq("id", id);
}

// ==================== DEV TASKS ====================

interface TaskRow {
  id: string;
  client_id: string;
  sprint: string | null;
  title: string;
  description: string | null;
  assignee: string;
  priority: TaskPriority;
  status: TaskStatus;
  type: string | null;
  estimated_hours: number | null;
  start_date: string | null;
  due_date: string | null;
  created_at: string;
}

function taskFromRow(r: TaskRow): DevTask {
  return {
    id: r.id,
    clientId: r.client_id,
    sprint: r.sprint ?? undefined,
    title: r.title,
    description: r.description ?? undefined,
    assignee: r.assignee,
    priority: r.priority,
    status: r.status,
    type: r.type ?? undefined,
    estimatedHours: r.estimated_hours ?? undefined,
    startDate: r.start_date ?? undefined,
    dueDate: r.due_date ?? undefined,
    createdAt: r.created_at,
  };
}

export async function getTasks(clientId: string): Promise<DevTask[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("dev_tasks")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data as TaskRow[]).map(taskFromRow);
}

/** Trae TODAS las tareas (sin filtrar por cliente). Usado por el
 *  calendario para mostrar las que tienen dueDate. */
export async function getAllTasks(): Promise<DevTask[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("dev_tasks")
    .select("*")
    .order("due_date", { ascending: true });
  if (error) return [];
  return (data as TaskRow[]).map(taskFromRow);
}

export async function addTask(data: Omit<DevTask, "id" | "createdAt">): Promise<DevTask> {
  const supabase = getSupabase();
  const { data: inserted, error } = await supabase
    .from("dev_tasks")
    .insert({
      client_id: data.clientId,
      sprint: data.sprint ?? null,
      title: data.title,
      description: data.description ?? null,
      assignee: data.assignee,
      priority: data.priority,
      status: data.status,
      type: data.type ?? null,
      estimated_hours: data.estimatedHours ?? null,
      start_date: data.startDate ?? null,
      due_date: data.dueDate ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return taskFromRow(inserted as TaskRow);
}

export async function updateTaskStatus(id: string, status: TaskStatus): Promise<void> {
  const supabase = getSupabase();
  await supabase.from("dev_tasks").update({ status }).eq("id", id);
}

export async function deleteTask(id: string): Promise<void> {
  const supabase = getSupabase();
  await supabase.from("dev_tasks").delete().eq("id", id);
}

// ==================== PRODUCTION CAMPAIGNS ====================

interface ProdRow {
  id: string;
  client_id: string;
  title: string;
  type: string;
  description: string;
  status: "active" | "done";
  budget: number | string;
  spent: number | string;
  has_result: boolean | null;
  items: ProductionCampaign["items"];
  start_date: string | null;
  end_date: string | null;
  result_files: number | null;
  created_at: string;
}

function prodFromRow(r: ProdRow): ProductionCampaign {
  return {
    id: r.id,
    clientId: r.client_id,
    title: r.title,
    type: r.type,
    description: r.description,
    status: r.status,
    budget: typeof r.budget === "string" ? parseFloat(r.budget) : r.budget,
    spent: typeof r.spent === "string" ? parseFloat(r.spent) : r.spent,
    hasResult: r.has_result ?? false,
    items: r.items,
    startDate: r.start_date ?? undefined,
    endDate: r.end_date ?? undefined,
    resultFiles: r.result_files ?? undefined,
    createdAt: r.created_at,
  };
}

export async function getProdCampaigns(clientId: string): Promise<ProductionCampaign[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("production_campaigns")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data as ProdRow[]).map(prodFromRow);
}

export async function addProdCampaign(
  data: Omit<ProductionCampaign, "id" | "createdAt" | "spent">,
): Promise<ProductionCampaign> {
  const supabase = getSupabase();
  const spent = data.items.reduce((s, i) => s + i.amount, 0);
  const { data: inserted, error } = await supabase
    .from("production_campaigns")
    .insert({
      client_id: data.clientId,
      title: data.title,
      type: data.type,
      description: data.description,
      status: data.status,
      budget: data.budget,
      spent,
      has_result: data.hasResult,
      items: data.items,
      start_date: data.startDate ?? null,
      end_date: data.endDate ?? null,
      result_files: data.resultFiles ?? 0,
    })
    .select()
    .single();
  if (error) throw error;
  return prodFromRow(inserted as ProdRow);
}

export async function deleteProdCampaign(id: string): Promise<void> {
  const supabase = getSupabase();
  await supabase.from("production_campaigns").delete().eq("id", id);
}

// ==================== CONTENT POSTS ====================

interface ContentRow {
  id: string;
  client_id: string;
  date: string;
  time: string | null;
  network: ContentNetwork;
  format: ContentFormat;
  brief: string;
  copy: string | null;
  status: ContentStatus;
  source: "ai" | "manual";
  created_at: string;
  // Migración 045
  idea?: string | null;
  cta?: string | null;
  assigned_to?: string | null;
  influencer?: string | null;
}

function contentFromRow(r: ContentRow): ContentPost {
  return {
    id: r.id,
    clientId: r.client_id,
    date: r.date,
    time: r.time,
    network: r.network,
    format: r.format,
    brief: r.brief,
    idea: r.idea ?? null,
    copy: r.copy ?? null,
    cta: r.cta ?? null,
    influencer: r.influencer ?? null,
    assignedTo: r.assigned_to ?? null,
    status: r.status,
    source: r.source,
    createdAt: r.created_at,
  };
}

export async function getContent(clientId: string): Promise<ContentPost[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("content_posts")
    .select("*")
    .eq("client_id", clientId)
    .order("date", { ascending: true });
  if (error) return [];
  return (data as ContentRow[]).map(contentFromRow);
}

export async function addContent(
  data: Omit<ContentPost, "id" | "createdAt">,
): Promise<ContentPost> {
  const supabase = getSupabase();
  const { data: inserted, error } = await supabase
    .from("content_posts")
    .insert({
      client_id: data.clientId,
      date: data.date,
      time: data.time ?? null,
      network: data.network,
      format: data.format,
      brief: data.brief,
      idea: data.idea ?? null,
      copy: data.copy ?? null,
      cta: data.cta ?? null,
      influencer: data.influencer ?? null,
      assigned_to: data.assignedTo ?? null,
      status: data.status,
      source: data.source,
    })
    .select()
    .single();
  if (error) throw error;
  return contentFromRow(inserted as ContentRow);
}

/**
 * Actualiza campos editables de una pieza (idea, copy, cta, fecha,
 * formato, red, influencer, assigned_to, brief). Solo se mandan los
 * campos definidos en el patch.
 */
export interface UpdateContentInput {
  date?: string;
  time?: string | null;
  network?: ContentNetwork;
  format?: ContentFormat;
  brief?: string;
  idea?: string | null;
  copy?: string | null;
  cta?: string | null;
  influencer?: string | null;
  assignedTo?: string | null;
  status?: ContentStatus;
}

export async function updateContent(
  id: string,
  patch: UpdateContentInput,
): Promise<ContentPost | null> {
  const supabase = getSupabase();
  // Mapear camelCase → snake_case
  const dbPatch: Record<string, unknown> = {};
  if (patch.date !== undefined) dbPatch.date = patch.date;
  if (patch.time !== undefined) dbPatch.time = patch.time;
  if (patch.network !== undefined) dbPatch.network = patch.network;
  if (patch.format !== undefined) dbPatch.format = patch.format;
  if (patch.brief !== undefined) dbPatch.brief = patch.brief;
  if (patch.idea !== undefined) dbPatch.idea = patch.idea;
  if (patch.copy !== undefined) dbPatch.copy = patch.copy;
  if (patch.cta !== undefined) dbPatch.cta = patch.cta;
  if (patch.influencer !== undefined) dbPatch.influencer = patch.influencer;
  if (patch.assignedTo !== undefined) dbPatch.assigned_to = patch.assignedTo;
  if (patch.status !== undefined) dbPatch.status = patch.status;
  const { data, error } = await supabase
    .from("content_posts")
    .update(dbPatch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return contentFromRow(data as ContentRow);
}

export async function deleteContent(id: string): Promise<void> {
  const supabase = getSupabase();
  await supabase.from("content_posts").delete().eq("id", id);
}

// ==================== ROUTING RULES ====================

interface RuleRow {
  id: string;
  client_id: string;
  task: string;
  executor: string;
  condition: string;
  requires_auth: boolean;
  created_at: string;
}

function ruleFromRow(r: RuleRow): RoutingRule {
  return {
    id: r.id,
    clientId: r.client_id,
    task: r.task,
    executor: r.executor,
    condition: r.condition,
    requiresAuth: r.requires_auth,
    createdAt: r.created_at,
  };
}

export async function getRouting(clientId: string): Promise<RoutingRule[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("routing_rules")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data as RuleRow[]).map(ruleFromRow);
}

export async function addRule(
  data: Omit<RoutingRule, "id" | "createdAt">,
): Promise<RoutingRule> {
  const supabase = getSupabase();
  const { data: inserted, error } = await supabase
    .from("routing_rules")
    .insert({
      client_id: data.clientId,
      task: data.task,
      executor: data.executor,
      condition: data.condition,
      requires_auth: data.requiresAuth,
    })
    .select()
    .single();
  if (error) throw error;
  return ruleFromRow(inserted as RuleRow);
}

export async function deleteRule(id: string): Promise<void> {
  const supabase = getSupabase();
  await supabase.from("routing_rules").delete().eq("id", id);
}

// ==================== INTEGRATIONS ====================

interface IntRow {
  id: string;
  client_id: string;
  key: string;
  name: string;
  group_name: string;
  status: Integration["status"];
  account: string | null;
  credentials: Record<string, string> | null;
  submitted_by: string | null;
  submitted_at: string | null;
}

function intFromRow(r: IntRow): Integration {
  return {
    id: r.id,
    clientId: r.client_id,
    key: r.key,
    name: r.name,
    group: r.group_name,
    status: r.status,
    account: r.account ?? undefined,
    credentials: r.credentials ?? {},
    submittedBy: r.submitted_by,
    submittedAt: r.submitted_at,
  };
}

export async function getIntegrations(clientId: string): Promise<Integration[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("integrations")
    .select("id, client_id, key, name, group_name, status, account, credentials, submitted_by, submitted_at")
    .eq("client_id", clientId);
  if (error) return [];
  return (data as IntRow[]).map(intFromRow);
}

export async function saveIntegrations(
  clientId: string,
  integrations: Integration[],
): Promise<void> {
  const supabase = getSupabase();
  // Primero limpiamos las existentes de ese cliente
  await supabase.from("integrations").delete().eq("client_id", clientId);
  if (integrations.length === 0) return;
  await supabase.from("integrations").insert(
    integrations.map((i) => ({
      id: i.id,
      client_id: clientId,
      key: i.key,
      name: i.name,
      group_name: i.group,
      status: i.status,
      account: i.account ?? null,
      credentials: i.credentials ?? {},
    })),
  );
}

export async function toggleIntegration(clientId: string, key: string): Promise<void> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("integrations")
    .select("status")
    .eq("client_id", clientId)
    .eq("key", key)
    .maybeSingle();

  if (!data) return;
  const next = data.status === "connected" ? "disconnected" : "connected";
  await supabase
    .from("integrations")
    .update({ status: next })
    .eq("client_id", clientId)
    .eq("key", key);
}

/**
 * Guarda credenciales/IDs cargadas por el cliente desde el portal.
 * Setea status='connected' automáticamente y registra submitted_by/at.
 * El trigger SQL `audit_integration_update` se encarga del audit_log
 * y la notif al team.
 */
export async function updateIntegrationCredentials(
  clientId: string,
  key: string,
  credentials: Record<string, string>,
  userId: string,
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("integrations")
    .update({
      credentials,
      status: "connected",
      submitted_by: userId,
      submitted_at: new Date().toISOString(),
    })
    .eq("client_id", clientId)
    .eq("key", key);
  if (error) throw new Error(`No pude guardar las credenciales: ${error.message}`);
}
