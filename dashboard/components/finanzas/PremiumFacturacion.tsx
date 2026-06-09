"use client";

/**
 * PremiumFacturacion — vista Facturación de Finanzas matcheando el
 * mockup del estudio contable (Mercury/Ramp style + paleta blue).
 *
 * Layout:
 *   Header: título + período + "+ Nueva Factura"
 *   Row 1: 5 KPI cards (Total · Mes · Emitidas · Ticket Promedio ·
 *          Pendientes de Cobro) con delta + mini sparkline
 *   Row 2 (1/2 + 1/2):
 *     - Line chart "Evolución de Facturación" (este año vs anterior)
 *     - Donut "Facturación por Estado" con legend lateral
 *   Row 3: tabla "Comprobantes Emitidos" con búsqueda + filtros +
 *          exportar + paginación
 *
 * MODELO: cada fila de payments es un "comprobante" virtual:
 *   - Fecha = payment.month + "-01" (o paid_date si existe)
 *   - Comprobante = FAC 0001-{padded number sequencial por mes}
 *   - Cliente = client.name
 *   - Concepto = "Fee mensual {client.name} - {Month YYYY}"
 *   - Importe = payment.amountOverride ?? scheduled ?? client.fee
 *   - Estado = mapeo de payment.status
 *   - Vencimiento = último día del mes facturado
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
  DollarSign,
  TrendingUp,
  FileText,
  Tag,
  Clock,
  Pencil,
  CheckCircle2,
  Trash2,
  XCircle,
} from "lucide-react";
import {
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
  deletePayment,
  effectiveFeeForMonth,
  getClients,
  getPayments,
  listFeeSchedules,
  setPaymentAmount,
  setPaymentPdfUrl,
  setPaymentStatus,
} from "@/lib/storage";
import type {
  Client,
  ClientFeeSchedule,
  InvoicePayment,
} from "@/lib/types";
import { Button } from "@/components/premium/Button";
import { Modal } from "@/components/premium/Modal";
import { Field, Input, Select } from "@/components/premium/Field";
import { FileUpload } from "@/components/premium/FileUpload";
import { cn } from "@/lib/cn";

const MONTHS_SHORT_ES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

const MONTHS_LONG_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// Paleta del mockup
const STATE_COLORS = {
  pagadas: "#1E3A8A",      // navy
  pendientes: "#3B82F6",    // blue-500
  vencidas: "#F87171",      // red-400
  anuladas: "#94A3B8",      // slate-400
};

type PeriodMode = "this_year" | "last_year" | "last_12m" | "ytd" | "custom";

type EstadoFactura = "pagada" | "pendiente" | "vencida" | "anulada";

interface Comprobante {
  id: string;            // payment_id
  number: string;        // FAC 0001-00001234
  fecha: string;         // YYYY-MM-DD (1er día del mes)
  vencimiento: string;   // YYYY-MM-DD (último día del mes)
  client: Client;
  concepto: string;
  importe: number;
  estado: EstadoFactura;
  note?: string | null;
  amountOverride?: number | null;
}

function formatUsd(n: number, opts?: { compact?: boolean }) {
  if (opts?.compact && Math.abs(n) >= 1_000_000) {
    return `USD ${(n / 1_000_000).toFixed(1)}M`;
  }
  if (opts?.compact && Math.abs(n) >= 1_000) {
    return `USD ${(n / 1_000).toFixed(0)}K`;
  }
  return `USD ${Math.round(n).toLocaleString("es-AR")}`;
}

function lastDayOfMonth(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
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

export function PremiumFacturacion() {
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
  const [statusFilter, setStatusFilter] = useState<"all" | EstadoFactura>("all");
  const [page, setPage] = useState(0);
  const pageSize = 8;

  const [newModal, setNewModal] = useState(false);
  const [newClientId, setNewClientId] = useState("");
  const [newMonth, setNewMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [newAmount, setNewAmount] = useState("");
  const [newNote, setNewNote] = useState("");
  /** PDF de la factura subido por el director (factura emitida fuera
   *  del sistema). Opcional — la factura existe sin PDF. */
  const [newPdfUrl, setNewPdfUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Modales por comprobante
  const [detailComp, setDetailComp] = useState<Comprobante | null>(null);
  const [editComp, setEditComp] = useState<Comprobante | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editSaving, setEditSaving] = useState(false);

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

  // ===== Período =====
  const period = useMemo(() => {
    const now = new Date();
    if (periodMode === "this_year") {
      return {
        from: `${now.getFullYear()}-01`,
        to: `${now.getFullYear()}-12`,
        label: `01/01/${now.getFullYear()} - 31/12/${now.getFullYear()}`,
        yearLabel: String(now.getFullYear()),
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

  // ===== Comprobantes (cada payment = una factura) =====
  function feeFor(c: Client, mk: string): number {
    const p = payments.find((pp) => pp.clientId === c.id && pp.month === mk);
    const scheduled = effectiveFeeForMonth(feeSchedules, c.id, mk);
    return p?.amountOverride ?? scheduled ?? c.fee;
  }

  function statusToEstado(p: InvoicePayment): EstadoFactura {
    const now = new Date().toISOString().slice(0, 7);
    if (p.status === "paid") return "pagada";
    if (p.status === "cancelled") return "anulada";
    if (p.status === "late") return "vencida";
    // pending: si el mes ya pasó → vencida; si no → pendiente
    if (p.month < now) return "vencida";
    return "pendiente";
  }

  /** Mapeo inverso: dropdown del usuario → status real en DB.
   *  El UI solo muestra 3 opciones (pagado/pendiente/anulado).
   *  El estado "vencida" se DERIVA desde pending + mes pasado, no se
   *  setea manualmente. */
  async function changeEstado(
    c: Comprobante,
    newEstado: "pagada" | "pendiente" | "anulada",
  ) {
    const statusMap: Record<typeof newEstado, InvoicePayment["status"]> = {
      pagada: "paid",
      pendiente: "pending",
      anulada: "cancelled",
    };
    try {
      await setPaymentStatus(c.client.id, c.fecha.slice(0, 7), statusMap[newEstado]);
      if (newEstado === "pagada") {
        toast.success(
          c.client.default_cuenta_id
            ? `${c.number} pagada. Movimiento creado en la cuenta del cliente.`
            : `${c.number} pagada. ⚠️ El cliente no tiene cuenta bancaria default — el movimiento NO se creó automáticamente.`,
        );
      } else if (newEstado === "anulada") {
        toast.success(`${c.number} anulada`);
      } else {
        toast.success(`${c.number} marcada como pendiente`);
      }
      refresh();
    } catch (err) {
      const e = err as Error;
      toast.error(`Error: ${e.message}`);
    }
  }

  // Generar number "FAC 0001-{sequential}"
  const comprobantes: Comprobante[] = useMemo(() => {
    const filtered = payments
      .filter((p) => p.month >= period.from && p.month <= period.to)
      .sort((a, b) => a.month.localeCompare(b.month));
    const out: (Comprobante | null)[] = filtered.map((p, idx) => {
      const client = clients.find((c) => c.id === p.clientId);
      if (!client) return null;
      const importe = p.amountOverride ?? effectiveFeeForMonth(feeSchedules, p.clientId, p.month) ?? client.fee;
      const [y, m] = p.month.split("-").map(Number);
      const number = `FAC 0001-${String(idx + 1).padStart(8, "0")}`;
      return {
        id: `${p.clientId}-${p.month}`,
        number,
        fecha: `${p.month}-01`,
        vencimiento: lastDayOfMonth(p.month),
        client,
        concepto: `Honorarios - ${MONTHS_LONG_ES[m - 1]} ${y}`,
        importe,
        estado: statusToEstado(p),
        note: p.note ?? null,
        amountOverride: p.amountOverride ?? null,
      } as Comprobante;
    });
    return out.filter((x): x is Comprobante => x !== null);
  }, [payments, period.from, period.to, clients, feeSchedules]);

  // ===== Stats =====
  const facturacionTotal = comprobantes.reduce((s, c) => s + c.importe, 0);

  const now = new Date();
  const curMonth = now.toISOString().slice(0, 7);
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7);

  // Facturación del mes actual
  const facturacionMes = comprobantes
    .filter((c) => c.fecha.slice(0, 7) === curMonth)
    .reduce((s, c) => s + c.importe, 0);
  const facturacionMesAnterior = payments
    .filter((p) => p.month === prevMonth)
    .reduce((s, p) => {
      const client = clients.find((c) => c.id === p.clientId);
      if (!client) return s;
      return s + (p.amountOverride ?? effectiveFeeForMonth(feeSchedules, p.clientId, p.month) ?? client.fee);
    }, 0);

  // Año anterior (mismo período shifteado)
  const comparisonMonths = monthsBetween(
    shiftYearMonth(period.from, -1),
    shiftYearMonth(period.to, -1),
  );
  const facturacionAnioAnterior = payments
    .filter((p) => comparisonMonths.includes(p.month))
    .reduce((s, p) => {
      const client = clients.find((c) => c.id === p.clientId);
      if (!client) return s;
      return s + (p.amountOverride ?? effectiveFeeForMonth(feeSchedules, p.clientId, p.month) ?? client.fee);
    }, 0);

  const facturasEmitidas = comprobantes.length;
  const facturasEmitidasPrev = payments.filter((p) => comparisonMonths.includes(p.month)).length;

  const ticketPromedio = facturasEmitidas > 0 ? facturacionTotal / facturasEmitidas : 0;
  const ticketPromedioPrev = facturasEmitidasPrev > 0 ? facturacionAnioAnterior / facturasEmitidasPrev : 0;

  const pendientesDeCobro = comprobantes
    .filter((c) => c.estado === "pendiente" || c.estado === "vencida")
    .reduce((s, c) => s + c.importe, 0);
  const pendientesDeCobroPrev = payments
    .filter((p) => comparisonMonths.includes(p.month) && p.status !== "paid")
    .reduce((s, p) => {
      const client = clients.find((c) => c.id === p.clientId);
      if (!client) return s;
      return s + (p.amountOverride ?? effectiveFeeForMonth(feeSchedules, p.clientId, p.month) ?? client.fee);
    }, 0);

  function pct(a: number, b: number): number | null {
    if (b === 0) return a === 0 ? 0 : null;
    return ((a - b) / Math.abs(b)) * 100;
  }

  // ===== Chart 1: Evolución (este año vs año anterior) =====
  const evolutionData = useMemo(() => {
    const periodMonths = monthsBetween(period.from, period.to);
    return periodMonths.map((mk) => {
      const [_, m] = mk.split("-").map(Number);
      const monthNum = m;
      const prevYearMk = shiftYearMonth(mk, -1);
      const factCur = payments
        .filter((p) => p.month === mk)
        .reduce((s, p) => {
          const client = clients.find((c) => c.id === p.clientId);
          if (!client) return s;
          return s + (p.amountOverride ?? effectiveFeeForMonth(feeSchedules, p.clientId, p.month) ?? client.fee);
        }, 0);
      const factPrev = payments
        .filter((p) => p.month === prevYearMk)
        .reduce((s, p) => {
          const client = clients.find((c) => c.id === p.clientId);
          if (!client) return s;
          return s + (p.amountOverride ?? effectiveFeeForMonth(feeSchedules, p.clientId, p.month) ?? client.fee);
        }, 0);
      return {
        label: MONTHS_SHORT_ES[monthNum - 1],
        actual: factCur,
        anterior: factPrev,
      };
    });
  }, [period.from, period.to, payments, clients, feeSchedules]);

  // ===== Chart 2: Distribución por estado =====
  const stateData = useMemo(() => {
    const byState: Record<EstadoFactura, number> = {
      pagada: 0,
      pendiente: 0,
      vencida: 0,
      anulada: 0,
    };
    for (const c of comprobantes) {
      byState[c.estado] += c.importe;
    }
    const total = byState.pagada + byState.pendiente + byState.vencida + byState.anulada;
    return [
      { key: "pagadas", label: "Pagadas", value: byState.pagada, pct: total > 0 ? (byState.pagada / total) * 100 : 0, color: STATE_COLORS.pagadas },
      { key: "pendientes", label: "Pendientes", value: byState.pendiente, pct: total > 0 ? (byState.pendiente / total) * 100 : 0, color: STATE_COLORS.pendientes },
      { key: "vencidas", label: "Vencidas", value: byState.vencida, pct: total > 0 ? (byState.vencida / total) * 100 : 0, color: STATE_COLORS.vencidas },
      { key: "anuladas", label: "Anuladas", value: byState.anulada, pct: total > 0 ? (byState.anulada / total) * 100 : 0, color: STATE_COLORS.anuladas },
    ];
  }, [comprobantes]);
  const totalStateValue = stateData.reduce((s, d) => s + d.value, 0);

  // ===== Lista filtrada + paginada =====
  const filteredList = comprobantes
    .filter((c) => {
      if (statusFilter !== "all" && c.estado !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        return (
          c.number.toLowerCase().includes(q) ||
          c.client.name.toLowerCase().includes(q) ||
          c.concepto.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  const totalPages = Math.max(1, Math.ceil(filteredList.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const paged = filteredList.slice(safePage * pageSize, (safePage + 1) * pageSize);

  // ===== Sparkline data: últimos 6 puntos del KPI =====
  function lastNMonthsSparkline(getter: (mk: string) => number, n = 6): { v: number }[] {
    const out: { v: number }[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mk = d.toISOString().slice(0, 7);
      out.push({ v: getter(mk) });
    }
    return out;
  }

  const sparkTotal = lastNMonthsSparkline((mk) =>
    payments
      .filter((p) => p.month === mk)
      .reduce((s, p) => {
        const client = clients.find((c) => c.id === p.clientId);
        if (!client) return s;
        return s + (p.amountOverride ?? effectiveFeeForMonth(feeSchedules, p.clientId, p.month) ?? client.fee);
      }, 0),
  );

  // ===== Acciones =====
  async function createInvoice() {
    if (!newClientId || !newMonth || !newAmount) {
      toast.error("Cliente, mes e importe son obligatorios");
      return;
    }
    setSaving(true);
    try {
      const amount = Number(newAmount);
      const client = clients.find((c) => c.id === newClientId);
      if (!client) throw new Error("Cliente no encontrado");
      const scheduled = effectiveFeeForMonth(feeSchedules, newClientId, newMonth);
      const baseFee = scheduled ?? client.fee;
      // Solo guardamos override si difiere del fee base
      const override = amount === baseFee ? null : amount;
      await setPaymentAmount(newClientId, newMonth, override, newNote.trim() || null);
      // Aseguramos status='pending'
      await setPaymentStatus(newClientId, newMonth, "pending");
      // Si el director subió un PDF, lo asociamos al payment.
      if (newPdfUrl) {
        await setPaymentPdfUrl(newClientId, newMonth, newPdfUrl);
      }
      toast.success("Factura cargada");
      setNewModal(false);
      setNewClientId("");
      setNewAmount("");
      setNewNote("");
      setNewPdfUrl(null);
      refresh();
    } catch (err) {
      const e = err as Error;
      toast.error(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function markAsPaid(c: Comprobante) {
    try {
      await setPaymentStatus(c.client.id, c.fecha.slice(0, 7), "paid");
      toast.success(`${c.number} marcada como pagada`);
      refresh();
    } catch (err) {
      const e = err as Error;
      toast.error(`Error: ${e.message}`);
    }
  }

  async function markAsPending(c: Comprobante) {
    try {
      await setPaymentStatus(c.client.id, c.fecha.slice(0, 7), "pending");
      toast.success(`${c.number} desmarcada como pagada`);
      refresh();
    } catch (err) {
      const e = err as Error;
      toast.error(`Error: ${e.message}`);
    }
  }

  async function handleDelete(c: Comprobante) {
    if (
      !confirm(
        `¿Eliminar el comprobante ${c.number} de ${c.client.name}?\n\n` +
          `Esto borra el payment registrado para ${c.fecha.slice(0, 7)}. ` +
          `Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }
    try {
      await deletePayment(c.client.id, c.fecha.slice(0, 7));
      toast.success("Comprobante eliminado");
      refresh();
    } catch (err) {
      const e = err as Error;
      toast.error(`Error: ${e.message}`);
    }
  }

  function openEdit(c: Comprobante) {
    setEditComp(c);
    setEditAmount(String(c.importe));
    setEditNote(c.note ?? "");
  }

  async function saveEdit() {
    if (!editComp) return;
    const n = Number(editAmount);
    if (!Number.isFinite(n) || n < 0) {
      toast.error("Importe inválido");
      return;
    }
    setEditSaving(true);
    try {
      const c = editComp;
      const client = c.client;
      const scheduled = effectiveFeeForMonth(
        feeSchedules,
        client.id,
        c.fecha.slice(0, 7),
      );
      const baseFee = scheduled ?? client.fee;
      const override = n === baseFee ? null : n;
      await setPaymentAmount(
        client.id,
        c.fecha.slice(0, 7),
        override,
        editNote.trim() || null,
      );
      toast.success(`${c.number} actualizada`);
      setEditComp(null);
      refresh();
    } catch (err) {
      const e = err as Error;
      toast.error(`Error: ${e.message}`);
    } finally {
      setEditSaving(false);
    }
  }

  function exportCsv() {
    const header = ["Fecha", "Comprobante", "Cliente", "Concepto", "Importe USD", "Estado", "Vencimiento"];
    const rows = filteredList.map((c) =>
      [c.fecha, c.number, c.client.name, c.concepto, c.importe.toFixed(2), c.estado, c.vencimiento]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = "﻿" + [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `facturacion-${period.from}_${period.to}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("CSV descargado");
  }

  /**
   * Desglose del MES CORRIENTE listo para el contador.
   * Incluye datos fiscales del cliente (CUIT, email, teléfono) para
   * que el contador emita las facturas reales. Una fila por cada
   * comprobante del mes actual.
   */
  function exportContadorBreakdown() {
    const mesActual = curMonth;
    const [yy, mm] = mesActual.split("-").map(Number);
    const mesLabel = `${MONTHS_LONG_ES[mm - 1]} ${yy}`;
    const delMes = comprobantes.filter((c) => c.fecha.slice(0, 7) === mesActual);
    if (delMes.length === 0) {
      toast.error(`No hay facturas para ${mesLabel}`);
      return;
    }
    const header = [
      "Comprobante",
      "Fecha emisión",
      "Vencimiento",
      "Cliente",
      "CUIT/RUT",
      "Email",
      "Teléfono",
      "País",
      "Concepto",
      "Importe USD",
      "Estado actual",
    ];
    const rows = delMes.map((c) =>
      [
        c.number,
        c.fecha,
        c.vencimiento,
        c.client.name,
        c.client.tax_id ?? "",
        c.client.contact_email ?? "",
        c.client.contact_phone ?? "",
        c.client.country ?? "",
        c.concepto,
        c.importe.toFixed(2),
        c.estado,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const totalDelMes = delMes.reduce((s, c) => s + c.importe, 0);
    const totalRow = [
      `"TOTAL ${mesLabel}"`,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      `"${delMes.length} comprobante(s)"`,
      `"${totalDelMes.toFixed(2)}"`,
      "",
    ].join(",");
    const csv = "﻿" + [
      `"Desglose de facturación — ${mesLabel}"`,
      "",
      header.join(","),
      ...rows,
      totalRow,
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `desglose-facturas-${mesActual}-contador.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Desglose de ${mesLabel} descargado`);
  }

  return (
    <div className="space-y-6">
      {/* ===== Header ===== */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-ink tracking-tight">
            Facturación
          </h1>
          <p className="text-sm text-ink-300 mt-1">
            Gestioná y monitoreá toda la facturación de tu empresa.
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
          <Button variant="secondary" size="md" onClick={exportContadorBreakdown}>
            <Download className="w-4 h-4" />
            Desglose del mes
          </Button>
          <Button variant="primary" size="md" onClick={() => setNewModal(true)}>
            <FileText className="w-4 h-4" />
            Cargar factura
          </Button>
        </div>
      </div>

      {/* ===== Row 1: 5 KPIs con sparklines ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <SparkKpiCard
          label="Facturación Total"
          value={formatUsd(facturacionTotal, { compact: true })}
          delta={pct(facturacionTotal, facturacionAnioAnterior)}
          subLabel="vs. año anterior"
          icon={<DollarSign className="w-4 h-4" />}
          spark={sparkTotal}
          color="success"
          loading={loading}
        />
        <SparkKpiCard
          label="Facturación del Mes"
          value={formatUsd(facturacionMes, { compact: true })}
          delta={pct(facturacionMes, facturacionMesAnterior)}
          subLabel="vs. mes anterior"
          icon={<TrendingUp className="w-4 h-4" />}
          spark={sparkTotal}
          color="success"
          loading={loading}
        />
        <SparkKpiCard
          label="Facturas Emitidas"
          value={String(facturasEmitidas)}
          delta={pct(facturasEmitidas, facturasEmitidasPrev)}
          subLabel="vs. año anterior"
          icon={<FileText className="w-4 h-4" />}
          spark={sparkTotal}
          color="success"
          loading={loading}
        />
        <SparkKpiCard
          label="Ticket Promedio"
          value={formatUsd(ticketPromedio, { compact: true })}
          delta={pct(ticketPromedio, ticketPromedioPrev)}
          subLabel="vs. año anterior"
          icon={<Tag className="w-4 h-4" />}
          spark={sparkTotal}
          color="success"
          loading={loading}
        />
        <SparkKpiCard
          label="Pendientes de Cobro"
          value={formatUsd(pendientesDeCobro, { compact: true })}
          delta={pct(pendientesDeCobro, pendientesDeCobroPrev)}
          subLabel="vs. año anterior"
          icon={<Clock className="w-4 h-4" />}
          spark={sparkTotal}
          color="danger"
          loading={loading}
        />
      </div>

      {/* ===== Row 2: Evolución + Distribución ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Line "Evolución de Facturación" */}
        <div className="bg-paper border border-rule rounded-premium shadow-premium-xs">
          <div className="px-5 py-4 border-b border-rule flex items-center justify-between">
            <div>
              <div className="font-semibold text-ink text-md">
                Evolución de Facturación
              </div>
              <div className="flex items-center gap-4 mt-1 text-2xs">
                <LegendDot color="#1E3A8A" label={period.yearLabel} />
                <LegendDot color="#CBD5E1" label={String(Number(period.yearLabel) - 1)} />
              </div>
            </div>
            <div className="text-xs text-ink-300 inline-flex items-center gap-1.5 px-2.5 h-7 border border-rule rounded-premium-sm">
              <Calendar className="w-3 h-3" />
              Este año
            </div>
          </div>
          <div className="p-4">
            {loading ? (
              <div className="h-64 skeleton" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart
                  data={evolutionData}
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
                  />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    stroke="#1E3A8A"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "#1E3A8A", strokeWidth: 0 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="anterior"
                    stroke="#CBD5E1"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#CBD5E1", strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Donut "Facturación por Estado" */}
        <div className="bg-paper border border-rule rounded-premium shadow-premium-xs">
          <div className="px-5 py-4 border-b border-rule flex items-center justify-between">
            <div className="font-semibold text-ink text-md">
              Facturación por Estado
            </div>
            <div className="text-xs text-ink-300 inline-flex items-center gap-1.5 px-2.5 h-7 border border-rule rounded-premium-sm">
              <Calendar className="w-3 h-3" />
              Este año
            </div>
          </div>
          <div className="p-4 flex items-center gap-4">
            {loading || totalStateValue === 0 ? (
              <div className="w-full h-56 skeleton" />
            ) : (
              <>
                <div className="relative shrink-0">
                  <ResponsiveContainer width={200} height={200}>
                    <PieChart>
                      <Pie
                        data={stateData.filter((d) => d.value > 0)}
                        dataKey="value"
                        innerRadius={62}
                        outerRadius={92}
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
                    <div className="text-md font-semibold text-ink tabular-nums">
                      {formatUsd(totalStateValue, { compact: true })}
                    </div>
                    <div className="text-2xs text-ink-300">Total</div>
                  </div>
                </div>
                <div className="flex-1 space-y-2.5 text-xs min-w-0">
                  {stateData.map((d) => (
                    <div
                      key={d.key}
                      className="flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2 h-2 rounded-sm shrink-0"
                          style={{ background: d.color }}
                        />
                        <span className="text-ink truncate">{d.label}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-ink tabular-nums text-2xs">
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
      </div>

      {/* ===== Row 3: Comprobantes Emitidos ===== */}
      <div className="bg-paper border border-rule rounded-premium shadow-premium-xs">
        <div className="px-5 py-4 border-b border-rule flex items-center justify-between gap-3">
          <div className="font-semibold text-ink text-md">
            Comprobantes Emitidos
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                placeholder="Buscar comprobantes…"
                className="pl-8 pr-3 h-8 w-56 text-xs bg-paper-100 border border-rule rounded-premium-sm placeholder-ink-300 focus:outline-none focus:border-ink-300 focus:bg-paper transition-colors"
              />
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-300" />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); setPage(0); }}
              className="h-8 px-2.5 text-xs bg-paper border border-rule rounded-premium-sm cursor-pointer focus:outline-none focus:border-ink-300"
            >
              <option value="all">Filtros</option>
              <option value="pagada">Pagadas</option>
              <option value="pendiente">Pendientes</option>
              <option value="vencida">Vencidas</option>
              <option value="anulada">Anuladas</option>
            </select>
            <button
              onClick={exportCsv}
              className="inline-flex items-center justify-center w-8 h-8 text-ink-400 bg-paper border border-rule rounded-premium-sm hover:border-rule-strong hover:text-ink transition-colors"
              title="Exportar CSV"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <button
              className="inline-flex items-center justify-center w-8 h-8 text-ink-400 bg-paper border border-rule rounded-premium-sm hover:border-rule-strong hover:text-ink transition-colors"
              title="Más opciones"
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
                <th className="text-left px-4 py-3 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">Comprobante</th>
                <th className="text-left px-4 py-3 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">Cliente</th>
                <th className="text-left px-4 py-3 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">Concepto</th>
                <th className="text-right px-4 py-3 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">Importe</th>
                <th className="text-left px-4 py-3 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">Estado</th>
                <th className="text-left px-4 py-3 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">Vencimiento</th>
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
                    Sin comprobantes que matcheen los filtros.
                  </td>
                </tr>
              ) : (
                paged.map((c) => (
                  <tr key={c.id} className="border-b border-rule-soft hover:bg-paper-100">
                    <td className="px-4 py-3 text-ink-400 tabular-nums">{c.fecha}</td>
                    <td className="px-4 py-3 text-ink-500 tabular-nums text-xs">{c.number}</td>
                    <td className="px-4 py-3 text-ink font-medium">{c.client.name}</td>
                    <td className="px-4 py-3 text-ink-400">{c.concepto}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink">
                      {formatUsd(c.importe)}
                    </td>
                    <td className="px-4 py-3">
                      <EstadoSelect
                        estado={c.estado}
                        onChange={(v) => changeEstado(c, v)}
                      />
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 tabular-nums font-medium",
                        c.estado === "vencida"
                          ? "text-rose-600"
                          : c.estado === "pagada" ||
                              c.estado === "pendiente"
                            ? "text-emerald-700"
                            : "text-ink-400",
                      )}
                    >
                      {c.vencimiento}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => setDetailComp(c)}
                          className="p-1.5 rounded-premium-sm text-ink-400 hover:text-ink hover:bg-paper-200 transition-colors"
                          title="Ver detalle"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => openEdit(c)}
                          className="p-1.5 rounded-premium-sm text-ink-400 hover:text-ink hover:bg-paper-200 transition-colors"
                          title="Editar"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {c.estado !== "pagada" ? (
                          <button
                            onClick={() => markAsPaid(c)}
                            className="p-1.5 rounded-premium-sm text-ink-400 hover:text-success hover:bg-success/10 transition-colors"
                            title="Marcar como pagada"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => markAsPending(c)}
                            className="p-1.5 rounded-premium-sm text-ink-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                            title="Desmarcar pago"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(c)}
                          className="p-1.5 rounded-premium-sm text-ink-400 hover:text-danger hover:bg-danger/10 transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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
            {Math.min((safePage + 1) * pageSize, filteredList.length)} de{" "}
            {filteredList.length} comprobantes
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

      {/* Modal Ver detalle de comprobante */}
      <Modal
        open={!!detailComp}
        onClose={() => setDetailComp(null)}
        title={detailComp ? `Comprobante ${detailComp.number}` : ""}
        description={detailComp?.client.name}
        size="md"
        footer={
          <Button variant="ghost" onClick={() => setDetailComp(null)}>
            Cerrar
          </Button>
        }
      >
        {detailComp && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <DetailRow label="Cliente" value={detailComp.client.name} />
              <DetailRow label="CUIT/RUT" value={detailComp.client.tax_id ?? "—"} />
              <DetailRow label="Email" value={detailComp.client.contact_email ?? "—"} />
              <DetailRow label="Teléfono" value={detailComp.client.contact_phone ?? "—"} />
              <DetailRow label="Fecha emisión" value={detailComp.fecha} />
              <DetailRow label="Vencimiento" value={detailComp.vencimiento} />
              <DetailRow label="Importe" value={formatUsd(detailComp.importe)} highlight />
              <DetailRow label="Estado" value={detailComp.estado} />
            </div>
            <div className="pt-3 border-t border-rule">
              <div className="text-2xs uppercase tracking-wider text-ink-300 font-semibold mb-1">Concepto</div>
              <div className="text-ink">{detailComp.concepto}</div>
              {detailComp.note && (
                <>
                  <div className="text-2xs uppercase tracking-wider text-ink-300 font-semibold mb-1 mt-3">Nota</div>
                  <div className="text-ink-400">{detailComp.note}</div>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Editar comprobante */}
      <Modal
        open={!!editComp}
        onClose={() => !editSaving && setEditComp(null)}
        title={editComp ? `Editar ${editComp.number}` : ""}
        description={editComp ? `${editComp.client.name} · ${editComp.concepto}` : ""}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditComp(null)} disabled={editSaving}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={saveEdit} loading={editSaving}>
              Guardar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field
            label="Importe (USD)"
            hint="Sobreescribe el fee base/tramo solo para este mes."
            required
          >
            <Input
              type="number"
              value={editAmount}
              onChange={(e) => setEditAmount(e.target.value)}
              placeholder="0.00"
            />
          </Field>
          <Field label="Nota">
            <Input
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              placeholder="Concepto extra, ajuste, descuento aplicado…"
            />
          </Field>
        </div>
      </Modal>

      {/* Modal Nueva Factura — adjuntá el PDF de una factura emitida
          fuera del sistema (ej por el contador). El cliente, razón
          social y RUT se auto-rellenan al elegir el cliente. */}
      <Modal
        open={newModal}
        onClose={() => !saving && setNewModal(false)}
        title="Cargar factura"
        description="Adjuntá el PDF de una factura emitida (o creá el registro sin PDF para subirlo después)."
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setNewModal(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={createInvoice} loading={saving}>
              Guardar factura
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Cliente" required>
            <Select
              value={newClientId}
              onChange={(e) => {
                setNewClientId(e.target.value);
                // Auto-suggest fee
                const client = clients.find((c) => c.id === e.target.value);
                if (client) {
                  const scheduled = effectiveFeeForMonth(feeSchedules, client.id, newMonth);
                  setNewAmount(String(scheduled ?? client.fee));
                }
              }}
            >
              <option value="">Elegí un cliente…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          {/* Auto-fill datos fiscales del cliente seleccionado */}
          {(() => {
            const selected = clients.find((c) => c.id === newClientId);
            const razon = selected?.razon_social?.trim();
            const rut = selected?.rut?.trim();
            if (!selected) return null;
            if (!razon && !rut) {
              return (
                <div
                  style={{
                    padding: "10px 12px",
                    background: "rgba(196,168,130,0.08)",
                    border: "1px solid rgba(196,168,130,0.25)",
                    borderRadius: 6,
                    fontSize: 11,
                    color: "var(--text-muted)",
                    fontStyle: "italic",
                  }}
                >
                  Este cliente no tiene razón social / RUT cargados.
                  Cargalos desde Configuración del cliente para que
                  aparezcan automáticamente en facturación.
                </div>
              );
            }
            return (
              <div
                style={{
                  padding: "10px 12px",
                  background: "var(--off-white)",
                  border: "1px solid var(--hairline)",
                  borderRadius: 6,
                  fontSize: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "var(--sand-dark)",
                    fontWeight: 700,
                  }}
                >
                  Datos fiscales (auto)
                </div>
                {razon && (
                  <div>
                    <strong style={{ color: "var(--text-muted)", fontWeight: 600 }}>
                      Razón social:
                    </strong>{" "}
                    {razon}
                  </div>
                )}
                {rut && (
                  <div>
                    <strong style={{ color: "var(--text-muted)", fontWeight: 600 }}>
                      RUT:
                    </strong>{" "}
                    <span style={{ fontFamily: "monospace" }}>{rut}</span>
                  </div>
                )}
              </div>
            );
          })()}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Mes a facturar" required>
              <Input
                type="month"
                value={newMonth}
                onChange={(e) => setNewMonth(e.target.value)}
              />
            </Field>
            <Field label="Importe (USD)" required>
              <Input
                type="number"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                placeholder="0.00"
              />
            </Field>
          </div>
          <Field
            label="Nota (opcional)"
            hint="Aparece en el comprobante como concepto extra."
          >
            <Input
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder='Ej: "Honorarios extra por consultoría puntual"'
            />
          </Field>
          <Field
            label="PDF de la factura (opcional)"
            hint="Subí el PDF de la factura emitida. Si no la tenés ahora, podés agregarla después."
          >
            <FileUpload
              kind="expense"
              value={newPdfUrl}
              onChange={setNewPdfUrl}
            />
          </Field>
        </div>
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
  color = "success",
  loading,
}: {
  label: string;
  value: string;
  delta: number | null;
  subLabel?: string;
  icon?: React.ReactNode;
  spark: { v: number }[];
  color?: "success" | "danger";
  loading?: boolean;
}) {
  const sparkColor = color === "danger" ? "#F87171" : "#16C75A";
  const deltaColor = color === "danger"
    ? (delta ?? 0) <= 0 ? "text-success" : "text-danger"
    : (delta ?? 0) >= 0 ? "text-success" : "text-danger";

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
                <div className={cn("text-xs font-semibold", deltaColor)}>
                  {(delta ?? 0) >= 0 ? "↑" : "↓"} {Math.abs(delta ?? 0).toFixed(1)}%
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

function DetailRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <div className="text-2xs uppercase tracking-wider text-ink-300 font-semibold">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5",
          highlight ? "text-ink font-semibold tabular-nums" : "text-ink",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function EstadoPill({ estado }: { estado: EstadoFactura }) {
  const config: Record<EstadoFactura, { label: string; classes: string }> = {
    pagada: { label: "Pagada", classes: "bg-emerald-50 text-emerald-700" },
    pendiente: { label: "Pendiente", classes: "bg-amber-50 text-amber-700" },
    vencida: { label: "Vencida", classes: "bg-red-50 text-red-700" },
    anulada: { label: "Anulada", classes: "bg-slate-100 text-slate-600" },
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

/**
 * Dropdown editable de estado. Solo expone los 3 estados que el
 * director puede setear manualmente: pagada / pendiente / anulada.
 * "vencida" se deriva automáticamente desde pending + mes pasado y
 * NO aparece como opción seleccionable (queda como pill visual
 * cuando aplica).
 */
function EstadoSelect({
  estado,
  onChange,
}: {
  estado: EstadoFactura;
  onChange: (v: "pagada" | "pendiente" | "anulada") => void;
}) {
  // El value de la select refleja el estado "manual" del payment:
  // si es vencida, internamente es pending → el select muestra "Pendiente".
  const currentValue: "pagada" | "pendiente" | "anulada" =
    estado === "pagada"
      ? "pagada"
      : estado === "anulada"
        ? "anulada"
        : "pendiente";
  const visualClasses: Record<EstadoFactura, string> = {
    pagada: "border-emerald-200 bg-emerald-50 text-emerald-700",
    pendiente: "border-amber-200 bg-amber-50 text-amber-700",
    vencida: "border-rose-200 bg-rose-50 text-rose-700",
    anulada: "border-slate-200 bg-slate-100 text-slate-600",
  };
  return (
    <select
      value={currentValue}
      onChange={(e) => onChange(e.target.value as "pagada" | "pendiente" | "anulada")}
      className={cn(
        "inline-flex items-center px-2.5 h-7 text-2xs font-semibold rounded-full cursor-pointer focus:outline-none focus:ring-1 focus:ring-ink-300 border transition-colors",
        visualClasses[estado],
      )}
      title={
        estado === "vencida"
          ? "Vencida — el mes ya pasó y la factura sigue pendiente. Cambiá a Pagada o Anulada."
          : `Estado actual: ${estado}`
      }
    >
      <option value="pagada">Pagado</option>
      <option value="pendiente">Pendiente</option>
      <option value="anulada">Anulado</option>
    </select>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 text-ink-400">
      <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: color }} />
      <span>{label}</span>
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
