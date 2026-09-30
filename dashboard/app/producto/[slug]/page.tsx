"use client";

/**
 * /producto/[slug] — BACKEND COMERCIAL de un producto propio de D&C
 * (Tilde, Encargue, Vuelta). No es la app en sí: es el tablero para seguir
 * la COMERCIALIZACIÓN de cada producto como negocio SaaS:
 *   · Resumen comercial (suscriptores, MRR, KPIs de eficiencia)
 *   · Finanzas (ingresos / egresos / resultado del producto)
 *   · Growth (pauta publicitaria + calendario de contenido del producto)
 *   · Equipo & tareas (quién trabaja en el producto y qué falta)
 *   · Prospección (pipeline de prospectos del producto)
 *
 * Cada producto se muestra con su branding (color + logo). Los datos se
 * conectan por módulo — por ahora la estructura queda armada con estados
 * "próximamente".
 */

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import { getCurrentProfile, hasSession } from "@/lib/supabase/auth";
import { IArrowLeft } from "@/components/icons/BrandIcons";

interface Brand {
  name: string;
  tagline: string;
  /** Color principal de la marca (branding del producto). */
  accent: string;
  /** Fondo suave del header. */
  soft: string;
  /** Monograma (hasta que tengamos el logo real en /public). */
  mono: string;
  /** Ruta al logo si existe en /public (opcional). */
  logo?: string;
}

const BRAND: Record<string, Brand> = {
  tilde: {
    name: "Tilde",
    tagline: "Carga y control de facturas de compra",
    accent: "#2F7D6B",
    soft: "rgba(47,125,107,0.10)",
    mono: "T",
    logo: "/productos/tilde.png",
  },
  encargue: {
    name: "Encargue",
    tagline: "Pedidos B2B por WhatsApp al ERP",
    accent: "#1F9D55",
    soft: "rgba(31,157,85,0.10)",
    mono: "E",
    logo: "/productos/encargue.png",
  },
  vuelta: {
    name: "Vuelta",
    tagline: "Ruteo y reparto de camiones",
    accent: "#E07A29",
    soft: "rgba(224,122,41,0.10)",
    mono: "V",
    logo: "/productos/vuelta.png",
  },
};

type TabKey = "resumen" | "finanzas" | "growth" | "equipo" | "prospeccion";

const TABS: { key: TabKey; label: string }[] = [
  { key: "resumen", label: "Resumen comercial" },
  { key: "finanzas", label: "Finanzas" },
  { key: "growth", label: "Growth" },
  { key: "equipo", label: "Equipo & tareas" },
  { key: "prospeccion", label: "Prospección" },
];

interface TabContent {
  kpis: string[];
  sections: { title: string; hint: string }[];
  showPeriod: boolean;
}

const TAB_CONTENT: Record<TabKey, TabContent> = {
  resumen: {
    kpis: ["Clientes suscritos", "MRR", "Ingresos (período)", "Churn"],
    showPeriod: true,
    sections: [
      { title: "Crecimiento de suscriptores", hint: "Altas y bajas mes a mes." },
      { title: "Suscripciones recientes", hint: "Últimas altas y bajas de clientes." },
      { title: "Clientes por plan", hint: "Distribución de la base por plan / pricing." },
      { title: "KPIs de eficiencia", hint: "Activación, uso, retención y NPS del producto." },
    ],
  },
  finanzas: {
    kpis: ["Ingresos (período)", "Egresos (período)", "Resultado", "Margen %"],
    showPeriod: true,
    sections: [
      { title: "Ingresos vs egresos", hint: "Evolución mensual del resultado del producto." },
      { title: "Egresos por categoría", hint: "Infra, sueldos, pauta, herramientas." },
      { title: "Cobranzas", hint: "Suscripciones al día vs morosas." },
      { title: "Proyección", hint: "MRR proyectado y punto de equilibrio." },
    ],
  },
  growth: {
    kpis: ["Inversión en pauta (período)", "Leads generados", "CAC", "Alcance"],
    showPeriod: true,
    sections: [
      { title: "Pauta publicitaria", hint: "Campañas activas del producto (Meta / Google) e inversión." },
      { title: "Calendario de contenido", hint: "Piezas planificadas y publicadas del producto." },
      { title: "Canales de adquisición", hint: "De dónde vienen los leads del producto." },
    ],
  },
  equipo: {
    kpis: ["Personas asignadas", "Tareas abiertas", "Vencidas", "Completadas (período)"],
    showPeriod: true,
    sections: [
      { title: "Equipo del producto", hint: "Quién trabaja en este producto y su rol." },
      { title: "Tareas", hint: "Pendientes, en curso y vencidas del producto." },
    ],
  },
  prospeccion: {
    kpis: ["Prospectos activos", "En propuesta", "Cerrados (período)", "Valor del pipeline"],
    showPeriod: true,
    sections: [
      { title: "Pipeline", hint: "Prospectos por etapa (prospecto → cerrado)." },
      { title: "Leads recientes", hint: "Últimos prospectos que entraron para este producto." },
    ],
  },
};

type Period = "mes" | "3m" | "anio";

