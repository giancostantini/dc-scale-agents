"use client";

/**
 * /producto/[slug]/modulo/[modulo] — MÓDULOS ESPECÍFICOS de cada app del
 * backoffice SaaS (Tildalo, Encargue, Rondín, Libreta).
 *
 * Cada app expone un set propio de módulos (ver appMeta(slug).modules).
 * Esta ruta valida el módulo contra la app y renderiza KPIs + tablas/barras
 * propias de ese módulo. Todo con datos DEMO deterministas (hash + PRNG local)
 * para que SSR y cliente coincidan — se reemplaza por datos reales al conectar.
 */

import { use } from "react";
import { PRODUCT_BY_SLUG } from "@/lib/productos";
import { appMeta, execKpis, usageMetrics, getCompanies, money } from "@/lib/backoffice-demo";
import { BoHead, KpiGrid, Card, DataTable, UsageBar, Pill, LineTrend, BarsRow } from "@/components/backoffice/BackofficeUI";
import type { KpiDef, Column } from "@/components/backoffice/BackofficeUI";

// ---------------- PRNG determinista local (no toca node) ----------------
function rngFor(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function int(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}
function pct(rng: () => number, min: number, max: number): number {
  return Math.round((min + rng() * (max - min)) * 10) / 10;
}
function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}
function dmy(rng: () => number): string {
  return `${String(int(rng, 1, 28)).padStart(2, "0")}/${String(int(rng, 1, 12)).padStart(2, "0")}`;
}
function hhmm(rng: () => number): string {
  return `${String(int(rng, 6, 20)).padStart(2, "0")}:${String(int(rng, 0, 59)).padStart(2, "0")}`;
}

// ---------------- Datos de apoyo ----------------
const PROVEEDORES = ["Coca-Cola FEMSA", "Nestlé", "Unilever", "Conaprole", "Fripur", "Arcor", "Ancap", "PepsiCo", "Molinos", "Bimbo"];
const PRODUCTOS = ["Agua mineral 500ml", "Harina 000 1kg", "Aceite girasol 900ml", "Yerba 1kg", "Arroz 1kg", "Fideos 500g", "Azúcar 1kg", "Leche entera 1L", "Galletas 300g", "Detergente 750ml"];
const ZONAS = ["Centro", "Este", "Oeste", "Norte", "Costa", "Interior"];
const VENDEDORES = ["Martín Pérez", "Lucía González", "Diego Silva", "Sofía Méndez", "Andrés Castro", "Valentina Rossi", "Rodrigo Vega", "Camila López"];
const PLACAS = ["SBA 1234", "SCD 5678", "SEF 9012", "SGH 3456", "SIJ 7890", "SKL 2345", "SMN 6789", "SPQ 0123"];

// ---------------- Mini helpers de UI ----------------
const bigWrap: React.CSSProperties = { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: "26px 16px", textAlign: "center" };
const bigValue: React.CSSProperties = { fontSize: 52, fontWeight: 800, lineHeight: 1, letterSpacing: "-0.03em" };
const bigLabel: React.CSSProperties = { fontSize: 13, color: "var(--text-muted)", fontWeight: 600 };
const bigSub: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)" };

function BigKpi({ label, value, accent, sub }: { label: string; value: string; accent: string; sub?: string }) {
  return (
    <div style={bigWrap}>
      <div style={{ ...bigValue, color: accent }}>{value}</div>
      <div style={bigLabel}>{label}</div>
      {sub && <div style={bigSub}>{sub}</div>}
    </div>
  );
}

const ESTADO_FACT: Record<string, string> = { Procesada: "#1F9D55", Pendiente: "#C98A1A", Revisión: "#2F7D6B", Error: "#b04b3a" };

// ---------------- Contexto que recibe cada renderer ----------------
interface Ctx {
  slug: string;
  accent: string;
  label: string;
  k: ReturnType<typeof execKpis>;
  um: ReturnType<typeof usageMetrics>;
  companies: ReturnType<typeof getCompanies>;
  seed: (salt: string) => () => number;
}

// =================================================================
// TILDE
// =================================================================
function tildeFacturas(c: Ctx) {
  const r = c.seed("facturas");
  const mes = c.k.usoMes;
  const hoy = int(r, Math.round(mes / 40), Math.round(mes / 20));
  const anio = Math.round(mes * (10.5 + r()));
  const promDiario = Math.round(mes / 30);
  const porCliente = Math.round(mes / Math.max(1, c.k.clientesActivos));
  const proc = Math.round(mes * 0.82), pend = Math.round(mes * 0.08), rev = Math.round(mes * 0.07), err = mes - proc - pend - rev;
  const trend = Array.from({ length: 12 }).map((_, i) => ({ mk: `t${i}`, label: `D${i + 1}`, value: int(r, promDiario - 8, promDiario + 12) }));

  type Row = { id: string; factura: string; cliente: string; proveedor: string; tipo: string; fecha: string; estado: string; tiempo: number };
  const rows: Row[] = Array.from({ length: 10 }).map((_, i) => ({
    id: `f${i}`,
    factura: `F-${int(r, 1000, 9999)}`,
    cliente: pick(r, c.companies).nombre,
    proveedor: pick(r, PROVEEDORES),
    tipo: pick(r, ["PDF", "Email", "Escaneo"]),
    fecha: dmy(r),
    estado: pick(r, ["Procesada", "Procesada", "Procesada", "Pendiente", "Revisión", "Error"]),
    tiempo: int(r, 2, 38),
  }));
  const cols: Column<Row>[] = [
    { key: "factura", header: "Factura" },
    { key: "cliente", header: "Cliente" },
    { key: "proveedor", header: "Proveedor" },
    { key: "tipo", header: "Tipo entrada" },
    { key: "fecha", header: "Fecha" },
    { key: "estado", header: "Estado", render: (x) => <Pill label={x.estado} color={ESTADO_FACT[x.estado]} /> },
    { key: "tiempo", header: "Tiempo proc.", align: "right", render: (x) => `${x.tiempo}s` },
  ];
  const kpis: KpiDef[] = [
    { label: "Facturas hoy", value: String(hoy), accent: c.accent },
    { label: "Facturas mes", value: mes.toLocaleString("es-UY") },
    { label: "Facturas año", value: anio.toLocaleString("es-UY") },
    { label: "Promedio diario", value: String(promDiario) },
    { label: "Facturas por cliente", value: String(porCliente) },
  ];
  return (
    <>
      <KpiGrid items={kpis} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18 }}>
        <Card title="Estados de procesamiento">
          <BarsRow items={[
            { label: "Procesada", value: proc, color: ESTADO_FACT.Procesada },
            { label: "Pendiente", value: pend, color: ESTADO_FACT.Pendiente },
            { label: "Revisión", value: rev, color: ESTADO_FACT.Revisión },
            { label: "Error", value: Math.max(0, err), color: ESTADO_FACT.Error },
          ]} />
        </Card>
        <Card title="Volumen diario (últimos 12 días)">
          <LineTrend data={trend} color={c.accent} height={160} />
        </Card>
      </div>
      <Card title="Facturas recientes" hint="Entrada automática desde PDF, email y escaneo.">
        <DataTable columns={cols} rows={rows} />
      </Card>
    </>
  );
}

