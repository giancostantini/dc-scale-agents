"use client";

/** Reporting del producto (growth) — agrega en vivo el contenido (mig 108)
 *  y la pauta (mig 109) del período elegido. No tiene tabla propia. */

import { use, useEffect, useMemo, useState } from "react";
import { PRODUCT_BY_SLUG } from "@/lib/productos";
import { getProductoContent, getProductoCampaigns } from "@/lib/producto-growth";
import type { ProductoCampaign } from "@/lib/producto-growth";
import type { ContentPost } from "@/lib/types";
import { PageHead, KpiCards, Panel, EmptyState } from "@/components/producto/ProductUI";

const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const NET_LABEL: Record<string, string> = { ig: "Instagram", tt: "TikTok", in: "LinkedIn", fb: "Facebook" };

function money(n: number, moneda: string) {
  return `${moneda} ${n.toLocaleString("es-UY", { maximumFractionDigits: 0 })}`;
}

export default function ReportingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const p = PRODUCT_BY_SLUG[slug];
  const today = new Date();
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [campaigns, setCampaigns] = useState<ProductoCampaign[]>([]);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  useEffect(() => {
    getProductoContent(slug).then(setPosts);
    getProductoCampaigns(slug).then(setCampaigns);
  }, [slug]);

  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;

  const monthPosts = useMemo(
    () => posts.filter((pp) => pp.date.startsWith(`${monthKey}-`)),
    [posts, monthKey],
  );
  const monthCampaigns = useMemo(
    () =>
      campaigns.filter((c) => {
        // Sin fechas → se considera siempre vigente; con fechas → solape con el mes.
        if (!c.fechaInicio && !c.fechaFin) return true;
        const ini = c.fechaInicio ?? "0000-01-01";
        const fin = c.fechaFin ?? "9999-12-31";
        const mStart = `${monthKey}-01`;
        const mEnd = `${monthKey}-31`;
        return ini <= mEnd && fin >= mStart;
      }),
    [campaigns, monthKey],
  );

  // Contenido por red.
  const porRed = useMemo(() => {
    const m: Record<string, { total: number; pub: number }> = {};
    for (const pp of monthPosts) {
      const n = pp.network;
      m[n] = m[n] ?? { total: 0, pub: 0 };
      m[n].total++;
      if (pp.status === "published") m[n].pub++;
    }
    return m;
  }, [monthPosts]);

  if (!p) return null;

  const publicadas = monthPosts.filter((pp) => pp.status === "published").length;
  const inversion = monthCampaigns.reduce((s, c) => s + c.inversion, 0);
  const leads = monthCampaigns.reduce((s, c) => s + c.leads, 0);
  const alcance = monthCampaigns.reduce((s, c) => s + c.alcance, 0);
  const cpl = leads > 0 ? inversion / leads : 0;
  const moneda = monthCampaigns[0]?.moneda ?? "UYU";

  return (
    <>
      <div style={{ marginBottom: 4 }}>
        <a href={`/producto/${slug}/growth`} style={{ color: "var(--sand-dark)", fontSize: 12, textDecoration: "none" }}>← Growth</a>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <PageHead eyebrow={`${p.name} · growth`} title="Reporting" accent={p.accent} />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => { if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1); }} style={navBtn}>‹</button>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--deep-green)", minWidth: 120, textAlign: "center" }}>{MONTHS_ES[month]} {year}</span>
          <button onClick={() => { if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1); }} style={navBtn}>›</button>
        </div>
      </div>

      <KpiCards
        items={[
          { label: "Contenidos publicados", value: String(publicadas) },
          { label: "Inversión en pauta", value: inversion > 0 ? money(inversion, moneda) : "—" },
          { label: "Alcance", value: alcance > 0 ? alcance.toLocaleString("es-UY") : "—" },
          { label: "Leads", value: String(leads) },
          { label: "CPL", value: leads > 0 ? money(cpl, moneda) : "—" },
        ]}
      />

      <Panel title="Contenido por red" hint="Piezas del mes y cuántas se publicaron.">
        {Object.keys(porRed).length === 0 ? (
          <EmptyState>No hay contenido cargado para {MONTHS_ES[month]}.</EmptyState>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(porRed).map(([net, v]) => (
              <div key={net} style={rowStat}>
                <span style={{ fontWeight: 700, color: "var(--deep-green)" }}>{NET_LABEL[net] ?? net}</span>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  <strong style={{ color: "var(--deep-green)" }}>{v.pub}</strong> publicadas / {v.total} planificadas
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Resultados por campaña" hint="Pauta vigente en el período.">
        {monthCampaigns.length === 0 ? (
          <EmptyState>No hay campañas de pauta en este período.</EmptyState>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {monthCampaigns.map((c) => {
              const ccpl = c.leads > 0 ? c.inversion / c.leads : 0;
              return (
                <div key={c.id} style={rowStat}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontWeight: 700, color: "var(--deep-green)" }}>{c.nombre}</span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{c.leads} leads · CPL {c.leads > 0 ? money(ccpl, c.moneda) : "—"}</span>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--deep-green)" }}>{money(c.inversion, c.moneda)}</span>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </>
  );
}

const navBtn: React.CSSProperties = { padding: "4px 10px", fontSize: 13, background: "transparent", border: "1px solid rgba(10,26,12,0.15)", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", color: "var(--deep-green)" };
const rowStat: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 14px", background: "var(--off-white)", borderRadius: 10 };
