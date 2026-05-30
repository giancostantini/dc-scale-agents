"use client";

import { useState } from "react";
import { addLead } from "@/lib/storage";
import type { PipelineStage, LeadSource, ClientType } from "@/lib/types";
import styles from "./NewClientModal.module.css";

interface NewLeadModalProps {
  open: boolean;
  initialStage?: PipelineStage;
  onClose: () => void;
  onCreated?: () => void;
}

export default function NewLeadModal({
  open,
  initialStage = "prospecto",
  onClose,
  onCreated,
}: NewLeadModalProps) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [sector, setSector] = useState("");
  const [type, setType] = useState<ClientType>("gp");
  const [value, setValue] = useState("");
  const [source, setSource] = useState<LeadSource>("manual");
  const [referrerName, setReferrerName] = useState("");
  const [note, setNote] = useState("");
  const [stage, setStage] = useState<PipelineStage>(initialStage);

  if (!open) return null;

  // En prospección y contactado el valor todavía no se cotiza —
  // recién en "propuesta" se define el monto.
  const valueRequired = stage === "propuesta" || stage === "negociacion" || stage === "cerrado";
  const canSubmit =
    name.trim() && company.trim() && (!valueRequired || Number(value) > 0);

  async function handleSubmit() {
    if (!canSubmit) return;

    await addLead({
      name: name.trim(),
      company: company.trim(),
      sector: sector.trim() || "—",
      type,
      value: valueRequired ? Number(value) : 0,
      source,
      note: note.trim() || undefined,
      stage,
      referrerName: source === "referido" && referrerName.trim()
        ? referrerName.trim()
        : null,
    });

    setName("");
    setCompany("");
    setSector("");
    setValue("");
    setNote("");
    setReferrerName("");
    onClose();
    onCreated?.();
  }

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={styles.modal} style={{ maxWidth: 560 }}>
        <button className={styles.close} onClick={onClose}>
          ×
        </button>

        <div className={styles.eyebrow}>Pipeline · Nuevo lead</div>
        <h2 className={styles.title}>Agregar lead</h2>
        <p className={styles.sub}>
          Cargá un prospecto manualmente. También podés lanzar una campaña de
          prospección para que el agente los traiga solo.
        </p>

        <div className={styles.field}>
          <label>Contacto</label>
          <input
            placeholder="Ej: Mariana Cabrera"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div className={styles.fieldGrid2}>
          <div className={styles.field}>
            <label>Empresa</label>
            <input
              placeholder="Ej: ShopLatam"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label>Sector · País</label>
            <input
              placeholder="Ej: eCommerce · UY"
              value={sector}
              onChange={(e) => setSector(e.target.value)}
            />
          </div>
        </div>

        <div className={valueRequired ? styles.fieldGrid3 : styles.fieldGrid2}>
          <div className={styles.field}>
            <label>Tipo</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as ClientType)}
            >
              <option value="gp">Growth Partner</option>
              <option value="dev">Desarrollo</option>
            </select>
          </div>
          {valueRequired && (
            <div className={styles.field}>
              <label>Valor (USD/mes)</label>
              <input
                type="number"
                placeholder="3500"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
          )}
          <div className={styles.field}>
            <label>Fuente</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as LeadSource)}
            >
              <option value="referido">Referido</option>
              <option value="sitio_web">Sitio web</option>
              <option value="redes_sociales">Redes sociales</option>
              <option value="eventos">Eventos</option>
              <option value="linkedin">LinkedIn</option>
              <option value="email">Email</option>
              <option value="manual">Manual</option>
              <option value="otro">Otro</option>
            </select>
          </div>
        </div>
        {source === "referido" && (
          <div className={styles.field}>
            <label>Referido por</label>
            <input
              placeholder="Ej: Juan Pérez (cliente actual)"
              value={referrerName}
              onChange={(e) => setReferrerName(e.target.value)}
            />
          </div>
        )}
        {!valueRequired && (
          <div
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              marginTop: -6,
              marginBottom: 16,
              padding: "8px 12px",
              background: "rgba(59,130,246,0.06)",
              borderLeft: "2px solid #3B82F6",
              borderRadius: 4,
            }}
          >
            En esta etapa no se carga cotización todavía. El valor se
            define cuando el lead llega a <strong>Propuesta</strong>.
          </div>
        )}

        <div className={styles.field}>
          <label>Etapa inicial</label>
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value as PipelineStage)}
          >
            <option value="prospecto">Prospección</option>
            <option value="contacto">Contactado</option>
            <option value="propuesta">Propuesta</option>
            <option value="negociacion">Negociación</option>
            <option value="cerrado">Cerrado</option>
          </select>
        </div>

        <div className={styles.field}>
          <label>Nota interna</label>
          <textarea
            rows={3}
            placeholder="Contexto, referido por, próximos pasos…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div className={styles.actions}>
          <button className={styles.btnGhost} onClick={onClose}>
            Cancelar
          </button>
          <button
            className={styles.btnSolid}
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            Agregar lead →
          </button>
        </div>
      </div>
    </div>
  );
}
