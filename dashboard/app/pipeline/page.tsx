"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Topbar from "@/components/Topbar";
import NewLeadModal from "@/components/NewLeadModal";
import NewCampaignModal from "@/components/NewCampaignModal";
import {
  getLeads,
  getCampaigns,
  updateLeadStage,
  deleteLead,
  deleteCampaign,
} from "@/lib/storage";
import { hasSession } from "@/lib/supabase/auth";
import type { Lead, PipelineStage, ProspectCampaign } from "@/lib/types";
import styles from "./pipeline.module.css";

const STAGES: { key: PipelineStage; label: string }[] = [
  { key: "prospecto", label: "Prospección" },
  { key: "contacto", label: "Contactado" },
  { key: "propuesta", label: "Propuesta" },
  { key: "negociacion", label: "Negociación" },
  { key: "cerrado", label: "Cerrado" },
];

export default function PipelinePage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [campaigns, setCampaigns] = useState<ProspectCampaign[]>([]);
  const [leadModal, setLeadModal] = useState<{
    open: boolean;
    stage: PipelineStage;
  }>({
    open: false,
    stage: "prospecto",
  });
  const [campaignModal, setCampaignModal] = useState(false);

  const refresh = useCallback(() => {
    getLeads().then(setLeads);
    getCampaigns().then(setCampaigns);
  }, []);

  useEffect(() => {
    hasSession().then((has) => {
      if (!has) {
        router.replace("/");
        return;
      }
      setAuthChecked(true);
      refresh();
    });
  }, [router, refresh]);

  if (!authChecked) return null;

  const totalValue = leads.reduce((sum, l) => sum + l.value, 0);

  async function moveLead(lead: Lead, direction: 1 | -1) {
    const idx = STAGES.findIndex((s) => s.key === lead.stage);
    const next = idx + direction;
    if (next < 0 || next >= STAGES.length) return;
    await updateLeadStage(lead.id, STAGES[next].key);
    refresh();
  }

  async function removeLead(id: string) {
    if (!confirm("¿Eliminar este lead?")) return;
    await deleteLead(id);
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
          <div className={styles.meta}>
            Pipeline total
            <strong className={styles.metaStrong}>
              US$ {totalValue.toLocaleString()}
            </strong>
          </div>
        </div>

        {/* ============ CAMPAIGNS ============ */}
        <div className={styles.campaignsPanel}>
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

                <div className={styles.campaignMeta}>
                  <div>
                    <span className={styles.campaignLabel}>País</span>
                    <div>{cmp.country}</div>
                  </div>
                  <div>
                    <span className={styles.campaignLabel}>Demografía</span>
                    <div>{cmp.demographics}</div>
                  </div>
                  <div>
                    <span className={styles.campaignLabel}>Tipo cliente</span>
                    <div>{cmp.clientType}</div>
                  </div>
                  <div>
                    <span className={styles.campaignLabel}>Canales</span>
                    <div>{cmp.channels.join(" · ")}</div>
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

        {/* ============ KANBAN ============ */}
        <div className={styles.kanbanHeader}>
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
                  return (
                    <div
                      key={lead.id}
                      className={`${styles.kanbanCard} ${
                        lead.type === "dev" ? styles.kanbanCardDev : ""
                      }`}
                    >
                      <div className={styles.kType}>
                        {lead.type === "gp" ? "Growth Partner" : "Desarrollo"}
                        {lead.source === "linkedin" ? " · in" : ""}
                        {lead.source === "email" ? " · ✉" : ""}
                      </div>
                      <div className={styles.kName}>{lead.name}</div>
                      <div className={styles.kSector}>
                        {lead.company} · {lead.sector}
                      </div>
                      <div className={styles.kValue}>
                        US$ {lead.value.toLocaleString()}/mes
                      </div>
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
                            title="Avanzar"
                          >
                            →
                          </button>
                        )}
                        <button
                          className={styles.kBtn}
                          onClick={() => removeLead(lead.id)}
                          style={{ color: "var(--red-warn)" }}
                        >
                          ×
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
    </>
  );
}
