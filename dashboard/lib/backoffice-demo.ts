/**
 * Datos DEMO del backoffice SaaS por aplicación (Tildalo, Encargue, Rondín,
 * Libreta). Deterministas (PRNG sembrado por slug) para que SSR y cliente
 * coincidan. Alimentan todas las pantallas del backoffice hasta que haya
 * datos reales — están marcados como DEMO en la UI.
 *
 * ⚠️ Nada de esto es real: son clientes/uso/tickets ficticios para que el
 * backoffice se vea completo y demostrable. Se reemplaza por datos reales
 * cuando conectemos cada fuente.
 */

import { PRODUCT_BY_SLUG } from "./productos";

// ---------- PRNG determinista ----------
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeRng(slug: string, salt = "") {
  return mulberry32(hashStr(`${slug}:${salt}`));
}
function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}
function int(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

// Ancla de "hoy" fija por carga de módulo (evita desajustes SSR/cliente).
const TODAY = new Date();
function isoDaysAgo(days: number): string {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
function monthKeyAgo(back: number): string {
  const d = new Date(TODAY.getFullYear(), TODAY.getMonth() - back, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function monthLabel(mk: string): string {
  const M = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const [y, m] = mk.split("-").map(Number);
  return `${M[m - 1]} ${String(y).slice(2)}`;
}

// ---------- Meta por aplicación ----------
export interface AppMeta {
  slug: string;
  name: string;
  accent: string;
  /** Unidad de consumo principal del plan (plural). */
  unit: string;
  unitSingular: string;
  /** Verbo de la operación principal, p/ activity log. */
  opVerb: string;
  /** Módulos de producto específicos: [key, label]. */
  modules: { key: string; label: string }[];
  /** Planes comerciales de la app. */
  plans: DemoPlan[];
  moneda: string;
}

export interface DemoPlan {
  id: string;
  nombre: string;
  precioMensual: number;
  precioAnual: number;
  usuarios: number;
  limiteUso: number;
  soporte: string;
}

const COMMON_INDUSTRIES = [
  "Retail", "Gastronomía", "Distribución", "Manufactura", "Servicios",
  "Construcción", "Salud", "Agro", "Logística", "Tecnología",
];
const COUNTRIES = ["Uruguay", "Argentina", "Chile", "Paraguay"];
const RESPONSABLES = ["Federico D.", "Gianluca C.", "Equipo CS"];

const APP_CONFIG: Record<string, Omit<AppMeta, "slug" | "name" | "accent">> = {
  tilde: {
    unit: "Facturas", unitSingular: "factura", opVerb: "procesó factura", moneda: "USD",
    modules: [
      { key: "facturas", label: "Facturas" },
      { key: "procesamiento", label: "Procesamiento" },
      { key: "precision", label: "Precisión" },
      { key: "catalogo", label: "Catálogo" },
      { key: "costos", label: "Aumentos de costo" },
      { key: "cfe", label: "CFE" },
    ],
    plans: [
      { id: "starter", nombre: "Starter", precioMensual: 49, precioAnual: 490, usuarios: 2, limiteUso: 200, soporte: "Email" },
      { id: "pro", nombre: "Pro", precioMensual: 119, precioAnual: 1190, usuarios: 5, limiteUso: 800, soporte: "Prioritario" },
      { id: "business", nombre: "Business", precioMensual: 249, precioAnual: 2490, usuarios: 15, limiteUso: 3000, soporte: "Dedicado" },
    ],
  },
  rondin: {
    unit: "Entregas", unitSingular: "entrega", opVerb: "gestionó entrega", moneda: "USD",
    modules: [
      { key: "rutas", label: "Rutas" },
      { key: "entregas", label: "Entregas" },
      { key: "vehiculos", label: "Vehículos" },
      { key: "conductores", label: "Conductores" },
      { key: "optimizacion", label: "Optimización" },
      { key: "notificaciones", label: "Notificaciones" },
    ],
    plans: [
      { id: "flota5", nombre: "Flota 5", precioMensual: 89, precioAnual: 890, usuarios: 5, limiteUso: 1500, soporte: "Email" },
      { id: "flota15", nombre: "Flota 15", precioMensual: 199, precioAnual: 1990, usuarios: 15, limiteUso: 5000, soporte: "Prioritario" },
      { id: "flota50", nombre: "Flota 50", precioMensual: 449, precioAnual: 4490, usuarios: 50, limiteUso: 20000, soporte: "Dedicado" },
    ],
  },
  encargue: {
    unit: "Pedidos", unitSingular: "pedido", opVerb: "recibió pedido", moneda: "USD",
    modules: [
      { key: "conversaciones", label: "Conversaciones" },
      { key: "pedidos", label: "Pedidos" },
      { key: "productos", label: "Productos" },
      { key: "ia", label: "IA" },
      { key: "whatsapp", label: "WhatsApp" },
    ],
    plans: [
      { id: "basico", nombre: "Básico", precioMensual: 59, precioAnual: 590, usuarios: 3, limiteUso: 500, soporte: "Email" },
      { id: "pro", nombre: "Pro", precioMensual: 139, precioAnual: 1390, usuarios: 8, limiteUso: 2500, soporte: "Prioritario" },
      { id: "scale", nombre: "Scale", precioMensual: 299, precioAnual: 2990, usuarios: 25, limiteUso: 10000, soporte: "Dedicado" },
    ],
  },
  libreta: {
    unit: "Visitas", unitSingular: "visita", opVerb: "registró visita", moneda: "USD",
    modules: [
      { key: "vendedores", label: "Vendedores" },
      { key: "visitas", label: "Visitas" },
      { key: "pedidos", label: "Pedidos" },
      { key: "clientes", label: "Clientes" },
      { key: "actividad", label: "Actividad" },
      { key: "geografia", label: "Geografía" },
    ],
    plans: [
      { id: "equipo5", nombre: "Equipo 5", precioMensual: 69, precioAnual: 690, usuarios: 5, limiteUso: 2000, soporte: "Email" },
      { id: "equipo15", nombre: "Equipo 15", precioMensual: 159, precioAnual: 1590, usuarios: 15, limiteUso: 6000, soporte: "Prioritario" },
      { id: "equipo40", nombre: "Equipo 40", precioMensual: 349, precioAnual: 3490, usuarios: 40, limiteUso: 18000, soporte: "Dedicado" },
    ],
  },
};

export const APP_SLUGS = ["tilde", "rondin", "encargue", "libreta"] as const;

export function appMeta(slug: string): AppMeta {
  const cfg = APP_CONFIG[slug] ?? APP_CONFIG.tilde;
  const brand = PRODUCT_BY_SLUG[slug];
  return {
    slug,
    name: brand?.name ?? slug,
    accent: brand?.accent ?? "#2F7D6B",
    ...cfg,
  };
}

// ---------- Tipos ----------
export type EstadoCliente =
  | "activo" | "trial" | "suspendido" | "moroso" | "cancelado" | "pendiente" | "riesgo";

export interface DemoCompany {
  id: string;
  nombre: string;
  razonSocial: string;
  rut: string;
  plan: string;
  estado: EstadoCliente;
  usuarios: number;
  usuariosActivos: number;
  usoActual: number;
  limite: number;
  mrr: number;
  moneda: string;
  fechaAlta: string;
  ultimoAcceso: string;
  health: number;
  responsable: string;
  sistema: string;
  pais: string;
  industria: string;
  locales: number;
  contacto: string;
  email: string;
  telefono: string;
}

const ESTADOS: { estado: EstadoCliente; w: number }[] = [
  { estado: "activo", w: 60 },
  { estado: "trial", w: 12 },
  { estado: "riesgo", w: 8 },
  { estado: "moroso", w: 6 },
  { estado: "suspendido", w: 4 },
  { estado: "pendiente", w: 4 },
  { estado: "cancelado", w: 6 },
];
function weightedEstado(rng: () => number): EstadoCliente {
  const total = ESTADOS.reduce((s, e) => s + e.w, 0);
  let r = rng() * total;
  for (const e of ESTADOS) {
    if (r < e.w) return e.estado;
    r -= e.w;
  }
  return "activo";
}

const COMPANY_PREFIXES = [
  "Distribuidora", "Comercial", "Grupo", "Almacén", "Logística", "Mercado",
  "Casa", "Importadora", "Mayorista", "Depósito", "Barraca", "Supermercado",
];
const COMPANY_NAMES = [
  "del Este", "Central", "San Martín", "La Estrella", "Rivera", "Atlántida",
  "Norte", "del Sur", "Prado", "Carrasco", "Pocitos", "Unión", "Treinta y Tres",
  "La Paz", "Delta", "Horizonte", "Pampa", "Litoral", "Costa", "Andes",
];
const FIRST = ["Martín", "Lucía", "Diego", "Sofía", "Andrés", "Valentina", "Rodrigo", "Camila", "Pablo", "Flor"];
const LAST = ["Pérez", "González", "Rodríguez", "Fernández", "López", "Silva", "Méndez", "Castro", "Rossi", "Vega"];

function makeCompanies(slug: string): DemoCompany[] {
  const meta = appMeta(slug);
  const rng = makeRng(slug, "companies");
  // Cada app tiene un volumen distinto de clientes.
  const counts: Record<string, number> = { tilde: 42, rondin: 23, encargue: 31, libreta: 28 };
  const n = counts[slug] ?? 25;
  const out: DemoCompany[] = [];
  for (let i = 0; i < n; i++) {
    const plan = pick(rng, meta.plans);
    const estado = i === 0 ? "activo" : weightedEstado(rng);
    const limite = plan.limiteUso;
    const pct = estado === "trial" ? rng() * 0.5 : 0.2 + rng() * 0.85;
    const usoActual = Math.round(limite * pct);
    const usuarios = Math.max(1, Math.round(plan.usuarios * (0.4 + rng() * 0.8)));
    const activo = estado === "activo" || estado === "riesgo" || estado === "moroso";
    const fn = pick(rng, FIRST);
    const ln = pick(rng, LAST);
    const nombre = `${pick(rng, COMPANY_PREFIXES)} ${pick(rng, COMPANY_NAMES)}`;
    out.push({
      id: `${slug}-c${String(i + 1).padStart(3, "0")}`,
      nombre,
      razonSocial: `${nombre} S.A.`,
      rut: `21${int(rng, 100000, 999999)}001${int(rng, 1, 9)}`,
      plan: plan.id,
      estado,
      usuarios,
      usuariosActivos: activo ? Math.max(1, Math.round(usuarios * (0.5 + rng() * 0.5))) : 0,
      usoActual,
      limite,
      mrr: estado === "activo" || estado === "riesgo" || estado === "moroso"
        ? plan.precioMensual
        : estado === "trial" || estado === "pendiente"
          ? 0
          : 0,
      moneda: meta.moneda,
      fechaAlta: isoDaysAgo(int(rng, 10, 720)),
      ultimoAcceso: activo ? isoDaysAgo(int(rng, 0, estado === "riesgo" ? 14 : 4)) : isoDaysAgo(int(rng, 15, 90)),
      health: estado === "cancelado" ? 0 : estado === "riesgo" || estado === "moroso"
        ? int(rng, 20, 48)
        : estado === "trial" ? int(rng, 45, 75) : int(rng, 55, 98),
      responsable: pick(rng, RESPONSABLES),
      sistema: pick(rng, ["ERP propio", "Memory", "Zureo", "Dynamics", "SAP B1", "Ninguno"]),
      pais: pick(rng, COUNTRIES),
      industria: pick(rng, COMMON_INDUSTRIES),
      locales: int(rng, 1, 12),
      contacto: `${fn} ${ln}`,
      email: `${fn.toLowerCase()}@${nombre.toLowerCase().replace(/[^a-z]/g, "")}.com`,
      telefono: `09${int(rng, 1000000, 9999999)}`,
    });
  }
  return out;
}

// Cache por slug (los datos son estables por carga).
const companyCache = new Map<string, DemoCompany[]>();
export function getCompanies(slug: string): DemoCompany[] {
  if (!companyCache.has(slug)) companyCache.set(slug, makeCompanies(slug));
  return companyCache.get(slug)!;
}
export function getCompany(slug: string, id: string): DemoCompany | undefined {
  return getCompanies(slug).find((c) => c.id === id);
}

// ---------- KPIs ejecutivos ----------
export interface ExecKpis {
  clientesActivos: number;
  clientesNuevosMes: number;
  trials: number;
  cancelados: number;
  enRiesgo: number;
  morosos: number;
  mrr: number;
  mrrNuevo: number;
  mrrPerdido: number;
  mrrExpansion: number;
  mrrNetNew: number;
  arr: number;
  churnClientes: number;
  churnRevenue: number;
  usuariosActivos: number;
  usoMes: number;
  moneda: string;
  crecimientoMrrPct: number;
}

export function execKpis(slug: string): ExecKpis {
  const meta = appMeta(slug);
  const cs = getCompanies(slug);
  const rng = makeRng(slug, "kpis");
  const activos = cs.filter((c) => c.estado === "activo" || c.estado === "riesgo" || c.estado === "moroso");
  const mrr = activos.reduce((s, c) => s + c.mrr, 0);
  const trials = cs.filter((c) => c.estado === "trial").length;
  const cancelados = cs.filter((c) => c.estado === "cancelado").length;
  const mrrNuevo = int(rng, 3, 9) * 100 + Math.round(rng() * 90);
  const mrrPerdido = int(rng, 1, 4) * 100 + Math.round(rng() * 90);
  const mrrExpansion = int(rng, 1, 5) * 80;
  const base = activos.length - int(rng, 2, 6);
  return {
    clientesActivos: activos.length,
    clientesNuevosMes: int(rng, 3, 14),
    trials,
    cancelados,
    enRiesgo: cs.filter((c) => c.estado === "riesgo").length,
    morosos: cs.filter((c) => c.estado === "moroso").length,
    mrr,
    mrrNuevo,
    mrrPerdido,
    mrrExpansion,
    mrrNetNew: mrrNuevo + mrrExpansion - mrrPerdido,
    arr: mrr * 12,
    churnClientes: Math.round((cancelados / Math.max(1, base + cancelados)) * 1000) / 10,
    churnRevenue: Math.round((mrrPerdido / Math.max(1, mrr)) * 1000) / 10,
    usuariosActivos: cs.reduce((s, c) => s + c.usuariosActivos, 0),
    usoMes: cs.reduce((s, c) => s + c.usoActual, 0),
    moneda: meta.moneda,
    crecimientoMrrPct: Math.round(((mrrNuevo + mrrExpansion - mrrPerdido) / Math.max(1, mrr)) * 1000) / 10,
  };
}

// ---------- Series temporales ----------
export type SeriesMetric = "mrr" | "clientes" | "usuarios" | "uso" | "revenue" | "churn";
export interface SeriesPoint { mk: string; label: string; value: number; }

export function series(slug: string, metric: SeriesMetric, months = 12): SeriesPoint[] {
  const rng = makeRng(slug, `series:${metric}`);
  const k = execKpis(slug);
  const endVal: Record<SeriesMetric, number> = {
    mrr: k.mrr,
    clientes: k.clientesActivos,
    usuarios: k.usuariosActivos,
    uso: k.usoMes,
    revenue: k.mrr,
    churn: k.churnClientes,
  };
  const end = endVal[metric];
  const pts: SeriesPoint[] = [];
  // Camino creciente con ruido hacia el valor final.
  let v = end * (metric === "churn" ? 1.6 : 0.45);
  for (let i = months - 1; i >= 0; i--) {
    const progress = (months - 1 - i) / (months - 1);
    const target = metric === "churn"
      ? end * (1.6 - progress * 0.6)
      : end * (0.45 + progress * 0.55);
    v = target * (0.92 + rng() * 0.16);
    pts.push({
      mk: monthKeyAgo(i),
      label: monthLabel(monthKeyAgo(i)),
      value: Math.max(0, Math.round(v * 10) / 10),
    });
  }
  // Fijar el último al valor actual real.
  pts[pts.length - 1].value = Math.round(end * 10) / 10;
  return pts;
}

// ---------- Alertas ----------
export type AlertSeverity = "critica" | "alta" | "media" | "info";
export interface DemoAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  companyId?: string;
  action?: string;
}

export function getAlerts(slug: string): DemoAlert[] {
  const cs = getCompanies(slug);
  const out: DemoAlert[] = [];
  for (const c of cs) {
    const pct = c.usoActual / Math.max(1, c.limite);
    if (pct >= 0.95 && c.estado === "activo") {
      out.push({ id: `al-${c.id}-lim`, severity: "alta", title: `${c.nombre} alcanzó ${Math.round(pct * 100)}% del plan`, detail: "Posible upgrade de plan.", companyId: c.id, action: "upgrade" });
    } else if (pct >= 0.85 && c.estado === "activo") {
      out.push({ id: `al-${c.id}-lim2`, severity: "media", title: `${c.nombre} superó el 85% del plan`, detail: "Monitorear consumo.", companyId: c.id, action: "ver" });
    }
    if (c.estado === "moroso") {
      out.push({ id: `al-${c.id}-pago`, severity: "critica", title: `Pago vencido — ${c.nombre}`, detail: "Factura impaga del período.", companyId: c.id, action: "cobrar" });
    }
    if (c.estado === "riesgo") {
      out.push({ id: `al-${c.id}-riesgo`, severity: "alta", title: `${c.nombre} en riesgo de cancelar`, detail: "Caída de uso y accesos.", companyId: c.id, action: "contactar" });
    }
  }
  // Un par de alertas técnicas.
  out.push({ id: "al-int", severity: "alta", title: "Integración con WhatsApp con errores", detail: "3 fallos de sincronización en 24h.", action: "ver" });
  out.push({ id: "al-api", severity: "media", title: "Latencia de API por encima del umbral", detail: "p95 = 820ms en el último período.", action: "ver" });
  const order: AlertSeverity[] = ["critica", "alta", "media", "info"];
  return out.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity)).slice(0, 12);
}

// ---------- Health distribution ----------
export function healthBuckets(slug: string) {
  const cs = getCompanies(slug);
  return {
    saludables: cs.filter((c) => c.health >= 80).length,
    atencion: cs.filter((c) => c.health >= 50 && c.health < 80).length,
    riesgo: cs.filter((c) => c.health > 0 && c.health < 50).length,
  };
}

// ---------- Uso (DAU/WAU/MAU) ----------
export function usageMetrics(slug: string) {
  const k = execKpis(slug);
  const rng = makeRng(slug, "usage");
  const mau = k.usuariosActivos;
  return {
    dau: Math.round(mau * (0.22 + rng() * 0.1)),
    wau: Math.round(mau * (0.55 + rng() * 0.1)),
    mau,
    sesiones: Math.round(mau * (3 + rng() * 4)),
    operaciones: k.usoMes,
    duracionProm: `${int(rng, 4, 18)} min`,
    opsPorCliente: Math.round(k.usoMes / Math.max(1, k.clientesActivos)),
    usuariosPorCliente: Math.round((k.usuariosActivos / Math.max(1, k.clientesActivos)) * 10) / 10,
  };
}

// ---------- Funcionalidades ----------
export interface FeatureUsage { feature: string; usuarios: number; clientes: number; usos: number; varPct: number; }
export function featureUsage(slug: string): FeatureUsage[] {
  const meta = appMeta(slug);
  const rng = makeRng(slug, "features");
  const cs = getCompanies(slug).length;
  const feats: Record<string, string[]> = {
    tilde: ["Carga de factura", "Lectura OCR", "Control CFE", "Asociación de catálogo", "Detección de aumentos", "Export contable", "Aprobación de compra"],
    rondin: ["Creación de ruta", "Optimización", "Tracking en vivo", "Notificación de entrega", "Prueba de entrega", "Reportes de flota"],
    encargue: ["Toma de pedido IA", "Catálogo WhatsApp", "Confirmación de pedido", "Derivación a humano", "Carga al ERP", "Cobro"],
    libreta: ["Registro de visita", "Carga de pedido", "Geolocalización", "Catálogo offline", "Rutero del día", "Cobranza"],
  };
  return (feats[slug] ?? feats.tilde).map((feature, i) => ({
    feature,
    usuarios: int(rng, 20, 400),
    clientes: Math.max(1, Math.round(cs * (0.3 + rng() * 0.6))),
    usos: int(rng, 200, 9000),
    varPct: Math.round((rng() * 40 - 10) * 10) / 10,
  })).sort((a, b) => b.usos - a.usos);
}

// ---------- Actividad ----------
export interface ActivityEntry { id: string; ts: string; empresa: string; usuario: string; accion: string; modulo: string; }
export function activityLog(slug: string, n = 40): ActivityEntry[] {
  const meta = appMeta(slug);
  const cs = getCompanies(slug);
  const rng = makeRng(slug, "activity");
  const acciones = [
    `${meta.opVerb}`, "creó usuario", "cambió de plan", "pago recibido",
    "integración conectada", "exportó reporte", "cerró ticket", "inició sesión",
  ];
  const out: ActivityEntry[] = [];
  for (let i = 0; i < n; i++) {
    const c = pick(rng, cs);
    const mins = i * int(rng, 2, 20);
    const d = new Date(TODAY.getTime() - mins * 60000);
    out.push({
      id: `act-${slug}-${i}`,
      ts: d.toISOString(),
      empresa: c.nombre,
      usuario: c.contacto,
      accion: pick(rng, acciones),
      modulo: pick(rng, meta.modules).label,
    });
  }
  return out;
}

// ---------- Soporte ----------
export type TicketTipo = "bug" | "consulta" | "facturacion" | "integracion" | "solicitud" | "feature";
export type TicketEstado = "abierto" | "pendiente" | "resuelto";
export interface DemoTicket {
  id: string; asunto: string; empresa: string; tipo: TicketTipo; estado: TicketEstado;
  prioridad: "alta" | "media" | "baja"; creado: string; horasResolucion: number | null;
}
export function tickets(slug: string): DemoTicket[] {
  const cs = getCompanies(slug);
  const rng = makeRng(slug, "tickets");
  const asuntos = [
    "No puedo iniciar sesión", "Error al procesar operación", "Consulta de facturación",
    "Falla en la integración", "Pedido de nueva función", "Dato incorrecto en reporte",
    "Usuario bloqueado", "Duda sobre el plan", "Lentitud en la carga", "Exportación falla",
  ];
  const n = int(rng, 14, 30);
  const out: DemoTicket[] = [];
  for (let i = 0; i < n; i++) {
    const estado = pick(rng, ["abierto", "pendiente", "resuelto", "resuelto", "resuelto"] as TicketEstado[]);
    out.push({
      id: `TK-${1000 + i}`,
      asunto: pick(rng, asuntos),
      empresa: pick(rng, cs).nombre,
      tipo: pick(rng, ["bug", "consulta", "facturacion", "integracion", "solicitud", "feature"] as TicketTipo[]),
      estado,
      prioridad: pick(rng, ["alta", "media", "baja", "media"] as ("alta" | "media" | "baja")[]),
      creado: isoDaysAgo(int(rng, 0, 40)),
      horasResolucion: estado === "resuelto" ? int(rng, 1, 72) : null,
    });
  }
  return out;
}

// ---------- Incidencias ----------
export interface DemoIncidencia { id: string; titulo: string; severidad: "critica" | "alta" | "media" | "baja"; estado: "abierto" | "investigando" | "resuelto"; abierta: string; afectados: number; }
export function incidencias(slug: string): DemoIncidencia[] {
  const rng = makeRng(slug, "incidencias");
  const titulos = ["Caída parcial de API", "Error en sincronización", "Timeout en procesamiento", "Fallo en envío de notificaciones", "Degradación de performance"];
  return Array.from({ length: int(rng, 3, 7) }).map((_, i) => ({
    id: `INC-${200 + i}`,
    titulo: pick(rng, titulos),
    severidad: pick(rng, ["critica", "alta", "media", "baja", "media"] as ("critica" | "alta" | "media" | "baja")[]),
    estado: pick(rng, ["abierto", "investigando", "resuelto", "resuelto"] as ("abierto" | "investigando" | "resuelto")[]),
    abierta: isoDaysAgo(int(rng, 0, 30)),
    afectados: int(rng, 1, 40),
  }));
}

// ---------- Integraciones ----------
export interface DemoIntegracion { nombre: string; clientes: number; estado: "ok" | "degradada" | "caida"; ultimaSync: string; errores24h: number; }
export function integraciones(slug: string): DemoIntegracion[] {
  const rng = makeRng(slug, "integraciones");
  const base: Record<string, string[]> = {
    tilde: ["DGI / CFE", "Memory", "Zureo", "Contabilidad", "Email", "Webhooks"],
    rondin: ["Google Maps", "WhatsApp", "Waze", "GPS flota", "ERP cliente", "Webhooks"],
    encargue: ["WhatsApp Business", "ERP cliente", "Mercado Pago", "Catálogo", "Webhooks"],
    libreta: ["Google Maps", "ERP cliente", "WhatsApp", "Cobranza", "Webhooks"],
  };
  return (base[slug] ?? base.tilde).map((nombre) => {
    const estado = pick(rng, ["ok", "ok", "ok", "degradada", "caida"] as ("ok" | "degradada" | "caida")[]);
    return {
      nombre,
      clientes: int(rng, 3, getCompanies(slug).length),
      estado,
      ultimaSync: estado === "caida" ? isoDaysAgo(int(rng, 1, 3)) : "hace minutos",
      errores24h: estado === "ok" ? 0 : int(rng, 1, 25),
    };
  });
}

// ---------- Errores / APIs / Infra ----------
export function errorStats(slug: string) {
  const rng = makeRng(slug, "errors");
  const total = int(rng, 40, 400);
  return {
    total,
    criticos: int(rng, 0, 12),
    tasa: Math.round((rng() * 2) * 100) / 100,
    usuariosAfectados: int(rng, 1, 60),
    clientesAfectados: int(rng, 1, 15),
    top: ["TypeError: cannot read property", "Timeout externo", "Validación fallida", "Null reference", "Rate limit excedido"]
      .map((msg) => ({ msg, count: int(rng, 3, 120) }))
      .sort((a, b) => b.count - a.count),
  };
}
export function apiStats(slug: string) {
  const rng = makeRng(slug, "api");
  const reqs = int(rng, 50000, 900000);
  const fail = int(rng, 100, 4000);
  return {
    requests: reqs,
    exitosos: reqs - fail,
    fallidos: fail,
    latenciaP95: int(rng, 120, 900),
    endpoints: ["/operaciones", "/clientes", "/auth", "/webhooks", "/reportes", "/catalogo"]
      .map((endpoint) => ({ endpoint, requests: int(rng, 2000, 200000), errores: int(rng, 0, 300), latencia: int(rng, 40, 600) })),
  };
}
export function infraStatus(slug: string) {
  const rng = makeRng(slug, "infra");
  const ok = (p = 0.85) => rng() < p ? "operativo" : "degradado";
  return {
    uptime: Math.round((99 + rng()) * 100) / 100,
    servidor: ok(0.95),
    baseDatos: ok(0.95),
    storage: `${int(rng, 20, 80)}%`,
    queues: int(rng, 0, 120),
    jobs: ok(0.9),
    serviciosExternos: ok(0.85),
  };
}

// ---------- Seguridad / Audit ----------
export function securityStats(slug: string) {
  const rng = makeRng(slug, "sec");
  return {
    logins: int(rng, 200, 2000),
    fallidos: int(rng, 5, 120),
    bloqueados: int(rng, 0, 8),
    sesionesActivas: int(rng, 10, 180),
    ips: int(rng, 20, 300),
    dispositivos: int(rng, 30, 400),
  };
}
export interface AuditEntry { id: string; usuario: string; accion: string; fecha: string; ip: string; campo: string; antes: string; despues: string; }
export function auditLog(slug: string, n = 30): AuditEntry[] {
  const rng = makeRng(slug, "audit");
  const admins = ["Federico D.", "Gianluca C.", "Soporte"];
  const acciones = ["Cambió plan", "Editó límite", "Aplicó descuento", "Bloqueó usuario", "Reactivó suscripción", "Extendió trial"];
  return Array.from({ length: n }).map((_, i) => {
    const d = new Date(TODAY.getTime() - i * int(rng, 30, 400) * 60000);
    return {
      id: `aud-${i}`,
      usuario: pick(rng, admins),
      accion: pick(rng, acciones),
      fecha: d.toISOString(),
      ip: `192.168.${int(rng, 0, 255)}.${int(rng, 0, 255)}`,
      campo: pick(rng, ["plan", "limite_uso", "descuento", "estado", "trial_fin"]),
      antes: String(int(rng, 1, 500)),
      despues: String(int(rng, 1, 500)),
    };
  });
}

// ---------- Finanzas (para el portal financiero) ----------
export interface CostLine { concepto: string; monto: number; }
export function costs(slug: string): CostLine[] {
  const rng = makeRng(slug, "costs");
  const k = execKpis(slug);
  const base = k.mrr;
  return [
    { concepto: "Infraestructura / servidores", monto: Math.round(base * (0.08 + rng() * 0.04)) },
    { concepto: "IA / modelos", monto: Math.round(base * (0.06 + rng() * 0.05)) },
    { concepto: "APIs externas", monto: Math.round(base * (0.03 + rng() * 0.03)) },
    { concepto: "Storage", monto: Math.round(base * (0.01 + rng() * 0.02)) },
    { concepto: "Mensajería (WhatsApp/SMS)", monto: Math.round(base * (0.02 + rng() * 0.04)) },
    { concepto: "Soporte", monto: Math.round(base * (0.05 + rng() * 0.04)) },
    { concepto: "Desarrollo", monto: Math.round(base * (0.1 + rng() * 0.06)) },
  ];
}
export function unitEconomics(slug: string) {
  const rng = makeRng(slug, "unit");
  const k = execKpis(slug);
  const arpu = Math.round(k.mrr / Math.max(1, k.clientesActivos));
  const cac = int(rng, 80, 400);
  const mesesVida = int(rng, 14, 40);
  const ltv = arpu * mesesVida;
  const totalCost = costs(slug).reduce((s, c) => s + c.monto, 0);
  return {
    cac,
    ltv,
    ltvCac: Math.round((ltv / Math.max(1, cac)) * 10) / 10,
    arpu,
    costoPorCliente: Math.round(totalCost / Math.max(1, k.clientesActivos)),
    costoPorOperacion: Math.round((totalCost / Math.max(1, k.usoMes)) * 100) / 100,
    revenuePorOperacion: Math.round((k.mrr / Math.max(1, k.usoMes)) * 100) / 100,
  };
}

// Rentabilidad por cliente.
export function profitability(slug: string) {
  const rng = makeRng(slug, "profit");
  const ue = unitEconomics(slug);
  return getCompanies(slug)
    .filter((c) => c.mrr > 0)
    .map((c) => {
      const costo = Math.round(c.usoActual * ue.costoPorOperacion * (0.8 + rng() * 0.6));
      const margen = c.mrr - costo;
      return {
        id: c.id, empresa: c.nombre, revenue: c.mrr, uso: c.usoActual,
        costo, margen, margenPct: Math.round((margen / Math.max(1, c.mrr)) * 100),
      };
    })
    .sort((a, b) => b.margen - a.margen);
}

// ---------- Consolidado D&C ----------
export function consolidated() {
  const apps = APP_SLUGS.map((slug) => {
    const k = execKpis(slug);
    return { slug, name: appMeta(slug).name, accent: appMeta(slug).accent, kpis: k };
  });
  return {
    apps,
    totals: {
      clientes: apps.reduce((s, a) => s + a.kpis.clientesActivos, 0),
      mrr: apps.reduce((s, a) => s + a.kpis.mrr, 0),
      arr: apps.reduce((s, a) => s + a.kpis.arr, 0),
      usuarios: apps.reduce((s, a) => s + a.kpis.usuariosActivos, 0),
      churn: Math.round((apps.reduce((s, a) => s + a.kpis.churnClientes, 0) / apps.length) * 10) / 10,
    },
  };
}

// ---------- Helpers de formato ----------
export function money(n: number, moneda = "USD"): string {
  return `${moneda} ${Math.round(n).toLocaleString("es-UY")}`;
}
export const ESTADO_LABEL: Record<EstadoCliente, string> = {
  activo: "Activo", trial: "Trial", suspendido: "Suspendido", moroso: "Moroso",
  cancelado: "Cancelado", pendiente: "Pendiente", riesgo: "Riesgo",
};
export const ESTADO_COLOR: Record<EstadoCliente, string> = {
  activo: "#1F9D55", trial: "#2F7D6B", suspendido: "#9B8259", moroso: "#C98A1A",
  cancelado: "#8A8F8B", pendiente: "#5A6A5E", riesgo: "#b04b3a",
};
