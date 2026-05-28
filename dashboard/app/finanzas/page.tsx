"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import Topbar from "@/components/Topbar";
import NewExpenseModal from "@/components/NewExpenseModal";
import {
  getClients,
  getExpenses,
  getPayments,
  setPaymentStatus,
  setPaymentAmount,
  deletePayment,
  deleteExpense,
  getLeads,
} from "@/lib/storage";
import { getCurrentProfile, hasSession } from "@/lib/supabase/auth";
import {
  EXPENSE_CATEGORY_LABEL,
  type Client,
  type Expense,
  type ExpenseCategory,
  type InvoicePayment,
  type Lead,
} from "@/lib/types";
import {
  DashboardView,
  DividendosView,
  EstadosView,
  ManualRevenuesPanel,
  MetricasView,
  MktClientesView,
  TeamCostView,
} from "./FinanzasViews";
import {
  listManualRevenues,
  revenueMonthlyImpact,
  type ManualRevenue,
} from "@/lib/finanzas";
import styles from "./finanzas.module.css";

type FinPage =
  | "dashboard"
  | "metricas"
  | "ingresos"
  | "egresos"
  | "equipo"
  | "mkt_clientes"
  | "dividendos"
  | "estados"
  | "clientes"
  | "facturacion";

const MONTH_ISO = () => new Date().toISOString().slice(0, 7);

