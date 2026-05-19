"use client";

import { useState } from "react";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { extractExecutiveSummary } from "@/lib/phases";
import { getSupabase } from "@/lib/supabase/client";
import type { Client, PhaseReport } from "@/lib/types";
import styles from "./PhaseRoadmap.module.css";

/**
 * Abre el PDF subido del reporte aprobado (signed URL, en una pestaña nueva).
 * Hereda la auth del cliente desde la sesión de Supabase y consulta
 * /api/phases/uploaded-pdf que devuelve un signed URL válido por 30 minutos.
 */
async function openUploadedPdf(
  clientId: string,
  phase: string,
  version: number,
): Promise<void> {
  try {
    const supabase = getSupabase();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      alert("Sin sesión. Refrescá la página.");
      return;
    }
    const res = await fetch(
      `/api/phases/uploaded-pdf?clientId=${encodeURIComponent(clientId)}&phase=${phase}&version=${version}`,
      { headers: { Authorization: `Bearer ${session.access_token}` } },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.signedUrl) {
      alert(data?.error ?? `No se pudo abrir el PDF (HTTP ${res.status})`);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  } catch (err) {
    console.error("openUploadedPdf failed:", err);
    alert("No se pudo abrir el PDF. Probá de nuevo.");
  }
}

const PHASES = [
  { key: "diagnostico", label: "Diagnóstico", short: "Diag." },
  { key: "estrategia", label: "Estrategia", short: "Estrat." },
  { key: "setup", label: "Setup", short: "Setup" },
  { key: "lanzamiento", label: "Lanzamiento", short: "Launch" },
] as const;

type PhaseKey = (typeof PHASES)[number]["key"];

type PhaseStatus =
  | "approved"
  | "draft"
  | "review"
  | "generating"
  | "pending"
  | "locked"
  | "active";

export interface PhaseRoadmapProps {
  client: Client;
  reports: PhaseReport[];
  /** Si se pasa, en el drawer aparece un botón "Comentar este reporte" cuando
   *  la fase tiene un reporte aprobado. El padre suele abrir un ReportCommentsDrawer. */
  onCommentReport?: (reportId: string, phaseLabel: string) => void;
}

/**
 * Barra horizontal con las 4 fases del negocio. Visualiza para el cliente
 * en qué etapa está, qué ya está aprobado y qué viene. Click en una fase
 * abre un drawer con el resumen ejecutivo del reporte (si está aprobado).
 *
 * Lógica de estado:
 * - active: la fase actual del cliente (clients.phase)
 * - approved: report con status approved
 * - review/draft/generating: report en progreso
 * - pending: la fase anterior está aprobada pero esta no se generó aún
 * - locked: fases que vienen después y aún no son accesibles
 */
