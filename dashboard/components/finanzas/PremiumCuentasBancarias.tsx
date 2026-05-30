"use client";

/**
 * PremiumCuentasBancarias — vista Cuentas Bancarias de Finanzas
 * matcheando el mockup del estudio contable.
 *
 * Layout:
 *   Header: título + período + "+ Agregar Cuenta"
 *   Row 1: 4 KPI cards con sparkline
 *     · Saldo Total Disponible (USD-eq)
 *     · Total en Pesos (suma ARS + UYU)
 *     · Total en Dólares (suma USD)
 *     · Cuentas Activas (count)
 *   Row 2 (1/2 + 1/2):
 *     · "Mis Cuentas" — lista compacta + Gestionar Cuentas
 *     · "Evolución del Saldo Total" — area/line chart por mes
 *   Row 3: "Últimos Movimientos" tabla con búsqueda + filtros +
 *          exportar CSV + paginación
 *
 * Source of truth: cuentas_bancarias + cuenta_movimientos (lib/
 * cuentas-bancarias). El current_balance lo mantiene un trigger
 * AFTER INSERT/UPDATE/DELETE sobre cuenta_movimientos en DB.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  Plus,
  Eye,
  Download,
  MoreHorizontal,
  Filter,
  Search,
  Wallet,
  Banknote,
  DollarSign,
  Landmark,
  FileText as FileTextIcon,
  Trash2,
  Pencil,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import {
  BANK_COLOR,
  BANK_LABEL,
  CATEGORIA_COLOR,
  CATEGORIA_LABEL,
  createCuenta,
  createMovimiento,
  deleteCuenta,
  deleteMovimiento,
  formatCurrency,
  listCuentas,
  listMovimientos,
  type BankSlug,
  type CuentaBancaria,
  type CuentaMovimiento,
  type Currency,
  type MovimientoCategoria,
} from "@/lib/cuentas-bancarias";
import { Button } from "@/components/premium/Button";
import { Modal } from "@/components/premium/Modal";
import { Field, Input, Select } from "@/components/premium/Field";
import { cn } from "@/lib/cn";

const MONTHS_SHORT_ES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

type PeriodMode = "this_year" | "last_year" | "last_12m" | "ytd" | "custom";

/**
 * Cotizaciones aproximadas para mostrar "saldo total disponible" en
 * USD-eq. NO se persiste — es solo presentación. Para producción real
 * habría que tirar de una API de FX y guardar.
 */
const FX_TO_USD: Record<Currency, number> = {
  USD: 1,
  EUR: 1.08,
  ARS: 1 / 1100,
  UYU: 1 / 39,
  BRL: 1 / 5.5,
};

function toUsd(amount: number, currency: Currency): number {
  return amount * (FX_TO_USD[currency] ?? 0);
}

function formatUsdCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `USD ${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `USD ${(n / 1_000).toFixed(0)}K`;
  return `USD ${Math.round(n).toLocaleString("es-AR")}`;
}

function formatPesosCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$ ${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$ ${(n / 1_000).toFixed(0)}K`;
  return `$ ${Math.round(n).toLocaleString("es-AR")}`;
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
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

function shiftYearMonth(yyyymm: string, years: number): string {
  const [y, m] = yyyymm.split("-").map(Number);
  return `${y + years}-${String(m).padStart(2, "0")}`;
}

