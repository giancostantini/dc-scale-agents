"use client";

import { useState, useEffect } from "react";
import { createRequest } from "@/lib/requests";
import type {
  ClientRequestType,
  ClientRequestUrgency,
} from "@/lib/types";
import styles from "./NewClientModal.module.css";

interface Props {
  open: boolean;
  type: ClientRequestType;
  clientId: string;
  /** Si true (clientes de viajes), la oferta usa el form estructurado de "paquete". */
  packageForm?: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

const ACCION_AREAS = [
  { value: "ads", label: "Ads / paid media" },
  { value: "contenido", label: "Contenido / redes" },
  { value: "seo", label: "SEO / contenido orgánico" },
  { value: "dev", label: "Desarrollo / web / IA" },
  { value: "otro", label: "Otro" },
];

export default function NewRequestModal({
  open,
  type,
  clientId,
  packageForm,
  onClose,
  onCreated,
}: Props) {
  // Comunes
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState<ClientRequestUrgency>("media");

  // Oferta
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [discountPct, setDiscountPct] = useState("");
  const [product, setProduct] = useState("");

  // Oferta — paquete (clientes de viajes)
  const [destino, setDestino] = useState("");
  const [precio, setPrecio] = useState("");
  const [precioNota, setPrecioNota] = useState("");
  const [tier, setTier] = useState<"high" | "low">("high");
  const [details, setDetails] = useState<string[]>([""]);

  // Acción
  const [area, setArea] = useState("ads");
  const [desiredDate, setDesiredDate] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDescription("");
    setUrgency("media");
    setStartDate("");
    setEndDate("");
    setDiscountPct("");
    setProduct("");
    setDestino("");
    setPrecio("");
    setPrecioNota("");
    setTier("high");
    setDetails([""]);
    setArea("ads");
    setDesiredDate("");
    setError("");
  }, [open, type]);

  if (!open) return null;

  const isPackage = type === "oferta" && !!packageForm;

  const canSubmit = isPackage
    ? title.trim().length >= 3 && destino.trim().length >= 2 && !saving
    : title.trim().length >= 3 && description.trim().length >= 5 && !saving;

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    setError("");
    try {
      let metadata: Record<string, unknown>;
      if (isPackage) {
        const bullets = details.map((d) => d.trim()).filter(Boolean);
        metadata = {
          destino: destino.trim() || undefined,
          precio: precio ? Number(precio) : undefined,
          precioNota: precioNota.trim() || undefined,
          tier,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          details: bullets.length > 0 ? bullets : undefined,
        };
      } else if (type === "oferta") {
        metadata = {
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          discountPct: discountPct ? Number(discountPct) : undefined,
          product: product.trim() || undefined,
        };
      } else {
        metadata = {
          area,
          desiredDate: desiredDate || undefined,
        };
      }
      // remove undefined keys
      Object.keys(metadata).forEach(
        (k) => metadata[k] === undefined && delete metadata[k],
      );

      await createRequest({
        client_id: clientId,
        type,
        title: title.trim(),
        description: isPackage ? "" : description.trim(),
        metadata,
        urgency,
      });
      onCreated?.();
      onClose();
    } catch (err) {
      const e = err as { message?: string };
      setError(e.message ?? "No se pudo enviar la solicitud.");
    } finally {
      setSaving(false);
    }
  }

  const isOferta = type === "oferta";

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={styles.modal} style={{ maxWidth: 640 }}>
        <button className={styles.close} onClick={onClose}>
          ×
        </button>

        <div className={styles.eyebrow}>
          {isPackage
            ? "Cargar paquete"
            : isOferta
              ? "Nueva oferta comercial"
              : "Nueva acción"}
        </div>
        <h2 className={styles.title}>
          {isPackage
            ? "Cargá un paquete"
            : isOferta
              ? "Cargá una promoción"
              : "Cargá una acción"}
        </h2>
        <p className={styles.sub}>
          {isPackage
            ? "Cargá el paquete: destino, precio, disponibilidad y los detalles (qué incluye) por renglón. Nuestro equipo lo revisa y te responde."
            : isOferta
              ? "Describí la promoción que querés que ejecutemos: producto, fechas, descuento. Nuestro equipo la revisa y te responde."
              : "Cualquier idea o pedido libre. Si querés que probemos un canal nuevo, mejorar algo, lanzar una iniciativa puntual."}
        </p>

        <div className={styles.field}>
          <label>{isPackage ? "Nombre del paquete" : "Título"}</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              isPackage
                ? "Ej: 1 Semana en Santiago de Chile"
                : isOferta
                  ? "Ej: Promo Día de la Madre"
                  : "Ej: Probar TikTok Ads"
            }
            autoFocus
          />
        </div>

        {/* Descripción libre — no aplica al form de paquete (va en los detalles) */}
        {!isPackage && (
          <div className={styles.field}>
            <label>Descripción</label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                isOferta
                  ? "Detalles de la promo: a quién va, qué incluye, cómo se comunica."
                  : "Por qué lo querés hacer, qué resultado esperás, contexto."
              }
              style={{ resize: "vertical" }}
            />
          </div>
        )}

        {/* ============ Campos: PAQUETE (clientes de viajes) ============ */}
        {isPackage && (
          <>
            <div className={styles.field}>
              <label>Destino</label>
              <input
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
                placeholder="Ej: Santiago de Chile"
              />
            </div>
            <div className={styles.fieldGrid2}>
              <div className={styles.field}>
                <label>Precio</label>
                <input
                  type="number"
                  value={precio}
                  onChange={(e) => setPrecio(e.target.value)}
                  placeholder="685"
                />
              </div>
              <div className={styles.field}>
                <label>Nota de precio</label>
                <input
                  value={precioNota}
                  onChange={(e) => setPrecioNota(e.target.value)}
                  placeholder="USD · x persona base doble"
                />
              </div>
            </div>
            <div className={styles.fieldGrid2}>
              <div className={styles.field}>
                <label>Disponible desde</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label>Disponible hasta</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            <div className={styles.field}>
              <label>Tipo de oferta</label>
              <div style={{ display: "flex", gap: 8 }}>
                {(["high", "low"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTier(t)}
                    style={{
                      flex: 1,
                      padding: "10px 12px",
                      fontSize: 13,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      borderRadius: 8,
                      border:
                        tier === t
                          ? "1px solid var(--deep-green)"
                          : "1px solid rgba(10,26,12,0.15)",
                      background:
                        tier === t ? "var(--deep-green)" : "transparent",
                      color:
                        tier === t ? "var(--off-white)" : "var(--deep-green)",
                    }}
                  >
                    {t === "high" ? "High" : "Low"}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.field}>
              <label>Detalles del paquete</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {details.map((d, i) => (
                  <div key={i} style={{ display: "flex", gap: 8 }}>
                    <input
                      value={d}
                      onChange={(e) =>
                        setDetails((arr) =>
                          arr.map((x, j) => (j === i ? e.target.value : x)),
                        )
                      }
                      placeholder="Ej: Vuelo directo Latam + traslado privado"
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setDetails((arr) => arr.filter((_, j) => j !== i))
                      }
                      title="Quitar"
                      style={{
                        width: 38,
                        border: "1px solid rgba(10,26,12,0.15)",
                        background: "transparent",
                        color: "var(--red-warn)",
                        borderRadius: 8,
                        cursor: "pointer",
                        fontSize: 16,
                        fontFamily: "inherit",
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setDetails((arr) => [...arr, ""])}
                  style={{
                    alignSelf: "flex-start",
                    padding: "6px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    background: "transparent",
                    border: "1px dashed var(--sand-dark)",
                    color: "var(--sand-dark)",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  ＋ Agregar detalle
                </button>
              </div>
            </div>
          </>
        )}

        {/* ============ Campos: OFERTA básica (clientes no-viajes) ============ */}
        {isOferta && !isPackage && (
          <>
            <div className={styles.fieldGrid2}>
              <div className={styles.field}>
                <label>Fecha de inicio</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label>Fecha de fin</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            <div className={styles.fieldGrid2}>
              <div className={styles.field}>
                <label>Descuento (%)</label>
                <input
                  type="number"
                  value={discountPct}
                  onChange={(e) => setDiscountPct(e.target.value)}
                  placeholder="20"
                />
              </div>
              <div className={styles.field}>
                <label>Producto / categoría</label>
                <input
                  value={product}
                  onChange={(e) => setProduct(e.target.value)}
                  placeholder="Ej: Línea premium · todos los productos"
                />
              </div>
            </div>
          </>
        )}

        {/* ============ Campos específicos: ACCION ============ */}
        {!isOferta && (
          <div className={styles.fieldGrid2}>
            <div className={styles.field}>
              <label>Área</label>
              <select value={area} onChange={(e) => setArea(e.target.value)}>
                {ACCION_AREAS.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label>Fecha deseada (opcional)</label>
              <input
                type="date"
                value={desiredDate}
                onChange={(e) => setDesiredDate(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className={styles.field}>
          <label>Urgencia</label>
          <select
            value={urgency}
            onChange={(e) => setUrgency(e.target.value as ClientRequestUrgency)}
          >
            <option value="baja">Baja · cuando puedan</option>
            <option value="media">Media · este mes</option>
            <option value="alta">Alta · prioritario</option>
          </select>
        </div>

        {error && (
          <div
            style={{
              padding: 12,
              background: "rgba(176,75,58,0.1)",
              borderLeft: "3px solid var(--red-warn)",
              color: "var(--red-warn)",
              fontSize: 12,
              marginTop: 12,
            }}
          >
            <strong>Error:</strong> {error}
          </div>
        )}

        <div className={styles.actions}>
          <button className={styles.btnGhost} onClick={onClose}>
            Cancelar
          </button>
          <button
            className={styles.btnSolid}
            onClick={submit}
            disabled={!canSubmit}
          >
            {saving ? "Enviando…" : "Enviar solicitud →"}
          </button>
        </div>
      </div>
    </div>
  );
}