export default function FinanzasPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [isDirector, setIsDirector] = useState(false);
  const [page, setPage] = useState<FinPage>("dashboard");
  const [clients, setClients] = useState<Client[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<InvoicePayment[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [expenseModal, setExpenseModal] = useState(false);
  const [manualRevs, setManualRevs] = useState<ManualRevenue[]>([]);

  const refresh = useCallback(() => {
    getClients().then(setClients);
    getExpenses().then(setExpenses);
    getPayments().then(setPayments);
    getLeads().then(setLeads);
    listManualRevenues().then(setManualRevs);
  }, []);

  useEffect(() => {
    hasSession().then(async (has) => {
      if (!has) {
        router.replace("/");
        return;
      }
      // Gate: solo director ve Finanzas (info sensible: pagos, payroll, expenses)
      const profile = await getCurrentProfile();
      if (profile?.role !== "director") {
        router.replace(profile?.role === "client" ? "/portal" : "/hub");
        return;
      }
      setIsDirector(true);
      setAuthChecked(true);
      refresh();
    });
  }, [router, refresh]);

  // ====== Cálculos ======
  const mrr = useMemo(
    () => clients.reduce((s, c) => s + c.fee, 0),
    [clients],
  );
  const totalExpenses = useMemo(
    () => expenses.reduce((s, e) => s + e.amount, 0),
    [expenses],
  );
  // Net del mes actual incluye fees mensuales + ingresos manuales que
  // aplican al mes − egresos. Es la base sobre la que se calculan los
  // dividendos en DividendosView.
  const monthYYYYMM = MONTH_ISO();
  const manualRevImpact = useMemo(
    () =>
      manualRevs.reduce(
        (s, r) => s + revenueMonthlyImpact(r, monthYYYYMM),
        0,
      ),
    [manualRevs, monthYYYYMM],
  );
  const monthlyExpenses = useMemo(
    () =>
      expenses
        .filter((e) => (e.date ?? "").startsWith(monthYYYYMM))
        .reduce((s, e) => s + e.amount, 0),
    [expenses, monthYYYYMM],
  );
  const monthlyNet = mrr + manualRevImpact - monthlyExpenses;

  const netResult = mrr - totalExpenses;
  const marginPct = mrr > 0 ? Math.round((netResult / mrr) * 100) : 0;
  const pipelineValue = useMemo(
    () => leads.reduce((s, l) => s + l.value, 0),
    [leads],
  );

  if (!authChecked) return null;

  // Sidebar unificado bajo un solo header "Finanzas" — el director
  // pidió no fragmentar en sub-secciones.
  const SECTIONS: {
    label: string;
    items: { key: FinPage; icon: string; label: string }[];
  }[] = [
    {
      label: "Finanzas",
      items: [
        { key: "dashboard", icon: "◈", label: "Panel principal" },
        { key: "metricas", icon: "▲", label: "Métricas del negocio" },
        { key: "ingresos", icon: "↑", label: "Ingresos" },
        { key: "egresos", icon: "↓", label: "Egresos" },
        { key: "equipo", icon: "◌", label: "Funcionales" },
        { key: "mkt_clientes", icon: "◐", label: "Mkt Clientes" },
        { key: "dividendos", icon: "◆", label: "Distribución de dividendos" },
        { key: "estados", icon: "▦", label: "Estados financieros" },
        { key: "clientes", icon: "◉", label: "Clientes activos" },
        { key: "facturacion", icon: "$", label: "Facturación" },
      ],
    },
  ];

  return (
    <>
      <Topbar showPrimary={false} searchPlaceholder="Buscar en finanzas…" />

      <div className={styles.view}>
        <div className={styles.layout}>
          <aside className={styles.sidebar}>
            <div className={styles.sidebarInfo}>
              <div className={styles.sidebarTitle}>Panel Empresarial</div>
              <div className={styles.sidebarSub}>
                Finanzas · Análisis · Empresa
              </div>
            </div>

            {SECTIONS.map((section) => (
              <div key={section.label} className={styles.sidebarSection}>
                <div className={styles.sidebarLabel}>{section.label}</div>
                {section.items.map((item) => (
                  <button
                    key={item.key}
                    className={`${styles.sidebarNavItem} ${
                      page === item.key ? styles.active : ""
                    }`}
                    onClick={() => setPage(item.key)}
                  >
                    <span className="icon">{item.icon}</span> {item.label}
                  </button>
                ))}
              </div>
            ))}
          </aside>

          <main className={styles.main}>
            {page === "dashboard" && (
              <DashboardView
                clients={clients}
                expenses={expenses}
                payments={payments}
                manualRevs={manualRevs}
                leads={leads}
                mrr={mrr}
                totalExpenses={totalExpenses}
                netResult={netResult}
                marginPct={marginPct}
                pipelineValue={pipelineValue}
              />
            )}
            {page === "ingresos" && (
              <>
                <IngresosView
                  clients={clients}
                  payments={payments}
                  onTogglePaid={async (clientId, month) => {
                    const existing = payments.find(
                      (p) => p.clientId === clientId && p.month === month,
                    );
                    const next =
                      existing?.status === "paid" ? "pending" : "paid";
                    await setPaymentStatus(clientId, month, next);
                    refresh();
                  }}
                  onSetAmount={async (clientId, month, amount, note) => {
                    await setPaymentAmount(clientId, month, amount, note);
                    refresh();
                  }}
                  onDeletePayment={async (clientId, month) => {
                    await deletePayment(clientId, month);
                    refresh();
                  }}
                  mrr={mrr}
                />
                <ManualRevenuesPanel clients={clients} />
              </>
            )}
            {page === "equipo" && <TeamCostView />}
            {page === "dividendos" && (
              <DividendosView
                clients={clients}
                expenses={expenses}
                payments={payments}
                manualRevs={manualRevs}
              />
            )}
            {page === "estados" && (
              <EstadosView
                clients={clients}
                expenses={expenses}
                payments={payments.map((p) => ({
                  clientId: p.clientId,
                  month: p.month,
                  status: p.status,
                  amountOverride: p.amountOverride,
                  note: p.note,
                }))}
                monthYYYYMM={monthYYYYMM}
              />
            )}
            {page === "egresos" && (
              <EgresosView
                expenses={expenses}
                totalExpenses={totalExpenses}
                onAdd={() => setExpenseModal(true)}
                onDelete={async (id) => {
                  if (confirm("¿Eliminar este egreso?")) {
                    await deleteExpense(id);
                    refresh();
                  }
                }}
                isDirector={isDirector}
                month={MONTH_ISO()}
                onRefresh={refresh}
              />
            )}
            {page === "clientes" && (
              <ClientesView clients={clients} expenses={expenses} />
            )}
            {page === "facturacion" && (
              <FacturacionView
                clients={clients}
                payments={payments}
                onSetStatus={async (clientId, month, status) => {
                  await setPaymentStatus(clientId, month, status);
                  refresh();
                }}
                onSetAmount={async (clientId, month, amount, note) => {
                  await setPaymentAmount(clientId, month, amount, note);
                  refresh();
                }}
                onDeletePayment={async (clientId, month) => {
                  await deletePayment(clientId, month);
                  refresh();
                }}
              />
            )}
            {page === "mkt_clientes" && (
              <MktClientesView
                clients={clients}
                expenses={expenses}
                onRefresh={refresh}
              />
            )}
            {page === "metricas" && (
              <MetricasView
                clients={clients}
                expenses={expenses}
                payments={payments}
                manualRevs={manualRevs}
                leads={leads}
                mrr={mrr}
              />
            )}
          </main>
        </div>
      </div>

      <NewExpenseModal
        open={expenseModal}
        onClose={() => setExpenseModal(false)}
        onCreated={refresh}
      />
    </>
  );
}

// ==================== SUB VIEWS ====================

function Header({
  eyebrow,
  title,
  rightLabel,
  rightValue,
  action,
}: {
  eyebrow: string;
  title: string;
  rightLabel?: string;
  rightValue?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={styles.head}>
      <div>
        <div className={styles.eyebrow}>{eyebrow}</div>
        <h1>{title}</h1>
      </div>
      {action ?? (
        rightLabel && (
          <div className={styles.metaLabel}>
            {rightLabel}
            <strong className={styles.metaStrong}>{rightValue}</strong>
          </div>
        )
      )}
    </div>
  );
}

function EmptyState({ icon, title, desc, action }: { icon: string; title: string; desc: string; action?: React.ReactNode }) {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyIcon}>{icon}</div>
      <div className={styles.emptyTitle}>{title}</div>
      <div className={styles.emptyDesc}>{desc}</div>
      {action}
    </div>
  );
}

