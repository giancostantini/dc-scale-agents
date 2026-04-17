"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import ui from "@/components/ClientUI.module.css";

type FaseKey = "kickoff" | "diagnostico" | "estrategia" | "setup" | "lanzamiento";

const DETAILS: Record<FaseKey, { title: string; report: string; color: string; desc: string; items: { title: string; desc: string }[] }> = {
  kickoff: {
    title: "Kickoff · Fuente de verdad",
    report: "Documentos del kickoff",
    color: "var(--sand)",
    desc: "Acá se cargan todos los inputs del cliente: kickoff document, branding, datos del negocio y objetivos. De acá salen los objetivos, se alimentan los agentes y se establecen los presupuestos.",
    items: [
      { title: "Kickoff document", desc: "Brief completo del negocio · PDF/DOCX" },
      { title: "Branding completo", desc: "Manual de marca · logos · paleta · tipografías" },
      { title: "Propuesta de valor", desc: "Qué vende · a quién · por qué" },
      { title: "Audiencia objetivo", desc: "Perfil de cliente ideal · buyer persona" },
      { title: "Tono de comunicación", desc: "Voz de marca · lo que se dice y lo que no" },
      { title: "Competidores", desc: "Benchmark directo e indirecto" },
    ],
  },
  diagnostico: {
    title: "Diagnóstico · Growth Diagnosis Plan",
    report: "Componentes del diagnóstico",
    color: "var(--green-ok)",
    desc: "Auditoría del negocio. Benchmark de competidores. Análisis de activos digitales existentes. Identificación de oportunidades quick-win y estratégicas.",
    items: [
      { title: "Auditoría de assets digitales", desc: "Website · landings · ads · perfiles sociales" },
      { title: "Benchmark competitivo", desc: "5 competidores analizados · fortalezas · debilidades" },
      { title: "Análisis de audiencia", desc: "Perfil · comportamiento · engagement" },
      { title: "Mapa de oportunidades", desc: "Canales infrautilizados · quick wins · gaps" },
      { title: "Diagnóstico técnico", desc: "Tracking · pixel · integraciones · performance" },
      { title: "Situación del embudo", desc: "Conversión por etapa · leaks · oportunidades" },
    ],
  },
  estrategia: {
    title: "Estrategia · Growth Strategy Plan",
    report: "Componentes estratégicos",
    color: "var(--green-ok)",
    desc: "Definición de buyer personas, posicionamiento, plan de medios, KPIs objetivo y roadmap táctico.",
    items: [
      { title: "Buyer personas", desc: "Perfiles detallados · dolores · motivaciones" },
      { title: "Propuesta de valor refinada", desc: "Basada en diagnóstico y competencia" },
      { title: "Plan de medios", desc: "Mix de canales · asignación de presupuesto" },
      { title: "Posicionamiento vs competencia", desc: "Diferenciadores · ángulos de comunicación" },
      { title: "KPIs objetivo", desc: "ROAS · CAC · LTV · conversiones" },
      { title: "Roadmap táctico", desc: "Plan 12 semanas · hitos intermedios" },
    ],
  },
  setup: {
    title: "Setup técnico",
    report: "Checklist técnico",
    color: "var(--sand)",
    desc: "Configuración de tracking, pixel, cuentas de ads, CRM, integraciones, alimentación de agentes IA y creación del portal del cliente.",
    items: [
      { title: "Google Tag Manager", desc: "Container creado · triggers configurados" },
      { title: "Meta Pixel + Conversions API", desc: "Instalado · eventos de conversión definidos" },
      { title: "Google Analytics 4", desc: "Propiedad · eventos · conversiones" },
      { title: "Cuentas de Ads", desc: "Meta · Google · TikTok · LinkedIn" },
      { title: "CRM e integraciones", desc: "HubSpot · Mailchimp · Calendly · n8n" },
      { title: "Agentes IA alimentados", desc: "Creativo · Ads · SEO · Email · Social · Analytics" },
    ],
  },
  lanzamiento: {
    title: "Lanzamiento · Growth Launch Plan",
    report: "Cronograma de activación",
    color: "var(--sand)",
    desc: "Activación de campañas, publicación de contenido inicial, validación de métricas y primer reporte de performance.",
    items: [
      { title: "Día 0 · Go live", desc: "Campañas Meta activadas" },
      { title: "Día 1-3 · Google Ads", desc: "Campañas search activas" },
      { title: "Día 4-7 · Contenido orgánico", desc: "Primera ola de posts y reels" },
      { title: "Día 8-14 · Email flow", desc: "Secuencia de bienvenida activada" },
      { title: "Día 15-21 · Optimización", desc: "Ajustes según primera data" },
      { title: "Día 22-30 · Primer reporte", desc: "Performance del mes 1 + aprendizajes" },
    ],
  },
};

