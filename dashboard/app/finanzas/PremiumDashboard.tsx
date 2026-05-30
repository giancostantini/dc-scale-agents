"use client";

/**
 * Panel principal premium — matchea el mockup pasado por el director:
 *
 * Layout exacto:
 *   Header: "Dashboard Financiero" + selector de período (top-right)
 *   Row 1: 4 KPI cards (Ingresos Totales · Gastos Totales · Resultado
 *          Neto · Margen de Ganancia) con delta vs año anterior
 *   Row 2 (2/3 + 1/3):
 *     - Evolución Ingresos y Gastos (bar + line) por mes del período
 *     - Distribución de Gastos (donut con legend lateral derecha)
 *   Row 3 (1/2 + 1/2):
 *     - Flujo de Caja (line chart con dropdown mensual)
 *     - Resumen Financiero (tabla Concepto / Actual / Año Anterior /
 *       Variación)
 */

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  DollarSign,
  Percent,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  effectiveFeeForMonth,
  getExpenses,
  getPayments,
  getClients,
  getLeads,
  listFeeSchedules,
} from "@/lib/storage";
import {
  listManualRevenues,
  revenueMonthlyImpact,
  type ManualRevenue,
} from "@/lib/finanzas";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/types";
import type {
  Client,
  ClientFeeSchedule,
  Expense,
  ExpenseCategory,
  InvoicePayment,
  Lead,
} from "@/lib/types";
import { Select } from "@/components/premium/Field";
import { cn } from "@/lib/cn";

const MONTHS_SHORT_ES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

/**
 * Paleta azul-corporativa para el donut (matchea el mockup que usa
 * gradiente azul). Mantengo deep-green/ink como acentos premium.
 */
const CATEGORY_COLORS: Record<string, string> = {
  equipo: "#1E3A8A",        // blue-900
  tools: "#3B82F6",         // blue-500
  ia: "#60A5FA",            // blue-400
  produccion: "#93C5FD",    // blue-300
  impuestos: "#1E40AF",     // blue-800
  mkt_interno: "#2563EB",   // blue-600
  otros: "#BFDBFE",         // blue-200
};

type PeriodMode = "this_year" | "last_year" | "last_12m" | "ytd" | "custom";

interface PeriodRange {
  from: string; // YYYY-MM
  to: string;   // YYYY-MM
  label: string;
}

function formatUsd(n: number, opts?: { compact?: boolean }) {
  if (opts?.compact && Math.abs(n) >= 1_000_000) {
    return `$ ${(n / 1_000_000).toFixed(1)}M`;
  }
  if (opts?.compact && Math.abs(n) >= 1_000) {
    return `$ ${(n / 1_000).toFixed(0)}K`;
  }
  return `$ ${Math.round(n).toLocaleString("es-AR")}`;
}

