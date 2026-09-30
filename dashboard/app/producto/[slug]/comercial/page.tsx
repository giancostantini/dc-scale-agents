"use client";

/**
 * Tablero de control comercial del producto: salud comercial + financiera.
 * Estructura armada; los datos (suscriptores, MRR, ingresos) se conectan
 * en una segunda etapa.
 */

import { use, useState } from "react";
import { PRODUCT_BY_SLUG } from "@/lib/productos";
import { PageHead, KpiRow, SectionGrid } from "@/components/producto/ProductUI";

type Period = "mes" | "3m" | "anio";

export default function ComercialPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const p = PRODUCT_BY_SLUG[slug];
  const [period, setPeriod] = useState<Period>("mes");
  if (!p) return null;

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <PageHead
          eyebrow={`${p.name} · comercial`}
          title="Tablero de control comercial"
          accent={p.accent}
        />
        <div
          style={{
            display: "inline-flex",
            border: "1px solid rgba(10,26,12,0.15)",
            borderRadius: "var(--r-pill)",
            overflow: "hidden",
          }}
        >
          {(["mes", "3m", "anio"] as Period[]).map((per) => (
            <button
              key={per}
              type="button"
              onClick={() => setPeriod(per)}
              style={{
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
                background: period === per ? p.accent : "transparent",
                color: period === per ? "#fff" : "var(--deep-green)",
              }}
            >
              {per === "mes" ? "Este mes" : per === "3m" ? "3 meses" : "Año"}
            </button>
          ))}
        </div>
      </div>

      {/* Comercial */}
      <KpiRow labels={["Clientes suscritos", "MRR", "Ingresos (período)", "Churn"]} />
      <SectionGrid
        sections={[
          { title: "Crecimiento de suscriptores", hint: "Altas y bajas mes a mes." },
          { title: "Suscripciones recientes", hint: "Últimas altas y bajas de clientes." },
          { title: "Clientes por plan", hint: "Distribución de la base por plan / pricing." },
          { title: "KPIs de eficiencia", hint: "Activación, uso, retención y NPS." },
        ]}
      />

      {/* Financiero */}
      <div style={{ height: 28 }} />
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--sand-dark)",
          fontWeight: 700,
          marginBottom: 14,
        }}
      >
        Financiero
      </div>
      <KpiRow labels={["Ingresos (período)", "Egresos (período)", "Resultado", "Margen %"]} />
      <SectionGrid
        sections={[
          { title: "Ingresos vs egresos", hint: "Evolución mensual del resultado." },
          { title: "Egresos por categoría", hint: "Infra, sueldos, pauta, herramientas." },
          { title: "Cobranzas", hint: "Suscripciones al día vs morosas." },
          { title: "Proyección", hint: "MRR proyectado y punto de equilibrio." },
        ]}
      />
    </>
  );
}
