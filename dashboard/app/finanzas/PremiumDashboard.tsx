"use client";

/**
 * Panel principal premium estilo Mercury / Ramp.
 *
 * Layout (matchea mockup del director):
 * - Header con eyebrow + título + selector de rango (todavía estático)
 * - Row 1: 4 KPI cards (Ingresos · Gastos · Resultado · Margen)
 * - Row 2: 2 cards grandes (gráfico ingresos+egresos line, donut gastos)
 * - Row 3: lista de últimos movimientos
 */

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { KpiCard } from "@/components/premium/KpiCard";
import { Pill } from "@/components/premium/Pill";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/premium/Card";
import {
  getExpenses,
  getPayments,
  getClients,
  getLeads,
} from "@/lib/storage";
import {
  listManualRevenues,
  revenueMonthlyImpact,
  type ManualRevenue,
} from "@/lib/finanzas";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/types";
import type {
  Client,
  Expense,
  ExpenseCategory,
  InvoicePayment,
  Lead,
} from "@/lib/types";

const MONTHS_SHORT_ES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

const CATEGORY_COLORS: Record<string, string> = {
  equipo: "#0A1A0C",
  tools: "#C4A882",
  ia: "#9B8259",
  produccion: "#3A8B5C",
  impuestos: "#B04B3A",
  mkt_interno: "#16C75A",
  otros: "#7A8A7E",
};

