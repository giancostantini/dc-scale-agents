"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Topbar from "@/components/Topbar";
import NewExpenseModal from "@/components/NewExpenseModal";
import {
  getClients,
  getExpenses,
  getPayments,
  setPaymentStatus,
  deleteExpense,
  getLeads,
} from "@/lib/storage";
import { hasSession } from "@/lib/supabase/auth";
import type { Client, Expense, InvoicePayment, Lead } from "@/lib/types";
import styles from "./finanzas.module.css";

type FinPage =
  | "dashboard"
  | "ingresos"
  | "egresos"
  | "clientes"
  | "resultados"
  | "facturacion"
  | "log"
  | "kpis";

const MONTH_ISO = () => new Date().toISOString().slice(0, 7);

export default function FinanzasPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [page, setPage] = useState<FinPage>("dashboard");
  const [clients, setClients] = useState<Client[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<InvoicePayment[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [expenseModal, setExpenseModal] = useState(false);

  const refresh = useCallback(() => {
    getClients().then(setClients);
    getExpenses().then(setExpenses);
    getPayments().then(setPayments);
    getLeads().then(setLeads);
  }, []);

  useEffect(() => {
    hasSession().then((has) => {
      if (!has) {
        router.replace("/");
        return;
      }
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
  const netResult = mrr - totalExpenses;
  const marginPct = mrr > 0 ? Math.round((netResult / mrr) * 100) : 0;
  const pipelineValue = useMemo(
    () => leads.reduce((s, l) => s + l.value, 0),
    [leads],
  );

  if (!authChecked) return null;

  const SECTIONS: {
    label: string;
    items: { key: FinPage; icon: string; label: string }[];
  }[] = [
    {
      label: "Finanzas",
      items: [
        { key: "dashboard", icon: "◈", label: "Dashboard" },
        { key: "ingresos", icon: "↑", label: "Ingresos" },
        { key: "egresos", icon: "↓", label: "Egresos" },
      ],
    },
    {
      label: "Análisis",
      items: [
        { key: "clientes", icon: "◉", label: "Clientes activos" },
        { key: "resultados", icon: "▦", label: "Resultados operativos" },
        { key: "facturacion", icon: "$", label: "Facturación" },
        { key: "log", icon: "▢", label: "Log de actividad" },
      ],
    },
    {
      label: "Empresa",
      items: [{ key: "kpis", icon: "▲", label: "KPIs anuales" }],
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
                mrr={mrr}
                totalExpenses={totalExpenses}
                netResult={netResult}
                marginPct={marginPct}
                pipelineValue={pipelineValue}
              />
            )}
            {page === "ingresos" && (
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
                mrr={mrr}
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
              />
            )}
            {page === "clientes" && (
              <ClientesView clients={clients} expenses={expenses} />
            )}
            {page === "resultados" && (
              <ResultadosView
                clients={clients}
                mrr={mrr}
                marginPct={marginPct}
                pipelineValue={pipelineValue}
                leads={leads}
              />
            )}
            {page === "facturacion" && (
              <FacturacionView
                clients={clients}
                payments={payments}
                onSetStatus={async (clientId, month, status) => {
                  await setPaymentStatus(clientId, month, status);
                  refresh();
                }}
              />
            )}
            {page === "log" && <LogView expenses={expenses} clients={clients} />}
            {page === "kpis" && (
              <KPIsView
                mrr={mrr}
                clients={clients}
                marginPct={marginPct}
                pipelineValue={pipelineValue}
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

function DashboardView({
  clients, mrr, totalExpenses, netResult, marginPct, pipelineValue,
}: {
  clients: Client[]; mrr: number; totalExpenses: number;
  netResult: number; marginPct: number; pipelineValue: number;
}) {
  const gpRevenue = clients.filter((c) => c.type === "gp").reduce((s, c) => s + c.fee, 0);
  const devRevenue = clients.filter((c) => c.type === "dev").reduce((s, c) => s + c.fee, 0);
  const gpPct = mrr > 0 ? Math.round((gpRevenue / mrr) * 100) : 0;
  const devPct = mrr > 0 ? Math.round((devRevenue / mrr) * 100) : 0;

  return (
    <>
      <Header
        eyebrow="Panel empresarial"
        title="Finanzas"
        rightLabel="Resultado neto"
        rightValue={`US$ ${netResult.toLocaleString()}`}
      />

      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <div className={styles.kLabel}>Ingresos (MRR)</div>
          <div className={styles.kValue}>US$ {mrr.toLocaleString()}</div>
          <div className={styles.kSub}>{clients.length} cliente{clients.length === 1 ? "" : "s"} activo{clients.length === 1 ? "" : "s"}</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kLabel}>Egresos</div>
          <div className={styles.kValue}>US$ {totalExpenses.toLocaleString()}</div>
          <div className={styles.kSub}>Equipo + tools + producción</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kLabel}>Margen neto</div>
          <div className={styles.kValue}>{marginPct}%</div>
          <div className={styles.kSub}>Objetivo: 60%</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kLabel}>Pipeline</div>
          <div className={styles.kValue}>US$ {pipelineValue.toLocaleString()}</div>
          <div className={styles.kSub}>Valor de prospectos abiertos</div>
        </div>
      </div>

      {clients.length === 0 ? (
        <EmptyState
          icon="◌"
          title="Todavía no hay datos financieros"
          desc="Creá clientes en el Hub y registrá egresos para empezar a ver tu panel financiero con datos reales."
        />
      ) : (
        <div className={styles.table}>
          <h3>Distribución de ingresos</h3>
          <div style={{ padding: "14px 0", borderBottom: "1px solid rgba(196,168,130,0.08)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>Growth Partner</span>
              <span style={{ color: "var(--sand)", fontWeight: 700 }}>US$ {gpRevenue.toLocaleString()} · {gpPct}%</span>
            </div>
            <div className={styles.marginBar}>
              <div className={styles.marginFill} style={{ width: `${gpPct}%` }} />
            </div>
          </div>
          <div style={{ padding: "14px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>Desarrollo</span>
              <span style={{ color: "var(--sand)", fontWeight: 700 }}>US$ {devRevenue.toLocaleString()} · {devPct}%</span>
            </div>
            <div className={styles.marginBar}>
              <div className={styles.marginFill} style={{ width: `${devPct}%`, background: "var(--forest-2)" }} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function IngresosView({ clients, payments, onTogglePaid, mrr }: {
  clients: Client[]; payments: InvoicePayment[];
  onTogglePaid: (clientId: string, month: string) => void; mrr: number;
}) {
  const month = MONTH_ISO();
  function status(clientId: string) {
    return payments.find((p) => p.clientId === clientId && p.month === month)?.status || "pending";
  }

  return (
    <>
      <Header eyebrow="Finanzas · Ingresos" title="Ingresos del mes" rightLabel="MRR total" rightValue={`US$ ${mrr.toLocaleString()}`} />

      {clients.length === 0 ? (
        <EmptyState icon="↑" title="No hay ingresos todavía" desc="Los ingresos se calculan automáticamente a partir de los fees de tus clientes." />
      ) : (
        <div className={styles.table}>
          <h3>Cobros por cliente</h3>
          <div className={`${styles.row} ${styles.rowHead}`} style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr" }}>
            <div>Cliente</div>
            <div>Fee mensual</div>
            <div>Estado</div>
            <div>Acción</div>
          </div>
          {clients.map((c) => {
            const st = status(c.id);
            return (
              <div key={c.id} className={styles.row} style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr" }}>
                <div className={styles.num}>{c.name}</div>
                <div className={`${styles.num} ${styles.pos}`}>US$ {c.fee.toLocaleString()}</div>
                <div>
                  <span className={`${styles.pill} ${st === "paid" ? styles.pillPaid : st === "late" ? styles.pillLate : styles.pillPending}`}>
                    {st === "paid" ? "Pagado" : st === "late" ? "Vencido" : "Pendiente"}
                  </span>
                </div>
                <div>
                  <button
                    onClick={() => onTogglePaid(c.id, month)}
                    style={{
                      padding: "6px 12px", fontSize: 10, letterSpacing: "0.08em",
                      color: "var(--off-white)", border: "1px solid rgba(196,168,130,0.3)",
                      background: "transparent", cursor: "pointer", fontFamily: "inherit",
                      textTransform: "uppercase", fontWeight: 500,
                    }}
                  >
                    {st === "paid" ? "Marcar pendiente" : "Marcar pagado"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function EgresosView({ expenses, totalExpenses, onAdd, onDelete }: {
  expenses: Expense[]; totalExpenses: number;
  onAdd: () => void; onDelete: (id: string) => void;
}) {
  const byCategory = expenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {} as Record<string, number>);

  return (
    <>
      <Header
        eyebrow="Finanzas · Egresos"
        title="Egresos"
        action={<button className={styles.btnPrimary} onClick={onAdd}>+ Registrar egreso</button>}
      />

      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <div className={styles.kLabel}>Total</div>
          <div className={styles.kValue}>US$ {totalExpenses.toLocaleString()}</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kLabel}>Equipo</div>
          <div className={styles.kValue}>US$ {(byCategory.equipo || 0).toLocaleString()}</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kLabel}>Tools + IA</div>
          <div className={styles.kValue}>US$ {((byCategory.tools || 0) + (byCategory.ia || 0)).toLocaleString()}</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kLabel}>Producción</div>
          <div className={styles.kValue}>US$ {(byCategory.produccion || 0).toLocaleString()}</div>
        </div>
      </div>

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
              <div style={{ color: "rgba(232,228,220,0.6)", fontSize: 12 }}>{e.category}</div>
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

function ResultadosView({ clients, mrr, marginPct, pipelineValue, leads }: {
  clients: Client[]; mrr: number; marginPct: number; pipelineValue: number; leads: Lead[];
}) {
  const ticket = clients.length > 0 ? Math.round(mrr / clients.length) : 0;
  const ltv = ticket * 12;
  const closed = leads.filter((l) => l.stage === "cerrado").length;

  return (
    <>
      <Header eyebrow="Análisis" title="Resultados operativos" />

      <div className={styles.kpis}>
        <div className={styles.kpi}><div className={styles.kLabel}>Ticket promedio</div><div className={styles.kValue}>US$ {ticket.toLocaleString()}</div></div>
        <div className={styles.kpi}><div className={styles.kLabel}>LTV (estimado 12m)</div><div className={styles.kValue}>US$ {ltv.toLocaleString()}</div></div>
        <div className={styles.kpi}><div className={styles.kLabel}>Margen neto</div><div className={styles.kValue}>{marginPct}%</div></div>
        <div className={styles.kpi}><div className={styles.kLabel}>Leads cerrados</div><div className={styles.kValue}>{closed}</div></div>
      </div>

      <div className={styles.table}>
        <h3>Composición</h3>
        {[
          ["Growth Partners activos", clients.filter((c) => c.type === "gp").length],
          ["Clientes de Desarrollo", clients.filter((c) => c.type === "dev").length],
          ["Clientes en On-boarding", clients.filter((c) => c.status === "onboarding").length],
          ["Clientes en Execution", clients.filter((c) => c.status === "active").length],
          ["Pipeline activo (leads)", leads.length],
          ["Valor pipeline", `US$ ${pipelineValue.toLocaleString()}`],
        ].map(([label, value]) => (
          <div key={label as string} className={styles.row} style={{ gridTemplateColumns: "2fr 1fr" }}>
            <div>{label}</div><div className={styles.num}>{value}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function FacturacionView({ clients, payments, onSetStatus }: {
  clients: Client[]; payments: InvoicePayment[];
  onSetStatus: (clientId: string, month: string, status: "paid" | "pending" | "late") => void;
}) {
  const month = MONTH_ISO();
  const totalBilled = clients.reduce((s, c) => s + c.fee, 0);
  const paid = clients
    .filter((c) => payments.find((p) => p.clientId === c.id && p.month === month)?.status === "paid")
    .reduce((s, c) => s + c.fee, 0);
  const late = clients
    .filter((c) => payments.find((p) => p.clientId === c.id && p.month === month)?.status === "late")
    .reduce((s, c) => s + c.fee, 0);
  const pending = totalBilled - paid - late;

  function status(clientId: string) {
    return payments.find((p) => p.clientId === clientId && p.month === month)?.status || "pending";
  }

  return (
    <>
      <Header eyebrow="Finanzas · Cobranza" title="Facturación" rightLabel="Facturado este mes" rightValue={`US$ ${totalBilled.toLocaleString()}`} />

      <div className={styles.kpis}>
        <div className={styles.kpi}><div className={styles.kLabel}>Facturado</div><div className={styles.kValue}>US$ {totalBilled.toLocaleString()}</div></div>
        <div className={styles.kpi}><div className={styles.kLabel}>Cobrado</div><div className={styles.kValue} style={{ color: "var(--green-ok)" }}>US$ {paid.toLocaleString()}</div></div>
        <div className={styles.kpi}><div className={styles.kLabel}>Pendiente</div><div className={styles.kValue} style={{ color: "var(--yellow-warn)" }}>US$ {pending.toLocaleString()}</div></div>
        <div className={styles.kpi}><div className={styles.kLabel}>Vencido</div><div className={styles.kValue} style={{ color: "var(--red-warn)" }}>US$ {late.toLocaleString()}</div></div>
      </div>

      {clients.length === 0 ? (
        <EmptyState icon="$" title="Sin clientes todavía" desc="La facturación se arma automáticamente a partir de los fees de tus clientes." />
      ) : (
        <div className={styles.table}>
          <h3>Facturas del mes ({month})</h3>
          <div className={`${styles.row} ${styles.rowHead}`} style={{ gridTemplateColumns: "2fr 1fr 1fr 2fr" }}>
            <div>Cliente</div><div>Monto</div><div>Estado</div><div>Acciones</div>
          </div>
          {clients.map((c) => {
            const st = status(c.id);
            return (
              <div key={c.id} className={styles.row} style={{ gridTemplateColumns: "2fr 1fr 1fr 2fr" }}>
                <div className={styles.num}>{c.name}</div>
                <div className={`${styles.num} ${styles.pos}`}>US$ {c.fee.toLocaleString()}</div>
                <div><span className={`${styles.pill} ${st === "paid" ? styles.pillPaid : st === "late" ? styles.pillLate : styles.pillPending}`}>{st === "paid" ? "Pagado" : st === "late" ? "Vencido" : "Pendiente"}</span></div>
                <div style={{ display: "flex", gap: 6 }}>
                  {st !== "paid" && <button onClick={() => onSetStatus(c.id, month, "paid")} style={btnMini}>Pagado</button>}
                  {st !== "pending" && <button onClick={() => onSetStatus(c.id, month, "pending")} style={btnMini}>Pendiente</button>}
                  {st !== "late" && <button onClick={() => onSetStatus(c.id, month, "late")} style={{ ...btnMini, color: "var(--red-warn)" }}>Vencido</button>}
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

function LogView({ expenses, clients }: { expenses: Expense[]; clients: Client[] }) {
  const log = [
    ...expenses.map((e) => ({ date: e.date, type: "↓", text: e.concept, meta: `${e.category} · ${e.assignedTo}`, color: "var(--red-warn)" })),
    ...clients.map((c) => ({ date: c.id, type: "◉", text: `Cliente creado: ${c.name}`, meta: `${c.sector} · US$ ${c.fee}/mes`, color: "var(--green-ok)" })),
  ].slice(0, 50);

  return (
    <>
      <Header eyebrow="Auditoría · Actividad" title="Log de actividad" />

      {log.length === 0 ? (
        <EmptyState icon="▢" title="Sin actividad registrada" desc="El log se completa automáticamente a medida que crees clientes, registres egresos y gestiones cobros." />
      ) : (
        <div className={styles.table}>
          <h3>Movimientos</h3>
          {log.map((item, i) => (
            <div key={i} style={{
              padding: "14px 0", borderBottom: "1px solid rgba(196,168,130,0.08)",
              display: "grid", gridTemplateColumns: "100px 40px 2.5fr 1fr", gap: 16, alignItems: "center", fontSize: 13,
            }}>
              <div style={{ color: "var(--sand)", fontSize: 11 }}>{item.date}</div>
              <div style={{ width: 32, height: 32, background: "rgba(196,168,130,0.12)", color: item.color, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{item.type}</div>
              <div style={{ color: "var(--off-white)" }}>{item.text}</div>
              <div style={{ color: "rgba(232,228,220,0.55)", fontSize: 12 }}>{item.meta}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function KPIsView({ mrr, clients, marginPct, pipelineValue }: {
  mrr: number; clients: Client[]; marginPct: number; pipelineValue: number;
}) {
  const targetMRR = 25000;
  const targetClients = 10;
  const mrrPct = Math.round((mrr / targetMRR) * 100);
  const clientsPct = Math.round((clients.length / targetClients) * 100);

  return (
    <>
      <Header eyebrow="Empresa" title={`KPIs ${new Date().getFullYear()}`} rightLabel="Objetivo anual" rightValue={`US$ ${(targetMRR * 12).toLocaleString()}`} />

      <div className={styles.table}>
        <h3>Métricas clave</h3>
        {[
          { label: "MRR", actual: `US$ ${mrr.toLocaleString()}`, target: `US$ ${targetMRR.toLocaleString()}`, pct: mrrPct },
          { label: "Clientes activos", actual: `${clients.length}`, target: `${targetClients}`, pct: clientsPct },
          { label: "Margen neto", actual: `${marginPct}%`, target: "65%", pct: Math.round((marginPct / 65) * 100) },
          { label: "Pipeline qualified", actual: `US$ ${pipelineValue.toLocaleString()}`, target: "US$ 80k", pct: Math.round((pipelineValue / 80000) * 100) },
        ].map((r) => (
          <div key={r.label} className={styles.row} style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr" }}>
            <div className={styles.num}>{r.label}</div>
            <div className={`${styles.num} ${styles.pos}`}>{r.actual}</div>
            <div style={{ color: "rgba(232,228,220,0.6)", fontSize: 12 }}>{r.target}</div>
            <div>
              <div style={{ color: r.pct >= 85 ? "var(--green-ok)" : r.pct >= 50 ? "var(--sand)" : "var(--yellow-warn)", fontWeight: 600 }}>
                {Math.max(0, Math.min(r.pct, 100))}%
              </div>
              <div className={styles.marginBar}>
                <div className={styles.marginFill} style={{ width: `${Math.max(0, Math.min(r.pct, 100))}%`, background: r.pct >= 85 ? "var(--green-ok)" : "var(--sand)" }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
