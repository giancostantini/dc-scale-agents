"use client";

/**
 * Sección de "Trayectoria" en el perfil de un miembro del equipo.
 *
 * Cuatro tabs:
 *   - Posiciones      (cambios de cargo)
 *   - Sueldos         (cambios de pago)
 *   - Clientes        (asignaciones actuales — readonly desde acá)
 *   - Hitos           (formación / viaje / premio / promoción / otro)
 *
 * El director puede agregar/borrar entradas. Los demás solo leen
 * lo propio (RLS lo enforce).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  addMilestone,
  addPositionHistory,
  addSalaryHistory,
  deleteMilestone,
  deletePositionHistory,
  deleteSalaryHistory,
  listMilestones,
  listPositionHistory,
  listSalaryHistory,
  MILESTONE_LABELS,
  type MilestoneKind,
  type MilestoneRow,
  type PositionHistoryRow,
  type SalaryHistoryRow,
} from "@/lib/team-trayectoria";
import type { ClientAssignment } from "@/lib/supabase/auth";
import type { Client } from "@/lib/types";

type Tab = "posiciones" | "sueldos" | "clientes" | "hitos";

interface Props {
  userId: string;
  canEdit: boolean;
  assignments: ClientAssignment[];
  clients: Client[];
}

export default function TrayectoriaSection({
  userId,
  canEdit,
  assignments,
  clients,
}: Props) {
  const [tab, setTab] = useState<Tab>("posiciones");
  const [positions, setPositions] = useState<PositionHistoryRow[]>([]);
  const [salaries, setSalaries] = useState<SalaryHistoryRow[]>([]);
  const [milestones, setMilestones] = useState<MilestoneRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const [p, s, m] = await Promise.all([
        listPositionHistory(userId),
        listSalaryHistory(userId),
        listMilestones(userId),
      ]);
      setPositions(p);
      setSalaries(s);
      setMilestones(m);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "posiciones", label: "Posiciones", count: positions.length },
    { key: "sueldos", label: "Sueldos", count: salaries.length },
    { key: "clientes", label: "Clientes", count: assignments.length },
    { key: "hitos", label: "Hitos", count: milestones.length },
  ];

  return (
    <div
      style={{
        marginTop: 24,
        background: "var(--white)",
        border: "1px solid rgba(10,26,12,0.08)",
      }}
    >
      {/* Header con tabs */}
      <div
        style={{
          padding: "16px 20px 0",
          borderBottom: "1px solid rgba(10,26,12,0.06)",
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
          Trayectoria
        </div>
        <div style={{ display: "flex", gap: 0 }}>
          {tabs.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                style={{
                  background: "transparent",
                  border: "none",
                  borderBottom: active
                    ? "2px solid var(--deep-green)"
                    : "2px solid transparent",
                  padding: "10px 16px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  color: active ? "var(--deep-green)" : "var(--text-muted)",
                  fontFamily: "inherit",
                }}
              >
                {t.label}
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 10,
                    color: active ? "var(--sand-dark)" : "var(--text-muted)",
                  }}
                >
                  ({t.count})
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: 20 }}>
        {loading && (
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Cargando…
          </div>
        )}

        {!loading && tab === "posiciones" && (
          <PositionsTab
            rows={positions}
            userId={userId}
            canEdit={canEdit}
            onChange={refresh}
          />
        )}
        {!loading && tab === "sueldos" && (
          <SalariesTab
            rows={salaries}
            userId={userId}
            canEdit={canEdit}
            onChange={refresh}
          />
        )}
        {!loading && tab === "clientes" && (
          <ClientesTab assignments={assignments} clients={clients} />
        )}
        {!loading && tab === "hitos" && (
          <MilestonesTab
            rows={milestones}
            userId={userId}
            canEdit={canEdit}
            onChange={refresh}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================
// POSICIONES
// ============================================================
function PositionsTab({
  rows,
  userId,
  canEdit,
  onChange,
}: {
  rows: PositionHistoryRow[];
  userId: string;
  canEdit: boolean;
  onChange: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [position, setPosition] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!position || !start) {
      alert("Cargo y fecha de inicio son obligatorios.");
      return;
    }
    setSaving(true);
    try {
      await addPositionHistory({
        user_id: userId,
        position,
        start_date: start,
        end_date: end || null,
        note: note || null,
      });
      setPosition("");
      setStart("");
      setEnd("");
      setNote("");
      setAdding(false);
      onChange();
    } catch (err) {
      const e = err as Error;
      alert(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {rows.length === 0 && !adding && (
        <EmptyMsg text="Sin posiciones registradas todavía." />
      )}
      {rows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((r) => (
            <Row
              key={r.id}
              kind={r.position}
              dates={`${r.start_date} → ${r.end_date ?? "actual"}`}
              note={r.note}
              onDelete={
                canEdit
                  ? async () => {
                      if (confirm(`¿Borrar registro "${r.position}"?`)) {
                        await deletePositionHistory(r.id);
                        onChange();
                      }
                    }
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {canEdit && !adding && (
        <button
          onClick={() => setAdding(true)}
          style={addBtnStyle}
        >
          + Agregar posición
        </button>
      )}

      {canEdit && adding && (
        <div style={addFormStyle}>
          <input
            type="text"
            placeholder="Cargo (ej: Paid Media Lead)"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            style={inputStyle}
          />
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
          <input
            type="text"
            placeholder="Nota (opcional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={inputStyle}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={add} disabled={saving} style={solidBtn}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setPosition("");
                setStart("");
                setEnd("");
                setNote("");
              }}
              style={ghostBtn}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================
// SUELDOS
// ============================================================
function SalariesTab({
  rows,
  userId,
  canEdit,
  onChange,
}: {
  rows: SalaryHistoryRow[];
  userId: string;
  canEdit: boolean;
  onChange: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [type, setType] = useState<SalaryHistoryRow["payment_type"]>("fijo");
  const [from, setFrom] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!amount || !from) {
      alert("Monto y fecha desde son obligatorios.");
      return;
    }
    setSaving(true);
    try {
      await addSalaryHistory({
        user_id: userId,
        amount: Number(amount),
        currency,
        payment_type: type,
        effective_from: from,
        end_date: end || null,
        note: note || null,
      });
      setAmount("");
      setFrom("");
      setEnd("");
      setNote("");
      setAdding(false);
      onChange();
    } catch (err) {
      const e = err as Error;
      alert(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {rows.length === 0 && !adding && (
        <EmptyMsg text="Sin sueldos registrados todavía." />
      )}
      {rows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((r) => (
            <Row
              key={r.id}
              kind={`${r.currency} ${Number(r.amount).toLocaleString()} (${r.payment_type})`}
              dates={`${r.effective_from} → ${r.end_date ?? "vigente"}`}
              note={r.note}
              onDelete={
                canEdit
                  ? async () => {
                      if (confirm(`¿Borrar este registro?`)) {
                        await deleteSalaryHistory(r.id);
                        onChange();
                      }
                    }
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {canEdit && !adding && (
        <button onClick={() => setAdding(true)} style={addBtnStyle}>
          + Agregar cambio de sueldo
        </button>
      )}

      {canEdit && adding && (
        <div style={addFormStyle}>
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
            <select
              value={type}
              onChange={(e) =>
                setType(e.target.value as SalaryHistoryRow["payment_type"])
              }
              style={{ ...inputStyle, flex: 1 }}
            >
              <option value="fijo">Fijo</option>
              <option value="por_proyecto">Por proyecto</option>
              <option value="por_hora">Por hora</option>
              <option value="mixto">Mixto</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
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
          <input
            type="text"
            placeholder="Nota (ej: aumento por promoción)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={inputStyle}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={add} disabled={saving} style={solidBtn}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setAmount("");
                setFrom("");
                setEnd("");
                setNote("");
              }}
              style={ghostBtn}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================
// CLIENTES (readonly desde acá — las asignaciones se manejan
// en la sección de abajo, esta tab es vista informativa)
// ============================================================
function ClientesTab({
  assignments,
  clients,
}: {
  assignments: ClientAssignment[];
  clients: Client[];
}) {
  if (assignments.length === 0) {
    return <EmptyMsg text="Sin clientes asignados todavía." />;
  }
  const sorted = [...assignments].sort((a, b) =>
    (b.since ?? "").localeCompare(a.since ?? ""),
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {sorted.map((a) => {
        const c = clients.find((c) => c.id === a.client_id);
        return (
          <Link
            key={`${a.client_id}-${a.role_in_client}`}
            href={`/cliente/${a.client_id}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              background: "var(--off-white)",
              borderLeft: "3px solid var(--sand)",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--deep-green)",
                }}
              >
                {c?.name ?? a.client_id}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {c?.sector ?? "—"} · desde {a.since}
              </div>
            </div>
            <span
              style={{
                fontSize: 10,
                padding: "3px 8px",
                background: "var(--white)",
                color: "var(--sand-dark)",
                fontWeight: 600,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              {a.role_in_client}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

// ============================================================
// HITOS
// ============================================================
function MilestonesTab({
  rows,
  userId,
  canEdit,
  onChange,
}: {
  rows: MilestoneRow[];
  userId: string;
  canEdit: boolean;
  onChange: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<MilestoneKind>("formacion");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!title || !date) {
      alert("Título y fecha son obligatorios.");
      return;
    }
    setSaving(true);
    try {
      await addMilestone({
        user_id: userId,
        kind,
        title,
        date,
        description: description || null,
      });
      setKind("formacion");
      setTitle("");
      setDate("");
      setDescription("");
      setAdding(false);
      onChange();
    } catch (err) {
      const e = err as Error;
      alert(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {rows.length === 0 && !adding && (
        <EmptyMsg text="Sin hitos registrados todavía." />
      )}
      {rows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((r) => (
            <Row
              key={r.id}
              kind={`${MILESTONE_LABELS[r.kind]} · ${r.title}`}
              dates={r.date}
              note={r.description}
              onDelete={
                canEdit
                  ? async () => {
                      if (confirm(`¿Borrar hito "${r.title}"?`)) {
                        await deleteMilestone(r.id);
                        onChange();
                      }
                    }
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {canEdit && !adding && (
        <button onClick={() => setAdding(true)} style={addBtnStyle}>
          + Agregar hito
        </button>
      )}

      {canEdit && adding && (
        <div style={addFormStyle}>
          <div style={{ display: "flex", gap: 8 }}>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as MilestoneKind)}
              style={{ ...inputStyle, flex: 1 }}
            >
              <option value="formacion">Formación</option>
              <option value="viaje">Viaje</option>
              <option value="premio">Premio</option>
              <option value="promocion">Promoción</option>
              <option value="otro">Otro</option>
            </select>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
            />
          </div>
          <input
            type="text"
            placeholder="Título"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={inputStyle}
          />
          <textarea
            placeholder="Descripción (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={add} disabled={saving} style={solidBtn}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setKind("formacion");
                setTitle("");
                setDate("");
                setDescription("");
              }}
              style={ghostBtn}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================
// SHARED MICRO-COMPONENTS
// ============================================================
function Row({
  kind,
  dates,
  note,
  onDelete,
}: {
  kind: string;
  dates: string;
  note: string | null;
  onDelete?: () => void | Promise<void>;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 14px",
        background: "var(--off-white)",
        borderLeft: "3px solid var(--sand)",
      }}
    >
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--deep-green)",
          }}
        >
          {kind}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            marginTop: 2,
          }}
        >
          {dates}
        </div>
        {note && (
          <div
            style={{
              fontSize: 12,
              color: "var(--text-soft, #5a6a5e)",
              marginTop: 4,
              lineHeight: 1.4,
            }}
          >
            {note}
          </div>
        )}
      </div>
      {onDelete && (
        <button
          onClick={onDelete}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--red-warn)",
            fontSize: 18,
            cursor: "pointer",
            padding: "0 6px",
            fontFamily: "inherit",
          }}
          title="Borrar"
        >
          ×
        </button>
      )}
    </div>
  );
}

function EmptyMsg({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: 20,
        textAlign: "center",
        color: "var(--text-muted)",
        fontSize: 13,
        fontStyle: "italic",
      }}
    >
      {text}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
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
  padding: "8px 14px",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
  letterSpacing: "0.05em",
};

const ghostBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid rgba(10,26,12,0.15)",
  color: "var(--deep-green)",
  padding: "8px 14px",
  fontSize: 11,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "inherit",
};

const addBtnStyle: React.CSSProperties = {
  marginTop: 14,
  background: "transparent",
  border: "1px dashed rgba(10,26,12,0.25)",
  color: "var(--deep-green)",
  padding: "8px 14px",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "inherit",
  width: "100%",
};

const addFormStyle: React.CSSProperties = {
  marginTop: 14,
  padding: 14,
  background: "var(--ivory)",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};