function tildeProcesamiento(c: Ctx) {
  const r = c.seed("procesamiento");
  const mes = c.k.usoMes;
  const sinInterv = pct(r, 88, 97);
  const okCount = Math.round(mes * (sinInterv / 100));
  const revManual = Math.round(mes * 0.07);
  const errores = Math.max(0, mes - okCount - revManual);
  const kpis: KpiDef[] = [
    { label: "Procesadas OK", value: okCount.toLocaleString("es-UY"), accent: c.accent },
    { label: "Revisión manual", value: String(revManual) },
    { label: "Errores", value: String(errores) },
    { label: "Tiempo promedio", value: `${int(r, 8, 20)}s` },
    { label: "Tiempo máx.", value: `${int(r, 40, 120)}s` },
    { label: "Tiempo mín.", value: `${int(r, 1, 4)}s` },
  ];
  return (
    <>
      <KpiGrid items={kpis} />
      <Card title="Automatización del procesamiento" hint="Facturas que no requirieron intervención humana.">
        <BigKpi label="% facturas procesadas sin intervención" value={`${sinInterv}%`} accent={c.accent} sub={`${okCount.toLocaleString("es-UY")} de ${mes.toLocaleString("es-UY")} facturas del mes`} />
        <BarsRow items={[
          { label: "Automáticas", value: okCount, color: "#1F9D55" },
          { label: "Revisión manual", value: revManual, color: "#C98A1A" },
          { label: "Errores", value: errores, color: "#b04b3a" },
        ]} />
      </Card>
    </>
  );
}

function tildePrecision(c: Ctx) {
  const r = c.seed("precision");
  const kpis: KpiDef[] = [
    { label: "Precisión lectura", value: `${pct(r, 95, 99.5)}%`, accent: c.accent },
    { label: "Precisión por campo", value: `${pct(r, 93, 99)}%` },
    { label: "Precisión renglones", value: `${pct(r, 88, 97)}%` },
    { label: "Asociación automática", value: `${pct(r, 80, 95)}%` },
    { label: "Errores", value: String(int(r, 4, 40)) },
  ];
  type Row = { id: string; proveedor: string; campo: string; doc: string; precision: number; muestras: number };
  const CAMPOS = ["RUT", "Total", "Fecha", "Nº comprobante", "IVA", "Renglones"];
  const DOCS = ["e-Factura", "e-Ticket", "Nota de crédito", "Remito"];
  const rows: Row[] = Array.from({ length: 9 }).map((_, i) => ({
    id: `p${i}`,
    proveedor: pick(r, PROVEEDORES),
    campo: pick(r, CAMPOS),
    doc: pick(r, DOCS),
    precision: pct(r, 86, 99.8),
    muestras: int(r, 20, 600),
  }));
  const cols: Column<Row>[] = [
    { key: "proveedor", header: "Proveedor" },
    { key: "campo", header: "Campo" },
    { key: "doc", header: "Tipo documento" },
    { key: "muestras", header: "Muestras", align: "right" },
    { key: "precision", header: "Precisión", align: "right", render: (x) => <strong style={{ color: x.precision >= 95 ? "#1F9D55" : x.precision >= 90 ? "#C98A1A" : "#b04b3a" }}>{x.precision}%</strong> },
  ];
  return (
    <>
      <KpiGrid items={kpis} />
      <Card title="Precisión por proveedor, campo y tipo de documento">
        <DataTable columns={cols} rows={rows} />
      </Card>
    </>
  );
}

function tildeCatalogo(c: Ctx) {
  const r = c.seed("catalogo");
  const asociados = int(r, 800, 4000);
  const nuevas = int(r, 20, 160);
  const auto = Math.round(nuevas * (0.6 + r() * 0.3));
  const manual = nuevas - auto;
  const sin = int(r, 10, 120);
  const kpis: KpiDef[] = [
    { label: "Productos asociados", value: asociados.toLocaleString("es-UY"), accent: c.accent },
    { label: "Asociaciones nuevas", value: String(nuevas) },
    { label: "Automáticas", value: String(auto) },
    { label: "Manuales", value: String(manual) },
    { label: "Sin asociación", value: String(sin) },
  ];
  type Row = { id: string; prov: string; cli: string; confianza: number; estado: string; fecha: string };
  const rows: Row[] = Array.from({ length: 9 }).map((_, i) => {
    const conf = int(r, 55, 99);
    return {
      id: `c${i}`,
      prov: pick(r, PRODUCTOS),
      cli: pick(r, PRODUCTOS),
      confianza: conf,
      estado: conf >= 85 ? "Asociado" : conf >= 65 ? "Sugerido" : "Pendiente",
      fecha: dmy(r),
    };
  });
  const cols: Column<Row>[] = [
    { key: "prov", header: "Producto proveedor" },
    { key: "cli", header: "Producto cliente" },
    { key: "confianza", header: "Confianza", width: 160, render: (x) => <UsageBar value={x.confianza} max={100} color={c.accent} /> },
    { key: "estado", header: "Estado", render: (x) => <Pill label={x.estado} color={x.estado === "Asociado" ? "#1F9D55" : x.estado === "Sugerido" ? "#C98A1A" : "#5A6A5E"} /> },
    { key: "fecha", header: "Fecha" },
  ];
  return (
    <>
      <KpiGrid items={kpis} />
      <Card title="Asociaciones producto proveedor → producto cliente">
        <DataTable columns={cols} rows={rows} />
      </Card>
    </>
  );
}