function IngresosView({
  clients,
  payments,
  onTogglePaid,
  onSetAmount,
  onDeletePayment,
  mrr,
}: {
  clients: Client[];
  payments: InvoicePayment[];
  onTogglePaid: (clientId: string, month: string) => void;
  onSetAmount: (
    clientId: string,
    month: string,
    amount: number | null,
    note: string | null,
  ) => void;
  onDeletePayment: (clientId: string, month: string) => void;
  mrr: number;
}) {
  const month = MONTH_ISO();
  // ID del cliente cuyo importe se está editando inline
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editNote, setEditNote] = useState("");

  function paymentFor(clientId: string) {
    return payments.find((p) => p.clientId === clientId && p.month === month);
  }

  function startEdit(c: Client) {
    const p = paymentFor(c.id);
    setEditingClientId(c.id);
    setEditAmount(
      p?.amountOverride != null ? String(p.amountOverride) : String(c.fee),
    );
    setEditNote(p?.note ?? "");
  }
  function cancelEdit() {
    setEditingClientId(null);
    setEditAmount("");
    setEditNote("");
  }
  function saveEdit(c: Client) {
    const n = Number(editAmount);
    if (Number.isNaN(n) || n < 0) {
      alert("Importe inválido.");
      return;
    }
    // Si el monto es exactamente el del fee, no guardamos override (sirve
    // como "limpiar override")
    const override = n === c.fee ? null : n;
    onSetAmount(c.id, month, override, editNote.trim() || null);
    cancelEdit();
  }

  return (
    <>
      <Header
        eyebrow="Finanzas · Ingresos"
        title="Ingresos del mes"
        rightLabel="MRR total"
        rightValue={`US$ ${mrr.toLocaleString()}`}
      />

      {clients.length === 0 ? (
        <EmptyState
          icon="↑"
          title="No hay ingresos todavía"
          desc="Los ingresos se calculan automáticamente a partir de los fees de tus clientes."
        />
      ) : (
        <div className={styles.table}>
          <h3>Cobros por cliente</h3>
          <div
            className={`${styles.row} ${styles.rowHead}`}
            style={{ gridTemplateColumns: "2fr 1.2fr 1fr 2fr" }}
          >
            <div>Cliente</div>
            <div>Importe a cobrar</div>
            <div>Estado</div>
            <div>Acciones</div>
          </div>
          {clients.map((c) => {
            const p = paymentFor(c.id);
            const st = p?.status ?? "pending";
            const amount = p?.amountOverride ?? c.fee;
            const hasOverride = p?.amountOverride != null;
            const isEditingThis = editingClientId === c.id;

            return (
              <div
                key={c.id}
                className={styles.row}
                style={{
                  gridTemplateColumns: "2fr 1.2fr 1fr 2fr",
                  background: isEditingThis
                    ? "rgba(196, 168, 130, 0.08)"
                    : undefined,
                }}
              >
                <div className={styles.num}>
                  {c.name}
                  {p?.note && (
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-muted)",
                        marginTop: 2,
                      }}
                    >
                      {p.note}
                    </div>
                  )}
                </div>

                {isEditingThis ? (
                  <div>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      autoFocus
                      style={{
                        padding: "6px 8px",
                        border: "1px solid rgba(10,26,12,0.15)",
                        background: "var(--white)",
                        color: "var(--deep-green)",
                        fontFamily: "inherit",
                        fontSize: 13,
                        width: "100%",
                      }}
                    />
                    <input
                      type="text"
                      placeholder="Nota (opcional)"
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      style={{
                        marginTop: 4,
                        padding: "4px 8px",
                        border: "1px solid rgba(10,26,12,0.15)",
                        background: "var(--white)",
                        color: "var(--deep-green)",
                        fontFamily: "inherit",
                        fontSize: 11,
                        width: "100%",
                      }}
                    />
                  </div>
                ) : (
                  <div className={`${styles.num} ${styles.pos}`}>
                    US$ {amount.toLocaleString()}
                    {hasOverride && (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: 9,
                          letterSpacing: "0.12em",
                          textTransform: "uppercase",
                          color: "var(--sand-dark)",
                          fontWeight: 700,
                        }}
                        title={`Fee de contrato: US$ ${c.fee.toLocaleString()}`}
                      >
                        · OVERRIDE
                      </span>
                    )}
                  </div>
                )}

                <div>
                  <span
                    className={`${styles.pill} ${
                      st === "paid"
                        ? styles.pillPaid
                        : st === "late"
                          ? styles.pillLate
                          : styles.pillPending
                    }`}
                  >
                    {st === "paid"
                      ? "Pagado"
                      : st === "late"
                        ? "Vencido"
                        : "Pendiente"}
                  </span>
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {isEditingThis ? (
                    <>
                      <button
                        onClick={() => saveEdit(c)}
                        style={actionBtnSolid}
                      >
                        Guardar
                      </button>
                      <button onClick={cancelEdit} style={actionBtnGhost}>
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => onTogglePaid(c.id, month)}
                        style={actionBtnGhost}
                      >
                        {st === "paid" ? "↶ Pendiente" : "✓ Pagado"}
                      </button>
                      <button
                        onClick={() => startEdit(c)}
                        style={actionBtnGhost}
                        title="Cambiar el importe a cobrar para este mes"
                      >
                        ✎ Editar
                      </button>
                      {p && (
                        <button
                          onClick={() => {
                            if (
                              confirm(
                                `¿Borrar el cobro de ${c.name} de este mes?\n\nVuelve a estado "pendiente" y se elimina cualquier override de importe.`,
                              )
                            )
                              onDeletePayment(c.id, month);
                          }}
                          style={{
                            ...actionBtnGhost,
                            color: "var(--red-warn)",
                            borderColor: "rgba(176, 75, 58, 0.3)",
                          }}
                          title="Borrar este cobro"
                        >
                          × Borrar
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

const actionBtnGhost: React.CSSProperties = {
  padding: "5px 10px",
  fontSize: 11,
  letterSpacing: "0.04em",
  color: "var(--deep-green)",
  border: "1px solid rgba(10,26,12,0.15)",
  background: "transparent",
  cursor: "pointer",
  fontFamily: "inherit",
  fontWeight: 500,
  borderRadius: "var(--r-sm)",
};

const actionBtnSolid: React.CSSProperties = {
  padding: "5px 10px",
  fontSize: 11,
  letterSpacing: "0.04em",
  color: "var(--off-white)",
  border: "none",
  background: "var(--deep-green)",
  cursor: "pointer",
  fontFamily: "inherit",
  fontWeight: 600,
  borderRadius: "var(--r-sm)",
};

function EgresosView({
  expenses,
  totalExpenses,
  onAdd,
  onDelete,
}: {
  expenses: Expense[];
  totalExpenses: number;
  onAdd: () => void;
  onDelete: (id: string) => void;
  isDirector: boolean;
  month: string;
  onRefresh: () => void;
}) {
  // Mes actual para el donut
  const monthIso = MONTH_ISO();
  const byCategoryMonth = expenses
    .filter((e) => (e.date ?? "").startsWith(monthIso))
    .reduce((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + e.amount;
      return acc;
    }, {} as Record<string, number>);

  return (
    <>
      <Header
        eyebrow="Finanzas · Egresos"
        title="Egresos"
        action={
          <button className={styles.btnPrimary} onClick={onAdd}>
            + Registrar egreso
          </button>
        }
      />

      {/* Donut + KPIs */}
      <ExpenseBreakdown
        byCategory={byCategoryMonth}
        totalMonth={Object.values(byCategoryMonth).reduce((a, b) => a + b, 0)}
        totalAll={totalExpenses}
        monthLabel={monthIso}
      />

      {expenses.length === 0 ? (
        <EmptyState
          icon="↓"
          title="No hay egresos registrados"
          desc="Cargá tus costos fijos (sueldos, tools, IA) y variables (producción, UGC) para ver tu margen real."
          action={<button className={styles.btnPrimary} onClick={onAdd}>+ Registrar primer egreso</button>}
        />
      ) : (
        <div className={styles.table}>
          <h3>Movimientos</h3>
          <div className={`${styles.row} ${styles.rowHead}`} style={{ gridTemplateColumns: "1fr 2.5fr 1fr 1fr 1fr 40px" }}>
            <div>Fecha</div><div>Concepto</div><div>Categoría</div><div>Asignado</div><div>Monto</div><div></div>
          </div>
          {[...expenses].sort((a, b) => b.date.localeCompare(a.date)).map((e) => (
            <div key={e.id} className={styles.row} style={{ gridTemplateColumns: "1fr 2.5fr 1fr 1fr 1fr 40px" }}>
              <div style={{ color: "var(--sand)", fontSize: 11 }}>{e.date}</div>
              <div className={styles.num}>{e.concept}</div>
              <div style={{ color: "rgba(232,228,220,0.6)", fontSize: 12 }}>
                {EXPENSE_CATEGORY_LABEL[e.category as ExpenseCategory] ?? e.category}
              </div>
              <div style={{ color: "rgba(232,228,220,0.5)", fontSize: 12 }}>{e.assignedTo}</div>
              <div className={`${styles.num} ${styles.neg}`}>-US$ {e.amount.toLocaleString()}</div>
              <div>
                <button
                  onClick={() => onDelete(e.id)}
                  style={{ color: "var(--red-warn)", fontSize: 16, cursor: "pointer", background: "transparent", border: "none" }}
                >×</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ClientesView({ clients, expenses }: { clients: Client[]; expenses: Expense[] }) {
  return (
    <>
      <Header eyebrow="Análisis · Rentabilidad" title="Clientes activos" />

      {clients.length === 0 ? (
        <EmptyState icon="◉" title="Sin clientes todavía" desc="Creá clientes en el Hub para ver la rentabilidad por cada uno." />
      ) : (
        <div className={styles.table}>
          <h3>Rentabilidad por cliente</h3>
          <div className={`${styles.row} ${styles.rowHead}`} style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr" }}>
            <div>Cliente</div><div>Ingreso</div><div>Costo asignado</div><div>Margen</div><div>Margen %</div>
          </div>
          {clients.map((c) => {
            const clientCost = expenses
              .filter((e) => e.assignedTo === c.name)
              .reduce((s, e) => s + e.amount, 0);
            const margin = c.fee - clientCost;
            const pct = c.fee > 0 ? Math.round((margin / c.fee) * 100) : 0;
            return (
              <div key={c.id} className={styles.row} style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr" }}>
                <div className={styles.num}>{c.name}</div>
                <div className={`${styles.num} ${styles.pos}`}>US$ {c.fee.toLocaleString()}</div>
                <div className={`${styles.num} ${styles.neg}`}>US$ {clientCost.toLocaleString()}</div>
                <div className={styles.num}>US$ {margin.toLocaleString()}</div>
                <div>
                  <div style={{ color: "var(--sand)", fontWeight: 600 }}>{pct}%</div>
                  <div className={styles.marginBar}><div className={styles.marginFill} style={{ width: `${Math.max(0, Math.min(pct, 100))}%` }} /></div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function FacturacionView({
  clients,
  payments,
  onSetStatus,
  onSetAmount,
  onDeletePayment,
}: {
  clients: Client[];
  payments: InvoicePayment[];
  onSetStatus: (clientId: string, month: string, status: "paid" | "pending" | "late") => void;
  onSetAmount: (clientId: string, month: string, amount: number | null, note: string | null) => void;
  onDeletePayment: (clientId: string, month: string) => void;
}) {
  const month = MONTH_ISO();
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editNote, setEditNote] = useState("");

  function paymentFor(clientId: string) {
    return payments.find((p) => p.clientId === clientId && p.month === month);
  }
  function effectiveAmount(c: Client): number {
    const p = paymentFor(c.id);
    return p?.amountOverride ?? c.fee;
  }
  function status(clientId: string) {
    return paymentFor(clientId)?.status || "pending";
  }

  // Totales con override real
  const totalBilled = clients.reduce((s, c) => s + effectiveAmount(c), 0);
  const paid = clients
    .filter((c) => status(c.id) === "paid")
    .reduce((s, c) => s + effectiveAmount(c), 0);
  const late = clients
    .filter((c) => status(c.id) === "late")
    .reduce((s, c) => s + effectiveAmount(c), 0);
  const pending = totalBilled - paid - late;

  function startEdit(c: Client) {
    const p = paymentFor(c.id);
    setEditingClientId(c.id);
    setEditAmount(p?.amountOverride != null ? String(p.amountOverride) : String(c.fee));
    setEditNote(p?.note ?? "");
  }
  function cancelEdit() {
    setEditingClientId(null);
    setEditAmount("");
    setEditNote("");
  }
  function saveEdit(c: Client) {
    const n = Number(editAmount);
    if (Number.isNaN(n) || n < 0) {
      alert("Importe inválido.");
      return;
    }
    const override = n === c.fee ? null : n;
    onSetAmount(c.id, month, override, editNote.trim() || null);
    cancelEdit();
  }

  return (
    <>
      <Header
        eyebrow="Finanzas · Cobranza"
        title="Facturación"
        rightLabel="Facturado este mes"
        rightValue={`US$ ${totalBilled.toLocaleString()}`}
      />

      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <div className={styles.kLabel}>Facturado</div>
          <div className={styles.kValue}>US$ {totalBilled.toLocaleString()}</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kLabel}>Cobrado</div>
          <div className={styles.kValue} style={{ color: "var(--green-ok)" }}>
            US$ {paid.toLocaleString()}
          </div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kLabel}>Pendiente</div>
          <div className={styles.kValue} style={{ color: "var(--yellow-warn)" }}>
            US$ {pending.toLocaleString()}
          </div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kLabel}>Vencido</div>
          <div className={styles.kValue} style={{ color: "var(--red-warn)" }}>
            US$ {late.toLocaleString()}
          </div>
        </div>
      </div>

      {clients.length === 0 ? (
        <EmptyState
          icon="$"
          title="Sin clientes todavía"
          desc="La facturación se arma automáticamente a partir de los fees de tus clientes."
        />
      ) : (
        <div className={styles.table}>
          <h3>Facturas del mes ({month})</h3>
          <div
            className={`${styles.row} ${styles.rowHead}`}
            style={{ gridTemplateColumns: "2fr 1.2fr 1fr 2fr" }}
          >
            <div>Cliente</div>
            <div>Monto</div>
            <div>Estado</div>
            <div>Acciones</div>
          </div>
          {clients.map((c) => {
            const p = paymentFor(c.id);
            const st = status(c.id);
            const amt = effectiveAmount(c);
            const hasOverride = p?.amountOverride != null;
            const isEditingThis = editingClientId === c.id;

            return (
              <div
                key={c.id}
                className={styles.row}
                style={{
                  gridTemplateColumns: "2fr 1.2fr 1fr 2fr",
                  background: isEditingThis
                    ? "rgba(196,168,130,0.08)"
                    : undefined,
                }}
              >
                <div className={styles.num}>
                  {c.name}
                  {p?.note && (
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-muted)",
                        marginTop: 2,
                      }}
                    >
                      {p.note}
                    </div>
                  )}
                </div>

                {isEditingThis ? (
                  <div>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      autoFocus
                      style={{
                        padding: "6px 8px",
                        border: "1px solid rgba(10,26,12,0.15)",
                        background: "var(--white)",
                        color: "var(--deep-green)",
                        fontFamily: "inherit",
                        fontSize: 13,
                        width: "100%",
                      }}
                    />
                    <input
                      type="text"
                      placeholder="Nota (opcional)"
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      style={{
                        marginTop: 4,
                        padding: "4px 8px",
                        border: "1px solid rgba(10,26,12,0.15)",
                        background: "var(--white)",
                        color: "var(--deep-green)",
                        fontFamily: "inherit",
                        fontSize: 11,
                        width: "100%",
                      }}
                    />
                  </div>
                ) : (
                  <div className={`${styles.num} ${styles.pos}`}>
                    US$ {amt.toLocaleString()}
                    {hasOverride && (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: 9,
                          letterSpacing: "0.12em",
                          textTransform: "uppercase",
                          color: "var(--sand-dark)",
                          fontWeight: 700,
                        }}
                        title={`Fee de contrato: US$ ${c.fee.toLocaleString()}`}
                      >
                        · OVERRIDE
                      </span>
                    )}
                  </div>
                )}

                <div>
                  <span
                    className={`${styles.pill} ${
                      st === "paid"
                        ? styles.pillPaid
                        : st === "late"
                          ? styles.pillLate
                          : styles.pillPending
                    }`}
                  >
                    {st === "paid"
                      ? "Pagado"
                      : st === "late"
                        ? "Vencido"
                        : "Pendiente"}
                  </span>
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {isEditingThis ? (
                    <>
                      <button onClick={() => saveEdit(c)} style={actionBtnSolid}>
                        Guardar
                      </button>
                      <button onClick={cancelEdit} style={actionBtnGhost}>
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      {st !== "paid" && (
                        <button
                          onClick={() => onSetStatus(c.id, month, "paid")}
                          style={actionBtnGhost}
                        >
                          ✓ Pagado
                        </button>
                      )}
                      {st !== "pending" && (
                        <button
                          onClick={() => onSetStatus(c.id, month, "pending")}
                          style={actionBtnGhost}
                        >
                          Pendiente
                        </button>
                      )}
                      {st !== "late" && (
                        <button
                          onClick={() => onSetStatus(c.id, month, "late")}
                          style={{ ...actionBtnGhost, color: "var(--red-warn)" }}
                        >
                          Vencido
                        </button>
                      )}
                      <button
                        onClick={() => startEdit(c)}
                        style={actionBtnGhost}
                        title="Cambiar importe / nota"
                      >
                        ✎
                      </button>
                      {p && (
                        <button
                          onClick={() => {
                            if (confirm(`¿Borrar el cobro de ${c.name}?`))
                              onDeletePayment(c.id, month);
                          }}
                          style={{
                            ...actionBtnGhost,
                            color: "var(--red-warn)",
                            borderColor: "rgba(176,75,58,0.3)",
                          }}
                        >
                          ×
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

const btnMini: React.CSSProperties = {
  padding: "4px 10px", fontSize: 10, letterSpacing: "0.08em",
  color: "var(--off-white)", border: "1px solid rgba(196,168,130,0.3)",
  background: "transparent", cursor: "pointer", fontFamily: "inherit",
  textTransform: "uppercase", fontWeight: 500,
};

// KPIsView movido a FinanzasViews.tsx (versión completa con gráficas).

// ============================================================
// ExpenseBreakdown — donut de pacing + KPIs por categoría
// ============================================================
const EXPENSE_CAT_COLORS: Record<ExpenseCategory, string> = {
  equipo: "#0A1A0C",
  tools: "#C4A882",
  ia: "#9B8259",
  produccion: "#2d5036",
  impuestos: "#b04b3a",
  mkt_interno: "#3A8B5C",
  otros: "#7A8A7E",
};

function ExpenseBreakdown({
  byCategory,
  totalMonth,
  totalAll,
  monthLabel,
}: {
  byCategory: Record<string, number>;
  totalMonth: number;
  totalAll: number;
  monthLabel: string;
}) {
  // Datos para el donut: solo categorías con valor > 0, ordenadas
  // de mayor a menor.
  const donutData = (
    Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[]
  )
    .map((k) => ({
      key: k,
      name: EXPENSE_CATEGORY_LABEL[k],
      value: byCategory[k] ?? 0,
      color: EXPENSE_CAT_COLORS[k],
    }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.2fr 1fr",
        gap: 20,
        marginBottom: 24,
      }}
    >
      {/* KPIs por categoría */}
      <div
        style={{
          background: "var(--white)",
          border: "1px solid rgba(10,26,12,0.08)",
          borderRadius: "var(--r-lg)",
          padding: 20,
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--sand-dark)",
              fontWeight: 700,
              marginBottom: 4,
            }}
          >
            Egresos · {monthLabel}
          </div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 700,
              letterSpacing: "-0.025em",
              color: "var(--deep-green)",
            }}
          >
            US$ {totalMonth.toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
            Total histórico: US$ {totalAll.toLocaleString()}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
          }}
        >
          {(Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[]).map(
            (k) => {
              const v = byCategory[k] ?? 0;
              const pct =
                totalMonth > 0 ? Math.round((v / totalMonth) * 100) : 0;
              return (
                <div
                  key={k}
                  style={{
                    padding: "10px 12px",
                    background: "var(--off-white)",
                    borderLeft: `3px solid ${EXPENSE_CAT_COLORS[k]}`,
                  }}
                >
                  <div
                    style={{
                      fontSize: 9,
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      color: "var(--sand-dark)",
                      fontWeight: 700,
                      marginBottom: 4,
                    }}
                  >
                    {EXPENSE_CATEGORY_LABEL[k]}
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: "var(--deep-green)",
                    }}
                  >
                    US$ {v.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                    {pct}%
                  </div>
                </div>
              );
            },
          )}
        </div>
      </div>

      {/* Donut */}
      <div
        style={{
          background: "var(--white)",
          border: "1px solid rgba(10,26,12,0.08)",
          borderRadius: "var(--r-lg)",
          padding: 20,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--sand-dark)",
            fontWeight: 700,
            marginBottom: 12,
          }}
        >
          Pacing por categoría
        </div>
        {donutData.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted)",
              fontSize: 12,
              fontStyle: "italic",
            }}
          >
            Sin egresos cargados en {monthLabel}
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 260 }}>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={donutData}
                  dataKey="value"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={95}
                  paddingAngle={2}
                  label={(props) => {
                    const { percent } = props as { percent?: number };
                    return percent && percent > 0.05
                      ? `${Math.round(percent * 100)}%`
                      : "";
                  }}
                  labelLine={false}
                >
                  {donutData.map((d) => (
                    <Cell key={d.key} fill={d.color} />
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
          </div>
        )}
      </div>
    </div>
  );
}
