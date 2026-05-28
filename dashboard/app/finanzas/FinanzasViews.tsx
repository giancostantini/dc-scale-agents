"use client";

/**
 * Views nuevas de /finanzas:
 *   - TeamCostView: costo del equipo agregado por puesto.
 *   - DividendosView: config + cálculo de distribución del net profit.
 *   - EstadosView: estado de resultados + estado de situación.
 *   - ManualRevenuesPanel: gestión de ingresos manuales (fijos +
 *     one-time). Se inserta dentro de IngresosView en page.tsx.
 *
 * Todas requieren rol director (RLS lo enforce server-side, pero
 * acá también filtramos por isDirector cuando aplica).
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { listProfiles } from "@/lib/team";
import type { Profile } from "@/lib/supabase/auth";
import {
  createManualRevenue,
  deleteManualRevenue,
  distributeDividends,
  getDividendConfig,
  listManualRevenues,
  revenueMonthlyImpact,
  updateDividendConfig,
  updateManualRevenue,
  type CreateManualRevenueInput,
  type DividendConfig,
  type ManualRevenue,
  type ManualRevenueKind,
} from "@/lib/finanzas";
import type {
  Client,
  Expense,
  InvoicePayment,
  Lead,
} from "@/lib/types";
import styles from "./finanzas.module.css";

// ============================================================
// TeamCostView — costo del equipo
// ============================================================
export function TeamCostView() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listProfiles().then((list) => {
      // Solo team (excluye clients y los que no tengan pago seteado).
      setProfiles(
        list.filter(
          (p) =>
            p.role !== "client" &&
            p.payment_amount != null &&
            Number(p.payment_amount) > 0,
        ),
      );
      setLoading(false);
    });
  }, []);

  // Agrupar por posición
  const byPosition = new Map<string, { profiles: Profile[]; total: number }>();
  for (const p of profiles) {
    const pos = p.position ?? "Sin posición";
    const cur = byPosition.get(pos) ?? { profiles: [], total: 0 };
    cur.profiles.push(p);
    cur.total += Number(p.payment_amount ?? 0);
    byPosition.set(pos, cur);
  }
  const grouped = Array.from(byPosition.entries()).sort(
    (a, b) => b[1].total - a[1].total,
  );
  const grandTotal = profiles.reduce(
    (s, p) => s + Number(p.payment_amount ?? 0),
    0,
  );

  return (
    <>
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--sand-dark)",
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        Finanzas · Funcionales
      </div>
      <h1 style={h1Style}>Funcionales</h1>
      <p
        style={{
          maxWidth: 700,
          color: "var(--text-muted)",
          fontSize: 14,
          lineHeight: 1.6,
          marginBottom: 28,
        }}
      >
        Suma de los pagos definidos en /equipo, agrupada por posición.
        Para cambiar montos, andá al detail de cada persona desde{" "}
        <Link href="/equipo" style={{ color: "var(--sand-dark)" }}>
          /equipo
        </Link>
        .
      </p>

      {loading && <div>Cargando…</div>}

      {!loading && profiles.length === 0 && (
        <div
          style={{
            padding: 32,
            background: "var(--off-white)",
            border: "1px dashed rgba(10,26,12,0.15)",
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: 13,
          }}
        >
          Ningún miembro tiene pago definido todavía. Cargá los montos
          desde el detail de cada persona en /equipo.
        </div>
      )}

      {!loading && profiles.length > 0 && (
        <>
          <div className={styles.kpis}>
            <div className={styles.kpi}>
              <div className={styles.kLabel}>Total mensual</div>
              <div className={styles.kValue}>
                US$ {grandTotal.toLocaleString()}
              </div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kLabel}>Personas con pago</div>
              <div className={styles.kValue}>{profiles.length}</div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kLabel}>Posiciones</div>
              <div className={styles.kValue}>{grouped.length}</div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kLabel}>Promedio/persona</div>
              <div className={styles.kValue}>
                US${" "}
                {profiles.length > 0
                  ? Math.round(grandTotal / profiles.length).toLocaleString()
                  : 0}
              </div>
            </div>
          </div>

          <div className={styles.table}>
            <h3>Desglose por posición</h3>
            <div
              className={`${styles.row} ${styles.rowHead}`}
              style={{ gridTemplateColumns: "2fr 1fr 1fr" }}
            >
              <div>Posición</div>
              <div>Personas</div>
              <div>Costo mensual</div>
            </div>
            {grouped.map(([pos, info]) => (
              <details key={pos}>
                <summary
                  className={styles.row}
                  style={{
                    gridTemplateColumns: "2fr 1fr 1fr",
                    cursor: "pointer",
                    listStyle: "none",
                  }}
                >
                  <div>
                    <strong>{pos}</strong>
                  </div>
                  <div className={styles.num}>{info.profiles.length}</div>
                  <div className={`${styles.num} ${styles.pos}`}>
                    US$ {info.total.toLocaleString()}
                  </div>
                </summary>
                <div
                  style={{
                    padding: "8px 16px",
                    background: "var(--off-white)",
                  }}
                >
                  {info.profiles.map((p) => (
                    <Link
                      key={p.id}
                      href={`/equipo/${p.id}`}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "6px 0",
                        fontSize: 12,
                        textDecoration: "none",
                        color: "inherit",
                        borderBottom: "1px solid rgba(10,26,12,0.05)",
                      }}
                    >
                      <span>{p.name}</span>
                      <span style={{ color: "var(--text-muted)" }}>
                        {p.payment_currency ?? "USD"}{" "}
                        {Number(p.payment_amount).toLocaleString()} (
                        {p.payment_type ?? "fijo"})
                      </span>
                    </Link>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </>
      )}
    </>
  );
}

// ============================================================
// DividendosView — distribución del net profit
// ============================================================
export function DividendosView({
  monthlyNet,
}: {
  /** Net profit calculado del mes actual: ingresos − egresos. */
  monthlyNet: number;
}) {
  const [config, setConfig] = useState<DividendConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    partner_a_pct: 30,
    partner_b_pct: 30,
    inversiones_pct: 15,
    back_pct: 25,
    partner_a_name: "Federico Dearmas",
    partner_b_name: "Gianluca Costantini",
  });
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setLoading(true);
    const c = await getDividendConfig();
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
  }

  useEffect(() => {
    refresh();
  }, []);

  async function save() {
    const total =
      editForm.partner_a_pct +
      editForm.partner_b_pct +
      editForm.inversiones_pct +
      editForm.back_pct;
    if (total > 100) {
      alert(`Los porcentajes suman ${total}%. No pueden superar 100%.`);
      return;
    }
    setSaving(true);
    try {
      await updateDividendConfig(editForm);
      setEditing(false);
      refresh();
    } catch (err) {
      const e = err as Error;
      alert(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div>Cargando configuración…</div>;
  }

  // Si no hay config en DB, mostramos defaults + aviso de que falta
  // correr la migración 025.
  if (!config) {
    return (
      <>
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--sand-dark)",
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          Finanzas · Distribución
        </div>
        <h1 style={h1Style}>Distribución de dividendos</h1>
        <div
          style={{
            padding: 24,
            background: "rgba(196,168,130,0.1)",
            borderLeft: "3px solid var(--sand)",
            marginTop: 24,
            fontSize: 13,
            color: "var(--text-soft, #5a6a5e)",
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: "var(--deep-green)" }}>
            Configuración no disponible
          </strong>
          <br />
          La tabla <code>dividend_config</code> todavía no existe en la
          base de datos. Pegá la migración 025 en el SQL Editor de
          Supabase y dale Run. Después refrescá esta página.
        </div>
      </>
    );
  }

  const dist = distributeDividends(monthlyNet, config);
  const totalPct =
    Number(config.partner_a_pct) +
    Number(config.partner_b_pct) +
    Number(config.inversiones_pct) +
    Number(config.back_pct);

  return (
    <>
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--sand-dark)",
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        Finanzas · Distribución
      </div>
      <h1 style={h1Style}>Distribución de dividendos</h1>
      <p
        style={{
          maxWidth: 700,
          color: "var(--text-muted)",
          fontSize: 14,
          lineHeight: 1.6,
          marginBottom: 28,
        }}
      >
        Cómo se divide el resultado neto del mes entre socios,
        reinversiones y back de la empresa.
      </p>

      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <div className={styles.kLabel}>Net profit del mes</div>
          <div
            className={styles.kValue}
            style={{
              color: monthlyNet < 0 ? "var(--red-warn)" : "var(--deep-green)",
            }}
          >
            US$ {monthlyNet.toLocaleString()}
          </div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kLabel}>{config.partner_a_name}</div>
          <div className={styles.kValue}>
            US$ {dist.partnerA.toLocaleString()}
          </div>
          <div className={styles.kLabel}>{config.partner_a_pct}%</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kLabel}>{config.partner_b_name}</div>
          <div className={styles.kValue}>
            US$ {dist.partnerB.toLocaleString()}
          </div>
          <div className={styles.kLabel}>{config.partner_b_pct}%</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kLabel}>Inversiones</div>
          <div className={styles.kValue}>
            US$ {dist.inversiones.toLocaleString()}
          </div>
          <div className={styles.kLabel}>{config.inversiones_pct}%</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kLabel}>Back de empresa</div>
          <div className={styles.kValue}>
            US$ {dist.back.toLocaleString()}
          </div>
          <div className={styles.kLabel}>{config.back_pct}%</div>
        </div>
      </div>

      {dist.remainder !== 0 && (
        <div
          style={{
            padding: "10px 14px",
            background:
              totalPct < 100
                ? "rgba(196,168,130,0.1)"
                : "rgba(176,75,58,0.08)",
            borderLeft: `3px solid ${
              totalPct < 100 ? "var(--sand)" : "var(--red-warn)"
            }`,
            fontSize: 12,
            color: "var(--text-soft, #5a6a5e)",
            marginBottom: 16,
          }}
        >
          <strong style={{ color: "var(--deep-green)" }}>
            Distribuido: {totalPct}%
          </strong>{" "}
          {totalPct < 100 && (
            <>
              · Queda sin asignar:{" "}
              <strong>US$ {dist.remainder.toLocaleString()}</strong> (
              {(100 - totalPct).toFixed(2)}%). Reservá o re-asigná desde
              la config.
            </>
          )}
        </div>
      )}

      {/* Edit form */}
      <div className={styles.table}>
        <h3>Configuración actual</h3>
        {!editing && (
          <>
            <div style={{ padding: "12px 0", display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8, fontSize: 13 }}>
              <div>{config.partner_a_name}</div>
              <div style={{ textAlign: "right" }}>{config.partner_a_pct}%</div>
              <div>{config.partner_b_name}</div>
              <div style={{ textAlign: "right" }}>{config.partner_b_pct}%</div>
              <div>Inversiones</div>
              <div style={{ textAlign: "right" }}>{config.inversiones_pct}%</div>
              <div>Back de empresa</div>
              <div style={{ textAlign: "right" }}>{config.back_pct}%</div>
            </div>
            <button
              onClick={() => setEditing(true)}
              style={solidBtn}
            >
              ✎ Editar config
            </button>
          </>
        )}

        {editing && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              padding: "8px 0",
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, alignItems: "center" }}>
              <input
                type="text"
                value={editForm.partner_a_name}
                onChange={(e) =>
                  setEditForm({ ...editForm, partner_a_name: e.target.value })
                }
                style={inputStyle}
              />
              <PctInput
                value={editForm.partner_a_pct}
                onChange={(v) => setEditForm({ ...editForm, partner_a_pct: v })}
              />

              <input
                type="text"
                value={editForm.partner_b_name}
                onChange={(e) =>
                  setEditForm({ ...editForm, partner_b_name: e.target.value })
                }
                style={inputStyle}
              />
              <PctInput
                value={editForm.partner_b_pct}
                onChange={(v) => setEditForm({ ...editForm, partner_b_pct: v })}
              />

              <div style={{ paddingLeft: 10, fontSize: 13 }}>Inversiones</div>
              <PctInput
                value={editForm.inversiones_pct}
                onChange={(v) =>
                  setEditForm({ ...editForm, inversiones_pct: v })
                }
              />

              <div style={{ paddingLeft: 10, fontSize: 13 }}>Back de empresa</div>
              <PctInput
                value={editForm.back_pct}
                onChange={(v) => setEditForm({ ...editForm, back_pct: v })}
              />
            </div>
            <div
              style={{
                padding: "8px 12px",
                background: "var(--off-white)",
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              Suma total:{" "}
              <strong
                style={{
                  color:
                    editForm.partner_a_pct +
                      editForm.partner_b_pct +
                      editForm.inversiones_pct +
                      editForm.back_pct >
                    100
                      ? "var(--red-warn)"
                      : "var(--deep-green)",
                }}
              >
                {editForm.partner_a_pct +
                  editForm.partner_b_pct +
                  editForm.inversiones_pct +
                  editForm.back_pct}
                %
              </strong>{" "}
              (debe ser ≤ 100%)
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={save} disabled={saving} style={solidBtn}>
                {saving ? "Guardando…" : "Guardar"}
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  refresh();
                }}
                style={ghostBtn}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function PctInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input
        type="number"
        min={0}
        max={100}
        step={0.5}
        value={value}
        onChange={(e) =>
          onChange(Math.max(0, Math.min(100, Number(e.target.value) || 0)))
        }
        style={{ ...inputStyle, textAlign: "right" }}
      />
      <span style={{ fontSize: 13, color: "var(--text-muted)" }}>%</span>
    </div>
  );
}

