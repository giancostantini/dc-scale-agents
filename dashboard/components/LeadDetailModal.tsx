"use client";

/**
 * Ficha del prospecto — se abre al clickear una card del kanban.
 *
 * Junta todo lo necesario para escribirle y mandar una propuesta: qué
 * ofrecen, desde cuándo, qué piden, y a dónde contactarlos.
 *
 * El bloque de contacto es EDITABLE a propósito: lo que las fuentes
 * públicas consiguen es contacto de empresa (info@, teléfono de la web),
 * casi nunca el mail del decisor. Ese lo pega una persona acá, y recién ahí
 * se habilita el envío por email de la cola.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { updateLeadContact } from "@/lib/storage";
import { agoFromDate } from "@/lib/relative-time";
import { jobOffer } from "@/lib/lead-display";
import type { Lead } from "@/lib/types";
import styles from "./NewClientModal.module.css";

interface Props {
  lead: Lead | null;
  onClose: () => void;
  /** refresh() del pipeline — se llama al guardar. */
  onSaved: () => void;
  onQuote: (lead: Lead) => void;
  onLost: (lead: Lead) => void;
  onMoveStage: (lead: Lead, dir: 1 | -1) => void;
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 10,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  fontWeight: 600,
  color: "var(--sand-dark)",
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  fontSize: 13,
  border: "1px solid rgba(10,26,12,0.15)",
  borderRadius: 6,
  fontFamily: "inherit",
};

