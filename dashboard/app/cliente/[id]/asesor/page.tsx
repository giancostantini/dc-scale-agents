"use client";

/**
 * /cliente/[id]/asesor — la oficina del Asesor IA del cliente (vista
 * equipo/director). Reúne en un solo lugar lo que el asesor produce y
 * la forma de interactuar con él:
 *   1. Oportunidades (portal_opportunities, variant team).
 *   2. Tendencias del sector (agente sector-trends).
 *   3. Chat para conversar con el asesor de contenido del cliente.
 */

import { use, useEffect, useState } from "react";
import { getClient } from "@/lib/storage";
import { getSupabase } from "@/lib/supabase/client";
import OpportunitiesCard from "@/components/OpportunitiesCard";
import SectorTrendsView, { type TrendItem } from "@/components/SectorTrendsView";
import ContentConsultantPanel from "@/components/ContentConsultantPanel";
import ui from "@/components/ClientUI.module.css";
import type { Client } from "@/lib/types";

interface TrendsResponse {
  items: TrendItem[];
  bodyMd: string | null;
  generatedAt: string | null;
  sector: string | null;
}

export default function AsesorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [client, setClient] = useState<Client | null>(null);
  const [trends, setTrends] = useState<TrendsResponse | null>(null);
  const [loadingTrends, setLoadingTrends] = useState(true);

  useEffect(() => {
    getClient(id).then((c) => setClient(c ?? null));
    let active = true;
    (async () => {
      try {
        const {
          data: { session },
        } = await getSupabase().auth.getSession();
        if (!session) return;
        const res = await fetch(`/api/clients/${id}/trends`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok && active) setTrends((await res.json()) as TrendsResponse);
      } finally {
        if (active) setLoadingTrends(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Asesor IA · {client?.name ?? ""}</div>
          <h1>Asesor</h1>
        </div>
      </div>

      <p
        style={{
          fontSize: 13,
          color: "var(--text-muted)",
          marginTop: -6,
          marginBottom: 20,
          lineHeight: 1.5,
          maxWidth: 720,
        }}
      >
        Lo que el asesor de IA detecta para {client?.name ?? "el cliente"}:
        oportunidades, tendencias del sector y un chat para pedirle ideas o
        profundizar. Las oportunidades ya no se muestran en el portal del
        cliente — se gestionan desde acá.
      </p>

      {/* Oportunidades | Tendencias, lado a lado (se apilan en angosto). */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 20,
          alignItems: "start",
          marginBottom: 24,
        }}
      >
        <section>
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--sand-dark)",
              fontWeight: 700,
              marginBottom: 10,
            }}
          >
            Oportunidades
          </div>
          <OpportunitiesCard clientId={id} variant="team" />
          {/* OpportunitiesCard no renderiza nada si no hay; dejamos una nota. */}
          <p
            style={{
              fontSize: 12.5,
              color: "var(--text-muted)",
              fontStyle: "italic",
              marginTop: 4,
            }}
          >
            Si no aparece nada, el asesor todavía no cargó oportunidades esta
            semana.
          </p>
        </section>

        <section
          className={ui.panel}
          style={{ background: "var(--white)", padding: 18 }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--sand-dark)",
              fontWeight: 700,
              marginBottom: 12,
            }}
          >
            Tendencias del sector
          </div>
          {loadingTrends ? (
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Cargando tendencias…
            </div>
          ) : (
            <SectorTrendsView
              items={trends?.items ?? []}
              fallbackMarkdown={trends?.bodyMd}
              emptyLabel="Todavía no hay tendencias cargadas. El agente las actualiza cada semana."
            />
          )}
        </section>
      </div>

      {/* Chat con el asesor. */}
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--sand-dark)",
          fontWeight: 700,
          marginBottom: 10,
        }}
      >
        Chat con el asesor
      </div>
      <ContentConsultantPanel clientId={id} clientName={client?.name} />
    </>
  );
}