export default function PhaseRoadmap({
  client,
  reports,
  onCommentReport,
}: PhaseRoadmapProps) {
  const [openPhase, setOpenPhase] = useState<PhaseKey | null>(null);

  // Index de phase → report para lookup O(1)
  const reportByPhase = new Map<string, PhaseReport>();
  for (const r of reports) {
    reportByPhase.set(r.phase, r);
  }

  // Calcular el estado efectivo de cada fase
  const states: Array<{
    key: PhaseKey;
    label: string;
    short: string;
    status: PhaseStatus;
    report?: PhaseReport;
  }> = [];

  for (let i = 0; i < PHASES.length; i++) {
    const p = PHASES[i];
    const report = reportByPhase.get(p.key);
    const isActive = client.phase === p.key;

    let status: PhaseStatus;
    if (report?.status === "approved") {
      status = "approved";
    } else if (report?.status === "draft" || report?.status === "changes_requested") {
      status = "draft";
    } else if (report?.status === "generating") {
      status = "generating";
    } else if (i === 0) {
      // La primera fase nunca está locked
      status = report ? "pending" : isActive ? "active" : "pending";
    } else {
      // Esta fase requiere que la anterior esté approved
      const prev = PHASES[i - 1].key;
      const prevApproved = reportByPhase.get(prev)?.status === "approved";
      if (!prevApproved) {
        status = "locked";
      } else {
        status = report ? "pending" : isActive ? "active" : "pending";
      }
    }

    // Override: si client.phase apunta a esta fase, marcar activa visualmente
    // (salvo que ya esté approved — eso gana visualmente).
    if (isActive && status !== "approved") {
      status = "active";
    }

    states.push({ ...p, status, report });
  }

  const opened = openPhase ? states.find((s) => s.key === openPhase) : null;

  return (
    <section className={styles.wrapper} aria-label="Roadmap de fases">
      <div className={styles.header}>
        <div className={styles.eyebrow}>Tu fase del negocio</div>
        <div className={styles.subtle}>
          Click en una fase para ver el resumen del reporte
        </div>
      </div>

      <ol className={styles.steps}>
        {states.map((s, i) => {
          const clickable =
            s.status === "approved" ||
            s.status === "draft" ||
            s.status === "active" ||
            s.status === "pending";
          return (
            <li key={s.key} className={styles.stepWrap}>
              <button
                type="button"
                className={`${styles.step} ${styles[`step_${s.status}`]}`}
                onClick={() => clickable && setOpenPhase(s.key)}
                disabled={!clickable}
                aria-current={s.status === "active" ? "step" : undefined}
              >
                <span className={styles.stepNum}>{i + 1}</span>
                <span className={styles.stepLabelDesktop}>{s.label}</span>
                <span className={styles.stepLabelMobile}>{s.short}</span>
                <span className={styles.stepBadge}>{statusBadge(s.status)}</span>
              </button>
              {i < states.length - 1 && (
                <span
                  className={`${styles.connector} ${
                    s.status === "approved" ? styles.connectorDone : ""
                  }`}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>

      {opened && (() => {
        const phaseIndex = PHASES.findIndex((p) => p.key === opened.key);
        const isFirstPhase = phaseIndex === 0;
        const showCommentBtn =
          opened.report?.status === "approved" && Boolean(onCommentReport);
        return (
          <div
            className={styles.drawerBackdrop}
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpenPhase(null);
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="phase-drawer-title"
          >
            <div className={styles.drawer}>
              <header className={styles.drawerHeader}>
                <div>
                  <div className={styles.drawerEyebrow}>
                    Fase {phaseIndex + 1} · {statusLabel(opened.status)}
                  </div>
                  <h2 id="phase-drawer-title" className={styles.drawerTitle}>
                    {opened.label}
                  </h2>
                </div>
                <button
                  type="button"
                  className={styles.drawerClose}
                  onClick={() => setOpenPhase(null)}
                  aria-label="Cerrar"
                >
                  ×
                </button>
              </header>

              <div className={styles.drawerBody}>
                {opened.report?.status === "approved" && opened.report.content_md ? (
                  <>
                    {opened.report.approved_at && (
                      <div className={styles.drawerMeta}>
                        Aprobado el{" "}
                        {new Date(opened.report.approved_at).toLocaleDateString(
                          "es-AR",
                          { day: "2-digit", month: "long", year: "numeric" },
                        )}
                      </div>
                    )}
                    <MarkdownRenderer
                      content={
                        extractExecutiveSummary(opened.report.content_md) ||
                        opened.report.content_md.slice(0, 1200)
                      }
                      shiftHeadings
                    />
                  </>
                ) : opened.report?.status === "draft" ||
                  opened.report?.status === "changes_requested" ? (
                  <p className={styles.drawerMuted}>
                    El equipo está trabajando en este reporte. Vas a verlo acá
                    cuando esté aprobado.
                  </p>
                ) : opened.report?.status === "generating" ? (
                  <p className={styles.drawerMuted}>
                    El reporte se está generando. Vuelve en unos minutos.
                  </p>
                ) : opened.status === "active" ? (
                  <p className={styles.drawerMuted}>
                    Esta es tu fase actual. Trabajando con el equipo en lo que
                    necesitamos para cerrarla.
                  </p>
                ) : isFirstPhase ? (
                  <p className={styles.drawerMuted}>
                    Es la primera fase de tu cuenta. El equipo va a armar tu
                    diagnóstico y vas a verlo acá cuando esté listo.
                  </p>
                ) : (
                  <p className={styles.drawerMuted}>
                    Esta fase aún no se inició. Vamos en orden — primero
                    cerramos la fase anterior.
                  </p>
                )}
              </div>

              {opened.report?.status === "approved" && opened.report && (
                <footer className={styles.drawerFooter}>
                  {opened.report.pdf_path && (
                    <button
                      type="button"
                      className={styles.drawerPdfBtn}
                      onClick={() =>
                        openUploadedPdf(
                          client.id,
                          opened.key,
                          opened.report!.version,
                        )
                      }
                    >
                      Ver PDF
                    </button>
                  )}
                  {showCommentBtn && (
                    <button
                      type="button"
                      className={styles.drawerCommentBtn}
                      onClick={() => {
                        onCommentReport!(opened.report!.id, opened.label);
                        setOpenPhase(null);
                      }}
                    >
                      Comentar este reporte
                    </button>
                  )}
                </footer>
              )}
            </div>
          </div>
        );
      })()}
    </section>
  );
}

function statusBadge(s: PhaseStatus): string {
  switch (s) {
    case "approved":
      return "✓";
    case "active":
      return "●";
    case "draft":
    case "review":
      return "◐";
    case "generating":
      return "◌";
    case "pending":
      return "○";
    case "locked":
      return "—";
  }
}

function statusLabel(s: PhaseStatus): string {
  switch (s) {
    case "approved":
      return "Aprobado";
    case "active":
      return "Fase activa";
    case "draft":
      return "Borrador en revisión";
    case "review":
      return "En revisión";
    case "generating":
      return "Generándose";
    case "pending":
      return "Pendiente";
    case "locked":
      return "Bloqueada";
  }
}
