"use client";

/**
 * Vista premium de Egresos — CRUD completo estilo Mercury.
 *
 * Misma estructura que PremiumIngresos pero con:
 *  - Proveedor (texto libre)
 *  - Categoría de egresos (funcionales, tools, IA, prod, impuestos, mkt, otros)
 *  - Adjuntar factura
 *  - Asignado a (interno o cliente)
 */

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/premium/Button";
import { DataTable, type Column } from "@/components/premium/DataTable";
import { Field, Input, Select, Textarea } from "@/components/premium/Field";
import { FileUpload } from "@/components/premium/FileUpload";
import { KpiCard } from "@/components/premium/KpiCard";
import { Modal } from "@/components/premium/Modal";
import { Pill, type PillTone } from "@/components/premium/Pill";
import {
  addExpense,
  deleteExpense,
  getClients,
  getExpenses,
  updateExpense,
} from "@/lib/storage";
import {
  CURRENCIES,
  EXPENSE_CATEGORIES,
  EXPENSE_STATUSES,
  IVA_OPTIONS,
  PAYMENT_METHODS,
} from "@/lib/finanzas-options";
import type {
  Client,
  Expense,
  ExpenseCategory,
  ExpensePaymentMethod,
  ExpenseRecurrence,
  ExpenseStatus,
} from "@/lib/types";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/types";

const PAYMENT_METHOD_LABEL: Record<string, string> = Object.fromEntries(
  PAYMENT_METHODS.map((p) => [p.value, p.label]),
);

function statusTone(s: ExpenseStatus): PillTone {
  return EXPENSE_STATUSES.find((x) => x.value === s)?.tone ?? "neutral";
}
function statusLabel(s: ExpenseStatus): string {
  return EXPENSE_STATUSES.find((x) => x.value === s)?.label ?? s;
}

