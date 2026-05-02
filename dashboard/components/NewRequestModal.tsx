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
    setArea("ads");
    setDesiredDate("");
    setError("");
  }, [open, type]);

  if (!open) return null;

  const canSubmit =
    title.trim().length >= 3 &&
    description.trim().length >= 5 &&
    !saving;

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    setError("");
    try {
      const metadata: Record<string, unknown> =
        type === "oferta"
          ? {
              startDate: startDate || undefined,
              endDate: endDate || undefined,
              discountPct: discountPct ? Number(discountPct) : undefined,
              product: product.trim() || undefined,
            }
          : {
              area,
              desiredDate: desiredDate || undefined,
            };
      // remove undefined keys
      Object.keys(metadata).forEach(
        (k) => metadata[k] === undefined && delete metadata[k],
      );

      await createRequest({
        client_id: clientId,
        type,
        title: title.trim(),
        description: description.trim(),
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
          {isOferta ? "Nueva oferta comercial" : "Nueva acción"}
        </div>
        <h2 className={styles.title}>
          {isOferta ? "Cargá una promoción" : "Cargá una acción"}
        </h2>
        <p className={styles.sub}>
          {isOferta
            ? "Describí la promoción que querés que ejecutemos: producto, fechas, descuento. Nuestro equipo la revisa y te responde."
            : "Cualquier idea o pedido libre. Si querés que probemos un canal nuevo, mejorar algo, lanzar una iniciativa puntual."}
        </p>

        <div className={styles.field}>
          <label>Título</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              isOferta
                ? "Ej: Promo Día de la Madre"
                : "Ej: Probar TikTok Ads"
            }
            autoFocus
          />
        </div>

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

        {/* ============ Campos específicos: OFERTA ============ */}
        {isOferta && (
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
