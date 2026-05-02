"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { getCurrentProfile } from "@/lib/supabase/auth";
import { getSupabase } from "@/lib/supabase/client";
import { getPhaseReport, phaseStatusLabel, phaseStatusColor } from "@/lib/phases";
import type { PhaseKey, PhaseReport } from "@/lib/types";
import ui from "@/components/ClientUI.module.css";

type FaseKey = PhaseKey | "kickoff";

const PHASE_TITLES: Record<FaseKey, { title: string; reportName: string; subtitle: string }> = {
  kickoff: {
    title: "Kickoff · Fuente de verdad",
    reportName: "Documentos del kickoff",
    subtitle:
      "Acá se cargan todos los inputs del cliente: kickoff document, branding, datos del negocio. De acá salen los reportes de las fases siguientes.",
  },
  diagnostico: {
    title: "Diagnóstico · Growth Diagnosis Plan",
    reportName: "Growth Diagnosis Plan",
    subtitle:
      "Auditoría del negocio. Benchmark de competidores. Análisis de activos digitales existentes. Identificación de oportunidades.",
  },
  estrategia: {
    title: "Estrategia · Growth Strategy Plan",
    reportName: "Growth Strategy Plan",
    subtitle:
      "Definición de buyer personas, posicionamiento, plan de medios, KPIs objetivo y roadmap táctico.",
  },
  setup: {
    title: "Setup técnico",
    reportName: "Checklist técnico",
    subtitle:
      "Configuración de tracking, pixel, cuentas de ads, CRM, integraciones, alimentación de agentes IA.",
  },
  lanzamiento: {
    title: "Lanzamiento · Growth Launch Plan",
    reportName: "Cronograma de activación",
    subtitle:
      "Cronograma día por día de los primeros 30 días operativos.",
  },
};

const PHASE_ORDER_INDEX: Record<FaseKey, number> = {
  kickoff: 0,
  diagnostico: 1,
  estrategia: 2,
  setup: 3,
  lanzamiento: 4,
};

