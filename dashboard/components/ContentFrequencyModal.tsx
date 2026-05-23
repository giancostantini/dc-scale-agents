"use client";

/**
 * Modal donde el director define:
 *  1. Frecuencia semanal de publicación por SLOT (red × formato).
 *     Ej: Instagram Feed 3x/sem, Instagram Story 7x/sem.
 *  2. Mix porcentual de tipos de contenido por RED:
 *     Valor / Oferta / Engagement → ej IG: 60/25/15.
 *
 * El roadmap consume ambos:
 *  - Los días "sugeridos" se calculan con la frecuencia.
 *  - El tipo (V/O/E) de cada posteo sugerido se calcula con el mix.
 *
 * BACK-COMPAT con keys legacy (ig/tt/in/fb) — los normalizamos al leer.
 */

import { useEffect, useMemo, useState } from "react";
import {
  updateClientContentFrequency,
  updateClientContentMix,
} from "@/lib/storage";
import {
  CONTENT_SLOTS,
  CONTENT_TYPE_META,
  normalizeFrequency,
} from "@/lib/content-frequency";
import type {
  ContentFrequency,
  ContentMix,
  ContentNetworkKey,
  ContentTypeMix,
} from "@/lib/types";

interface Props {
  open: boolean;
  clientId: string;
  current: ContentFrequency | undefined;
  currentMix: ContentMix | undefined;
  onClose: () => void;
  onSaved: (newFreq: ContentFrequency, newMix: ContentMix) => void;
}

/** Devuelve un ContentTypeMix saneado (valores >= 0). */
function defaultMix(): ContentTypeMix {
  return { valor: 60, oferta: 25, engagement: 15 };
}

