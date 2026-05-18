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

import { useEffect, useState } from "react";
import Link from "next/link";
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
  type CreateManualRevenueInput,
  type DividendConfig,
  type ManualRevenue,
  type ManualRevenueKind,
} from "@/lib/finanzas";
import type { Client, Expense } from "@/lib/types";
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
        Finanzas · Equipo
      </div>
      <h1 style={h1Style}>Costo del equipo</h1>
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

  if (loading || !config) {
    return <div>Cargando configuración…</div>;
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

  async function refresh() {
    setLoading(true);
    setRevenues(await listManualRevenues());
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function add() {
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
      await createManualRevenue(input);
      // Reset form
      setDescription("");
      setAmount("");
      setStart("");
      setEnd("");
      setDate("");
      setCategory("");
      setAdding(false);
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
      refresh();
    } catch (err) {
      const e = err as Error;
      alert(`Error: ${e.message}`);
    }
  }

  return (
    <div className={styles.table} style={{ marginTop: 24 }}>
      <h3>Ingresos manuales (fijos + one-time)</h3>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
        Adicional a los fees mensuales de clientes. Ej: alquiler de cowork
        sub-arrendado, venta puntual de un servicio, premio.
      </p>

      {loading && <div>Cargando…</div>}

      {!loading && revenues.length > 0 && (
        <div
          className={`${styles.row} ${styles.rowHead}`}
          style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 50px" }}
        >
          <div>Descripción</div>
          <div>Tipo</div>
          <div>Período</div>
          <div>Monto</div>
          <div></div>
        </div>
      )}
      {!loading &&
        revenues.map((r) => (
          <div
            key={r.id}
            className={styles.row}
            style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 50px" }}
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
            <button
              onClick={() => remove(r.id)}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--red-warn)",
                fontSize: 18,
                cursor: "pointer",
              }}
            >
              ×
            </button>
          </div>
        ))}

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
          Sin ingresos manuales cargados.
        </div>
      )}

      {!adding && (
        <button
          onClick={() => setAdding(true)}
          style={{ ...solidBtn, marginTop: 14 }}
        >
          + Cargar ingreso manual
        </button>
      )}

      {adding && (
        <div
          style={{
            marginTop: 14,
            padding: 16,
            background: "var(--ivory)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
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
            <button onClick={add} disabled={saving} style={solidBtn}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
            <button onClick={() => setAdding(false)} style={ghostBtn}>
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