export default function FaseDetailPage({
  params,
}: {
  params: Promise<{ id: string; fase: string }>;
}) {
  const { id, fase } = use(params);
  const router = useRouter();

  const key = fase as FaseKey;
  const meta = PHASE_TITLES[key];

  const [report, setReport] = useState<PhaseReport | null | undefined>(undefined);
  const [isDirector, setIsDirector] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reloadFlag, setReloadFlag] = useState(0);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const profile = await getCurrentProfile();
      if (cancelled) return;
      setIsDirector(profile?.role === "director");
      if (key === "kickoff") {
        setReport(null);
        return;
      }
      const r = await getPhaseReport(id, key as PhaseKey);
      if (cancelled) return;
      setReport(r);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [id, key, reloadFlag]);

  // Polling cuando está generando
  useEffect(() => {
    if (report?.status !== "generating") return;
    const interval = setInterval(() => setReloadFlag((f) => f + 1), 5000);
    return () => clearInterval(interval);
  }, [report?.status]);

  if (!meta) {
    return (
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Fase no encontrada</div>
          <h1>404</h1>
        </div>
        <button
          className={ui.btnSolid}
          onClick={() => router.push(`/cliente/${id}/fases`)}
        >
          ← Volver a fases
        </button>
      </div>
    );
  }

  // ===== Kickoff: vista especial sin generador =====
  if (key === "kickoff") {
    return (
      <>
        <Header
          eyebrow="Fase 00 · Kickoff"
          title={meta.title}
          subtitle={meta.subtitle}
          onBack={() => router.push(`/cliente/${id}/fases`)}
        />
        <div
          className={ui.panel}
          style={{ borderLeft: "3px solid var(--sand)" }}
        >
          <div className={ui.panelHead}>
            <div className={ui.panelTitle}>Documentos cargados</div>
          </div>
          <p style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.6 }}>
            Andá a <strong>Biblioteca → carpeta Onboarding</strong> para ver
            los archivos del kickoff y el branding cargados en el wizard de
            creación. El agente del Diagnóstico los lee automáticamente cuando
            generás esa fase.
          </p>
          <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
            <button
              className={ui.btnSolid}
              onClick={() => router.push(`/cliente/${id}/biblioteca`)}
            >
              Ir a Biblioteca →
            </button>
            <button
              className={ui.btnGhost}
              onClick={() => router.push(`/cliente/${id}/fases`)}
            >
              ← Volver a fases
            </button>
          </div>
        </div>
      </>
    );
  }

  // ===== Fases con reporte =====
  const phaseKey = key as PhaseKey;
  const idxPhase = PHASE_ORDER_INDEX[phaseKey];
  const status = report?.status ?? "pending";
  const isApproved = status === "approved";
  const isDraft = status === "draft";
  const isGenerating = status === "generating";
  const isChangesRequested = status === "changes_requested";
  const hasContent = report?.content_md && report.content_md.length > 0;

  // ===== Acciones =====

  async function callPhaseEndpoint(
    endpoint: string,
    body: Record<string, unknown>,
  ) {
    const supabase = getSupabase();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw new Error("Sin sesión");
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? "Error desconocido");
    return data;
  }

  async function generate(feedback?: string) {
    if (busy) return;
    setBusy(true);
    try {
      // Marca optimista de "generating" para UI inmediata
      setReport((prev) => ({
        ...(prev ?? ({} as PhaseReport)),
        status: "generating",
      }));
      await callPhaseEndpoint("/api/phases/generate", {
        clientId: id,
        phase: phaseKey,
        feedback,
      });
      setReloadFlag((f) => f + 1);
    } catch (err) {
      const e = err as Error;
      alert(`No se pudo generar el reporte:\n${e.message}`);
      setReloadFlag((f) => f + 1);
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (busy) return;
    if (!confirm(`Confirmar el reporte de ${meta.reportName}?\n\nUna vez aprobado se desbloquea la siguiente fase.`)) return;
    setBusy(true);
    try {
      await callPhaseEndpoint("/api/phases/approve", {
        clientId: id,
        phase: phaseKey,
      });
      setReloadFlag((f) => f + 1);
    } catch (err) {
      const e = err as Error;
      alert(`No se pudo aprobar:\n${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function submitChangesRequest() {
    if (busy) return;
    if (!feedbackText.trim()) {
      alert("Escribí qué cambios querés.");
      return;
    }
    setBusy(true);
    try {
      // 1) marca como changes_requested guardando el feedback
      await callPhaseEndpoint("/api/phases/request-changes", {
        clientId: id,
        phase: phaseKey,
        feedback: feedbackText.trim(),
      });
      // 2) regenera con ese feedback
      await callPhaseEndpoint("/api/phases/generate", {
        clientId: id,
        phase: phaseKey,
        feedback: feedbackText.trim(),
      });
      setFeedbackText("");
      setFeedbackOpen(false);
      setReloadFlag((f) => f + 1);
    } catch (err) {
      const e = err as Error;
      alert(`No se pudo enviar el feedback:\n${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Header
        eyebrow={`Fase 0${idxPhase} · ${meta.reportName}`}
        title={meta.title}
        subtitle={meta.subtitle}
        onBack={() => router.push(`/cliente/${id}/fases`)}
      />

      {/* Status banner */}
      <StatusBanner
        status={status}
        version={report?.version ?? 1}
        generatedAt={report?.generated_at}
        isDirector={isDirector}
      />

      {/* Acciones (director) */}
      {isDirector && !isGenerating && (
        <div
          style={{
            display: "flex",
            gap: 10,
            marginBottom: 24,
            flexWrap: "wrap",
          }}
        >
          {/* Generar (cuando aún no hay reporte o está pending) */}
          {(!report || status === "pending") && (
            <button
              className={ui.btnSolid}
              onClick={() => generate()}
              disabled={busy}
            >
              {busy ? "Generando…" : `⚡ Generar ${meta.reportName}`}
            </button>
          )}

          {/* Confirmar / Proponer cambios (cuando hay draft) */}
          {isDraft && (
            <>
              <button
                className={ui.btnSolid}
                onClick={approve}
                disabled={busy}
                style={{ background: "var(--green-ok)" }}
              >
                ✓ Confirmar y desbloquear siguiente fase
              </button>
              <button
                className={ui.btnGhost}
                onClick={() => setFeedbackOpen(true)}
                disabled={busy}
              >
                ↻ Proponer cambios
              </button>
            </>
          )}

          {/* Regenerar tras cambios solicitados */}
          {isChangesRequested && (
            <button
              className={ui.btnSolid}
              onClick={() => generate(report?.feedback ?? undefined)}
              disabled={busy}
            >
              {busy ? "Regenerando…" : "↻ Regenerar con feedback"}
            </button>
          )}

          {/* Re-generar desde cero (cualquier estado distinto a generating) */}
          {hasContent && status !== "approved" && (
            <button
              className={ui.btnGhost}
              onClick={() => {
                if (
                  confirm(
                    "¿Regenerar el reporte desde cero, ignorando cambios actuales?",
                  )
                ) {
                  generate();
                }
              }}
              disabled={busy}
              style={{ fontSize: 11 }}
            >
              Regenerar desde cero
            </button>
          )}
        </div>
      )}

      {/* Modal de feedback */}
      {feedbackOpen && (
        <div
          onClick={(e) =>
            e.target === e.currentTarget && setFeedbackOpen(false)
          }
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(10,26,12,0.6)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 40,
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            style={{
              background: "var(--white)",
              maxWidth: 620,
              width: "100%",
              padding: 36,
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.25em",
                textTransform: "uppercase",
                color: "var(--sand-dark)",
                fontWeight: 600,
                marginBottom: 12,
              }}
            >
              Proponer cambios al reporte
            </div>
            <h2
              style={{
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                marginBottom: 8,
              }}
            >
              ¿Qué te gustaría que ajuste?
            </h2>
            <p
              style={{
                fontSize: 13,
                color: "var(--text-muted)",
                marginBottom: 20,
                lineHeight: 1.5,
              }}
            >
              Sé específico. El agente toma este feedback y regenera el
              reporte aplicando los cambios.
            </p>
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              rows={6}
              autoFocus
              placeholder="Ej: La sección de competidores tiene que enfocarse en empresas LATAM, no globales. El benchmark táctico que armaste para el sector está bien pero falta incluir TikTok como canal a explorar."
              style={{
                width: "100%",
                background: "var(--ivory)",
                border: "1px solid rgba(10,26,12,0.12)",
                padding: 14,
                color: "var(--deep-green)",
                fontSize: 14,
                fontWeight: 300,
                outline: "none",
                fontFamily: "inherit",
                resize: "vertical",
                marginBottom: 20,
              }}
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                className={ui.btnGhost}
                onClick={() => {
                  setFeedbackOpen(false);
                  setFeedbackText("");
                }}
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                className={ui.btnSolid}
                onClick={submitChangesRequest}
                disabled={busy}
              >
                {busy ? "Regenerando…" : "Enviar y regenerar →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback histórico (si hay) */}
      {report?.feedback && status === "changes_requested" && (
        <div
          style={{
            padding: "14px 18px",
            background: "rgba(176,75,58,0.06)",
            borderLeft: "3px solid var(--red-warn)",
            marginBottom: 24,
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--red-warn)",
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            Cambios solicitados
          </div>
          <div
            style={{
              fontSize: 13,
              color: "var(--deep-green)",
              whiteSpace: "pre-wrap",
              lineHeight: 1.5,
            }}
          >
            {report.feedback}
          </div>
        </div>
      )}

      {/* Contenido del reporte */}
      <div className={ui.panel}>
        <div className={ui.panelHead}>
          <div className={ui.panelTitle}>{meta.reportName}</div>
          {report?.usage ? (
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              Generado · {(report.usage as { input?: number }).input ?? 0}
              t input · {(report.usage as { output?: number }).output ?? 0}t
              output
            </div>
          ) : null}
        </div>

        {isGenerating ? (
          <div
            style={{
              padding: 64,
              textAlign: "center",
              color: "var(--text-muted)",
            }}
          >
            <div
              style={{
                fontSize: 32,
                color: "var(--sand)",
                marginBottom: 12,
              }}
            >
              ⏳
            </div>
            <div style={{ fontSize: 14, marginBottom: 6 }}>
              Generando con Claude…
            </div>
            <div style={{ fontSize: 12 }}>
              Esto tarda 30-60 segundos. La página se actualiza sola.
            </div>
          </div>
        ) : !hasContent ? (
          <div
            style={{
              padding: 48,
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: 13,
              background: "var(--off-white)",
              borderLeft: "3px solid var(--sand)",
            }}
          >
            {status === "pending"
              ? `Listo para generar el ${meta.reportName}.${
                  isDirector ? " Click en el botón de arriba." : ""
                }`
              : "Sin contenido todavía."}
          </div>
        ) : (
          <MarkdownRenderer content={report.content_md ?? ""} shiftHeadings />
        )}
      </div>
    </>
  );
}

function Header({
  eyebrow,
  title,
  subtitle,
  onBack,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  onBack: () => void;
}) {
  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>{eyebrow}</div>
          <h1>{title}</h1>
        </div>
        <button className={ui.btnSolid} onClick={onBack}>
          ← Volver a fases
        </button>
      </div>
      <div
        style={{
          background: "var(--deep-green)",
          color: "var(--off-white)",
          padding: 24,
          marginBottom: 24,
          borderLeft: "3px solid var(--sand)",
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.25em",
            textTransform: "uppercase",
            color: "var(--sand)",
            fontWeight: 600,
            marginBottom: 12,
          }}
        >
          ▢ Qué incluye esta fase
        </div>
        <div
          style={{
            fontSize: 15,
            lineHeight: 1.7,
            color: "rgba(232,228,220,0.9)",
          }}
        >
          {subtitle}
        </div>
      </div>
    </>
  );
}

function StatusBanner({
  status,
  version,
  generatedAt,
  isDirector,
}: {
  status: string;
  version: number;
  generatedAt?: string | null;
  isDirector: boolean;
}) {
  const color = phaseStatusColor(status as PhaseReport["status"]);
  const label = phaseStatusLabel(status as PhaseReport["status"]);

  return (
    <div
      style={{
        padding: "12px 18px",
        background: "var(--off-white)",
        borderLeft: `3px solid ${color}`,
        marginBottom: 16,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span
          style={{
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color,
            fontWeight: 700,
          }}
        >
          ● {label}
        </span>
        {version > 1 && (
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Versión {version}
          </span>
        )}
        {generatedAt && (
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Última generación · {new Date(generatedAt).toLocaleString("es-AR")}
          </span>
        )}
      </div>
      {!isDirector && status !== "approved" && (
        <span
          style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}
        >
          Solo el director puede aprobar o pedir cambios.
        </span>
      )}
    </div>
  );
}