// ============================================================
// EstadosView — estado de resultados + estado de situación
// ============================================================
export function EstadosView({
  clients,
  expenses,
  payments,
  monthYYYYMM,
}: {
  clients: Client[];
  expenses: Expense[];
  payments: { clientId: string; month: string; status: string }[];
  monthYYYYMM: string;
}) {
  const [revenues, setRevenues] = useState<ManualRevenue[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listManualRevenues().then((r) => {
      setRevenues(r);
      setLoading(false);
    });
  }, []);

  // Estado de Resultados (Income Statement) — del mes seleccionado.
  const feesBilled = clients.reduce((s, c) => s + c.fee, 0);
  const feesPaid = clients.reduce((s, c) => {
    const p = payments.find(
      (p) => p.clientId === c.id && p.month === monthYYYYMM,
    );
    return s + (p?.status === "paid" ? c.fee : 0);
  }, 0);
  const manualRevImpact = revenues.reduce(
    (s, r) => s + revenueMonthlyImpact(r, monthYYYYMM),
    0,
  );
  const totalIngresos = feesBilled + manualRevImpact; // base devengado
  const monthExpenses = expenses
    .filter((e) => (e.date ?? "").startsWith(monthYYYYMM))
    .reduce((s, e) => s + e.amount, 0);
  const netResult = totalIngresos - monthExpenses;

  // Estado de Situación Financiera — simplificado.
  // Activos = cobrado del mes + facturado pendiente (cuentas por cobrar)
  // Sin pasivos modelados aún (próxima iteración).
  const cuentasPorCobrar = feesBilled - feesPaid;

  return (
    <>
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--sand-dark)",
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        Finanzas · Estados
      </div>
      <h1 style={h1Style}>Estados financieros</h1>
      <p
        style={{
          maxWidth: 700,
          color: "var(--text-muted)",
          fontSize: 14,
          lineHeight: 1.6,
          marginBottom: 28,
        }}
      >
        Mes corriente · {monthYYYYMM}
      </p>

      {loading && <div>Cargando…</div>}

      {!loading && (
        <>
          {/* ESTADO DE RESULTADOS */}
          <div className={styles.table}>
            <h3>Estado de resultados</h3>
            <div
              className={`${styles.row} ${styles.rowHead}`}
              style={{ gridTemplateColumns: "2fr 1fr" }}
            >
              <div>Concepto</div>
              <div>Monto</div>
            </div>

            <RowLine label="Fees de clientes facturados" value={feesBilled} kind="ingreso" />
            <RowLine
              label="Ingresos manuales (fijos + one-time)"
              value={manualRevImpact}
              kind="ingreso"
            />
            <RowLine
              label="TOTAL INGRESOS"
              value={totalIngresos}
              kind="ingreso"
              bold
            />
            <RowLine
              label="Egresos del mes"
              value={-monthExpenses}
              kind="egreso"
            />
            <RowLine
              label="RESULTADO NETO"
              value={netResult}
              kind={netResult >= 0 ? "ingreso" : "egreso"}
              bold
            />
          </div>

          {/* ESTADO DE SITUACIÓN FINANCIERA (simplificado) */}
          <div className={styles.table} style={{ marginTop: 24 }}>
            <h3>Estado de situación financiera</h3>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
              Vista simplificada. Pasivos y patrimonio requieren modelar
              deudas y capital social — viene en próxima iteración.
            </p>

            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  color: "var(--sand-dark)",
                  fontWeight: 700,
                  marginBottom: 8,
                }}
              >
                Activos corrientes
              </div>
              <RowLine
                label="Caja (cobrado del mes)"
                value={feesPaid}
                kind="ingreso"
              />
              <RowLine
                label="Cuentas por cobrar (fees pendientes)"
                value={cuentasPorCobrar}
                kind="ingreso"
              />
              <RowLine
                label="TOTAL ACTIVOS"
                value={feesPaid + cuentasPorCobrar}
                kind="ingreso"
                bold
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}

