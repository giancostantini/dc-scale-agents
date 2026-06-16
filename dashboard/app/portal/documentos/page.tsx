"use client";

/**
 * /portal/documentos
 *
 * Vista limpia de documentos del cliente — antes mostrábamos el
 * PhaseRoadmap (fases del negocio) acá, pero el director pidió
 * cambiarlo a cards que abran el PDF directo, sin la metáfora de
 * roadmap. También quitamos el logo del cliente en el header (el
 * director lo encontraba duplicado con el lockup de D&C).
 *
 * Lista las 4 fases: Diagnóstico, Estrategia, Setup, Lanzamiento.
 * Cada fase puede tener (o no) un PhaseReport con su PDF. Si el
 * reporte tiene pdf_path → la card es clickeable y abre el PDF en
 * una pestaña nueva. Si no, la card muestra "Pendiente" en gris.
 *
 * Acceso: solo role='client'. Otros roles caen al hub respectivo.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PortalHeader from "@/components/PortalHeader";
import { getCurrentProfile, type Profile } from "@/lib/supabase/auth";
import { getClient } from "@/lib/storage";
import { listPhaseReports } from "@/lib/phases";
import { getSupabase } from "@/lib/supabase/client";
import type {
  Client,
  PhaseKey,
  PhaseReport,
  PhaseStatus,
} from "@/lib/types";
import { PHASE_ORDER } from "@/lib/types";
import portalStyles from "../portal.module.css";

// Labels mostrados en las cards.
const PHASE_LABELS: Record<PhaseKey, string> = {
  diagnostico: "Diagnóstico",
  estrategia: "Estrategia",
  setup: "Setup",
  lanzamiento: "Lanzamiento",
};

// Bajada corta de cada fase — la mostramos en el cuerpo de la card
// para dar contexto, distinto del título.
const PHASE_BLURB: Record<PhaseKey, string> = {
  diagnostico:
    "Análisis del estado actual del negocio: oportunidades, gaps y prioridades.",
  estrategia:
    "Plan de crecimiento: objetivos, públicos, canales y mix editorial.",
  setup:
    "Implementación operativa: stack, integraciones, equipo y procesos.",
  lanzamiento:
    "Activación del plan: primeros resultados, ajustes y siguientes pasos.",
};

// Status del reporte → label + color para la pill.
const STATUS_META: Record<
  PhaseStatus,
  { label: string; bg: string; color: string }
> = {
  pending: {
    label: "Pendiente",
    bg: "rgba(10,26,12,0.05)",
    color: "var(--text-muted)",
  },
  generating: {
    label: "Generando",
    bg: "rgba(196,168,130,0.18)",
    color: "var(--sand-dark)",
  },
  draft: {
    label: "Borrador",
    bg: "rgba(196,168,130,0.18)",
    color: "var(--sand-dark)",
  },
  changes_requested: {
    label: "Cambios pedidos",
    bg: "rgba(196,82,82,0.12)",
    color: "#a94343",
  },
  approved: {
    label: "Disponible",
    bg: "rgba(47,125,79,0.12)",
    color: "var(--green-ok)",
  },
};

export default function PortalDocumentosPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [reports, setReports] = useState<PhaseReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getCurrentProfile().then(async (p) => {
      if (!active) return;
      if (!p) {
        router.replace("/");
        return;
      }
      if (p.role !== "client") {
        router.replace("/hub");
        return;
      }
      setProfile(p);
      if (p.client_id) {
        const [c, rs] = await Promise.all([
          getClient(p.client_id),
          listPhaseReports(p.client_id),
        ]);
        if (active) {
          setClient(c ?? null);
          setReports(rs);
        }
      }
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [router]);

  if (loading || !profile) return null;

  // Index de reportes por phase para mostrar uno por card.
  const reportByPhase: Record<PhaseKey, PhaseReport | undefined> = {
    diagnostico: undefined,
    estrategia: undefined,
    setup: undefined,
    lanzamiento: undefined,
  };
  for (const r of reports) {
    reportByPhase[r.phase] = r;
  }

  /** Abrir el PDF en una pestaña nueva. Si pdf_path existe, lo
   *  resolvemos a una URL firmada del bucket client-onboarding y
   *  redirigimos. */
  async function openReportPdf(r: PhaseReport) {
    if (!r.pdf_path) return;
    try {
      const supabase = getSupabase();
      const { data } = await supabase.storage
        .from("client-onboarding")
        .createSignedUrl(r.pdf_path, 60 * 10);
      if (data?.signedUrl) {
        window.open(data.signedUrl, "_blank", "noopener,noreferrer");
      } else {
        alert("No se pudo abrir el documento. Probá de nuevo en un rato.");
      }
    } catch (e) {
      alert(`No se pudo abrir el documento: ${(e as Error).message}`);
    }
  }

  return (
    <>
      {/* Importante: NO pasamos logoUrl al PortalHeader — antes se
          duplicaba el logo del cliente con el lockup de D&C. */}
      <PortalHeader
        client={client}
        profile={profile}
        eyebrow="Documentos"
      />
      <main className={portalStyles.wrap}>
        <section className={portalStyles.heroBlock}>
          <div className={portalStyles.heroLeft}>
            <div className={portalStyles.heroEyebrow}>Documentos</div>
            <h1 className={portalStyles.heroTitle}>Tus documentos</h1>
            <p className={portalStyles.heroSub}>
              Acá viven los reportes que el equipo te fue entregando
              durante la sociedad. Tocá una card para abrir el PDF.
            </p>
          </div>
        </section>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 16,
            marginTop: 8,
          }}
        >
          {PHASE_ORDER.map((phase) => {
            const r = reportByPhase[phase];
            const status: PhaseStatus = r?.status ?? "pending";
            const meta = STATUS_META[status];
            const clickable =
              status === "approved" && !!r?.pdf_path;

            return (
              <button
                key={phase}
                type="button"
                onClick={() => {
                  if (clickable && r) openReportPdf(r);
                }}
                disabled={!clickable}
                style={{
                  textAlign: "left",
                  padding: 20,
                  background: "var(--white)",
                  border: "1px solid rgba(10,26,12,0.08)",
                  borderLeft: clickable
                    ? "3px solid var(--green-ok)"
                    : "3px solid rgba(10,26,12,0.1)",
                  borderRadius: "var(--r-md)",
                  cursor: clickable ? "pointer" : "default",
                  opacity: clickable ? 1 : 0.7,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  minHeight: 180,
                  fontFamily: "inherit",
                  transition: "all 0.15s",
                  boxShadow: clickable
                    ? "var(--shadow-sm)"
                    : "none",
                }}
                onMouseEnter={(e) => {
                  if (clickable) {
                    e.currentTarget.style.borderColor =
                      "var(--green-ok)";
                    e.currentTarget.style.boxShadow =
                      "0 4px 16px rgba(47,125,79,0.12)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (clickable) {
                    e.currentTarget.style.borderColor =
                      "rgba(10,26,12,0.08)";
                    e.currentTarget.style.boxShadow =
                      "var(--shadow-sm)";
                  }
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      color: "var(--sand-dark)",
                      fontWeight: 700,
                    }}
                  >
                    Fase {PHASE_ORDER.indexOf(phase) + 1}
                  </div>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      padding: "3px 8px",
                      borderRadius: 999,
                      background: meta.bg,
                      color: meta.color,
                    }}
                  >
                    {meta.label}
                  </span>
                </div>

                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: "var(--deep-green)",
                    letterSpacing: "-0.02em",
                    lineHeight: 1.15,
                  }}
                >
                  {PHASE_LABELS[phase]}
                </div>

                <div
                  style={{
                    fontSize: 13,
                    color: "var(--text-soft, #5a6a5e)",
                    lineHeight: 1.5,
                    flex: 1,
                  }}
                >
                  {PHASE_BLURB[phase]}
                </div>

                <div
                  style={{
                    fontSize: 11,
                    color: clickable
                      ? "var(--deep-green)"
                      : "var(--text-muted)",
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                  }}
                >
                  {clickable
                    ? "Abrir PDF →"
                    : status === "pending"
                      ? "Disponible cuando el equipo lo apruebe"
                      : "El reporte está en preparación"}
                </div>
              </button>
            );
          })}
        </div>
      </main>
    </>
  );
}