export default function ContentFrequencyModal({
  open,
  clientId,
  current,
  currentMix,
  onClose,
  onSaved,
}: Props) {
  const [freq, setFreq] = useState<Record<string, number>>({});
  const [mix, setMix] = useState<Record<ContentNetworkKey, ContentTypeMix>>(
    {} as Record<ContentNetworkKey, ContentTypeMix>,
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const normalized = normalizeFrequency(
      current as Record<string, number | undefined> | undefined,
    );
    const initial: Record<string, number> = {};
    for (const slot of CONTENT_SLOTS) {
      initial[slot.key] = normalized[slot.key] ?? 0;
    }
    setFreq(initial);

    // Inicializar mix con default para las redes activas
    const initialMix = {} as Record<ContentNetworkKey, ContentTypeMix>;
    const networks: ContentNetworkKey[] = ["ig", "tt", "in", "fb", "yt"];
    for (const n of networks) {
      initialMix[n] = currentMix?.[n] ?? defaultMix();
    }
    setMix(initialMix);
  }, [open, current, currentMix]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, saving, onClose]);

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
    return Array.from(groups.entries()) as [
      ContentNetworkKey,
      { label: string; color: string; slots: typeof CONTENT_SLOTS },
    ][];
  }, []);

  if (!open) return null;

  function setSlotFreq(slotKey: string, value: number) {
    const clamped = Math.max(0, Math.min(14, Math.round(value)));
    setFreq((f) => ({ ...f, [slotKey]: clamped }));
  }

  function setMixValue(
    network: ContentNetworkKey,
    type: keyof ContentTypeMix,
    value: number,
  ) {
    const clamped = Math.max(0, Math.min(100, Math.round(value)));
    setMix((m) => ({
      ...m,
      [network]: { ...(m[network] ?? defaultMix()), [type]: clamped },
    }));
  }

  async function save() {
    setSaving(true);
    try {
      const cleanedFreq: ContentFrequency = {};
      for (const slot of CONTENT_SLOTS) {
        if (freq[slot.key] > 0) {
          (cleanedFreq as Record<string, number>)[slot.key] = freq[slot.key];
        }
      }

      // Mix: solo guardamos redes con al menos 1 slot activo. Para esas,
      // normalizamos a 100 si los % no suman exacto (no rompe nada
      // estructural pero queda más prolijo).
      const activeNetworks = new Set<ContentNetworkKey>();
      for (const slot of CONTENT_SLOTS) {
        if (freq[slot.key] > 0) activeNetworks.add(slot.network);
      }
      const cleanedMix: ContentMix = {};
      for (const n of activeNetworks) {
        const m = mix[n];
        if (!m) continue;
        cleanedMix[n] = {
          valor: m.valor ?? 0,
          oferta: m.oferta ?? 0,
          engagement: m.engagement ?? 0,
        };
      }

      await updateClientContentFrequency(clientId, cleanedFreq);
      await updateClientContentMix(clientId, cleanedMix);
      onSaved(cleanedFreq, cleanedMix);
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
          maxWidth: 720,
          width: "100%",
          maxHeight: "90vh",
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
          Roadmap · Frecuencia + mix de contenido
        </div>
        <h2
          style={{
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            marginBottom: 8,
          }}
        >
          Frecuencia y tipo de contenido
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "var(--text-muted)",
            marginBottom: 24,
            lineHeight: 1.5,
          }}
        >
          ¿Cuántas veces por semana publica cada formato, y qué porcentaje
          es <strong style={{ color: "#2f7d4f" }}>valor</strong>,{" "}
          <strong style={{ color: "#b04b3a" }}>oferta</strong> o{" "}
          <strong style={{ color: "#9b8259" }}>engagement</strong>? El
          calendario etiqueta automáticamente cada posteo sugerido con el
          tipo correspondiente.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {slotsByNetwork.map(([network, group]) => {
            const networkTotal = group.slots.reduce(
              (s, slot) => s + (freq[slot.key] ?? 0),
              0,
            );
            const isActive = networkTotal > 0;
            const networkMix = mix[network] ?? defaultMix();
            const mixSum =
              (networkMix.valor ?? 0) +
              (networkMix.oferta ?? 0) +
              (networkMix.engagement ?? 0);
            return (
              <div
                key={network}
                style={{
                  padding: "12px 14px",
                  background: "var(--off-white)",
                  borderLeft: `3px solid ${group.color}`,
                  borderRadius: "var(--r-md)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginBottom: 10,
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

                {/* Frecuencia por formato */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    marginBottom: isActive ? 14 : 0,
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
                          onClick={() => setSlotFreq(slot.key, (freq[slot.key] ?? 0) - 1)}
                          disabled={saving || (freq[slot.key] ?? 0) === 0}
                          style={stepBtn(saving || (freq[slot.key] ?? 0) === 0)}
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={0}
                          max={14}
                          value={freq[slot.key] ?? 0}
                          onChange={(e) =>
                            setSlotFreq(slot.key, parseInt(e.target.value || "0", 10))
                          }
                          disabled={saving}
                          style={stepInput}
                        />
                        <button
                          onClick={() => setSlotFreq(slot.key, (freq[slot.key] ?? 0) + 1)}
                          disabled={saving || (freq[slot.key] ?? 0) >= 14}
                          style={stepBtn(saving || (freq[slot.key] ?? 0) >= 14)}
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

                {/* Mix V/O/E — solo si esta red tiene al menos 1 slot
                    activo (>0). No tiene sentido configurar mix de una
                    red que no publica nada. */}
                {isActive && (
                  <div
                    style={{
                      padding: "10px 12px",
                      background: "var(--white)",
                      border: "1px solid rgba(10,26,12,0.06)",
                      borderRadius: "var(--r-md)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        letterSpacing: "0.18em",
                        textTransform: "uppercase",
                        color: "var(--sand-dark)",
                        fontWeight: 700,
                        marginBottom: 8,
                      }}
                    >
                      Mix por tipo
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr 1fr",
                        gap: 10,
                      }}
                    >
                      {(["valor", "oferta", "engagement"] as const).map((t) => {
                        const meta = CONTENT_TYPE_META[t];
                        return (
                          <div key={t}>
                            <label
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 5,
                                fontSize: 11,
                                color: "var(--deep-green)",
                                marginBottom: 4,
                                fontWeight: 600,
                              }}
                            >
                              <span
                                style={{
                                  width: 14,
                                  height: 14,
                                  background: meta.color,
                                  color: "#fff",
                                  fontSize: 8.5,
                                  fontWeight: 700,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  borderRadius: 3,
                                }}
                              >
                                {meta.short}
                              </span>
                              {meta.label}
                            </label>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={networkMix[t] ?? 0}
                                onChange={(e) =>
                                  setMixValue(
                                    network,
                                    t,
                                    parseInt(e.target.value || "0", 10),
                                  )
                                }
                                disabled={saving}
                                style={{
                                  ...stepInput,
                                  width: 55,
                                }}
                              />
                              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 11,
                        color: mixSum === 100 ? "#2f7d4f" : mixSum === 0 ? "var(--text-muted)" : "#b04b3a",
                      }}
                    >
                      Total: <strong>{mixSum}%</strong>{" "}
                      {mixSum === 100
                        ? "✓"
                        : mixSum === 0
                          ? "(sin mix — todos los posts quedan como Valor)"
                          : "(se normaliza a 100% al asignar tipos)"}
                    </div>
                  </div>
                )}
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
            borderRadius: "var(--r-md)",
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
              borderRadius: "var(--r-sm)",
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
              borderRadius: "var(--r-sm)",
            }}
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function stepBtn(disabled: boolean): React.CSSProperties {
  return {
    width: 28,
    height: 28,
    background: "var(--white)",
    border: "1px solid rgba(10,26,12,0.15)",
    color: "var(--deep-green)",
    fontSize: 14,
    cursor: disabled ? "default" : "pointer",
    fontFamily: "inherit",
    opacity: disabled ? 0.4 : 1,
    borderRadius: "var(--r-sm)",
  };
}

const stepInput: React.CSSProperties = {
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
  borderRadius: "var(--r-sm)",
};
