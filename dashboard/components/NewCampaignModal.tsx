"use client";

import { useState } from "react";
import { addCampaign } from "@/lib/storage";
import styles from "./NewClientModal.module.css";

interface NewCampaignModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export default function NewCampaignModal({
  open,
  onClose,
  onCreated,
}: NewCampaignModalProps) {
  const [name, setName] = useState("");
  const [country, setCountry] = useState("Uruguay");
  const [role, setRole] = useState("");
  const [ageRange, setAgeRange] = useState("30-50 años");
  const [industry, setIndustry] = useState("");
  const [companySize, setCompanySize] = useState("10-50 empleados");
  const [channels, setChannels] = useState<string[]>(["LinkedIn", "Email"]);

  if (!open) return null;

  const canSubmit = name.trim() && role.trim() && industry.trim();

  function toggleChannel(ch: string) {
    setChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch],
    );
  }

  async function handleSubmit() {
    if (!canSubmit) return;

    await addCampaign({
      name: name.trim(),
      country,
      demographics: `${role} · ${ageRange}`,
      clientType: `${industry} · ${companySize}`,
      channels,
      status: "active",
    });

    setName("");
    setRole("");
    setIndustry("");
    onClose();
    onCreated?.();
  }

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={styles.modal}>
        <button className={styles.close} onClick={onClose}>
          ×
        </button>

        <div className={styles.eyebrow}>
          Campaña de prospección · Agente automático
        </div>
        <h2 className={styles.title}>Definir ICP</h2>
        <p className={styles.sub}>
          El agente busca leads que matcheen estos criterios en LinkedIn y
          bases de datos, y los contacta automáticamente.
        </p>

        <div className={styles.field}>
          <label>Nombre de la campaña</label>
          <input
            placeholder="Ej: Retailers eCommerce UY · Q2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div className={styles.sectionLabel}>Geografía</div>
        <div className={styles.field}>
          <label>País / Región</label>
          <select value={country} onChange={(e) => setCountry(e.target.value)}>
            <option>Uruguay</option>
            <option>Argentina</option>
            <option>Chile</option>
            <option>Paraguay</option>
            <option>LATAM completo</option>
            <option>España</option>
            <option>México</option>
          </select>
        </div>

        <div className={styles.sectionLabel}>Demografía del decisor</div>
        <div className={styles.fieldGrid2}>
          <div className={styles.field}>
            <label>Rol / cargo</label>
            <input
              placeholder="CEO, Founder, CMO, Growth Lead"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label>Rango de edad</label>
            <select
              value={ageRange}
              onChange={(e) => setAgeRange(e.target.value)}
            >
              <option>25-40 años</option>
              <option>30-50 años</option>
              <option>35-55 años</option>
              <option>Sin restricción</option>
            </select>
          </div>
        </div>

        <div className={styles.sectionLabel}>Tipo de empresa</div>
        <div className={styles.fieldGrid2}>
          <div className={styles.field}>
            <label>Industria / sector</label>
            <input
              placeholder="Ej: eCommerce, SaaS B2B, Salud"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label>Tamaño</label>
            <select
              value={companySize}
              onChange={(e) => setCompanySize(e.target.value)}
            >
              <option>1-10 empleados</option>
              <option>10-50 empleados</option>
              <option>50-200 empleados</option>
              <option>200+ empleados</option>
            </select>
          </div>
        </div>

        <div className={styles.sectionLabel}>Canales</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {["LinkedIn", "Email", "Cold call"].map((ch) => {
            const active = channels.includes(ch);
            return (
              <button
                key={ch}
                type="button"
                onClick={() => toggleChannel(ch)}
                style={{
                  padding: "10px 16px",
                  border: `2px solid ${
                    active ? "var(--sand)" : "rgba(10,26,12,0.1)"
                  }`,
                  background: active ? "var(--off-white)" : "var(--white)",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  color: "var(--deep-green)",
                }}
              >
                {active ? "✓ " : ""}
                {ch}
              </button>
            );
          })}
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
            Lanzar campaña →
          </button>
        </div>
      </div>
    </div>
  );
}
