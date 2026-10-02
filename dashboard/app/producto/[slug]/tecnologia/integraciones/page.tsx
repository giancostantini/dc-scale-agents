"use client";

/**
 * /producto/[slug]/tecnologia/integraciones — TECNOLOGÍA: estado de las
 * integraciones externas (ERP, WhatsApp, mapas, pagos, webhooks).
 * Datos DEMO deterministas.
 */

import { use, useMemo } from "react";
import { PRODUCT_BY_SLUG } from "@/lib/productos";
import { appMeta, integraciones, type DemoIntegracion } from "@/lib/backoffice-demo";
import { BoHead, KpiGrid, Card, DataTable, Pill, type Column } from "@/components/backoffice/BackofficeUI";

const ESTADO_LABEL: Record<DemoIntegracion["estado"], string> = {
  ok: "Operativa", degradada: "Degradada", caida: "Caída",
};
const ESTADO_COLOR: Record<DemoIntegracion["estado"], string> = {
  ok: "#1F9D55", degradada: "#C98A1A", caida: "#b04b3a",
};

export default function IntegracionesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const p = PRODUCT_BY_SLUG[slug];
  const all = useMemo(() => integraciones(slug), [slug]);

  if (!p) return null;
  const meta = appMeta(slug);

  const operativas = all.filter((i) => i.estado === "ok").length;
  const degradadas = all.filter((i) => i.estado === "degradada").length;
  const caidas = all.filter((i) => i.estado === "caida").length;
  const errores = all.reduce((s, i) => s + i.errores24h, 0);

  const columns: Column<DemoIntegracion>[] = [
    { key: "nombre", header: "Integración", render: (i) => <strong>{i.nombre}</strong> },
    { key: "clientes", header: "Clientes", align: "right", render: (i) => i.clientes.toLocaleString("es-UY") },
    { key: "estado", header: "Estado", render: (i) => <Pill label={ESTADO_LABEL[i.estado]} color={ESTADO_COLOR[i.estado]} /> },
    { key: "ultimaSync", header: "Última sync", render: (i) => i.ultimaSync },
    { key: "errores24h", header: "Errores 24h", align: "right", render: (i) => <span style={{ color: i.errores24h > 0 ? "#b04b3a" : "var(--text-muted)", fontWeight: i.errores24h > 0 ? 700 : 400 }}>{i.errores24h}</span> },
  ];

  return (
    <>
      <BoHead eyebrow={`${meta.name} · backoffice`} title="Integraciones" accent={p.accent} />

      <KpiGrid
        items={[
          { label: "Total", value: String(all.length) },
          { label: "Operativas", value: String(operativas), accent: "#1F9D55" },
          { label: "Degradadas", value: String(degradadas), accent: "#C98A1A" },
          { label: "Caídas", value: String(caidas), accent: "#b04b3a" },
          { label: "Errores 24h", value: errores.toLocaleString("es-UY"), accent: errores > 0 ? "#b04b3a" : undefined },
        ]}
        min={180}
      />

      <Card title="Estado de integraciones" hint={`${all.length} integraciones conectadas`}>
        <DataTable columns={columns} rows={all} empty="No hay integraciones conectadas." maxHeight={560} />
      </Card>
    </>
  );
}
