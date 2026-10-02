"use client";

/**
 * /producto/[slug]/atencion/tickets — ATENCIÓN: bandeja de tickets de soporte
 * con KPIs de servicio (SLA, resolución, CSAT) y tabla filtrable.
 * Datos DEMO deterministas.
 */

import { use, useMemo, useState } from "react";
import { PRODUCT_BY_SLUG } from "@/lib/productos";
import { appMeta, tickets, type DemoTicket, type TicketTipo, type TicketEstado } from "@/lib/backoffice-demo";
import {
  BoHead, KpiGrid, Card, DataTable, Pill,
  FilterBar, SelectFilter, SearchFilter, type Column,
} from "@/components/backoffice/BackofficeUI";

const TIPO_LABEL: Record<TicketTipo, string> = {
  bug: "Bug", consulta: "Consulta", facturacion: "Facturación",
  integracion: "Integración", solicitud: "Solicitud", feature: "Feature",
};
const TIPO_COLOR: Record<TicketTipo, string> = {
  bug: "#b04b3a", consulta: "#2F7D6B", facturacion: "#C98A1A",
  integracion: "#5A6A5E", solicitud: "#6D4AFF", feature: "#1F9D55",
};
const ESTADO_LABEL: Record<TicketEstado, string> = {
  abierto: "Abierto", pendiente: "Pendiente", resuelto: "Resuelto",
};
const ESTADO_COLOR: Record<TicketEstado, string> = {
  abierto: "#C98A1A", pendiente: "#5A6A5E", resuelto: "#1F9D55",
};
const PRIO_COLOR: Record<string, string> = { alta: "#b04b3a", media: "#C98A1A", baja: "#1F9D55" };
const PRIO_LABEL: Record<string, string> = { alta: "Alta", media: "Media", baja: "Baja" };

export default function TicketsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const p = PRODUCT_BY_SLUG[slug];
  const all = useMemo(() => tickets(slug), [slug]);
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState("");
  const [estado, setEstado] = useState("");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return all.filter((t) => {
      if (term && !t.asunto.toLowerCase().includes(term) && !t.empresa.toLowerCase().includes(term) && !t.id.toLowerCase().includes(term)) return false;
      if (tipo && t.tipo !== tipo) return false;
      if (estado && t.estado !== estado) return false;
      return true;
    });
  }, [all, q, tipo, estado]);

  if (!p) return null;
  const meta = appMeta(slug);

  const abiertos = all.filter((t) => t.estado === "abierto").length;
  const pendientes = all.filter((t) => t.estado === "pendiente").length;
  const resueltos = all.filter((t) => t.estado === "resuelto");
  const promResolucion = resueltos.length
    ? Math.round(resueltos.reduce((s, t) => s + (t.horasResolucion ?? 0), 0) / resueltos.length)
    : 0;

  const columns: Column<DemoTicket>[] = [
    { key: "id", header: "ID", render: (t) => <strong>{t.id}</strong> },
    { key: "asunto", header: "Asunto", render: (t) => t.asunto },
    { key: "empresa", header: "Empresa", render: (t) => t.empresa },
    { key: "tipo", header: "Tipo", render: (t) => <Pill label={TIPO_LABEL[t.tipo]} color={TIPO_COLOR[t.tipo]} /> },
    { key: "prioridad", header: "Prioridad", render: (t) => <Pill label={PRIO_LABEL[t.prioridad]} color={PRIO_COLOR[t.prioridad]} /> },
    { key: "estado", header: "Estado", render: (t) => <Pill label={ESTADO_LABEL[t.estado]} color={ESTADO_COLOR[t.estado]} /> },
    { key: "creado", header: "Creado", render: (t) => t.creado },
    { key: "horasResolucion", header: "Resolución", align: "right", render: (t) => (t.horasResolucion != null ? `${t.horasResolucion}h` : "—") },
  ];

  return (
    <>
      <BoHead eyebrow={`${meta.name} · backoffice`} title="Tickets de soporte" accent={p.accent} />

      <KpiGrid
        items={[
          { label: "Abiertos", value: String(abiertos), accent: "#C98A1A" },
          { label: "Pendientes", value: String(pendientes), accent: "#5A6A5E" },
          { label: "Resueltos", value: String(resueltos.length), accent: "#1F9D55" },
          { label: "Tiempo primera respuesta", value: "2h 15m", sub: "Promedio SLA" },
          { label: "Tiempo resolución", value: `${promResolucion}h`, sub: "Promedio" },
          { label: "CSAT", value: "94%", sub: "Satisfacción", accent: p.accent },
        ]}
        min={180}
      />

      <Card title="Bandeja de tickets" hint={`${filtered.length} de ${all.length} tickets`}>
        <FilterBar>
          <SearchFilter value={q} onChange={setQ} placeholder="Buscar ticket…" />
          <SelectFilter value={tipo} onChange={setTipo} placeholder="Todos los tipos"
            options={(Object.keys(TIPO_LABEL) as TicketTipo[]).map((v) => ({ value: v, label: TIPO_LABEL[v] }))} />
          <SelectFilter value={estado} onChange={setEstado} placeholder="Todos los estados"
            options={(Object.keys(ESTADO_LABEL) as TicketEstado[]).map((v) => ({ value: v, label: ESTADO_LABEL[v] }))} />
        </FilterBar>

        <DataTable
          columns={columns}
          rows={filtered}
          empty="No hay tickets que coincidan con los filtros."
          maxHeight={560}
        />
      </Card>
    </>
  );
}
