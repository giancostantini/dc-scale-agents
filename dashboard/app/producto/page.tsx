"use client";

/**
 * /producto — Consolidado D&C ("Todas las aplicaciones").
 * Vista madre que agrega los KPIs de todas las apps de Dearmas & Costantini.
 *
 * ⚠️ Esta ruta NO está bajo [slug], así que NO hereda el layout con
 * Topbar/sidebar. Por eso es autocontenida: incluye el Topbar y el guard de
 * auth, copiando el patrón de app/producto/[slug]/layout.tsx.
 *
 * Datos DEMO (deterministas) hasta conectar fuentes reales.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Topbar from "@/components/Topbar";
import { getCurrentProfile, hasSession } from "@/lib/supabase/auth";
import { PRODUCT_BY_SLUG } from "@/lib/productos";
import { consolidated, money } from "@/lib/backoffice-demo";
import { BoHead, KpiGrid, Card, DemoBadge } from "@/components/backoffice/BackofficeUI";

const ACCENT = "#2F7D6B";

const mainStyle: React.CSSProperties = { padding: "28px 40px", maxWidth: 1200, margin: "0 auto" };
const loadingStyle: React.CSSProperties = { padding: "80px 40px", textAlign: "center" };
const topRowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 };
const backBtnStyle: React.CSSProperties = {
  padding: "8px 14px", fontSize: 12, fontWeight: 600, background: "transparent",
  border: "1px solid rgba(10,26,12,0.15)", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", color: "var(--deep-green)",
};
const selectStyle: React.CSSProperties = {
  padding: "8px 10px", border: "1px solid rgba(10,26,12,0.15)", borderRadius: 6, fontSize: 13,
  fontFamily: "inherit", background: "var(--white)", color: "var(--deep-green)", outline: "none",
};
const appGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 };
const logoStyle: React.CSSProperties = { width: 32, height: 32, objectFit: "contain", borderRadius: 8 };

export default function ConsolidadoPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    hasSession().then(async (has) => {
      if (!has) {
        router.replace("/");
        return;
      }
      const p = await getCurrentProfile();
      if (!p || p.role === "client") {
        router.replace("/portal");
        return;
      }
      setAuthChecked(true);
    });
  }, [router]);

  if (!authChecked) {
    return (
      <>
        <Topbar showPrimary={false} />
        <main style={loadingStyle}>
          <p style={{ color: "var(--text-muted)" }}>Cargando…</p>
        </main>
      </>
    );
  }

  const { apps, totals } = consolidated();

  return (
    <>
      <Topbar showPrimary={false} />
      <main style={mainStyle}>
        <div style={topRowStyle}>
          <button onClick={() => router.push("/hub")} style={backBtnStyle}>← Business Hub</button>
          <select
            value=""
            onChange={(e) => {
              const slug = e.target.value;
              if (slug) router.push(`/producto/${slug}`);
            }}
            style={selectStyle}
          >
            <option value="">Todas las aplicaciones</option>
            {apps.map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}
          </select>
        </div>

        <BoHead
          eyebrow="Dearmas & Costantini — Consolidado"
          title="Todas las aplicaciones"
          accent={ACCENT}
        />

        <KpiGrid
          items={[
            { label: "Clientes totales", value: String(totals.clientes) },
            { label: "MRR total", value: money(totals.mrr, "USD"), accent: ACCENT },
            { label: "ARR total", value: money(totals.arr, "USD") },
            { label: "Usuarios", value: totals.usuarios.toLocaleString("es-UY") },
            { label: "Churn promedio", value: `${totals.churn}%` },
          ]}
          min={180}
        />

        <Card title="Por aplicación" hint="KPIs clave de cada app. Click para entrar al backoffice.">
          <div style={appGridStyle}>
            {apps.map((a) => {
              const brand = PRODUCT_BY_SLUG[a.slug];
              const up = a.kpis.crecimientoMrrPct >= 0;
              return (
                <div
                  key={a.slug}
                  onClick={() => router.push(`/producto/${a.slug}`)}
                  style={{
                    background: "var(--white)",
                    border: "1px solid rgba(10,26,12,0.08)",
                    borderLeft: `4px solid ${a.accent}`,
                    borderRadius: "var(--r-md)",
                    padding: 18,
                    boxShadow: "var(--shadow-sm)",
                    cursor: "pointer",
                    transition: "box-shadow 0.15s ease, transform 0.15s ease",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 6px 20px rgba(10,26,12,0.1)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "var(--shadow-sm)"; }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    {brand?.logo && <img src={brand.logo} alt={a.name} style={logoStyle} />}
                    <span style={{ fontSize: 16, fontWeight: 800, color: "var(--deep-green)" }}>{a.name}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--sand-dark)", fontWeight: 700, marginBottom: 4 }}>Clientes</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: "var(--deep-green)" }}>{a.kpis.clientesActivos}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--sand-dark)", fontWeight: 700, marginBottom: 4 }}>MRR</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: a.accent }}>{money(a.kpis.mrr, a.kpis.moneda)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--sand-dark)", fontWeight: 700, marginBottom: 4 }}>Crecimiento</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: up ? "#1F9D55" : "#b04b3a" }}>
                        {up ? "▲" : "▼"} {Math.abs(a.kpis.crecimientoMrrPct)}%
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <DemoBadge />
        </div>
      </main>
    </>
  );
}
