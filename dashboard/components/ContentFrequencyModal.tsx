"use client";

/**
 * Modal donde el director define la frecuencia semanal de publicación
 * por SLOT (red × formato) del cliente.
 *
 * Ej: Instagram Feed 3x/sem, Instagram Story 7x/sem, IG Reel 2x/sem,
 *     TikTok Video 3x/sem, LinkedIn Post 2x/sem.
 *
 * El roadmap consume estos valores para marcar los días "sugeridos"
 * de cada slot en el calendario (chip ghost con sigla del slot).
 * No publica nada automáticamente — es guía visual.
 *
 * BACK-COMPAT: si el cliente ya tenía `{ ig: 3, tt: 5 }` (keys
 * legacy), las leemos y las mapeamos a `ig_feed: 3, tt_video: 5`
 * usando normalizeFrequency. Al guardar, escribimos solo keys
 * canónicas con sufijo.
 */

import { useEffect, useMemo, useState } from "react";
import { updateClientContentFrequency } from "@/lib/storage";
import {
  CONTENT_SLOTS,
  normalizeFrequency,
} from "@/lib/content-frequency";
import type { ContentFrequency } from "@/lib/types";

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
  // Estado local: una entrada por slot (red×formato). Valor 0 = no usa.
  const [freq, setFreq] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Inicializar con la frecuencia normalizada del cliente
    const normalized = normalizeFrequency(
      current as Record<string, number | undefined> | undefined,
    );
    const initial: Record<string, number> = {};
    for (const slot of CONTENT_SLOTS) {
      initial[slot.key] = normalized[slot.key] ?? 0;
    }
    setFreq(initial);
  }, [open, current]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, saving, onClose]);

  // Agrupar slots por red para mostrarlos en secciones
  const slotsByNetwork = useMemo(() => {
    const groups = new Map<
      string,
      { label: string; color: string; slots: typeof CONTENT_SLOTS }
    >();
    for (const s of CONTENT_SLOTS) {
      const g = groups.get(s.network) ?? {
        label: s.networkLabel,
        color: s.color,
        slots: [],
      };
      g.slots.push(s);
      groups.set(s.network, g);
    }
    return Array.from(groups.entries());
  }, []);

  if (!open) return null;

  function set(slotKey: string, value: number) {
    const clamped = Math.max(0, Math.min(14, Math.round(value)));
    setFreq((f) => ({ ...f, [slotKey]: clamped }));
  }

  async function save() {
    setSaving(true);
    try {
      // Solo guardamos slots con freq > 0 (más limpio)
      const cleaned: ContentFrequency = {};
      for (const slot of CONTENT_SLOTS) {
        if (freq[slot.key] > 0) {
          // El cast es seguro: slot.key es ContentSlotKey
          (cleaned as Record<string, number>)[slot.key] = freq[slot.key];
        }
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

  const totalPerWeek = Object.values(freq).reduce((s, v) => s + v, 0);

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
          maxHeight: "90vh",
          overflowY: "auto",
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
          Roadmap · Frecuencia
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
          ¿Cuántas veces por semana publica el cliente en cada formato? El
          calendario sombrea los días sugeridos con la sigla del slot
          (IG·F, IG·S, IG·R, TT·V, etc). 0 = no usa ese formato.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {slotsByNetwork.map(([network, group]) => {
            const networkTotal = group.slots.reduce(
              (s, slot) => s + (freq[slot.key] ?? 0),
              0,
            );
            return (
              <div
                key={network}
                style={{
                  padding: "12px 14px",
                  background: "var(--off-white)",
                  borderLeft: `3px solid ${group.color}`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: "var(--deep-green)",
                    }}
                  >
                    {group.label}
                  </div>
                  {networkTotal > 0 && (
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {networkTotal}{" "}
                      {networkTotal === 1 ? "publicación" : "publicaciones"}
                      /sem
                    </div>
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  {group.slots.map((slot) => (
                    <div
                      key={slot.key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <div
                        style={{
                          flex: 1,
                          fontSize: 13,
                          color: "var(--deep-green)",
                        }}
                      >
                        {slot.formatLabel}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <button
                          onClick={() => set(slot.key, (freq[slot.key] ?? 0) - 1)}
                          disabled={saving || (freq[slot.key] ?? 0) === 0}
                          style={{
                            width: 28,
                            height: 28,
                            background: "var(--white)",
                            border: "1px solid rgba(10,26,12,0.15)",
                            color: "var(--deep-green)",
                            fontSize: 14,
                            cursor:
                              saving || (freq[slot.key] ?? 0) === 0
                                ? "default"
                                : "pointer",
                            fontFamily: "inherit",
                            opacity:
                              saving || (freq[slot.key] ?? 0) === 0 ? 0.4 : 1,
                          }}
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={0}
                          max={14}
                          value={freq[slot.key] ?? 0}
                          onChange={(e) =>
                            set(slot.key, parseInt(e.target.value || "0", 10))
                          }
                          disabled={saving}
                          style={{
                            width: 50,
                            textAlign: "center",
                            padding: "5px",
                            border: "1px solid rgba(10,26,12,0.15)",
                            background: "var(--white)",
                            color: "var(--deep-green)",
                            fontSize: 13,
                            fontWeight: 600,
                            outline: "none",
                            fontFamily: "inherit",
                          }}
                        />
                        <button
                          onClick={() => set(slot.key, (freq[slot.key] ?? 0) + 1)}
                          disabled={saving || (freq[slot.key] ?? 0) >= 14}
                          style={{
                            width: 28,
                            height: 28,
                            background: "var(--white)",
                            border: "1px solid rgba(10,26,12,0.15)",
                            color: "var(--deep-green)",
                            fontSize: 14,
                            cursor:
                              saving || (freq[slot.key] ?? 0) >= 14
                                ? "default"
                                : "pointer",
                            fontFamily: "inherit",
                            opacity:
                              saving || (freq[slot.key] ?? 0) >= 14 ? 0.4 : 1,
                          }}
                        >
                          +
                        </button>
                        <div
                          style={{
                            fontSize: 10,
                            color: "var(--text-muted)",
                            marginLeft: 4,
                            minWidth: 36,
                          }}
                        >
                          / sem
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
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
            marginTop: 24,
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