export function PremiumDashboard() {
  const [clients, setClients] = useState<Client[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<InvoicePayment[]>([]);
  const [manualRevs, setManualRevs] = useState<ManualRevenue[]>([]);
  const [_leads, setLeads] = useState<Lead[]>([]);
  const [feeSchedules, setFeeSchedules] = useState<ClientFeeSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  // === Filtros ===
  const [periodMode, setPeriodMode] = useState<PeriodMode>("this_year");
  const [customFrom, setCustomFrom] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-01`;
  });
  const [customTo, setCustomTo] = useState<string>(() =>
    new Date().toISOString().slice(0, 7),
  );

  useEffect(() => {
    Promise.all([
      getClients(),
      getExpenses(),
      getPayments(),
      listManualRevenues(),
      getLeads(),
      listFeeSchedules(),
    ]).then(([c, e, p, m, l, fs]) => {
      setClients(c);
      setExpenses(e);
      setPayments(p);
      setManualRevs(m);
      setLeads(l);
      setFeeSchedules(fs);
      setLoading(false);
    });
  }, []);

  // Resolver período actual + período comparativo (año anterior)
  const period: PeriodRange = useMemo(() => {
    const now = new Date();
    if (periodMode === "this_year") {
      return {
        from: `${now.getFullYear()}-01`,
        to: `${now.getFullYear()}-12`,
        label: `01/01/${now.getFullYear()} - 31/12/${now.getFullYear()}`,
      };
    }
    if (periodMode === "last_year") {
      const y = now.getFullYear() - 1;
      return {
        from: `${y}-01`,
        to: `${y}-12`,
        label: `01/01/${y} - 31/12/${y}`,
      };
    }
    if (periodMode === "last_12m") {
      const d = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      return {
        from: d.toISOString().slice(0, 7),
        to: now.toISOString().slice(0, 7),
        label: `Últimos 12 meses`,
      };
    }
    if (periodMode === "ytd") {
      return {
        from: `${now.getFullYear()}-01`,
        to: now.toISOString().slice(0, 7),
        label: `YTD ${now.getFullYear()}`,
      };
    }
    // custom
    return {
      from: customFrom,
      to: customTo,
      label: `${customFrom} → ${customTo}`,
    };
  }, [periodMode, customFrom, customTo]);

  // Período comparativo: mismo rango pero 1 año atrás
  const comparison: PeriodRange = useMemo(() => {
    function shift(yyyymm: string, years: number): string {
      const [y, m] = yyyymm.split("-").map(Number);
      return `${y + years}-${String(m).padStart(2, "0")}`;
    }
    return {
      from: shift(period.from, -1),
      to: shift(period.to, -1),
      label: `${shift(period.from, -1)} → ${shift(period.to, -1)}`,
    };
  }, [period.from, period.to]);

  // ===== Cálculos por mes =====
  function netOfMonth(mk: string) {
    const feesPaid = clients.reduce((s, c) => {
      const p = payments.find(
        (pp) => pp.clientId === c.id && pp.month === mk,
      );
      if (p?.status !== "paid") return s;
      const scheduled = effectiveFeeForMonth(feeSchedules, c.id, mk);
      return s + (p.amountOverride ?? scheduled ?? c.fee);
    }, 0);
    const mImpact = manualRevs.reduce(
      (s, r) => s + revenueMonthlyImpact(r, mk),
      0,
    );
    const mExp = expenses
      .filter((e) => e.date?.startsWith(mk) && e.status !== "cancelled")
      .reduce((s, e) => s + e.amount, 0);
    return {
      ingresos: feesPaid + mImpact,
      egresos: mExp,
      net: feesPaid + mImpact - mExp,
    };
  }

  /** Itera todos los meses YYYY-MM entre from y to inclusive. */
  function monthsBetween(from: string, to: string): string[] {
    const out: string[] = [];
    const [fy, fm] = from.split("-").map(Number);
    const [ty, tm] = to.split("-").map(Number);
    let y = fy;
    let m = fm;
    while (y < ty || (y === ty && m <= tm)) {
      out.push(`${y}-${String(m).padStart(2, "0")}`);
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }
    return out;
  }

  // ===== Stats del período actual y comparativo =====
  const periodMonths = monthsBetween(period.from, period.to);
  const periodStats = periodMonths.reduce(
    (acc, mk) => {
      const v = netOfMonth(mk);
      acc.ingresos += v.ingresos;
      acc.egresos += v.egresos;
      acc.net += v.net;
      return acc;
    },
    { ingresos: 0, egresos: 0, net: 0 },
  );
  const periodMargin =
    periodStats.ingresos > 0
      ? (periodStats.net / periodStats.ingresos) * 100
      : 0;

  const comparisonMonths = monthsBetween(comparison.from, comparison.to);
  const comparisonStats = comparisonMonths.reduce(
    (acc, mk) => {
      const v = netOfMonth(mk);
      acc.ingresos += v.ingresos;
      acc.egresos += v.egresos;
      acc.net += v.net;
      return acc;
    },
    { ingresos: 0, egresos: 0, net: 0 },
  );
  const comparisonMargin =
    comparisonStats.ingresos > 0
      ? (comparisonStats.net / comparisonStats.ingresos) * 100
      : 0;

  function pct(a: number, b: number): number | null {
    if (b === 0) return a === 0 ? 0 : null;
    return ((a - b) / Math.abs(b)) * 100;
  }

  const kpis = {
    ingresos: periodStats.ingresos,
    ingresosDelta: pct(periodStats.ingresos, comparisonStats.ingresos),
    egresos: periodStats.egresos,
    egresosDelta: pct(periodStats.egresos, comparisonStats.egresos),
    net: periodStats.net,
    netDelta: pct(periodStats.net, comparisonStats.net),
    margin: periodMargin,
    marginDelta: periodMargin - comparisonMargin,
  };

  // ===== Chart 1: evolución mensual del período =====
  const evolutionData = periodMonths.map((mk) => {
    const v = netOfMonth(mk);
    const [_, m] = mk.split("-").map(Number);
    return {
      mk,
      label: MONTHS_SHORT_ES[m - 1],
      ingresos: v.ingresos,
      egresos: v.egresos,
      net: v.net,
    };
  });

  // ===== Chart 2: distribución de gastos del período =====
  const expenseByCategory = useMemo(() => {
    const byCat: Record<string, number> = {};
    const fromDate = `${period.from}-01`;
    const toDate = `${period.to}-31`;
    for (const e of expenses) {
      if (!e.date) continue;
      if (e.date < fromDate || e.date > toDate) continue;
      byCat[e.category] = (byCat[e.category] ?? 0) + e.amount;
    }
    const totalExp = Object.values(byCat).reduce((s, v) => s + v, 0);
    return (Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[])
      .map((k) => ({
        key: k,
        name: EXPENSE_CATEGORY_LABEL[k],
        value: byCat[k] ?? 0,
        pct: totalExp > 0 ? ((byCat[k] ?? 0) / totalExp) * 100 : 0,
        color: CATEGORY_COLORS[k] ?? "#7A8A7E",
      }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [expenses, period.from, period.to]);

  // ===== Chart 3: flujo de caja (resultado neto por mes) =====
  const cashflowData = evolutionData.map((d) => ({
    label: d.label,
    flujo: d.net,
  }));

  // ===== Tabla resumen financiero =====
  const summaryRows = [
    {
      concept: "Ingresos",
      actual: kpis.ingresos,
      previous: comparisonStats.ingresos,
      delta: kpis.ingresosDelta,
      goodIfUp: true,
    },
    {
      concept: "Gastos",
      actual: kpis.egresos,
      previous: comparisonStats.egresos,
      delta: kpis.egresosDelta,
      goodIfUp: false,
    },
    {
      concept: "Resultado Neto",
      actual: kpis.net,
      previous: comparisonStats.net,
      delta: kpis.netDelta,
      goodIfUp: true,
    },
    {
      concept: "Margen de Ganancia",
      actual: periodMargin,
      previous: comparisonMargin,
      delta: kpis.marginDelta,
      goodIfUp: true,
      isPercent: true,
    },
  ];

  return (
    <div className="space-y-6">
      {/* ===== Header ===== */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-ink tracking-tight">
            Dashboard Financiero
          </h1>
        </div>
        <PeriodSelector
          mode={periodMode}
          onModeChange={setPeriodMode}
          customFrom={customFrom}
          customTo={customTo}
          onCustomChange={(from, to) => {
            setCustomFrom(from);
            setCustomTo(to);
          }}
          label={period.label}
        />
      </div>

      {/* ===== Row 1: KPIs ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <BigKpiCard
          label="Ingresos Totales"
          value={formatUsd(kpis.ingresos)}
          delta={kpis.ingresosDelta}
          positiveIsGood
          subLabel="vs. año anterior"
          icon={<DollarSign className="w-4 h-4" />}
          loading={loading}
        />
        <BigKpiCard
          label="Gastos Totales"
          value={formatUsd(kpis.egresos)}
          delta={kpis.egresosDelta}
          positiveIsGood={false}
          subLabel="vs. año anterior"
          icon={<TrendingDown className="w-4 h-4" />}
          loading={loading}
        />
        <BigKpiCard
          label="Resultado Neto"
          value={formatUsd(kpis.net)}
          delta={kpis.netDelta}
          positiveIsGood
          subLabel="vs. año anterior"
          icon={<TrendingUp className="w-4 h-4" />}
          loading={loading}
        />
        <BigKpiCard
          label="Margen de Ganancia"
          value={`${kpis.margin.toFixed(1)}%`}
          delta={kpis.marginDelta}
          positiveIsGood
          subLabel="vs. año anterior"
          icon={<Percent className="w-4 h-4" />}
          loading={loading}
          isPercentDelta
        />
      </div>

      {/* ===== Row 2: Evolución + Distribución de gastos ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Evolución bar + line (2/3 cols) */}
        <div className="lg:col-span-2 bg-paper border border-rule rounded-premium shadow-premium-xs">
          <div className="px-5 py-4 border-b border-rule flex items-center justify-between">
            <div className="font-semibold text-ink text-md">
              Evolución de Ingresos y Gastos
            </div>
            <div className="flex items-center gap-3 text-2xs">
              <LegendDot color="#3B82F6" label="Ingresos" filled />
              <LegendDot color="#BFDBFE" label="Gastos" filled />
              <LegendDot color="#16C75A" label="Resultado Neto" line />
            </div>
          </div>
          <div className="p-4">
            {loading ? (
              <div className="h-72 skeleton" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart
                  data={evolutionData}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <XAxis
                    dataKey="label"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    stroke="#7A8A7E"
                  />
                  <YAxis
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    stroke="#7A8A7E"
                    tickFormatter={(v: number) =>
                      v >= 1_000_000
                        ? `${(v / 1_000_000).toFixed(0)}M`
                        : v >= 1_000
                          ? `${(v / 1_000).toFixed(0)}k`
                          : String(v)
                    }
                  />
                  <Tooltip
                    formatter={(v: number) => formatUsd(v)}
                    contentStyle={{
                      background: "#0A1A0C",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "#fff",
                    }}
                  />
                  <Bar
                    dataKey="ingresos"
                    name="Ingresos"
                    fill="#3B82F6"
                    radius={[3, 3, 0, 0]}
                  />
                  <Bar
                    dataKey="egresos"
                    name="Gastos"
                    fill="#BFDBFE"
                    radius={[3, 3, 0, 0]}
                  />
                  <Line
                    type="monotone"
                    dataKey="net"
                    name="Resultado Neto"
                    stroke="#16C75A"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "#16C75A", strokeWidth: 0 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Donut con legend lateral derecha (1/3 col) */}
        <div className="bg-paper border border-rule rounded-premium shadow-premium-xs">
          <div className="px-5 py-4 border-b border-rule">
            <div className="font-semibold text-ink text-md">
              Distribución de Gastos
            </div>
          </div>
          <div className="p-4 flex items-center gap-3">
            {loading || expenseByCategory.length === 0 ? (
              <div className="w-full h-56 skeleton" />
            ) : (
              <>
                <div className="relative shrink-0">
                  <ResponsiveContainer width={180} height={180}>
                    <PieChart>
                      <Pie
                        data={expenseByCategory}
                        dataKey="value"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={1.5}
                        startAngle={90}
                        endAngle={-270}
                      >
                        {expenseByCategory.map((d) => (
                          <Cell key={d.key} fill={d.color} stroke="none" />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Total centered */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <div className="text-md font-semibold text-ink">
                      {formatUsd(
                        expenseByCategory.reduce((s, d) => s + d.value, 0),
                        { compact: true },
                      )}
                    </div>
                    <div className="text-2xs text-ink-300">Total</div>
                  </div>
                </div>
                <div className="flex-1 space-y-2 text-xs">
                  {expenseByCategory.map((d) => (
                    <div
                      key={d.key}
                      className="flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: d.color }}
                        />
                        <span className="text-ink truncate">{d.name}</span>
                      </div>
                      <span className="text-ink-400 tabular-nums shrink-0">
                        {d.pct.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ===== Row 3: Flujo de Caja + Resumen Financiero ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Flujo de Caja */}
        <div className="bg-paper border border-rule rounded-premium shadow-premium-xs">
          <div className="px-5 py-4 border-b border-rule flex items-center justify-between">
            <div className="font-semibold text-ink text-md">Flujo de Caja</div>
            <Select
              defaultValue="mensual"
              className="!h-7 !text-xs !w-28"
              disabled
            >
              <option value="mensual">Mensual</option>
            </Select>
          </div>
          <div className="p-4">
            {loading ? (
              <div className="h-56 skeleton" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart
                  data={cashflowData}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <XAxis
                    dataKey="label"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    stroke="#7A8A7E"
                  />
                  <YAxis
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    stroke="#7A8A7E"
                    tickFormatter={(v: number) =>
                      v >= 1_000_000
                        ? `${(v / 1_000_000).toFixed(0)}M`
                        : v >= 1_000
                          ? `${(v / 1_000).toFixed(0)}k`
                          : v <= -1_000
                            ? `${(v / 1_000).toFixed(0)}k`
                            : String(v)
                    }
                  />
                  <Tooltip
                    formatter={(v: number) => formatUsd(v)}
                    contentStyle={{
                      background: "#0A1A0C",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "#fff",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="flujo"
                    stroke="#3B82F6"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: "#3B82F6", strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Resumen Financiero */}
        <div className="bg-paper border border-rule rounded-premium shadow-premium-xs">
          <div className="px-5 py-4 border-b border-rule">
            <div className="font-semibold text-ink text-md">
              Resumen Financiero
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-paper-100/60 border-b border-rule">
                  <th className="text-left px-5 py-2.5 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">
                    Concepto
                  </th>
                  <th className="text-right px-5 py-2.5 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">
                    Actual
                  </th>
                  <th className="text-right px-5 py-2.5 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">
                    Año Anterior
                  </th>
                  <th className="text-right px-5 py-2.5 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">
                    Variación
                  </th>
                </tr>
              </thead>
              <tbody>
                {summaryRows.map((r) => {
                  const showDelta = r.delta != null;
                  const isGood = showDelta
                    ? r.goodIfUp
                      ? (r.delta ?? 0) >= 0
                      : (r.delta ?? 0) <= 0
                    : null;
                  return (
                    <tr
                      key={r.concept}
                      className="border-b border-rule-soft last:border-b-0"
                    >
                      <td className="px-5 py-3 text-ink">{r.concept}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-ink font-medium">
                        {r.isPercent
                          ? `${r.actual.toFixed(1)}%`
                          : formatUsd(r.actual)}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-ink-400">
                        {r.isPercent
                          ? `${r.previous.toFixed(1)}%`
                          : formatUsd(r.previous)}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {showDelta ? (
                          <span
                            className={cn(
                              "font-semibold inline-flex items-center gap-0.5",
                              isGood ? "text-success" : "text-danger",
                            )}
                          >
                            {(r.delta ?? 0) >= 0 ? (
                              <ArrowUp className="w-3 h-3" />
                            ) : (
                              <ArrowDown className="w-3 h-3" />
                            )}
                            {Math.abs(r.delta ?? 0).toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-ink-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-xs text-ink-300 pt-2">
        © {new Date().getFullYear()} DEARMAS COSTANTINI · Todos los derechos
        reservados.
      </div>
    </div>
  );
}

// ============================================================
// KPI Card grande (matchea mockup)
// ============================================================
function BigKpiCard({
  label,
  value,
  delta,
  positiveIsGood = true,
  subLabel,
  icon,
  loading,
  isPercentDelta,
}: {
  label: string;
  value: string;
  delta?: number | null;
  positiveIsGood?: boolean;
  subLabel?: string;
  icon?: React.ReactNode;
  loading?: boolean;
  /** Si true, el delta se muestra como puntos % en vez de %. */
  isPercentDelta?: boolean;
}) {
  const showDelta = delta != null && !Number.isNaN(delta);
  const isGood = showDelta
    ? positiveIsGood
      ? (delta ?? 0) >= 0
      : (delta ?? 0) <= 0
    : null;
  return (
    <div className="bg-paper border border-rule rounded-premium shadow-premium-xs p-5">
      <div className="flex items-start justify-between">
        <div className="text-xs text-ink-400 font-medium">{label}</div>
        <div className="text-ink-300 bg-paper-200 rounded-full w-7 h-7 flex items-center justify-center">
          {icon}
        </div>
      </div>
      {loading ? (
        <>
          <div className="skeleton h-8 w-40 mt-3" />
          <div className="skeleton h-3 w-24 mt-2" />
        </>
      ) : (
        <>
          <div className="mt-3 text-3xl font-semibold tracking-tight tabular-nums text-ink">
            {value}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-xs">
            {showDelta && (
              <span
                className={cn(
                  "font-semibold",
                  isGood ? "text-success" : "text-danger",
                )}
              >
                {(delta ?? 0) >= 0 ? "+" : ""}
                {(delta ?? 0).toFixed(1)}
                {isPercentDelta ? " pp" : "%"}
              </span>
            )}
            {subLabel && <span className="text-ink-300">{subLabel}</span>}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// Selector de período (top-right del header)
// ============================================================
function PeriodSelector({
  mode,
  onModeChange,
  customFrom,
  customTo,
  onCustomChange,
  label,
}: {
  mode: PeriodMode;
  onModeChange: (m: PeriodMode) => void;
  customFrom: string;
  customTo: string;
  onCustomChange: (from: string, to: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 px-3 h-8 text-xs text-ink-500 bg-paper border border-rule rounded-premium-sm hover:border-rule-strong transition-colors"
      >
        <Calendar className="w-3.5 h-3.5 text-ink-300" />
        <span className="font-medium">{label}</span>
        <svg className="w-3 h-3 text-ink-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full mt-1 z-50 w-80 bg-paper border border-rule rounded-premium shadow-premium-md p-3 animate-fade-in">
            <div className="text-2xs uppercase tracking-wider text-ink-300 font-semibold mb-2">
              Rango rápido
            </div>
            <div className="grid grid-cols-2 gap-1.5 mb-3">
              {([
                ["this_year", "Este año"],
                ["last_year", "Año anterior"],
                ["last_12m", "Últimos 12 meses"],
                ["ytd", "Año a la fecha"],
              ] as [PeriodMode, string][]).map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => {
                    onModeChange(k);
                    setOpen(false);
                  }}
                  className={cn(
                    "px-2.5 py-1.5 text-xs rounded-premium-sm border transition-colors",
                    mode === k
                      ? "bg-ink text-paper border-ink"
                      : "bg-paper border-rule text-ink hover:border-rule-strong",
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="text-2xs uppercase tracking-wider text-ink-300 font-semibold mb-2">
              Rango personalizado
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <div className="text-2xs text-ink-300 mb-1">Desde</div>
                <input
                  type="month"
                  value={customFrom}
                  onChange={(e) => onCustomChange(e.target.value, customTo)}
                  className="w-full px-2 h-8 text-xs bg-paper border border-rule rounded-premium-sm focus:outline-none focus:border-ink-300"
                />
              </div>
              <div>
                <div className="text-2xs text-ink-300 mb-1">Hasta</div>
                <input
                  type="month"
                  value={customTo}
                  onChange={(e) => onCustomChange(customFrom, e.target.value)}
                  className="w-full px-2 h-8 text-xs bg-paper border border-rule rounded-premium-sm focus:outline-none focus:border-ink-300"
                />
              </div>
            </div>
            <button
              onClick={() => {
                onModeChange("custom");
                setOpen(false);
              }}
              className="w-full px-3 h-8 text-xs font-medium bg-ink text-paper rounded-premium-sm hover:bg-ink-800 transition-colors"
            >
              Aplicar rango personalizado
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function LegendDot({
  color,
  label,
  filled,
  line,
}: {
  color: string;
  label: string;
  filled?: boolean;
  line?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 text-ink-400">
      {line ? (
        <span
          className="w-3 h-0.5 rounded-full"
          style={{ background: color }}
        />
      ) : (
        <span
          className={cn(
            "w-2 h-2 rounded-sm",
            filled ? "" : "border-2",
          )}
          style={
            filled
              ? { background: color }
              : { borderColor: color }
          }
        />
      )}
      <span>{label}</span>
    </div>
  );
}