export function PremiumCuentasBancarias() {
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([]);
  const [movs, setMovs] = useState<CuentaMovimiento[]>([]);
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
  const [catFilter, setCatFilter] = useState<"all" | MovimientoCategoria>("all");
  const [accFilter, setAccFilter] = useState<"all" | string>("all");
  const [page, setPage] = useState(0);
  const pageSize = 8;

  // Modales
  const [newCuentaModal, setNewCuentaModal] = useState(false);
  const [manageCuentasModal, setManageCuentasModal] = useState(false);
  const [newMovModal, setNewMovModal] = useState(false);

  // ---- form: nueva cuenta
  const [nc, setNc] = useState<{
    bank_slug: BankSlug;
    bank_name: string;
    account_name: string;
    last4: string;
    currency: Currency;
    initial_balance: string;
  }>({
    bank_slug: "nacion",
    bank_name: "Banco de la Nación Argentina",
    account_name: "",
    last4: "",
    currency: "ARS",
    initial_balance: "0",
  });
  const [savingCuenta, setSavingCuenta] = useState(false);

  // ---- form: nuevo movimiento
  const [nm, setNm] = useState<{
    cuenta_id: string;
    fecha: string;
    description: string;
    category: MovimientoCategoria;
    direction: "entry" | "exit";
    amount: string;
  }>({
    cuenta_id: "",
    fecha: new Date().toISOString().slice(0, 10),
    description: "",
    category: "ingreso",
    direction: "entry",
    amount: "",
  });
  const [savingMov, setSavingMov] = useState(false);

  function refresh() {
    setLoading(true);
    Promise.all([listCuentas(), listMovimientos()]).then(([c, m]) => {
      setCuentas(c);
      setMovs(m);
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

  // ===== KPIs =====
  const cuentasActivas = cuentas.filter((c) => c.is_active);
  const cuentasActivasCount = cuentasActivas.length;
  const cuentasTotal = cuentas.length;

  const totalUsd = cuentasActivas.reduce(
    (s, c) => s + toUsd(c.current_balance, c.currency),
    0,
  );
  const totalPesos = cuentasActivas
    .filter((c) => c.currency === "ARS" || c.currency === "UYU")
    .reduce((s, c) => s + c.current_balance, 0);
  const totalDolares = cuentasActivas
    .filter((c) => c.currency === "USD")
    .reduce((s, c) => s + c.current_balance, 0);

  // Deltas vs mes anterior (sumando movimientos del mes anterior contra los del actual)
  const curMonth = new Date().toISOString().slice(0, 7);
  const prevMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth() - 1,
    1,
  )
    .toISOString()
    .slice(0, 7);

  function netDeltaUsdForMonth(yyyymm: string): number {
    return movs
      .filter((m) => m.fecha.slice(0, 7) === yyyymm)
      .reduce((s, m) => {
        const cuenta = cuentas.find((c) => c.id === m.cuenta_id);
        if (!cuenta) return s;
        const net = m.entry_amount - m.exit_amount;
        return s + toUsd(net, cuenta.currency);
      }, 0);
  }

  function netDeltaForMonth(
    yyyymm: string,
    filter: (c: CuentaBancaria) => boolean,
  ): number {
    return movs
      .filter((m) => m.fecha.slice(0, 7) === yyyymm)
      .reduce((s, m) => {
        const cuenta = cuentas.find((c) => c.id === m.cuenta_id);
        if (!cuenta || !filter(cuenta)) return s;
        const net = m.entry_amount - m.exit_amount;
        return s + net;
      }, 0);
  }

  const deltaTotalUsd = netDeltaUsdForMonth(curMonth) - netDeltaUsdForMonth(prevMonth);
  const deltaPesos =
    netDeltaForMonth(curMonth, (c) => c.currency === "ARS" || c.currency === "UYU") -
    netDeltaForMonth(prevMonth, (c) => c.currency === "ARS" || c.currency === "UYU");
  const deltaDolares =
    netDeltaForMonth(curMonth, (c) => c.currency === "USD") -
    netDeltaForMonth(prevMonth, (c) => c.currency === "USD");

  function pctDelta(curr: number, base: number): number | null {
    if (base === 0) return curr === 0 ? 0 : null;
    return ((curr - base) / Math.abs(base)) * 100;
  }
  const totalUsdPrev = totalUsd - deltaTotalUsd;
  const totalPesosPrev = totalPesos - deltaPesos;
  const totalDolaresPrev = totalDolares - deltaDolares;

  const cuentasActivasPct =
    cuentasTotal > 0 ? Math.round((cuentasActivasCount / cuentasTotal) * 100) : 0;

  // ===== Sparklines (último 6 meses de saldo USD-eq) =====
  const sparkData = useMemo(() => {
    const out: { v: number }[] = [];
    const now = new Date();
    // Empezamos en el saldo actual y restamos el net de cada mes futuro retrocediendo
    let runningUsd = totalUsd;
    for (let i = 0; i < 6; i++) {
      out.push({ v: runningUsd });
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mk = d.toISOString().slice(0, 7);
      runningUsd -= netDeltaUsdForMonth(mk);
    }
    return out.reverse();
  }, [totalUsd, movs, cuentas]);

  // ===== Evolución del saldo total (line chart) =====
  // Calculamos saldo USD-eq al final de cada mes del período.
  const evolucionData = useMemo(() => {
    const months = monthsBetween(period.from, period.to);
    // Movs ordenados por fecha asc — reconstruimos histórico
    const sortedMovs = [...movs].sort((a, b) =>
      a.fecha.localeCompare(b.fecha),
    );
    return months.map((mk) => {
      // Saldo USD-eq al cierre de mk: sumar todos los movs con fecha
      // YYYY-MM-DD <= último día de mk, convertir a USD.
      const lastDay = (() => {
        const [yy, mm] = mk.split("-").map(Number);
        const d = new Date(yy, mm, 0).getDate();
        return `${mk}-${String(d).padStart(2, "0")}`;
      })();
      const saldoUsd = sortedMovs
        .filter((m) => m.fecha <= lastDay)
        .reduce((s, m) => {
          const cuenta = cuentas.find((c) => c.id === m.cuenta_id);
          if (!cuenta) return s;
          const net = m.entry_amount - m.exit_amount;
          return s + toUsd(net, cuenta.currency);
        }, 0);
      const [_, mm] = mk.split("-").map(Number);
      return {
        label: MONTHS_SHORT_ES[mm - 1],
        saldo: saldoUsd,
      };
    });
  }, [movs, cuentas, period.from, period.to]);

  // ===== Lista filtrada de movimientos para la tabla =====
  const filteredMovs = movs
    .filter((m) => {
      if (catFilter !== "all" && m.category !== catFilter) return false;
      if (accFilter !== "all" && m.cuenta_id !== accFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const cuenta = cuentas.find((c) => c.id === m.cuenta_id);
        const cuentaLabel = cuenta ? `${cuenta.bank_name} ${cuenta.last4}`.toLowerCase() : "";
        return (
          m.description.toLowerCase().includes(q) ||
          (m.notes ?? "").toLowerCase().includes(q) ||
          cuentaLabel.includes(q)
        );
      }
      return true;
    });

  const totalPages = Math.max(1, Math.ceil(filteredMovs.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const paged = filteredMovs.slice(safePage * pageSize, (safePage + 1) * pageSize);

  // Para mostrar "Saldo" snapshot por fila usamos saldo posterior al mov.
  // Ordenamos por fecha asc para calcular saldo acumulado por cuenta,
  // después remapeamos.
  const saldoSnapshot = useMemo(() => {
    const map = new Map<string, { saldoCuenta: number }>();
    // Por cada cuenta, ordenar sus movs por fecha asc y calcular saldo acumulado
    for (const cuenta of cuentas) {
      const movsCuenta = movs
        .filter((m) => m.cuenta_id === cuenta.id)
        .sort(
          (a, b) =>
            a.fecha.localeCompare(b.fecha) ||
            a.created_at.localeCompare(b.created_at),
        );
      let running = 0;
      for (const m of movsCuenta) {
        running += m.entry_amount - m.exit_amount;
        map.set(m.id, { saldoCuenta: running });
      }
    }
    return map;
  }, [movs, cuentas]);

  // ===== Acciones =====
  async function handleCreateCuenta() {
    if (!nc.bank_name || !nc.last4) {
      toast.error("Banco y últimos 4 dígitos son obligatorios");
      return;
    }
    setSavingCuenta(true);
    try {
      await createCuenta({
        bank_slug: nc.bank_slug,
        bank_name: nc.bank_name,
        account_name: nc.account_name,
        last4: nc.last4,
        currency: nc.currency,
        initial_balance: Number(nc.initial_balance) || 0,
      });
      toast.success("Cuenta agregada");
      setNewCuentaModal(false);
      setNc({
        bank_slug: "nacion",
        bank_name: "Banco de la Nación Argentina",
        account_name: "",
        last4: "",
        currency: "ARS",
        initial_balance: "0",
      });
      refresh();
    } catch (err) {
      const e = err as Error;
      toast.error(`Error: ${e.message}`);
    } finally {
      setSavingCuenta(false);
    }
  }

  async function handleDeleteCuenta(c: CuentaBancaria) {
    if (
      !confirm(
        `¿Eliminar la cuenta ${c.bank_name} (····${c.last4})?\n\n` +
          `Esto borra TODOS sus movimientos. Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }
    try {
      await deleteCuenta(c.id);
      toast.success("Cuenta eliminada");
      refresh();
    } catch (err) {
      const e = err as Error;
      toast.error(`Error: ${e.message}`);
    }
  }

  async function handleCreateMov() {
    if (!nm.cuenta_id || !nm.amount || !nm.description) {
      toast.error("Cuenta, descripción e importe son obligatorios");
      return;
    }
    const amt = Number(nm.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Importe inválido");
      return;
    }
    setSavingMov(true);
    try {
      await createMovimiento({
        cuenta_id: nm.cuenta_id,
        fecha: nm.fecha,
        description: nm.description,
        category: nm.category,
        entry_amount: nm.direction === "entry" ? amt : 0,
        exit_amount: nm.direction === "exit" ? amt : 0,
      });
      toast.success("Movimiento registrado");
      setNewMovModal(false);
      setNm({
        cuenta_id: "",
        fecha: new Date().toISOString().slice(0, 10),
        description: "",
        category: "ingreso",
        direction: "entry",
        amount: "",
      });
      refresh();
    } catch (err) {
      const e = err as Error;
      toast.error(`Error: ${e.message}`);
    } finally {
      setSavingMov(false);
    }
  }

  async function handleDeleteMov(m: CuentaMovimiento) {
    if (!confirm("¿Eliminar este movimiento? El saldo de la cuenta se recalcula.")) {
      return;
    }
    try {
      await deleteMovimiento(m.id);
      toast.success("Movimiento eliminado");
      refresh();
    } catch (err) {
      const e = err as Error;
      toast.error(`Error: ${e.message}`);
    }
  }

  function exportCsv() {
    const header = ["Fecha", "Cuenta", "Descripción", "Categoría", "Entrada", "Salida", "Saldo cuenta", "Moneda"];
    const rows = filteredMovs.map((m) => {
      const cuenta = cuentas.find((c) => c.id === m.cuenta_id);
      const cuentaLabel = cuenta ? `${cuenta.bank_name} ····${cuenta.last4}` : "—";
      const saldo = saldoSnapshot.get(m.id)?.saldoCuenta ?? 0;
      return [
        m.fecha,
        cuentaLabel,
        m.description,
        CATEGORIA_LABEL[m.category],
        m.entry_amount > 0 ? m.entry_amount.toFixed(2) : "",
        m.exit_amount > 0 ? m.exit_amount.toFixed(2) : "",
        saldo.toFixed(2),
        cuenta?.currency ?? "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",");
    });
    const csv = "﻿" + [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `movimientos-${period.from}_${period.to}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("CSV descargado");
  }

  return (
    <div className="space-y-6">
      {/* ===== Header ===== */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-ink tracking-tight">
            Cuentas Bancarias
          </h1>
          <p className="text-sm text-ink-300 mt-1">
            Gestioná y controlá todas las cuentas bancarias de tu empresa.
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
          <Button variant="secondary" size="md" onClick={() => setNewMovModal(true)}>
            <Plus className="w-4 h-4" />
            Movimiento
          </Button>
          <Button variant="primary" size="md" onClick={() => setNewCuentaModal(true)}>
            <Plus className="w-4 h-4" />
            Agregar Cuenta
          </Button>
        </div>
      </div>

      {/* ===== Row 1: 4 KPIs ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Saldo Total Disponible"
          value={formatUsdCompact(totalUsd)}
          delta={pctDelta(totalUsd, totalUsdPrev)}
          subLabel="vs. mes anterior"
          icon={<Wallet className="w-4 h-4" />}
          spark={sparkData}
          sparkColor="#1E3A8A"
          loading={loading}
        />
        <KpiCard
          label="Total en Pesos"
          value={formatPesosCompact(totalPesos)}
          delta={pctDelta(totalPesos, totalPesosPrev)}
          subLabel="vs. mes anterior"
          icon={<Banknote className="w-4 h-4" />}
          spark={sparkData}
          sparkColor="#3B82F6"
          loading={loading}
        />
        <KpiCard
          label="Total en Dólares"
          value={`USD ${Math.round(totalDolares).toLocaleString("es-AR")}`}
          delta={pctDelta(totalDolares, totalDolaresPrev)}
          subLabel="vs. mes anterior"
          icon={<DollarSign className="w-4 h-4" />}
          spark={sparkData}
          sparkColor="#16C75A"
          loading={loading}
        />
        <KpiCard
          label="Cuentas Activas"
          value={String(cuentasActivasCount)}
          subLabel={`${cuentasActivasPct}% del total`}
          icon={<Landmark className="w-4 h-4" />}
          spark={sparkData}
          sparkColor="#A78BFA"
          loading={loading}
        />
      </div>

      {/* ===== Row 2: Mis Cuentas + Evolución ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Mis Cuentas */}
        <div className="bg-paper border border-rule rounded-premium shadow-premium-xs">
          <div className="px-5 py-4 border-b border-rule flex items-center justify-between">
            <div className="font-semibold text-ink text-md">Mis Cuentas</div>
            <button
              onClick={() => setManageCuentasModal(true)}
              className="inline-flex items-center gap-1.5 px-3 h-7 text-xs font-medium text-ink-500 bg-paper border border-rule rounded-premium-sm hover:border-rule-strong transition-colors"
            >
              Gestionar Cuentas
            </button>
          </div>
          <div className="divide-y divide-rule-soft">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="px-5 py-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full skeleton" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-40 skeleton" />
                    <div className="h-2.5 w-20 skeleton" />
                  </div>
                  <div className="h-4 w-24 skeleton" />
                </div>
              ))
            ) : cuentas.length === 0 ? (
              <div className="px-5 py-10 text-center text-ink-300 italic text-xs">
                Sin cuentas todavía. Agregá la primera con el botón de
                arriba.
              </div>
            ) : (
              cuentas.slice(0, 5).map((c) => (
                <div key={c.id} className="px-5 py-3 flex items-center gap-3">
                  <BankAvatar slug={c.bank_slug} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink truncate">
                      {c.bank_name}
                    </div>
                    <div className="text-xs text-ink-300 tabular-nums">···· {c.last4}</div>
                  </div>
                  <div className="text-xs text-ink-300 w-8 text-right tabular-nums">
                    {c.currency === "USD" ? "USD" : c.currency === "EUR" ? "€" : c.currency === "BRL" ? "R$" : "$"}
                  </div>
                  <div className="text-sm font-semibold text-ink tabular-nums w-32 text-right">
                    {formatCurrency(c.current_balance, c.currency)}
                  </div>
                </div>
              ))
            )}
          </div>
          {cuentas.length > 5 && (
            <div className="px-5 py-3 border-t border-rule">
              <button
                onClick={() => setManageCuentasModal(true)}
                className="text-xs text-info hover:underline"
              >
                Ver todas las cuentas →
              </button>
            </div>
          )}
        </div>

        {/* Evolución del Saldo Total */}
        <div className="bg-paper border border-rule rounded-premium shadow-premium-xs">
          <div className="px-5 py-4 border-b border-rule flex items-center justify-between">
            <div className="font-semibold text-ink text-md">
              Evolución del Saldo Total
            </div>
            <div className="text-xs text-ink-300 inline-flex items-center gap-1.5 px-2.5 h-7 border border-rule rounded-premium-sm">
              <Calendar className="w-3 h-3" />
              {periodMode === "this_year" ? "Este año" : period.label}
            </div>
          </div>
          <div className="p-4">
            {loading ? (
              <div className="h-64 skeleton" />
            ) : evolucionData.every((d) => d.saldo === 0) ? (
              <div className="h-64 flex items-center justify-center text-ink-300 italic text-xs">
                Sin movimientos todavía. Cargá uno para ver la evolución.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart
                  data={evolucionData}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="saldoGrad" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#1E3A8A" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="#1E3A8A" stopOpacity={0} />
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
                      v >= 1_000_000
                        ? `${(v / 1_000_000).toFixed(0)}M`
                        : v >= 1_000
                          ? `${(v / 1_000).toFixed(0)}k`
                          : String(v)
                    }
                  />
                  <Tooltip
                    formatter={(v: number) => formatUsdCompact(v)}
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
                    dataKey="saldo"
                    stroke="#1E3A8A"
                    strokeWidth={2.5}
                    fill="url(#saldoGrad)"
                    dot={{ r: 3, fill: "#1E3A8A", strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ===== Row 3: Últimos Movimientos ===== */}
      <div className="bg-paper border border-rule rounded-premium shadow-premium-xs">
        <div className="px-5 py-4 border-b border-rule flex items-center justify-between gap-3 flex-wrap">
          <div className="font-semibold text-ink text-md">Últimos Movimientos</div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-300" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                placeholder="Buscar movimientos…"
                className="pl-8 pr-3 h-8 w-56 text-xs bg-paper-100 border border-rule rounded-premium-sm placeholder-ink-300 focus:outline-none focus:border-ink-300 focus:bg-paper transition-colors"
              />
            </div>
            <select
              value={catFilter}
              onChange={(e) => { setCatFilter(e.target.value as typeof catFilter); setPage(0); }}
              className="h-8 px-2.5 text-xs bg-paper border border-rule rounded-premium-sm cursor-pointer focus:outline-none focus:border-ink-300"
            >
              <option value="all">Todas las categorías</option>
              {(Object.keys(CATEGORIA_LABEL) as MovimientoCategoria[]).map((k) => (
                <option key={k} value={k}>{CATEGORIA_LABEL[k]}</option>
              ))}
            </select>
            <select
              value={accFilter}
              onChange={(e) => { setAccFilter(e.target.value); setPage(0); }}
              className="h-8 px-2.5 text-xs bg-paper border border-rule rounded-premium-sm cursor-pointer focus:outline-none focus:border-ink-300 max-w-[180px]"
            >
              <option value="all">Todas las cuentas</option>
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.bank_name} ····{c.last4}
                </option>
              ))}
            </select>
            <button
              onClick={exportCsv}
              className="inline-flex items-center gap-1.5 px-3 h-8 text-xs text-ink-500 bg-paper border border-rule rounded-premium-sm hover:border-rule-strong transition-colors"
              title="Exportar CSV"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar
            </button>
            <button
              className="inline-flex items-center justify-center w-8 h-8 text-ink-400 bg-paper border border-rule rounded-premium-sm hover:border-rule-strong hover:text-ink transition-colors"
              title="Más"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-paper-100/60 border-b border-rule">
                <th className="text-left px-4 py-3 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">Fecha</th>
                <th className="text-left px-4 py-3 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">Cuenta</th>
                <th className="text-left px-4 py-3 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">Descripción</th>
                <th className="text-left px-4 py-3 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">Categoría</th>
                <th className="text-right px-4 py-3 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">Entrada</th>
                <th className="text-right px-4 py-3 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">Salida</th>
                <th className="text-right px-4 py-3 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">Saldo</th>
                <th className="text-center px-4 py-3 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">Comprobante</th>
                <th className="text-right px-4 py-3 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-rule-soft">
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="skeleton h-3.5 w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : paged.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-ink-300 italic">
                    Sin movimientos.
                  </td>
                </tr>
              ) : (
                paged.map((m) => {
                  const cuenta = cuentas.find((c) => c.id === m.cuenta_id);
                  const saldo = saldoSnapshot.get(m.id)?.saldoCuenta ?? 0;
                  return (
                    <tr key={m.id} className="border-b border-rule-soft hover:bg-paper-100">
                      <td className="px-4 py-3 text-ink-400 tabular-nums">{m.fecha}</td>
                      <td className="px-4 py-3 text-ink">
                        {cuenta ? (
                          <span className="flex items-center gap-2">
                            <span
                              className="inline-block w-1.5 h-1.5 rounded-full"
                              style={{ background: BANK_COLOR[cuenta.bank_slug].text }}
                            />
                            <span>
                              {cuenta.bank_name.split(" ")[0]} ····{cuenta.last4}
                            </span>
                          </span>
                        ) : (
                          <span className="text-ink-300 italic">eliminada</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-ink">{m.description}</td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center px-2.5 py-0.5 text-2xs font-semibold rounded-full",
                            CATEGORIA_COLOR[m.category],
                          )}
                        >
                          {CATEGORIA_LABEL[m.category]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-emerald-700 font-medium">
                        {m.entry_amount > 0 && cuenta
                          ? formatCurrency(m.entry_amount, cuenta.currency)
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-rose-700 font-medium">
                        {m.exit_amount > 0 && cuenta
                          ? formatCurrency(m.exit_amount, cuenta.currency)
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink font-semibold">
                        {cuenta ? formatCurrency(saldo, cuenta.currency) : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {m.comprobante_id ? (
                          <FileTextIcon className="w-3.5 h-3.5 text-ink-400 inline-block" />
                        ) : (
                          <span className="text-ink-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => handleDeleteMov(m)}
                            className="p-1.5 rounded-premium-sm text-ink-400 hover:text-danger hover:bg-danger/10 transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-rule flex items-center justify-between">
          <div className="text-xs text-ink-300">
            Mostrando {filteredMovs.length === 0 ? 0 : safePage * pageSize + 1} a{" "}
            {Math.min((safePage + 1) * pageSize, filteredMovs.length)} de{" "}
            {filteredMovs.length} movimientos
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
                  "min-w-7 h-7 text-xs rounded-premium-sm transition-colors px-2",
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

      {/* Modal: Nueva cuenta */}
      <Modal
        open={newCuentaModal}
        onClose={() => !savingCuenta && setNewCuentaModal(false)}
        title="Agregar cuenta bancaria"
        description="Registrá una nueva cuenta. El saldo se calcula automáticamente con los movimientos."
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setNewCuentaModal(false)} disabled={savingCuenta}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={handleCreateCuenta} loading={savingCuenta}>
              Crear cuenta
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Banco" required>
            <Select
              value={nc.bank_slug}
              onChange={(e) => {
                const slug = e.target.value as BankSlug;
                setNc({ ...nc, bank_slug: slug, bank_name: BANK_LABEL[slug] });
              }}
            >
              {(Object.keys(BANK_LABEL) as BankSlug[]).map((k) => (
                <option key={k} value={k}>{BANK_LABEL[k]}</option>
              ))}
            </Select>
          </Field>
          {nc.bank_slug === "otro" && (
            <Field label="Nombre del banco" required>
              <Input
                value={nc.bank_name}
                onChange={(e) => setNc({ ...nc, bank_name: e.target.value })}
                placeholder="Ej: Brubank"
              />
            </Field>
          )}
          <Field label="Alias de la cuenta (opcional)" hint="Para distinguir cuentas del mismo banco.">
            <Input
              value={nc.account_name}
              onChange={(e) => setNc({ ...nc, account_name: e.target.value })}
              placeholder="Ej: Cuenta corriente principal"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Últimos 4 dígitos" required>
              <Input
                value={nc.last4}
                onChange={(e) => setNc({ ...nc, last4: e.target.value })}
                placeholder="1234"
                maxLength={4}
              />
            </Field>
            <Field label="Moneda" required>
              <Select
                value={nc.currency}
                onChange={(e) => setNc({ ...nc, currency: e.target.value as Currency })}
              >
                <option value="ARS">ARS — Pesos argentinos</option>
                <option value="UYU">UYU — Pesos uruguayos</option>
                <option value="USD">USD — Dólares</option>
                <option value="EUR">EUR — Euros</option>
                <option value="BRL">BRL — Reales</option>
              </Select>
            </Field>
          </div>
          <Field
            label="Saldo de apertura (opcional)"
            hint="Se registra como un movimiento 'ingreso' inicial."
          >
            <Input
              type="number"
              value={nc.initial_balance}
              onChange={(e) => setNc({ ...nc, initial_balance: e.target.value })}
              placeholder="0"
            />
          </Field>
        </div>
      </Modal>

      {/* Modal: Gestionar cuentas (lista completa con delete) */}
      <Modal
        open={manageCuentasModal}
        onClose={() => setManageCuentasModal(false)}
        title="Gestionar cuentas"
        description="Lista completa de cuentas bancarias."
        size="lg"
        footer={
          <Button variant="ghost" onClick={() => setManageCuentasModal(false)}>
            Cerrar
          </Button>
        }
      >
        {cuentas.length === 0 ? (
          <div className="py-10 text-center text-ink-300 italic text-xs">
            Sin cuentas registradas.
          </div>
        ) : (
          <div className="border border-rule rounded-premium-sm overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-paper-100/60 border-b border-rule">
                  <th className="text-left px-3 py-2 text-2xs uppercase tracking-wider text-ink-300 font-semibold">Banco</th>
                  <th className="text-left px-3 py-2 text-2xs uppercase tracking-wider text-ink-300 font-semibold">····</th>
                  <th className="text-left px-3 py-2 text-2xs uppercase tracking-wider text-ink-300 font-semibold">Moneda</th>
                  <th className="text-right px-3 py-2 text-2xs uppercase tracking-wider text-ink-300 font-semibold">Saldo</th>
                  <th className="text-right px-3 py-2 text-2xs uppercase tracking-wider text-ink-300 font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {cuentas.map((c) => (
                  <tr key={c.id} className="border-t border-rule-soft">
                    <td className="px-3 py-2 text-ink">
                      <div className="flex items-center gap-2">
                        <BankAvatar slug={c.bank_slug} size="sm" />
                        <span>{c.bank_name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-ink-400 tabular-nums">···· {c.last4}</td>
                    <td className="px-3 py-2 text-ink-400">{c.currency}</td>
                    <td className="px-3 py-2 text-right text-ink tabular-nums">
                      {formatCurrency(c.current_balance, c.currency)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => handleDeleteCuenta(c)}
                        className="p-1.5 rounded-premium-sm text-ink-400 hover:text-danger hover:bg-danger/10 transition-colors"
                        title="Eliminar cuenta"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* Modal: Nuevo movimiento */}
      <Modal
        open={newMovModal}
        onClose={() => !savingMov && setNewMovModal(false)}
        title="Registrar movimiento"
        description="El saldo de la cuenta se actualiza automáticamente."
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setNewMovModal(false)} disabled={savingMov}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={handleCreateMov} loading={savingMov}>
              Registrar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Cuenta" required>
            <Select
              value={nm.cuenta_id}
              onChange={(e) => setNm({ ...nm, cuenta_id: e.target.value })}
            >
              <option value="">Elegí una cuenta…</option>
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.bank_name} ····{c.last4} ({c.currency})
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha" required>
              <Input
                type="date"
                value={nm.fecha}
                onChange={(e) => setNm({ ...nm, fecha: e.target.value })}
              />
            </Field>
            <Field label="Categoría" required>
              <Select
                value={nm.category}
                onChange={(e) => setNm({ ...nm, category: e.target.value as MovimientoCategoria })}
              >
                {(Object.keys(CATEGORIA_LABEL) as MovimientoCategoria[]).map((k) => (
                  <option key={k} value={k}>{CATEGORIA_LABEL[k]}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Descripción" required>
            <Input
              value={nm.description}
              onChange={(e) => setNm({ ...nm, description: e.target.value })}
              placeholder="Ej: Pago de Factura FAC 0001-00001234"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo de movimiento" required>
              <Select
                value={nm.direction}
                onChange={(e) => setNm({ ...nm, direction: e.target.value as "entry" | "exit" })}
              >
                <option value="entry">Entrada (suma al saldo)</option>
                <option value="exit">Salida (resta del saldo)</option>
              </Select>
            </Field>
            <Field label="Importe" required>
              <Input
                type="number"
                value={nm.amount}
                onChange={(e) => setNm({ ...nm, amount: e.target.value })}
                placeholder="0.00"
              />
            </Field>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ============================================================
// Subcomponentes
// ============================================================
function BankAvatar({
  slug,
  size = "md",
}: {
  slug: BankSlug;
  size?: "sm" | "md";
}) {
  const colors = BANK_COLOR[slug];
  const initials = BANK_LABEL[slug]
    .split(" ")
    .map((w) => w[0])
    .filter((c) => /[A-Z]/.test(c))
    .slice(0, 2)
    .join("");
  const cls = size === "sm" ? "w-6 h-6 text-2xs" : "w-9 h-9 text-xs";
  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-semibold shrink-0",
        cls,
      )}
      style={{ background: colors.bg, color: colors.text }}
    >
      {initials || "B"}
    </div>
  );
}

function KpiCard({
  label,
  value,
  delta,
  subLabel,
  icon,
  spark,
  sparkColor = "#16C75A",
  loading,
}: {
  label: string;
  value: string;
  delta?: number | null;
  subLabel?: string;
  icon?: React.ReactNode;
  spark: { v: number }[];
  sparkColor?: string;
  loading?: boolean;
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
      {loading ? (
        <>
          <div className="skeleton h-7 w-32 mt-2" />
          <div className="skeleton h-3 w-20 mt-2" />
        </>
      ) : (
        <>
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
        </>
      )}
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
