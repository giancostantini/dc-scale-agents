"use client";

/**
 * /tendencias — vista INTERNA (director/team) del consolidado de tendencias de
 * TODOS los clientes. Acceso desde la card del Hub ("Tendencias del sector").
 *
 * Client component: fetch a /api/trends/consolidated (service role + gating
 * director/team). Reusa <SectorTrendsView /> por cliente.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Topbar from "@/components/Topbar";
import SectorTrendsView from "@/components/SectorTrendsView";
import {
  getCurrentProfile,
  hasSession,
  type Profile,
} from "@/lib/supabase/auth";
import { getSupabase } from "@/lib/supabase/client";
import type { ClientTrends } from "@/lib/sector-trends";
import Link from "next/link";
import { IArrowLeft } from "@/components/icons/BrandIcons";

export default function TendenciasInternasPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [clients, setClients] = useState<ClientTrends[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    hasSession().then(async (has) => {
      if (!has) {
        router.replace("/");
        return;
      }
      const p = await getCurrentProfile();
      if (!active) return;
      if (!p) {
        router.replace("/");
        return;
      }
      if (p.role === "client") {
        router.replace("/portal");
        return;
      }
      setProfile(p);
      try {
        const supabase = getSupabase();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session) {
          const res = await fetch("/api/trends/consolidated", {
            headers: { authorization: `Bearer ${session.access_token}` },
          });
          if (res.ok) {
            const data = (await res.json()) as { clients: ClientTrends[] };
            if (active) setClients(data.clients ?? []);
          }
        }
      } catch {
        // silencioso — se muestra el estado vacío
      }
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [router]);

  if (!profile) return null;

  return (
    <>
      <Topbar showPrimary={false} searchPlaceholder="Buscar tendencias…" />

      <main style={{ padding: "32px 40px 80px", maxWidth: 1400, margin: "0 auto" }}>
        <Link
          href="/hub"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: "var(--text-muted)",
            textDecoration: "none",
            marginBottom: 18,
          }}
        >
          <IArrowLeft size={15} /> Volver al hub
        </Link>
        <header style={{ marginBottom: 28 }}>
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
            Inteligencia de mercado
          </div>
          <h1
            style={{
              fontSize: 34,
              fontWeight: 700,
              margin: 0,
              color: "var(--deep-green)",
              letterSpacing: "-0.02em",
            }}
          >
            Tendencias del sector
          </h1>
          <p
            style={{
              fontSize: 13.5,
              color: "var(--text-muted)",
              marginTop: 8,
              maxWidth: 640,
              lineHeight: 1.55,
            }}
          >
            Consolidado de todos los clientes: qué contenido funciona en cada
            nicho, qué trae tráfico y qué convierte — con la fuente de cada dato.
            El agente lo actualiza cada semana.
          </p>
        </header>

        {loading ? (
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Cargando…</p>
        ) : clients.length === 0 ? (
          <div
            style={{
              background: "var(--white)",
              border: "1px dashed var(--hairline)",
              borderRadius: "var(--r-lg)",
              padding: 40,
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: 13,
            }}
          >
            Todavía no hay tendencias generadas. El agente corre cada semana, o
            disparalo manualmente desde Actions → Sector Trends.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 28 }}>
            {clients.map((ct) => (
              <section
                key={ct.client}
                style={{
                  background: "var(--white)",
                  border: "1px solid var(--hairline)",
                  borderRadius: "var(--r-lg)",
                  padding: "22px 26px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginBottom: 16,
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  <h2
                    style={{
                      fontSize: 19,
                      fontWeight: 700,
                      margin: 0,
                      color: "var(--deep-green)",
                    }}
                  >
                    {ct.name}
                  </h2>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {ct.sector ?? ""}
                    {ct.generatedAt ? ` · actualizado ${ct.generatedAt}` : ""}
                  </span>
                </div>
                <SectorTrendsView
                  items={ct.items}
                  fallbackMarkdown={ct.bodyMd}
                  emptyLabel="Sin tendencias para este cliente todavía."
                />
              </section>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
