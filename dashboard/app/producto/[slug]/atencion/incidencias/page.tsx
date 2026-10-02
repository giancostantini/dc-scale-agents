"use client";

/**
 * /producto/[slug]/atencion/incidencias — ATENCIÓN: incidencias operativas
 * (caídas, errores de sincronización, degradaciones) por severidad y estado.
 * Datos DEMO deterministas.
 */

import { use, useMemo } from "react";
import { PRODUCT_BY_SLUG } from "@/lib/productos";
import { appMeta, incidencias, type DemoIncidencia, type AlertSeverity } from "@/lib/backoffice-demo";
import { BoHead, KpiGrid, Card, DataTable, Pill, SeverityPill, type Column } from "@/components/backoffice/BackofficeUI";

const ESTADO_LABEL: Record<DemoIncidencia["estado"], string> = {
  abierto: "Abierto", investigando: "Investigando", resuelto: "Resuelto",
};
const ESTADO_COLOR: Record<DemoIncidencia["estado"], string> = {
  abierto: "#b04b3a", investigando: "#C98A1A", resuelto: "#1F9D55",
};

export default function IncidenciasPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const p = PRODUCT_BY_SLUG[slug];
  const all = useMemo(() => incidencias(slug), [slug]);

  if (!p) return null;
  const meta = appMeta(slug);

  const abiertas = all.filter((i) => i.estado === "abierto").length;
  const investigando = all.filter((i) => i.estado === "investigando").length;
  const resueltas = all.filter((i) => i.estado === "resuelto").length;
  const afectados = all.reduce((s, i) => s + i.afectados, 0);

  const columns: Column<DemoIncidencia>[] = [
    { key: "id", header: "ID", render: (i) => <strong>{i.id}</strong> },
    { key: "titulo", header: "Título", render: (i) => i.titulo },
    { key: "severidad", header: "Severidad", render: (i) => <SeverityPill severity={(i.severidad === "baja" ? "info" : i.severidad) as AlertSeverity} /> },
    { key: "estado", header: "Estado", render: (i) => <Pill label={ESTADO_LABEL[i.estado]} color={ESTADO_COLOR[i.estado]} /> },
    { key: "abierta", header: "Abierta", render: (i) => i.abierta },
    { key: "afectados", header: "Afectados", align: "right", render: (i) => i.afectados.toLocaleString("es-UY") },
  ];

  return (
    <>
      <BoHead eyebrow={`${meta.name} · backoffice`} title="Incidencias" accent={p.accent} />

      <KpiGrid
        items={[
          { label: "Abiertas", value: String(abiertas), accent: "#b04b3a" },
          { label: "Investigando", value: String(investigando), accent: "#C98A1A" },
          { label: "Resueltas", value: String(resueltas), accent: "#1F9D55" },
          { label: "Afectados totales", value: afectados.toLocaleString("es-UY"), sub: "Usuarios impactados" },
        ]}
        min={180}
      />

      <Card title="Incidencias operativas" hint={`${all.length} incidencias registradas`}>
        <DataTable columns={columns} rows={all} empty="No hay incidencias registradas." maxHeight={560} />
      </Card>
    </>
  );
}