function RowLine({
  label,
  value,
  kind,
  bold = false,
}: {
  label: string;
  value: number;
  kind: "ingreso" | "egreso";
  bold?: boolean;
}) {
  return (
    <div
      className={styles.row}
      style={{
        gridTemplateColumns: "2fr 1fr",
        fontWeight: bold ? 700 : 400,
      }}
    >
      <div>{label}</div>
      <div
        className={`${styles.num} ${
          kind === "ingreso" ? styles.pos : styles.neg
        }`}
        style={bold ? { fontSize: 15 } : undefined}
      >
        {value < 0 ? "−" : ""}US$ {Math.abs(value).toLocaleString()}
      </div>
    </div>
  );
}

// ============================================================
// ManualRevenuesPanel — se inserta dentro de IngresosView
// ============================================================
export function ManualRevenuesPanel() {
  const [revenues, setRevenues] = useState<ManualRevenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  /** ID del ingreso que se está editando. Si != null, el form se
   *  muestra pre-cargado y "Guardar" hace UPDATE en vez de INSERT. */
  const [editingId, setEditingId] = useState<string | null>(null);

  // form
  const [kind, setKind] = useState<ManualRevenueKind>("fijo");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [date, setDate] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);

  const isEditing = editingId !== null;

  async function refresh() {
    setLoading(true);
    setRevenues(await listManualRevenues());
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  /** Resetea el form a estado vacío y cierra el panel. */
  function resetAndClose() {
    setDescription("");
    setAmount("");
    setStart("");
    setEnd("");
    setDate("");
    setCategory("");
    setKind("fijo");
    setCurrency("USD");
    setAdding(false);
    setEditingId(null);
  }

  /** Abre el form en modo edición pre-cargando los valores del
   *  ingreso seleccionado. */
  function startEdit(r: ManualRevenue) {
    setEditingId(r.id);
    setKind(r.kind);
    setDescription(r.description);
    setAmount(String(r.amount));
    setCurrency(r.currency ?? "USD");
    setStart(r.start_date ?? "");
    setEnd(r.end_date ?? "");
    setDate(r.date ?? "");
    setCategory(r.category ?? "");
    setAdding(true);
  }

  async function save() {
    if (!description.trim() || !amount) {
      alert("Descripción y monto son obligatorios.");
      return;
    }
    if (kind === "fijo" && !start) {
      alert("Para ingresos fijos hay que indicar desde cuándo.");
      return;
    }
    if (kind === "one_time" && !date) {
      alert("Para ingresos one-time hay que indicar la fecha.");
      return;
    }
    setSaving(true);
    try {
      const input: CreateManualRevenueInput = {
        kind,
        description: description.trim(),
        amount: Number(amount),
        currency,
        category: category.trim() || null,
        start_date: kind === "fijo" ? start : null,
        end_date: kind === "fijo" ? end || null : null,
        date: kind === "one_time" ? date : null,
      };
      if (editingId) {
        await updateManualRevenue(editingId, input);
      } else {
        await createManualRevenue(input);
      }
      resetAndClose();
      refresh();
    } catch (err) {
      const e = err as Error;
      alert(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar este ingreso?")) return;
    try {
      await deleteManualRevenue(id);
      // Si estaba editando ese mismo ingreso, cerramos el form.
      if (editingId === id) resetAndClose();
      refresh();
    } catch (err) {
      const e = err as Error;
      alert(`Error: ${e.message}`);
    }
  }

  return (
    <div className={styles.table} style={{ marginTop: 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
          paddingBottom: 14,
          borderBottom: "1px solid rgba(10,26,12,0.08)",
        }}
      >
        <div>
          <h3 style={{ margin: 0, border: "none", padding: 0 }}>
            Ingresos manuales (fijos + one-time)
          </h3>
          <p
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              marginTop: 6,
              marginBottom: 0,
            }}
          >
            Adicional a los fees mensuales de clientes. Ej: alquiler de
            cowork sub-arrendado, venta puntual, premio.
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            style={solidBtn}
          >
            + Agregar un ingreso
          </button>
        )}
      </div>

      {loading && <div>Cargando…</div>}

      {!loading && revenues.length > 0 && (
        <div
          className={`${styles.row} ${styles.rowHead}`}
          style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 90px" }}
        >
          <div>Descripción</div>
          <div>Tipo</div>
          <div>Período</div>
          <div>Monto</div>
          <div></div>
        </div>
      )}
      {!loading &&
        revenues.map((r) => {
          const isEditingThis = editingId === r.id;
          return (
            <div
              key={r.id}
              className={styles.row}
              style={{
                gridTemplateColumns: "2fr 1fr 1fr 1fr 90px",
                background: isEditingThis
                  ? "rgba(196, 168, 130, 0.08)"
                  : undefined,
              }}
            >
              <div>
                <strong>{r.description}</strong>
                {r.category && (
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {r.category}
                  </div>
                )}
              </div>
              <div className={styles.num}>
                {r.kind === "fijo" ? "Fijo /mes" : "One-time"}
              </div>
              <div className={styles.num} style={{ fontSize: 11 }}>
                {r.kind === "fijo"
                  ? `${r.start_date} → ${r.end_date ?? "vigente"}`
                  : r.date}
              </div>
              <div className={`${styles.num} ${styles.pos}`}>
                {r.currency} {Number(r.amount).toLocaleString()}
              </div>
              <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                <button
                  onClick={() => startEdit(r)}
                  disabled={saving}
                  title="Editar"
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(10,26,12,0.15)",
                    color: "var(--deep-green)",
                    padding: "3px 8px",
                    fontSize: 11,
                    cursor: saving ? "default" : "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Editar
                </button>
                <button
                  onClick={() => remove(r.id)}
                  title="Eliminar"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--red-warn)",
                    fontSize: 18,
                    cursor: "pointer",
                    width: 24,
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}

      {!loading && revenues.length === 0 && !adding && (
        <div
          style={{
            padding: 16,
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: 13,
            fontStyle: "italic",
          }}
        >
          Sin ingresos manuales cargados. Click en &quot;+ Agregar un
          ingreso&quot; arriba para empezar.
        </div>
      )}

      {adding && (
        <div
          style={{
            marginTop: 14,
            padding: 16,
            background: isEditing
              ? "rgba(196, 168, 130, 0.12)"
              : "var(--ivory)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            borderLeft: isEditing
              ? "3px solid var(--sand-dark)"
              : undefined,
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--sand-dark)",
              fontWeight: 700,
              marginBottom: 2,
            }}
          >
            {isEditing ? "Editar ingreso" : "Nuevo ingreso"}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as ManualRevenueKind)}
              style={{ ...inputStyle, flex: 1 }}
            >
              <option value="fijo">Fijo (se repite cada mes)</option>
              <option value="one_time">One-time (una sola vez)</option>
            </select>
            <input
              type="text"
              placeholder="Categoría (opcional)"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
            />
          </div>
          <input
            type="text"
            placeholder="Descripción"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={inputStyle}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="number"
              placeholder="Monto"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{ ...inputStyle, flex: 2 }}
            />
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
            >
              <option value="USD">USD</option>
              <option value="UYU">UYU</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
          {kind === "fijo" ? (
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
                placeholder="Desde"
              />
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
                placeholder="Hasta (opcional)"
              />
            </div>
          ) : (
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={inputStyle}
              placeholder="Fecha"
            />
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={save} disabled={saving} style={solidBtn}>
              {saving
                ? "Guardando…"
                : isEditing
                  ? "Guardar cambios"
                  : "Guardar"}
            </button>
            <button onClick={resetAndClose} disabled={saving} style={ghostBtn}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// STYLES
// ============================================================
const h1Style: React.CSSProperties = {
  fontSize: 36,
  fontWeight: 700,
  letterSpacing: "-0.025em",
  lineHeight: 1,
  marginBottom: 12,
};

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid rgba(10,26,12,0.15)",
  background: "var(--white)",
  color: "var(--deep-green)",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
};

const solidBtn: React.CSSProperties = {
  background: "var(--deep-green)",
  color: "var(--off-white)",
  border: "none",
  padding: "8px 16px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
  letterSpacing: "0.05em",
};

const ghostBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid rgba(10,26,12,0.15)",
  color: "var(--deep-green)",
  padding: "8px 16px",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "inherit",
};

