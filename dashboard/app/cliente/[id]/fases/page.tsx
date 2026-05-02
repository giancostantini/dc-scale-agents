"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getClient } from "@/lib/storage";
import { listPhaseReports, phaseStatusLabel, phaseStatusColor } from "@/lib/phases";
import type { Client, PhaseKey, PhaseReport } from "@/lib/types";
import ui from "@/components/ClientUI.module.css";

type Phase = {
  key: PhaseKey;
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
    desc: "Buyer personas, plan de medios, posicionamiento, KPIs objetivo y roadmap.",
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
  const [reports, setReports] = useState<PhaseReport[]>([]);
  const [reloadFlag, setReloadFlag] = useState(0);

  // Polling cuando hay alguna fase generando, para auto-refrescar.
  const anyGenerating = reports.some((r) => r.status === "generating");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [c, rs] = await Promise.all([
        getClient(id),
        listPhaseReports(id),
      ]);
      if (cancelled) return;
      setClient(c ?? null);
      setReports(rs);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [id, reloadFlag]);

  useEffect(() => {
    if (!anyGenerating) return;
    // Polling 5s mientras hay algo generando
    const interval = setInterval(() => {
      setReloadFlag((f) => f + 1);
    }, 5000);
    return () => clearInterval(interval);
  }, [anyGenerating]);

  if (!client) return null;

  // Index para acceso rápido
  const reportByPhase = new Map<PhaseKey, PhaseReport>();
  for (const r of reports) reportByPhase.set(r.phase, r);

  // Calcular el status efectivo de cada fase: locked si la anterior
  // no está aprobada, pending si está lista para generar, etc.
  function effectiveStatus(idx: number): {
    status: PhaseReport["status"] | "locked" | "pending";
    report?: PhaseReport;
  } {
    const phase = PHASES[idx].key;
    const report = reportByPhase.get(phase);
    if (idx === 0) {
      return { status: report?.status ?? "pending", report };
    }
    const prevApproved =
      reportByPhase.get(PHASES[idx - 1].key)?.status === "approved";
    if (!prevApproved && !report) return { status: "locked" };
    if (!prevApproved && report?.status !== "approved") {
      return { status: "locked" };
    }
    return { status: report?.status ?? "pending", report };
  }

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Metodología · Fases del negocio</div>
          <h1>Recorrido del cliente</h1>
        </div>
        <div
          className={`${ui.phaseBadge} ${
            client.status === "active" ? ui.phaseBadgeExec : ""
          }`}
        >
          {client.phase}
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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 24,
          }}
        >
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.25em",
                textTransform: "uppercase",
                color: "var(--sand)",
                fontWeight: 600,
                marginBottom: 10,
              }}
            >
              ⚑ Fase 00 · Kickoff · Fuente de verdad
            </div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: "-0.025em",
                marginBottom: 10,
              }}
            >
              Punto de entrada de toda la información
            </div>
            <div
              style={{
                fontSize: 13,
                color: "rgba(232,228,220,0.75)",
                lineHeight: 1.6,
                maxWidth: 680,
              }}
            >
              Acá se carga el kickoff, el branding y todo lo que define al
              cliente. De acá salen los reportes de diagnóstico, estrategia,
              setup y lanzamiento.
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "var(--sand)",
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              Estado
            </div>
            <div
              style={{
                padding: "6px 14px",
                background: "var(--sand)",
                color: "var(--deep-green)",
                fontSize: 11,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                fontWeight: 700,
                display: "inline-block",
              }}
            >
              ✓ Cargado
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--sand)",
                marginTop: 14,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              Abrir detalle →
            </div>
          </div>
        </div>
      </div>

      {anyGenerating && (
        <div
          style={{
            padding: "12px 18px",
            background: "rgba(196,168,130,0.12)",
            borderLeft: "3px solid var(--sand)",
            fontSize: 13,
            color: "var(--deep-green)",
            marginBottom: 24,
          }}
        >
          ⏳ Hay una fase generándose. Esto puede tardar 30-60 segundos.
          La página se actualiza sola.
        </div>
      )}

      {/* Cards de fases */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 20,
        }}
      >
        {PHASES.map((p, i) => {
          const eff = effectiveStatus(i);
          const color = phaseStatusColor(eff.status);
          const isLocked = eff.status === "locked";

          return (
            <div
              key={p.key}
              onClick={() =>
                !isLocked && router.push(`/cliente/${id}/fases/${p.key}`)
              }
              style={{
                padding: 24,
                background: isLocked
                  ? "rgba(10,26,12,0.03)"
                  : eff.status === "approved"
                  ? "rgba(58,139,92,0.04)"
                  : eff.status === "draft"
                  ? "var(--off-white)"
                  : "var(--white)",
                border: "1px solid rgba(10,26,12,0.08)",
                borderLeft: `3px solid ${color}`,
                cursor: isLocked ? "not-allowed" : "pointer",
                opacity: isLocked ? 0.55 : 1,
                transition: "all 0.2s",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.22em",
                    textTransform: "uppercase",
                    color: "var(--sand-dark)",
                    fontWeight: 600,
                  }}
                >
                  Fase 0{i + 1}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    color,
                    fontWeight: 600,
                  }}
                >
                  {phaseStatusLabel(eff.status)}
                  {eff.report && eff.report.version > 1 && (
                    <span style={{ marginLeft: 6, color: "var(--text-muted)" }}>
                      · v{eff.report.version}
                    </span>
                  )}
                </div>
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  marginBottom: 10,
                }}
              >
                {p.name}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--text-muted)",
                  lineHeight: 1.5,
                  marginBottom: 16,
                }}
              >
                {p.desc}
              </div>
              <div
                style={{
                  padding: 14,
                  background: "var(--deep-green)",
                  color: "var(--off-white)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--sand)",
                    }}
                  >
                    ▢ {p.report}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "rgba(232,228,220,0.6)",
                      marginTop: 2,
                    }}
                  >
                    {p.reportDesc}
                  </div>
                </div>
                <span
                  style={{
                    color: "var(--sand)",
                    fontSize: 11,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    fontWeight: 600,
                  }}
                >
                  {isLocked ? "Bloqueada" : "Abrir →"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