function tildeCostos(c: Ctx) {
  const r = c.seed("costos");
  const detectados = int(r, 20, 140);
  const montoTotal = int(r, 2000, 40000);
  const aumentoProm = pct(r, 3, 18);
  const aprobados = Math.round(detectados * (0.4 + r() * 0.3));
  const reclamados = Math.round(detectados * (0.1 + r() * 0.2));
  const pendientes = Math.max(0, detectados - aprobados - reclamados);
  const kpis: KpiDef[] = [
    { label: "Aumentos detectados", value: String(detectados), accent: c.accent },
    { label: "Monto total", value: money(montoTotal, c.k.moneda) },
    { label: "Aumento promedio", value: `${aumentoProm}%` },
    { label: "Aprobados", value: String(aprobados) },
    { label: "Reclamados", value: String(reclamados) },
    { label: "Pendientes", value: String(pendientes) },
  ];
  type Row = { id: string; proveedor: string; aumentos: number; aumentoProm: number; impacto: number; estado: string };
  const rows: Row[] = PROVEEDORES.slice(0, 8).map((p, i) => {
    const ap = pct(r, 2, 22);
    return {
      id: `a${i}`,
      proveedor: p,
      aumentos: int(r, 1, 25),
      aumentoProm: ap,
      impacto: int(r, 100, 8000),
      estado: pick(r, ["Aprobado", "Reclamado", "Pendiente"]),
    };
  }).sort((a, b) => b.impacto - a.impacto);
  const cols: Column<Row>[] = [
    { key: "proveedor", header: "Proveedor" },
    { key: "aumentos", header: "Aumentos", align: "right" },
    { key: "aumentoProm", header: "Aumento prom.", align: "right", render: (x) => <strong style={{ color: "#b04b3a" }}>+{x.aumentoProm}%</strong> },
    { key: "impacto", header: "Impacto", align: "right", render: (x) => money(x.impacto, c.k.moneda) },
    { key: "estado", header: "Estado", render: (x) => <Pill label={x.estado} color={x.estado === "Aprobado" ? "#1F9D55" : x.estado === "Reclamado" ? "#C98A1A" : "#5A6A5E"} /> },
  ];
  return (
    <>
      <KpiGrid items={kpis} />
      <Card title="Principales proveedores con aumentos de costo">
        <DataTable columns={cols} rows={rows} />
      </Card>
    </>
  );
}

function tildeCfe(c: Ctx) {
  const r = c.seed("cfe");
  const controles = ["RUT emisor", "IVA discriminado", "Totales", "e-Ticket", "Notas de crédito", "Plazos de recepción", "QR / XML"];
  const kpis: KpiDef[] = controles.map((ctrl) => {
    const total = int(r, 80, 900);
    const ok = Math.round(total * (0.9 + r() * 0.1));
    return { label: ctrl, value: `${ok}/${total}`, sub: "conformes", accent: ok === total ? "#1F9D55" : undefined };
  });
  type Row = { id: string; tipo: string; detalle: string; cantidad: number; severidad: string };
  const TIPOS = ["RUT inválido", "IVA no discrimina", "Total no coincide", "QR ilegible", "XML faltante", "Fuera de plazo"];
  const rows: Row[] = Array.from({ length: 7 }).map((_, i) => ({
    id: `i${i}`,
    tipo: pick(r, TIPOS),
    detalle: pick(r, PROVEEDORES),
    cantidad: int(r, 1, 30),
    severidad: pick(r, ["Alta", "Media", "Baja"]),
  }));
  const cols: Column<Row>[] = [
    { key: "tipo", header: "Tipo de incidencia" },
    { key: "detalle", header: "Proveedor" },
    { key: "cantidad", header: "Casos", align: "right" },
    { key: "severidad", header: "Severidad", render: (x) => <Pill label={x.severidad} color={x.severidad === "Alta" ? "#b04b3a" : x.severidad === "Media" ? "#C98A1A" : "#5A6A5E"} /> },
  ];
  return (
    <>
      <KpiGrid items={kpis} min={150} />
      <Card title="Incidencias de comprobantes fiscales (CFE)" hint="Controles de validez: RUT, IVA, totales, QR/XML y plazos.">
        <DataTable columns={cols} rows={rows} />
      </Card>
    </>
  );
}