// ============================================================
// KPIsViewV2 — KPIs anuales con gráficas + concentración + reportes
// ============================================================

const CHART_COLORS = [
  "#0A1A0C",
  "#9B8259",
  "#C4A882",
  "#3A8B5C",
  "#2E5D45",
  "#5A6A5E",
  "#B04B3A",
  "#1E3A28",
  "#7A8A7E",
];

export function KPIsViewV2({
  mrr,
  clients,
  expenses,
  payments,
  manualRevs,
  marginPct,
  pipelineValue,
  leads,
}: {
  mrr: number;
  clients: Client[];
  expenses: Expense[];
  payments: InvoicePayment[];
  manualRevs: ManualRevenue[];
  marginPct: number;
  pipelineValue: number;
  leads: Lead[];
}) {
  const targetARR = 300_000; // configurable a futuro
  const arr = mrr * 12;
  const arrPct = Math.round((arr / targetARR) * 100);

  // Cobranza del mes en curso
  const monthYYYYMM = new Date().toISOString().slice(0, 7);
  const collectedThisMonth = useMemo(() => {
    return clients.reduce((s, c) => {
      const p = payments.find(
        (p) => p.clientId === c.id && p.month === monthYYYYMM,
      );
      return s + (p?.status === "paid" ? c.fee : 0);
    }, 0);
  }, [clients, payments, monthYYYYMM]);

  // Pipeline conversion (proxy: cerrados / total leads)
  const leadsClosed = leads.filter((l) => l.stage === "cerrado").length;
  const conversionPct =
    leads.length > 0 ? Math.round((leadsClosed / leads.length) * 100) : 0;

  // === Composición del MRR por cliente ===
  const mrrComposition = useMemo(() => {
    return [...clients]
      .map((c) => ({
        name: c.name,
        value: c.fee,
        pct: mrr > 0 ? (c.fee / mrr) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [clients, mrr]);

  // === Concentración: % del top 1 y top 3 ===
  const topClient = mrrComposition[0];
  const top3Share = mrrComposition
    .slice(0, 3)
    .reduce((s, c) => s + c.pct, 0);

  // === Ingresos vs Egresos por mes (últimos 6 meses, basados en payments + manual revs + expenses) ===
  const monthlyData = useMemo(() => {
    const out: {
      month: string;
      label: string;
      ingresos: number;
      egresos: number;
      neto: number;
    }[] = [];
    const today = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const ym = d.toISOString().slice(0, 7);
      const label = d.toLocaleDateString("es-AR", {
        month: "short",
        year: "2-digit",
      });

      // Ingresos = fees cobrados ese mes + manual revenues que aplican
      const feesCobrados = clients.reduce((s, c) => {
        const p = payments.find((p) => p.clientId === c.id && p.month === ym);
        return s + (p?.status === "paid" ? c.fee : 0);
      }, 0);
      const manualImpact = manualRevs.reduce(
        (s, r) => s + revenueMonthlyImpact(r, ym),
        0,
      );
      const ingresos = feesCobrados + manualImpact;

      // Egresos = gastos con date YYYY-MM
      const egresos = expenses
        .filter((e) => (e.date ?? "").startsWith(ym))
        .reduce((s, e) => s + e.amount, 0);

      out.push({
        month: ym,
        label,
        ingresos,
        egresos,
        neto: ingresos - egresos,
      });
    }
    return out;
  }, [clients, payments, manualRevs, expenses]);

  // KPI cards principales
  const kpis = [
    {
      label: "MRR",
      value: `US$ ${mrr.toLocaleString()}`,
      sub: `${clients.length} clientes activos`,
    },
    {
      label: "ARR",
      value: `US$ ${arr.toLocaleString()}`,
      sub: `${arrPct}% del objetivo (US$ ${targetARR.toLocaleString()})`,
    },
    {
      label: "Cobrado este mes",
      value: `US$ ${collectedThisMonth.toLocaleString()}`,
      sub: `de US$ ${mrr.toLocaleString()} facturados`,
    },
    {
      label: "Margen neto (mes)",
      value: `${marginPct}%`,
      sub: marginPct >= 50 ? "saludable" : "atención",
    },
    {
      label: "Pipeline",
      value: `US$ ${pipelineValue.toLocaleString()}`,
      sub: `${leads.length} leads · ${conversionPct}% conv`,
    },
    {
      label: "Concentración top 1",
      value: topClient ? `${topClient.pct.toFixed(1)}%` : "—",
      sub: topClient ? topClient.name : "Sin clientes",
    },
  ];

  return (
    <>
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--sand-dark)",
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        Finanzas · KPIs anuales
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginBottom: 28,
        }}
      >
        <h1 style={h1Style}>KPIs {new Date().getFullYear()}</h1>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => window.print()}
            style={{
              ...ghostBtn,
              padding: "10px 16px",
            }}
            title="Imprimir / exportar como PDF"
          >
            ↓ Imprimir reporte
          </button>
        </div>
      </div>

      {/* ===== KPI cards (6 chiquitos) ===== */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 0,
          border: "1px solid rgba(10,26,12,0.08)",
          marginBottom: 32,
          background: "var(--white)",
        }}
      >
        {kpis.map((k, i) => (
          <div
            key={k.label}
            style={{
              padding: "22px 24px",
              borderRight:
                i < kpis.length - 1
                  ? "1px solid rgba(10,26,12,0.08)"
                  : "none",
              borderBottom: "1px solid rgba(10,26,12,0.08)",
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--sand-dark)",
                fontWeight: 700,
                marginBottom: 10,
              }}
            >
              {k.label}
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: "var(--deep-green)",
                letterSpacing: "-0.02em",
                marginBottom: 4,
              }}
            >
              {k.value}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {k.sub}
            </div>
          </div>
        ))}
      </div>

      {/* ===== Composición del MRR (pie + tabla) ===== */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
          marginBottom: 32,
        }}
      >
        <div className={styles.table} style={{ margin: 0 }}>
          <h3>Composición del MRR por cliente</h3>
          {mrrComposition.length === 0 ? (
            <div style={{ padding: 20, color: "var(--text-muted)", fontSize: 13 }}>
              Sin clientes para graficar.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={mrrComposition}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={(entry) => {
                    const p =
                      typeof (entry as { percent?: number }).percent === "number"
                        ? ((entry as { percent: number }).percent * 100).toFixed(0)
                        : "";
                    return `${p}%`;
                  }}
                  labelLine={false}
                >
                  {mrrComposition.map((_, idx) => (
                    <Cell
                      key={idx}
                      fill={CHART_COLORS[idx % CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number, _name, props) => [
                    `US$ ${v.toLocaleString()} (${(
                      props.payload as { pct: number }
                    ).pct.toFixed(1)}%)`,
                    props.payload?.name,
                  ]}
                />
                <Legend
                  layout="vertical"
                  align="right"
                  verticalAlign="middle"
                  iconType="square"
                  wrapperStyle={{ fontSize: 11 }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className={styles.table} style={{ margin: 0 }}>
          <h3>Top clientes por fee</h3>
          {mrrComposition.slice(0, 8).map((c, i) => (
            <div
              key={c.name}
              className={styles.row}
              style={{ gridTemplateColumns: "30px 2fr 1fr 60px" }}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  background: CHART_COLORS[i % CHART_COLORS.length],
                }}
              />
              <div>{c.name}</div>
              <div className={`${styles.num} ${styles.pos}`}>
                US$ {c.value.toLocaleString()}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  textAlign: "right",
                }}
              >
                {c.pct.toFixed(1)}%
              </div>
            </div>
          ))}
          {top3Share > 50 && (
            <div
              style={{
                marginTop: 14,
                padding: "10px 14px",
                background: "rgba(176,75,58,0.08)",
                borderLeft: "3px solid var(--red-warn)",
                fontSize: 12,
                color: "var(--text-soft, #5a6a5e)",
                lineHeight: 1.5,
              }}
            >
              <strong style={{ color: "var(--red-warn)" }}>
                ⚠ Alta concentración
              </strong>
              <br />
              Top 3 clientes = <strong>{top3Share.toFixed(0)}%</strong> del
              MRR. Riesgo si alguno se va.
            </div>
          )}
        </div>
      </div>

      {/* ===== Ingresos vs Egresos (bar chart 6 meses) ===== */}
      <div className={styles.table}>
        <h3>Ingresos vs Egresos · últimos 6 meses</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={monthlyData}>
            <XAxis dataKey="label" stroke="#5A6A5E" fontSize={11} />
            <YAxis
              stroke="#5A6A5E"
              fontSize={11}
              tickFormatter={(v) =>
                v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
              }
            />
            <Tooltip
              formatter={(v: number) => `US$ ${v.toLocaleString()}`}
              cursor={{ fill: "rgba(10,26,12,0.04)" }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="square" />
            <Bar dataKey="ingresos" fill="#3A8B5C" name="Ingresos" />
            <Bar dataKey="egresos" fill="#B04B3A" name="Egresos" />
            <Bar dataKey="neto" fill="#0A1A0C" name="Neto" />
          </BarChart>
        </ResponsiveContainer>
        <div
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            gap: 8,
            fontSize: 11,
            color: "var(--text-muted)",
          }}
        >
          {monthlyData.map((m) => (
            <div
              key={m.month}
              style={{
                textAlign: "center",
                padding: 8,
                background: "var(--off-white)",
              }}
            >
              <div style={{ fontWeight: 600, color: "var(--deep-green)" }}>
                {m.label}
              </div>
              <div
                style={{
                  marginTop: 4,
                  color: m.neto >= 0 ? "var(--green-ok)" : "var(--red-warn)",
                  fontWeight: 600,
                }}
              >
                {m.neto >= 0 ? "+" : ""}US$ {m.neto.toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ===== Pipeline detail ===== */}
      <div className={styles.table}>
        <h3>Pipeline comercial</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 16,
          }}
        >
          {(
            [
              ["prospecto", "Prospectos"],
              ["contacto", "En contacto"],
              ["propuesta", "Con propuesta"],
              ["negociacion", "Negociando"],
              ["cerrado", "Cerrados"],
            ] as const
          ).map(([stage, label]) => {
            const count = leads.filter((l) => l.stage === stage).length;
            const value = leads
              .filter((l) => l.stage === stage)
              .reduce((s, l) => s + l.value, 0);
            return (
              <div
                key={stage}
                style={{
                  padding: 14,
                  background: "var(--off-white)",
                  borderLeft: "3px solid var(--sand)",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    color: "var(--sand-dark)",
                    fontWeight: 700,
                    marginBottom: 4,
                  }}
                >
                  {label}
                </div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: "var(--deep-green)",
                  }}
                >
                  {count}
                </div>
                <div
                  style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}
                >
                  US$ {value.toLocaleString()}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
