"use client";

/**
 * /producto/[slug]/tecnologia/infraestructura — TECNOLOGÍA: estado de la
 * infraestructura (uptime, servidor, base de datos, storage, colas, jobs,
 * servicios externos). Datos DEMO deterministas.
 */

import { use, useMemo } from "react";
import { PRODUCT_BY_SLUG } from "@/lib/productos";
import { appMeta, infraStatus } from "@/lib/backoffice-demo";
import { BoHead, Card } from "@/components/backoffice/BackofficeUI";

const STATUS_COLOR: Record<string, string> = { operativo: "#1F9D55", degradado: "#C98A1A" };
const STATUS_LABEL: Record<string, string> = { operativo: "Operativo", degradado: "Degradado" };

interface StatusItem { label: string; value: string; dot: string; }

const dotStyle: React.CSSProperties = { width: 10, height: 10, borderRadius: 999, display: "inline-block", flexShrink: 0 };
const itemStyle: React.CSSProperties = {
  background: "var(--off-white)", borderRadius: "var(--r-md)", padding: 16,
  display: "flex", flexDirection: "column", gap: 8,
};

export default function InfraestructuraPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const p = PRODUCT_BY_SLUG[slug];
  const infra = useMemo(() => infraStatus(slug), [slug]);

  if (!p) return null;
  const meta = appMeta(slug);

  const items: StatusItem[] = [
    { label: "Uptime", value: `${infra.uptime}%`, dot: "#1F9D55" },
    { label: "Servidor", value: STATUS_LABEL[infra.servidor], dot: STATUS_COLOR[infra.servidor] },
    { label: "Base de datos", value: STATUS_LABEL[infra.baseDatos], dot: STATUS_COLOR[infra.baseDatos] },
    { label: "Storage", value: infra.storage, dot: p.accent },
    { label: "Queues", value: `${infra.queues} en cola`, dot: infra.queues > 50 ? "#C98A1A" : p.accent },
    { label: "Jobs", value: STATUS_LABEL[infra.jobs], dot: STATUS_COLOR[infra.jobs] },
    { label: "Servicios externos", value: STATUS_LABEL[infra.serviciosExternos], dot: STATUS_COLOR[infra.serviciosExternos] },
  ];

  return (
    <>
      <BoHead eyebrow={`${meta.name} · backoffice`} title="Infraestructura" accent={p.accent} />

      <Card title="Estado de la infraestructura" hint="Salud de los componentes de plataforma en tiempo real.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
          {items.map((it) => (
            <div key={it.label} style={itemStyle}>
              <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--sand-dark)", fontWeight: 700 }}>{it.label}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ ...dotStyle, background: it.dot }} />
                <span style={{ fontSize: 20, fontWeight: 800, color: "var(--deep-green)" }}>{it.value}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