// =================================================================
// RONDIN
// =================================================================
function rondinRutas(c: Ctx) {
  const r = c.seed("rutas");
  const creadas = int(r, 60, 400);
  const completadas = Math.round(creadas * (0.8 + r() * 0.12));
  const activas = int(r, 3, 30);
  const canceladas = Math.max(0, creadas - completadas - activas);
  const km = int(r, 4000, 40000);
  const kpis: KpiDef[] = [
    { label: "Rutas creadas", value: String(creadas), accent: c.accent },
    { label: "Completadas", value: String(completadas) },
    { label: "Activas", value: String(activas) },
    { label: "Canceladas", value: String(canceladas) },
    { label: "Kilómetros", value: km.toLocaleString("es-UY") },
  ];
  type Row = { id: string; ruta: string; cliente: string; vehiculo: string; conductor: string; paradas: number; km: number; estado: string; salida: string; llegada: string };
  const rows: Row[] = Array.from({ length: 10 }).map((_, i) => ({
    id: `r${i}`,
    ruta: `R-${int(r, 100, 999)}`,
    cliente: pick(r, c.companies).nombre,
    vehiculo: pick(r, PLACAS),
    conductor: pick(r, VENDEDORES),
    paradas: int(r, 4, 32),
    km: int(r, 20, 240),
    estado: pick(r, ["Completada", "Completada", "Activa", "Cancelada"]),
    salida: hhmm(r),
    llegada: hhmm(r),
  }));
  const cols: Column<Row>[] = [
    { key: "ruta", header: "Ruta" },
    { key: "cliente", header: "Cliente" },
    { key: "vehiculo", header: "Vehículo" },
    { key: "conductor", header: "Conductor" },
    { key: "paradas", header: "Paradas", align: "right" },
    { key: "km", header: "KM", align: "right" },
    { key: "estado", header: "Estado", render: (x) => <Pill label={x.estado} color={x.estado === "Completada" ? "#1F9D55" : x.estado === "Activa" ? "#2F7D6B" : "#8A8F8B"} /> },
    { key: "salida", header: "Salida" },
    { key: "llegada", header: "Llegada" },
  ];
  return (
    <>
      <KpiGrid items={kpis} />
      <Card title="Rutas del período">
        <DataTable columns={cols} rows={rows} maxHeight={420} />
      </Card>
    </>
  );
}

function rondinEntregas(c: Ctx) {
  const r = c.seed("entregas");
  const prog = c.k.usoMes;
  const compl = Math.round(prog * (0.85 + r() * 0.1));
  const fallidas = int(r, 5, 60);
  const reprog = Math.max(0, prog - compl - fallidas);
  const aTiempoPct = pct(r, 82, 96);
  const aTiempo = Math.round(compl * (aTiempoPct / 100));
  const demoradas = compl - aTiempo;
  const kpis: KpiDef[] = [
    { label: "Programadas", value: prog.toLocaleString("es-UY"), accent: c.accent },
    { label: "Completadas", value: compl.toLocaleString("es-UY") },
    { label: "Fallidas", value: String(fallidas) },
    { label: "Reprogramadas", value: String(reprog) },
    { label: "A tiempo", value: aTiempo.toLocaleString("es-UY") },
    { label: "Demoradas", value: String(demoradas) },
  ];
  return (
    <>
      <KpiGrid items={kpis} />
      <Card title="Puntualidad de entregas">
        <BigKpi label="% entregas a tiempo" value={`${aTiempoPct}%`} accent={c.accent} sub={`${aTiempo.toLocaleString("es-UY")} de ${compl.toLocaleString("es-UY")} entregas completadas`} />
        <BarsRow items={[
          { label: "A tiempo", value: aTiempo, color: "#1F9D55" },
          { label: "Demoradas", value: demoradas, color: "#C98A1A" },
          { label: "Fallidas", value: fallidas, color: "#b04b3a" },
        ]} />
      </Card>
    </>
  );
}

function rondinVehiculos(c: Ctx) {
  const r = c.seed("vehiculos");
  const activos = int(r, 8, 50);
  const enRuta = Math.round(activos * (0.3 + r() * 0.4));
  const fuera = int(r, 0, 4);
  const disponibles = Math.max(0, activos - enRuta - fuera);
  const kpis: KpiDef[] = [
    { label: "Activos", value: String(activos), accent: c.accent },
    { label: "En ruta", value: String(enRuta) },
    { label: "Disponibles", value: String(disponibles) },
    { label: "Fuera de servicio", value: String(fuera) },
  ];
  type Row = { id: string; vehiculo: string; empresa: string; conductor: string; km: number; ultima: string; estado: string };
  const rows: Row[] = PLACAS.map((p, i) => ({
    id: `v${i}`,
    vehiculo: p,
    empresa: pick(r, c.companies).nombre,
    conductor: pick(r, VENDEDORES),
    km: int(r, 2000, 120000),
    ultima: dmy(r),
    estado: pick(r, ["En ruta", "Disponible", "Disponible", "Fuera de servicio"]),
  }));
  const cols: Column<Row>[] = [
    { key: "vehiculo", header: "Vehículo" },
    { key: "empresa", header: "Empresa" },
    { key: "conductor", header: "Conductor" },
    { key: "km", header: "KM", align: "right", render: (x) => x.km.toLocaleString("es-UY") },
    { key: "ultima", header: "Última ruta" },
    { key: "estado", header: "Estado", render: (x) => <Pill label={x.estado} color={x.estado === "En ruta" ? "#2F7D6B" : x.estado === "Disponible" ? "#1F9D55" : "#b04b3a"} /> },
  ];
  return (
    <>
      <KpiGrid items={kpis} />
      <Card title="Flota">
        <DataTable columns={cols} rows={rows} />
      </Card>
    </>
  );
}

function rondinConductores(c: Ctx) {
  const r = c.seed("conductores");
  const activos = int(r, 6, 40);
  const kpis: KpiDef[] = [
    { label: "Activos", value: String(activos), accent: c.accent },
    { label: "Rutas", value: String(int(r, 60, 400)) },
    { label: "Entregas", value: int(r, 400, 4000).toLocaleString("es-UY") },
    { label: "Eficiencia", value: `${pct(r, 80, 97)}%` },
    { label: "Puntualidad", value: `${pct(r, 82, 98)}%` },
  ];
  type Row = { id: string; conductor: string; rutas: number; entregas: number; eficiencia: number; puntualidad: number };
  const rows: Row[] = VENDEDORES.map((v, i) => ({
    id: `c${i}`,
    conductor: v,
    rutas: int(r, 5, 60),
    entregas: int(r, 40, 500),
    eficiencia: pct(r, 75, 98),
    puntualidad: pct(r, 78, 99),
  })).sort((a, b) => b.entregas - a.entregas);
  const cols: Column<Row>[] = [
    { key: "conductor", header: "Conductor" },
    { key: "rutas", header: "Rutas", align: "right" },
    { key: "entregas", header: "Entregas", align: "right" },
    { key: "eficiencia", header: "Eficiencia", align: "right", render: (x) => `${x.eficiencia}%` },
    { key: "puntualidad", header: "Puntualidad", align: "right", render: (x) => `${x.puntualidad}%` },
  ];
  return (
    <>
      <KpiGrid items={kpis} />
      <Card title="Rendimiento de conductores">
        <DataTable columns={cols} rows={rows} />
      </Card>
    </>
  );
}

