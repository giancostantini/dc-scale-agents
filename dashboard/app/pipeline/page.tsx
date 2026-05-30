"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import Topbar from "@/components/Topbar";
import NewLeadModal from "@/components/NewLeadModal";
import NewCampaignModal from "@/components/NewCampaignModal";
import MessagePreviewModal from "@/components/MessagePreviewModal";
import {
  getLeads,
  getLostLeads,
  getCampaigns,
  updateLeadStage,
  updateLeadValue,
  markLeadLost,
  restoreLead,
  deleteLead,
  deleteCampaign,
} from "@/lib/storage";
import {
  hasSession,
  getCurrentProfile,
  hasPipelineAccess,
} from "@/lib/supabase/auth";
import type { Lead, LeadSource, PipelineStage, ProspectCampaign } from "@/lib/types";
import styles from "./pipeline.module.css";

const STAGES: { key: PipelineStage; label: string }[] = [
  { key: "prospecto", label: "Prospección" },
  { key: "contacto", label: "Contactado" },
  { key: "propuesta", label: "Propuesta" },
  { key: "negociacion", label: "Negociación" },
  { key: "cerrado", label: "Cerrado" },
];

const STAGE_LABEL: Record<PipelineStage, string> = {
  prospecto: "Prospección",
  contacto: "Contactado",
  propuesta: "Propuesta",
  negociacion: "Negociación",
  cerrado: "Cerrado",
};

const SOURCE_LABEL: Record<LeadSource, string> = {
  linkedin: "LinkedIn",
  email: "Email",
  manual: "Manual",
  referido: "Referidos",
  sitio_web: "Sitio Web",
  redes_sociales: "Redes Sociales",
  eventos: "Eventos",
  otro: "Otros",
};

// Paleta navy/blue alineada al mockup contable
const STAGE_COLORS = [
  "#1E3A8A", // prospecto - navy
  "#3B82F6", // contacto - blue-500
  "#60A5FA", // propuesta - blue-400
  "#93C5FD", // negociacion - blue-300
  "#10B981", // cerrado - emerald (ganado)
];

const SOURCE_COLORS: Record<LeadSource, string> = {
  referido: "#1E3A8A",        // navy
  sitio_web: "#3B82F6",        // blue
  redes_sociales: "#A78BFA",   // violet
  eventos: "#60A5FA",          // sky
  otro: "#CBD5E1",             // slate light
  linkedin: "#0A66C2",
  email: "#9B8259",
  manual: "#7A8A7E",
};

