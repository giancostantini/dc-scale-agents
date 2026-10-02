"use client";

/**
 * /producto/[slug]/producto/funcionalidades — Uso por funcionalidad.
 * Qué features concentran más valor: usuarios, clientes, usos y variación
 * mensual. Datos DEMO deterministas, ordenados por usos.
 */

import { use } from "react";
import { PRODUCT_BY_SLUG } from "@/lib/productos";
import { appMeta, featureUsage, type FeatureUsage } from "@/lib/backoffice-demo";
import { BoHead, Card, DataTable, type Column } from "@/components/backoffice/BackofficeUI";

type FeatureRow = FeatureUsage & { id: string };

export default function FuncionalidadesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const p = PRODUCT_BY_SLUG[slug];

  const meta = appMeta(slug);
  const rows: FeatureRow[] = featureUsage(slug).map((f, i) => ({ ...f, id: `feat-${i}` }));

  if (!p) return null;

  const columns: Column<FeatureRow>[] = [
    { key: "feature", header: "Funcionalidad", render: (f) => <strong>{f.feature}</strong> },
    { key: "usuarios", header: "Usuarios únicos", align: "right", render: (f) => f.usuarios.toLocaleString("es-UY") },
    { key: "clientes", header: "Clientes que la usan", align: "right", render: (f) => f.clientes.toLocaleString("es-UY") },
    { key: "usos", header: "Cantidad de usos", align: "right", render: (f) => f.usos.toLocaleString("es-UY") },
    {
      key: "varPct",
      header: "Variación mensual",
      align: "right",
      render: (f) => {
        const up = f.varPct >= 0;
        return (
          <span style={{ fontWeight: 700, color: up ? "#1F9D55" : "#b04b3a" }}>
            {up ? "▲" : "▼"} {Math.abs(f.varPct)}%
          </span>
        );
      },
    },
  ];

  return (
    <>
      <BoHead eyebrow={`${meta.name} · backoffice`} title="Funcionalidades" accent={p.accent} />

      <Card
        title="Uso por funcionalidad"
        hint="Permite ver qué features aportan más valor: las de arriba son las más usadas y las que conviene priorizar y profundizar."
      >
        <DataTable columns={columns} rows={rows} empty="Sin datos de uso." />
      </Card>
    </>
  );
}
