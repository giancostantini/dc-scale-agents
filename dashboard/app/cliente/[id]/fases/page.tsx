"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getClient } from "@/lib/storage";
import type { Client } from "@/lib/types";
import ui from "@/components/ClientUI.module.css";

type Phase = {
  key: "kickoff" | "diagnostico" | "estrategia" | "setup" | "lanzamiento";
  name: string;
  desc: string;
  report: string;
  reportDesc: string;
};

const PHASES: Phase[] = [
  {
    key: "diagnostico",
    name: "Diagnóstico",
    desc: "Auditoría del negocio, benchmark de competidores, análisis de activos digitales y oportunidades.",
    report: "Growth Diagnosis Plan",
    reportDesc: "Documento maestro de diagnóstico",
  },
  {
    key: "estrategia",
    name: "Estrategia",
    desc: "Definición de buyer persona, plan de medios, posicionamiento, KPIs objetivo y roadmap.",
    report: "Growth Strategy Plan",
    reportDesc: "Plan estratégico ejecutable",
  },
  {
    key: "setup",
    name: "Setup",
    desc: "Configuración de tracking, pixel, cuentas de ads, CRM, integraciones y agentes IA.",
    report: "Checklist de setup",
    reportDesc: "Checklist técnico y accesos",
  },
  {
    key: "lanzamiento",
    name: "Lanzamiento",
    desc: "Activación de campañas, publicación de contenido y validación inicial de métricas.",
    report: "Growth Launch Plan",
    reportDesc: "Plan de lanzamiento y primera semana",
  },
];

export default function FasesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);

  useEffect(() => {
    getClient(id).then((c) => setClient(c ?? null));
  }, [id]);

  if (!client) return null;

  const isOnboarding = client.status === "onboarding";
  // Calculamos estado de cada fase
  const statusFor = (idx: number): "done" | "active" | "pending" => {
    if (client.status === "active") return "done";
    if (isOnboarding) {
      if (idx < 2) return "done";
      if (idx === 2) return "active";
      return "pending";
    }
    return "done";
  };

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Metodología · Fases del negocio</div>
          <h1>Recorrido del cliente</h1>
        </div>
        <div className={`${ui.phaseBadge} ${client.status === "active" ? ui.phaseBadgeExec : ""}`}>
          {isOnboarding ? "On-boarding · 3/4" : "Execution activa"}
        </div>
      </div>

      {/* Kickoff destacado */}
      <div
        style={{
          background: "var(--deep-green)",
          color: "var(--off-white)",
          padding: 32,
          marginBottom: 28,
          borderLeft: "3px solid var(--sand)",
          cursor: "pointer",
        }}
        onClick={() => router.push(`/cliente/${id}/fases/kickoff`)}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, letterSpacing: "0.25em", textTransform: "uppercase", color: "var(--sand)", fontWeight: 600, marginBottom: 10 }}>
              ⚑ Fase 00 · Kickoff · Fuente de verdad
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.025em", marginBottom: 10 }}>
              Punto de entrada de toda la información
            </div>
            <div style={{ fontSize: 13, color: "rgba(232,228,220,0.75)", lineHeight: 1.6, maxWidth: 680 }}>
              Acá se carga el kickoff, el branding y todo lo que define al
              cliente. De acá salen los objetivos, se alimentan los agentes, se
              establecen los presupuestos y se arman los reportes.
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--sand)", fontWeight: 600, marginBottom: 6 }}>
              Estado
            </div>
            <div style={{ padding: "6px 14px", background: "var(--sand)", color: "var(--deep-green)", fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 700, display: "inline-block" }}>
              ✓ Completo
            </div>
            <div style={{ fontSize: 11, color: "var(--sand)", marginTop: 14, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>
              Abrir detalle →
            </div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className={ui.panel} style={{ marginBottom: 28 }}>
        <div className={ui.panelHead}>
          <div className={ui.panelTitle}>On-boarding · 4 fases</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Click en cada fase para abrir el detalle
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", position: "relative" }}>
          <div style={{ position: "absolute", top: 42, left: "8%", right: "8%", height: 1, background: "var(--rule)", zIndex: 0 }} />
          {PHASES.map((p, i) => {
            const st = statusFor(i);
            return (
              <div key={p.key} style={{ textAlign: "center", padding: "0 12px", position: "relative", zIndex: 1 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: st === "done" ? "var(--green-ok)" : st === "active" ? "var(--sand)" : "var(--white)",
                    border: `2px solid ${st === "done" ? "var(--green-ok)" : st === "active" ? "var(--sand)" : "var(--rule)"}`,
                    color: st === "pending" ? "var(--text-muted)" : "var(--white)",
                    fontSize: 12,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 14px",
                  }}
                >
                  {st === "done" ? "✓" : i + 1}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{p.name}</div>
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    color: st === "active" ? "var(--sand-dark)" : st === "done" ? "var(--green-ok)" : "var(--text-muted)",
                    fontWeight: 600,
                  }}
                >
                  {st === "done" ? "Completada" : st === "active" ? "En curso" : "Pendiente"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 20 }}>
        {PHASES.map((p, i) => {
          const st = statusFor(i);
          return (
            <div
              key={p.key}
              onClick={() => router.push(`/cliente/${id}/fases/${p.key}`)}
              style={{
                padding: 24,
                background: st === "active" ? "var(--off-white)" : "var(--white)",
                border: "1px solid rgba(10,26,12,0.08)",
                borderLeft: `3px solid ${st === "done" ? "var(--green-ok)" : st === "active" ? "var(--sand)" : "var(--rule)"}`,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--sand-dark)", fontWeight: 600 }}>
                  Fase 0{i + 1}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    color: st === "active" ? "var(--sand-dark)" : st === "done" ? "var(--green-ok)" : "var(--text-muted)",
                    fontWeight: 600,
                  }}
                >
                  {st === "done" ? "✓ Completada" : st === "active" ? "● En curso" : "○ Pendiente"}
                </div>
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 10 }}>
                {p.name}
              </div>
              <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5, marginBottom: 16 }}>
                {p.desc}
              </div>
              <div style={{ padding: 14, background: "var(--deep-green)", color: "var(--off-white)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--sand)" }}>▢ {p.report}</div>
                  <div style={{ fontSize: 11, color: "rgba(232,228,220,0.6)", marginTop: 2 }}>{p.reportDesc}</div>
                </div>
                <span style={{ color: "var(--sand)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>
                  Abrir →
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
