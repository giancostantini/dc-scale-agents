"use client";

/** Submódulo de Growth del producto (contenido, pauta, producciones,
 *  reporting, prospección). Estructura por ahora; datos después. */

import { use } from "react";
import Link from "next/link";
import { PRODUCT_BY_SLUG } from "@/lib/productos";
import { PageHead, KpiRow, SectionGrid } from "@/components/producto/ProductUI";

interface SubConfig {
  title: string;
  kpis: string[];
  sections: { title: string; hint: string }[];
}

const SUB: Record<string, SubConfig> = {
  contenido: {
    title: "Calendario de contenido",
    kpis: ["Piezas del mes", "Publicadas", "Pendientes", "Atrasadas"],
    sections: [
      { title: "Calendario del mes", hint: "Piezas planificadas por día y red." },
      { title: "Frecuencia y mix", hint: "Cuántas piezas por semana y de qué tipo." },
    ],
  },
  pauta: {
    title: "Pauta publicitaria",
    kpis: ["Inversión (período)", "Alcance", "Leads", "CPL"],
    sections: [
      { title: "Campañas activas", hint: "Campañas del producto en Meta / Google." },
      { title: "Resultados por campaña", hint: "Inversión, resultados y ROAS." },
    ],
  },
  producciones: {
    title: "Producciones",
    kpis: ["Producciones activas", "Presupuesto", "Ejecutado", "Entregadas"],
    sections: [
      { title: "Producciones en curso", hint: "Videos, creativos y piezas en producción." },
      { title: "Historial", hint: "Producciones entregadas." },
    ],
  },
  reporting: {
    title: "Reporting",
    kpis: ["Alcance (período)", "Interacciones", "Leads", "Conversión"],
    sections: [
      { title: "Resumen de resultados", hint: "Marketing del producto en el período." },
      { title: "Evolución", hint: "Tendencia mes a mes." },
    ],
  },
  prospeccion: {
    title: "Prospección",
    kpis: ["Prospectos activos", "En propuesta", "Cerrados (período)", "Valor pipeline"],
    sections: [
      { title: "Pipeline", hint: "Prospectos por etapa." },
      { title: "Leads recientes", hint: "Últimos prospectos del producto." },
    ],
  },
};

export default function GrowthSubPage({
  params,
}: {
  params: Promise<{ slug: string; sub: string }>;
}) {
  const { slug, sub } = use(params);
  const p = PRODUCT_BY_SLUG[slug];
  const cfg = SUB[sub];
  if (!p) return null;

  if (!cfg) {
    return (
      <>
        <PageHead eyebrow={`${p.name} · growth`} title="Sección no encontrada" accent={p.accent} />
        <Link href={`/producto/${slug}/growth`} style={{ color: p.accent, fontSize: 13 }}>
          ← Volver a Growth
        </Link>
      </>
    );
  }

  return (
    <>
      <div style={{ marginBottom: 4 }}>
        <Link
          href={`/producto/${slug}/growth`}
          style={{ color: "var(--sand-dark)", fontSize: 12, textDecoration: "none" }}
        >
          ← Growth
        </Link>
      </div>
      <PageHead eyebrow={`${p.name} · growth`} title={cfg.title} accent={p.accent} />
      <KpiRow labels={cfg.kpis} />
      <SectionGrid sections={cfg.sections} />
    </>
  );
}
