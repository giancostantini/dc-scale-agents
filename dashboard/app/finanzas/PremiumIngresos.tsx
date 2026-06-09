"use client";

/**
 * Vista premium de Ingresos — CRUD completo estilo Mercury/Ramp.
 *
 * - DataTable con búsqueda + sort + filtros + paginación + export CSV
 * - Modal "Nuevo ingreso" / "Editar ingreso" con form premium
 * - Soft delete con confirmación + toast
 * - KPI cards arriba (cobrado / pendiente / total año / IVA cobrado)
 * - Categorías y métodos de pago hardcoded por ahora
 */

import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/premium/Button";
import { DataTable, type Column } from "@/components/premium/DataTable";
import { Field, Input, Select, Textarea } from "@/components/premium/Field";
import { FileUpload } from "@/components/premium/FileUpload";
import { KpiCard } from "@/components/premium/KpiCard";
import { Modal } from "@/components/premium/Modal";
import { Pill, type PillTone } from "@/components/premium/Pill";
import {
  createManualRevenue,
  deleteManualRevenue,
  listManualRevenues,
  updateManualRevenue,
  type ManualRevenue,
  type ManualRevenueKind,
  type PaymentMethod,
  type RevenueStatus,
} from "@/lib/finanzas";
import {
  CURRENCIES,
  INCOME_CATEGORIES,
  IVA_OPTIONS,
  PAYMENT_METHODS,
  REVENUE_STATUSES,
} from "@/lib/finanzas-options";
import type { Client } from "@/lib/types";

interface Props {
  clients: Client[];
}

const PAYMENT_METHOD_LABEL: Record<string, string> = Object.fromEntries(
  PAYMENT_METHODS.map((p) => [p.value, p.label]),
);

function statusTone(status: RevenueStatus): PillTone {
  const s = REVENUE_STATUSES.find((x) => x.value === status);
  return s?.tone ?? "neutral";
}
function statusLabel(status: RevenueStatus): string {
  return REVENUE_STATUSES.find((x) => x.value === status)?.label ?? status;
}