function rondinOptimizacion(c: Ctx) {
  const r = c.seed("optimizacion");
  const planificados = int(r, 8000, 50000);
  const mejora = pct(r, 8, 24);
  const reales = Math.round(planificados * (1 - mejora / 100));
  const ahorrados = planificados - reales;
  const kpis: KpiDef[] = [
    { label: "KM planificados", value: planificados.toLocaleString("es-UY"), accent: c.accent },
    { label: "KM reales", value: reales.toLocaleString("es-UY") },
    { label: "KM ahorrados", value: ahorrados.toLocaleString("es-UY") },
    { label: "Tiempo ahorrado", value: `${int(r, 20, 180)} h` },
    { label: "Combustible ahorrado", value: `${int(r, 400, 6000)} L` },
  ];
  return (
    <>
      <KpiGrid items={kpis} />
      <Card title="Impacto de la optimización de rutas">
        <BigKpi label="% mejora de rutas" value={`${mejora}%`} accent={c.accent} sub={`${ahorrados.toLocaleString("es-UY")} KM ahorrados vs. plan`} />
        <BarsRow items={[
          { label: "KM reales", value: reales, color: c.accent },
          { label: "KM ahorrados", value: ahorrados, color: "#1F9D55" },
        ]} />
      </Card>
    </>
  );
}

function rondinNotificaciones(c: Ctx) {
  const r = c.seed("notificaciones");
  const wa = int(r, 2000, 20000), sms = int(r, 200, 4000), email = int(r, 500, 8000);
  const enviadas = wa + sms + email;
  const entregadas = Math.round(enviadas * (0.92 + r() * 0.06));
  const fallidas = enviadas - entregadas;
  const kpis: KpiDef[] = [
    { label: "Enviadas", value: enviadas.toLocaleString("es-UY"), accent: c.accent },
    { label: "WhatsApp", value: wa.toLocaleString("es-UY") },
    { label: "SMS", value: sms.toLocaleString("es-UY") },
    { label: "Email", value: email.toLocaleString("es-UY") },
    { label: "Entregadas", value: entregadas.toLocaleString("es-UY") },
    { label: "Fallidas", value: fallidas.toLocaleString("es-UY") },
  ];
  return (
    <>
      <KpiGrid items={kpis} />
      <Card title="Notificaciones por canal">
        <BarsRow items={[
          { label: "WhatsApp", value: wa, color: "#1F9D55" },
          { label: "Email", value: email, color: "#2F7D6B" },
          { label: "SMS", value: sms, color: "#C98A1A" },
        ]} />
      </Card>
    </>
  );
}

// =================================================================
// ENCARGUE
// =================================================================
function encargueConversaciones(c: Ctx) {
  const r = c.seed("conversaciones");
  const recibidas = int(r, 800, 8000);
  const autoPct = pct(r, 70, 92);
  const resueltas = Math.round(recibidas * (autoPct / 100));
  const activas = int(r, 10, 120);
  const derivadas = Math.max(0, recibidas - resueltas - activas);
  const kpis: KpiDef[] = [
    { label: "Recibidas", value: recibidas.toLocaleString("es-UY"), accent: c.accent },
    { label: "Activas", value: String(activas) },
    { label: "Resueltas automáticamente", value: resueltas.toLocaleString("es-UY") },
    { label: "Derivadas a humano", value: derivadas.toLocaleString("es-UY") },
  ];
  return (
    <>
      <KpiGrid items={kpis} />
      <Card title="Automatización de conversaciones">
        <BigKpi label="% conversaciones automáticas" value={`${autoPct}%`} accent={c.accent} sub={`${resueltas.toLocaleString("es-UY")} resueltas sin intervención humana`} />
        <BarsRow items={[
          { label: "Automáticas", value: resueltas, color: "#1F9D55" },
          { label: "Derivadas", value: derivadas, color: "#C98A1A" },
          { label: "Activas", value: activas, color: "#2F7D6B" },
        ]} />
      </Card>
    </>
  );
}

function encarguePedidos(c: Ctx) {
  const r = c.seed("pedidos");
  const recibidos = c.k.usoMes;
  const procesados = Math.round(recibidos * (0.9 + r() * 0.08));
  const confirmados = Math.round(procesados * (0.85 + r() * 0.1));
  const rechazados = Math.max(0, procesados - confirmados);
  const monto = int(r, 20000, 400000);
  const kpis: KpiDef[] = [
    { label: "Recibidos", value: recibidos.toLocaleString("es-UY"), accent: c.accent },
    { label: "Procesados", value: procesados.toLocaleString("es-UY") },
    { label: "Confirmados", value: confirmados.toLocaleString("es-UY") },
    { label: "Rechazados", value: String(rechazados) },
    { label: "Monto vendido", value: money(monto, c.k.moneda) },
  ];
  type Row = { id: string; pedido: string; cliente: string; empresa: string; monto: number; productos: number; estado: string; fecha: string };
  const rows: Row[] = Array.from({ length: 10 }).map((_, i) => {
    const comp = pick(r, c.companies);
    return {
      id: `p${i}`,
      pedido: `P-${int(r, 10000, 99999)}`,
      cliente: comp.contacto,
      empresa: comp.nombre,
      monto: int(r, 500, 25000),
      productos: int(r, 1, 30),
      estado: pick(r, ["Confirmado", "Confirmado", "Procesado", "Rechazado"]),
      fecha: dmy(r),
    };
  });
  const cols: Column<Row>[] = [
    { key: "pedido", header: "Pedido" },
    { key: "cliente", header: "Cliente" },
    { key: "empresa", header: "Empresa" },
    { key: "monto", header: "Monto", align: "right", render: (x) => money(x.monto, c.k.moneda) },
    { key: "productos", header: "Productos", align: "right" },
    { key: "estado", header: "Estado", render: (x) => <Pill label={x.estado} color={x.estado === "Confirmado" ? "#1F9D55" : x.estado === "Procesado" ? "#2F7D6B" : "#b04b3a"} /> },
    { key: "fecha", header: "Fecha" },
  ];
  return (
    <>
      <KpiGrid items={kpis} />
      <Card title="Pedidos recientes">
        <DataTable columns={cols} rows={rows} />
      </Card>
    </>
  );
}

