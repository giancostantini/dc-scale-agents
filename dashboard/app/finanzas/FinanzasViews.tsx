"use client";

/**
 * Views nuevas de /finanzas:
 *   - TeamCostView: costo del equipo agregado por puesto.
 *   - DividendosView: config + cálculo de distribución del net profit.
 *   - EstadosView: estado de resultados + estado de situación.
 *   - ManualRevenuesPanel: gestión de ingresos manuales (fijos +
 *     one-time). Se inserta dentro de IngresosView en page.tsx.
 *
 * Todas requieren rol director (RLS lo enforce server-side, pero
 * acá también filtramos por isDirector cuando aplica).
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { listProfiles } from "@/lib/team";
import type { Profile } from "@/lib/supabase/auth";
import {
  createManualRevenue,
  deleteManualRevenue,
  distributeDividends,
  getDividendConfig,
  listManualRevenues,
  revenueMonthlyImpact,
  updateDividendConfig,
  updateManualRevenue,
  type CreateManualRevenueInput,
  type DividendConfig,
  type ManualRevenue,
  type ManualRevenueKind,
} from "@/lib/finanzas";
import type {
  Client,
  Expense,
  InvoicePayment,
  Lead,
} from "@/lib/types";
import styles from "./finanzas.module.css";

// ============================================================
// DashboardView — Panel principal con KPIs + gráficos
// ============================================================
//
// Layout (tipo dashboard ejecutivo):
//   Row 1: 4 KPI cards con delta vs mes anterior
//     MRR · Egresos del mes · Resultado neto · Pipeline
//   Row 2: 3 cards de gráficos
//     Donut "Distribución MRR" (GP vs Dev)
//     Bar "Ingresos por mes" (últimos 6 meses)
//     Bar "Resultado neto por mes" (últimos 6 meses, verde/rojo)
//   Row 3: 2 cards
//     Donut "Egresos por categoría"
//     Bar horizontal "Top 5 clientes por fee"
// ============================================================

const DASH_COLORS = {
  green:   "#2f7d4f",
  red:     "#b04b3a",
  deepGreen: "#0A1A0C",
  forest:  "#1E3A28",
  forest2: "#2d5036",
  sand:    "#C4A882",
  sandDark:"#9B8259",
  blue:    "#3A8B5C",
  yellow:  "#C9A14A",
  textMuted: "#7A8A7E",
};

const PIE_PALETTE = [
  DASH_COLORS.deepGreen,
  DASH_COLORS.sand,
  DASH_COLORS.sandDark,
  DASH_COLORS.forest2,
  DASH_COLORS.blue,
  DASH_COLORS.yellow,
  DASH_COLORS.red,
];

const EXPENSE_CATEGORY_LABEL: Record<string, string> = {
  equipo: "Equipo",
  tools: "Tools",
  ia: "IA",
  produccion: "Producción",
  otros: "Otros",
};

const MONTHS_SHORT_ES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

export function DashboardView({
  clients,
  expenses,
  payments,
  manualRevs,
  leads,
  mrr,
  totalExpenses,
  netResult,
  marginPct,
  pipelineValue,
}: {
  clients: Client[];
  expenses: Expense[];
  payments: InvoicePayment[];
  manualRevs: ManualRevenue[];
  leads: Lead[];
  mrr: number;
  totalExpenses: number;
  netResult: number;
  marginPct: number;
  pipelineValue: number;
}) {
  // Mes actual + mes anterior (para deltas)
  const now = new Date();
  const curMonth = now.toISOString().slice(0, 7);
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth = prevDate.toISOString().slice(0, 7);

  // Calcular ingresos / egresos / net REALES de un mes.
  //
  // Antes este cálculo usaba el MRR actual (sum de fees de hoy) para
  // TODOS los meses históricos — eso pintaba ingresos falsos en meses
  // donde el cliente todavía no existía o no se había cobrado nada.
  //
  // Ahora se usa el principio de "cash real":
  //   ingresos = Σ fee de cada cliente que tiene payment.status = 'paid'
  //              en ese mes + impacto de ingresos manuales de ese mes
  //   egresos = Σ expenses con fecha de ese mes
  //
  // Si no hay payments paid ni manual revenues ni egresos → todo 0.
  // El director ve la verdad del cash, no proyecciones.
  function netOfMonth(mk: string): {
    ingresos: number;
    egresos: number;
    net: number;
  } {
    const feesPaid = clients.reduce((s, c) => {
      const p = payments.find(
        (pp) => pp.clientId === c.id && pp.month === mk,
      );
      return p?.status === "paid" ? s + c.fee : s;
    }, 0);
    const mImpact = manualRevs.reduce(
      (s, r) => s + revenueMonthlyImpact(r, mk),
      0,
    );
    const mExpenses = expenses
      .filter((e) => (e.date ?? "").startsWith(mk))
      .reduce((s, e) => s + e.amount, 0);
    const ingresos = feesPaid + mImpact;
    return { ingresos, egresos: mExpenses, net: ingresos - mExpenses };
  }
  const cur = netOfMonth(curMonth);
  const prev = netOfMonth(prevMonth);
  const ingresoDelta = pctChange(cur.ingresos, prev.ingresos);
  const egresoDelta = pctChange(cur.egresos, prev.egresos);
  const netDelta = pctChange(cur.net, prev.net);

  // Histórico últimos 6 meses
  const last6: { mk: string; label: string; ingresos: number; egresos: number; net: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mk = d.toISOString().slice(0, 7);
    const label = MONTHS_SHORT_ES[d.getMonth()];
    const v = netOfMonth(mk);
    last6.push({ mk, label, ingresos: v.ingresos, egresos: v.egresos, net: v.net });
  }

  // Totales anuales reales = suma de los últimos 12 meses cerrados +
  // mes en curso. Esto reemplaza los `mrr / totalExpenses / netResult`
  // que venían de page.tsx, que estaban mal calculados (MRR actual vs
  // egresos all-time mezclando años distintos).
  const annual = (() => {
    let ingresos = 0;
    let egresos = 0;
    for (let i = 0; i <= 11; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mk = d.toISOString().slice(0, 7);
      const v = netOfMonth(mk);
      ingresos += v.ingresos;
      egresos += v.egresos;
    }
    const net = ingresos - egresos;
    const margin =
      ingresos > 0 ? Math.round((net / ingresos) * 100) : 0;
    return { ingresos, egresos, net, margin };
  })();

  // Distribución MRR por tipo de cliente (GP vs Dev)
  const gpRevenue = clients.filter((c) => c.type === "gp").reduce((s, c) => s + c.fee, 0);
  const devRevenue = clients.filter((c) => c.type === "dev").reduce((s, c) => s + c.fee, 0);
  const mrrSplit = [
    { name: "Growth Partner", value: gpRevenue, color: DASH_COLORS.deepGreen },
    { name: "Desarrollo",     value: devRevenue, color: DASH_COLORS.sand },
  ].filter((s) => s.value > 0);

  // Egresos por categoría — del mes actual
  const expensesByCat = expenses
    .filter((e) => (e.date ?? "").startsWith(curMonth))
    .reduce((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + e.amount;
      return acc;
    }, {} as Record<string, number>);
  const expenseCatData = Object.entries(expensesByCat)
    .map(([k, v], i) => ({
      name: EXPENSE_CATEGORY_LABEL[k] ?? k,
      value: v,
      color: PIE_PALETTE[i % PIE_PALETTE.length],
    }))
    .sort((a, b) => b.value - a.value);

  // Top 5 clientes por fee
  const topClients = [...clients]
    .sort((a, b) => b.fee - a.fee)
    .slice(0, 5)
    .map((c) => ({ name: c.name, value: c.fee }));

  // Payments status del mes (para subtítulo de KPI MRR)
  const paidCount = payments.filter((p) => p.month === curMonth && p.status === "paid").length;
  const pendingCount = clients.length - paidCount;

  // Leads en pipeline (para subtítulo)
  const activeLeads = leads.length;

  return (
    <>
      {/* Header inline (no usamos <Header> de page.tsx para no acoplar
          archivos — replicamos el mismo layout de finanzas.module.css). */}
      <div className={styles.head}>
        <div>
          <div className={styles.eyebrow}>Panel empresarial</div>
          <h1>Finanzas</h1>
        </div>
        <div className={styles.metaLabel}>
          Resultado neto (últimos 12m)
          <span
            className={styles.metaStrong}
            style={{
              color:
                annual.net < 0
                  ? DASH_COLORS.red
                  : DASH_COLORS.deepGreen,
            }}
          >
            US$ {annual.net.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Row 1 — 4 KPI cards con deltas */}
      <div className={styles.kpis}>
        <KpiCard
          label="Ingresos cobrados del mes"
          value={`US$ ${cur.ingresos.toLocaleString()}`}
          sub={`${paidCount} pagado${paidCount === 1 ? "" : "s"} · ${pendingCount} pendiente${pendingCount === 1 ? "" : "s"} · MRR facturable US$ ${mrr.toLocaleString()}`}
          delta={ingresoDelta}
          positiveIsGood
        />
        <KpiCard
          label="Egresos del mes"
          value={`US$ ${cur.egresos.toLocaleString()}`}
          sub={`Últimos 12m: US$ ${annual.egresos.toLocaleString()}`}
          delta={egresoDelta}
          positiveIsGood={false}
        />
        <KpiCard
          label="Resultado neto"
          value={`US$ ${cur.net.toLocaleString()}`}
          sub={`Margen 12m ${annual.margin}% · objetivo 60%`}
          delta={netDelta}
          positiveIsGood
          highlight={cur.net < 0 ? "danger" : "ok"}
        />
        <KpiCard
          label="Pipeline"
          value={`US$ ${pipelineValue.toLocaleString()}`}
          sub={`${activeLeads} prospecto${activeLeads === 1 ? "" : "s"} activo${activeLeads === 1 ? "" : "s"}`}
        />
      </div>

      {clients.length === 0 ? (
        <EmptyStateInline
          icon="◌"
          title="Todavía no hay datos financieros"
          desc="Creá clientes en el Hub y registrá egresos para empezar a ver tu panel financiero con datos reales."
        />
      ) : (
        <>
          {/* Row 2 — gráficos principales */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1.5fr 1.5fr",
              gap: 20,
              marginBottom: 24,
            }}
          >
            <ChartCard title="Distribución MRR" subtitle="Por tipo de cliente">
              {mrrSplit.length === 0 ? (
                <ChartEmpty />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={mrrSplit}
                      dataKey="value"
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={85}
                      paddingAngle={2}
                      label={(props) => {
                        const { percent } = props as { percent?: number };
                        return percent ? `${Math.round(percent * 100)}%` : "";
                      }}
                      labelLine={false}
                    >
                      {mrrSplit.map((s) => (
                        <Cell key={s.name} fill={s.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number) => `US$ ${v.toLocaleString()}`}
                    />
                    <Legend
                      verticalAlign="bottom"
                      iconType="circle"
                      wrapperStyle={{ fontSize: 11 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard
              title="Ingresos cobrados por mes"
              subtitle="Últimos 6 meses · cash real"
            >
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={last6} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <XAxis
                    dataKey="label"
                    fontSize={10}
                    tickLine={false}
                    axisLine={{ stroke: "rgba(10,26,12,0.08)" }}
                  />
                  <YAxis
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) =>
                      v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                    }
                  />
                  <Tooltip
                    formatter={(v: number) => `US$ ${v.toLocaleString()}`}
                    cursor={{ fill: "rgba(196,168,130,0.1)" }}
                  />
                  <Bar
                    dataKey="ingresos"
                    fill={DASH_COLORS.sand}
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Resultado neto por mes"
              subtitle="Últimos 6 meses · cash real"
            >
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={last6} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <XAxis
                    dataKey="label"
                    fontSize={10}
                    tickLine={false}
                    axisLine={{ stroke: "rgba(10,26,12,0.08)" }}
                  />
                  <YAxis
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) =>
                      v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v <= -1000 ? `-${(-v / 1000).toFixed(0)}k` : String(v)
                    }
                  />
                  <Tooltip
                    formatter={(v: number) => `US$ ${v.toLocaleString()}`}
                    cursor={{ fill: "rgba(196,168,130,0.1)" }}
                  />
                  <Bar dataKey="net" radius={[3, 3, 0, 0]}>
                    {last6.map((m) => (
                      <Cell
                        key={m.mk}
                        fill={m.net >= 0 ? DASH_COLORS.green : DASH_COLORS.red}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Row 3 — egresos por categoría + top clientes */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 2fr",
              gap: 20,
              marginBottom: 24,
            }}
          >
            <ChartCard
              title="Egresos por categoría"
              subtitle={`${MONTHS_SHORT_ES[now.getMonth()]} ${now.getFullYear()}`}
            >
              {expenseCatData.length === 0 ? (
                <ChartEmpty />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={expenseCatData}
                      dataKey="value"
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={85}
                      paddingAngle={2}
                      label={(props) => {
                        const { percent } = props as { percent?: number };
                        return percent && percent > 0.05
                          ? `${Math.round(percent * 100)}%`
                          : "";
                      }}
                      labelLine={false}
                    >
                      {expenseCatData.map((s) => (
                        <Cell key={s.name} fill={s.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number) => `US$ ${v.toLocaleString()}`}
                    />
                    <Legend
                      verticalAlign="bottom"
                      iconType="circle"
                      wrapperStyle={{ fontSize: 11 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard
              title="Top 5 clientes por fee"
              subtitle="Concentración de MRR"
            >
              {topClients.length === 0 ? (
                <ChartEmpty />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={topClients}
                    layout="vertical"
                    margin={{ top: 8, right: 16, left: 16, bottom: 0 }}
                  >
                    <XAxis
                      type="number"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) =>
                        v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                      }
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      width={120}
                    />
                    <Tooltip
                      formatter={(v: number) => `US$ ${v.toLocaleString()}`}
                      cursor={{ fill: "rgba(196,168,130,0.1)" }}
                    />
                    <Bar
                      dataKey="value"
                      fill={DASH_COLORS.forest2}
                      radius={[0, 3, 3, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>
        </>
      )}
    </>
  );
}

/** % de cambio entre 2 valores. Devuelve null si el anterior es 0
 *  (no se puede calcular cambio relativo desde cero). */
function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((curr - prev) / Math.abs(prev)) * 100);
}

/** KPI card con delta opcional vs mes anterior. */
function KpiCard({
  label,
  value,
  sub,
  delta,
  positiveIsGood = true,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: number | null;
  positiveIsGood?: boolean;
  highlight?: "ok" | "danger";
}) {
  // Color del delta: por default verde si positivo, rojo si negativo.
  // Si positiveIsGood=false (ej: egresos), invertimos: subir es malo.
  let deltaColor: string | undefined;
  if (delta !== undefined && delta !== null) {
    const isGood = positiveIsGood ? delta >= 0 : delta <= 0;
    deltaColor = isGood ? DASH_COLORS.green : DASH_COLORS.red;
  }
  const valueColor =
    highlight === "danger"
      ? DASH_COLORS.red
      : highlight === "ok"
        ? DASH_COLORS.deepGreen
        : undefined;

  return (
    <div className={styles.kpi}>
      <div className={styles.kLabel}>{label}</div>
      <div
        className={styles.kValue}
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
        {sub && <div className={styles.kSub}>{sub}</div>}
        {delta !== undefined && delta !== null && (
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: deltaColor,
              padding: "2px 6px",
              background:
                deltaColor === DASH_COLORS.green
                  ? "rgba(47,125,79,0.10)"
                  : "rgba(176,75,58,0.10)",
              borderRadius: 3,
            }}
          >
            {delta >= 0 ? "↑" : "↓"} {Math.abs(delta)}%
          </div>
        )}
      </div>
    </div>
  );
}

/** Card que envuelve un gráfico con título + subtítulo. */
function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--white)",
        border: "1px solid rgba(10,26,12,0.08)",
        borderRadius: "var(--r-lg)",
        boxShadow: "var(--shadow-card)",
        padding: 20,
      }}
    >
      <div
        style={{
          marginBottom: 14,
          paddingBottom: 10,
          borderBottom: "1px solid rgba(10,26,12,0.06)",
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "var(--deep-green)",
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              fontSize: 10,
              color: "var(--sand-dark)",
              marginTop: 3,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function ChartEmpty() {
  return (
    <div
      style={{
        height: 220,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-muted)",
        fontSize: 12,
        fontStyle: "italic",
      }}
    >
      Sin datos para mostrar
    </div>
  );
}

function EmptyStateInline({
  icon,
  title,
  desc,
}: {
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <div
      style={{
        padding: 60,
        textAlign: "center",
        border: "1px dashed rgba(10,26,12,0.15)",
        background: "var(--off-white)",
        marginTop: 32,
      }}
    >
      <div style={{ fontSize: 40, color: "var(--sand-dark)", opacity: 0.6, marginBottom: 20 }}>
        {icon}
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 600,
          color: "var(--deep-green)",
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 13, color: "var(--text-muted)", maxWidth: 440, margin: "0 auto" }}>
        {desc}
      </div>
    </div>
  );
}

