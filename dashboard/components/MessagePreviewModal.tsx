"use client";

import { useState, useEffect } from "react";
import type { ProspectCampaign } from "@/lib/types";
import styles from "./NewClientModal.module.css";

interface Props {
  open: boolean;
  campaign: ProspectCampaign | null;
  onClose: () => void;
}

// Ejemplos sintéticos de nombres/empresas que matchean típicamente el ICP LATAM
const EXAMPLE_PROSPECTS = [
  { name: "Mariana Cabrera", company: "ShopLatam", sector: "eCommerce" },
  { name: "Pablo Giménez", company: "TiendaPremium",  sector: "Retail" },
  { name: "Julieta Morales", company: "AgroMax", sector: "AgroTech" },
  { name: "Sebastián Rodríguez", company: "HealthPro Clínicas", sector: "Salud" },
  { name: "Lucía Vázquez", company: "NutriLife", sector: "eCommerce / Salud" },
];

export default function MessagePreviewModal({
  open,
  campaign,
  onClose,
}: Props) {
  // Lead de prueba (editable)
  const [leadName, setLeadName] = useState("");
  const [leadCompany, setLeadCompany] = useState("");
  const [leadRole, setLeadRole] = useState("");
  const [leadSector, setLeadSector] = useState("");
  const [leadNotes, setLeadNotes] = useState("");

  // Canal
  const [channel, setChannel] = useState<"linkedin" | "email">("linkedin");

  // Resultado
  const [generating, setGenerating] = useState(false);
  const [subject, setSubject] = useState<string | undefined>();
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [usage, setUsage] = useState<{
    input: number;
    output: number;
    cacheCreation: number;
    cacheRead: number;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Pre-fill cuando abre con ejemplo basado en el ICP
  useEffect(() => {
    if (!open || !campaign) return;

    // Tomar uno random de los ejemplos
    const ex = EXAMPLE_PROSPECTS[
      Math.floor(Math.random() * EXAMPLE_PROSPECTS.length)
    ];
    setLeadName(ex.name);
    setLeadCompany(ex.company);
    setLeadRole(campaign.roles[0] || "CEO");
    setLeadSector(campaign.industries[0] || ex.sector);
    setLeadNotes("");
    setMessage("");
    setSubject(undefined);
    setError("");
    setUsage(null);
    setCopied(false);
  }, [open, campaign]);

  if (!open || !campaign) return null;

  async function generate() {
    if (!campaign) return;
    setGenerating(true);
    setError("");
    setMessage("");
    setSubject(undefined);

    try {
      const res = await fetch("/api/generate-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign: {
            name: campaign.name,
            countries: campaign.countries,
            regions: campaign.regions,
            industries: campaign.industries,
            companySizeMin: campaign.companySizeMin,
            companySizeMax: campaign.companySizeMax,
            revenueRange: campaign.revenueRange,
            buyingSignals: campaign.buyingSignals,
            roles: campaign.roles,
            seniorities: campaign.seniorities,
            cta: campaign.cta,
            ctaUrl: campaign.ctaUrl,
            messageTone: campaign.messageTone,
            valueAngle: campaign.valueAngle,
          },
          lead: {
            name: leadName.trim(),
            company: leadCompany.trim(),
            role: leadRole.trim() || undefined,
            sector: leadSector.trim() || undefined,
            notes: leadNotes.trim() || undefined,
          },
          channel,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error generando el mensaje");
        return;
      }

      setMessage(data.message || "");
      setSubject(data.subject);
      setUsage(data.usage);
    } catch (e) {
      console.error(e);
      setError("Error de red. Revisá la consola.");
    } finally {
      setGenerating(false);
    }
  }

  async function copyToClipboard() {
    const textToCopy =
      channel === "email" && subject
        ? `Asunto: ${subject}\n\n${message}`
        : message;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: nothing
    }
  }

  const canGenerate = leadName.trim() && leadCompany.trim() && !generating;

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={styles.modal} style={{ maxWidth: 820 }}>
        <button className={styles.close} onClick={onClose}>×</button>

        <div className={styles.eyebrow}>
          ⚡ Agente Creativo · Preview
        </div>
        <h2 className={styles.title}>{campaign.name}</h2>
        <p className={styles.sub}>
          Simulá el mensaje que enviaría el agente a un prospecto que matchee
          este ICP. Usá esto para iterar el tono antes de conectar Apollo.
        </p>

        {/* Selector de canal */}
        <div className={styles.sectionLabel}>Canal</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          {[
            { value: "linkedin" as const, label: "LinkedIn · First-touch", desc: "Máx 300 chars, conversacional" },
            { value: "email" as const,    label: "Email · Cold outbound",  desc: "Subject + body (máx 120 palabras)" },
          ].map((opt) => {
            const active = channel === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setChannel(opt.value)}
                style={{
                  padding: 16,
                  border: `2px solid ${active ? "var(--sand)" : "rgba(10,26,12,0.1)"}`,
                  background: active ? "var(--off-white)" : "var(--white)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  {opt.label}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {opt.desc}
                </div>
              </button>
            );
          })}
        </div>

        {/* Lead de prueba */}
        <div className={styles.sectionLabel}>Prospecto de prueba</div>
        <div className={styles.fieldGrid2}>
          <div className={styles.field}>
            <label>Nombre</label>
            <input
              value={leadName}
              onChange={(e) => setLeadName(e.target.value)}
              placeholder="Ej: Mariana Cabrera"
            />
          </div>
          <div className={styles.field}>
            <label>Empresa</label>
            <input
              value={leadCompany}
              onChange={(e) => setLeadCompany(e.target.value)}
              placeholder="Ej: ShopLatam"
            />
          </div>
          <div className={styles.field}>
            <label>Rol</label>
            <input
              value={leadRole}
              onChange={(e) => setLeadRole(e.target.value)}
              placeholder="Ej: CEO"
            />
          </div>
          <div className={styles.field}>
            <label>Sector</label>
            <input
              value={leadSector}
              onChange={(e) => setLeadSector(e.target.value)}
              placeholder="Ej: eCommerce"
            />
          </div>
        </div>

        <div className={styles.field}>
          <label>Notas / señales observables (opcional)</label>
          <textarea
            rows={2}
            value={leadNotes}
            onChange={(e) => setLeadNotes(e.target.value)}
            placeholder="Ej: Acaban de abrir una sucursal en Buenos Aires. Publicaron que están contratando equipo de growth."
            style={{ resize: "vertical" }}
          />
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 8, marginBottom: 20 }}>
          <button
            className={styles.btnSolid}
            onClick={generate}
            disabled={!canGenerate}
          >
            {generating ? "Generando…" : message ? "↻ Regenerar" : "Generar mensaje →"}
          </button>
          {message && (
            <button
              className={styles.btnGhost}
              onClick={copyToClipboard}
            >
              {copied ? "✓ Copiado" : "📋 Copiar"}
            </button>
          )}
        </div>

        {error && (
          <div
            style={{
              padding: 14,
              background: "rgba(176,75,58,0.1)",
              borderLeft: "3px solid var(--red-warn)",
              color: "var(--red-warn)",
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Mensaje generado */}
        {(message || generating) && (
          <>
            <div className={styles.sectionLabel}>
              {generating ? "Generando con Claude Opus 4.7…" : "Mensaje generado"}
            </div>
            <div
              style={{
                background: "var(--deep-green)",
                color: "var(--off-white)",
                padding: 24,
                borderLeft: "3px solid var(--sand)",
                fontSize: 14,
                lineHeight: 1.7,
                fontFamily: "inherit",
                whiteSpace: "pre-wrap",
                minHeight: 80,
              }}
            >
              {generating && !message && (
                <div style={{ color: "rgba(232,228,220,0.5)", fontStyle: "italic" }}>
                  Pensando…
                </div>
              )}
              {channel === "email" && subject && (
                <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid rgba(196,168,130,0.2)" }}>
                  <span style={{ fontSize: 11, letterSpacing: "0.15em", color: "var(--sand)", textTransform: "uppercase", fontWeight: 600 }}>
                    Asunto
                  </span>
                  <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>
                    {subject}
                  </div>
                </div>
              )}
              {message}
            </div>

            {/* Métricas de tokens */}
            {usage && (
              <div
                style={{
                  marginTop: 12,
                  padding: "10px 14px",
                  background: "var(--off-white)",
                  fontSize: 11,
                  color: "var(--text-muted)",
                  display: "flex",
                  gap: 18,
                  fontFamily: "var(--font-dm-sans, monospace)",
                  letterSpacing: "0.02em",
                }}
              >
                <span>Input: {usage.input}t</span>
                <span>Output: {usage.output}t</span>
                {usage.cacheRead > 0 && (
                  <span style={{ color: "var(--green-ok)" }}>
                    Cache hit: {usage.cacheRead}t ← reutilizó voz de marca
                  </span>
                )}
                {usage.cacheCreation > 0 && (
                  <span style={{ color: "var(--sand-dark)" }}>
                    Cache write: {usage.cacheCreation}t
                  </span>
                )}
              </div>
            )}
          </>
        )}

        <div
          style={{
            marginTop: 20,
            padding: 12,
            background: "var(--off-white)",
            borderLeft: "3px solid var(--sand-dark)",
            fontSize: 11,
            color: "var(--text-muted)",
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: "var(--deep-green)" }}>💡 Tip:</strong>{" "}
          Regenerá varias veces con distintos leads de prueba. Si el tono no
          matchea lo que querés, edití el <strong>"Ángulo de valor"</strong> en
          la campaña — ahí está el gancho principal que guía al agente.
        </div>

        <div className={styles.actions}>
          <button className={styles.btnGhost} onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