export function PremiumDashboard() {
  const [clients, setClients] = useState<Client[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<InvoicePayment[]>([]);
  const [manualRevs, setManualRevs] = useState<ManualRevenue[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getClients(),
      getExpenses(),
      getPayments(),
      listManualRevenues(),
      getLeads(),
    ]).then(([c, e, p, m, l]) => {
      setClients(c);
      setExpenses(e);
      setPayments(p);
      setManualRevs(m);
      setLeads(l);
      setLoading(false);
    });
  }, []);

  // ===== Cálculos =====
  const now = new Date();
  const curMonth = now.toISOString().slice(0, 7);
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth = prevDate.toISOString().slice(0, 7);

  function netOfMonth(mk: string) {
    const feesPaid = clients.reduce((s, c) => {
      const p = payments.find(
        (pp) => pp.clientId === c.id && pp.month === mk,
      );
      if (p?.status !== "paid") return s;
      return s + (p.amountOverride ?? c.fee);
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

  const cur = netOfMonth(curMonth);
  const prev = netOfMonth(prevMonth);

  function pct(a: number, b: number): number | null {
    if (b === 0) return null;
    return ((a - b) / Math.abs(b)) * 100;
  }

  const stats = {
    ingresos: cur.ingresos,
    ingresosDelta: pct(cur.ingresos, prev.ingresos),
    egresos: cur.egresos,
    egresosDelta: pct(cur.egresos, prev.egresos),
    net: cur.net,
    netDelta: pct(cur.net, prev.net),
    margin:
      cur.ingresos > 0 ? Math.round((cur.net / cur.ingresos) * 100) : 0,
  };

  // Últimos 12 meses para el chart
  const last12 = useMemo(() => {
    const out: {
      mk: string;
      label: string;
      ingresos: number;
      egresos: number;
      net: number;
    }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mk = d.toISOString().slice(0, 7);
      const v = netOfMonth(mk);
      out.push({
        mk,
        label: MONTHS_SHORT_ES[d.getMonth()],
        ingresos: v.ingresos,
        egresos: v.egresos,
        net: v.net,
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, expenses, payments, manualRevs]);

  // Egresos por categoría (mes corriente)
  const expenseByCategory = useMemo(() => {
    const byCat: Record<string, number> = {};
    for (const e of expenses.filter((e) => e.date?.startsWith(curMonth))) {
      byCat[e.category] = (byCat[e.category] ?? 0) + e.amount;
    }
    return (Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[])
      .map((k) => ({
        key: k,
        name: EXPENSE_CATEGORY_LABEL[k],
        value: byCat[k] ?? 0,
        color: CATEGORY_COLORS[k] ?? "#7A8A7E",
      }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, curMonth]);

  // Últimos movimientos (top 6 cronológicos)
  const recentMovements = useMemo(() => {
    type Move = {
      id: string;
      date: string;
      kind: "ingreso" | "egreso";
      title: string;
      amount: number;
    };
    const moves: Move[] = [];
    for (const e of expenses) {
      moves.push({
        id: `e-${e.id}`,
        date: e.date,
        kind: "egreso",
        title: e.concept,
        amount: e.amount,
      });
    }
    for (const r of manualRevs) {
      if (r.kind === "one_time" && r.date) {
        moves.push({
          id: `r-${r.id}`,
          date: r.date,
          kind: "ingreso",
          title: r.description,
          amount: Number(r.amount),
        });
      }
    }
    return moves
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8);
  }, [expenses, manualRevs]);

  const pipelineValue = leads.reduce((s, l) => s + l.value, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="eyebrow mb-1.5">
            Dearmas Costantini · Panel financiero
          </div>
          <h1 className="text-4xl font-semibold text-ink tracking-tight">
            Dashboard
          </h1>
          <p className="text-sm text-ink-300 mt-2 max-w-2xl">
            Vista consolidada de ingresos, gastos y rentabilidad del estudio.
            Todos los números reflejan cash real cobrado.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-400">
          <Calendar className="w-3.5 h-3.5" />
          <span className="font-medium">
            {now.toLocaleDateString("es-AR", {
              month: "long",
              year: "numeric",
            })}
          </span>
        </div>
      </div>

      {/* KPIs Row 1 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Ingresos del mes"
          value={`USD ${Math.round(stats.ingresos).toLocaleString()}`}
          delta={stats.ingresosDelta}
          positiveIsGood
          sub="vs mes anterior"
          icon={<TrendingUp className="w-4 h-4" />}
          loading={loading}
        />
        <KpiCard
          label="Egresos del mes"
          value={`USD ${Math.round(stats.egresos).toLocaleString()}`}
          delta={stats.egresosDelta}
          positiveIsGood={false}
          sub="vs mes anterior"
          icon={<TrendingDown className="w-4 h-4" />}
          loading={loading}
        />
        <KpiCard
          label="Resultado neto"
          value={`USD ${Math.round(stats.net).toLocaleString()}`}
          delta={stats.netDelta}
          positiveIsGood
          sub="Ingresos − egresos"
          icon={<Wallet className="w-4 h-4" />}
          loading={loading}
        />
        <KpiCard
          label="Margen"
          value={`${stats.margin}%`}
          sub={
            stats.margin >= 60
              ? "Saludable"
              : stats.margin >= 40
                ? "Aceptable"
                : "Atención"
          }
          loading={loading}
        />
      </div>

      {/* Row 2: Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Evolución 12m — area chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Evolución de ingresos y gastos</CardTitle>
            <CardDescription>
              Últimos 12 meses · cash real cobrado
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            {loading ? (
              <div className="h-72 skeleton" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart
                  data={last12}
                  margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="incGrad" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#16C75A" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="#16C75A" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="expGrad" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#B04B3A" stopOpacity={0.14} />
                      <stop offset="100%" stopColor="#B04B3A" stopOpacity={0} />
                    </linearGradient>
                  </defs>
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
                      v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                    }
                  />
                  <Tooltip
                    formatter={(v: number) => `USD ${v.toLocaleString()}`}
                    contentStyle={{
                      background: "#0A1A0C",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "#fff",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="ingresos"
                    name="Ingresos"
                    stroke="#16C75A"
                    strokeWidth={2}
                    fill="url(#incGrad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="egresos"
                    name="Egresos"
                    stroke="#B04B3A"
                    strokeWidth={2}
                    fill="url(#expGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Donut egresos */}
        <Card>
          <CardHeader>
            <CardTitle>Distribución de gastos</CardTitle>
            <CardDescription>Por categoría · mes actual</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-72 skeleton" />
            ) : expenseByCategory.length === 0 ? (
              <div className="h-72 flex items-center justify-center text-xs text-ink-300 italic">
                Sin gastos cargados este mes
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={expenseByCategory}
                    dataKey="value"
                    cx="50%"
                    cy="45%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                    label={(p) => {
                      const { percent } = p as { percent?: number };
                      return percent && percent > 0.05
                        ? `${Math.round(percent * 100)}%`
                        : "";
                    }}
                    labelLine={false}
                  >
                    {expenseByCategory.map((d) => (
                      <Cell key={d.key} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => `USD ${v.toLocaleString()}`}
                    contentStyle={{
                      background: "#0A1A0C",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "#fff",
                    }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    wrapperStyle={{ fontSize: 11 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Movimientos + KPIs secundarios */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Últimos movimientos</CardTitle>
            <CardDescription>
              Mezcla de ingresos manuales y gastos cronológicos
            </CardDescription>
          </CardHeader>
          <div className="divide-y divide-rule-soft">
            {recentMovements.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-ink-300 italic">
                Cargá tu primer ingreso o egreso para ver movimientos acá.
              </div>
            ) : (
              recentMovements.map((m) => (
                <div
                  key={m.id}
                  className="px-5 py-3 flex items-center gap-4"
                >
                  <div
                    className={`w-8 h-8 rounded-premium-sm flex items-center justify-center ${
                      m.kind === "ingreso"
                        ? "bg-accent-tint text-accent-dim"
                        : "bg-danger/10 text-danger"
                    }`}
                  >
                    {m.kind === "ingreso" ? (
                      <ArrowDown className="w-4 h-4 rotate-180" />
                    ) : (
                      <ArrowUp className="w-4 h-4 rotate-180" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink truncate">
                      {m.title}
                    </div>
                    <div className="text-2xs text-ink-300">
                      {m.date} · {m.kind === "ingreso" ? "Ingreso" : "Egreso"}
                    </div>
                  </div>
                  <div
                    className={`text-sm font-semibold tabular-nums ${
                      m.kind === "ingreso" ? "text-success" : "text-danger"
                    }`}
                  >
                    {m.kind === "ingreso" ? "+" : "−"}USD{" "}
                    {m.amount.toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <KpiCard
            label="Clientes activos"
            value={clients.length}
            sub={`${clients.filter((c) => c.type === "gp").length} GP · ${clients.filter((c) => c.type === "dev").length} Dev`}
            loading={loading}
          />
          <KpiCard
            label="Pipeline activo"
            value={`USD ${pipelineValue.toLocaleString()}`}
            sub={`${leads.length} prospectos`}
            loading={loading}
          />
          <Card>
            <CardContent>
              <div className="eyebrow mb-3">Estado del estudio</div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-ink-500">Margen mensual</span>
                  <Pill
                    tone={
                      stats.margin >= 60
                        ? "success"
                        : stats.margin >= 40
                          ? "warn"
                          : "danger"
                    }
                  >
                    {stats.margin}%
                  </Pill>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-ink-500">
                    Tendencia ingresos
                  </span>
                  <Pill
                    tone={
                      stats.ingresosDelta == null
                        ? "neutral"
                        : stats.ingresosDelta >= 0
                          ? "success"
                          : "danger"
                    }
                  >
                    {stats.ingresosDelta == null
                      ? "—"
                      : `${stats.ingresosDelta >= 0 ? "+" : ""}${stats.ingresosDelta.toFixed(1)}%`}
                  </Pill>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-ink-500">
                    Tendencia gastos
                  </span>
                  <Pill
                    tone={
                      stats.egresosDelta == null
                        ? "neutral"
                        : stats.egresosDelta <= 0
                          ? "success"
                          : "danger"
                    }
                  >
                    {stats.egresosDelta == null
                      ? "—"
                      : `${stats.egresosDelta >= 0 ? "+" : ""}${stats.egresosDelta.toFixed(1)}%`}
                  </Pill>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