export default function FaseDetailPage({
  params,
}: {
  params: Promise<{ id: string; fase: string }>;
}) {
  const { id, fase } = use(params);
  const router = useRouter();

  const key = fase as FaseKey;
  const data = DETAILS[key];

  if (!data) {
    return (
      <>
        <div className={ui.head}>
          <div>
            <div className={ui.eyebrow}>Fase no encontrada</div>
            <h1>404</h1>
          </div>
          <button className={ui.btnSolid} onClick={() => router.push(`/cliente/${id}/fases`)}>
            ← Volver a fases
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>
            {key === "kickoff"
              ? "Fase 00 · Kickoff"
              : `Fase 0${["diagnostico", "estrategia", "setup", "lanzamiento"].indexOf(key) + 1}`}
          </div>
          <h1>{data.title}</h1>
        </div>
        <button className={ui.btnSolid} onClick={() => router.push(`/cliente/${id}/fases`)}>
          ← Volver a fases
        </button>
      </div>

      <div
        style={{
          background: "var(--deep-green)",
          color: "var(--off-white)",
          padding: 28,
          marginBottom: 24,
          borderLeft: `3px solid ${data.color}`,
        }}
      >
        <div style={{ fontSize: 10, letterSpacing: "0.25em", textTransform: "uppercase", color: "var(--sand)", fontWeight: 600, marginBottom: 12 }}>
          ▢ Qué incluye esta fase
        </div>
        <div style={{ fontSize: 15, lineHeight: 1.7, color: "rgba(232,228,220,0.9)" }}>
          {data.desc}
        </div>
      </div>

      {key === "kickoff" ? (
        <KickoffContent clientId={id} items={data.items} />
      ) : (
        <div className={ui.panel}>
          <div className={ui.panelHead}>
            <div className={ui.panelTitle}>{data.report}</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
            {data.items.map((it) => (
              <div
                key={it.title}
                style={{
                  padding: 16,
                  background: "var(--off-white)",
                  borderLeft: `2px solid ${data.color}`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{it.title}</div>
                  <span style={{ fontSize: 10, color: data.color, letterSpacing: "0.12em", fontWeight: 600, textTransform: "uppercase" }}>
                    ✓ Done
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{it.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function KickoffContent({ clientId, items }: { clientId: string; items: { title: string; desc: string }[] }) {
  const router = useRouter();
  return (
    <>
      <div className={ui.panel} style={{ marginBottom: 24 }}>
        <div className={ui.panelHead}>
          <div className={ui.panelTitle}>Información y archivos cargados</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
          {items.map((it) => (
            <div key={it.title} style={{ padding: 18, background: "var(--off-white)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{it.title}</div>
                <span style={{ fontSize: 10, letterSpacing: "0.1em", color: "var(--yellow-warn)", fontWeight: 600, textTransform: "uppercase" }}>
                  ○ Pendiente
                </span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>{it.desc}</div>
              <button
                onClick={() => router.push(`/cliente/${clientId}/biblioteca`)}
                style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--sand-dark)", fontWeight: 600, background: "transparent", border: "none", cursor: "pointer" }}
              >
                Subir en Biblioteca →
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className={ui.panel} style={{ borderLeft: "3px solid var(--sand)" }}>
        <div className={ui.panelHead}>
          <div className={ui.panelTitle}>⚑ Impacto downstream del kickoff</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Lo que se alimenta automáticamente</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
          {[
            { icon: "◆", title: "Objetivos del mes", desc: "Pre-cargados según propuesta de valor. Editables por el director.", go: "objetivos" },
            { icon: "⚡", title: "Agentes IA alimentados", desc: "6 agentes leen el kickoff: Creativo, Ads, SEO, Email, Social, Analytics.", go: "agentes" },
            { icon: "$", title: "Presupuestos", desc: "Default para Paid Media y Campañas de producción.", go: "paid-media" },
            { icon: "▢", title: "Biblioteca", desc: "Todo indexado y accesible para el equipo.", go: "biblioteca" },
          ].map((c) => (
            <div key={c.title} style={{ padding: 18, background: "var(--off-white)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ width: 32, height: 32, background: "var(--sand)", color: "var(--deep-green)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
                  {c.icon}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{c.title}</div>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>{c.desc}</div>
              <button
                onClick={() => router.push(`/cliente/${clientId}/${c.go}`)}
                className={ui.btnGhost}
                style={{ fontSize: 11, padding: "6px 12px" }}
              >
                Ir →
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