export default function LeadDetailModal({
  lead,
  onClose,
  onSaved,
  onQuote,
  onLost,
  onMoveStage,
}: Props) {
  const router = useRouter();
  const [form, setForm] = useState({
    contactRole: "",
    contactEmail: "",
    contactPhone: "",
    companyEmail: "",
    companyWebsite: "",
    linkedinUrl: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  // Por id, no por objeto: el padre re-resuelve el lead en cada render y
  // un efecto por referencia se dispararía en cada refresh pisando lo
  // que el usuario está tipeando.
  const leadId = lead?.id ?? null;
  useEffect(() => {
    if (!lead) return;
    setForm({
      contactRole: lead.contactRole ?? "",
      contactEmail: lead.contactEmail ?? "",
      contactPhone: lead.contactPhone ?? "",
      companyEmail: lead.companyEmail ?? "",
      companyWebsite: lead.companyWebsite ?? "",
      linkedinUrl: lead.linkedinUrl ?? "",
    });
    setError("");
    setCopied(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  if (!lead) return null;

  const offer = jobOffer(lead);
  const posted = agoFromDate(lead.postedAt) ?? lead.postedAtText ?? null;
  const nn = (s: string) => s.trim() || null;

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* el navegador puede bloquearlo; no es crítico */
    }
  }

  async function save() {
    if (!lead) return;
    setSaving(true);
    setError("");
    try {
      await updateLeadContact(lead.id, {
        contactRole: nn(form.contactRole),
        contactEmail: nn(form.contactEmail),
        contactPhone: nn(form.contactPhone),
        companyEmail: nn(form.companyEmail),
        companyWebsite: nn(form.companyWebsite),
        linkedinUrl: nn(form.linkedinUrl),
        touchEnrichedAt: true,
      });
      onSaved();
    } catch (e) {
      // Si falta la migración 101 esto es un error de columna inexistente:
      // que se vea, no que se pierda en la consola.
      setError(
        (e as { message?: string })?.message ??
          "No se pudo guardar el contacto.",
      );
    } finally {
      setSaving(false);
    }
  }

  const tieneAviso = Boolean(
    lead.sourceUrl || offer || posted || lead.roleRequirements,
  );

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={styles.modal} style={{ maxWidth: 660, padding: 36 }}>
        <button className={styles.close} onClick={onClose} aria-label="Cerrar">
          ×
        </button>

        {/* ===== Cabecera ===== */}
        <div className={styles.eyebrow}>
          {lead.type === "gp" ? "Growth Partner" : "Desarrollo"}
          {lead.score != null ? ` · fit ${lead.score}/5` : ""}
        </div>
        <h2 className={styles.title}>{lead.company}</h2>
        <p className={styles.sub}>
          {offer ? `Buscan: ${offer}` : lead.name}
          {lead.sector && lead.sector !== "—" ? ` · ${lead.sector}` : ""}
          {lead.jobLocation ? ` · ${lead.jobLocation}` : ""}
        </p>

        {/* ===== El aviso ===== */}
        {tieneAviso && (
          <>
            <div className={styles.sectionLabel}>El aviso</div>
            {posted && (
              <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 8px" }}>
                Publicado {posted}
                {lead.postedAt ? "" : " (según el aviso)"}
              </p>
            )}
            {lead.roleRequirements && (
              <p style={{ fontSize: 13, lineHeight: 1.6, margin: "0 0 10px" }}>
                {lead.roleRequirements}
              </p>
            )}
            {lead.sourceUrl && (
              <p style={{ margin: "0 0 18px" }}>
                <a
                  href={lead.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 12.5, color: "var(--deep-green)" }}
                >
                  Ver el aviso original ↗
                </a>
              </p>
            )}
          </>
        )}

        {/* ===== Contacto ===== */}
        <div className={styles.sectionLabel}>Contacto</div>
        <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "0 0 12px", lineHeight: 1.55 }}>
          Lo que se consigue de fuentes públicas es contacto de empresa. El
          <strong> email del decisor</strong> es el único que habilita el envío
          automático de la cola — si lo conseguís, pegalo acá.
        </p>

        <div className={styles.fieldGrid2}>
          <div className={styles.field}>
            <label style={labelStyle}>Persona · cargo</label>
            <input
              style={inputStyle}
              value={form.contactRole}
              placeholder="Ej: Gerente de Marketing"
              onChange={(e) => setForm({ ...form, contactRole: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label style={labelStyle}>Email del decisor</label>
            <input
              style={inputStyle}
              value={form.contactEmail}
              placeholder="habilita el envío por email"
              onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label style={labelStyle}>Teléfono</label>
            <input
              style={inputStyle}
              value={form.contactPhone}
              onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label style={labelStyle}>Casilla de la empresa</label>
            <input
              style={inputStyle}
              value={form.companyEmail}
              placeholder="info@ · rrhh@ — no se usa para enviar"
              onChange={(e) => setForm({ ...form, companyEmail: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label style={labelStyle}>Web</label>
            <input
              style={inputStyle}
              value={form.companyWebsite}
              onChange={(e) => setForm({ ...form, companyWebsite: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label style={labelStyle}>LinkedIn</label>
            <input
              style={inputStyle}
              value={form.linkedinUrl}
              onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })}
            />
          </div>
        </div>

        {/* Atajos sobre lo YA guardado */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          {lead.contactEmail && (
            <a href={`mailto:${lead.contactEmail}`} className={styles.btnGhost} style={{ textDecoration: "none" }}>
              ✉ Escribir
            </a>
          )}
          {lead.contactPhone && (
            <a href={`tel:${lead.contactPhone.replace(/\s/g, "")}`} className={styles.btnGhost} style={{ textDecoration: "none" }}>
              ☎ Llamar
            </a>
          )}
          {lead.companyWebsite && (
            <a href={lead.companyWebsite} target="_blank" rel="noopener noreferrer" className={styles.btnGhost} style={{ textDecoration: "none" }}>
              Ver web ↗
            </a>
          )}
          {(lead.companyEmail || lead.contactEmail) && (
            <button
              type="button"
              className={styles.btnGhost}
              onClick={() => copy((lead.contactEmail || lead.companyEmail)!, "mail")}
            >
              {copied === "mail" ? "✓ Copiado" : "Copiar email"}
            </button>
          )}
        </div>

        {lead.enrichedAt && (
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 10 }}>
            Contacto completado {agoFromDate(lead.enrichedAt.slice(0, 10)) ?? "—"} ·
            origen: {lead.enrichmentSource ?? "—"}
          </p>
        )}
        {error && (
          <p style={{ fontSize: 12, color: "#B91C1C", marginTop: 10 }}>⚠ {error}</p>
        )}

        {/* ===== Por qué es candidata ===== */}
        {lead.note && (
          <>
            <div className={styles.sectionLabel}>Por qué es candidata</div>
            <p style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.6, margin: 0 }}>
              {lead.note}
            </p>
          </>
        )}

        {/* ===== Acciones ===== */}
        <div className={styles.actions} style={{ flexWrap: "wrap", gap: 8 }}>
          <button
            className={styles.btnGhost}
            onClick={() => router.push(`/pipeline/mensajes?lead=${lead.id}`)}
          >
            Ver mensaje
          </button>
          <button className={styles.btnGhost} onClick={() => onQuote(lead)}>
            Cotizar
          </button>
          <button className={styles.btnGhost} onClick={() => onMoveStage(lead, 1)}>
            Avanzar etapa →
          </button>
          <button
            className={styles.btnGhost}
            style={{ color: "#B91C1C" }}
            onClick={() => onLost(lead)}
          >
            Marcar perdido
          </button>
          <button className={styles.btnSolid} onClick={save} disabled={saving}>
            {saving ? "Guardando…" : "Guardar contacto"}
          </button>
        </div>
      </div>
    </div>
  );
}
