"use client";

/**
 * /producto/[slug]/tecnologia/apis — TECNOLOGÍA: tráfico de la API, tasa de
 * éxito, latencia y desglose por endpoint. Datos DEMO deterministas.
 */

import { use, useMemo } from "react";
import { PRODUCT_BY_SLUG } from "@/lib/productos";
import { appMeta, apiStats } from "@/lib/backoffice-demo";
import { BoHead, KpiGrid, Card, DataTable, type Column } from "@/components/backoffice/BackofficeUI";

interface EndpointRow { endpoint: string; requests: number; errores: number; latencia: number; }

export default function ApisPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const p = PRODUCT_BY_SLUG[slug];
  const stats = useMemo(() => apiStats(slug), [slug]);

  if (!p) return null;
  const meta = appMeta(slug);

  const columns: Column<EndpointRow>[] = [
    { key: "endpoint", header: "Endpoint", render: (r) => <code style={{ fontSize: 12, color: "var(--deep-green)" }}>{r.endpoint}</code> },
    { key: "requests", header: "Requests", align: "right", render: (r) => r.requests.toLocaleString("es-UY") },
    { key: "errores", header: "Errores", align: "right", render: (r) => <span style={{ color: r.errores > 0 ? "#b04b3a" : "var(--text-muted)", fontWeight: r.errores > 0 ? 700 : 400 }}>{r.errores.toLocaleString("es-UY")}</span> },
    { key: "latencia", header: "Latencia", align: "right", render: (r) => `${r.latencia} ms` },
  ];

  return (
    <>
      <BoHead eyebrow={`${meta.name} · backoffice`} title="APIs" accent={p.accent} />

      <KpiGrid
        items={[
          { label: "Requests", value: stats.requests.toLocaleString("es-UY") },
          { label: "Exitosos", value: stats.exitosos.toLocaleString("es-UY"), accent: "#1F9D55" },
          { label: "Fallidos", value: stats.fallidos.toLocaleString("es-UY"), accent: stats.fallidos > 0 ? "#b04b3a" : undefined },
          { label: "Latencia p95", value: `${stats.latenciaP95} ms`, accent: p.accent },
        ]}
        min={180}
      />

      <Card title="Desglose por endpoint" hint="Tráfico, errores y latencia por endpoint.">
        <DataTable columns={columns} rows={stats.endpoints} empty="Sin tráfico registrado." maxHeight={560} />
      </Card>
    </>
  );
}