function encargueProductos(c: Ctx) {
  const r = c.seed("productos");
  const solicitados = int(r, 2000, 20000);
  const identificados = Math.round(solicitados * (0.85 + r() * 0.12));
  const noIdent = solicitados - identificados;
  const sinStock = int(r, 50, 800);
  const alternativas = int(r, 40, 700);
  const kpis: KpiDef[] = [
    { label: "Solicitados", value: solicitados.toLocaleString("es-UY"), accent: c.accent },
    { label: "Identificados", value: identificados.toLocaleString("es-UY") },
    { label: "No identificados", value: noIdent.toLocaleString("es-UY") },
    { label: "Sin stock", value: sinStock.toLocaleString("es-UY") },
    { label: "Alternativas ofrecidas", value: alternativas.toLocaleString("es-UY") },
  ];
  return (
    <>
      <KpiGrid items={kpis} />
      <Card title="Identificación de productos solicitados">
        <BarsRow items={[
          { label: "Identificados", value: identificados, color: "#1F9D55" },
          { label: "No identificados", value: noIdent, color: "#C98A1A" },
          { label: "Sin stock", value: sinStock, color: "#b04b3a" },
        ]} />
      </Card>
    </>
  );
}

function encargueIa(c: Ctx) {
  const r = c.seed("ia");
  const mensajes = int(r, 5000, 40000);
  const intenciones = Math.round(mensajes * (0.9 + r() * 0.08));
  const precision = pct(r, 88, 98);
  const intervenciones = int(r, 50, 900);
  const errores = int(r, 20, 400);
  const sinInterv = pct(r, 78, 94);
  const kpis: KpiDef[] = [
    { label: "Mensajes procesados", value: mensajes.toLocaleString("es-UY"), accent: c.accent },
    { label: "Intenciones detectadas", value: intenciones.toLocaleString("es-UY") },
    { label: "Precisión", value: `${precision}%` },
    { label: "Intervenciones humanas", value: intervenciones.toLocaleString("es-UY") },
    { label: "Errores interpretación", value: errores.toLocaleString("es-UY") },
  ];
  return (
    <>
      <KpiGrid items={kpis} />
      <Card title="Autonomía del agente de IA">
        <BigKpi label="% pedidos generados sin intervención" value={`${sinInterv}%`} accent={c.accent} sub={`Precisión de interpretación ${precision}%`} />
      </Card>
    </>
  );
}

function encargueWhatsapp(c: Ctx) {
  const r = c.seed("whatsapp");
  const entrantes = int(r, 4000, 40000);
  const salientes = int(r, 4000, 42000);
  const fallidos = int(r, 50, 900);
  const conversaciones = int(r, 500, 6000);
  const kpis: KpiDef[] = [
    { label: "Mensajes entrantes", value: entrantes.toLocaleString("es-UY"), accent: c.accent },
    { label: "Mensajes salientes", value: salientes.toLocaleString("es-UY") },
    { label: "Fallidos", value: fallidos.toLocaleString("es-UY") },
    { label: "Tiempo de respuesta", value: `${int(r, 2, 40)}s` },
    { label: "Conversaciones", value: conversaciones.toLocaleString("es-UY") },
  ];
  return (
    <>
      <KpiGrid items={kpis} />
      <Card title="Flujo de mensajes WhatsApp">
        <BarsRow items={[
          { label: "Entrantes", value: entrantes, color: "#1F9D55" },
          { label: "Salientes", value: salientes, color: "#2F7D6B" },
          { label: "Fallidos", value: fallidos, color: "#b04b3a" },
        ]} />
      </Card>
    </>
  );
}

// =================================================================
// LIBRETA
// =================================================================
function libretaVendedores(c: Ctx) {
  const r = c.seed("vendedores");
  const activos = int(r, 6, 40);
  const conectados = Math.round(activos * (0.5 + r() * 0.4));
  const visitas = c.k.usoMes;
  const pedidos = Math.round(visitas * (0.4 + r() * 0.3));
  const venta = int(r, 20000, 300000);
  const kpis: KpiDef[] = [
    { label: "Activos", value: String(activos), accent: c.accent },
    { label: "Conectados", value: String(conectados) },
    { label: "Visitas", value: visitas.toLocaleString("es-UY") },
    { label: "Pedidos", value: pedidos.toLocaleString("es-UY") },
    { label: "Venta total", value: money(venta, c.k.moneda) },
  ];
  type Row = { id: string; vendedor: string; empresa: string; clientes: number; pedidos: number; facturacion: number; ultima: string };
  const rows: Row[] = VENDEDORES.map((v, i) => ({
    id: `v${i}`,
    vendedor: v,
    empresa: pick(r, c.companies).nombre,
    clientes: int(r, 5, 60),
    pedidos: int(r, 3, 50),
    facturacion: int(r, 1000, 40000),
    ultima: `hace ${int(r, 1, 48)}h`,
  })).sort((a, b) => b.facturacion - a.facturacion);
  const cols: Column<Row>[] = [
    { key: "vendedor", header: "Vendedor" },
    { key: "empresa", header: "Empresa" },
    { key: "clientes", header: "Clientes visitados", align: "right" },
    { key: "pedidos", header: "Pedidos", align: "right" },
    { key: "facturacion", header: "Facturación", align: "right", render: (x) => money(x.facturacion, c.k.moneda) },
    { key: "ultima", header: "Última actividad" },
  ];
  return (
    <>
      <KpiGrid items={kpis} />
      <Card title="Rendimiento de vendedores">
        <DataTable columns={cols} rows={rows} />
      </Card>
    </>
  );
}

