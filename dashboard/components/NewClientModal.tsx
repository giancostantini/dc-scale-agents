"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addClient } from "@/lib/storage";
import styles from "./NewClientModal.module.css";

interface NewClientModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export default function NewClientModal({
  open,
  onClose,
  onCreated,
}: NewClientModalProps) {
  const router = useRouter();

  const [type, setType] = useState<"gp" | "dev">("gp");
  const [name, setName] = useState("");
  const [sector, setSector] = useState("");
  const [country, setCountry] = useState("Uruguay");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [fee, setFee] = useState("");
  const [method, setMethod] = useState("Método completo");
  const [hasVariable, setHasVariable] = useState(false);
  const [variableType, setVariableType] = useState("20% sobre ROAS > 4x");
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const canSubmit = name.trim() && sector.trim() && fee.trim() && Number(fee) > 0;

  async function handleSubmit() {
    if (!canSubmit || saving) return;
    setSaving(true);
    try {
      const newClient = await addClient({
        name: name.trim(),
        sector: sector.trim(),
        country,
        type,
        fee: Number(fee),
        method,
        contactName,
        contactEmail,
        contactPhone,
        feeVariable: hasVariable ? variableType : undefined,
      });
      reset();
      onClose();
      onCreated?.();
      router.push(`/cliente/${newClient.id}`);
    } catch (err) {
      console.error(err);
      alert("Error al crear cliente. Revisá la consola.");
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setName("");
    setSector("");
    setCountry("Uruguay");
    setContactName("");
    setContactEmail("");
    setContactPhone("");
    setFee("");
    setMethod("Método completo");
    setHasVariable(false);
    setType("gp");
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

        <div className={styles.eyebrow}>Onboarding de cliente</div>
        <h2 className={styles.title}>Nuevo cliente</h2>
        <p className={styles.sub}>
          Lo básico para arrancar. El kickoff completo, branding y objetivos se
          cargan después desde la pantalla del cliente.
        </p>

        {/* TIPO DE SERVICIO */}
        <div className={styles.sectionLabel}>Tipo de servicio</div>
        <div className={styles.serviceSelector}>
          <button
            type="button"
            className={`${styles.serviceOption} ${
              type === "gp" ? styles.serviceSelected : ""
            }`}
            onClick={() => setType("gp")}
          >
            <div className={styles.sName}>Growth Partner</div>
            <div className={styles.sDesc}>
              Marketing digital · Ads · Contenido · SEO · Analítica.
            </div>
          </button>
          <button
            type="button"
            className={`${styles.serviceOption} ${
              type === "dev" ? styles.serviceSelected : ""
            }`}
            onClick={() => setType("dev")}
          >
            <div className={styles.sName}>Desarrollo</div>
            <div className={styles.sDesc}>
              IA a medida · Chatbots · Automatización · Analytics/BI.
            </div>
          </button>
        </div>

        {/* DATOS */}
        <div className={styles.field}>
          <label>Nombre del cliente</label>
          <input
            placeholder="Ej: RealValue Propiedades"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div className={styles.fieldGrid2}>
          <div className={styles.field}>
            <label>Sector / industria</label>
            <input
              placeholder="Real Estate · eCommerce · Salud"
              value={sector}
              onChange={(e) => setSector(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label>País</label>
            <select value={country} onChange={(e) => setCountry(e.target.value)}>
              <option>Uruguay</option>
              <option>Argentina</option>
              <option>Chile</option>
              <option>Paraguay</option>
              <option>España</option>
              <option>México</option>
              <option>Otro</option>
            </select>
          </div>
        </div>

        {/* CONTACTO */}
        <div className={styles.sectionLabel}>Contacto principal</div>
        <div className={styles.fieldGrid3}>
          <div className={styles.field}>
            <label>Nombre</label>
            <input
              placeholder="María González"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label>Email</label>
            <input
              type="email"
              placeholder="contacto@empresa.com"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label>Teléfono</label>
            <input
              placeholder="+598..."
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
            />
          </div>
        </div>

        {/* CONTRATO */}
        <div className={styles.sectionLabel}>Contrato</div>
        <div className={styles.fieldGrid2}>
          <div className={styles.field}>
            <label>Fee mensual (USD)</label>
            <input
              type="number"
              placeholder="3500"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label>Método / modalidad</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option>Método completo</option>
              <option>Solo Ads</option>
              <option>eCommerce full</option>
              <option>Contenido + SEO</option>
              <option>Generación de leads</option>
              <option>Personalizado</option>
            </select>
          </div>
        </div>

        <div className={styles.field}>
          <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="checkbox"
              checked={hasVariable}
              onChange={(e) => setHasVariable(e.target.checked)}
              style={{ width: "auto" }}
            />
            <span>Fee variable por resultados</span>
          </label>
          {hasVariable && (
            <input
              style={{ marginTop: 12 }}
              placeholder="Ej: 15% sobre revenue growth · $50 por lead calificado"
              value={variableType}
              onChange={(e) => setVariableType(e.target.value)}
            />
          )}
        </div>

        {/* ACCIONES */}
        <div className={styles.actions}>
          <button className={styles.btnGhost} onClick={onClose}>
            Cancelar
          </button>
          <button
            className={styles.btnSolid}
            onClick={handleSubmit}
            disabled={!canSubmit || saving}
          >
            {saving ? "Creando…" : "Crear cliente →"}
          </button>
        </div>
      </div>
    </div>
  );
}
