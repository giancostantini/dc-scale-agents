"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Topbar from "@/components/Topbar";
import NewLeadModal from "@/components/NewLeadModal";
import NewCampaignModal from "@/components/NewCampaignModal";
import MessagePreviewModal from "@/components/MessagePreviewModal";
import {
  getLeads,
  getCampaigns,
  updateLeadStage,
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
  referido: "Referido",
};

const STAGE_COLORS = [
  "#9B8259", // prospecto - sand-dark
  "#C4A882", // contacto - sand
  "#3A8B5C", // propuesta - blue/green
  "#2d5036", // negociacion - forest-2
  "#0A1A0C", // cerrado - deep-green
];

const SOURCE_COLORS: Record<LeadSource, string> = {
  linkedin: "#0A66C2",
  email: "#9B8259",
  manual: "#7A8A7E",
  referido: "#2f7d4f",
};

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
  const [previewCampaign, setPreviewCampaign] = useState<ProspectCampaign | null>(null);

  const refresh = useCallback(() => {
    getLeads().then(setLeads);
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
    </>
  );
}

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

    // Leads por fuente
    const bySource = (
      ["linkedin", "email", "manual", "referido"] as LeadSource[]
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

      {/* Row 3: gráficos */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.5fr 1fr",
          gap: 16,
        }}
      >
        {/* Funnel: leads por etapa */}
        <div
          style={{
            background: "var(--white)",
            border: "1px solid rgba(10,26,12,0.08)",
            borderRadius: "var(--r-md)",
            padding: 16,
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--deep-green)",
              marginBottom: 4,
            }}
          >
            Funnel del pipeline
          </div>
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--sand-dark)",
              marginBottom: 12,
              fontWeight: 600,
            }}
          >
            Leads por etapa · cantidad y valor
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={stats.byStage}
              margin={{ top: 8, right: 12, left: -12, bottom: 0 }}
            >
              <XAxis
                dataKey="label"
                fontSize={10}
                tickLine={false}
                axisLine={{ stroke: "rgba(10,26,12,0.08)" }}
              />
              <YAxis
                fontSize={10}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                formatter={(v: number, key: string) =>
                  key === "value"
                    ? `US$ ${v.toLocaleString()}`
                    : `${v} ${v === 1 ? "lead" : "leads"}`
                }
                cursor={{ fill: "rgba(196,168,130,0.1)" }}
              />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {stats.byStage.map((s) => (
                  <Cell key={s.stage} fill={s.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {/* Tabla con value por etapa */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 1,
              marginTop: 12,
              fontSize: 10,
              background: "rgba(10,26,12,0.06)",
            }}
          >
            {stats.byStage.map((s) => (
              <div
                key={s.stage}
                style={{
                  background: "var(--white)",
                  padding: "8px 10px",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    letterSpacing: "0.1em",
                    color: "var(--sand-dark)",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    marginBottom: 2,
                  }}
                >
                  {s.label}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--deep-green)",
                  }}
                >
                  US$ {s.value.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Donut: leads por fuente */}
        <div
          style={{
            background: "var(--white)",
            border: "1px solid rgba(10,26,12,0.08)",
            borderRadius: "var(--r-md)",
            padding: 16,
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--deep-green)",
              marginBottom: 4,
            }}
          >
            Origen de leads
          </div>
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--sand-dark)",
              marginBottom: 12,
              fontWeight: 600,
            }}
          >
            Por canal
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
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={stats.bySource}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={85}
                  paddingAngle={2}
                  label={(props) => {
                    const { percent } = props as { percent?: number };
                    return percent && percent > 0.05
                      ? `${Math.round(percent * 100)}%`
                      : "";
                  }}
                  labelLine={false}
                >
                  {stats.bySource.map((s) => (
                    <Cell key={s.source} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) =>
                    `${v} ${v === 1 ? "lead" : "leads"}`
                  }
                />
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  wrapperStyle={{ fontSize: 11 }}
                />
              </PieChart>
            </ResponsiveContainer>
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
