"use client";

/**
 * /producto/[slug]/tecnologia/errores — TECNOLOGÍA: errores de aplicación
 * agregados con los mensajes más frecuentes. Datos DEMO deterministas.
 */

import { use, useMemo } from "react";
import { PRODUCT_BY_SLUG } from "@/lib/productos";
import { appMeta, errorStats } from "@/lib/backoffice-demo";
import { BoHead, KpiGrid, Card, DataTable, type Column } from "@/components/backoffice/BackofficeUI";

interface TopError { msg: string; count: number; }

export default function ErroresPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const p = PRODUCT_BY_SLUG[slug];
  const stats = useMemo(() => errorStats(slug), [slug]);

  if (!p) return null;
  const meta = appMeta(slug);

  const rows: TopError[] = [...stats.top].sort((a, b) => b.count - a.count);

  const columns: Column<TopError>[] = [
    { key: "msg", header: "Mensaje", render: (r) => <code style={{ fontSize: 12, color: "var(--deep-green)" }}>{r.msg}</code> },
    { key: "count", header: "Cantidad", align: "right", render: (r) => <strong>{r.count.toLocaleString("es-UY")}</strong> },
  ];

  return (
    <>
      <BoHead eyebrow={`${meta.name} · backoffice`} title="Errores" accent={p.accent} />

      <KpiGrid
        items={[
          { label: "Errores totales", value: stats.total.toLocaleString("es-UY") },
          { label: "Críticos", value: String(stats.criticos), accent: stats.criticos > 0 ? "#b04b3a" : undefined },
          { label: "Tasa de errores", value: `${stats.tasa}%`, accent: p.accent },
          { label: "Usuarios afectados", value: stats.usuariosAfectados.toLocaleString("es-UY") },
          { label: "Clientes afectados", value: stats.clientesAfectados.toLocaleString("es-UY") },
        ]}
        min={180}
      />

      <Card title="Errores más frecuentes" hint="Mensajes ordenados por cantidad de ocurrencias.">
        <DataTable columns={columns} rows={rows} empty="No se registraron errores." maxHeight={560} />
      </Card>
    </>
  );
}
