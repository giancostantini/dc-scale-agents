"use client";

/**
 * PremiumDividendos — Distribución de Dividendos (matchea el mockup
 * del estudio contable, paleta navy/blue).
 *
 * Layout:
 *   Header: título + período + "+ Nueva Distribución"
 *   Row 1: 4 KPI cards con sparkline:
 *     · Utilidades del Ejercicio (resultado neto acumulado)
 *     · Dividendos Distribuidos (suma a socios)
 *     · Saldo Disponible (reinvertido en empresa)
 *     · Retenciones Aplicadas (estimado IRNR ~ 7% sobre socios)
 *   Row 2 (1/2 + 1/2):
 *     · Donut "Distribución por Socio / Accionista"
 *     · Bar chart mensual de dividendos distribuidos
 *   Row 3: Tabla "Historial de Distribuciones"
 *     Columnas: Fecha · Ejercicio · Importe · Socios · Retenciones ·
 *     Saldo · Estado · Acciones
 *   Footer: banner "Información importante" con normativa
 *
 * Source of truth:
 *   · `dividend_config`: porcentajes y nombres de socios
 *   · `payments` (paid only) + `manual_revenues` + `expenses` →
 *     net mensual
 *   · `distributeDividends(net, config)` aplica los %
 *
 * "Nueva Distribución" abre el modal de config (% de socios).
 * Las acciones de cada row hacen view / descargar acta CSV.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  Plus,
  Eye,
  Download,
  MoreHorizontal,
  TrendingUp,
  DollarSign,
  Wallet,
  Percent,
  ExternalLink,
  Info,
  Pencil,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import {
  distributeDividends,
  getDividendConfig,
  revenueMonthlyImpact,
  updateDividendConfig,
  type DividendConfig,
  type ManualRevenue,
} from "@/lib/finanzas";
import type {
  Client,
  Expense,
  InvoicePayment,
} from "@/lib/types";
import { Button } from "@/components/premium/Button";
import { Modal } from "@/components/premium/Modal";
import { Field, Input } from "@/components/premium/Field";
import { cn } from "@/lib/cn";

const MONTHS_SHORT_ES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

// Paleta navy/blue alineada al mockup
const SOCIO_COLORS = [
  "#1E3A8A", // navy
  "#3B82F6", // blue-500
  "#60A5FA", // blue-400
  "#A78BFA", // violet-400
  "#CBD5E1", // slate-300 (otros)
];

// Retención IRNR aprox sobre dividendos a no-residentes (Uruguay).
// Configurable conceptualmente, fijo por ahora.
const RETENCION_PCT = 0.07;

type PeriodMode = "this_year" | "last_year" | "last_12m" | "ytd" | "custom";

function formatUsd(n: number, opts?: { compact?: boolean }) {
  const sign = n < 0 ? "-" : "";
  const v = Math.abs(n);
  if (opts?.compact && v >= 1_000_000) {
    return `${sign}USD ${(v / 1_000_000).toFixed(1)}M`;
  }
  if (opts?.compact && v >= 1_000) {
    return `${sign}USD ${(v / 1_000).toFixed(0)}K`;
  }
  return `${sign}USD ${Math.round(v).toLocaleString("es-AR")}`;
}

function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

function shiftYearMonth(yyyymm: string, years: number): string {
  const [y, m] = yyyymm.split("-").map(Number);
  return `${y + years}-${String(m).padStart(2, "0")}`;
}

export function PremiumDividendos({
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

  const [periodMode, setPeriodMode] = useState<PeriodMode>("this_year");
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-01`;
  });
  const [customTo, setCustomTo] = useState(() =>
    new Date().toISOString().slice(0, 7),
  );

  // Modal config
  const [editConfigModal, setEditConfigModal] = useState(false);
  const [editForm, setEditForm] = useState({
    partner_a_pct: 30,
    partner_b_pct: 30,
    inversiones_pct: 40,
    back_pct: 0,
    partner_a_name: "Federico Dearmas",
    partner_b_name: "Gianluca Costantini",
  });
  const [savingConfig, setSavingConfig] = useState(false);

  // Modal detalle de un mes del historial
  const [detailRow, setDetailRow] = useState<HistRow | null>(null);

  function refresh() {
    setLoading(true);
    getDividendConfig().then((c) => {
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
    });
  }

  useEffect(() => {
    refresh();
  }, []);

  // ===== Período =====
  const period = useMemo(() => {
    const now = new Date();
    if (periodMode === "this_year") {
      const y = now.getFullYear();
      return {
        from: `${y}-01`,
        to: `${y}-12`,
        label: `01/01/${y} - 31/12/${y}`,
        yearLabel: String(y),
      };
    }
    if (periodMode === "last_year") {
      const y = now.getFullYear() - 1;
      return {
        from: `${y}-01`,
        to: `${y}-12`,
        label: `01/01/${y} - 31/12/${y}`,
        yearLabel: String(y),
      };
    }
    if (periodMode === "last_12m") {
      const d = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      return {
        from: d.toISOString().slice(0, 7),
        to: now.toISOString().slice(0, 7),
        label: "Últimos 12 meses",
        yearLabel: String(now.getFullYear()),
      };
    }
    if (periodMode === "ytd") {
      return {
        from: `${now.getFullYear()}-01`,
        to: now.toISOString().slice(0, 7),
        label: `YTD ${now.getFullYear()}`,
        yearLabel: String(now.getFullYear()),
      };
    }
    return {
      from: customFrom,
      to: customTo,
      label: `${customFrom} → ${customTo}`,
      yearLabel: String(new Date().getFullYear()),
    };
  }, [periodMode, customFrom, customTo]);

  // ===== Net mensual real (cash cobrado) =====
  function monthNet(mk: string): number {
    const feesPaid = clients.reduce((s, c) => {
      const p = payments.find((pp) => pp.clientId === c.id && pp.month === mk);
      if (p?.status !== "paid") return s;
      const amt = p.amountOverride ?? c.fee;
      return s + amt;
    }, 0);
    const manualImpact = manualRevs.reduce(
      (s, r) => s + revenueMonthlyImpact(r, mk),
      0,
    );
    const ex = expenses
      .filter((e) => (e.date ?? "").startsWith(mk))
      .reduce((s, e) => s + e.amount, 0);
    return feesPaid + manualImpact - ex;
  }

  // ===== Historial del período (1 fila por mes con actividad) =====
  type HistRow = {
    monthKey: string;
    fecha: string; // dd/mm/yyyy
    ejercicio: string;
    net: number;
    partnerA: number;
    partnerB: number;
    inversiones: number;
    back: number;
    importeDistribuido: number;
    retenciones: number;
    saldoDisponible: number;
    sociosCount: number;
    estado: "pagada" | "pendiente";
  };

  const history: HistRow[] = useMemo(() => {
    if (!config) return [];
    const out: HistRow[] = [];
    const monthsInPeriod = monthsBetween(period.from, period.to);
    for (const mk of monthsInPeriod) {
      const hasPayment = payments.some((p) => p.month === mk);
      const hasExpense = expenses.some((e) => (e.date ?? "").startsWith(mk));
      const mImpact = manualRevs.reduce(
        (s, r) => s + revenueMonthlyImpact(r, mk),
        0,
      );
      const hasRevenue = mImpact > 0;
      if (!hasPayment && !hasExpense && !hasRevenue) continue;
      const net = monthNet(mk);
      const dist = distributeDividends(net, config);
      const importeDistribuido = dist.partnerA + dist.partnerB;
      const retenciones = Math.max(0, importeDistribuido * RETENCION_PCT);
      const saldoDisponible = dist.inversiones + dist.back;
      const [yy, mm] = mk.split("-").map(Number);
      const lastDay = new Date(yy, mm, 0).getDate();
      const fechaCierre = `${String(lastDay).padStart(2, "0")}/${String(mm).padStart(2, "0")}/${yy}`;
      // Estado: cerrado/pagada si el mes ya pasó, pendiente si es el mes en curso
      const curMonth = new Date().toISOString().slice(0, 7);
      const estado: "pagada" | "pendiente" = mk < curMonth ? "pagada" : "pendiente";
      const sociosCount =
        (Number(config.partner_a_pct) > 0 ? 1 : 0) +
        (Number(config.partner_b_pct) > 0 ? 1 : 0) +
        (Number(config.inversiones_pct) > 0 ? 1 : 0) +
        (Number(config.back_pct) > 0 ? 1 : 0);
      out.push({
        monthKey: mk,
        fecha: fechaCierre,
        ejercicio: String(yy),
        net,
        partnerA: dist.partnerA,
        partnerB: dist.partnerB,
        inversiones: dist.inversiones,
        back: dist.back,
        importeDistribuido,
        retenciones,
        saldoDisponible,
        sociosCount,
        estado,
      });
    }
    return out.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }, [config, period.from, period.to, payments, expenses, manualRevs, clients]);

  // ===== KPIs del período =====
  const utilidadesPeriodo = history.reduce((s, r) => s + Math.max(0, r.net), 0);
  const dividendosDistribuidos = history.reduce(
    (s, r) => s + r.importeDistribuido,
    0,
  );
  const saldoDisponible = history.reduce(
    (s, r) => s + r.saldoDisponible,
    0,
  );
  const retencionesTotal = history.reduce((s, r) => s + r.retenciones, 0);

  // Período comparativo (mismo período un año atrás) para deltas
  const prevPeriod = useMemo(
    () => ({
      from: shiftYearMonth(period.from, -1),
      to: shiftYearMonth(period.to, -1),
    }),
    [period.from, period.to],
  );

  const prevHistory: HistRow[] = useMemo(() => {
    if (!config) return [];
    const months = monthsBetween(prevPeriod.from, prevPeriod.to);
    const out: HistRow[] = [];
    for (const mk of months) {
      const net = monthNet(mk);
      const dist = distributeDividends(net, config);
      const importeDistribuido = dist.partnerA + dist.partnerB;
      const retenciones = Math.max(0, importeDistribuido * RETENCION_PCT);
      const saldoDisponible = dist.inversiones + dist.back;
      out.push({
        monthKey: mk,
        fecha: "",
        ejercicio: "",
        net,
        partnerA: dist.partnerA,
        partnerB: dist.partnerB,
        inversiones: dist.inversiones,
        back: dist.back,
        importeDistribuido,
        retenciones,
        saldoDisponible,
        sociosCount: 0,
        estado: "pagada",
      });
    }
    return out;
  }, [config, prevPeriod.from, prevPeriod.to, payments, expenses, manualRevs, clients]);

  const utilidadesPrev = prevHistory.reduce((s, r) => s + Math.max(0, r.net), 0);
  const dividendosPrev = prevHistory.reduce(
    (s, r) => s + r.importeDistribuido,
    0,
  );
  const saldoPrev = prevHistory.reduce((s, r) => s + r.saldoDisponible, 0);
  const retencionesPrev = prevHistory.reduce((s, r) => s + r.retenciones, 0);

  function pct(a: number, b: number): number | null {
    if (b === 0) return a === 0 ? 0 : null;
    return ((a - b) / Math.abs(b)) * 100;
  }

  // ===== Donut por socio =====
  const distPorSocio = useMemo(() => {
    if (!config) return [] as { key: string; name: string; value: number; pct: number; color: string }[];
    const totalA = history.reduce((s, r) => s + r.partnerA, 0);
    const totalB = history.reduce((s, r) => s + r.partnerB, 0);
    const totalInv = history.reduce((s, r) => s + r.inversiones, 0);
    const totalBack = history.reduce((s, r) => s + r.back, 0);
    const rows = [
      { key: "a", name: config.partner_a_name, value: totalA, color: SOCIO_COLORS[0] },
      { key: "b", name: config.partner_b_name, value: totalB, color: SOCIO_COLORS[1] },
      { key: "inv", name: "Inversiones empresa", value: totalInv, color: SOCIO_COLORS[2] },
      { key: "back", name: "Back empresa", value: totalBack, color: SOCIO_COLORS[3] },
    ].filter((r) => r.value > 0);
    const total = rows.reduce((s, r) => s + r.value, 0);
    return rows.map((r) => ({ ...r, pct: total > 0 ? (r.value / total) * 100 : 0 }));
  }, [config, history]);
  const totalDistPorSocio = distPorSocio.reduce((s, d) => s + d.value, 0);

  // ===== Bar chart: dividendos distribuidos por mes =====
  const evolucionData = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of history) {
      map.set(r.monthKey, r.importeDistribuido);
    }
    // Asegurar 12 meses si periodMode es this_year/ytd
    const months = monthsBetween(period.from, period.to);
    return months.map((mk) => {
      const [_, m] = mk.split("-").map(Number);
      return {
        label: MONTHS_SHORT_ES[m - 1],
        value: map.get(mk) ?? 0,
      };
    });
  }, [history, period.from, period.to]);

  // ===== Sparkline data — últimos 6 meses =====
  const sparkData = useMemo(() => {
    if (!config) return [{ v: 0 }];
    const out: { v: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mk = d.toISOString().slice(0, 7);
      const net = monthNet(mk);
      const dist = distributeDividends(net, config);
      out.push({ v: dist.partnerA + dist.partnerB });
    }
    return out;
  }, [config, payments, expenses, manualRevs, clients]);

  // ===== Acciones =====
  async function saveConfig() {
    const total =
      editForm.partner_a_pct +
      editForm.partner_b_pct +
      editForm.inversiones_pct +
      editForm.back_pct;
    if (total > 100) {
      toast.error(`Los porcentajes suman ${total}%. No pueden superar 100%.`);
      return;
    }
    setSavingConfig(true);
    try {
      await updateDividendConfig(editForm);
      toast.success("Configuración actualizada");
      setEditConfigModal(false);
      refresh();
    } catch (err) {
      const e = err as Error;
      toast.error(`Error: ${e.message}`);
    } finally {
      setSavingConfig(false);
    }
  }

  function exportCsv() {
    if (history.length === 0) {
      toast.error("Sin distribuciones para exportar");
      return;
    }
    const header = [
      "Fecha cierre",
      "Ejercicio",
      "Mes",
      "Resultado neto",
      "Importe distribuido",
      "Retenciones",
      "Saldo disponible",
      "Estado",
    ];
    const rows = history.map((r) =>
      [
        r.fecha,
        r.ejercicio,
        r.monthKey,
        r.net.toFixed(2),
        r.importeDistribuido.toFixed(2),
        r.retenciones.toFixed(2),
        r.saldoDisponible.toFixed(2),
        r.estado,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = "﻿" + [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dividendos-${period.from}_${period.to}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("CSV descargado");
  }

  function exportActa(r: HistRow) {
    if (!config) return;
    const header = ["Concepto", "Porcentaje", "Importe USD"];
    const lines = [
      [config.partner_a_name, `${config.partner_a_pct}%`, r.partnerA.toFixed(2)],
      [config.partner_b_name, `${config.partner_b_pct}%`, r.partnerB.toFixed(2)],
      ["Inversiones empresa", `${config.inversiones_pct}%`, r.inversiones.toFixed(2)],
    ];
    if (Number(config.back_pct) > 0) {
      lines.push(["Back empresa", `${config.back_pct}%`, r.back.toFixed(2)]);
    }
    lines.push(["TOTAL DISTRIBUIDO", "", r.importeDistribuido.toFixed(2)]);
    lines.push(["Retenciones (IRNR estimado)", `${(RETENCION_PCT * 100).toFixed(1)}%`, r.retenciones.toFixed(2)]);
    lines.push(["Saldo disponible", "", r.saldoDisponible.toFixed(2)]);
    const rows = lines.map((row) =>
      row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","),
    );
    const csv = "﻿" + [
      `"Acta de distribución — ${r.monthKey}"`,
      `"Resultado neto: USD ${r.net.toFixed(2)}"`,
      "",
      header.join(","),
      ...rows,
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `acta-distribucion-${r.monthKey}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Acta descargada");
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-10 w-80" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="bg-amber-50 border-l-4 border-amber-500 p-5 rounded-premium-sm">
        <div className="font-semibold text-ink mb-1">Configuración no disponible</div>
        <div className="text-sm text-ink-400">
          La tabla <code>dividend_config</code> todavía no existe. Pegá la
          migración 025 en el SQL Editor de Supabase y dale Run. Después
          refrescá esta página.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ===== Header ===== */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-ink tracking-tight">
            Distribución de Dividendos
          </h1>
          <p className="text-sm text-ink-300 mt-1">
            Gestioná y controlá las distribuciones de utilidades a socios y accionistas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodSelector
            mode={periodMode}
            onModeChange={setPeriodMode}
            customFrom={customFrom}
            customTo={customTo}
            onCustomChange={(f, t) => { setCustomFrom(f); setCustomTo(t); }}
            label={period.label}
          />
          <Button variant="primary" size="md" onClick={() => setEditConfigModal(true)}>
            <Plus className="w-4 h-4" />
            Nueva Distribución
          </Button>
        </div>
      </div>

      {/* ===== Row 1: 4 KPIs ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SparkKpiCard
          label="Utilidades del Ejercicio"
          value={formatUsd(utilidadesPeriodo, { compact: true })}
          delta={pct(utilidadesPeriodo, utilidadesPrev)}
          subLabel="vs. ejercicio anterior"
          icon={<TrendingUp className="w-4 h-4" />}
          spark={sparkData}
          sparkColor="#1E3A8A"
        />
        <SparkKpiCard
          label="Dividendos Distribuidos"
          value={formatUsd(dividendosDistribuidos, { compact: true })}
          delta={pct(dividendosDistribuidos, dividendosPrev)}
          subLabel="vs. ejercicio anterior"
          icon={<DollarSign className="w-4 h-4" />}
          spark={sparkData}
          sparkColor="#3B82F6"
        />
        <SparkKpiCard
          label="Saldo Disponible"
          value={formatUsd(saldoDisponible, { compact: true })}
          delta={pct(saldoDisponible, saldoPrev)}
          subLabel="vs. ejercicio anterior"
          icon={<Wallet className="w-4 h-4" />}
          spark={sparkData}
          sparkColor="#16C75A"
        />
        <SparkKpiCard
          label="Retenciones Aplicadas"
          value={formatUsd(retencionesTotal, { compact: true })}
          delta={pct(retencionesTotal, retencionesPrev)}
          subLabel="vs. ejercicio anterior"
          icon={<Percent className="w-4 h-4" />}
          spark={sparkData}
          sparkColor="#A78BFA"
        />
      </div>

      {/* ===== Row 2: Donut + Bar chart ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Donut */}
        <div className="bg-paper border border-rule rounded-premium shadow-premium-xs">
          <div className="px-5 py-4 border-b border-rule">
            <div className="font-semibold text-ink text-md">
              Distribución por Socio / Accionista
            </div>
          </div>
          <div className="p-4 flex items-center gap-5">
            {totalDistPorSocio === 0 ? (
              <div className="w-full py-14 text-center text-ink-300 italic text-xs">
                Sin distribuciones todavía en este período.
              </div>
            ) : (
              <>
                <div className="relative shrink-0">
                  <ResponsiveContainer width={200} height={200}>
                    <PieChart>
                      <Pie
                        data={distPorSocio}
                        dataKey="value"
                        innerRadius={62}
                        outerRadius={92}
                        paddingAngle={1.5}
                        startAngle={90}
                        endAngle={-270}
                      >
                        {distPorSocio.map((d, i) => (
                          <Cell key={d.key} fill={d.color} stroke="none" />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <div className="text-md font-semibold text-ink tabular-nums">
                      {formatUsd(totalDistPorSocio, { compact: true })}
                    </div>
                    <div className="text-2xs text-ink-300">Total distribuido</div>
                  </div>
                </div>
                <div className="flex-1 space-y-2.5 text-xs min-w-0">
                  {distPorSocio.map((d) => (
                    <div key={d.key} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: d.color }}
                        />
                        <span className="text-ink truncate">{d.name}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-ink tabular-nums">
                          {formatUsd(d.value, { compact: true })}
                        </span>
                        <span className="text-ink-400 tabular-nums w-12 text-right">
                          {d.pct.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Bar chart */}
        <div className="bg-paper border border-rule rounded-premium shadow-premium-xs">
          <div className="px-5 py-4 border-b border-rule flex items-center justify-between">
            <div className="font-semibold text-ink text-md">
              Evolución de Dividendos Distribuidos
            </div>
            <div className="text-xs text-ink-300 inline-flex items-center gap-1.5 px-2.5 h-7 border border-rule rounded-premium-sm">
              <Calendar className="w-3 h-3" />
              {periodMode === "this_year" ? "Este año" : period.label}
            </div>
          </div>
          <div className="p-4">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={evolucionData}
                margin={{ top: 10, right: 10, left: -5, bottom: 0 }}
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
                  cursor={{ fill: "rgba(30, 58, 138, 0.05)" }}
                />
                <Bar dataKey="value" fill="#1E3A8A" radius={[3, 3, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ===== Row 3: Tabla Historial ===== */}
      <div className="bg-paper border border-rule rounded-premium shadow-premium-xs">
        <div className="px-5 py-4 border-b border-rule flex items-center justify-between gap-3">
          <div className="font-semibold text-ink text-md">
            Historial de Distribuciones
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportCsv}
              className="inline-flex items-center justify-center w-8 h-8 text-ink-400 bg-paper border border-rule rounded-premium-sm hover:border-rule-strong hover:text-ink transition-colors"
              title="Exportar CSV"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-paper-100/60 border-b border-rule">
                <th className="text-left px-4 py-3 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">Fecha</th>
                <th className="text-left px-4 py-3 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">Ejercicio</th>
                <th className="text-right px-4 py-3 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">Importe Distribuido</th>
                <th className="text-center px-4 py-3 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">Socios / Accionistas</th>
                <th className="text-right px-4 py-3 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">Retenciones</th>
                <th className="text-right px-4 py-3 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">Saldo Disponible</th>
                <th className="text-left px-4 py-3 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">Estado</th>
                <th className="text-right px-4 py-3 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-ink-300 italic">
                    Sin distribuciones registradas en este período.
                  </td>
                </tr>
              ) : (
                history.map((r) => (
                  <tr key={r.monthKey} className="border-b border-rule-soft hover:bg-paper-100">
                    <td className="px-4 py-3 text-ink tabular-nums">{r.fecha}</td>
                    <td className="px-4 py-3 text-ink-400 tabular-nums">{r.ejercicio}</td>
                    <td className="px-4 py-3 text-right text-ink tabular-nums">
                      {formatUsd(r.importeDistribuido)}
                    </td>
                    <td className="px-4 py-3 text-center text-ink-400 tabular-nums">{r.sociosCount}</td>
                    <td className="px-4 py-3 text-right text-ink-400 tabular-nums">{formatUsd(r.retenciones)}</td>
                    <td className="px-4 py-3 text-right text-ink tabular-nums">{formatUsd(r.saldoDisponible)}</td>
                    <td className="px-4 py-3">
                      <EstadoPill estado={r.estado} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => setDetailRow(r)}
                          className="p-1.5 rounded-premium-sm text-ink-400 hover:text-ink hover:bg-paper-200 transition-colors"
                          title="Ver detalle"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => exportActa(r)}
                          className="p-1.5 rounded-premium-sm text-ink-400 hover:text-ink hover:bg-paper-200 transition-colors"
                          title="Descargar acta"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditConfigModal(true)}
                          className="p-1.5 rounded-premium-sm text-ink-400 hover:text-ink hover:bg-paper-200 transition-colors"
                          title="Editar configuración"
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-rule text-xs text-ink-300">
          Mostrando {history.length} {history.length === 1 ? "distribución" : "distribuciones"} del período.
        </div>
      </div>

      {/* ===== Footer: Info banner ===== */}
      <div className="bg-blue-50/80 border border-blue-100 rounded-premium p-4 flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
          <Info className="w-4 h-4" />
        </div>
        <div className="flex-1">
          <div className="font-semibold text-ink text-sm">Información importante</div>
          <div className="text-xs text-ink-400 mt-0.5">
            Las distribuciones de dividendos están sujetas a retenciones de IRNR ({(RETENCION_PCT * 100).toFixed(0)}% estimado) según la normativa vigente.
          </div>
        </div>
        <a
          href="https://www.impo.com.uy/bases/decretos/150-2007"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 h-8 text-xs font-medium text-ink-500 bg-paper border border-rule rounded-premium-sm hover:border-rule-strong transition-colors"
        >
          Ver Normativa
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Modal Config */}
      <Modal
        open={editConfigModal}
        onClose={() => !savingConfig && setEditConfigModal(false)}
        title="Configuración de distribución"
        description="Definí los porcentajes por socio y por inversión. Los cambios afectan a todos los meses (recalculado)."
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditConfigModal(false)} disabled={savingConfig}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={saveConfig} loading={savingConfig}>
              Guardar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre socio A" required>
              <Input
                value={editForm.partner_a_name}
                onChange={(e) => setEditForm({ ...editForm, partner_a_name: e.target.value })}
              />
            </Field>
            <Field label="% socio A" required>
              <Input
                type="number"
                value={String(editForm.partner_a_pct)}
                onChange={(e) =>
                  setEditForm({ ...editForm, partner_a_pct: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Nombre socio B" required>
              <Input
                value={editForm.partner_b_name}
                onChange={(e) => setEditForm({ ...editForm, partner_b_name: e.target.value })}
              />
            </Field>
            <Field label="% socio B" required>
              <Input
                type="number"
                value={String(editForm.partner_b_pct)}
                onChange={(e) =>
                  setEditForm({ ...editForm, partner_b_pct: Number(e.target.value) })
                }
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="% Inversiones empresa">
              <Input
                type="number"
                value={String(editForm.inversiones_pct)}
                onChange={(e) =>
                  setEditForm({ ...editForm, inversiones_pct: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="% Back empresa">
              <Input
                type="number"
                value={String(editForm.back_pct)}
                onChange={(e) =>
                  setEditForm({ ...editForm, back_pct: Number(e.target.value) })
                }
              />
            </Field>
          </div>
          <div className="text-xs text-ink-400 bg-paper-100/60 border border-rule rounded-premium-sm p-2.5">
            Total:{" "}
            <strong className="text-ink">
              {editForm.partner_a_pct + editForm.partner_b_pct + editForm.inversiones_pct + editForm.back_pct}%
            </strong>
            . La suma no puede superar 100%.
          </div>
        </div>
      </Modal>

      {/* Modal Detalle de mes */}
      <Modal
        open={!!detailRow}
        onClose={() => setDetailRow(null)}
        title={detailRow ? `Distribución de ${detailRow.monthKey}` : ""}
        description={detailRow ? `Cerrado el ${detailRow.fecha}` : ""}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDetailRow(null)}>
              Cerrar
            </Button>
            {detailRow && (
              <Button variant="primary" onClick={() => exportActa(detailRow)}>
                <Download className="w-4 h-4" />
                Descargar acta
              </Button>
            )}
          </>
        }
      >
        {detailRow && config && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <KpiMini label="Resultado neto" value={formatUsd(detailRow.net)} />
              <KpiMini label="Total distribuido" value={formatUsd(detailRow.importeDistribuido)} accent="navy" />
            </div>
            <div className="border border-rule rounded-premium-sm overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-paper-100/60 border-b border-rule">
                    <th className="text-left px-3 py-2 text-2xs uppercase tracking-wider text-ink-300 font-semibold">Concepto</th>
                    <th className="text-right px-3 py-2 text-2xs uppercase tracking-wider text-ink-300 font-semibold">%</th>
                    <th className="text-right px-3 py-2 text-2xs uppercase tracking-wider text-ink-300 font-semibold">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-rule-soft">
                    <td className="px-3 py-2 text-ink">{config.partner_a_name}</td>
                    <td className="px-3 py-2 text-right text-ink-400 tabular-nums">{config.partner_a_pct}%</td>
                    <td className="px-3 py-2 text-right text-ink tabular-nums">{formatUsd(detailRow.partnerA)}</td>
                  </tr>
                  <tr className="border-t border-rule-soft">
                    <td className="px-3 py-2 text-ink">{config.partner_b_name}</td>
                    <td className="px-3 py-2 text-right text-ink-400 tabular-nums">{config.partner_b_pct}%</td>
                    <td className="px-3 py-2 text-right text-ink tabular-nums">{formatUsd(detailRow.partnerB)}</td>
                  </tr>
                  <tr className="border-t border-rule-soft">
                    <td className="px-3 py-2 text-ink">Inversiones empresa</td>
                    <td className="px-3 py-2 text-right text-ink-400 tabular-nums">{config.inversiones_pct}%</td>
                    <td className="px-3 py-2 text-right text-ink tabular-nums">{formatUsd(detailRow.inversiones)}</td>
                  </tr>
                  {Number(config.back_pct) > 0 && (
                    <tr className="border-t border-rule-soft">
                      <td className="px-3 py-2 text-ink">Back empresa</td>
                      <td className="px-3 py-2 text-right text-ink-400 tabular-nums">{config.back_pct}%</td>
                      <td className="px-3 py-2 text-right text-ink tabular-nums">{formatUsd(detailRow.back)}</td>
                    </tr>
                  )}
                  <tr className="border-t border-rule bg-paper-100/40 font-semibold">
                    <td className="px-3 py-2 text-ink">Retenciones IRNR (estim.)</td>
                    <td className="px-3 py-2 text-right text-ink-400 tabular-nums">{(RETENCION_PCT * 100).toFixed(0)}%</td>
                    <td className="px-3 py-2 text-right text-ink tabular-nums">{formatUsd(detailRow.retenciones)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ============================================================
// Subcomponentes
// ============================================================

function SparkKpiCard({
  label,
  value,
  delta,
  subLabel,
  icon,
  spark,
  sparkColor = "#16C75A",
}: {
  label: string;
  value: string;
  delta: number | null;
  subLabel?: string;
  icon?: React.ReactNode;
  spark: { v: number }[];
  sparkColor?: string;
}) {
  return (
    <div className="bg-paper border border-rule rounded-premium shadow-premium-xs p-4">
      <div className="flex items-start gap-2.5 mb-2">
        <div className="text-ink-300 bg-paper-200 rounded-premium-sm w-9 h-9 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="text-xs text-ink-400 font-medium leading-tight pt-1.5">
          {label}
        </div>
      </div>
      <div className="text-2xl font-semibold tracking-tight tabular-nums text-ink mt-1">
        {value}
      </div>
      <div className="flex items-center justify-between gap-2 mt-2">
        <div>
          {delta != null && !Number.isNaN(delta) && (
            <div
              className={cn(
                "text-xs font-semibold",
                delta >= 0 ? "text-success" : "text-danger",
              )}
            >
              {delta >= 0 ? "↑" : "↓"} {Math.abs(delta).toFixed(1)}%
            </div>
          )}
          {subLabel && (
            <div className="text-2xs text-ink-300 mt-0.5">{subLabel}</div>
          )}
        </div>
        <div className="w-16 h-7 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={spark}>
              <Line
                type="monotone"
                dataKey="v"
                stroke={sparkColor}
                strokeWidth={1.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function EstadoPill({ estado }: { estado: "pagada" | "pendiente" }) {
  const config = {
    pagada: { label: "Pagada", classes: "bg-emerald-50 text-emerald-700" },
    pendiente: { label: "Pendiente", classes: "bg-amber-50 text-amber-700" },
  };
  const c = config[estado];
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 text-2xs font-semibold rounded-full",
        c.classes,
      )}
    >
      {c.label}
    </span>
  );
}

function KpiMini({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "navy";
}) {
  return (
    <div className="bg-paper-100/60 border border-rule rounded-premium-sm p-3">
      <div className="text-2xs text-ink-300 uppercase tracking-wider font-semibold">
        {label}
      </div>
      <div
        className={cn(
          "text-lg font-semibold mt-1 tabular-nums",
          accent === "navy" ? "text-[#1E3A8A]" : "text-ink",
        )}
      >
        {value}
      </div>
    </div>
  );
}

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
        <svg className="w-3 h-3 text-ink-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-80 bg-paper border border-rule rounded-premium shadow-premium-md p-3 animate-fade-in">
            <div className="text-2xs uppercase tracking-wider text-ink-300 font-semibold mb-2">Rango rápido</div>
            <div className="grid grid-cols-2 gap-1.5 mb-3">
              {([
                ["this_year", "Este año"],
                ["last_year", "Año anterior"],
                ["last_12m", "Últimos 12 meses"],
                ["ytd", "Año a la fecha"],
              ] as [PeriodMode, string][]).map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => { onModeChange(k); setOpen(false); }}
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
            <div className="text-2xs uppercase tracking-wider text-ink-300 font-semibold mb-2">Rango personalizado</div>
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
              onClick={() => { onModeChange("custom"); setOpen(false); }}
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