function libretaVisitas(c: Ctx) {
  const r = c.seed("visitas");
  const planificadas = c.k.usoMes;
  const realizadas = Math.round(planificadas * (0.8 + r() * 0.15));
  const noRealizadas = planificadas - realizadas;
  const efectPct = pct(r, 45, 78);
  const efectivas = Math.round(realizadas * (efectPct / 100));
  const sinPedido = realizadas - efectivas;
  const kpis: KpiDef[] = [
    { label: "Planificadas", value: planificadas.toLocaleString("es-UY"), accent: c.accent },
    { label: "Realizadas", value: realizadas.toLocaleString("es-UY") },
    { label: "No realizadas", value: noRealizadas.toLocaleString("es-UY") },
    { label: "Efectivas", value: efectivas.toLocaleString("es-UY") },
    { label: "Sin pedido", value: sinPedido.toLocaleString("es-UY") },
  ];
  return (
    <>
      <KpiGrid items={kpis} />
      <Card title="Efectividad de visitas">
        <BigKpi label="% efectividad visita → pedido" value={`${efectPct}%`} accent={c.accent} sub={`${efectivas.toLocaleString("es-UY")} visitas generaron pedido`} />
        <BarsRow items={[
          { label: "Con pedido", value: efectivas, color: "#1F9D55" },
          { label: "Sin pedido", value: sinPedido, color: "#C98A1A" },
          { label: "No realizadas", value: noRealizadas, color: "#b04b3a" },
        ]} />
      </Card>
    </>
  );
}

function libretaPedidos(c: Ctx) {
  const r = c.seed("pedidos");
  const cargados = int(r, 500, 6000);
  const monto = int(r, 20000, 300000);
  const ticket = Math.round(monto / Math.max(1, cargados));
  const productos = int(r, 2000, 30000);
  const clientes = int(r, 100, 1500);
  const kpis: KpiDef[] = [
    { label: "Cargados", value: cargados.toLocaleString("es-UY"), accent: c.accent },
    { label: "Monto vendido", value: money(monto, c.k.moneda) },
    { label: "Ticket promedio", value: money(ticket, c.k.moneda) },
    { label: "Productos", value: productos.toLocaleString("es-UY") },
    { label: "Clientes", value: clientes.toLocaleString("es-UY") },
  ];
  type Row = { id: string; producto: string; unidades: number; pedidos: number; monto: number };
  const rows: Row[] = PRODUCTOS.slice(0, 8).map((p, i) => ({
    id: `p${i}`,
    producto: p,
    unidades: int(r, 50, 3000),
    pedidos: int(r, 10, 400),
    monto: int(r, 500, 30000),
  })).sort((a, b) => b.monto - a.monto);
  const cols: Column<Row>[] = [
    { key: "producto", header: "Producto" },
    { key: "unidades", header: "Unidades", align: "right", render: (x) => x.unidades.toLocaleString("es-UY") },
    { key: "pedidos", header: "Pedidos", align: "right" },
    { key: "monto", header: "Monto", align: "right", render: (x) => money(x.monto, c.k.moneda) },
  ];
  return (
    <>
      <KpiGrid items={kpis} />
      <Card title="Productos más pedidos">
        <DataTable columns={cols} rows={rows} />
      </Card>
    </>
  );
}

function libretaClientes(c: Ctx) {
  const r = c.seed("clientes");
  const activos = int(r, 200, 2000);
  const visitados = Math.round(activos * (0.5 + r() * 0.4));
  const noVisitados = activos - visitados;
  const sinCompra = int(r, 30, 400);
  const recuperados = int(r, 10, 120);
  const nuevos = int(r, 20, 200);
  const kpis: KpiDef[] = [
    { label: "Activos", value: activos.toLocaleString("es-UY"), accent: c.accent },
    { label: "Visitados", value: visitados.toLocaleString("es-UY") },
    { label: "No visitados", value: noVisitados.toLocaleString("es-UY") },
    { label: "Sin compra", value: sinCompra.toLocaleString("es-UY") },
    { label: "Recuperados", value: recuperados.toLocaleString("es-UY") },
    { label: "Nuevos", value: nuevos.toLocaleString("es-UY") },
  ];
  return (
    <>
      <KpiGrid items={kpis} />
      <Card title="Cobertura de cartera">
        <BarsRow items={[
          { label: "Visitados", value: visitados, color: "#1F9D55" },
          { label: "No visitados", value: noVisitados, color: "#C98A1A" },
          { label: "Sin compra", value: sinCompra, color: "#b04b3a" },
        ]} />
      </Card>
    </>
  );
}

