"use client";

/** Equipo del producto: quién trabaja en este producto. */

import { use } from "react";
import { PRODUCT_BY_SLUG } from "@/lib/productos";
import { PageHead, KpiRow, SectionGrid } from "@/components/producto/ProductUI";

export default function EquipoProductoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const p = PRODUCT_BY_SLUG[slug];
  if (!p) return null;

  return (
    <>
      <PageHead eyebrow={`${p.name} · equipo`} title="Equipo" accent={p.accent} />
      <KpiRow labels={["Personas asignadas", "Roles", "Áreas"]} />
      <SectionGrid
        sections={[
          { title: "Equipo del producto", hint: "Miembros asignados a este producto y su rol." },
          { title: "Asignar equipo", hint: "Sumar o quitar personas del producto." },
        ]}
      />
    </>
  );
}
