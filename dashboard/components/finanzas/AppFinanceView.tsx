"use client";

/**
 * Finanzas de una aplicación SaaS propia (Tildalo, Encargue, Rondín, Libreta)
 * dentro del portal financiero. Tabs: Revenue, Costos, Rentabilidad,
 * Unit Economics, Facturación, Pagos. Datos DEMO (deterministas) hasta
 * conectar datos reales. Vive acá por pedido del director: la finanza de
 * cada app va en el portal financiero, un menú por aplicación.
 */

import { useState } from "react";
import {
  appMeta, execKpis, series, costs, unitEconomics, profitability,
  getCompanies, money, type SeriesPoint,
} from "@/lib/backoffice-demo";
import {
  BoHead, KpiGrid, Card, DataTable, LineTrend, BarsRow, Pill,
  type Column,
} from "@/components/backoffice/BackofficeUI";

type Tab = "revenue" | "costos" | "rentabilidad" | "unit" | "facturacion" | "pagos";
const TABS: { key: Tab; label: string }[] = [
  { key: "revenue", label: "Revenue" },
  { key: "costos", label: "Costos" },
  { key: "rentabilidad", label: "Rentabilidad" },
  { key: "unit", label: "Unit Economics" },
  { key: "facturacion", label: "Facturación" },
  { key: "pagos", label: "Pagos" },
];

export default function AppFinanceView({ slug }: { slug: string }) {
  const [tab, setTab] = useState<Tab>("revenue");
  const meta = appMeta(slug);
  const k = execKpis(slug);
  const accent = meta.accent;

  return (
    <div>
      <BoHead eyebrow={`${meta.name} · finanzas`} title={`Finanzas — ${meta.name}`} accent={accent} />

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, background: "var(--off-white)", borderRadius: 10, padding: 4, marginBottom: 20, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "8px 16px", fontSize: 13, fontWeight: 700, border: "none", borderRadius: 7, cursor: "pointer", fontFamily: "inherit",
              background: tab === t.key ? "var(--white)" : "transparent",
              color: tab === t.key ? accent : "var(--text-muted)",
              boxShadow: tab === t.key ? "var(--shadow-sm)" : "none",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "revenue" && <RevenueTab slug={slug} />}
      {tab === "costos" && <CostosTab slug={slug} />}
      {tab === "rentabilidad" && <RentabilidadTab slug={slug} />}
      {tab === "unit" && <UnitTab slug={slug} />}
      {tab === "facturacion" && <FacturacionTab slug={slug} />}
      {tab === "pagos" && <PagosTab slug={slug} />}
    </div>
  );
}

function RevenueTab({ slug }: { slug: string }) {
  const meta = appMeta(slug);
  const k = execKpis(slug);
  return (
    <>
      <KpiGrid
        min={160}
        items={[
          { label: "MRR", value: money(k.mrr, k.moneda), deltaPct: k.crecimientoMrrPct, accent: meta.accent },
          { label: "ARR", value: money(k.arr, k.moneda), sub: "MRR × 12" },
          { label: "Nuevo MRR", value: money(k.mrrNuevo, k.moneda), accent: "#1F9D55" },
          { label: "Expansión MRR", value: money(k.mrrExpansion, k.moneda), accent: "#1F9D55" },
          { label: "Churned MRR", value: money(k.mrrPerdido, k.moneda), accent: "#b04b3a" },
          { label: "Net New MRR", value: money(k.mrrNetNew, k.moneda) },
        ]}
      />
      <Card title="Evolución del MRR">
        <LineTrend data={series(slug, "mrr", 12)} color={meta.accent} />
      </Card>
    </>
  );
}

