"use client";

/**
 * /producto/[slug]/producto/uso — Dashboard de uso del producto.
 * Métricas de actividad (DAU/WAU/MAU, sesiones, operaciones) + evolución
 * del uso con selector de período. Datos DEMO deterministas.
 */

import { use, useState } from "react";
import { PRODUCT_BY_SLUG } from "@/lib/productos";
import { appMeta, usageMetrics, series } from "@/lib/backoffice-demo";
import { BoHead, KpiGrid, Card, LineTrend, PeriodSelector } from "@/components/backoffice/BackofficeUI";

const PERIOD_MONTHS: Record<string, number> = { "7d": 6, "30d": 6, "3m": 3, "6m": 6, "12m": 12 };

export default function UsoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const p = PRODUCT_BY_SLUG[slug];
  const [period, setPeriod] = useState("12m");

  const meta = appMeta(slug);
  const u = usageMetrics(slug);

  if (!p) return null;

  const months = PERIOD_MONTHS[period] ?? 12;
  const data = series(slug, "uso", months);

  return (
    <>
      <BoHead
        eyebrow={`${meta.name} · backoffice`}
        title="Uso del producto"
        accent={p.accent}
        right={<PeriodSelector value={period} onChange={setPeriod} />}
      />

      <KpiGrid
        items={[
          { label: "DAU", value: u.dau.toLocaleString("es-UY"), sub: "Usuarios activos diarios", accent: p.accent },
          { label: "WAU", value: u.wau.toLocaleString("es-UY"), sub: "Semanales" },
          { label: "MAU", value: u.mau.toLocaleString("es-UY"), sub: "Mensuales" },
          { label: "Sesiones", value: u.sesiones.toLocaleString("es-UY"), sub: "En el mes" },
          { label: meta.unit, value: u.operaciones.toLocaleString("es-UY"), sub: "Operaciones del mes" },
          { label: "Duración promedio", value: u.duracionProm, sub: "Por sesión" },
          { label: `${meta.unit} / cliente`, value: u.opsPorCliente.toLocaleString("es-UY") },
          { label: "Usuarios / cliente", value: String(u.usuariosPorCliente) },
        ]}
        min={170}
      />

      <Card title={`Evolución de ${meta.unit.toLowerCase()}`} hint="Uso mensual del producto en el período seleccionado.">
        <LineTrend data={data} color={p.accent} />
      </Card>
    </>
  );
}
