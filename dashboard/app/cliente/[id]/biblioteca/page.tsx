"use client";

import { use, useEffect, useState } from "react";
import { getClient, getProdCampaigns } from "@/lib/storage";
import type { Client, ProductionCampaign } from "@/lib/types";
import OnboardingFilesPanel from "@/components/OnboardingFilesPanel";
import ui from "@/components/ClientUI.module.css";

const GP_FOLDERS = [
  { name: "Kickoff", type: "input", desc: "Brief inicial, NDA, accesos, contactos clave" },
  { name: "Branding", type: "input", desc: "Manual de marca, logos, paleta, tipografías" },
  { name: "Estrategia", type: "generated", desc: "Plan de medios, buyer personas, posicionamiento" },
  { name: "Contenido generado", type: "generated", desc: "Posts, creatividades, copies aprobados" },
  { name: "Reportes mensuales", type: "generated", desc: "Reportes de performance del agente" },
  { name: "Reportes diarios", type: "generated", desc: "Análisis diario automático del Agente Analytics" },
  { name: "Research SEO", type: "generated", desc: "Keywords, briefs, auditorías técnicas" },
  { name: "Contratos", type: "input", desc: "Contratos firmados, NDAs, enmiendas" },
];

const DEV_FOLDERS = [
  { name: "Kickoff", type: "input", desc: "Brief, discovery, accesos" },
  { name: "Arquitectura", type: "generated", desc: "Diagramas, flujos, documentación técnica" },
  { name: "Assets", type: "input", desc: "Recursos del cliente: logos, datos, credenciales" },
  { name: "Desarrollo", type: "generated", desc: "Código, prompts, integraciones" },
  { name: "Entregas", type: "generated", desc: "Deploys, demos, documentación final" },
];

export default function BibliotecaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [client, setClient] = useState<Client | null>(null);
  const [campaigns, setCampaigns] = useState<ProductionCampaign[]>([]);

  useEffect(() => {
    getClient(id).then((c) => setClient(c ?? null));
    getProdCampaigns(id).then(setCampaigns);
  }, [id]);

  if (!client) return null;

  const folders = client.type === "gp" ? GP_FOLDERS : DEV_FOLDERS;
  const totalCampaignPieces = campaigns.reduce((s, c) => s + (c.resultFiles ?? 0), 0);

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Gestión · Biblioteca del cliente</div>
          <h1>Todo lo generado</h1>
        </div>
        <button className={ui.btnSolid}>+ Subir archivo</button>
      </div>

      <div className={ui.kpiGrid} style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className={ui.kpiCell}>
          <div className={ui.kLabel}>Carpetas</div>
          <div className={ui.kValue}>{folders.length + (client.type === "gp" ? 1 : 0)}</div>
        </div>
        <div className={ui.kpiCell}>
          <div className={ui.kLabel}>Campañas · Resultados</div>
          <div className={ui.kValue}>{campaigns.length}</div>
          <div className={ui.kDelta}>{totalCampaignPieces} piezas</div>
        </div>
        <div className={ui.kpiCell}>
          <div className={ui.kLabel}>Tipo cliente</div>
          <div className={ui.kValue} style={{ fontSize: 18 }}>
            {client.type === "gp" ? "Growth Partner" : "Desarrollo"}
          </div>
        </div>
        <div className={ui.kpiCell}>
          <div className={ui.kLabel}>Último update</div>
          <div className={ui.kValue} style={{ fontSize: 16 }}>Hoy</div>
        </div>
      </div>

      <OnboardingFilesPanel onboarding={client.onboarding} />

      <div className={ui.panel} style={{ marginBottom: 24 }}>
        <div className={ui.panelHead}>
          <div className={ui.panelTitle}>Carpetas</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Los agentes leen estos archivos para aprender del cliente
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {folders.map((f) => (
            <div
              key={f.name}
              style={{
                padding: 20,
                border: "1px solid rgba(10,26,12,0.08)",
                cursor: "pointer",
                background: f.type === "generated" ? "var(--off-white)" : "var(--white)",
                transition: "all 0.15s",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>{f.name}</div>
                <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: f.type === "generated" ? "var(--sand-dark)" : "var(--text-muted)", fontWeight: 600 }}>
                  {f.type === "generated" ? "⚡ IA" : "Input"}
                </div>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Campañas · Resultados */}
      {client.type === "gp" && (
        <div className={ui.panel} style={{ borderLeft: "3px solid var(--sand)" }}>
          <div className={ui.panelHead}>
            <div className={ui.panelTitle}>◎ Campañas · Resultados</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              Una subcarpeta por cada campaña de producción
            </div>
          </div>
          {campaigns.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              Sin campañas todavía. Creá una desde la sección <strong>Campañas</strong> y las piezas resultantes se cargan acá.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {campaigns.map((c) => (
                <div key={c.id} style={{ padding: 20, background: "var(--white)", border: "1px solid rgba(10,26,12,0.08)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>▢ {c.title}</div>
                        <span className={`${ui.pill} ${c.status === "active" ? ui.pillGreen : ui.pillGrey}`}>
                          {c.status === "active" ? "En curso" : "Finalizada"}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
                        {c.resultFiles ?? 0} piezas · {c.type}
                      </div>
                    </div>
                    <button className={ui.btnGhost} style={{ flexShrink: 0 }}>+ Subir piezas</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