function CostosTab({ slug }: { slug: string }) {
  const meta = appMeta(slug);
  const lines = costs(slug);
  const total = lines.reduce((s, l) => s + l.monto, 0);
  // Serie de costos derivada (demo): proporción del revenue.
  const rev = series(slug, "revenue", 12);
  const costSeries: SeriesPoint[] = rev.map((pt, i) => ({
    mk: pt.mk, label: pt.label, value: Math.round(pt.value * (0.3 + (i % 3) * 0.02)),
  }));
  const cols: Column<{ id: string; concepto: string; monto: number }>[] = [
    { key: "concepto", header: "Concepto" },
    { key: "monto", header: "Monto mensual", align: "right", render: (r) => money(r.monto, meta.moneda) },
    { key: "pct", header: "% del total", align: "right", render: (r) => `${Math.round((r.monto / Math.max(1, total)) * 100)}%` },
  ];
  return (
    <>
      <KpiGrid
        min={180}
        items={[
          { label: "Costo mensual total", value: money(total, meta.moneda), accent: "#b04b3a" },
          { label: "Costo anual", value: money(total * 12, meta.moneda) },
          { label: "Conceptos", value: String(lines.length) },
        ]}
      />
      <Card title="Desglose de costos" hint="Infraestructura, IA, APIs, storage, mensajería, soporte, desarrollo.">
        <DataTable columns={cols} rows={lines.map((l, i) => ({ id: String(i), ...l }))} />
      </Card>
      <Card title="Evolución de costos">
        <LineTrend data={costSeries} color="#b04b3a" />
      </Card>
    </>
  );
}

function RentabilidadTab({ slug }: { slug: string }) {
  const meta = appMeta(slug);
  const k = execKpis(slug);
  const totalCost = costs(slug).reduce((s, l) => s + l.monto, 0);
  const margen = k.mrr - totalCost;
  const margenPct = k.mrr > 0 ? Math.round((margen / k.mrr) * 100) : 0;
  const rows = profitability(slug);
  const cols: Column<{ id: string; empresa: string; revenue: number; uso: number; costo: number; margen: number; margenPct: number }>[] = [
    { key: "empresa", header: "Cliente" },
    { key: "revenue", header: "Revenue", align: "right", render: (r) => money(r.revenue, meta.moneda) },
    { key: "uso", header: "Uso", align: "right", render: (r) => r.uso.toLocaleString("es-UY") },
    { key: "costo", header: "Costo estimado", align: "right", render: (r) => money(r.costo, meta.moneda) },
    { key: "margen", header: "Margen", align: "right", render: (r) => money(r.margen, meta.moneda) },
    { key: "margenPct", header: "Margen %", align: "right", render: (r) => <Pill label={`${r.margenPct}%`} color={r.margenPct >= 60 ? "#1F9D55" : r.margenPct >= 30 ? "#C98A1A" : "#b04b3a"} /> },
  ];
  return (
    <>
      <KpiGrid
        min={180}
        items={[
          { label: "Revenue (MRR)", value: money(k.mrr, k.moneda), accent: meta.accent },
          { label: "Costos", value: money(totalCost, meta.moneda), accent: "#b04b3a" },
          { label: "Margen bruto", value: money(margen, meta.moneda), accent: "#1F9D55" },
          { label: "Margen %", value: `${margenPct}%` },
        ]}
      />
      <Card title="Rentabilidad por cliente" hint="Revenue vs costo estimado por consumo.">
        <DataTable columns={cols} rows={rows} maxHeight={440} />
      </Card>
    </>
  );
}

function UnitTab({ slug }: { slug: string }) {
  const meta = appMeta(slug);
  const ue = unitEconomics(slug);
  return (
    <>
      <KpiGrid
        min={170}
        items={[
          { label: "CAC", value: money(ue.cac, meta.moneda) },
          { label: "LTV", value: money(ue.ltv, meta.moneda), accent: "#1F9D55" },
          { label: "LTV / CAC", value: `${ue.ltvCac}x`, accent: ue.ltvCac >= 3 ? "#1F9D55" : "#C98A1A" },
          { label: "ARPU", value: money(ue.arpu, meta.moneda) },
          { label: "Costo por cliente", value: money(ue.costoPorCliente, meta.moneda) },
          { label: "Costo por operación", value: money(ue.costoPorOperacion, meta.moneda) },
          { label: "Revenue por operación", value: money(ue.revenuePorOperacion, meta.moneda) },
        ]}
      />
      <Card title="Lectura" hint="Referencia de salud del negocio.">
        <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, margin: 0 }}>
          Un ratio <strong>LTV/CAC ≥ 3x</strong> indica un negocio sano. ARPU de {money(ue.arpu, meta.moneda)} con un
          costo por cliente de {money(ue.costoPorCliente, meta.moneda)} deja margen por suscripción.
          El costo por {meta.unitSingular} es {money(ue.costoPorOperacion, meta.moneda)} contra {money(ue.revenuePorOperacion, meta.moneda)} de ingreso.
        </p>
      </Card>
    </>
  );
}

