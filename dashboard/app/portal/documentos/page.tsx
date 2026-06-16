"use client";

/**
 * /portal/documentos
 *
 * Hub de documentos del cliente — antes vivía en el home del portal
 * como sección "Tus fases del negocio". El director pidió moverlo
 * acá para limpiar el home (era una sección grande que ocupaba
 * mucho real estate sin cambiar día a día).
 *
 * Contenido:
 *   · PhaseRoadmap: las 4 fases del negocio (Diagnóstico, Estrategia,
 *     Setup, Lanzamiento) con sus reportes asociados. Click en una
 *     fase abre un modal con el detalle, botón "Ver PDF" y CTA a
 *     "Comentar reporte".
 *   · ReportCommentsDrawer: lo abre el roadmap cuando el cliente
 *     quiere agregar un comentario.
 *
 * Acceso: solo role='client'. Otros roles caen al hub respectivo.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PortalHeader from "@/components/PortalHeader";
import PhaseRoadmap from "@/components/PhaseRoadmap";
import ReportCommentsDrawer from "@/components/ReportCommentsDrawer";
import { getCurrentProfile, type Profile } from "@/lib/supabase/auth";
import { getClient } from "@/lib/storage";
import { listPhaseReports } from "@/lib/phases";
import type { Client, PhaseReport } from "@/lib/types";
import portalStyles from "../portal.module.css";

export default function PortalDocumentosPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [reports, setReports] = useState<PhaseReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentsDrawer, setCommentsDrawer] = useState<{
    open: boolean;
    reportId: string | null;
    reportLabel: string;
  }>({ open: false, reportId: null, reportLabel: "" });

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

  return (
    <>
      <PortalHeader
        client={client}
        profile={profile}
        logoUrl={client?.logo_url ?? null}
        eyebrow="Documentos · Fases del negocio"
      />
      <main className={portalStyles.wrap}>
        <section className={portalStyles.heroBlock}>
          <div className={portalStyles.heroLeft}>
            <div className={portalStyles.heroEyebrow}>Documentos</div>
            <h1 className={portalStyles.heroTitle}>
              Tus fases del negocio
            </h1>
            <p className={portalStyles.heroSub}>
              Acá viven los <strong>reportes de cada fase</strong> de la
              sociedad: Diagnóstico, Estrategia, Setup y Lanzamiento.
              Tocá una fase para ver el resumen ejecutivo, descargar el
              PDF y dejar comentarios al equipo.
            </p>
          </div>
        </section>

        {client && (
          <PhaseRoadmap
            client={client}
            reports={reports}
            onCommentReport={(reportId, reportLabel) =>
              setCommentsDrawer({ open: true, reportId, reportLabel })
            }
          />
        )}

        <ReportCommentsDrawer
          open={commentsDrawer.open}
          reportId={commentsDrawer.reportId}
          reportLabel={commentsDrawer.reportLabel}
          onClose={() =>
            setCommentsDrawer({
              open: false,
              reportId: null,
              reportLabel: "",
            })
          }
        />
      </main>
    </>
  );
}
