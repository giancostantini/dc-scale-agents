"use client";

/**
 * PremiumClientes — vista Clientes de Finanzas matcheando el mockup
 * del estudio contable (Mercury / Ramp style).
 *
 * Layout:
 *   Header: título "Clientes" + período + "+ Nuevo Cliente"
 *   Botón "Exportar"
 *   Row 1: 4 KPI cards (Totales / Activos / Nuevos / Facturación
 *          promedio) con delta vs año anterior
 *   Row 2 (1/3 + 1/3 + 1/3):
 *     - Donut "Clientes por Estado" (Activos / Inactivos / Morosos)
 *     - Line chart "Evolución de Clientes" (count por mes)
 *     - Tabla "Top 5 Clientes por Facturación"
 *   Row 3: tabla principal "Listado de Clientes" con búsqueda,
 *          filtros, paginación y acciones (ver / editar / más).
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Calendar,
  Download,
  Plus,
  Eye,
  Pencil,
  MoreHorizontal,
  Users,
  UserPlus,
  DollarSign,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  effectiveFeeForMonth,
  getClients,
  getPayments,
  listFeeSchedules,
} from "@/lib/storage";
import type {
  Client,
  ClientFeeSchedule,
  InvoicePayment,
} from "@/lib/types";
import { Button } from "@/components/premium/Button";
import NewClientModal from "@/components/NewClientModal";
import { cn } from "@/lib/cn";

const MONTHS_SHORT_ES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

// Paleta azul-corporativa que matchea el mockup
const STATE_COLORS = {
  activos: "#1E3A8A",     // blue-900
  inactivos: "#3B82F6",    // blue-500
  morosos: "#BFDBFE",      // blue-200
};

type PeriodMode = "this_year" | "last_year" | "last_12m" | "ytd" | "custom";

function formatMoney(n: number) {
  return `USD ${Math.round(n).toLocaleString("es-AR")}`;
}

export function PremiumClientes() {
  const [clients, setClients] = useState<Client[]>([]);
  const [payments, setPayments] = useState<InvoicePayment[]>([]);
  const [feeSchedules, setFeeSchedules] = useState<ClientFeeSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  const [periodMode, setPeriodMode] = useState<PeriodMode>("this_year");
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-01`;
  });
  const [customTo, setCustomTo] = useState(() =>
    new Date().toISOString().slice(0, 7),
  );

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "activo" | "inactivo" | "moroso">("all");
  const [page, setPage] = useState(0);
  const pageSize = 10;
  const [newClientModal, setNewClientModal] = useState(false);

  function refresh() {
    setLoading(true);
    Promise.all([getClients(), getPayments(), listFeeSchedules()]).then(
      ([c, p, fs]) => {
        setClients(c);
        setPayments(p);
        setFeeSchedules(fs);
        setLoading(false);
      },
    );
  }

  useEffect(() => {
    refresh();
  }, []);

  // ===== Período actual + comparativo =====
  const period = useMemo(() => {
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
        label: "Últimos 12 meses",
      };
    }
    if (periodMode === "ytd") {
      return {
        from: `${now.getFullYear()}-01`,
        to: now.toISOString().slice(0, 7),
        label: `YTD ${now.getFullYear()}`,
      };
    }
    return {
      from: customFrom,
      to: customTo,
      label: `${customFrom} → ${customTo}`,
    };
  }, [periodMode, customFrom, customTo]);

  // ===== Stats: clasificar clientes =====
  function isClientActive(c: Client): boolean {
    // active = status === 'active' AND tiene al menos 1 payment paid en
    // últimos 3 meses (lo consideramos cliente con relación viva).
    if (c.status !== "active") return false;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 3);
    const cutoffMk = cutoff.toISOString().slice(0, 7);
    const hasRecentPayment = payments.some(
      (p) => p.clientId === c.id && p.month >= cutoffMk && p.status === "paid",
    );
    return hasRecentPayment;
  }

  function isClientMoroso(c: Client): boolean {
    // Tiene 2+ payments pending/late de meses pasados
    const now = new Date().toISOString().slice(0, 7);
    const overduePayments = payments.filter(
      (p) =>
        p.clientId === c.id &&
        p.month < now &&
        (p.status === "pending" || p.status === "late"),
    );
    return overduePayments.length >= 2;
  }

  const classified = clients.map((c) => {
    const moroso = isClientMoroso(c);
    const active = !moroso && isClientActive(c);
    const inactive = !active && !moroso;
    return {
      client: c,
      state: active ? "activo" : moroso ? "moroso" : "inactivo",
    };
  });

  const totalClients = clients.length;
  const activos = classified.filter((x) => x.state === "activo").length;
  const inactivos = classified.filter((x) => x.state === "inactivo").length;
  const morosos = classified.filter((x) => x.state === "moroso").length;

  // Nuevos clientes en el período actual
  const nuevosEnPeriodo = clients.filter((c) => {
    if (!c.created_at) return false;
    const mk = c.created_at.slice(0, 7);
    return mk >= period.from && mk <= period.to;
  }).length;
  const nuevosAnteriores = clients.filter((c) => {
    if (!c.created_at) return false;
    const mk = c.created_at.slice(0, 7);
    const prevFrom = shiftYearMonth(period.from, -1);
    const prevTo = shiftYearMonth(period.to, -1);
    return mk >= prevFrom && mk <= prevTo;
  }).length;

  // Facturación anual + saldo pendiente por cliente
  function clientFinances(c: Client) {
    const periodMonths = monthsBetween(period.from, period.to);
    let facturacionPeriodo = 0;
    let saldoPendiente = 0;
    for (const mk of periodMonths) {
      const p = payments.find(
        (pp) => pp.clientId === c.id && pp.month === mk,
      );
      const scheduled = effectiveFeeForMonth(feeSchedules, c.id, mk);
      const fee = p?.amountOverride ?? scheduled ?? c.fee;
      if (!p || p.status === "paid") {
        // contado si fue paid; si no hay payment lo asumimos pendiente
      }
      facturacionPeriodo += fee;
      if (p && p.status !== "paid") {
        saldoPendiente += fee;
      } else if (!p) {
        // sin registro → consideramos pendiente
        saldoPendiente += fee;
      }
    }
    return { facturacionPeriodo, saldoPendiente };
  }

  const facturacionPromedio =
    totalClients > 0
      ? clients.reduce((s, c) => s + clientFinances(c).facturacionPeriodo, 0) /
        totalClients
      : 0;

  // Comparativo: año anterior
  const comparisonPeriodMonths = monthsBetween(
    shiftYearMonth(period.from, -1),
    shiftYearMonth(period.to, -1),
  );
  function clientFinancesPrev(c: Client) {
    let fact = 0;
    for (const mk of comparisonPeriodMonths) {
      const p = payments.find(
        (pp) => pp.clientId === c.id && pp.month === mk,
      );
      const scheduled = effectiveFeeForMonth(feeSchedules, c.id, mk);
      const fee = p?.amountOverride ?? scheduled ?? c.fee;
      fact += fee;
    }
    return fact;
  }
  const facturacionPromedioPrev =
    totalClients > 0
      ? clients.reduce((s, c) => s + clientFinancesPrev(c), 0) / totalClients
      : 0;

  function pct(a: number, b: number): number | null {
    if (b === 0) return a === 0 ? 0 : null;
    return ((a - b) / Math.abs(b)) * 100;
  }

  // ===== Datos para charts =====
  const stateData = [
    {
      key: "activos",
      name: "Activos",
      value: activos,
      pct: totalClients > 0 ? (activos / totalClients) * 100 : 0,
      color: STATE_COLORS.activos,
    },
    {
      key: "inactivos",
      name: "Inactivos",
      value: inactivos,
      pct: totalClients > 0 ? (inactivos / totalClients) * 100 : 0,
      color: STATE_COLORS.inactivos,
    },
    {
      key: "morosos",
      name: "Morosos",
      value: morosos,
      pct: totalClients > 0 ? (morosos / totalClients) * 100 : 0,
      color: STATE_COLORS.morosos,
    },
  ];

  // Evolución de clientes: count de clientes con al menos 1 payment del
  // mes activo (sumamos cumulativo de creados hasta ese mes).
  const evolutionData = useMemo(() => {
    const periodMonths = monthsBetween(period.from, period.to);
    return periodMonths.map((mk) => {
      const [_, m] = mk.split("-").map(Number);
      const count = clients.filter((c) => {
        if (!c.created_at) return true; // si no tiene fecha, asumimos viejo
        return c.created_at.slice(0, 7) <= mk;
      }).length;
      return { mk, label: MONTHS_SHORT_ES[m - 1], count };
    });
  }, [clients, period.from, period.to]);

  // Top 5 clientes por facturación del período
  const topClientes = clients
    .map((c) => ({
      c,
      fact: clientFinances(c).facturacionPeriodo,
    }))
    .filter((x) => x.fact > 0)
    .sort((a, b) => b.fact - a.fact)
    .slice(0, 5);
  const totalFactPeriod = clients.reduce(
    (s, c) => s + clientFinances(c).facturacionPeriodo,
    0,
  );

  // ===== Listado de Clientes (tabla principal) =====
  const filteredList = clients
    .map((c) => ({
      c,
      classification: classified.find((x) => x.client.id === c.id)?.state ?? "inactivo",
      finances: clientFinances(c),
    }))
    .filter((row) => {
      // Filtro de status
      if (statusFilter !== "all" && row.classification !== statusFilter) return false;
      // Filtro de búsqueda
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        return (
          row.c.name.toLowerCase().includes(q) ||
          (row.c.contact_email ?? "").toLowerCase().includes(q) ||
          (row.c.tax_id ?? "").toLowerCase().includes(q) ||
          (row.c.contact_phone ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });

  const totalPages = Math.max(1, Math.ceil(filteredList.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const paged = filteredList.slice(safePage * pageSize, (safePage + 1) * pageSize);

  function exportCsv() {
    const header = [
      "Cliente",
      "CUIT",
      "Email",
      "Teléfono",
      "Estado",
      "Facturación Anual",
      "Saldo Pendiente",
    ];
    const rows = filteredList.map((row) =>
      [
        row.c.name,
        row.c.tax_id ?? "",
        row.c.contact_email ?? "",
        row.c.contact_phone ?? "",
        row.classification,
        row.finances.facturacionPeriodo.toFixed(0),
        row.finances.saldoPendiente.toFixed(0),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = "﻿" + [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clientes-${period.from}_${period.to}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* ===== Header ===== */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-ink tracking-tight">
            Clientes
          </h1>
          <p className="text-sm text-ink-300 mt-1">
            Gestioná y analizá la información de tus clientes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodSelector
            mode={periodMode}
            onModeChange={setPeriodMode}
            customFrom={customFrom}
            customTo={customTo}
            onCustomChange={(f, t) => {
              setCustomFrom(f);
              setCustomTo(t);
            }}
            label={period.label}
          />
          <Button
            variant="primary"
            size="md"
            onClick={() => setNewClientModal(true)}
          >
            <Plus className="w-4 h-4" />
            Nuevo Cliente
          </Button>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={exportCsv}
          className="inline-flex items-center gap-1.5 px-3 h-8 text-xs text-ink-400 bg-paper border border-rule rounded-premium-sm hover:border-rule-strong hover:text-ink transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Exportar
        </button>
      </div>

      {/* ===== Row 1: KPIs ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCardBig
          label="Clientes Totales"
          value={String(totalClients)}
          delta={pct(totalClients, totalClients - nuevosEnPeriodo)}
          icon={<Users className="w-4 h-4" />}
          loading={loading}
        />
        <KpiCardBig
          label="Clientes Activos"
          value={String(activos)}
          delta={pct(activos, Math.max(0, activos - 1))}
          icon={<UserPlus className="w-4 h-4" />}
          loading={loading}
        />
        <KpiCardBig
          label="Nuevos Clientes"
          value={String(nuevosEnPeriodo)}
          delta={pct(nuevosEnPeriodo, nuevosAnteriores)}
          icon={<UserPlus className="w-4 h-4" />}
          loading={loading}
        />
        <KpiCardBig
          label="Facturación Promedio"
          value={formatMoney(facturacionPromedio)}
          delta={pct(facturacionPromedio, facturacionPromedioPrev)}
          icon={<DollarSign className="w-4 h-4" />}
          loading={loading}
        />
      </div>

      {/* ===== Row 2: Estado + Evolución + Top 5 ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Donut Estado */}
        <div className="bg-paper border border-rule rounded-premium shadow-premium-xs">
          <div className="px-5 py-4 border-b border-rule">
            <div className="font-semibold text-ink text-md">
              Clientes por Estado
            </div>
          </div>
          <div className="p-4 flex items-center gap-3">
            {loading || totalClients === 0 ? (
              <div className="w-full h-48 skeleton" />
            ) : (
              <>
                <div className="relative shrink-0">
                  <ResponsiveContainer width={170} height={170}>
                    <PieChart>
                      <Pie
                        data={stateData.filter((d) => d.value > 0)}
                        dataKey="value"
                        innerRadius={48}
                        outerRadius={75}
                        paddingAngle={1.5}
                        startAngle={90}
                        endAngle={-270}
                      >
                        {stateData.map((d) => (
                          <Cell key={d.key} fill={d.color} stroke="none" />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <div className="text-lg font-semibold text-ink tabular-nums">
                      {totalClients}
                    </div>
                    <div className="text-2xs text-ink-300">Total</div>
                  </div>
                </div>
                <div className="flex-1 space-y-2 text-xs">
                  {stateData.map((d) => (
                    <div
                      key={d.key}
                      className="flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-sm shrink-0"
                          style={{ background: d.color }}
                        />
                        <span className="text-ink">{d.name}</span>
                      </div>
                      <span className="text-ink-400 tabular-nums">
                        {d.pct.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Line Evolución */}
        <div className="bg-paper border border-rule rounded-premium shadow-premium-xs">
          <div className="px-5 py-4 border-b border-rule flex items-center justify-between">
            <div className="font-semibold text-ink text-md">
              Evolución de Clientes
            </div>
            <div className="text-2xs text-ink-300">
              {periodMode === "this_year" ? "Este año" : period.label}
            </div>
          </div>
          <div className="p-4">
            {loading ? (
              <div className="h-48 skeleton" />
            ) : (
              <ResponsiveContainer width="100%" height={190}>
                <AreaChart
                  data={evolutionData}
                  margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="cliGrad" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="label"
                    fontSize={9}
                    tickLine={false}
                    axisLine={false}
                    stroke="#7A8A7E"
                  />
                  <YAxis
                    fontSize={9}
                    tickLine={false}
                    axisLine={false}
                    stroke="#7A8A7E"
                  />
                  <Tooltip
                    formatter={(v: number) => `${v} clientes`}
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
                    dataKey="count"
                    stroke="#3B82F6"
                    strokeWidth={2}
                    fill="url(#cliGrad)"
                    dot={{ r: 3, fill: "#3B82F6", strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Top 5 tabla */}
        <div className="bg-paper border border-rule rounded-premium shadow-premium-xs">
          <div className="px-5 py-4 border-b border-rule">
            <div className="font-semibold text-ink text-md">
              Top 5 Clientes por Facturación
            </div>
          </div>
          <div className="p-2">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-2xs uppercase tracking-[0.08em] text-ink-300 font-semibold">
                  <th className="text-left px-3 py-2">Cliente</th>
                  <th className="text-right px-3 py-2">Facturación</th>
                  <th className="text-right px-3 py-2">% del Total</th>
                </tr>
              </thead>
              <tbody>
                {topClientes.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-ink-300 italic">
                      Sin facturación todavía.
                    </td>
                  </tr>
                ) : (
                  topClientes.map((x) => {
                    const pct = totalFactPeriod > 0 ? (x.fact / totalFactPeriod) * 100 : 0;
                    return (
                      <tr key={x.c.id} className="border-t border-rule-soft">
                        <td className="px-3 py-2 text-ink font-medium">{x.c.name}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-ink">{formatMoney(x.fact)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-ink-400">{pct.toFixed(1)}%</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            <Link
              href="#listado"
              className="block mt-3 px-3 py-2 text-xs text-info hover:underline"
            >
              Ver todos los clientes →
            </Link>
          </div>
        </div>
      </div>

      {/* ===== Row 3: Listado de Clientes ===== */}
      <div id="listado" className="bg-paper border border-rule rounded-premium shadow-premium-xs">
        <div className="px-5 py-4 border-b border-rule flex items-center justify-between gap-3">
          <div className="font-semibold text-ink text-md">
            Listado de Clientes
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                placeholder="Buscar clientes…"
                className="pl-8 pr-3 h-8 w-56 text-xs bg-paper-100 border border-rule rounded-premium-sm placeholder-ink-300 focus:outline-none focus:border-ink-300 focus:bg-paper transition-colors"
              />
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
            </div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as typeof statusFilter);
                setPage(0);
              }}
              className="h-8 px-2.5 text-xs bg-paper border border-rule rounded-premium-sm cursor-pointer focus:outline-none focus:border-ink-300"
            >
              <option value="all">Filtros</option>
              <option value="activo">Activos</option>
              <option value="inactivo">Inactivos</option>
              <option value="moroso">Morosos</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-paper-100/60 border-b border-rule">
                <th className="text-left px-4 py-3 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">Cliente</th>
                <th className="text-left px-4 py-3 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">CUIT</th>
                <th className="text-left px-4 py-3 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">Email</th>
                <th className="text-left px-4 py-3 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">Teléfono</th>
                <th className="text-left px-4 py-3 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">Estado</th>
                <th className="text-right px-4 py-3 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">Facturación Anual</th>
                <th className="text-right px-4 py-3 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">Saldo Pendiente</th>
                <th className="text-right px-4 py-3 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-rule-soft">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="skeleton h-3.5 w-3/4" /></td>
                    ))}
                  </tr>
                ))
              ) : paged.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-ink-300 italic">
                    Sin clientes que matcheen los filtros.
                  </td>
                </tr>
              ) : (
                paged.map((row) => (
                  <tr key={row.c.id} className="border-b border-rule-soft hover:bg-paper-100">
                    <td className="px-4 py-3 text-ink font-medium">{row.c.name}</td>
                    <td className="px-4 py-3 text-ink-400 tabular-nums">{row.c.tax_id ?? "—"}</td>
                    <td className="px-4 py-3 text-ink-400">{row.c.contact_email ?? "—"}</td>
                    <td className="px-4 py-3 text-ink-400 tabular-nums">{row.c.contact_phone ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StatePill state={row.classification} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink">
                      {formatMoney(row.finances.facturacionPeriodo)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink">
                      {formatMoney(row.finances.saldoPendiente)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Link
                          href={`/cliente/${row.c.id}`}
                          className="p-1.5 rounded-premium-sm text-ink-400 hover:text-ink hover:bg-paper-200 transition-colors"
                          title="Ver"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Link>
                        <Link
                          href={`/cliente/${row.c.id}`}
                          className="p-1.5 rounded-premium-sm text-ink-400 hover:text-ink hover:bg-paper-200 transition-colors"
                          title="Editar"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Link>
                        <button
                          className="p-1.5 rounded-premium-sm text-ink-400 hover:text-ink hover:bg-paper-200 transition-colors"
                          title="Más"
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
        <div className="px-5 py-3 border-t border-rule flex items-center justify-between">
          <div className="text-xs text-ink-300">
            Mostrando {filteredList.length === 0 ? 0 : safePage * pageSize + 1} a{" "}
            {Math.min((safePage + 1) * pageSize, filteredList.length)} de {filteredList.length} clientes
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(Math.max(0, safePage - 1))}
              disabled={safePage === 0}
              className="px-2.5 h-7 text-xs text-ink-400 disabled:opacity-40 hover:text-ink transition-colors"
            >
              ‹ Anterior
            </button>
            {Array.from({ length: Math.min(totalPages, 3) }).map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className={cn(
                  "min-w-7 h-7 text-xs rounded-premium-sm transition-colors",
                  safePage === i
                    ? "bg-ink text-paper font-semibold"
                    : "text-ink-400 hover:bg-paper-200",
                )}
              >
                {i + 1}
              </button>
            ))}
            {totalPages > 3 && (
              <>
                <span className="text-ink-300 text-xs px-1">…</span>
                <button
                  onClick={() => setPage(totalPages - 1)}
                  className={cn(
                    "min-w-7 h-7 text-xs rounded-premium-sm transition-colors px-2",
                    safePage === totalPages - 1
                      ? "bg-ink text-paper font-semibold"
                      : "text-ink-400 hover:bg-paper-200",
                  )}
                >
                  {totalPages}
                </button>
              </>
            )}
            <button
              onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
              disabled={safePage >= totalPages - 1}
              className="px-2.5 h-7 text-xs text-ink-400 disabled:opacity-40 hover:text-ink transition-colors"
            >
              Siguiente ›
            </button>
          </div>
        </div>
      </div>

      {/* Modal de creación de cliente (mismo que el legacy del hub) */}
      <NewClientModal
        open={newClientModal}
        onClose={() => setNewClientModal(false)}
        onCreated={() => {
          setNewClientModal(false);
          refresh();
        }}
      />
    </div>
  );
}

// ============================================================
// Subcomponentes
// ============================================================

function KpiCardBig({
  label,
  value,
  delta,
  icon,
  loading,
}: {
  label: string;
  value: string;
  delta: number | null;
  icon?: React.ReactNode;
  loading?: boolean;
}) {
  const showDelta = delta != null && !Number.isNaN(delta);
  return (
    <div className="bg-paper border border-rule rounded-premium shadow-premium-xs p-5">
      <div className="flex items-start justify-between">
        <div className="text-xs text-ink-400 font-medium">{label}</div>
        <div className="text-ink-300 bg-paper-200 rounded-full w-7 h-7 flex items-center justify-center">
          {icon}
        </div>
      </div>
      {loading ? (
        <div className="skeleton h-8 w-24 mt-3" />
      ) : (
        <>
          <div className="mt-3 text-3xl font-semibold tracking-tight tabular-nums text-ink">
            {value}
          </div>
          <div className="mt-1.5 text-xs">
            {showDelta && (
              <>
                <span
                  className={cn(
                    "font-semibold",
                    (delta ?? 0) >= 0 ? "text-success" : "text-danger",
                  )}
                >
                  {(delta ?? 0) >= 0 ? "+" : ""}
                  {(delta ?? 0).toFixed(1)}%
                </span>{" "}
                <span className="text-ink-300">vs. año anterior</span>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatePill({
  state,
}: {
  state: string;
}) {
  const config: Record<string, { label: string; classes: string }> = {
    activo: {
      label: "Activo",
      classes: "bg-emerald-50 text-emerald-700",
    },
    inactivo: {
      label: "Inactivo",
      classes: "bg-slate-100 text-slate-600",
    },
    moroso: {
      label: "Moroso",
      classes: "bg-orange-50 text-orange-700",
    },
  };
  const c = config[state] ?? config.inactivo;
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

// ============================================================
// Helpers
// ============================================================

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