/** Días en la etapa actual. Si no hay stage_changed_at usa createdAt. */
function daysInStage(lead: Lead): number {
  const ref = lead.stageChangedAt ?? lead.createdAt;
  const ms = Date.now() - new Date(ref).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

const STAGE_ALERT_THRESHOLD = 7; // días

export default function PipelinePage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [lostLeads, setLostLeads] = useState<Lead[]>([]);
  const [campaigns, setCampaigns] = useState<ProspectCampaign[]>([]);
  const [leadModal, setLeadModal] = useState<{
    open: boolean;
    stage: PipelineStage;
  }>({
    open: false,
    stage: "prospecto",
  });
  const [campaignModal, setCampaignModal] = useState(false);
  const [previewCampaign, setPreviewCampaign] = useState<ProspectCampaign | null>(null);

  // Modal: marcar lead como perdido
  const [lostModal, setLostModal] = useState<Lead | null>(null);
  const [lostReason, setLostReason] = useState("");

  // Modal: editar valor de cotización (cuando pasa a propuesta)
  const [valueModal, setValueModal] = useState<Lead | null>(null);
  const [valueInput, setValueInput] = useState("");

  // Toggle: ver perdidos
  const [showLostPanel, setShowLostPanel] = useState(false);

  const refresh = useCallback(() => {
    getLeads().then(setLeads);
    getLostLeads().then(setLostLeads);
    getCampaigns().then(setCampaigns);
  }, []);

  useEffect(() => {
    hasSession().then(async (has) => {
      if (!has) {
        router.replace("/");
        return;
      }
      // Gate: solo director y team con pipeline_access
      const profile = await getCurrentProfile();
      if (!hasPipelineAccess(profile)) {
        router.replace(profile?.role === "client" ? "/portal" : "/hub");
        return;
      }
      setAuthChecked(true);
      refresh();
    });
  }, [router, refresh]);

  if (!authChecked) return null;

  async function moveLead(lead: Lead, direction: 1 | -1) {
    const idx = STAGES.findIndex((s) => s.key === lead.stage);
    const next = idx + direction;
    if (next < 0 || next >= STAGES.length) return;
    const nextStage = STAGES[next].key;
    await updateLeadStage(lead.id, nextStage);
    // Cuando entra a "propuesta", abrir modal para definir el valor
    // si todavía no fue cotizado.
    if (direction === 1 && nextStage === "propuesta" && (!lead.value || lead.value === 0)) {
      setValueModal({ ...lead, stage: nextStage });
      setValueInput("");
    }
    refresh();
  }

  function openLostModal(lead: Lead) {
    setLostModal(lead);
    setLostReason("");
  }

  async function confirmLostLead() {
    if (!lostModal) return;
    await markLeadLost(
      lostModal.id,
      lostReason.trim() || null,
      lostModal.stage,
    );
    setLostModal(null);
    setLostReason("");
    refresh();
  }

  async function handleRestoreLead(id: string) {
    if (!confirm("¿Restaurar este lead al pipeline?")) return;
    await restoreLead(id);
    refresh();
  }

  async function handleDeleteLostLead(id: string) {
    if (!confirm("¿Eliminar definitivamente? Esta acción no se puede deshacer.")) return;
    await deleteLead(id);
    refresh();
  }

  async function saveLeadValue() {
    if (!valueModal) return;
    const n = Number(valueInput);
    if (!Number.isFinite(n) || n < 0) return;
    await updateLeadValue(valueModal.id, n);
    setValueModal(null);
    setValueInput("");
    refresh();
  }

  async function removeCampaign(id: string) {
    if (!confirm("¿Eliminar esta campaña de prospección?")) return;
    await deleteCampaign(id);
    refresh();
  }

  return (
    <>
      <Topbar showPrimary={false} searchPlaceholder="Buscar prospectos…" />

      <main className={styles.wrap}>
        <div className={styles.sectionHead}>
          <div>
            <div className={styles.eyebrow}>CRM · Pipeline con agente de prospección</div>
            <h1>
              Captación <span className="amp">&</span> ventas
            </h1>
          </div>
        </div>

        {/* ============ ESTADÍSTICAS ============ */}
        <PipelineStats leads={leads} />

        {/* ============ KANBAN ============ */}
        <div className={styles.kanbanHeader} style={{ marginTop: 36 }}>
          <h2>Pipeline · Kanban</h2>
        </div>

        <div className={styles.kanban}>
          {STAGES.map((stage) => {
            const stageLeads = leads.filter((l) => l.stage === stage.key);
            return (
              <div key={stage.key} className={styles.kanbanCol}>
                <div className={styles.kanbanColHead}>
                  <div className={styles.kanbanColName}>{stage.label}</div>
                  <div className={styles.kanbanColCount}>
                    {stageLeads.length}
                  </div>
                </div>

                {stageLeads.map((lead) => {
                  const idx = STAGES.findIndex((s) => s.key === lead.stage);
                  const ageDays = daysInStage(lead);
                  const stale = ageDays >= STAGE_ALERT_THRESHOLD;
                  // El value solo se muestra en propuesta/negociacion/cerrado
                  const showValue =
                    lead.stage === "propuesta" ||
                    lead.stage === "negociacion" ||
                    lead.stage === "cerrado";
                  return (
                    <div
                      key={lead.id}
                      className={`${styles.kanbanCard} ${
                        lead.type === "dev" ? styles.kanbanCardDev : ""
                      }`}
                      style={{
                        position: "relative",
                        borderLeft: stale
                          ? "3px solid #F87171"
                          : undefined,
                      }}
                    >
                      {stale && (
                        <div
                          style={{
                            position: "absolute",
                            top: 8,
                            right: 8,
                            fontSize: 9,
                            fontWeight: 700,
                            background: "rgba(248,113,113,0.12)",
                            color: "#B91C1C",
                            padding: "2px 6px",
                            borderRadius: 999,
                            letterSpacing: "0.05em",
                            textTransform: "uppercase",
                          }}
                          title={`Lleva ${ageDays} días en ${STAGE_LABEL[lead.stage]} — pasó el umbral de ${STAGE_ALERT_THRESHOLD} días.`}
                        >
                          ● {ageDays}d
                        </div>
                      )}
                      <div className={styles.kType}>
                        {lead.type === "gp" ? "Growth Partner" : "Desarrollo"}
                        {lead.source === "linkedin" ? " · in" : ""}
                        {lead.source === "email" ? " · ✉" : ""}
                      </div>
                      <div className={styles.kName}>{lead.name}</div>
                      <div className={styles.kSector}>
                        {lead.company} · {lead.sector}
                      </div>
                      {showValue ? (
                        <div className={styles.kValue}>
                          {lead.value > 0
                            ? `US$ ${lead.value.toLocaleString()}/mes`
                            : "Sin cotizar"}
                        </div>
                      ) : (
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--text-muted)",
                            marginTop: 6,
                            letterSpacing: "0.04em",
                          }}
                        >
                          Cotización pendiente
                        </div>
                      )}
                      {!stale && (
                        <div
                          style={{
                            fontSize: 10,
                            color: "var(--text-muted)",
                            marginTop: 4,
                            letterSpacing: "0.04em",
                          }}
                        >
                          {ageDays === 0
                            ? "Recién entró a esta etapa"
                            : `${ageDays}d en ${STAGE_LABEL[lead.stage]}`}
                        </div>
                      )}
                      {lead.note && (
                        <div
                          style={{
                            marginTop: 8,
                            fontSize: 11,
                            color: "var(--text-muted)",
                            fontStyle: "italic",
                          }}
                        >
                          {lead.note}
                        </div>
                      )}
                      <div className={styles.kActions}>
                        {idx > 0 && (
                          <button
                            className={styles.kBtn}
                            onClick={() => moveLead(lead, -1)}
                            title="Etapa anterior"
                          >
                            ←
                          </button>
                        )}
                        {idx < STAGES.length - 1 && (
                          <button
                            className={styles.kBtn}
                            onClick={() => moveLead(lead, 1)}
                            title="Avanzar etapa"
                          >
                            →
                          </button>
                        )}
                        <button
                          className={styles.kBtn}
                          onClick={() => openLostModal(lead)}
                          title="Marcar como perdido"
                          style={{ color: "#B91C1C" }}
                        >
                          ⊘
                        </button>
                      </div>
                    </div>
                  );
                })}

                <button
                  className={styles.addLeadBtn}
                  onClick={() =>
                    setLeadModal({ open: true, stage: stage.key })
                  }
                >
                  + Lead
                </button>
              </div>
            );
          })}
        </div>

        {/* ============ OPORTUNIDADES PERDIDAS ============ */}
        <LostLeadsPanel
          lostLeads={lostLeads}
          showLostPanel={showLostPanel}
          onToggle={() => setShowLostPanel(!showLostPanel)}
          onRestore={handleRestoreLead}
          onDelete={handleDeleteLostLead}
        />

        {/* ============ CAMPAIGNS (debajo del pipeline) ============ */}
        <div className={styles.campaignsPanel} style={{ marginTop: 40 }}>
          <div className={styles.panelHead}>
            <div>
              <div className={styles.panelTitle}>Campañas de prospección</div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  marginTop: 4,
                }}
              >
                El agente busca y contacta leads que matcheen tu ICP
              </div>
            </div>
            <button
              className={styles.btnSolid}
              onClick={() => setCampaignModal(true)}
            >
              + Nueva campaña
            </button>
          </div>

          {campaigns.length === 0 ? (
            <div className={styles.campaignsEmpty}>
              Todavía no hay campañas activas. Creá una para que el agente
              empiece a buscar leads calificados automáticamente.
            </div>
          ) : (
            campaigns.map((cmp) => (
              <div key={cmp.id} className={styles.campaignCard}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 12,
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <div className={styles.campaignName}>{cmp.name}</div>
                      <span
                        style={{
                          padding: "3px 8px",
                          fontSize: 10,
                          letterSpacing: "0.12em",
                          textTransform: "uppercase",
                          fontWeight: 600,
                          background:
                            cmp.status === "active"
                              ? "rgba(58,139,92,0.18)"
                              : "var(--off-white)",
                          color:
                            cmp.status === "active"
                              ? "var(--green-ok)"
                              : "var(--text-muted)",
                        }}
                      >
                        {cmp.status === "active" ? "● Corriendo" : "◌ Pausada"}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => setPreviewCampaign(cmp)}
                      style={{
                        color: "var(--deep-green)",
                        fontSize: 11,
                        letterSpacing: "0.05em",
                        padding: "4px 10px",
                        border: "1px solid var(--sand)",
                        background: "var(--off-white)",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        fontWeight: 500,
                      }}
                    >
                      ⚡ Preview mensaje
                    </button>
                    <button
                      onClick={() => removeCampaign(cmp.id)}
                      style={{
                        color: "var(--red-warn)",
                        fontSize: 11,
                        letterSpacing: "0.05em",
                        padding: "4px 8px",
                        border: "1px solid rgba(176,75,58,0.2)",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        background: "transparent",
                      }}
                    >
                      Archivar
                    </button>
                  </div>
                </div>

                <div className={styles.campaignMeta}>
                  <div>
                    <span className={styles.campaignLabel}>Geografía</span>
                    <div>
                      {cmp.countries.length > 0
                        ? cmp.countries.join(", ")
                        : cmp.country}
                      {cmp.regions.length > 0 && (
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                          {cmp.regions.join(", ")}
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className={styles.campaignLabel}>Empresa</span>
                    <div>
                      {cmp.industries.length > 0
                        ? cmp.industries.join(", ")
                        : cmp.clientType}
                      {cmp.companySizeMin && cmp.companySizeMax && (
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                          {cmp.companySizeMin}-{cmp.companySizeMax} empleados
                          {cmp.revenueRange && ` · ${cmp.revenueRange}`}
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className={styles.campaignLabel}>Decisor</span>
                    <div>
                      {cmp.roles.length > 0
                        ? cmp.roles.slice(0, 3).join(", ")
                        : cmp.demographics}
                      {cmp.seniorities.length > 0 && (
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                          {cmp.seniorities.join(", ")}
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className={styles.campaignLabel}>CTA + Canales</span>
                    <div>
                      {cmp.cta === "calendly"
                        ? "📅 Calendly"
                        : cmp.cta === "landing"
                        ? "🔗 Landing"
                        : "Custom"}
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                        {cmp.channels.join(" + ")} · {cmp.dailyVolume}/día
                      </div>
                    </div>
                  </div>
                </div>

                <div className={styles.campaignStats}>
                  <div className={styles.statCell}>
                    <div className={styles.statLabel}>Leads encontrados</div>
                    <div className={styles.statValue}>{cmp.leadsFound}</div>
                  </div>
                  <div className={styles.statCell}>
                    <div className={styles.statLabel}>Contactados</div>
                    <div className={styles.statValue}>{cmp.contacted}</div>
                  </div>
                  <div className={styles.statCell}>
                    <div className={styles.statLabel}>Respuestas</div>
                    <div
                      className={styles.statValue}
                      style={{ color: "var(--green-ok)" }}
                    >
                      {cmp.replied}
                    </div>
                  </div>
                  <div className={styles.statCell}>
                    <div className={styles.statLabel}>Reuniones</div>
                    <div
                      className={styles.statValue}
                      style={{ color: "var(--sand-dark)" }}
                    >
                      {cmp.meetings}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      <NewLeadModal
        open={leadModal.open}
        initialStage={leadModal.stage}
        onClose={() => setLeadModal({ ...leadModal, open: false })}
        onCreated={refresh}
      />

      <NewCampaignModal
        open={campaignModal}
        onClose={() => setCampaignModal(false)}
        onCreated={refresh}
      />

      <MessagePreviewModal
        open={previewCampaign !== null}
        campaign={previewCampaign}
        onClose={() => setPreviewCampaign(null)}
      />

      {/* Modal: marcar como perdido */}
      {lostModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(10,26,12,0.5)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={(e) => e.target === e.currentTarget && setLostModal(null)}
        >
          <div
            style={{
              background: "var(--white)",
              borderRadius: 12,
              padding: 28,
              maxWidth: 500,
              width: "100%",
              boxShadow: "0 24px 48px rgba(0,0,0,0.25)",
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.25em",
                textTransform: "uppercase",
                color: "#B91C1C",
                fontWeight: 700,
                marginBottom: 8,
              }}
            >
              Marcar como perdido
            </div>
            <h3
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: "var(--deep-green)",
                margin: "0 0 8px 0",
              }}
            >
              {lostModal.name}
            </h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
              {lostModal.company} · {STAGE_LABEL[lostModal.stage]} ·{" "}
              {daysInStage(lostModal)} días en etapa
            </p>
            <div style={{ marginBottom: 20 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                  color: "var(--sand-dark)",
                  marginBottom: 6,
                }}
              >
                Razón (opcional)
              </label>
              <textarea
                rows={3}
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
                placeholder='Ej: "no responden", "no es el momento", "presupuesto", "competencia"…'
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: 13,
                  border: "1px solid rgba(10,26,12,0.15)",
                  borderRadius: 6,
                  fontFamily: "inherit",
                  resize: "vertical",
                }}
              />
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 20 }}>
              El lead se archiva en el reporte de oportunidades descartadas.
              Lo podés restaurar al pipeline en cualquier momento.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => setLostModal(null)}
                style={{
                  padding: "10px 18px",
                  background: "transparent",
                  border: "1px solid rgba(10,26,12,0.15)",
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmLostLead}
                style={{
                  padding: "10px 18px",
                  background: "#B91C1C",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Marcar como perdido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: definir cotización al pasar a propuesta */}
      {valueModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(10,26,12,0.5)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={(e) => e.target === e.currentTarget && setValueModal(null)}
        >
          <div
            style={{
              background: "var(--white)",
              borderRadius: 12,
              padding: 28,
              maxWidth: 460,
              width: "100%",
              boxShadow: "0 24px 48px rgba(0,0,0,0.25)",
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.25em",
                textTransform: "uppercase",
                color: "var(--sand-dark)",
                fontWeight: 700,
                marginBottom: 8,
              }}
            >
              Propuesta · Cotización
            </div>
            <h3
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: "var(--deep-green)",
                margin: "0 0 8px 0",
              }}
            >
              Cotizar {valueModal.name}
            </h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
              Ya tenemos contexto del cliente. Definí el valor mensual de la
              propuesta para empezar a trabajarla.
            </p>
            <div style={{ marginBottom: 20 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                  color: "var(--sand-dark)",
                  marginBottom: 6,
                }}
              >
                Valor (USD/mes)
              </label>
              <input
                type="number"
                value={valueInput}
                onChange={(e) => setValueInput(e.target.value)}
                placeholder="3500"
                autoFocus
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: 14,
                  border: "1px solid rgba(10,26,12,0.15)",
                  borderRadius: 6,
                  fontFamily: "inherit",
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => setValueModal(null)}
                style={{
                  padding: "10px 18px",
                  background: "transparent",
                  border: "1px solid rgba(10,26,12,0.15)",
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Más tarde
              </button>
              <button
                onClick={saveLeadValue}
                disabled={!valueInput || Number(valueInput) <= 0}
                style={{
                  padding: "10px 18px",
                  background: "var(--deep-green)",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor:
                    !valueInput || Number(valueInput) <= 0 ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                  opacity: !valueInput || Number(valueInput) <= 0 ? 0.5 : 1,
                }}
              >
                Guardar cotización
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================
// LostLeadsPanel — reporte de oportunidades descartadas
// ============================================================
function LostLeadsPanel({
  lostLeads,
  showLostPanel,
  onToggle,
  onRestore,
  onDelete,
}: {
  lostLeads: Lead[];
  showLostPanel: boolean;
  onToggle: () => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (lostLeads.length === 0 && !showLostPanel) {
    return null;
  }
  return (
    <div
      style={{
        marginTop: 36,
        background: "var(--white)",
        border: "1px solid rgba(10,26,12,0.08)",
        borderLeft: "3px solid #B91C1C",
        borderRadius: "var(--r-lg)",
        boxShadow: "var(--shadow-card)",
        padding: 28,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: showLostPanel ? 20 : 0,
          paddingBottom: showLostPanel ? 16 : 0,
          borderBottom: showLostPanel
            ? "1px solid rgba(10,26,12,0.08)"
            : "none",
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--deep-green)" }}>
            Oportunidades descartadas
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              marginTop: 4,
            }}
          >
            {lostLeads.length === 0
              ? "Sin oportunidades descartadas — todo lo que cargues va al pipeline."
              : `${lostLeads.length} ${lostLeads.length === 1 ? "lead descartado" : "leads descartados"} · podés restaurar al pipeline`}
          </div>
        </div>
        <button
          onClick={onToggle}
          style={{
            padding: "8px 14px",
            background: "transparent",
            border: "1px solid rgba(10,26,12,0.15)",
            borderRadius: 6,
            fontSize: 11,
            letterSpacing: "0.05em",
            cursor: "pointer",
            fontFamily: "inherit",
            fontWeight: 500,
            color: "var(--deep-green)",
          }}
        >
          {showLostPanel ? "Ocultar" : "Ver reporte"} →
        </button>
      </div>
      {showLostPanel && (
        <div style={{ overflowX: "auto" }}>
          {lostLeads.length === 0 ? (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: 13,
                fontStyle: "italic",
              }}
            >
              Sin oportunidades descartadas todavía.
            </div>
          ) : (
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(10,26,12,0.08)" }}>
                  <th style={lostThStyle}>Lead</th>
                  <th style={lostThStyle}>Empresa</th>
                  <th style={lostThStyle}>Etapa perdida</th>
                  <th style={lostThStyle}>Razón</th>
                  <th style={lostThStyle}>Fecha</th>
                  <th style={{ ...lostThStyle, textAlign: "right" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {lostLeads.map((l) => (
                  <tr key={l.id} style={{ borderBottom: "1px solid rgba(10,26,12,0.05)" }}>
                    <td style={lostTdStyle}>
                      <div style={{ fontWeight: 600, color: "var(--deep-green)" }}>{l.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                        {SOURCE_LABEL[l.source]} · {l.type === "gp" ? "GP" : "Dev"}
                      </div>
                    </td>
                    <td style={lostTdStyle}>
                      <div>{l.company}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                        {l.sector}
                      </div>
                    </td>
                    <td style={lostTdStyle}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 999,
                          fontSize: 10,
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          background: "rgba(248,113,113,0.12)",
                          color: "#B91C1C",
                        }}
                      >
                        {l.lostFromStage ? STAGE_LABEL[l.lostFromStage] : "—"}
                      </span>
                    </td>
                    <td
                      style={{
                        ...lostTdStyle,
                        color: "var(--text-muted)",
                        fontStyle: l.lostReason ? "normal" : "italic",
                      }}
                    >
                      {l.lostReason || "Sin razón registrada"}
                    </td>
                    <td style={{ ...lostTdStyle, color: "var(--text-muted)", fontSize: 12 }}>
                      {l.lostAt
                        ? new Date(l.lostAt).toLocaleDateString("es-AR", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </td>
                    <td style={{ ...lostTdStyle, textAlign: "right" }}>
                      <button
                        onClick={() => onRestore(l.id)}
                        style={{
                          padding: "4px 10px",
                          background: "transparent",
                          border: "1px solid rgba(10,26,12,0.12)",
                          borderRadius: 6,
                          fontSize: 11,
                          cursor: "pointer",
                          color: "var(--deep-green)",
                          marginRight: 6,
                          fontFamily: "inherit",
                        }}
                      >
                        Restaurar
                      </button>
                      <button
                        onClick={() => onDelete(l.id)}
                        style={{
                          padding: "4px 10px",
                          background: "transparent",
                          border: "1px solid rgba(176,75,58,0.2)",
                          borderRadius: 6,
                          fontSize: 11,
                          cursor: "pointer",
                          color: "#B91C1C",
                          fontFamily: "inherit",
                        }}
                      >
                        Borrar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

const lostThStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: 10,
  fontWeight: 600,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};
const lostTdStyle: React.CSSProperties = {
  padding: "12px",
  fontSize: 13,
  color: "var(--deep-green)",
  verticalAlign: "top",
};

// ============================================================
// PipelineStats — KPIs y gráficos del pipeline
// ============================================================
function PipelineStats({ leads }: { leads: Lead[] }) {
  const stats = useMemo(() => {
    const total = leads.length;
    const closed = leads.filter((l) => l.stage === "cerrado").length;
    const contacted = leads.filter((l) => l.stage !== "prospecto").length;
    const active = leads.filter((l) => l.stage !== "cerrado");

    // Pipeline value: solo leads activos (sin cerrar)
    const pipelineValue = active.reduce((s, l) => s + l.value, 0);
    const closedValue = leads
      .filter((l) => l.stage === "cerrado")
      .reduce((s, l) => s + l.value, 0);

    // Tasa de cierre = cerrados / total
    const winRate = total > 0 ? Math.round((closed / total) * 100) : 0;
    // Tasa de contacto = contactados / total (qué % no quedan en prospección)
    const contactRate =
      total > 0 ? Math.round((contacted / total) * 100) : 0;
    // Ticket promedio = pipeline value / cantidad
    const avgTicket = total > 0 ? Math.round((pipelineValue + closedValue) / total) : 0;

    // Leads por etapa (funnel)
    const byStage = STAGES.map((s, i) => ({
      stage: s.key,
      label: s.label,
      count: leads.filter((l) => l.stage === s.key).length,
      value: leads
        .filter((l) => l.stage === s.key)
        .reduce((sum, l) => sum + l.value, 0),
      color: STAGE_COLORS[i],
    }));

    // Leads por fuente — orden alineado al mockup
    const bySource = (
      [
        "referido",
        "sitio_web",
        "redes_sociales",
        "eventos",
        "linkedin",
        "email",
        "manual",
        "otro",
      ] as LeadSource[]
    )
      .map((src) => ({
        source: src,
        label: SOURCE_LABEL[src],
        count: leads.filter((l) => l.source === src).length,
        color: SOURCE_COLORS[src],
      }))
      .filter((r) => r.count > 0);

    // Días promedio en pipeline (proxy: días desde createdAt para
    // leads NO cerrados). Para cerrados, días promedio para cerrar
    // sería ideal pero no tenemos closed_at — usamos createdAt como
    // proxy.
    const now = Date.now();
    const daysInPipeline = (l: Lead) =>
      Math.floor((now - new Date(l.createdAt).getTime()) / (1000 * 60 * 60 * 24));

    const avgDaysActive =
      active.length > 0
        ? Math.round(
            active.reduce((s, l) => s + daysInPipeline(l), 0) / active.length,
          )
        : 0;
    const avgDaysClosed =
      closed > 0
        ? Math.round(
            leads
              .filter((l) => l.stage === "cerrado")
              .reduce((s, l) => s + daysInPipeline(l), 0) / closed,
          )
        : 0;

    // Reuniones agendadas
    const meetingsBooked = leads.filter((l) => l.meetingBooked).length;

    // GP vs Dev
    const gpCount = leads.filter((l) => l.type === "gp").length;
    const devCount = leads.filter((l) => l.type === "dev").length;

    return {
      total,
      closed,
      contacted,
      pipelineValue,
      closedValue,
      winRate,
      contactRate,
      avgTicket,
      byStage,
      bySource,
      avgDaysActive,
      avgDaysClosed,
      meetingsBooked,
      gpCount,
      devCount,
    };
  }, [leads]);

  if (leads.length === 0) {
    return (
      <div
        style={{
          padding: 40,
          background: "var(--off-white)",
          border: "1px dashed rgba(10,26,12,0.15)",
          borderRadius: "var(--r-md)",
          color: "var(--text-muted)",
          textAlign: "center",
          fontSize: 13,
          marginBottom: 24,
        }}
      >
        Cargá tu primer lead para empezar a ver estadísticas del pipeline.
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 32 }}>
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--sand-dark)",
          fontWeight: 700,
          marginBottom: 14,
        }}
      >
        Pipeline · Estadísticas
      </div>

      {/* Row 1: 4 KPIs principales */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 0,
          border: "1px solid rgba(10,26,12,0.08)",
          borderRadius: "var(--r-md)",
          boxShadow: "var(--shadow-sm)",
          overflow: "hidden",
          marginBottom: 20,
          background: "var(--white)",
        }}
      >
        <StatCell
          label="Total leads"
          value={stats.total.toLocaleString()}
          sub={`${stats.gpCount} GP · ${stats.devCount} Dev`}
        />
        <StatCell
          label="Contactados"
          value={`${stats.contacted}`}
          sub={`${stats.contactRate}% del total`}
        />
        <StatCell
          label="Tasa de cierre"
          value={`${stats.winRate}%`}
          sub={`${stats.closed} ganados de ${stats.total}`}
        />
        <StatCell
          label="Pipeline activo"
          value={`US$ ${stats.pipelineValue.toLocaleString()}`}
          sub={`${stats.total - stats.closed} deals abiertos`}
        />
      </div>

      {/* Row 2: 4 KPIs secundarios */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 0,
          border: "1px solid rgba(10,26,12,0.08)",
          borderRadius: "var(--r-md)",
          boxShadow: "var(--shadow-sm)",
          overflow: "hidden",
          marginBottom: 20,
          background: "var(--white)",
        }}
      >
        <StatCell
          label="Ticket promedio"
          value={`US$ ${stats.avgTicket.toLocaleString()}`}
          sub="MRR esperado por deal"
        />
        <StatCell
          label="Reuniones agendadas"
          value={`${stats.meetingsBooked}`}
          sub={
            stats.contacted > 0
              ? `${Math.round((stats.meetingsBooked / stats.contacted) * 100)}% de contactados`
              : "—"
          }
        />
        <StatCell
          label="Días promedio · activos"
          value={`${stats.avgDaysActive}d`}
          sub="Tiempo en pipeline"
        />
        <StatCell
          label="Días promedio · cerrados"
          value={`${stats.avgDaysClosed}d`}
          sub="De prospección a cierre"
        />
      </div>

      {/* Row 3: Conversión del Pipeline (funnel horizontal) + Fuentes de Prospectos (donut) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr",
          gap: 16,
        }}
      >
        {/* ===== Conversión del Pipeline ===== */}
        <div
          style={{
            background: "var(--white)",
            border: "1px solid rgba(10,26,12,0.08)",
            borderRadius: "var(--r-md)",
            padding: 20,
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 14,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--deep-green)" }}>
              Conversión del Pipeline
            </div>
            <div
              style={{
                fontSize: 11,
                padding: "4px 10px",
                background: "var(--off-white)",
                border: "1px solid rgba(10,26,12,0.08)",
                borderRadius: 6,
                color: "var(--text-muted)",
              }}
            >
              Este mes ▾
            </div>
          </div>
          {(() => {
            const maxCount = Math.max(...stats.byStage.map((s) => s.count), 1);
            const firstCount = stats.byStage[0]?.count ?? 0;
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {stats.byStage.map((s) => {
                  const widthPct = (s.count / maxCount) * 100;
                  const convPct =
                    firstCount > 0
                      ? Math.round((s.count / firstCount) * 100)
                      : 0;
                  return (
                    <div
                      key={s.stage}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "120px 1fr 130px",
                        gap: 12,
                        alignItems: "center",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--deep-green)",
                          fontWeight: 500,
                        }}
                      >
                        {s.label}
                      </div>
                      <div
                        style={{
                          height: 28,
                          background: "var(--off-white)",
                          borderRadius: 4,
                          overflow: "hidden",
                          position: "relative",
                        }}
                      >
                        <div
                          style={{
                            width: `${widthPct}%`,
                            height: "100%",
                            background: `linear-gradient(90deg, ${s.color}DD, ${s.color})`,
                            display: "flex",
                            alignItems: "center",
                            paddingLeft: 12,
                            transition: "width 0.5s ease",
                          }}
                        >
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: "white",
                              letterSpacing: "0.02em",
                            }}
                          >
                            {s.count}
                          </span>
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--text-muted)",
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        <strong style={{ color: "var(--deep-green)" }}>
                          {convPct}%
                        </strong>{" "}
                        conversión
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* ===== Fuentes de Prospectos (donut con leyenda) ===== */}
        <div
          style={{
            background: "var(--white)",
            border: "1px solid rgba(10,26,12,0.08)",
            borderRadius: "var(--r-md)",
            padding: 20,
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--deep-green)", marginBottom: 14 }}>
            Fuentes de Prospectos
          </div>
          {stats.bySource.length === 0 ? (
            <div
              style={{
                padding: 40,
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: 12,
                fontStyle: "italic",
              }}
            >
              Sin datos
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ position: "relative", flexShrink: 0 }}>
                <ResponsiveContainer width={180} height={180}>
                  <PieChart>
                    <Pie
                      data={stats.bySource}
                      dataKey="count"
                      nameKey="label"
                      innerRadius={56}
                      outerRadius={82}
                      paddingAngle={1.5}
                      startAngle={90}
                      endAngle={-270}
                    >
                      {stats.bySource.map((s) => (
                        <Cell key={s.source} fill={s.color} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number) =>
                        `${v} ${v === 1 ? "lead" : "leads"}`
                      }
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    pointerEvents: "none",
                  }}
                >
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      color: "var(--deep-green)",
                      fontVariantNumeric: "tabular-nums",
                      lineHeight: 1,
                    }}
                  >
                    {stats.total}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: "var(--text-muted)",
                      fontWeight: 600,
                      marginTop: 4,
                    }}
                  >
                    Total
                  </div>
                </div>
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                {stats.bySource.map((s) => {
                  const pct = stats.total > 0
                    ? Math.round((s.count / stats.total) * 100)
                    : 0;
                  return (
                    <div
                      key={s.source}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        fontSize: 12,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: s.color,
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ color: "var(--deep-green)" }}>{s.label}</span>
                      </div>
                      <div
                        style={{
                          color: "var(--text-muted)",
                          fontVariantNumeric: "tabular-nums",
                          fontWeight: 600,
                        }}
                      >
                        {pct}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCell({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div
      style={{
        padding: "20px 24px",
        borderRight: "1px solid rgba(10,26,12,0.08)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--sand-dark)",
          fontWeight: 600,
          marginBottom: 10,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
          letterSpacing: "-0.025em",
          color: "var(--deep-green)",
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            marginTop: 4,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}
