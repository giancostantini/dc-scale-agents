"use client";

/**
 * EditClientDividendModal — modal compacto para editar SOLO la
 * distribución de dividendos de un cliente. Se abre desde Finanzas →
 * Clientes activos con el botón "Editar split" para acceso rápido sin
 * pasar por /cliente/[id]/configuracion.
 *
 * Comportamiento:
 *   · Radio "Default global" ↔ "Específica para este cliente".
 *   · Si default: guarda dividend_distribution=null (fallback global).
 *   · Si específica: valida que los 4 % sumen 100 y guarda el JSONB.
 *
 * Impacta el cálculo de dividendos en DividendosView: por cada peso
 * cobrado a este cliente, se aplica su split en lugar del global.
 */

import { useEffect, useState } from "react";
import { updateClientCore } from "@/lib/storage";
import { getDividendConfig, type DividendConfig } from "@/lib/finanzas";
import type { Client } from "@/lib/types";

export default function EditClientDividendModal({
  client,
  onClose,
  onSaved,
}: {
  client: Client;
  onClose: () => void;
  onSaved: (updated: Client) => void;
}) {
  const [globalConfig, setGlobalConfig] = useState<DividendConfig | null>(null);
  const [useDefault, setUseDefault] = useState(
    !client.dividend_distribution ||
      client.dividend_distribution.use_default !== false,
  );
  const [partnerA, setPartnerA] = useState(
    String(client.dividend_distribution?.partner_a_pct ?? 50),
  );
  const [partnerB, setPartnerB] = useState(
    String(client.dividend_distribution?.partner_b_pct ?? 50),
  );
  const [inversiones, setInversiones] = useState(
    String(client.dividend_distribution?.inversiones_pct ?? 0),
  );
  const [back, setBack] = useState(
    String(client.dividend_distribution?.back_pct ?? 0),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDividendConfig().then(setGlobalConfig);
  }, []);

  const sum =
    (Number(partnerA) || 0) +
    (Number(partnerB) || 0) +
    (Number(inversiones) || 0) +
    (Number(back) || 0);
  const sumOk = Math.abs(sum - 100) < 0.01;

  async function save() {
    setError(null);
    if (!useDefault && !sumOk) {
      setError(`Los porcentajes suman ${sum.toFixed(2)}%. Deben sumar 100.`);
      return;
    }
    setSaving(true);
    try {
      const updated = await updateClientCore(client.id, {
        dividend_distribution: useDefault
          ? null
          : {
              use_default: false,
              partner_a_pct: Number(partnerA) || 0,
              partner_b_pct: Number(partnerB) || 0,
              inversiones_pct: Number(inversiones) || 0,
              back_pct: Number(back) || 0,
            },
      });
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  const partnerAName = globalConfig?.partner_a_name ?? "Socio A";
  const partnerBName = globalConfig?.partner_b_name ?? "Socio B";

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,26,12,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--white)",
          borderRadius: 12,
          maxWidth: 520,
          width: "100%",
          maxHeight: "90vh",
          overflow: "auto",
          padding: 28,
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        }}
      >
        <div style={{ marginBottom: 6, fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--sand-dark)", fontWeight: 700 }}>
          Finanzas · {client.name}
        </div>
        <h2 style={{ margin: 0, marginBottom: 16, fontSize: 20, color: "var(--deep-green)" }}>
          Editar distribución de dividendos
        </h2>

        <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.55, marginTop: 0, marginBottom: 18 }}>
          Los porcentajes acá aplican solo a la porción del net profit que viene de{" "}
          <strong>{client.name}</strong>. Ej: si vos trajiste al cliente, podés cobrar
          más de este que del resto. Si dejás el default, se usa la config global de
          Finanzas.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              border: `1px solid ${useDefault ? "var(--sand-dark)" : "rgba(10,26,12,0.12)"}`,
              background: useDefault ? "rgba(196,168,130,0.1)" : "var(--white)",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            <input
              type="radio"
              name="div_mode"
              checked={useDefault}
              onChange={() => setUseDefault(true)}
              style={{ width: "auto" }}
            />
            <div style={{ fontSize: 12, fontWeight: 600 }}>
              Usar la distribución por defecto (global de Finanzas)
            </div>
          </label>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              border: `1px solid ${!useDefault ? "var(--sand-dark)" : "rgba(10,26,12,0.12)"}`,
              background: !useDefault ? "rgba(196,168,130,0.1)" : "var(--white)",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            <input
              type="radio"
              name="div_mode"
              checked={!useDefault}
              onChange={() => setUseDefault(false)}
              style={{ width: "auto" }}
            />
            <div style={{ fontSize: 12, fontWeight: 600 }}>
              Distribución específica para este cliente
            </div>
          </label>
        </div>

        {!useDefault && (
          <div
            style={{
              padding: 16,
              background: "var(--off-white)",
              border: "1px solid rgba(196,168,130,0.3)",
              borderRadius: 8,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <PctInput label={`${partnerAName} (%)`} value={partnerA} onChange={setPartnerA} />
            <PctInput label={`${partnerBName} (%)`} value={partnerB} onChange={setPartnerB} />
            <PctInput label="Inversiones (%)" value={inversiones} onChange={setInversiones} />
            <PctInput label="Back / reservas (%)" value={back} onChange={setBack} />
            <div
              style={{
                gridColumn: "1 / -1",
                padding: "8px 12px",
                fontSize: 11,
                fontWeight: 600,
                background: sumOk ? "rgba(47,125,79,0.1)" : "rgba(176,75,58,0.08)",
                color: sumOk ? "var(--green-ok)" : "#B91C1C",
                border: `1px solid ${sumOk ? "rgba(47,125,79,0.25)" : "rgba(176,75,58,0.25)"}`,
                borderRadius: 4,
              }}
            >
              Total: {sum.toFixed(2)}% {sumOk ? "✓" : "— debe sumar 100"}
            </div>
          </div>
        )}

        {error && (
          <div style={{ padding: "8px 12px", background: "#FEE2E2", border: "1px solid #FCA5A5", borderRadius: 6, fontSize: 12, color: "#B91C1C", marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              padding: "10px 18px",
              border: "1px solid rgba(10,26,12,0.15)",
              background: "var(--white)",
              color: "var(--deep-green)",
              borderRadius: 6,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            style={{
              padding: "10px 22px",
              border: "none",
              background: "var(--deep-green)",
              color: "var(--off-white)",
              borderRadius: 6,
              cursor: saving ? "wait" : "pointer",
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 700,
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PctInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>
        {label}
      </span>
      <input
        type="number"
        min={0}
        max={100}
        step={0.1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: "8px 10px",
          border: "1px solid rgba(10,26,12,0.15)",
          borderRadius: 4,
          fontFamily: "inherit",
          fontSize: 13,
          background: "var(--white)",
        }}
      />
    </label>
  );
}
