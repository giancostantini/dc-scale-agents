"use client";

/**
 * /producto/[slug] — HOME del backend comercial de un producto. Landing con
 * el branding del producto y accesos a los módulos. El detalle vive en cada
 * sección (Tablero comercial, Growth, Equipo).
 */

import { use } from "react";
import Link from "next/link";
import { PRODUCT_BY_SLUG } from "@/lib/productos";

export default function ProductoHome({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const p = PRODUCT_BY_SLUG[slug];
  if (!p) return null; // el layout ya maneja el 404

  const modules = [
    {
      href: `/producto/${slug}/comercial`,
      title: "Tablero de control comercial",
      desc: "Suscriptores, MRR, ingresos, churn y salud financiera del negocio.",
    },
    {
      href: `/producto/${slug}/growth`,
      title: "Growth",
      desc: "Pauta publicitaria, calendario de contenido, producciones, reporting y prospección.",
    },
  ];

  return (
    <>
      {/* Header branded */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 18,
          padding: "22px 24px",
          background: p.soft,
          borderLeft: `4px solid ${p.accent}`,
          borderRadius: "var(--r-lg)",
          marginBottom: 24,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={p.logo}
          alt={p.name}
          style={{ width: 56, height: 56, objectFit: "contain", borderRadius: 12 }}
        />
        <div>
          <h1
            style={{
              fontSize: 30,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              color: p.accent,
              margin: 0,
            }}
          >
            {p.name}
          </h1>
          <div style={{ fontSize: 14, color: "var(--text-soft, #5A6A5E)", marginTop: 2 }}>
            {p.tagline} · <strong>backend comercial</strong>
          </div>
        </div>
      </div>

      {/* Accesos a los módulos */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
        }}
      >
        {modules.map((m) => (
          <Link
            key={m.href}
            href={m.href}
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
              {m.title}
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
              {m.desc}
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