// ============================================================
// TeamCostView — costo del equipo
// ============================================================
export function TeamCostView() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listProfiles().then((list) => {
      // Solo team (excluye clients y los que no tengan pago seteado).
      setProfiles(
        list.filter(
          (p) =>
            p.role !== "client" &&
            p.payment_amount != null &&
            Number(p.payment_amount) > 0,
        ),
      );
      setLoading(false);
    });
  }, []);

  // Agrupar por posición
  const byPosition = new Map<string, { profiles: Profile[]; total: number }>();
  for (const p of profiles) {
    const pos = p.position ?? "Sin posición";
    const cur = byPosition.get(pos) ?? { profiles: [], total: 0 };
    cur.profiles.push(p);
    cur.total += Number(p.payment_amount ?? 0);
    byPosition.set(pos, cur);
  }
  const grouped = Array.from(byPosition.entries()).sort(
    (a, b) => b[1].total - a[1].total,
  );
  const grandTotal = profiles.reduce(
    (s, p) => s + Number(p.payment_amount ?? 0),
    0,
  );

  return (
    <>
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--sand-dark)",
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        Finanzas · Funcionales
      </div>
      <h1 style={h1Style}>Funcionales</h1>
      <p
        style={{
          maxWidth: 700,
          color: "var(--text-muted)",
          fontSize: 14,
          lineHeight: 1.6,
          marginBottom: 28,
        }}
      >
        Suma de los pagos definidos en /equipo, agrupada por posición.
        Para cambiar montos, andá al detail de cada persona desde{" "}
        <Link href="/equipo" style={{ color: "var(--sand-dark)" }}>
          /equipo
        </Link>
        .
      </p>

      {loading && <div>Cargando…</div>}

      {!loading && profiles.length === 0 && (
        <div
          style={{
            padding: 32,
            background: "var(--off-white)",
            border: "1px dashed rgba(10,26,12,0.15)",
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: 13,
          }}
        >
          Ningún miembro tiene pago definido todavía. Cargá los montos
          desde el detail de cada persona en /equipo.
        </div>
      )}

      {!loading && profiles.length > 0 && (
        <>
          <div className={styles.kpis}>
            <div className={styles.kpi}>
              <div className={styles.kLabel}>Total mensual</div>
              <div className={styles.kValue}>
                US$ {grandTotal.toLocaleString()}
              </div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kLabel}>Personas con pago</div>
              <div className={styles.kValue}>{profiles.length}</div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kLabel}>Posiciones</div>
              <div className={styles.kValue}>{grouped.length}</div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kLabel}>Promedio/persona</div>
              <div className={styles.kValue}>
                US${" "}
                {profiles.length > 0
                  ? Math.round(grandTotal / profiles.length).toLocaleString()
                  : 0}
              </div>
            </div>
          </div>

          <div className={styles.table}>
            <h3>Desglose por posición</h3>
            <div
              className={`${styles.row} ${styles.rowHead}`}
              style={{ gridTemplateColumns: "2fr 1fr 1fr" }}
            >
              <div>Posición</div>
              <div>Personas</div>
              <div>Costo mensual</div>
            </div>
            {grouped.map(([pos, info]) => (
              <details key={pos}>
                <summary
                  className={styles.row}
                  style={{
                    gridTemplateColumns: "2fr 1fr 1fr",
                    cursor: "pointer",
                    listStyle: "none",
                  }}
                >
                  <div>
                    <strong>{pos}</strong>
                  </div>
                  <div className={styles.num}>{info.profiles.length}</div>
                  <div className={`${styles.num} ${styles.pos}`}>
                    US$ {info.total.toLocaleString()}
                  </div>
                </summary>
                <div
                  style={{
                    padding: "8px 16px",
                    background: "var(--off-white)",
                  }}
                >
                  {info.profiles.map((p) => (
                    <Link
                      key={p.id}
                      href={`/equipo/${p.id}`}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "6px 0",
                        fontSize: 12,
                        textDecoration: "none",
                        color: "inherit",
                        borderBottom: "1px solid rgba(10,26,12,0.05)",
                      }}
                    >
                      <span>{p.name}</span>
                      <span style={{ color: "var(--text-muted)" }}>
                        {p.payment_currency ?? "USD"}{" "}
                        {Number(p.payment_amount).toLocaleString()} (
                        {p.payment_type ?? "fijo"})
                      </span>
                    </Link>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </>
      )}
    </>
  );
}

