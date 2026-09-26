"use client";

/**
 * Portal · Campañas — qué campañas de Meta están corriendo y cómo rinden.
 *
 * Datos: GET /api/portal/campaigns (meta_campaigns_daily, mig 106). Por
 * decisión de Gian el cliente ve solo resultados: sin inversión ni costos
 * (el endpoint ya no los devuelve).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getCurrentProfile,
  hasSession,
  type Profile,
} from "@/lib/supabase/auth";
import { getClient } from "@/lib/storage";
import { getSupabase } from "@/lib/supabase/client";
import PortalHeader from "@/components/PortalHeader";
import type { Client } from "@/lib/types";
import portalStyles from "../portal.module.css";

interface Metrics {
  results: number;
  impressions: number;
  clicks: number;
  ctr: number | null;
  roas: number | null;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  active: boolean;
  objective: string | null;
  resultType: string | null;
  last7: Metrics;
  month: Metrics;
}

type Range = "last7" | "month";

const fmt = (v: number) => v.toLocaleString("es-UY");

export default function PortalCampanasPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [updatedTo, setUpdatedTo] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("last7");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    hasSession().then(async (has) => {
      if (!has) {
        router.replace("/");
        return;
      }
      const p = await getCurrentProfile();
      if (!active) return;
      if (!p || p.role !== "client") {
        router.replace(p ? "/hub" : "/");
        return;
      }
      setProfile(p);
      if (p.client_id) {
        const c = await getClient(p.client_id);
        if (active) setClient(c ?? null);
      }
      try {
        const {
          data: { session },
        } = await getSupabase().auth.getSession();
        const res = await fetch("/api/portal/campaigns", {
          headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
        });
        const data = (await res.json().catch(() => ({}))) as {
          campaigns?: Campaign[];
          updatedTo?: string | null;
          error?: string;
        };
        if (!active) return;
        if (!res.ok) setError(data.error ?? "No pudimos cargar las campañas.");
        setCampaigns(data.campaigns ?? []);
        setUpdatedTo(data.updatedTo ?? null);
      } catch {
        if (active) setError("No pudimos cargar las campañas.");
      }
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [router]);

  if (loading || !profile) return null;

  const running = campaigns.filter((c) => c.active);
  const others = campaigns.filter((c) => !c.active);

  return (
    <>
      <PortalHeader client={client} profile={profile} eyebrow="Campañas" showBack />

      <main className={portalStyles.wrap}>
        <section className={portalStyles.heroBlock}>
          <div className={portalStyles.heroLeft}>
            <div className={portalStyles.heroEyebrow}>Meta · Facebook e Instagram</div>
            <h1 className={portalStyles.heroTitle}>Campañas</h1>
            <p className={portalStyles.heroSub}>
              Las campañas que están corriendo y los resultados que traen.
              {updatedTo &&
                ` Datos hasta el ${new Date(`${updatedTo}T12:00:00`).toLocaleDateString("es-AR", {
                  day: "numeric",
                  month: "long",
                })}.`}
            </p>
          </div>
        </section>

        {error && (
          <div style={{ marginBottom: 16, fontSize: 13, color: "var(--red-warn)" }}>{error}</div>
        )}

        {campaigns.length === 0 ? (
          <div
            style={{
              padding: 40,
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: 13,
              background: "var(--white)",
              borderRadius: "var(--r-lg)",
              border: "1px solid rgba(10,26,12,0.08)",
            }}
          >
            Todavía no hay campañas conectadas. Cuando el equipo conecte tu
            cuenta publicitaria de Meta, acá vas a ver cada campaña y sus
            resultados.
          </div>
        ) : (
          <>
            <div
              role="tablist"
              aria-label="Período"
              style={{
                display: "inline-flex",
                gap: 0,
                marginBottom: 18,
                background: "var(--off-white)",
                padding: 4,
                borderRadius: 8,
                border: "1px solid rgba(10,26,12,0.08)",
              }}
            >
              {(
                [
                  ["last7", "Últimos 7 días"],
                  ["month", "Este mes"],
                ] as [Range, string][]
              ).map(([r, label]) => (
                <button
                  key={r}
                  type="button"
                  role="tab"
                  aria-selected={range === r}
                  onClick={() => setRange(r)}
                  style={{
                    padding: "8px 16px",
                    fontSize: 12,
                    fontWeight: 700,
                    background: range === r ? "var(--white)" : "transparent",
                    color: range === r ? "var(--deep-green)" : "var(--text-muted)",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    boxShadow: range === r ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <CampaignSection
              title={`Corriendo ahora · ${running.length}`}
              empty="No hay campañas activas en este momento."
              list={running}
              range={range}
            />
            {others.length > 0 && (
              <CampaignSection
                title={`Pausadas o terminadas este mes · ${others.length}`}
                list={others}
                range={range}
                muted
              />
            )}
          </>
        )}
      </main>
    </>
  );
}

function CampaignSection({
  title,
  empty,
  list,
  range,
  muted,
}: {
  title: string;
  empty?: string;
  list: Campaign[];
  range: Range;
  muted?: boolean;
}) {
  return (
    <section style={{ marginBottom: 28 }}>
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--sand-dark)",
          fontWeight: 700,
          marginBottom: 12,
        }}
      >
        {title}
      </div>
      {list.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)", fontStyle: "italic" }}>{empty}</div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 12,
            opacity: muted ? 0.8 : 1,
          }}
        >
          {list.map((c) => (
            <CampaignCard key={c.id} c={c} m={c[range]} />
          ))}
        </div>
      )}
    </section>
  );
}

function CampaignCard({ c, m }: { c: Campaign; m: Metrics }) {
  const resultLabel = c.resultType ?? "resultados";
  return (
    <article
      style={{
        background: "var(--white)",
        border: "1px solid rgba(10,26,12,0.08)",
        borderRadius: "var(--r-md)",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--deep-green)", lineHeight: 1.35 }}>
          {c.name}
        </div>
        <span
          style={{
            flexShrink: 0,
            padding: "3px 9px",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            borderRadius: "var(--r-pill)",
            color: c.active ? "var(--white)" : "var(--text-muted)",
            background: c.active ? "var(--green-ok)" : "var(--off-white)",
          }}
        >
          {c.status}
        </span>
      </div>

      <div>
        <div style={{ fontSize: 28, fontWeight: 700, color: "var(--deep-green)", letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
          {fmt(m.results)}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{resultLabel}</div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
          paddingTop: 10,
          borderTop: "1px solid rgba(10,26,12,0.06)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <Stat label="Impresiones" value={fmt(m.impressions)} />
        <Stat label="CTR" value={m.ctr != null ? `${(m.ctr * 100).toFixed(2)}%` : "—"} />
        <Stat label="ROAS" value={m.roas != null ? `${m.roas.toFixed(1)}x` : "—"} />
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 9,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--sand-dark)",
          fontWeight: 600,
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--deep-green)" }}>{value}</div>
    </div>
  );
}
