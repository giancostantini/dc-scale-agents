"use client";

/** Growth del producto: landing con los submódulos (mismos que un cliente
 *  growth), adaptados a la comercialización del producto. */

import { use } from "react";
import Link from "next/link";
import { PRODUCT_BY_SLUG } from "@/lib/productos";
import { PageHead } from "@/components/producto/ProductUI";

const SUBS = [
  { key: "contenido", title: "Calendario de contenido", desc: "Piezas planificadas y publicadas del producto." },
  { key: "pauta", title: "Pauta publicitaria", desc: "Campañas activas (Meta / Google) e inversión." },
  { key: "producciones", title: "Producciones", desc: "Videos, creativos y piezas en producción." },
  { key: "reporting", title: "Reporting", desc: "Resultados de marketing del producto." },
  { key: "prospeccion", title: "Prospección", desc: "Pipeline de prospectos del producto." },
];

export default function GrowthHome({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const p = PRODUCT_BY_SLUG[slug];
  if (!p) return null;

  return (
    <>
      <PageHead eyebrow={`${p.name} · growth`} title="Growth" accent={p.accent} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
        }}
      >
        {SUBS.map((s) => (
          <Link
            key={s.key}
            href={`/producto/${slug}/growth/${s.key}`}
            style={{
              background: "var(--white)",
              border: "1px solid rgba(10,26,12,0.08)",
              borderTop: `3px solid ${p.accent}`,
              borderRadius: "var(--r-lg)",
              padding: 20,
              textDecoration: "none",
              color: "inherit",
              boxShadow: "var(--shadow-sm)",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--deep-green)" }}>
              {s.title}
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
              {s.desc}
            </div>
            <div style={{ marginTop: 4, fontSize: 12, fontWeight: 700, color: p.accent }}>
              Abrir →
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