export default function ProductoDashboard({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [tab, setTab] = useState<TabKey>("resumen");
  const [period, setPeriod] = useState<Period>("mes");
  const [logoOk, setLogoOk] = useState(true);

  const brand = BRAND[slug];

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

  if (!brand) {
    return (
      <>
        <Topbar showPrimary={false} />
        <main style={{ padding: 40, maxWidth: 1200, margin: "0 auto" }}>
          <Link href="/hub" style={{ color: "var(--sand-dark)", fontSize: 13 }}>
            <IArrowLeft size={14} /> Volver al hub
          </Link>
          <p style={{ marginTop: 20, color: "var(--text-muted)" }}>
            Producto no encontrado.
          </p>
        </main>
      </>
    );
  }

  if (!authChecked) {
    return (
      <>
        <Topbar showPrimary={false} />
        <main style={{ padding: 40 }} />
      </>
    );
  }

  const content = TAB_CONTENT[tab];

  return (
    <>
      <Topbar showPrimary={false} />
      <main style={{ padding: "24px 40px", maxWidth: 1200, margin: "0 auto" }}>
        <Link
          href="/hub"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: "var(--sand-dark)",
            fontSize: 13,
            textDecoration: "none",
            marginBottom: 16,
          }}
        >
          <IArrowLeft size={14} /> Nuestros productos
        </Link>

        {/* Header branded del producto */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            padding: "20px 24px",
            background: brand.soft,
            borderLeft: `4px solid ${brand.accent}`,
            borderRadius: "var(--r-lg)",
            marginBottom: 8,
          }}
        >
          {/* Logo: usa /public/productos/<slug>.png si existe; si no, monograma. */}
          {brand.logo && logoOk ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.logo}
              alt={brand.name}
              onError={() => setLogoOk(false)}
              style={{ width: 56, height: 56, objectFit: "contain", borderRadius: 12 }}
            />
          ) : (
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: brand.accent,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 26,
                fontWeight: 800,
                letterSpacing: "-0.02em",
                flexShrink: 0,
              }}
            >
              {brand.mono}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1
              style={{
                fontSize: 28,
                fontWeight: 800,
                letterSpacing: "-0.02em",
                color: brand.accent,
                margin: 0,
              }}
            >
              {brand.name}
            </h1>
            <div style={{ fontSize: 14, color: "var(--text-soft, #5A6A5E)", marginTop: 2 }}>
              {brand.tagline} · <strong>backend comercial</strong>
            </div>
          </div>
        </div>

        {/* Tabs / menú de secciones */}
        <div
          style={{
            display: "flex",
            gap: 4,
            flexWrap: "wrap",
            borderBottom: "1px solid rgba(10,26,12,0.1)",
            marginBottom: 22,
          }}
        >
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                style={{
                  padding: "10px 16px",
                  fontSize: 13,
                  fontWeight: active ? 700 : 500,
                  background: "transparent",
                  border: "none",
                  borderBottom: `2px solid ${active ? brand.accent : "transparent"}`,
                  color: active ? brand.accent : "var(--text-muted)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  marginBottom: -1,
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Selector de período */}
        {content.showPeriod && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
            <div
              style={{
                display: "inline-flex",
                border: "1px solid rgba(10,26,12,0.15)",
                borderRadius: "var(--r-pill)",
                overflow: "hidden",
              }}
            >
              {(["mes", "3m", "anio"] as Period[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  style={{
                    padding: "6px 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    background: period === p ? brand.accent : "transparent",
                    color: period === p ? "#fff" : "var(--deep-green)",
                  }}
                >
                  {p === "mes" ? "Este mes" : p === "3m" ? "3 meses" : "Año"}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* KPIs de la sección */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 14,
            marginBottom: 24,
          }}
        >
          {content.kpis.map((label) => (
            <div
              key={label}
              style={{
                background: "var(--white)",
                border: "1px solid rgba(10,26,12,0.08)",
                borderRadius: "var(--r-md)",
                padding: 18,
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--sand-dark)",
                  fontWeight: 700,
                  marginBottom: 8,
                }}
              >
                {label}
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, color: "var(--deep-green)" }}>
                —
              </div>
            </div>
          ))}
        </div>

        {/* Secciones de la pestaña */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 16,
          }}
        >
          {content.sections.map((s) => (
            <section
              key={s.title}
              style={{
                background: "var(--white)",
                border: "1px solid rgba(10,26,12,0.08)",
                borderRadius: "var(--r-lg)",
                padding: 20,
                boxShadow: "var(--shadow-sm)",
                minHeight: 150,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--deep-green)" }}>
                {s.title}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                {s.hint}
              </div>
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--text-muted)",
                  fontSize: 12,
                  fontStyle: "italic",
                  opacity: 0.7,
                  marginTop: 12,
                  border: "1px dashed rgba(10,26,12,0.12)",
                  borderRadius: "var(--r-md)",
                  padding: 16,
                  textAlign: "center",
                }}
              >
                Próximamente — conectar datos
              </div>
            </section>
          ))}
        </div>
      </main>
    </>
  );
}
