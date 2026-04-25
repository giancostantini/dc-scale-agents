// ==================== CAPA DE PERSISTENCIA ====================
// Migrado de localStorage a Supabase. Todas las funciones son async.
// Los nombres de las funciones se mantienen para que el resto del código
// casi no tenga que cambiar — solo agregar `await`.

import { getSupabase } from "./supabase/client";
import type {
  Client,
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
}

function leadFromRow(r: LeadRow): Lead {
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
  };
}

export async function getLeads(): Promise<Lead[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });
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
      value: data.value,
      stage: data.stage,
      source: data.source,
      note: data.note ?? null,
      meeting_booked: data.meetingBooked ?? false,
    })
    .select()
    .single();
  if (error) throw error;
  return leadFromRow(inserted as LeadRow);
}

export async function updateLeadStage(id: string, stage: PipelineStage): Promise<void> {
  const supabase = getSupabase();
  await supabase.from("leads").update({ stage }).eq("id", id);
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

// ==================== EXPENSES ====================

interface ExpenseRow {
  id: string;
  date: string;
  concept: string;
  category: ExpenseCategory;
  assigned_to: string;
  amount: number | string;
}

function expenseFromRow(r: ExpenseRow): Expense {
  return {
    id: r.id,
    date: r.date,
    concept: r.concept,
    category: r.category,
    assignedTo: r.assigned_to,
    amount: typeof r.amount === "string" ? parseFloat(r.amount) : r.amount,
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
    })
    .select()
    .single();
  if (error) throw error;
  return expenseFromRow(inserted as ExpenseRow);
}

export async function deleteExpense(id: string): Promise<void> {
  const supabase = getSupabase();
  await supabase.from("expenses").delete().eq("id", id);
}

// ==================== PAYMENTS ====================

export async function getPayments(): Promise<InvoicePayment[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("payments").select("*");
  if (error) return [];
  return (data as Array<{ client_id: string; month: string; status: InvoicePayment["status"]; paid_date: string | null }>).map(
    (r) => ({
      clientId: r.client_id,
      month: r.month,
      status: r.status,
      paidDate: r.paid_date ?? undefined,
    }),
  );
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
  time: string;
  network: ContentNetwork;
  format: ContentFormat;
  brief: string;
  copy: string | null;
  status: ContentStatus;
  source: "ai" | "manual";
  created_at: string;
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
    copy: r.copy ?? undefined,
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
      time: data.time,
      network: data.network,
      format: data.format,
      brief: data.brief,
      copy: data.copy ?? null,
      status: data.status,
      source: data.source,
    })
    .select()
    .single();
  if (error) throw error;
  return contentFromRow(inserted as ContentRow);
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
  };
}

export async function getIntegrations(clientId: string): Promise<Integration[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("integrations")
    .select("*")
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
