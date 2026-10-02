"use client";

/**
 * Tablero de control comercial del producto: salud comercial, financiera y
 * de retención/eficiencia del negocio SaaS. Estructura completa; los datos
 * (suscriptores, MRR, ingresos) se conectan en una segunda etapa.
 */

import { use, useState } from "react";
import { PRODUCT_BY_SLUG } from "@/lib/productos";
import { PageHead, KpiRow, SectionGrid } from "@/components/producto/ProductUI";

type Period = "mes" | "3m" | "anio";

function Block({ title }: { title: string }) {
  return (
    <div
      style={{
        fontSize: 10,
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        color: "var(--sand-dark)",
        fontWeight: 700,
        margin: "28px 0 14px",
      }}
    >
      {title}
    </div>
  );
}

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

      {/* ===== Comercial ===== */}
      <Block title="Comercial" />
      <KpiRow
        labels={[
          "Clientes suscritos",
          "MRR",
          "ARR",
          "Nuevos clientes (período)",
          "Bajas (período)",
          "Churn mensual",
        ]}
      />
      <SectionGrid
        sections={[
          { title: "Crecimiento de suscriptores", hint: "Base de clientes mes a mes (altas − bajas)." },
          { title: "Altas y bajas", hint: "Quién se sumó y quién se fue en el período." },
          { title: "Clientes por plan", hint: "Distribución de la base por plan / pricing." },
          { title: "Embudo de conversión", hint: "Lead → trial → pago → activo." },
        ]}
      />

      {/* ===== Financiero ===== */}
      <Block title="Financiero" />
      <KpiRow
        labels={[
          "Ingresos (período)",
          "Egresos (período)",
          "Resultado",
          "Margen %",
          "Ticket promedio",
          "LTV",
        ]}
      />
      <SectionGrid
        sections={[
          { title: "Ingresos vs egresos", hint: "Evolución mensual del resultado del producto." },
          { title: "Egresos por categoría", hint: "Infra, sueldos, pauta, herramientas, comisiones." },
          { title: "Cobranzas", hint: "Suscripciones al día vs morosas; recupero." },
          { title: "Proyección", hint: "MRR proyectado, runway y punto de equilibrio." },
        ]}
      />

      {/* ===== Retención & eficiencia ===== */}
      <Block title="Retención & eficiencia" />
      <KpiRow
        labels={["Retención 90 días", "NPS", "CAC", "LTV / CAC", "Uso activo (MAU)", "Payback"]}
      />
      <SectionGrid
        sections={[
          { title: "Cohortes de retención", hint: "Cuánto dura cada camada de clientes." },
          { title: "Uso del producto", hint: "Activación, frecuencia de uso y features más usadas." },
          { title: "Top clientes por facturación", hint: "Quiénes aportan más ingresos." },
          { title: "Riesgo de churn", hint: "Clientes con señales de baja para retener." },
        ]}
      />
    </>
  );
}
