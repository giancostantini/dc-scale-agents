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
  // Tramos escalonados: el primero suele ser el "piso" y los siguientes
  // se activan si el negocio escala (ej: 15% si crece 30%, 20% si crece 50%, etc.)
  const [variableTiers, setVariableTiers] = useState<string[]>([
    "15% sobre revenue growth si supera 30%",
  ]);
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
        feeVariable: hasVariable
          ? variableTiers
              .map((t) => t.trim())
              .filter(Boolean)
              .join(" · ") || undefined
          : undefined,
      });

      // Fire-and-forget: scaffold the vault folder in the background. The
      // dashboard doesn't wait for the GitHub workflow to finish — the user
      // sees the client immediately and gets a notification when the vault
      // is ready.
      fetch("/api/clients/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: newClient.id,
          name: newClient.name,
          sector: sector.trim(),
          country,
          type,
          fee: Number(fee),
          method,
          phase: newClient.phase,
        }),
      }).catch((err) => console.error("bootstrap dispatch failed:", err));

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
    setVariableTiers(["15% sobre revenue growth si supera 30%"]);
    setType("gp");
  }

  function updateTier(idx: number, value: string) {
    setVariableTiers((prev) => prev.map((t, i) => (i === idx ? value : t)));
  }

  function addTier() {
    setVariableTiers((prev) => [...prev, ""]);
  }

  function removeTier(idx: number) {
    setVariableTiers((prev) =>
      prev.length === 1 ? prev : prev.filter((_, i) => i !== idx),
    );
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
            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  marginBottom: 12,
                  lineHeight: 1.5,
                }}
              >
                Definí uno o más tramos escalonados. Si el negocio crece, suma
                tramos extra (ej: 15% al superar 30%, 20% al superar 50%).
              </div>

              {variableTiers.map((tier, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 10,
                    paddingBottom: 8,
                    borderBottom: "1px solid rgba(10,26,12,0.08)",
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      color: "var(--sand-dark)",
                      fontWeight: 600,
                      minWidth: 56,
                    }}
                  >
                    Tramo {idx + 1}
                  </span>
                  <input
                    style={{
                      flex: 1,
                      background: "transparent",
                      border: "none",
                      borderBottom: "1px solid rgba(10,26,12,0.15)",
                      padding: "10px 0",
                      color: "var(--deep-green)",
                      fontSize: 14,
                      fontWeight: 300,
                      outline: "none",
                      fontFamily: "inherit",
                    }}
                    placeholder={
                      idx === 0
                        ? "Ej: 15% sobre revenue growth si supera 30%"
                        : idx === 1
                        ? "Ej: 20% sobre revenue growth si supera 50%"
                        : "Ej: 25% sobre revenue growth si supera 80%"
                    }
                    value={tier}
                    onChange={(e) => updateTier(idx, e.target.value)}
                  />
                  {variableTiers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTier(idx)}
                      title="Quitar tramo"
                      style={{
                        width: 28,
                        height: 28,
                        border: "1px solid rgba(176,75,58,0.2)",
                        background: "transparent",
                        color: "var(--red-warn)",
                        cursor: "pointer",
                        fontSize: 14,
                        fontFamily: "inherit",
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}

              <button
                type="button"
                onClick={addTier}
                style={{
                  marginTop: 6,
                  padding: "8px 14px",
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                  color: "var(--deep-green)",
                  background: "var(--off-white)",
                  border: "1px dashed var(--sand)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                + Agregar tramo escalado
              </button>
            </div>
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
