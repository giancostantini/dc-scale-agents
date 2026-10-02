"use client";

/**
 * /producto/[slug]/atencion/solicitudes — ATENCIÓN: pedidos de nuevas
 * funcionalidades y mejoras (solicitudes + feature requests) de los clientes.
 * Datos DEMO deterministas.
 */

import { use, useMemo } from "react";
import { PRODUCT_BY_SLUG } from "@/lib/productos";
import { appMeta, tickets, type DemoTicket, type TicketEstado } from "@/lib/backoffice-demo";
import { BoHead, KpiGrid, Card, DataTable, Pill, type Column } from "@/components/backoffice/BackofficeUI";

const TIPO_LABEL: Record<string, string> = { solicitud: "Solicitud", feature: "Feature" };
const TIPO_COLOR: Record<string, string> = { solicitud: "#6D4AFF", feature: "#1F9D55" };
const ESTADO_LABEL: Record<TicketEstado, string> = { abierto: "Abierto", pendiente: "Pendiente", resuelto: "Resuelto" };
const ESTADO_COLOR: Record<TicketEstado, string> = { abierto: "#C98A1A", pendiente: "#5A6A5E", resuelto: "#1F9D55" };

export default function SolicitudesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const p = PRODUCT_BY_SLUG[slug];
  const all = useMemo(
    () => tickets(slug).filter((t) => t.tipo === "solicitud" || t.tipo === "feature"),
    [slug],
  );

  if (!p) return null;
  const meta = appMeta(slug);

  const solicitudes = all.filter((t) => t.tipo === "solicitud").length;
  const features = all.filter((t) => t.tipo === "feature").length;
  const abiertas = all.filter((t) => t.estado !== "resuelto").length;
  const resueltas = all.filter((t) => t.estado === "resuelto").length;

  const columns: Column<DemoTicket>[] = [
    { key: "id", header: "ID", render: (t) => <strong>{t.id}</strong> },
    { key: "asunto", header: "Asunto", render: (t) => t.asunto },
    { key: "empresa", header: "Empresa", render: (t) => t.empresa },
    { key: "tipo", header: "Tipo", render: (t) => <Pill label={TIPO_LABEL[t.tipo]} color={TIPO_COLOR[t.tipo]} /> },
    { key: "estado", header: "Estado", render: (t) => <Pill label={ESTADO_LABEL[t.estado]} color={ESTADO_COLOR[t.estado]} /> },
    { key: "creado", header: "Creado", render: (t) => t.creado },
  ];

  return (
    <>
      <BoHead eyebrow={`${meta.name} · backoffice`} title="Solicitudes y mejoras" accent={p.accent} />

      <KpiGrid
        items={[
          { label: "Solicitudes", value: String(solicitudes), accent: "#6D4AFF" },
          { label: "Feature requests", value: String(features), accent: "#1F9D55" },
          { label: "Abiertas", value: String(abiertas), accent: "#C98A1A" },
          { label: "Resueltas", value: String(resueltas), accent: "#1F9D55" },
        ]}
        min={180}
      />

      <Card
        title="Pedidos de funcionalidades"
        hint="Solicitudes y feature requests: pedidos de nuevas funciones y mejoras enviados por los clientes para priorizar en el roadmap."
      >
        <DataTable columns={columns} rows={all} empty="No hay solicitudes ni feature requests." maxHeight={560} />
      </Card>
    </>
  );
}
