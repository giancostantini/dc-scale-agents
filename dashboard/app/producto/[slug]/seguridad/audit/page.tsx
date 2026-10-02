"use client";

/**
 * /producto/[slug]/seguridad/audit — SEGURIDAD: registro de auditoría
 * inmutable de cambios administrativos. Datos DEMO deterministas.
 */

import { use, useMemo } from "react";
import { PRODUCT_BY_SLUG } from "@/lib/productos";
import { appMeta, auditLog, type AuditEntry } from "@/lib/backoffice-demo";
import { BoHead, Card, DataTable, type Column } from "@/components/backoffice/BackofficeUI";

function fmtFecha(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AuditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const p = PRODUCT_BY_SLUG[slug];
  const rows = useMemo(() => auditLog(slug, 40), [slug]);

  if (!p) return null;
  const meta = appMeta(slug);

  const columns: Column<AuditEntry>[] = [
    { key: "usuario", header: "Usuario", render: (r) => <strong>{r.usuario}</strong> },
    { key: "accion", header: "Acción", render: (r) => r.accion },
    { key: "fecha", header: "Fecha", render: (r) => fmtFecha(r.fecha) },
    { key: "ip", header: "IP", render: (r) => <code style={{ fontSize: 12 }}>{r.ip}</code> },
    { key: "campo", header: "Campo", render: (r) => <code style={{ fontSize: 12 }}>{r.campo}</code> },
    { key: "antes", header: "Valor anterior", align: "right", render: (r) => <span style={{ color: "var(--text-muted)" }}>{r.antes}</span> },
    { key: "despues", header: "Valor nuevo", align: "right", render: (r) => <strong>{r.despues}</strong> },
  ];

  return (
    <>
      <BoHead eyebrow={`${meta.name} · backoffice`} title="Registro de auditoría" accent={p.accent} />

      <Card title="Audit log" hint="El audit log no puede eliminarse: cada cambio administrativo queda registrado de forma permanente.">
        <DataTable columns={columns} rows={rows} empty="Sin eventos de auditoría." maxHeight={600} />
      </Card>
    </>
  );
}