export function PremiumIngresos({ clients }: Props) {
  const [revenues, setRevenues] = useState<ManualRevenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ManualRevenue | null>(null);

  async function refresh() {
    setLoading(true);
    setRevenues(await listManualRevenues());
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  // ===== KPIs (mes corriente) =====
  const monthYYYYMM = new Date().toISOString().slice(0, 7);
  const stats = useMemo(() => {
    let cobradoMes = 0;
    let pendienteMes = 0;
    let totalAnio = 0;
    let ivaCobrado = 0;
    const anio = monthYYYYMM.slice(0, 4);
    for (const r of revenues) {
      const ref = r.date ?? r.start_date ?? null;
      if (!ref) continue;
      const inMonth = ref.startsWith(monthYYYYMM);
      const inYear = ref.startsWith(anio);
      const amt = Number(r.amount);
      const ivaAmt = (amt * Number(r.iva_pct)) / 100;
      if (inMonth) {
        if (r.status === "paid") cobradoMes += amt;
        if (r.status === "pending") pendienteMes += amt;
      }
      if (inYear && r.status === "paid") {
        totalAnio += amt;
        ivaCobrado += ivaAmt;
      }
    }
    return { cobradoMes, pendienteMes, totalAnio, ivaCobrado };
  }, [revenues, monthYYYYMM]);

  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(r: ManualRevenue) {
    setEditing(r);
    setModalOpen(true);
  }

  async function handleDelete(r: ManualRevenue) {
    if (!confirm(`¿Eliminar el ingreso "${r.description}"?`)) return;
    try {
      await deleteManualRevenue(r.id);
      toast.success("Ingreso eliminado");
      refresh();
    } catch (err) {
      const e = err as Error;
      toast.error("No se pudo eliminar", { description: e.message });
    }
  }

  // ===== Tabla =====
  const columns: Column<ManualRevenue>[] = [
    {
      key: "date",
      header: "Fecha",
      sortable: true,
      sortValue: (r) => r.date ?? r.start_date ?? "",
      cell: (r) => (
        <span className="text-sm font-medium text-ink tabular-nums">
          {r.date ?? r.start_date ?? "—"}
        </span>
      ),
      width: "110px",
    },
    {
      key: "description",
      header: "Descripción",
      sortable: true,
      cell: (r) => (
        <div>
          <div className="text-sm font-medium text-ink">{r.description}</div>
          {r.notes && (
            <div className="text-2xs text-ink-300 mt-0.5 truncate max-w-md">
              {r.notes}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "client",
      header: "Cliente",
      cell: (r) => (
        <span className="text-sm text-ink-500">
          {r.client_id
            ? (clients.find((c) => c.id === r.client_id)?.name ?? r.client_id)
            : "Corporativo"}
        </span>
      ),
    },
    {
      key: "category",
      header: "Categoría",
      cell: (r) =>
        r.category ? (
          <Pill tone="sand">{r.category}</Pill>
        ) : (
          <span className="text-ink-300 text-xs">—</span>
        ),
    },
    {
      key: "payment_method",
      header: "Método",
      cell: (r) => (
        <span className="text-sm text-ink-500">
          {r.payment_method
            ? PAYMENT_METHOD_LABEL[r.payment_method] ?? r.payment_method
            : "—"}
        </span>
      ),
    },
    {
      key: "amount",
      header: "Monto",
      align: "right",
      sortable: true,
      sortValue: (r) => Number(r.amount),
      cell: (r) => (
        <div className="text-right">
          <div className="text-sm font-semibold text-ink tabular-nums">
            {r.currency} {Number(r.amount).toLocaleString()}
          </div>
          <div className="text-2xs text-ink-300">+IVA {Number(r.iva_pct)}%</div>
        </div>
      ),
      width: "140px",
    },
    {
      key: "status",
      header: "Estado",
      cell: (r) => (
        <Pill tone={statusTone(r.status)}>{statusLabel(r.status)}</Pill>
      ),
      width: "110px",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-1.5">Finanzas · Ingresos</div>
          <h1 className="text-4xl font-semibold text-ink tracking-tight">
            Ingresos
          </h1>
        </div>
        <Button onClick={openNew} variant="primary">
          <Plus className="w-3.5 h-3.5" />
          Nuevo ingreso
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard
          label="Cobrado este mes"
          value={`USD ${Math.round(stats.cobradoMes).toLocaleString()}`}
          loading={loading}
        />
        <KpiCard
          label="Pendiente este mes"
          value={`USD ${Math.round(stats.pendienteMes).toLocaleString()}`}
          sub={
            stats.pendienteMes > 0 ? "Por cobrar" : "Sin pendientes"
          }
          loading={loading}
        />
        <KpiCard
          label="Total año"
          value={`USD ${Math.round(stats.totalAnio).toLocaleString()}`}
          sub={`${monthYYYYMM.slice(0, 4)} acumulado`}
          loading={loading}
        />
        <KpiCard
          label="IVA cobrado año"
          value={`USD ${Math.round(stats.ivaCobrado).toLocaleString()}`}
          sub="A liquidar"
          loading={loading}
        />
      </div>

      {/* Tabla */}
      <DataTable
        data={revenues}
        columns={columns}
        rowKey={(r) => r.id}
        searchPlaceholder="Buscar por descripción, cliente, categoría…"
        exportFilename={`ingresos-${new Date().toISOString().slice(0, 10)}`}
        loading={loading}
        emptyState={{
          title: "Todavía no cargaste ningún ingreso",
          description:
            "Registrá el primero para empezar a llevar control de cobranza, IVA y comprobantes.",
          action: (
            <Button onClick={openNew} variant="primary">
              <Plus className="w-3.5 h-3.5" />
              Cargar primer ingreso
            </Button>
          ),
        }}
        rowActions={(r) => (
          <div className="flex items-center gap-1">
            {r.comprobante_url && (
              <a
                href={r.comprobante_url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 text-ink-300 hover:text-ink rounded-premium-sm hover:bg-paper-200 transition-colors"
                title="Ver comprobante"
                onClick={(e) => e.stopPropagation()}
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
              </a>
            )}
            <button
              type="button"
              onClick={() => openEdit(r)}
              className="p-1.5 text-ink-300 hover:text-ink rounded-premium-sm hover:bg-paper-200 transition-colors"
              title="Editar"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleDelete(r)}
              className="p-1.5 text-ink-300 hover:text-danger rounded-premium-sm hover:bg-danger/5 transition-colors"
              title="Eliminar"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      />

      {/* Modal Nuevo / Editar */}
      {modalOpen && (
        <RevenueFormModal
          clients={clients}
          initial={editing}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
          onSaved={() => {
            setModalOpen(false);
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// RevenueFormModal — Form premium para crear/editar ingresos
// ============================================================
function RevenueFormModal({
  clients,
  initial,
  onClose,
  onSaved,
}: {
  clients: Client[];
  initial: ManualRevenue | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!initial;

  const [kind, setKind] = useState<ManualRevenueKind>(
    initial?.kind ?? "one_time",
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [amount, setAmount] = useState(
    initial ? String(initial.amount) : "",
  );
  const [currency, setCurrency] = useState(initial?.currency ?? "USD");
  const [date, setDate] = useState(
    initial?.date ?? new Date().toISOString().slice(0, 10),
  );
  const [startDate, setStartDate] = useState(initial?.start_date ?? "");
  const [endDate, setEndDate] = useState(initial?.end_date ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [clientId, setClientId] = useState(initial?.client_id ?? "");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">(
    initial?.payment_method ?? "",
  );
  const [ivaPct, setIvaPct] = useState(
    initial ? String(initial.iva_pct) : "22",
  );
  const [status, setStatus] = useState<RevenueStatus>(
    initial?.status ?? "paid",
  );
  const [comprobanteUrl, setComprobanteUrl] = useState(
    initial?.comprobante_url ?? null,
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const amountNumber = Number(amount) || 0;
  const ivaNumber = Number(ivaPct) || 0;
  const ivaAmount = (amountNumber * ivaNumber) / 100;
  const totalConIva = amountNumber + ivaAmount;

  async function handleSave() {
    if (!description.trim()) {
      toast.error("Falta la descripción");
      return;
    }
    if (amountNumber <= 0) {
      toast.error("Monto inválido");
      return;
    }
    if (kind === "fijo" && !startDate) {
      toast.error("Los ingresos fijos requieren fecha de inicio");
      return;
    }
    if (kind === "one_time" && !date) {
      toast.error("Falta la fecha");
      return;
    }
    setSaving(true);
    try {
      const input = {
        kind,
        description: description.trim(),
        amount: amountNumber,
        currency,
        category: category.trim() || null,
        client_id: clientId || null,
        payment_method: (paymentMethod as PaymentMethod) || null,
        iva_pct: ivaNumber,
        comprobante_url: comprobanteUrl,
        status,
        notes: notes.trim() || null,
        start_date: kind === "fijo" ? startDate : null,
        end_date: kind === "fijo" ? endDate || null : null,
        date: kind === "one_time" ? date : null,
      };
      if (isEdit && initial) {
        await updateManualRevenue(initial.id, input);
        toast.success("Ingreso actualizado");
      } else {
        await createManualRevenue(input);
        toast.success("Ingreso registrado");
      }
      onSaved();
    } catch (err) {
      const e = err as Error;
      toast.error("No se pudo guardar", { description: e.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? "Editar ingreso" : "Nuevo ingreso"}
      description={
        isEdit
          ? "Actualizá los campos que necesites cambiar"
          : "Registrá el ingreso con todos sus detalles fiscales"
      }
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} loading={saving} variant="primary">
            {isEdit ? "Guardar cambios" : "Registrar ingreso"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Tipo + Fecha */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Tipo de ingreso" required>
            <Select
              value={kind}
              onChange={(e) => setKind(e.target.value as ManualRevenueKind)}
            >
              <option value="one_time">Único / Una vez</option>
              <option value="fijo">Recurrente mensual</option>
            </Select>
          </Field>
          {kind === "one_time" ? (
            <Field label="Fecha" required>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Desde" required>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </Field>
              <Field label="Hasta">
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </Field>
            </div>
          )}
        </div>

        {/* Descripción */}
        <Field label="Descripción" required>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ej: Honorarios mayo · Cliente XYZ"
          />
        </Field>

        {/* Cliente + Categoría */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Cliente" hint="Opcional · vacío = corporativo">
            <Select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              <option value="">— Sin cliente —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Categoría">
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">— Sin categoría —</option>
              {INCOME_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {/* Monto + Moneda + IVA */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Field label="Monto neto" required className="sm:col-span-2">
            <Input
              type="number"
              step="0.01"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </Field>
          <Field label="Moneda">
            <Select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.value}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="IVA %">
            <Select
              value={ivaPct}
              onChange={(e) => setIvaPct(e.target.value)}
            >
              {IVA_OPTIONS.map((iv) => (
                <option key={iv.value} value={iv.value}>
                  {iv.value}%
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {/* Resumen IVA */}
        {amountNumber > 0 && (
          <div className="bg-paper-100 border border-rule rounded-premium-sm px-4 py-3 grid grid-cols-3 gap-4">
            <div>
              <div className="eyebrow">Neto</div>
              <div className="text-md font-semibold text-ink tabular-nums mt-0.5">
                {currency} {amountNumber.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="eyebrow">IVA ({ivaNumber}%)</div>
              <div className="text-md font-semibold text-ink tabular-nums mt-0.5">
                {currency} {ivaAmount.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="eyebrow">Total</div>
              <div className="text-md font-bold text-accent-dim tabular-nums mt-0.5">
                {currency} {totalConIva.toLocaleString()}
              </div>
            </div>
          </div>
        )}

        {/* Método de pago + Estado */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Método de pago">
            <Select
              value={paymentMethod}
              onChange={(e) =>
                setPaymentMethod(e.target.value as PaymentMethod | "")
              }
            >
              <option value="">— Sin especificar —</option>
              {PAYMENT_METHODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Estado" required>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as RevenueStatus)}
            >
              {REVENUE_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {/* Comprobante */}
        <Field
          label="Comprobante"
          hint="PDF o imagen de la factura/recibo (opcional)"
        >
          <FileUpload
            kind="income"
            value={comprobanteUrl}
            onChange={setComprobanteUrl}
          />
        </Field>

        {/* Notas */}
        <Field label="Notas">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Detalles adicionales del ingreso…"
          />
        </Field>
      </div>
    </Modal>
  );
}