function libretaActividad(c: Ctx) {
  const r = c.seed("actividad");
  const kpis: KpiDef[] = [
    { label: "Primer acceso", value: hhmm(r), accent: c.accent },
    { label: "Último acceso", value: hhmm(r) },
    { label: "Tiempo trabajado", value: `${int(r, 4, 10)}h ${int(r, 0, 59)}m` },
    { label: "Visitas", value: int(r, 50, 600).toLocaleString("es-UY") },
    { label: "Pedidos", value: int(r, 20, 300).toLocaleString("es-UY") },
    { label: "Clientes", value: int(r, 30, 400).toLocaleString("es-UY") },
  ];
  type Row = { id: string; vendedor: string; primer: string; ultimo: string; trabajado: string; visitas: number; pedidos: number; clientes: number };
  const rows: Row[] = VENDEDORES.map((v, i) => ({
    id: `a${i}`,
    vendedor: v,
    primer: hhmm(r),
    ultimo: hhmm(r),
    trabajado: `${int(r, 4, 10)}h ${int(r, 0, 59)}m`,
    visitas: int(r, 5, 50),
    pedidos: int(r, 2, 35),
    clientes: int(r, 5, 45),
  }));
  const cols: Column<Row>[] = [
    { key: "vendedor", header: "Vendedor" },
    { key: "primer", header: "Primer acceso" },
    { key: "ultimo", header: "Último acceso" },
    { key: "trabajado", header: "Tiempo trabajado" },
    { key: "visitas", header: "Visitas", align: "right" },
    { key: "pedidos", header: "Pedidos", align: "right" },
    { key: "clientes", header: "Clientes", align: "right" },
  ];
  return (
    <>
      <KpiGrid items={kpis} min={150} />
      <Card title="Actividad por vendedor" hint="Jornada, visitas, pedidos y clientes del día.">
        <DataTable columns={cols} rows={rows} />
      </Card>
    </>
  );
}

function libretaGeografia(c: Ctx) {
  const r = c.seed("geografia");
  type Row = { id: string; zona: string; vendedores: number; clientes: number; visitas: number; pedidos: number; venta: number };
  const rows: Row[] = ZONAS.map((z, i) => ({
    id: `z${i}`,
    zona: z,
    vendedores: int(r, 1, 8),
    clientes: int(r, 30, 400),
    visitas: int(r, 40, 500),
    pedidos: int(r, 20, 300),
    venta: int(r, 5000, 80000),
  })).sort((a, b) => b.venta - a.venta);
  const cols: Column<Row>[] = [
    { key: "zona", header: "Zona" },
    { key: "vendedores", header: "Vendedores", align: "right" },
    { key: "clientes", header: "Clientes", align: "right" },
    { key: "visitas", header: "Visitas", align: "right" },
    { key: "pedidos", header: "Pedidos", align: "right" },
    { key: "venta", header: "Venta", align: "right", render: (x) => money(x.venta, c.k.moneda) },
  ];
  const kpis: KpiDef[] = [
    { label: "Zonas activas", value: String(ZONAS.length), accent: c.accent },
    { label: "Clientes totales", value: rows.reduce((s, x) => s + x.clientes, 0).toLocaleString("es-UY") },
    { label: "Visitas totales", value: rows.reduce((s, x) => s + x.visitas, 0).toLocaleString("es-UY") },
    { label: "Venta total", value: money(rows.reduce((s, x) => s + x.venta, 0), c.k.moneda) },
  ];
  return (
    <>
      <KpiGrid items={kpis} />
      <Card title="Rendimiento por zona" hint="El mapa interactivo se conecta cuando integremos la geolocalización real.">
        <DataTable columns={cols} rows={rows} />
        <div style={{ marginTop: 16 }}>
          <BarsRow items={rows.map((x, i) => ({ label: x.zona, value: x.venta, color: ["#6D4AFF", "#1F9D55", "#2F7D6B", "#C98A1A", "#b04b3a", "#5A6A5E"][i % 6] }))} />
        </div>
      </Card>
    </>
  );
}

// ---------------- Registro por `${slug}:${modulo}` ----------------
const RENDERERS: Record<string, (c: Ctx) => React.ReactNode> = {
  "tilde:facturas": tildeFacturas,
  "tilde:procesamiento": tildeProcesamiento,
  "tilde:precision": tildePrecision,
  "tilde:catalogo": tildeCatalogo,
  "tilde:costos": tildeCostos,
  "tilde:cfe": tildeCfe,
  "rondin:rutas": rondinRutas,
  "rondin:entregas": rondinEntregas,
  "rondin:vehiculos": rondinVehiculos,
  "rondin:conductores": rondinConductores,
  "rondin:optimizacion": rondinOptimizacion,
  "rondin:notificaciones": rondinNotificaciones,
  "encargue:conversaciones": encargueConversaciones,
  "encargue:pedidos": encarguePedidos,
  "encargue:productos": encargueProductos,
  "encargue:ia": encargueIa,
  "encargue:whatsapp": encargueWhatsapp,
  "libreta:vendedores": libretaVendedores,
  "libreta:visitas": libretaVisitas,
  "libreta:pedidos": libretaPedidos,
  "libreta:clientes": libretaClientes,
  "libreta:actividad": libretaActividad,
  "libreta:geografia": libretaGeografia,
};

// ---------------- Página ----------------
export default function ModuloPage({ params }: { params: Promise<{ slug: string; modulo: string }> }) {
  const { slug, modulo } = use(params);
  const p = PRODUCT_BY_SLUG[slug];
  if (!p) return null;

  const meta = appMeta(slug);
  const mod = meta.modules.find((m) => m.key === modulo);
  if (!mod) return null;

  const ctx: Ctx = {
    slug,
    accent: p.accent,
    label: mod.label,
    k: execKpis(slug),
    um: usageMetrics(slug),
    companies: getCompanies(slug),
    seed: (salt: string) => rngFor(`${slug}:${modulo}:${salt}`),
  };

  const render = RENDERERS[`${slug}:${modulo}`];

  return (
    <>
      <BoHead eyebrow={`${meta.name} · ${mod.label}`} title={mod.label} accent={p.accent} />
      {render
        ? render(ctx)
        : <Card title="Módulo en preparación" hint="Este módulo existe pero todavía no tiene vista de detalle configurada.">
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Pronto vas a ver aquí los KPIs y datos de <strong style={{ color: "var(--deep-green)" }}>{mod.label}</strong>.</div>
          </Card>}
    </>
  );
}
