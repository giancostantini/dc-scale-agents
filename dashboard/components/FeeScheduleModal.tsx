"use client";

/**
 * FeeScheduleModal — editor del calendario de pago variable de un
 * cliente.
 *
 * Caso de uso: el cliente arrancó con un fee promocional y a partir
 * del mes N pasa al fee de contrato (ej: 2 meses USD 250 → resto
 * USD 960). O el contrato cambió a mitad de período.
 *
 * Cada "entry" del calendario define el fee VIGENTE desde un
 * start_month (YYYY-MM). El fee efectivo de un mes M es la entry
 * con start_month <= M más reciente. Si no hay entries, fallback
 * a client.fee.
 */

import { useEffect, useState } from "react";
import {
  deleteFeeSchedule,
  listFeeSchedulesForClient,
  upsertFeeSchedule,
} from "@/lib/storage";
import type { Client, ClientFeeSchedule } from "@/lib/types";

interface Props {
  open: boolean;
  client: Client | null;
  onClose: () => void;
  onSaved?: () => void;
}

export default function FeeScheduleModal({
  open,
  client,
  onClose,
  onSaved,
}: Props) {
  const [schedules, setSchedules] = useState<ClientFeeSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // Form
  const [newMonth, setNewMonth] = useState("");
  /** Mes de fin del tramo. Vacío = sin cierre (vigente). */
  const [newEndMonth, setNewEndMonth] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newCurrency, setNewCurrency] = useState("USD");
  const [newNotes, setNewNotes] = useState("");

  useEffect(() => {
    if (!open || !client) return;
    setLoading(true);
    listFeeSchedulesForClient(client.id).then((data) => {
      setSchedules(data);
      setLoading(false);
      // Default: si no hay entries, sugerimos el mes actual
      if (data.length === 0) {
        setNewMonth(new Date().toISOString().slice(0, 7));
        setNewAmount(String(client.fee));
      }
    });
  }, [open, client]);

  if (!open || !client) return null;

  async function addEntry() {
    if (!client) return;
    if (!newMonth || !newAmount) {
      alert("Mes desde y monto son obligatorios.");
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(newMonth)) {
      alert("Mes desde inválido. Formato YYYY-MM (ej: 2026-05).");
      return;
    }
    if (newEndMonth) {
      if (!/^\d{4}-\d{2}$/.test(newEndMonth)) {
        alert("Mes hasta inválido. Formato YYYY-MM (ej: 2026-12).");
        return;
      }
      if (newEndMonth < newMonth) {
        alert("El mes 'hasta' debe ser igual o posterior al 'desde'.");
        return;
      }
    }
    const amt = Number(newAmount);
    if (Number.isNaN(amt) || amt < 0) {
      alert("Monto inválido.");
      return;
    }
    setSaving(true);
    try {
      await upsertFeeSchedule(
        client.id,
        newMonth,
        amt,
        newCurrency,
        newNotes.trim() || null,
        newEndMonth || null,
      );
      const fresh = await listFeeSchedulesForClient(client.id);
      setSchedules(fresh);
      setNewMonth("");
      setNewEndMonth("");
      setNewAmount("");
      setNewNotes("");
      onSaved?.();
    } catch (err) {
      const e = err as Error;
      alert(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function removeEntry(id: string) {
    if (!confirm("¿Eliminar esta entrada del calendario?")) return;
    await deleteFeeSchedule(id);
    if (client) {
      setSchedules(await listFeeSchedulesForClient(client.id));
    }
    onSaved?.();
  }

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,26,12,0.6)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 40,
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        style={{
          background: "var(--white)",
          maxWidth: 640,
          width: "100%",
          maxHeight: "92vh",
          overflowY: "auto",
          padding: 36,
          borderRadius: "var(--r-lg)",
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.25em",
            textTransform: "uppercase",
            color: "var(--sand-dark)",
            fontWeight: 600,
            marginBottom: 12,
          }}
        >
          Calendario de pago · {client.name}
        </div>
        <h2
          style={{
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            marginBottom: 8,
          }}
        >
          Calendario de pago variable
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "var(--text-muted)",
            marginBottom: 20,
            lineHeight: 1.5,
          }}
        >
          Definí los tramos de fee del cliente. Ej:{" "}
          <strong>2026-04 US$ 250</strong> (promo arranque) y luego{" "}
          <strong>2026-06 US$ 960</strong>. El fee del mes vigente es
          el tramo con fecha de inicio más reciente que aplique.
          <br />
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Si no cargás ningún tramo, se usa el fee del contrato (US${" "}
            {client.fee.toLocaleString()}).
          </span>
        </p>

        {/* Lista de tramos */}
        {loading ? (
          <div>Cargando…</div>
        ) : (
          <div style={{ marginBottom: 20 }}>
            {schedules.length === 0 ? (
              <div
                style={{
                  padding: 16,
                  background: "var(--off-white)",
                  fontSize: 13,
                  color: "var(--text-muted)",
                  fontStyle: "italic",
                  textAlign: "center",
                  borderRadius: "var(--r-sm)",
                  marginBottom: 16,
                }}
              >
                Sin tramos definidos. Usá el form de abajo para crear el
                primero.
              </div>
            ) : (
              <div
                style={{
                  border: "1px solid rgba(10,26,12,0.08)",
                  borderRadius: "var(--r-sm)",
                  overflow: "hidden",
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1.5fr 2fr 40px",
                    background: "var(--off-white)",
                    padding: "8px 12px",
                    fontSize: 10,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "var(--sand-dark)",
                    fontWeight: 700,
                    gap: 8,
                  }}
                >
                  <div>Período</div>
                  <div>Monto</div>
                  <div>Notas</div>
                  <div></div>
                </div>
                {schedules.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.4fr 1.2fr 1.8fr 40px",
                      padding: "10px 12px",
                      borderTop: "1px solid rgba(10,26,12,0.05)",
                      fontSize: 13,
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <strong>{s.startMonth}</strong>
                      <span
                        style={{
                          color: "var(--text-muted)",
                          fontWeight: 400,
                          margin: "0 4px",
                        }}
                      >
                        →
                      </span>
                      <strong style={{ color: s.endMonth ? "var(--deep-green)" : "var(--sand-dark)" }}>
                        {s.endMonth ?? "vigente"}
                      </strong>
                    </div>
                    <div style={{ color: "var(--deep-green)", fontWeight: 600 }}>
                      {s.currency} {s.amount.toLocaleString()}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {s.notes ?? "—"}
                    </div>
                    <button
                      onClick={() => removeEntry(s.id)}
                      style={{
                        color: "var(--red-warn)",
                        fontSize: 16,
                        cursor: "pointer",
                        background: "transparent",
                        border: "none",
                      }}
                      title="Eliminar tramo"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Form: agregar nuevo tramo */}
        <div
          style={{
            padding: 16,
            background: "var(--ivory)",
            borderRadius: "var(--r-sm)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--sand-dark)",
              fontWeight: 700,
            }}
          >
            Agregar tramo
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.5fr 1fr", gap: 8 }}>
            <div>
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
                Desde
              </div>
              <input
                type="month"
                value={newMonth}
                onChange={(e) => setNewMonth(e.target.value)}
                placeholder="2026-05"
                style={inputSm}
              />
            </div>
            <div>
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
                Hasta (opcional)
              </div>
              <input
                type="month"
                value={newEndMonth}
                min={newMonth}
                onChange={(e) => setNewEndMonth(e.target.value)}
                placeholder="vigente"
                style={inputSm}
              />
            </div>
            <input
              type="number"
              min={0}
              step="0.01"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              placeholder="Monto"
              style={inputSm}
            />
            <select
              value={newCurrency}
              onChange={(e) => setNewCurrency(e.target.value)}
              style={inputSm}
            >
              <option value="USD">USD</option>
              <option value="UYU">UYU</option>
              <option value="ARS">ARS</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
          <input
            type="text"
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            placeholder="Nota / motivo del cambio (opcional)"
            style={inputSm}
          />
          <button
            onClick={addEntry}
            disabled={saving}
            style={{
              padding: "10px 18px",
              fontSize: 12,
              fontWeight: 600,
              background: "var(--deep-green)",
              color: "var(--off-white)",
              border: "none",
              cursor: saving ? "default" : "pointer",
              fontFamily: "inherit",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              borderRadius: "var(--r-sm)",
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? "Guardando…" : "+ Agregar tramo"}
          </button>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: 20,
          }}
        >
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              padding: "10px 18px",
              fontSize: 12,
              background: "transparent",
              border: "1px solid rgba(10,26,12,0.15)",
              color: "var(--deep-green)",
              cursor: saving ? "default" : "pointer",
              fontFamily: "inherit",
              fontWeight: 500,
              borderRadius: "var(--r-sm)",
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

const inputSm: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid rgba(10,26,12,0.15)",
  background: "var(--white)",
  color: "var(--deep-green)",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
};