export function PremiumEgresos() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);

  async function refresh() {
    setLoading(true);
    const [exps, cls] = await Promise.all([getExpenses(), getClients()]);
    setExpenses(exps);
    setClients(cls);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  const monthYYYYMM = new Date().toISOString().slice(0, 7);
  const stats = useMemo(() => {
    let pagadoMes = 0;
    let pendienteMes = 0;
    let totalAnio = 0;
    let ivaPagado = 0;
    const anio = monthYYYYMM.slice(0, 4);
    const today = new Date();
    const todayDay = today.getDate();
    const todayMonthKey = monthYYYYMM;
    for (const e of expenses) {
      const amt = Number(e.amount);
      const ivaAmt = (amt * Number(e.ivaPct ?? 22)) / 100;

      if (e.recurrence === "monthly_fixed") {
        // Para fijos mensuales evaluamos si CORRE este mes (start <=
        // ahora <= end). Si corre y tiene payment_day, el status se
        // deriva: pending hasta que llegue el día, paid desde ahí.
        // Sin payment_day, queda como pending (el director marca a
        // mano cuando paga).
        const startMonth = (e.date ?? "").slice(0, 7);
        const endMonth = e.recurrenceEndDate?.slice(0, 7) ?? null;
        const runsThisMonth =
          startMonth <= todayMonthKey &&
          (!endMonth || todayMonthKey <= endMonth);
        if (runsThisMonth) {
          const derived = effectiveStatusForMonth(
            e.paymentDay ?? null,
            todayDay,
          );
          if (derived === "paid") pagadoMes += amt;
          else pendienteMes += amt;
        }

        // Año: sumamos cada mes pasado dentro del año en que ya se
        // ejecutó (asumimos que un fijo mensual pasado se pagó —
        // el track manual queda como TODO).
        if (startMonth.startsWith(anio)) {
          // Cantidad de meses dentro del año actual que ya pasaron
          // o están en curso (con payment_day cumplido).
          const monthsRunInYear = monthsRunWithinYear(
            e.date,
            e.recurrenceEndDate ?? null,
            e.paymentDay ?? null,
            anio,
            today,
          );
          totalAnio += amt * monthsRunInYear;
          ivaPagado += ivaAmt * monthsRunInYear;
        }
      } else {
        // Único pago: comportamiento original.
        const inMonth = e.date?.startsWith(monthYYYYMM);
        const inYear = e.date?.startsWith(anio);
        if (inMonth) {
          if (e.status === "paid") pagadoMes += amt;
          if (e.status === "pending") pendienteMes += amt;
        }
        if (inYear && e.status === "paid") {
          totalAnio += amt;
          ivaPagado += ivaAmt;
        }
      }
    }
    return { pagadoMes, pendienteMes, totalAnio, ivaPagado };
  }, [expenses, monthYYYYMM]);

  /**
   * Derive el status efectivo de un egreso fijo mensual para el mes
   * en curso. Sin payment_day, queda pending. Con payment_day,
   * pending si hoy < day, paid si hoy >= day.
   */
  function effectiveStatusForMonth(
    paymentDay: number | null,
    todayDay: number,
  ): "paid" | "pending" {
    if (paymentDay == null) return "pending";
    return todayDay >= paymentDay ? "paid" : "pending";
  }

  /**
   * Cuenta cuántos meses YA SE PAGARON de un fijo mensual dentro del
   * año actual (usado para sumar al "totalAnio").
   *
   *   · Meses 100% pasados dentro del rango [start, end] cuentan.
   *   · El mes en curso cuenta solo si hoy >= payment_day (o si no
   *     hay payment_day y el director ya marcó algo — simplificamos:
   *     sin payment_day, no contamos el mes en curso para evitar
   *     inflado).
   *   · Meses futuros del año no cuentan.
   */
  function monthsRunWithinYear(
    startIso: string,
    endIso: string | null,
    paymentDay: number | null,
    year: string,
    today: Date,
  ): number {
    const yearStart = `${year}-01`;
    const yearEnd = `${year}-12`;
    const rangeStart =
      startIso.slice(0, 7) > yearStart ? startIso.slice(0, 7) : yearStart;
    const rangeEnd =
      endIso == null
        ? yearEnd
        : endIso.slice(0, 7) < yearEnd
          ? endIso.slice(0, 7)
          : yearEnd;
    if (rangeStart > rangeEnd) return 0;

    const todayMonthKey = today.toISOString().slice(0, 7);
    const todayDay = today.getDate();

    let count = 0;
    const [ys, ms] = rangeStart.split("-").map(Number);
    const [ye, me] = rangeEnd.split("-").map(Number);
    let y = ys;
    let m = ms;
    while (y < ye || (y === ye && m <= me)) {
      const mk = `${y}-${String(m).padStart(2, "0")}`;
      if (mk < todayMonthKey) {
        count++;
      } else if (mk === todayMonthKey) {
        if (paymentDay != null && todayDay >= paymentDay) count++;
      }
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }
    return count;
  }

  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(e: Expense) {
    setEditing(e);
    setModalOpen(true);
  }

  async function handleDelete(e: Expense) {
    if (!confirm(`¿Eliminar el egreso "${e.concept}"?`)) return;
    try {
      await deleteExpense(e.id);
      toast.success("Egreso eliminado");
      refresh();
    } catch (err) {
      const error = err as Error;
      toast.error("No se pudo eliminar", { description: error.message });
    }
  }

  const columns: Column<Expense>[] = [
    {
      key: "date",
      header: "Fecha",
      sortable: true,
      cell: (e) => (
        <span className="text-sm font-medium text-ink tabular-nums">
          {e.date}
        </span>
      ),
      width: "110px",
    },
    {
      key: "concept",
      header: "Concepto",
      sortable: true,
      cell: (e) => (
        <div>
          <div className="text-sm font-medium text-ink">{e.concept}</div>
          {e.providerName && (
            <div className="text-2xs text-ink-300 mt-0.5">
              Proveedor: {e.providerName}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "category",
      header: "Categoría",
      cell: (e) => (
        <Pill tone="sand">
          {EXPENSE_CATEGORY_LABEL[e.category] ?? e.category}
        </Pill>
      ),
    },
    {
      key: "assigned_to",
      header: "Asignado",
      cell: (e) => (
        <span className="text-sm text-ink-500">{e.assignedTo}</span>
      ),
    },
    {
      key: "payment_method",
      header: "Método",
      cell: (e) => (
        <span className="text-sm text-ink-500">
          {e.paymentMethod
            ? PAYMENT_METHOD_LABEL[e.paymentMethod] ?? e.paymentMethod
            : "—"}
        </span>
      ),
    },
    {
      key: "amount",
      header: "Monto",
      align: "right",
      sortable: true,
      sortValue: (e) => Number(e.amount),
      cell: (e) => (
        <div className="text-right">
          <div className="text-sm font-semibold text-danger tabular-nums">
            −USD {Number(e.amount).toLocaleString()}
          </div>
          <div className="text-2xs text-ink-300">
            IVA {Number(e.ivaPct ?? 22)}%
          </div>
        </div>
      ),
      width: "140px",
    },
    {
      key: "status",
      header: "Estado",
      cell: (e) => {
        // Para monthly_fixed con payment_day, el pill refleja si la
        // ÚLTIMA carga programada ya pasó:
        //   · Si ya ocurrió al menos un débito (desde el inicio del
        //     contrato) → "Pagado".
        //   · Si todavía no llegó el primer débito → "Pendiente".
        // Las stats del mes en curso siguen su propia lógica (pending
        // hasta que llegue payment_day del MES actual) — eso es para
        // el "Pendiente del mes" del header.
        const effective = (() => {
          if (e.recurrence !== "monthly_fixed") return e.status ?? "paid";
          if (e.paymentDay == null) return "pending";
          // Primer débito programado: el payment_day del mes de inicio
          // si startDay <= paymentDay, sino el del mes siguiente.
          const startDateObj = new Date(e.date);
          const startDay = startDateObj.getDate();
          const firstChargeDate =
            startDay <= e.paymentDay
              ? new Date(
                  startDateObj.getFullYear(),
                  startDateObj.getMonth(),
                  e.paymentDay,
                )
              : new Date(
                  startDateObj.getFullYear(),
                  startDateObj.getMonth() + 1,
                  e.paymentDay,
                );
          const today = new Date();
          return today >= firstChargeDate ? "paid" : "pending";
        })() as ExpenseStatus;
        return (
          <Pill tone={statusTone(effective)}>
            {statusLabel(effective)}
            {e.recurrence === "monthly_fixed" && e.paymentDay && (
              <span
                className="ml-1 text-2xs opacity-70"
                title={`Débito automático día ${e.paymentDay} de cada mes`}
              >
                ·{e.paymentDay}
              </span>
            )}
          </Pill>
        );
      },
      width: "130px",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-1.5">Finanzas · Egresos</div>
          <h1 className="text-4xl font-semibold text-ink tracking-tight">
            Egresos
          </h1>
        </div>
        <Button onClick={openNew} variant="primary">
          <Plus className="w-3.5 h-3.5" />
          Nuevo egreso
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard
          label="Pagado este mes"
          value={`USD ${Math.round(stats.pagadoMes).toLocaleString()}`}
          loading={loading}
        />
        <KpiCard
          label="Pendiente este mes"
          value={`USD ${Math.round(stats.pendienteMes).toLocaleString()}`}
          sub={stats.pendienteMes > 0 ? "A pagar" : "Sin pendientes"}
          loading={loading}
        />
        <KpiCard
          label="Total año"
          value={`USD ${Math.round(stats.totalAnio).toLocaleString()}`}
          sub={`${monthYYYYMM.slice(0, 4)} acumulado`}
          loading={loading}
        />
        <KpiCard
          label="IVA pagado año"
          value={`USD ${Math.round(stats.ivaPagado).toLocaleString()}`}
          sub="Deducible"
          loading={loading}
        />
      </div>

      <DataTable
        data={expenses}
        columns={columns}
        rowKey={(e) => e.id}
        searchPlaceholder="Buscar por concepto, proveedor, categoría…"
        exportFilename={`egresos-${new Date().toISOString().slice(0, 10)}`}
        loading={loading}
        emptyState={{
          title: "Todavía no cargaste ningún egreso",
          description:
            "Cargá tu primer gasto: sueldo, factura de software, impuestos, lo que sea.",
          action: (
            <Button onClick={openNew} variant="primary">
              <Plus className="w-3.5 h-3.5" />
              Cargar primer egreso
            </Button>
          ),
        }}
        rowActions={(e) => (
          <div className="flex items-center gap-1">
            {e.invoiceUrl && (
              <a
                href={e.invoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 text-ink-300 hover:text-ink rounded-premium-sm hover:bg-paper-200 transition-colors"
                title="Ver factura"
                onClick={(ev) => ev.stopPropagation()}
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
              </a>
            )}
            <button
              type="button"
              onClick={() => openEdit(e)}
              className="p-1.5 text-ink-300 hover:text-ink rounded-premium-sm hover:bg-paper-200 transition-colors"
              title="Editar"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleDelete(e)}
              className="p-1.5 text-ink-300 hover:text-danger rounded-premium-sm hover:bg-danger/5 transition-colors"
              title="Eliminar"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      />

      {modalOpen && (
        <ExpenseFormModal
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

function ExpenseFormModal({
  clients,
  initial,
  onClose,
  onSaved,
}: {
  clients: Client[];
  initial: Expense | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!initial;
  const [concept, setConcept] = useState(initial?.concept ?? "");
  const [amount, setAmount] = useState(
    initial ? String(initial.amount) : "",
  );
  const [date, setDate] = useState(
    initial?.date ?? new Date().toISOString().slice(0, 10),
  );
  const [category, setCategory] = useState<ExpenseCategory>(
    initial?.category ?? "tools",
  );
  const [assignedTo, setAssignedTo] = useState(
    initial?.assignedTo ?? "Interno",
  );
  const [providerName, setProviderName] = useState(initial?.providerName ?? "");
  const [paymentMethod, setPaymentMethod] = useState<ExpensePaymentMethod | "">(
    initial?.paymentMethod ?? "",
  );
  const [ivaPct, setIvaPct] = useState(
    initial ? String(initial.ivaPct ?? 22) : "22",
  );
  const [status, setStatus] = useState<ExpenseStatus>(
    initial?.status ?? "paid",
  );
  const [invoiceUrl, setInvoiceUrl] = useState(initial?.invoiceUrl ?? null);
  const [recurrence, setRecurrence] = useState<ExpenseRecurrence>(
    initial?.recurrence ?? "one_time",
  );
  /** Día del mes (1-31) en que se debita. Solo aplica a monthly_fixed.
   *  Cuando hay payment_day el sistema deriva el status del mes
   *  automáticamente: pending si hoy < day, paid si hoy >= day. */
  const [paymentDay, setPaymentDay] = useState<string>(
    initial?.paymentDay ? String(initial.paymentDay) : "",
  );
  const [saving, setSaving] = useState(false);

  const amountNumber = Number(amount) || 0;
  const ivaNumber = Number(ivaPct) || 0;
  const ivaAmount = (amountNumber * ivaNumber) / 100;
  const totalConIva = amountNumber + ivaAmount;

  async function handleSave() {
    if (!concept.trim()) {
      toast.error("Falta el concepto");
      return;
    }
    if (amountNumber <= 0) {
      toast.error("Monto inválido");
      return;
    }
    setSaving(true);
    try {
      // Para egresos fijos mensuales, el "status" del master record
      // no representa nada útil (cada mes se paga por separado).
      // Lo seteamos en "pending" — el cálculo financiero igualmente
      // suma este costo todos los meses; el estado real de cada
      // mes se trackea aparte. Para únicos, usamos lo que eligió el
      // director en el form.
      const effectiveStatus: ExpenseStatus =
        recurrence === "monthly_fixed" ? "pending" : status;

      // Parsear payment_day: solo aplica para monthly_fixed.
      // Validamos rango 1-31; cualquier otro valor se guarda como null.
      const pdNum = Number(paymentDay);
      const validPaymentDay =
        recurrence === "monthly_fixed" &&
        Number.isFinite(pdNum) &&
        pdNum >= 1 &&
        pdNum <= 31
          ? Math.trunc(pdNum)
          : null;

      const patch = {
        date,
        concept: concept.trim(),
        category,
        assignedTo,
        amount: amountNumber,
        recurrence,
        providerName: providerName.trim() || null,
        paymentMethod: (paymentMethod as ExpensePaymentMethod) || null,
        ivaPct: ivaNumber,
        invoiceUrl,
        status: effectiveStatus,
        paymentDay: validPaymentDay,
      };
      if (isEdit && initial) {
        await updateExpense(initial.id, patch);
        toast.success("Egreso actualizado");
      } else {
        await addExpense({
          ...patch,
          recurrenceEndDate: null,
          mktBudgetClientId: null,
        });
        toast.success("Egreso registrado");
      }
      onSaved();
    } catch (err) {
      // Supabase errors traen code/message/details/hint. Mostramos
      // todo lo disponible para que el director pueda diagnosticar
      // (ej "column X does not exist" → migración pendiente).
      const e = err as {
        message?: string;
        details?: string;
        hint?: string;
        code?: string;
      };
      console.error("addExpense error:", err);
      const parts = [e?.message, e?.details, e?.hint]
        .filter((s) => typeof s === "string" && s.trim().length > 0)
        .join(" · ");
      toast.error("No se pudo guardar el egreso", {
        description: parts || "Error desconocido — revisá la consola del navegador.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? "Editar egreso" : "Nuevo egreso"}
      description={
        isEdit
          ? "Modificá los detalles del egreso"
          : "Registrá el gasto con su proveedor, IVA y comprobante"
      }
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} loading={saving} variant="primary">
            {isEdit ? "Guardar cambios" : "Registrar egreso"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Tipo" required>
            <Select
              value={recurrence}
              onChange={(e) =>
                setRecurrence(e.target.value as ExpenseRecurrence)
              }
            >
              <option value="one_time">Único pago</option>
              <option value="monthly_fixed">Fijo mensual</option>
            </Select>
          </Field>
          <Field label="Fecha" required>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Concepto" required>
          <Input
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            placeholder="Ej: Sueldo Laura · Mayo"
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Proveedor">
            <Input
              value={providerName}
              onChange={(e) => setProviderName(e.target.value)}
              placeholder="Nombre del proveedor o empresa"
            />
          </Field>
          <Field label="Categoría" required>
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

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
            <Select value="USD" disabled>
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

        {amountNumber > 0 && (
          <div className="bg-paper-100 border border-rule rounded-premium-sm px-4 py-3 grid grid-cols-3 gap-4">
            <div>
              <div className="eyebrow">Neto</div>
              <div className="text-md font-semibold text-ink tabular-nums mt-0.5">
                USD {amountNumber.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="eyebrow">IVA ({ivaNumber}%)</div>
              <div className="text-md font-semibold text-ink tabular-nums mt-0.5">
                USD {ivaAmount.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="eyebrow">Total</div>
              <div className="text-md font-bold text-danger tabular-nums mt-0.5">
                USD {totalConIva.toLocaleString()}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Asignado a">
            <Select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
            >
              <option value="Interno">Interno / Compartido</option>
              {clients.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Método de pago">
            <Select
              value={paymentMethod}
              onChange={(e) =>
                setPaymentMethod(e.target.value as ExpensePaymentMethod | "")
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
          {/* Estado solo aplica para egresos de "Único pago". Para los
              fijos mensuales el estado se gestiona por cada mes a
              medida que se va pagando (no por el master record).
              Cuando es monthly_fixed dejamos el status en "pending"
              por default y no mostramos el campo. */}
          {recurrence !== "monthly_fixed" && (
            <Field label="Estado" required>
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value as ExpenseStatus)}
              >
                {EXPENSE_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {/* Día de débito — solo monthly_fixed. Si está seteado, el
              sistema calcula el status del mes en curso solo:
              pending hasta que llegue el día, paid desde el día. */}
          {recurrence === "monthly_fixed" && (
            <Field
              label="Día de débito del mes"
              hint='Cuándo se debita (ej "5" para el 5 de cada mes). Si lo dejás vacío, vas a tener que marcar el pago a mano cada mes.'
            >
              <Input
                type="number"
                min={1}
                max={31}
                step={1}
                value={paymentDay}
                onChange={(e) => setPaymentDay(e.target.value)}
                placeholder="Ej: 5"
              />
            </Field>
          )}
        </div>

        <Field
          label="Factura"
          hint="PDF o imagen de la factura del proveedor (opcional)"
        >
          <FileUpload
            kind="expense"
            value={invoiceUrl}
            onChange={setInvoiceUrl}
          />
        </Field>
      </div>
    </Modal>
  );
}
