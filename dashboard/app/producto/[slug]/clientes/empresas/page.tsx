"use client";

/**
 * /producto/[slug]/clientes/empresas — CLIENTES: tabla completa de empresas
 * con KPIs de drill-down y filtros (estado, plan, país, industria + búsqueda).
 * Datos DEMO deterministas. Cada fila abre la ficha Cliente 360.
 */

import { Suspense, use, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PRODUCT_BY_SLUG } from "@/lib/productos";
import {
  appMeta, execKpis, getCompanies, money,
  ESTADO_LABEL, ESTADO_COLOR, type EstadoCliente, type DemoCompany,
} from "@/lib/backoffice-demo";
import {
  BoHead, KpiGrid, Card, DataTable, Pill, UsageBar,
  FilterBar, SelectFilter, SearchFilter, type Column,
} from "@/components/backoffice/BackofficeUI";

function healthColor(h: number): string {
  return h >= 80 ? "#1F9D55" : h >= 50 ? "#C98A1A" : "#b04b3a";
}

export default function EmpresasPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return (
    <Suspense fallback={null}>
      <EmpresasInner slug={slug} />
    </Suspense>
  );
}

function EmpresasInner({ slug }: { slug: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const p = PRODUCT_BY_SLUG[slug];
  const meta = appMeta(slug);
  const cs = getCompanies(slug);

  const [q, setQ] = useState("");
  const [estado, setEstado] = useState(sp.get("estado") ?? "");
  const [plan, setPlan] = useState("");
  const [pais, setPais] = useState("");
  const [industria, setIndustria] = useState("");

  const planName = useMemo(
    () => (id: string) => meta.plans.find((pl) => pl.id === id)?.nombre ?? id,
    [meta.plans],
  );

  const paisOptions = useMemo(
    () => Array.from(new Set(cs.map((c) => c.pais))).sort().map((v) => ({ value: v, label: v })),
    [cs],
  );
  const industriaOptions = useMemo(
    () => Array.from(new Set(cs.map((c) => c.industria))).sort().map((v) => ({ value: v, label: v })),
    [cs],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return cs.filter((c) => {
      if (term && !c.nombre.toLowerCase().includes(term) && !c.razonSocial.toLowerCase().includes(term)) return false;
      if (estado && c.estado !== estado) return false;
      if (plan && c.plan !== plan) return false;
      if (pais && c.pais !== pais) return false;
      if (industria && c.industria !== industria) return false;
      return true;
    });
  }, [cs, q, estado, plan, pais, industria]);

  if (!p) return null;
  const k = execKpis(slug);

  const columns: Column<DemoCompany>[] = [
    {
      key: "empresa", header: "Empresa",
      render: (c) => (
        <div>
          <div style={{ fontWeight: 700 }}>{c.nombre}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{c.razonSocial}</div>
        </div>
      ),
    },
    { key: "plan", header: "Plan", render: (c) => planName(c.plan) },
    { key: "estado", header: "Estado", render: (c) => <Pill label={ESTADO_LABEL[c.estado]} color={ESTADO_COLOR[c.estado]} /> },
    { key: "usuarios", header: "Usuarios", align: "right", render: (c) => `${c.usuariosActivos}/${c.usuarios}` },
    { key: "uso", header: "Uso", render: (c) => <UsageBar value={c.usoActual} max={c.limite} color={p.accent} /> },
    { key: "mrr", header: "MRR", align: "right", render: (c) => money(c.mrr, c.moneda) },
    { key: "fechaAlta", header: "Alta", render: (c) => c.fechaAlta },
    { key: "ultimoAcceso", header: "Último acceso", render: (c) => c.ultimoAcceso },
    { key: "health", header: "Health", align: "right", render: (c) => <strong style={{ color: healthColor(c.health) }}>{c.health}</strong> },
    { key: "responsable", header: "Responsable", render: (c) => c.responsable },
  ];

  const setOnly = (e: EstadoCliente) => setEstado((prev) => (prev === e ? "" : e));

  return (
    <>
      <BoHead eyebrow={`${meta.name} · backoffice`} title="Empresas clientes" accent={p.accent} />

      <KpiGrid
        items={[
          { label: "Activos", value: String(k.clientesActivos), accent: "#1F9D55", onClick: () => setOnly("activo") },
          { label: "Trials", value: String(k.trials), accent: "#2F7D6B", onClick: () => setOnly("trial") },
          { label: "En riesgo", value: String(k.enRiesgo), accent: "#b04b3a", onClick: () => setOnly("riesgo") },
          { label: "Morosos", value: String(k.morosos), accent: "#C98A1A", onClick: () => setOnly("moroso") },
        ]}
        min={180}
      />

      <Card
        title="Base de clientes"
        hint={`${filtered.length} de ${cs.length} empresas`}
      >
        <FilterBar>
          <SearchFilter value={q} onChange={setQ} placeholder="Buscar empresa…" />
          <SelectFilter value={estado} onChange={setEstado} placeholder="Todos los estados"
            options={(Object.keys(ESTADO_LABEL) as EstadoCliente[]).map((e) => ({ value: e, label: ESTADO_LABEL[e] }))} />
          <SelectFilter value={plan} onChange={setPlan} placeholder="Todos los planes"
            options={meta.plans.map((pl) => ({ value: pl.id, label: pl.nombre }))} />
          <SelectFilter value={pais} onChange={setPais} placeholder="Todos los países" options={paisOptions} />
          <SelectFilter value={industria} onChange={setIndustria} placeholder="Todas las industrias" options={industriaOptions} />
        </FilterBar>

        <DataTable
          columns={columns}
          rows={filtered}
          onRowClick={(c) => router.push(`/producto/${slug}/clientes/${c.id}`)}
          empty="No hay empresas que coincidan con los filtros."
          maxHeight={560}
        />
      </Card>
    </>
  );
}
