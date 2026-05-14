"use client";

/**
 * Modal donde el director define la frecuencia semanal de publicación
 * por red social del cliente. Ej: Instagram 3x/sem, LinkedIn 2x/sem.
 *
 * El planificador consume estos valores para marcar visualmente los
 * días "sugeridos" de cada red en el calendario (chip ghost color
 * de la red). No publica nada automáticamente — es solo guía visual.
 */

import { useEffect, useState } from "react";
import { updateClientContentFrequency } from "@/lib/storage";
import type { ContentFrequency, ContentNetwork } from "@/lib/types";

interface NetworkConfig {
  key: ContentNetwork;
  label: string;
  color: string;
}

const NETWORKS: NetworkConfig[] = [
  { key: "ig", label: "Instagram", color: "var(--deep-green)" },
  { key: "tt", label: "TikTok", color: "var(--sand-dark)" },
  { key: "in", label: "LinkedIn", color: "var(--forest-2, #2d5036)" },
  { key: "fb", label: "Facebook", color: "var(--forest, #1f3a26)" },
];

interface Props {
  open: boolean;
  clientId: string;
  current: ContentFrequency | undefined;
  onClose: () => void;
  onSaved: (newFreq: ContentFrequency) => void;
}

export default function ContentFrequencyModal({
  open,
  clientId,
  current,
  onClose,
  onSaved,
}: Props) {
  // Estado local: una entrada por red, valor 0 = no usa esa red.
  const [freq, setFreq] = useState<Record<ContentNetwork, number>>({
    ig: 0,
    tt: 0,
    in: 0,
    fb: 0,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFreq({
      ig: current?.ig ?? 0,
      tt: current?.tt ?? 0,
      in: current?.in ?? 0,
      fb: current?.fb ?? 0,
    });
  }, [open, current]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, saving, onClose]);

  if (!open) return null;

  function set(network: ContentNetwork, value: number) {
    const clamped = Math.max(0, Math.min(7, Math.round(value)));
    setFreq((f) => ({ ...f, [network]: clamped }));
  }

  async function save() {
    setSaving(true);
    try {
      // Solo guardamos redes con freq > 0 (más limpio)
      const cleaned: ContentFrequency = {};
      for (const n of NETWORKS) {
        if (freq[n.key] > 0) cleaned[n.key] = freq[n.key];
      }
      await updateClientContentFrequency(clientId, cleaned);
      onSaved(cleaned);
      onClose();
    } catch (err) {
      const e = err as Error;
      alert(`No se pudo guardar:\n${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  const totalPerWeek = NETWORKS.reduce((s, n) => s + freq[n.key], 0);

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
          maxWidth: 540,
          width: "100%",
          padding: 36,
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
          Planificador · Frecuencia
        </div>
        <h2
          style={{
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            marginBottom: 8,
          }}
        >
          Frecuencia de contenido
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "var(--text-muted)",
            marginBottom: 24,
            lineHeight: 1.5,
          }}
        >
          ¿Cuántas veces por semana publica el cliente en cada red? El
          calendario sombrea los días sugeridos según esta config. 0 = el
          cliente no usa esa red.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {NETWORKS.map((n) => (
            <div
              key={n.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "10px 14px",
                background: "var(--off-white)",
                borderLeft: `3px solid ${n.color}`,
              }}
            >
              <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "var(--deep-green)" }}>
                {n.label}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  onClick={() => set(n.key, freq[n.key] - 1)}
                  disabled={saving || freq[n.key] === 0}
                  style={{
                    width: 32,
                    height: 32,
                    background: "var(--white)",
                    border: "1px solid rgba(10,26,12,0.15)",
                    color: "var(--deep-green)",
                    fontSize: 16,
                    cursor: saving || freq[n.key] === 0 ? "default" : "pointer",
                    fontFamily: "inherit",
                    opacity: saving || freq[n.key] === 0 ? 0.4 : 1,
                  }}
                >
                  −
                </button>
                <input
                  type="number"
                  min={0}
                  max={7}
                  value={freq[n.key]}
                  onChange={(e) => set(n.key, parseInt(e.target.value || "0", 10))}
                  disabled={saving}
                  style={{
                    width: 56,
                    textAlign: "center",
                    padding: "6px",
                    border: "1px solid rgba(10,26,12,0.15)",
                    background: "var(--white)",
                    color: "var(--deep-green)",
                    fontSize: 14,
                    fontWeight: 600,
                    outline: "none",
                    fontFamily: "inherit",
                  }}
                />
                <button
                  onClick={() => set(n.key, freq[n.key] + 1)}
                  disabled={saving || freq[n.key] >= 7}
                  style={{
                    width: 32,
                    height: 32,
                    background: "var(--white)",
                    border: "1px solid rgba(10,26,12,0.15)",
                    color: "var(--deep-green)",
                    fontSize: 16,
                    cursor: saving || freq[n.key] >= 7 ? "default" : "pointer",
                    fontFamily: "inherit",
                    opacity: saving || freq[n.key] >= 7 ? 0.4 : 1,
                  }}
                >
                  +
                </button>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    marginLeft: 6,
                    minWidth: 50,
                  }}
                >
                  / semana
                </div>
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: 20,
            padding: "10px 14px",
            background: "var(--ivory)",
            fontSize: 12,
            color: "var(--text-soft, #5a6a5e)",
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: "var(--deep-green)" }}>
            Total: {totalPerWeek} publicaciones/semana
          </strong>{" "}
          ≈ {Math.round(totalPerWeek * 4.33)} al mes.
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
            marginTop: 28,
          }}
        >
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              background: "transparent",
              border: "1px solid rgba(10,26,12,0.15)",
              color: "var(--deep-green)",
              padding: "10px 18px",
              fontSize: 12,
              fontWeight: 500,
              cursor: saving ? "default" : "pointer",
              fontFamily: "inherit",
            }}
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving}
            style={{
              background: "var(--deep-green)",
              color: "var(--off-white)",
              border: "none",
              padding: "10px 18px",
              fontSize: 12,
              fontWeight: 600,
              cursor: saving ? "default" : "pointer",
              letterSpacing: "0.5px",
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
