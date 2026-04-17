"use client";

import { useState } from "react";
import { addProdCampaign } from "@/lib/storage";
import type { CampaignExpense } from "@/lib/types";
import styles from "./NewClientModal.module.css";

const TYPES = [
  "Producción UGC",
  "Sesión fotográfica",
  "Producción de video / reels",
  "Contenido orgánico",
  "Pooshlo · App",
  "Email creativo",
  "Influencer marketing",
  "Otras herramientas / Externo",
];

const CONTENT_TYPES = ["Producción UGC", "Sesión fotográfica", "Producción de video / reels", "Contenido orgánico", "Influencer marketing"];

interface Props {
  open: boolean;
  clientId: string;
  onClose: () => void;
  onCreated?: () => void;
}

export default function NewProdCampaignModal({ open, clientId, onClose, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState(TYPES[0]);
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [items, setItems] = useState<CampaignExpense[]>([{ label: "", amount: 0 }]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  if (!open) return null;

  const totalItems = items.reduce((s, i) => s + (i.amount || 0), 0);
  const canSubmit = title.trim() && description.trim() && Number(budget) > 0;

  function addItem() {
    setItems([...items, { label: "", amount: 0 }]);
  }

  function updateItem(idx: number, patch: Partial<CampaignExpense>) {
    setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function removeItem(idx: number) {
    setItems(items.filter((_, i) => i !== idx));
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    const validItems = items.filter((i) => i.label.trim() && i.amount > 0);
    await addProdCampaign({
      clientId,
      title: title.trim(),
      type,
      description: description.trim(),
      status: "active",
      budget: Number(budget),
      hasResult: CONTENT_TYPES.includes(type),
      items: validItems,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      resultFiles: 0,
    });
    setTitle("");
    setDescription("");
    setBudget("");
    setItems([{ label: "", amount: 0 }]);
    onClose();
    onCreated?.();
  }

  return (
    <div className={styles.backdrop} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <button className={styles.close} onClick={onClose}>×</button>

        <div className={styles.eyebrow}>Nueva campaña · Impacto en presupuesto</div>
        <h2 className={styles.title}>Crear campaña</h2>
        <p className={styles.sub}>
          Definí el tipo de producción, los gastos asociados y el impacto en el presupuesto.
        </p>

        <div className={styles.field}>
          <label>Tipo de campaña</label>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => (<option key={t}>{t}</option>))}
          </select>
        </div>

        <div className={styles.field}>
          <label>Nombre de la campaña</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej: Sesión UGC colección primavera"
            autoFocus
          />
        </div>

        <div className={styles.field}>
          <label>Descripción del servicio</label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detalles del servicio, objetivos, entregables esperados…"
            style={{ resize: "vertical" }}
          />
        </div>

        <div className={styles.field}>
          <label>Presupuesto total (USD)</label>
          <input
            type="number"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="620"
          />
        </div>

        <div className={styles.sectionLabel}>Gastos asignados</div>
        {items.map((it, idx) => (
          <div
            key={idx}
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 32px",
              gap: 10,
              marginBottom: 10,
              alignItems: "center",
            }}
          >
            <input
              placeholder="Ej: Fotógrafo · Martín R."
              value={it.label}
              onChange={(e) => updateItem(idx, { label: e.target.value })}
              style={{ padding: "10px 0", border: "none", borderBottom: "1px solid rgba(10,26,12,0.15)", background: "transparent", outline: "none", color: "var(--deep-green)", fontFamily: "inherit" }}
            />
            <input
              type="number"
              placeholder="Monto USD"
              value={it.amount || ""}
              onChange={(e) => updateItem(idx, { amount: Number(e.target.value) })}
              style={{ padding: "10px 0", border: "none", borderBottom: "1px solid rgba(10,26,12,0.15)", background: "transparent", outline: "none", color: "var(--deep-green)", fontFamily: "inherit" }}
            />
            <button
              onClick={() => removeItem(idx)}
              style={{ color: "var(--red-warn)", fontSize: 18, background: "transparent", border: "none", cursor: "pointer" }}
            >×</button>
          </div>
        ))}
        <button
          onClick={addItem}
          style={{
            fontSize: 11,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "var(--sand-dark)",
            fontWeight: 600,
            marginTop: 8,
            padding: "8px 12px",
            border: "1px dashed rgba(196,168,130,0.4)",
            background: "transparent",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          + Agregar gasto
        </button>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 24 }}>
          <div className={styles.field} style={{ margin: 0 }}>
            <label>Fecha inicio</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className={styles.field} style={{ margin: 0 }}>
            <label>Fecha fin</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>

        <div style={{
          marginTop: 24,
          padding: 16,
          background: "var(--off-white)",
          borderLeft: "3px solid var(--yellow-warn)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Total estimado</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            US$ {totalItems.toLocaleString()}
            {Number(budget) > 0 && totalItems > Number(budget) && (
              <span style={{ color: "var(--red-warn)", fontSize: 12, marginLeft: 10 }}>
                ↑ Supera presupuesto
              </span>
            )}
          </div>
        </div>

        <div className={styles.actions}>
          <button className={styles.btnGhost} onClick={onClose}>Cancelar</button>
          <button className={styles.btnSolid} onClick={handleSubmit} disabled={!canSubmit}>
            Crear campaña →
          </button>
        </div>
      </div>
    </div>
  );
}
