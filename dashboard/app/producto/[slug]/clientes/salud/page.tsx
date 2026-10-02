"use client";

/**
 * /producto/[slug]/clientes/salud — Customer Health Score.
 * Distribución de salud de la base, pesos del cálculo y ranking de clientes
 * por score (peores primero). Datos DEMO deterministas.
 */

import { use } from "react";
import { useRouter } from "next/navigation";
import { PRODUCT_BY_SLUG } from "@/lib/productos";
import {
  appMeta, getCompanies, healthBuckets, type DemoCompany, type EstadoCliente,
} from "@/lib/backoffice-demo";
import {
  BoHead, Card, DataTable, BarsRow, UsageBar, type Column,
} from "@/components/backoffice/BackofficeUI";

function healthColor(h: number): string {
  return h >= 80 ? "#1F9D55" : h >= 50 ? "#C98A1A" : "#b04b3a";
}

const PESOS = [
  { factor: "Utilización", peso: 35, color: "#2F7D6B" },
  { factor: "Frecuencia de uso", peso: 20, color: "#1F9D55" },
  { factor: "Tendencia", peso: 15, color: "#9B8259" },
  { factor: "Pagos al día", peso: 10, color: "#C98A1A" },
  { factor: "Soporte", peso: 10, color: "#5A6A5E" },
  { factor: "Errores", peso: 10, color: "#b04b3a" },
];

const PROBLEMA: Partial<Record<EstadoCliente, string>> = {
  riesgo: "Caída de uso",
  moroso: "Pago vencido",
  suspendido: "Cuenta suspendida",
  cancelado: "Cliente cancelado",
  trial: "Trial sin convertir",
  pendiente: "Onboarding pendiente",
};
const ACCION: Partial<Record<EstadoCliente, string>> = {
  riesgo: "Contactar y revisar adopción",
  moroso: "Gestionar cobranza",
  suspendido: "Revisar motivo de suspensión",
  cancelado: "Campaña de win-back",
  trial: "Impulsar activación",
  pendiente: "Agendar onboarding",
};

function problema(c: DemoCompany): string {
  if (PROBLEMA[c.estado]) return PROBLEMA[c.estado]!;
  if (c.usoActual / Math.max(1, c.limite) < 0.25) return "Uso bajo del plan";
  if (c.health < 80) return "Engagement moderado";
  return "Sin alertas";
}
function accion(c: DemoCompany): string {
  if (ACCION[c.estado]) return ACCION[c.estado]!;
  if (c.usoActual / Math.max(1, c.limite) < 0.25) return "Recomendar features clave";
  return "Monitorear";
}

export default function SaludPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const p = PRODUCT_BY_SLUG[slug];
  const meta = appMeta(slug);
  const cs = getCompanies(slug);
  const hb = healthBuckets(slug);

  if (!p) return null;

  const rows = [...cs].filter((c) => c.estado !== "cancelado").sort((a, b) => a.health - b.health);

  const columns: Column<DemoCompany>[] = [
    { key: "nombre", header: "Cliente", render: (c) => <strong>{c.nombre}</strong> },
    { key: "health", header: "Score", align: "right", render: (c) => <strong style={{ color: healthColor(c.health) }}>{c.health}</strong> },
    {
      key: "variacion", header: "Variación", align: "right",
      render: (c) => {
        const hash = Array.from(c.id).reduce((a, ch) => a + ch.charCodeAt(0), 0);
        const v = ((hash % 21) - 10); // -10..+10
        return <span style={{ color: v >= 0 ? "#1F9D55" : "#b04b3a", fontWeight: 600 }}>{v >= 0 ? "▲" : "▼"} {Math.abs(v)}%</span>;
      },
    },
    { key: "uso", header: "Uso", render: (c) => <UsageBar value={c.usoActual} max={c.limite} color={p.accent} /> },
    { key: "ultimoAcceso", header: "Último acceso", render: (c) => c.ultimoAcceso },
    { key: "problema", header: "Problema principal", render: (c) => problema(c) },
    { key: "accion", header: "Acción recomendada", render: (c) => <span style={{ color: "var(--text-muted)" }}>{accion(c)}</span> },
  ];

  return (
    <>
      <BoHead eyebrow={`${meta.name} · backoffice`} title="Customer Health Score" accent={p.accent} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18 }}>
        <Card title="Distribución de salud" hint="Clientes por bucket de health score.">
          <BarsRow items={[
            { label: "saludables (≥80)", value: hb.saludables, color: "#1F9D55" },
            { label: "atención (50-79)", value: hb.atencion, color: "#C98A1A" },
            { label: "riesgo (<50)", value: hb.riesgo, color: "#b04b3a" },
          ]} />
        </Card>

        <Card title="Cómo se calcula" hint="Ponderación de factores del score.">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {PESOS.map((f) => (
              <div key={f.factor}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: "var(--deep-green)", fontWeight: 600 }}>{f.factor}</span>
                  <strong style={{ color: "var(--deep-green)" }}>{f.peso}%</strong>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: "var(--off-white)", overflow: "hidden" }}>
                  <div style={{ width: `${f.peso * 2}%`, height: "100%", background: f.color }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Clientes por score" hint="Ordenados de menor a mayor — priorizar los primeros.">
        <DataTable
          columns={columns}
          rows={rows}
          onRowClick={(c) => router.push(`/producto/${slug}/clientes/${c.id}`)}
          empty="Sin clientes para evaluar."
          maxHeight={600}
        />
      </Card>
    </>
  );
}
