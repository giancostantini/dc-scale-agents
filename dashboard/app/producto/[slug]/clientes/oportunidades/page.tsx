"use client";

/**
 * /producto/[slug]/clientes/oportunidades — Upselling.
 * Detecta clientes con señales de upgrade (cerca del límite, >90% del plan,
 * crecimiento acelerado, usuarios al tope) y sugiere el plan siguiente.
 * Datos DEMO deterministas.
 */

import { use } from "react";
import { useRouter } from "next/navigation";
import { PRODUCT_BY_SLUG } from "@/lib/productos";
import {
  appMeta, getCompanies, money, type DemoCompany, type DemoPlan,
} from "@/lib/backoffice-demo";
import {
  BoHead, KpiGrid, Card, DataTable, ghostBtn, solidBtn, type Column,
} from "@/components/backoffice/BackofficeUI";

interface Opportunity {
  id: string;
  company: DemoCompany;
  planActual: DemoPlan;
  planSugerido: DemoPlan;
  pct: number;
  motivo: string;
  uplift: number;
  nearLimit: boolean;
  over90: boolean;
  needsUsers: boolean;
}

export default function OportunidadesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const p = PRODUCT_BY_SLUG[slug];
  const meta = appMeta(slug);
  const cs = getCompanies(slug);

  if (!p) return null;

  const opps: Opportunity[] = [];
  for (const c of cs) {
    if (!(c.estado === "activo" || c.estado === "riesgo" || c.estado === "moroso")) continue;
    const idx = meta.plans.findIndex((pl) => pl.id === c.plan);
    const planActual = meta.plans[idx];
    const planSugerido = meta.plans[idx + 1];
    if (!planActual || !planSugerido) continue; // ya está en el plan superior

    const pct = c.usoActual / Math.max(1, c.limite);
    const hash = Array.from(c.id).reduce((a, ch) => a + ch.charCodeAt(0), 0);
    const over90 = pct > 0.9;
    const nearLimit = pct >= 0.8;
    const needsUsers = c.usuariosActivos >= planActual.usuarios * 0.8;
    const growth = hash % 3 === 0;
    if (!nearLimit && !needsUsers && !growth) continue;

    const motivo = over90
      ? `${Math.round(pct * 100)}% del plan`
      : nearLimit
        ? `${Math.round(pct * 100)}% del plan`
        : needsUsers
          ? `${c.usuariosActivos}/${planActual.usuarios} usuarios`
          : "Crecimiento acelerado";

    opps.push({
      id: c.id, company: c, planActual, planSugerido, pct, motivo,
      uplift: planSugerido.precioMensual - planActual.precioMensual,
      nearLimit, over90, needsUsers,
    });
  }
  opps.sort((a, b) => b.pct - a.pct);

  const totalUplift = opps.reduce((s, o) => s + o.uplift, 0);
  const over90Count = opps.filter((o) => o.over90).length;
  const upgradeCount = opps.filter((o) => o.nearLimit).length;
  const needsUsersCount = opps.filter((o) => o.needsUsers).length;

  const cambiarPlan = (o: Opportunity) => () => {
    if (typeof window !== "undefined") window.confirm(`Cambiar ${o.company.nombre} de ${o.planActual.nombre} a ${o.planSugerido.nombre}?`);
  };

  const columns: Column<Opportunity>[] = [
    { key: "empresa", header: "Empresa", render: (o) => <strong>{o.company.nombre}</strong> },
    { key: "motivo", header: "Motivo", render: (o) => o.motivo },
    { key: "actual", header: "Plan actual", render: (o) => o.planActual.nombre },
    { key: "sugerido", header: "Plan sugerido", render: (o) => <span style={{ color: p.accent, fontWeight: 700 }}>{o.planSugerido.nombre}</span> },
    { key: "uplift", header: "Uplift estimado", align: "right", render: (o) => <strong style={{ color: "#1F9D55" }}>+{money(o.uplift, o.company.moneda)}</strong> },
    {
      key: "acciones", header: "Acciones",
      render: (o) => (
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => router.push(`/producto/${slug}/clientes/${o.company.id}`)} style={ghostBtn}>Ver cliente</button>
          <button onClick={cambiarPlan(o)} style={solidBtn(p.accent)}>Cambiar plan</button>
        </div>
      ),
    },
  ];

  return (
    <>
      <BoHead eyebrow={`${meta.name} · backoffice`} title="Oportunidades de upselling" accent={p.accent} />

      <KpiGrid
        items={[
          { label: "Oportunidades totales", value: String(opps.length), accent: p.accent, sub: `+${money(totalUplift, meta.moneda)}/mes potencial` },
          { label: ">90% del plan", value: String(over90Count), accent: "#b04b3a" },
          { label: "Candidatos a upgrade", value: String(upgradeCount), accent: "#C98A1A" },
          { label: "Necesitan + usuarios", value: String(needsUsersCount) },
        ]}
        min={190}
      />

      <Card title="Clientes con potencial de upgrade" hint="Ordenados por consumo del plan — los más cerca del límite primero.">
        <DataTable
          columns={columns}
          rows={opps}
          empty="No hay oportunidades de upselling detectadas."
          maxHeight={600}
        />
      </Card>
    </>
  );
}