// ============================================================
// DividendosView — distribución del net profit a mes vencido
// ============================================================
//
// Los dividendos se calculan sobre el RESULTADO NETO DEL MES VENCIDO
// (mes anterior cerrado), no el mes en curso. El director elige qué
// mes quiere ver con el selector — por default abre el mes anterior.
//
// Default split: 30% socio A + 30% socio B + 40% inversiones.
// La fila "back de empresa" queda en 0 (legacy de la migración 025)
// y solo se muestra si el director la setea explícitamente > 0 en
// modo edición.
// ============================================================
export function DividendosView({
  clients,
  expenses,
  payments,
  manualRevs,
}: {
  clients: Client[];
  expenses: Expense[];
  payments: InvoicePayment[];
  manualRevs: ManualRevenue[];
}) {
  const [config, setConfig] = useState<DividendConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    partner_a_pct: 30,
    partner_b_pct: 30,
    inversiones_pct: 40,
    back_pct: 0,
    partner_a_name: "Federico Dearmas",
    partner_b_name: "Gianluca Costantini",
  });
  const [saving, setSaving] = useState(false);
  /** Mes seleccionado (YYYY-MM). Default = mes anterior cerrado. */
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  });

  async function refresh() {
    setLoading(true);
    const c = await getDividendConfig();
    setConfig(c);
    if (c) {
      setEditForm({
        partner_a_pct: Number(c.partner_a_pct),
        partner_b_pct: Number(c.partner_b_pct),
        inversiones_pct: Number(c.inversiones_pct),
        back_pct: Number(c.back_pct),
        partner_a_name: c.partner_a_name,
        partner_b_name: c.partner_b_name,
      });
    }
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  // Calcular net del mes seleccionado (base devengada):
  //   ingresos = fees mensuales + impacto de ingresos manuales en ese mes
  //   egresos = todos los gastos del mes
  //   net = ingresos − egresos
  // Esto matchea el cálculo de page.tsx pero parametrizado por mes,
  // así el director puede ver dividendos de meses anteriores.
  const mrrBase = clients.reduce((s, c) => s + c.fee, 0);
  const manualRevImpact = manualRevs.reduce(
    (s, r) => s + revenueMonthlyImpact(r, selectedMonth),
    0,
  );
  const monthExpenses = expenses
    .filter((e) => (e.date ?? "").startsWith(selectedMonth))
    .reduce((s, e) => s + e.amount, 0);
  const monthlyNet = mrrBase + manualRevImpact - monthExpenses;

  // Generamos opciones de mes para el selector: últimos 12 meses
  // empezando por el mes anterior cerrado.
  const monthOptions: { value: string; label: string }[] = [];
  {
    const now = new Date();
    for (let i = 1; i <= 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = d.toISOString().slice(0, 7);
      const label = d.toLocaleDateString("es-AR", {
        month: "long",
        year: "numeric",
      });
      monthOptions.push({ value, label });
    }
    // Mes actual (en curso) último, marcado como "en curso"
    const cur = now.toISOString().slice(0, 7);
    const curLabel = now.toLocaleDateString("es-AR", {
      month: "long",
      year: "numeric",
    });
    monthOptions.unshift({ value: cur, label: `${curLabel} (en curso)` });
  }

  /** Historial de los últimos 12 meses cerrados con su distribución
   *  recalculada con la config actual. Para meses anteriores al inicio
   *  de operación (sin egresos ni ingresos) el net da 0 — los igual
   *  los listamos para que se vea el rango temporal completo.
   *
   *  Nota: usamos la config actual para todos los meses. Si en el
   *  futuro la config cambia (ej: 25/25/50), los acumulados pasados
   *  se RECALCULAN — no es un libro de actas inmutable, es la
   *  proyección "qué hubiese sido con la config de hoy". */
  const history = (() => {
    if (!config) return [] as Array<{
      monthKey: string;
      label: string;
      net: number;
      partnerA: number;
      partnerB: number;
      inversiones: number;
      back: number;
    }>;
    const now = new Date();
    const rows: Array<{
      monthKey: string;
      label: string;
      net: number;
      partnerA: number;
      partnerB: number;
      inversiones: number;
      back: number;
    }> = [];
    for (let i = 1; i <= 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mk = d.toISOString().slice(0, 7);
      const label = d.toLocaleDateString("es-AR", {
        month: "long",
        year: "numeric",
      });
      const mImpact = manualRevs.reduce(
        (s, r) => s + revenueMonthlyImpact(r, mk),
        0,
      );
      const mExpenses = expenses
        .filter((e) => (e.date ?? "").startsWith(mk))
        .reduce((s, e) => s + e.amount, 0);
      const net = mrrBase + mImpact - mExpenses;
      const d2 = distributeDividends(net, config);
      rows.push({
        monthKey: mk,
        label,
        net,
        partnerA: d2.partnerA,
        partnerB: d2.partnerB,
        inversiones: d2.inversiones,
        back: d2.back,
      });
    }
    return rows;
  })();

  /** Acumulados de los últimos 12 meses. */
  const accumulated = history.reduce(
    (acc, r) => ({
      net: acc.net + r.net,
      partnerA: acc.partnerA + r.partnerA,
      partnerB: acc.partnerB + r.partnerB,
      inversiones: acc.inversiones + r.inversiones,
      back: acc.back + r.back,
    }),
    { net: 0, partnerA: 0, partnerB: 0, inversiones: 0, back: 0 },
  );

  async function save() {
    const total =
      editForm.partner_a_pct +
      editForm.partner_b_pct +
      editForm.inversiones_pct +
      editForm.back_pct;
    if (total > 100) {
      alert(`Los porcentajes suman ${total}%. No pueden superar 100%.`);
      return;
    }
    setSaving(true);
    try {
      await updateDividendConfig(editForm);
      setEditing(false);
      refresh();
    } catch (err) {
      const e = err as Error;
      alert(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div>Cargando configuración…</div>;
  }

  // Si no hay config en DB, mostramos defaults + aviso de que falta
  // correr la migración 025.
  if (!config) {
    return (
      <>
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--sand-dark)",
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          Finanzas · Distribución
        </div>
        <h1 style={h1Style}>Distribución de dividendos</h1>
        <div
          style={{
            padding: 24,
            background: "rgba(196,168,130,0.1)",
            borderLeft: "3px solid var(--sand)",
            marginTop: 24,
            fontSize: 13,
            color: "var(--text-soft, #5a6a5e)",
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: "var(--deep-green)" }}>
            Configuración no disponible
          </strong>
          <br />
          La tabla <code>dividend_config</code> todavía no existe en la
          base de datos. Pegá la migración 025 en el SQL Editor de
          Supabase y dale Run. Después refrescá esta página.
        </div>
      </>
    );
  }

  const dist = distributeDividends(monthlyNet, config);
  const totalPct =
    Number(config.partner_a_pct) +
    Number(config.partner_b_pct) +
    Number(config.inversiones_pct) +
    Number(config.back_pct);

  return (
    <>
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--sand-dark)",
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        Finanzas · Distribución
      </div>
      <h1 style={h1Style}>Distribución de dividendos</h1>
      <p
        style={{
          maxWidth: 700,
          color: "var(--text-muted)",
          fontSize: 14,
          lineHeight: 1.6,
          marginBottom: 20,
        }}
      >
        Distribución a <strong style={{ color: "var(--deep-green)" }}>mes vencido</strong>:
        el resultado neto del mes cerrado se reparte entre los dos socios
        (30% c/u) y queda 40% para invertir en la empresa. Elegí el mes
        que querés liquidar.
      </p>

      {/* Selector de mes */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 24,
          padding: "12px 16px",
          background: "var(--off-white)",
          borderLeft: "3px solid var(--sand)",
          borderRadius: "var(--r-md)",
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--sand-dark)",
            fontWeight: 700,
          }}
        >
          Mes a liquidar
        </div>
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          style={{ ...inputStyle, minWidth: 200, textTransform: "capitalize" }}
        >
          {monthOptions.map((m) => (
            <option key={m.value} value={m.value} style={{ textTransform: "capitalize" }}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <div className={styles.kLabel}>Resultado neto del mes</div>
          <div
            className={styles.kValue}
            style={{
              color: monthlyNet < 0 ? "var(--red-warn)" : "var(--deep-green)",
            }}
          >
            US$ {monthlyNet.toLocaleString()}
          </div>
          <div className={styles.kSub}>
            Ingresos − egresos · {selectedMonth}
          </div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kLabel}>{config.partner_a_name}</div>
          <div className={styles.kValue}>
            US$ {dist.partnerA.toLocaleString()}
          </div>
          <div className={styles.kLabel}>{config.partner_a_pct}%</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kLabel}>{config.partner_b_name}</div>
          <div className={styles.kValue}>
            US$ {dist.partnerB.toLocaleString()}
          </div>
          <div className={styles.kLabel}>{config.partner_b_pct}%</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kLabel}>Inversión en la empresa</div>
          <div className={styles.kValue}>
            US$ {dist.inversiones.toLocaleString()}
          </div>
          <div className={styles.kLabel}>{config.inversiones_pct}%</div>
        </div>
        {/* Back de empresa solo se muestra si está configurado > 0 —
            por default está oculto (legacy). */}
        {Number(config.back_pct) > 0 && (
          <div className={styles.kpi}>
            <div className={styles.kLabel}>Back de empresa</div>
            <div className={styles.kValue}>
              US$ {dist.back.toLocaleString()}
            </div>
            <div className={styles.kLabel}>{config.back_pct}%</div>
          </div>
        )}
      </div>

      {dist.remainder !== 0 && (
        <div
          style={{
            padding: "10px 14px",
            background:
              totalPct < 100
                ? "rgba(196,168,130,0.1)"
                : "rgba(176,75,58,0.08)",
            borderLeft: `3px solid ${
              totalPct < 100 ? "var(--sand)" : "var(--red-warn)"
            }`,
            fontSize: 12,
            color: "var(--text-soft, #5a6a5e)",
            marginBottom: 16,
          }}
        >
          <strong style={{ color: "var(--deep-green)" }}>
            Distribuido: {totalPct}%
          </strong>{" "}
          {totalPct < 100 && (
            <>
              · Queda sin asignar:{" "}
              <strong>US$ {dist.remainder.toLocaleString()}</strong> (
              {(100 - totalPct).toFixed(2)}%). Reservá o re-asigná desde
              la config.
            </>
          )}
        </div>
      )}

      {/* Historial de los últimos 12 meses + acumulados */}
      <div className={styles.table} style={{ marginTop: 24 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 18,
            paddingBottom: 14,
            borderBottom: "1px solid rgba(10,26,12,0.08)",
          }}
        >
          <div>
            <h3 style={{ margin: 0, padding: 0, border: "none" }}>
              Historial de dividendos
            </h3>
            <p
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                marginTop: 6,
                marginBottom: 0,
              }}
            >
              Últimos 12 meses cerrados. Los valores se recalculan con la
              config actual ({config.partner_a_pct}/{config.partner_b_pct}/
              {config.inversiones_pct}
              {Number(config.back_pct) > 0 ? `/${config.back_pct}` : ""}).
            </p>
          </div>
        </div>

        <div
          className={`${styles.row} ${styles.rowHead}`}
          style={{
            gridTemplateColumns:
              Number(config.back_pct) > 0
                ? "1.4fr 1fr 1fr 1fr 1fr 1fr"
                : "1.4fr 1fr 1fr 1fr 1fr",
          }}
        >
          <div>Mes</div>
          <div style={{ textAlign: "right" }}>Neto</div>
          <div style={{ textAlign: "right" }}>{config.partner_a_name.split(" ")[0]}</div>
          <div style={{ textAlign: "right" }}>{config.partner_b_name.split(" ")[0]}</div>
          <div style={{ textAlign: "right" }}>Inversión</div>
          {Number(config.back_pct) > 0 && (
            <div style={{ textAlign: "right" }}>Back</div>
          )}
        </div>

        {history.length === 0 ? (
          <div style={{ padding: 20, color: "var(--text-muted)", fontSize: 13 }}>
            Sin historial todavía.
          </div>
        ) : (
          history.map((r) => {
            const isSelected = r.monthKey === selectedMonth;
            return (
              <div
                key={r.monthKey}
                className={styles.row}
                style={{
                  gridTemplateColumns:
                    Number(config.back_pct) > 0
                      ? "1.4fr 1fr 1fr 1fr 1fr 1fr"
                      : "1.4fr 1fr 1fr 1fr 1fr",
                  background: isSelected
                    ? "rgba(196, 168, 130, 0.10)"
                    : undefined,
                  cursor: "pointer",
                }}
                onClick={() => setSelectedMonth(r.monthKey)}
                title="Ver este mes arriba"
              >
                <div style={{ textTransform: "capitalize" }}>
                  {r.label}
                  {isSelected && (
                    <span
                      style={{
                        marginLeft: 6,
                        fontSize: 9,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: "var(--sand-dark)",
                        fontWeight: 700,
                      }}
                    >
                      · ACTUAL
                    </span>
                  )}
                </div>
                <div
                  className={styles.num}
                  style={{
                    textAlign: "right",
                    color:
                      r.net < 0 ? "var(--red-warn)" : "var(--deep-green)",
                  }}
                >
                  US$ {r.net.toLocaleString()}
                </div>
                <div className={styles.num} style={{ textAlign: "right" }}>
                  US$ {r.partnerA.toLocaleString()}
                </div>
                <div className={styles.num} style={{ textAlign: "right" }}>
                  US$ {r.partnerB.toLocaleString()}
                </div>
                <div className={styles.num} style={{ textAlign: "right" }}>
                  US$ {r.inversiones.toLocaleString()}
                </div>
                {Number(config.back_pct) > 0 && (
                  <div className={styles.num} style={{ textAlign: "right" }}>
                    US$ {r.back.toLocaleString()}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Fila de acumulados */}
        {history.length > 0 && (
          <div
            className={styles.row}
            style={{
              gridTemplateColumns:
                Number(config.back_pct) > 0
                  ? "1.4fr 1fr 1fr 1fr 1fr 1fr"
                  : "1.4fr 1fr 1fr 1fr 1fr",
              borderTop: "2px solid rgba(10,26,12,0.15)",
              borderBottom: "none",
              fontWeight: 700,
              background: "var(--off-white)",
              paddingTop: 12,
              paddingBottom: 12,
            }}
          >
            <div
              style={{
                fontSize: 12,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--sand-dark)",
              }}
            >
              Acumulado 12m
            </div>
            <div
              className={styles.num}
              style={{
                textAlign: "right",
                color:
                  accumulated.net < 0
                    ? "var(--red-warn)"
                    : "var(--deep-green)",
                fontWeight: 700,
              }}
            >
              US$ {accumulated.net.toLocaleString()}
            </div>
            <div
              className={styles.num}
              style={{ textAlign: "right", fontWeight: 700 }}
            >
              US$ {accumulated.partnerA.toLocaleString()}
            </div>
            <div
              className={styles.num}
              style={{ textAlign: "right", fontWeight: 700 }}
            >
              US$ {accumulated.partnerB.toLocaleString()}
            </div>
            <div
              className={styles.num}
              style={{ textAlign: "right", fontWeight: 700 }}
            >
              US$ {accumulated.inversiones.toLocaleString()}
            </div>
            {Number(config.back_pct) > 0 && (
              <div
                className={styles.num}
                style={{ textAlign: "right", fontWeight: 700 }}
              >
                US$ {accumulated.back.toLocaleString()}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit form */}
      <div className={styles.table} style={{ marginTop: 24 }}>
        <h3>Configuración actual</h3>
        {!editing && (
          <>
            <div style={{ padding: "12px 0", display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8, fontSize: 13 }}>
              <div>{config.partner_a_name}</div>
              <div style={{ textAlign: "right" }}>{config.partner_a_pct}%</div>
              <div>{config.partner_b_name}</div>
              <div style={{ textAlign: "right" }}>{config.partner_b_pct}%</div>
              <div>Inversión en la empresa</div>
              <div style={{ textAlign: "right" }}>{config.inversiones_pct}%</div>
              {Number(config.back_pct) > 0 && (
                <>
                  <div>Back de empresa</div>
                  <div style={{ textAlign: "right" }}>{config.back_pct}%</div>
                </>
              )}
            </div>
            <button
              onClick={() => setEditing(true)}
              style={solidBtn}
            >
              ✎ Editar config
            </button>
          </>
        )}

        {editing && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              padding: "8px 0",
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, alignItems: "center" }}>
              <input
                type="text"
                value={editForm.partner_a_name}
                onChange={(e) =>
                  setEditForm({ ...editForm, partner_a_name: e.target.value })
                }
                style={inputStyle}
              />
              <PctInput
                value={editForm.partner_a_pct}
                onChange={(v) => setEditForm({ ...editForm, partner_a_pct: v })}
              />

              <input
                type="text"
                value={editForm.partner_b_name}
                onChange={(e) =>
                  setEditForm({ ...editForm, partner_b_name: e.target.value })
                }
                style={inputStyle}
              />
              <PctInput
                value={editForm.partner_b_pct}
                onChange={(v) => setEditForm({ ...editForm, partner_b_pct: v })}
              />

              <div style={{ paddingLeft: 10, fontSize: 13 }}>Inversión en la empresa</div>
              <PctInput
                value={editForm.inversiones_pct}
                onChange={(v) =>
                  setEditForm({ ...editForm, inversiones_pct: v })
                }
              />

              {/* Back de empresa solo aparece si ya tenía valor > 0 (legacy).
                  Para uso nuevo el % de back debería quedar siempre en 0 —
                  todo lo no repartido va a inversiones. */}
              {editForm.back_pct > 0 && (
                <>
                  <div style={{ paddingLeft: 10, fontSize: 13 }}>Back de empresa</div>
                  <PctInput
                    value={editForm.back_pct}
                    onChange={(v) => setEditForm({ ...editForm, back_pct: v })}
                  />
                </>
              )}
            </div>
            <div
              style={{
                padding: "8px 12px",
                background: "var(--off-white)",
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              Suma total:{" "}
              <strong
                style={{
                  color:
                    editForm.partner_a_pct +
                      editForm.partner_b_pct +
                      editForm.inversiones_pct +
                      editForm.back_pct >
                    100
                      ? "var(--red-warn)"
                      : "var(--deep-green)",
                }}
              >
                {editForm.partner_a_pct +
                  editForm.partner_b_pct +
                  editForm.inversiones_pct +
                  editForm.back_pct}
                %
              </strong>{" "}
              (debe ser ≤ 100%)
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={save} disabled={saving} style={solidBtn}>
                {saving ? "Guardando…" : "Guardar"}
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  refresh();
                }}
                style={ghostBtn}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function PctInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input
        type="number"
        min={0}
        max={100}
        step={0.5}
        value={value}
        onChange={(e) =>
          onChange(Math.max(0, Math.min(100, Number(e.target.value) || 0)))
        }
        style={{ ...inputStyle, textAlign: "right" }}
      />
      <span style={{ fontSize: 13, color: "var(--text-muted)" }}>%</span>
    </div>
  );
}

// ============================================================
// EstadosView — estado de resultados + estado de situación
// ============================================================
export function EstadosView({
  clients,
  expenses,
  payments,
  monthYYYYMM,
}: {
  clients: Client[];
  expenses: Expense[];
  payments: { clientId: string; month: string; status: string }[];
  monthYYYYMM: string;
}) {
  const [revenues, setRevenues] = useState<ManualRevenue[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listManualRevenues().then((r) => {
      setRevenues(r);
      setLoading(false);
    });
  }, []);

  // Estado de Resultados (Income Statement) — del mes seleccionado.
  const feesBilled = clients.reduce((s, c) => s + c.fee, 0);
  const feesPaid = clients.reduce((s, c) => {
    const p = payments.find(
      (p) => p.clientId === c.id && p.month === monthYYYYMM,
    );
    return s + (p?.status === "paid" ? c.fee : 0);
  }, 0);
  const manualRevImpact = revenues.reduce(
    (s, r) => s + revenueMonthlyImpact(r, monthYYYYMM),
    0,
  );
  const totalIngresos = feesBilled + manualRevImpact; // base devengado
  const monthExpenses = expenses
    .filter((e) => (e.date ?? "").startsWith(monthYYYYMM))
    .reduce((s, e) => s + e.amount, 0);
  const netResult = totalIngresos - monthExpenses;

  // Estado de Situación Financiera — simplificado.
  // Activos = cobrado del mes + facturado pendiente (cuentas por cobrar)
  // Sin pasivos modelados aún (próxima iteración).
  const cuentasPorCobrar = feesBilled - feesPaid;

  return (
    <>
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--sand-dark)",
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        Finanzas · Estados
      </div>
      <h1 style={h1Style}>Estados financieros</h1>
      <p
        style={{
          maxWidth: 700,
          color: "var(--text-muted)",
          fontSize: 14,
          lineHeight: 1.6,
          marginBottom: 28,
        }}
      >
        Mes corriente · {monthYYYYMM}
      </p>

      {loading && <div>Cargando…</div>}

      {!loading && (
        <>
          {/* ESTADO DE RESULTADOS */}
          <div className={styles.table}>
            <h3>Estado de resultados</h3>
            <div
              className={`${styles.row} ${styles.rowHead}`}
              style={{ gridTemplateColumns: "2fr 1fr" }}
            >
              <div>Concepto</div>
              <div>Monto</div>
            </div>

            <RowLine label="Fees de clientes facturados" value={feesBilled} kind="ingreso" />
            <RowLine
              label="Ingresos manuales (fijos + one-time)"
              value={manualRevImpact}
              kind="ingreso"
            />
            <RowLine
              label="TOTAL INGRESOS"
              value={totalIngresos}
              kind="ingreso"
              bold
            />
            <RowLine
              label="Egresos del mes"
              value={-monthExpenses}
              kind="egreso"
            />
            <RowLine
              label="RESULTADO NETO"
              value={netResult}
              kind={netResult >= 0 ? "ingreso" : "egreso"}
              bold
            />
          </div>

          {/* ESTADO DE SITUACIÓN FINANCIERA (simplificado) */}
          <div className={styles.table} style={{ marginTop: 24 }}>
            <h3>Estado de situación financiera</h3>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
              Vista simplificada. Pasivos y patrimonio requieren modelar
              deudas y capital social — viene en próxima iteración.
            </p>

            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  color: "var(--sand-dark)",
                  fontWeight: 700,
                  marginBottom: 8,
                }}
              >
                Activos corrientes
              </div>
              <RowLine
                label="Caja (cobrado del mes)"
                value={feesPaid}
                kind="ingreso"
              />
              <RowLine
                label="Cuentas por cobrar (fees pendientes)"
                value={cuentasPorCobrar}
                kind="ingreso"
              />
              <RowLine
                label="TOTAL ACTIVOS"
                value={feesPaid + cuentasPorCobrar}
                kind="ingreso"
                bold
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}

function RowLine({
  label,
  value,
  kind,
  bold = false,
}: {
  label: string;
  value: number;
  kind: "ingreso" | "egreso";
  bold?: boolean;
}) {
  return (
    <div
      className={styles.row}
      style={{
        gridTemplateColumns: "2fr 1fr",
        fontWeight: bold ? 700 : 400,
      }}
    >
      <div>{label}</div>
      <div
        className={`${styles.num} ${
          kind === "ingreso" ? styles.pos : styles.neg
        }`}
        style={bold ? { fontSize: 15 } : undefined}
      >
        {value < 0 ? "−" : ""}US$ {Math.abs(value).toLocaleString()}
      </div>
    </div>
  );
}

// ============================================================
// ManualRevenuesPanel — se inserta dentro de IngresosView
// ============================================================
export function ManualRevenuesPanel({ clients }: { clients: Client[] }) {
  const [revenues, setRevenues] = useState<ManualRevenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  /** ID del ingreso que se está editando. Si != null, el form se
   *  muestra pre-cargado y "Guardar" hace UPDATE en vez de INSERT. */
  const [editingId, setEditingId] = useState<string | null>(null);

  // form
  const [kind, setKind] = useState<ManualRevenueKind>("fijo");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [date, setDate] = useState("");
  const [category, setCategory] = useState("");
  /** clientId asignado al ingreso. "" = corporativo / sin cliente. */
  const [clientId, setClientId] = useState("");
  const [saving, setSaving] = useState(false);

  const isEditing = editingId !== null;

  async function refresh() {
    setLoading(true);
    setRevenues(await listManualRevenues());
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  /** Resetea el form a estado vacío y cierra el panel. */
  function resetAndClose() {
    setDescription("");
    setAmount("");
    setStart("");
    setEnd("");
    setDate("");
    setCategory("");
    setClientId("");
    setKind("fijo");
    setCurrency("USD");
    setAdding(false);
    setEditingId(null);
  }

  /** Abre el form en modo edición pre-cargando los valores del
   *  ingreso seleccionado. */
  function startEdit(r: ManualRevenue) {
    setEditingId(r.id);
    setKind(r.kind);
    setDescription(r.description);
    setAmount(String(r.amount));
    setCurrency(r.currency ?? "USD");
    setStart(r.start_date ?? "");
    setEnd(r.end_date ?? "");
    setDate(r.date ?? "");
    setCategory(r.category ?? "");
    setClientId(r.client_id ?? "");
    setAdding(true);
  }

  async function save() {
    if (!description.trim() || !amount) {
      alert("Descripción y monto son obligatorios.");
      return;
    }
    if (kind === "fijo" && !start) {
      alert("Para ingresos fijos hay que indicar desde cuándo.");
      return;
    }
    if (kind === "one_time" && !date) {
      alert("Para ingresos one-time hay que indicar la fecha.");
      return;
    }
    setSaving(true);
    try {
      const input: CreateManualRevenueInput = {
        kind,
        description: description.trim(),
        amount: Number(amount),
        currency,
        category: category.trim() || null,
        start_date: kind === "fijo" ? start : null,
        end_date: kind === "fijo" ? end || null : null,
        date: kind === "one_time" ? date : null,
        client_id: clientId || null,
      };
      if (editingId) {
        await updateManualRevenue(editingId, input);
      } else {
        await createManualRevenue(input);
      }
      resetAndClose();
      refresh();
    } catch (err) {
      const e = err as Error;
      alert(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar este ingreso?")) return;
    try {
      await deleteManualRevenue(id);
      // Si estaba editando ese mismo ingreso, cerramos el form.
      if (editingId === id) resetAndClose();
      refresh();
    } catch (err) {
      const e = err as Error;
      alert(`Error: ${e.message}`);
    }
  }

  return (
    <div className={styles.table} style={{ marginTop: 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
          paddingBottom: 14,
          borderBottom: "1px solid rgba(10,26,12,0.08)",
        }}
      >
        <div>
          <h3 style={{ margin: 0, border: "none", padding: 0 }}>
            Ingresos manuales (fijos + one-time)
          </h3>
          <p
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              marginTop: 6,
              marginBottom: 0,
            }}
          >
            Adicional a los fees mensuales de clientes. Ej: alquiler de
            cowork sub-arrendado, venta puntual, premio.
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            style={solidBtn}
          >
            + Agregar un ingreso
          </button>
        )}
      </div>

      {loading && <div>Cargando…</div>}

      {!loading && revenues.length > 0 && (
        <div
          className={`${styles.row} ${styles.rowHead}`}
          style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 90px" }}
        >
          <div>Descripción</div>
          <div>Tipo</div>
          <div>Período</div>
          <div>Monto</div>
          <div></div>
        </div>
      )}
      {!loading &&
        revenues.map((r) => {
          const isEditingThis = editingId === r.id;
          return (
            <div
              key={r.id}
              className={styles.row}
              style={{
                gridTemplateColumns: "2fr 1fr 1fr 1fr 90px",
                background: isEditingThis
                  ? "rgba(196, 168, 130, 0.08)"
                  : undefined,
              }}
            >
              <div>
                <strong>{r.description}</strong>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                  {r.client_id
                    ? clients.find((c) => c.id === r.client_id)?.name ?? r.client_id
                    : "Corporativo"}
                  {r.category && <> · {r.category}</>}
                </div>
              </div>
              <div className={styles.num}>
                {r.kind === "fijo" ? "Fijo /mes" : "One-time"}
              </div>
              <div className={styles.num} style={{ fontSize: 11 }}>
                {r.kind === "fijo"
                  ? `${r.start_date} → ${r.end_date ?? "vigente"}`
                  : r.date}
              </div>
              <div className={`${styles.num} ${styles.pos}`}>
                {r.currency} {Number(r.amount).toLocaleString()}
              </div>
              <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                <button
                  onClick={() => startEdit(r)}
                  disabled={saving}
                  title="Editar"
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(10,26,12,0.15)",
                    color: "var(--deep-green)",
                    padding: "3px 8px",
                    fontSize: 11,
                    cursor: saving ? "default" : "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Editar
                </button>
                <button
                  onClick={() => remove(r.id)}
                  title="Eliminar"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--red-warn)",
                    fontSize: 18,
                    cursor: "pointer",
                    width: 24,
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}

      {!loading && revenues.length === 0 && !adding && (
        <div
          style={{
            padding: 16,
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: 13,
            fontStyle: "italic",
          }}
        >
          Sin ingresos manuales cargados. Click en &quot;+ Agregar un
          ingreso&quot; arriba para empezar.
        </div>
      )}

      {adding && (
        <div
          style={{
            marginTop: 14,
            padding: 16,
            background: isEditing
              ? "rgba(196, 168, 130, 0.12)"
              : "var(--ivory)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            borderLeft: isEditing
              ? "3px solid var(--sand-dark)"
              : undefined,
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--sand-dark)",
              fontWeight: 700,
              marginBottom: 2,
            }}
          >
            {isEditing ? "Editar ingreso" : "Nuevo ingreso"}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as ManualRevenueKind)}
              style={{ ...inputStyle, flex: 1 }}
            >
              <option value="fijo">Fijo (se repite cada mes)</option>
              <option value="one_time">One-time (una sola vez)</option>
            </select>
            <input
              type="text"
              placeholder="Categoría (opcional)"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
            />
          </div>
          {/* Selector de cliente — opcional. Si queda vacío, el ingreso
              es corporativo (sin cliente asignado). Útil para alquileres,
              premios o cualquier ingreso no atribuible. */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: 10,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "var(--sand-dark)",
                fontWeight: 700,
                marginBottom: 4,
              }}
            >
              Asignar a cliente <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--text-muted)" }}>(opcional)</span>
            </label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              style={inputStyle}
            >
              <option value="">— Sin cliente (corporativo) —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <input
            type="text"
            placeholder="Descripción"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={inputStyle}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="number"
              placeholder="Monto"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{ ...inputStyle, flex: 2 }}
            />
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
            >
              <option value="USD">USD</option>
              <option value="UYU">UYU</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
          {kind === "fijo" ? (
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
                placeholder="Desde"
              />
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
                placeholder="Hasta (opcional)"
              />
            </div>
          ) : (
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={inputStyle}
              placeholder="Fecha"
            />
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={save} disabled={saving} style={solidBtn}>
              {saving
                ? "Guardando…"
                : isEditing
                  ? "Guardar cambios"
                  : "Guardar"}
            </button>
            <button onClick={resetAndClose} disabled={saving} style={ghostBtn}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// STYLES
// ============================================================
const h1Style: React.CSSProperties = {
  fontSize: 36,
  fontWeight: 700,
  letterSpacing: "-0.025em",
  lineHeight: 1,
  marginBottom: 12,
};

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid rgba(10,26,12,0.15)",
  background: "var(--white)",
  color: "var(--deep-green)",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
};

const solidBtn: React.CSSProperties = {
  background: "var(--deep-green)",
  color: "var(--off-white)",
  border: "none",
  padding: "8px 16px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
  letterSpacing: "0.05em",
};

const ghostBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid rgba(10,26,12,0.15)",
  color: "var(--deep-green)",
  padding: "8px 16px",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "inherit",
};

// ============================================================
// KPIsViewV2 — KPIs anuales con gráficas + concentración + reportes
// ============================================================

const CHART_COLORS = [
  "#0A1A0C",
  "#9B8259",
  "#C4A882",
  "#3A8B5C",
  "#2E5D45",
  "#5A6A5E",
  "#B04B3A",
  "#1E3A28",
  "#7A8A7E",
];

export function KPIsViewV2({
  mrr,
  clients,
  expenses,
  payments,
  manualRevs,
  marginPct,
  pipelineValue,
  leads,
}: {
  mrr: number;
  clients: Client[];
  expenses: Expense[];
  payments: InvoicePayment[];
  manualRevs: ManualRevenue[];
  marginPct: number;
  pipelineValue: number;
  leads: Lead[];
}) {
  const targetARR = 300_000; // configurable a futuro
  const arr = mrr * 12;
  const arrPct = Math.round((arr / targetARR) * 100);

  // Cobranza del mes en curso
  const monthYYYYMM = new Date().toISOString().slice(0, 7);
  const collectedThisMonth = useMemo(() => {
    return clients.reduce((s, c) => {
      const p = payments.find(
        (p) => p.clientId === c.id && p.month === monthYYYYMM,
      );
      return s + (p?.status === "paid" ? c.fee : 0);
    }, 0);
  }, [clients, payments, monthYYYYMM]);

  // Pipeline conversion (proxy: cerrados / total leads)
  const leadsClosed = leads.filter((l) => l.stage === "cerrado").length;
  const conversionPct =
    leads.length > 0 ? Math.round((leadsClosed / leads.length) * 100) : 0;

  // === Composición del MRR por cliente ===
  const mrrComposition = useMemo(() => {
    return [...clients]
      .map((c) => ({
        name: c.name,
        value: c.fee,
        pct: mrr > 0 ? (c.fee / mrr) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [clients, mrr]);

  // === Concentración: % del top 1 y top 3 ===
  const topClient = mrrComposition[0];
  const top3Share = mrrComposition
    .slice(0, 3)
    .reduce((s, c) => s + c.pct, 0);

  // === Ingresos vs Egresos por mes (últimos 6 meses, basados en payments + manual revs + expenses) ===
  const monthlyData = useMemo(() => {
    const out: {
      month: string;
      label: string;
      ingresos: number;
      egresos: number;
      neto: number;
    }[] = [];
    const today = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const ym = d.toISOString().slice(0, 7);
      const label = d.toLocaleDateString("es-AR", {
        month: "short",
        year: "2-digit",
      });

      // Ingresos = fees cobrados ese mes + manual revenues que aplican
      const feesCobrados = clients.reduce((s, c) => {
        const p = payments.find((p) => p.clientId === c.id && p.month === ym);
        return s + (p?.status === "paid" ? c.fee : 0);
      }, 0);
      const manualImpact = manualRevs.reduce(
        (s, r) => s + revenueMonthlyImpact(r, ym),
        0,
      );
      const ingresos = feesCobrados + manualImpact;

      // Egresos = gastos con date YYYY-MM
      const egresos = expenses
        .filter((e) => (e.date ?? "").startsWith(ym))
        .reduce((s, e) => s + e.amount, 0);

      out.push({
        month: ym,
        label,
        ingresos,
        egresos,
        neto: ingresos - egresos,
      });
    }
    return out;
  }, [clients, payments, manualRevs, expenses]);

  // KPI cards principales
  const kpis = [
    {
      label: "MRR",
      value: `US$ ${mrr.toLocaleString()}`,
      sub: `${clients.length} clientes activos`,
    },
    {
      label: "ARR",
      value: `US$ ${arr.toLocaleString()}`,
      sub: `${arrPct}% del objetivo (US$ ${targetARR.toLocaleString()})`,
    },
    {
      label: "Cobrado este mes",
      value: `US$ ${collectedThisMonth.toLocaleString()}`,
      sub: `de US$ ${mrr.toLocaleString()} facturados`,
    },
    {
      label: "Margen neto (mes)",
      value: `${marginPct}%`,
      sub: marginPct >= 50 ? "saludable" : "atención",
    },
    {
      label: "Pipeline",
      value: `US$ ${pipelineValue.toLocaleString()}`,
      sub: `${leads.length} leads · ${conversionPct}% conv`,
    },
    {
      label: "Concentración top 1",
      value: topClient ? `${topClient.pct.toFixed(1)}%` : "—",
      sub: topClient ? topClient.name : "Sin clientes",
    },
  ];

  return (
    <>
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--sand-dark)",
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        Finanzas · KPIs anuales
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginBottom: 28,
        }}
      >
        <h1 style={h1Style}>KPIs {new Date().getFullYear()}</h1>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => window.print()}
            style={{
              ...ghostBtn,
              padding: "10px 16px",
            }}
            title="Imprimir / exportar como PDF"
          >
            ↓ Imprimir reporte
          </button>
        </div>
      </div>

      {/* ===== KPI cards (6 chiquitos) ===== */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 0,
          border: "1px solid rgba(10,26,12,0.08)",
          marginBottom: 32,
          background: "var(--white)",
        }}
      >
        {kpis.map((k, i) => (
          <div
            key={k.label}
            style={{
              padding: "22px 24px",
              borderRight:
                i < kpis.length - 1
                  ? "1px solid rgba(10,26,12,0.08)"
                  : "none",
              borderBottom: "1px solid rgba(10,26,12,0.08)",
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--sand-dark)",
                fontWeight: 700,
                marginBottom: 10,
              }}
            >
              {k.label}
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: "var(--deep-green)",
                letterSpacing: "-0.02em",
                marginBottom: 4,
              }}
            >
              {k.value}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {k.sub}
            </div>
          </div>
        ))}
      </div>

      {/* ===== Composición del MRR (pie + tabla) ===== */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
          marginBottom: 32,
        }}
      >
        <div className={styles.table} style={{ margin: 0 }}>
          <h3>Composición del MRR por cliente</h3>
          {mrrComposition.length === 0 ? (
            <div style={{ padding: 20, color: "var(--text-muted)", fontSize: 13 }}>
              Sin clientes para graficar.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={mrrComposition}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={(entry) => {
                    const p =
                      typeof (entry as { percent?: number }).percent === "number"
                        ? ((entry as { percent: number }).percent * 100).toFixed(0)
                        : "";
                    return `${p}%`;
                  }}
                  labelLine={false}
                >
                  {mrrComposition.map((_, idx) => (
                    <Cell
                      key={idx}
                      fill={CHART_COLORS[idx % CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number, _name, props) => [
                    `US$ ${v.toLocaleString()} (${(
                      props.payload as { pct: number }
                    ).pct.toFixed(1)}%)`,
                    props.payload?.name,
                  ]}
                />
                <Legend
                  layout="vertical"
                  align="right"
                  verticalAlign="middle"
                  iconType="square"
                  wrapperStyle={{ fontSize: 11 }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className={styles.table} style={{ margin: 0 }}>
          <h3>Top clientes por fee</h3>
          {mrrComposition.slice(0, 8).map((c, i) => (
            <div
              key={c.name}
              className={styles.row}
              style={{ gridTemplateColumns: "30px 2fr 1fr 60px" }}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  background: CHART_COLORS[i % CHART_COLORS.length],
                }}
              />
              <div>{c.name}</div>
              <div className={`${styles.num} ${styles.pos}`}>
                US$ {c.value.toLocaleString()}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  textAlign: "right",
                }}
              >
                {c.pct.toFixed(1)}%
              </div>
            </div>
          ))}
          {top3Share > 50 && (
            <div
              style={{
                marginTop: 14,
                padding: "10px 14px",
                background: "rgba(176,75,58,0.08)",
                borderLeft: "3px solid var(--red-warn)",
                fontSize: 12,
                color: "var(--text-soft, #5a6a5e)",
                lineHeight: 1.5,
              }}
            >
              <strong style={{ color: "var(--red-warn)" }}>
                ⚠ Alta concentración
              </strong>
              <br />
              Top 3 clientes = <strong>{top3Share.toFixed(0)}%</strong> del
              MRR. Riesgo si alguno se va.
            </div>
          )}
        </div>
      </div>

      {/* ===== Ingresos vs Egresos (bar chart 6 meses) ===== */}
      <div className={styles.table}>
        <h3>Ingresos vs Egresos · últimos 6 meses</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={monthlyData}>
            <XAxis dataKey="label" stroke="#5A6A5E" fontSize={11} />
            <YAxis
              stroke="#5A6A5E"
              fontSize={11}
              tickFormatter={(v) =>
                v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
              }
            />
            <Tooltip
              formatter={(v: number) => `US$ ${v.toLocaleString()}`}
              cursor={{ fill: "rgba(10,26,12,0.04)" }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="square" />
            <Bar dataKey="ingresos" fill="#3A8B5C" name="Ingresos" />
            <Bar dataKey="egresos" fill="#B04B3A" name="Egresos" />
            <Bar dataKey="neto" fill="#0A1A0C" name="Neto" />
          </BarChart>
        </ResponsiveContainer>
        <div
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            gap: 8,
            fontSize: 11,
            color: "var(--text-muted)",
          }}
        >
          {monthlyData.map((m) => (
            <div
              key={m.month}
              style={{
                textAlign: "center",
                padding: 8,
                background: "var(--off-white)",
              }}
            >
              <div style={{ fontWeight: 600, color: "var(--deep-green)" }}>
                {m.label}
              </div>
              <div
                style={{
                  marginTop: 4,
                  color: m.neto >= 0 ? "var(--green-ok)" : "var(--red-warn)",
                  fontWeight: 600,
                }}
              >
                {m.neto >= 0 ? "+" : ""}US$ {m.neto.toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ===== Pipeline detail ===== */}
      <div className={styles.table}>
        <h3>Pipeline comercial</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 16,
          }}
        >
          {(
            [
              ["prospecto", "Prospectos"],
              ["contacto", "En contacto"],
              ["propuesta", "Con propuesta"],
              ["negociacion", "Negociando"],
              ["cerrado", "Cerrados"],
            ] as const
          ).map(([stage, label]) => {
            const count = leads.filter((l) => l.stage === stage).length;
            const value = leads
              .filter((l) => l.stage === stage)
              .reduce((s, l) => s + l.value, 0);
            return (
              <div
                key={stage}
                style={{
                  padding: 14,
                  background: "var(--off-white)",
                  borderLeft: "3px solid var(--sand)",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    color: "var(--sand-dark)",
                    fontWeight: 700,
                    marginBottom: 4,
                  }}
                >
                  {label}
                </div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: "var(--deep-green)",
                  }}
                >
                  {count}
                </div>
                <div
                  style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}
                >
                  US$ {value.toLocaleString()}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