function FacturacionTab({ slug }: { slug: string }) {
  const meta = appMeta(slug);
  const cs = getCompanies(slug).filter((c) => c.mrr > 0);
  // Facturas demo: una por cliente facturable del mes.
  const facturas = cs.map((c, i) => {
    const estado = c.estado === "moroso" ? "vencida" : i % 7 === 0 ? "pendiente" : "pagada";
    return {
      id: c.id,
      doc: `A-${10000 + i}`,
      cliente: c.nombre,
      fecha: c.fechaAlta.slice(0, 7) + "-05",
      monto: c.mrr,
      estado,
      metodo: i % 3 === 0 ? "Transferencia" : "Tarjeta",
    };
  });
  const emitidas = facturas.length;
  const pagadas = facturas.filter((f) => f.estado === "pagada").length;
  const pendientes = facturas.filter((f) => f.estado === "pendiente").length;
  const vencidas = facturas.filter((f) => f.estado === "vencida").length;
  const totalMes = facturas.reduce((s, f) => s + f.monto, 0);
  const estadoColor: Record<string, string> = { pagada: "#1F9D55", pendiente: "#C98A1A", vencida: "#b04b3a" };
  const cols: Column<(typeof facturas)[number]>[] = [
    { key: "doc", header: "Documento" },
    { key: "cliente", header: "Cliente" },
    { key: "fecha", header: "Fecha" },
    { key: "monto", header: "Monto", align: "right", render: (r) => money(r.monto, meta.moneda) },
    { key: "estado", header: "Estado", render: (r) => <Pill label={r.estado[0].toUpperCase() + r.estado.slice(1)} color={estadoColor[r.estado]} /> },
    { key: "metodo", header: "Método" },
  ];
  return (
    <>
      <KpiGrid
        min={170}
        items={[
          { label: "Facturación del mes", value: money(totalMes, meta.moneda), accent: meta.accent },
          { label: "Emitidas", value: String(emitidas) },
          { label: "Pagadas", value: String(pagadas), accent: "#1F9D55" },
          { label: "Pendientes", value: String(pendientes), accent: "#C98A1A" },
          { label: "Vencidas", value: String(vencidas), accent: "#b04b3a" },
        ]}
      />
      <Card title="Facturas del período">
        <DataTable columns={cols} rows={facturas} maxHeight={440} />
      </Card>
    </>
  );
}

function PagosTab({ slug }: { slug: string }) {
  const meta = appMeta(slug);
  const cs = getCompanies(slug).filter((c) => c.mrr > 0);
  const cobrado = cs.filter((c) => c.estado !== "moroso").reduce((s, c) => s + c.mrr, 0);
  const vencido = cs.filter((c) => c.estado === "moroso").reduce((s, c) => s + c.mrr, 0);
  const pendiente = Math.round(cobrado * 0.08);
  const totalEsperado = cobrado + vencido + pendiente;
  const pctCobranza = totalEsperado > 0 ? Math.round((cobrado / totalEsperado) * 100) : 0;
  const fallidos = cs.filter((c) => c.estado === "moroso").length;
  return (
    <>
      <KpiGrid
        min={170}
        items={[
          { label: "Cobrado", value: money(cobrado, meta.moneda), accent: "#1F9D55" },
          { label: "Pendiente", value: money(pendiente, meta.moneda), accent: "#C98A1A" },
          { label: "Vencido", value: money(vencido, meta.moneda), accent: "#b04b3a" },
          { label: "% de cobranza", value: `${pctCobranza}%` },
          { label: "Pagos fallidos", value: String(fallidos), accent: fallidos > 0 ? "#b04b3a" : undefined },
        ]}
      />
      <Card title="Estado de cobranza">
        <BarsRow items={[
          { label: "cobrado", value: cobrado, color: "#1F9D55" },
          { label: "pendiente", value: pendiente, color: "#C98A1A" },
          { label: "vencido", value: vencido, color: "#b04b3a" },
        ]} />
        {fallidos > 0 && (
          <p style={{ fontSize: 13, color: "#b04b3a", marginTop: 14, marginBottom: 0 }}>
            ⚠ {fallidos} {fallidos === 1 ? "cliente tiene" : "clientes tienen"} un pago fallido/vencido — requieren gestión de cobranza.
          </p>
        )}
      </Card>
    </>
  );
}
