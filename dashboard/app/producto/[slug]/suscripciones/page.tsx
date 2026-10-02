"use client";

/**
 * /producto/[slug]/suscripciones — Dashboard de suscripciones.
 * KPIs del ciclo de vida de la suscripción + tabla de suscripciones con
 * acciones (demo) y filtro por estado. Datos DEMO deterministas.
 */

import { use, useState } from "react";
import { PRODUCT_BY_SLUG } from "@/lib/productos";
import {
  appMeta, getCompanies, money, ESTADO_LABEL, ESTADO_COLOR, type EstadoCliente,
} from "@/lib/backoffice-demo";
import {
  BoHead, KpiGrid, Card, DataTable, Pill, FilterBar, SelectFilter, ghostBtn,
  type Column,
} from "@/components/backoffice/BackofficeUI";

interface Sub {
  id: string;
  nombre: string;
  estado: EstadoCliente;
  planNombre: string;
  precio: string;
  frecuencia: string;
  fechaInicio: string;
  proximaRenovacion: string;
  metodo: string;
}

function fmtISO(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}
function addMonthsISO(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1 + months, d);
  return dt.toISOString().slice(0, 10);
}

const actionsCell: React.CSSProperties = { display: "flex", gap: 6, flexWrap: "wrap" };

export default function SuscripcionesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const p = PRODUCT_BY_SLUG[slug];
  const [estado, setEstado] = useState("");

  const meta = appMeta(slug);
  const companies = getCompanies(slug);
  const planById = Object.fromEntries(meta.plans.map((pl) => [pl.id, pl]));

  if (!p) return null;

  const count = (e: EstadoCliente) => companies.filter((c) => c.estado === e).length;
  const activas = count("activo");
  const renovacionesProximas = companies.filter(
    (c) => c.estado === "activo" && Number(c.fechaAlta.slice(8, 10)) <= 10,
  ).length;
  const upgrades = Math.max(1, Math.round(activas * 0.12));
  const downgrades = Math.max(1, Math.round(activas * 0.04));

  const subs: Sub[] = companies.map((c, i) => {
    const pl = planById[c.plan];
    const frecuencia = i % 4 === 0 ? "Anual" : "Mensual";
    return {
      id: c.id,
      nombre: c.nombre,
      estado: c.estado,
      planNombre: pl?.nombre ?? c.plan,
      precio: money(pl?.precioMensual ?? 0, meta.moneda),
      frecuencia,
      fechaInicio: fmtISO(c.fechaAlta),
      proximaRenovacion: fmtISO(addMonthsISO(c.fechaAlta, frecuencia === "Anual" ? 12 : 1)),
      metodo: i % 2 === 0 ? "Tarjeta" : "Transferencia",
    };
  });

  const rows = estado ? subs.filter((s) => s.estado === estado) : subs;

  const confirmAction = (label: string, nombre: string) => {
    if (typeof window !== "undefined") {
      window.confirm(`${label}: ${nombre}\n\n(Acción de demostración — no modifica datos.)`);
    }
  };

  const estadoOptions = (["activo", "trial", "suspendido", "moroso", "cancelado", "pendiente", "riesgo"] as EstadoCliente[])
    .map((e) => ({ value: e, label: ESTADO_LABEL[e] }));

  const columns: Column<Sub>[] = [
    { key: "nombre", header: "Cliente", render: (s) => <strong>{s.nombre}</strong> },
    { key: "planNombre", header: "Plan" },
    { key: "precio", header: "Precio", align: "right" },
    { key: "frecuencia", header: "Frecuencia" },
    { key: "fechaInicio", header: "Fecha inicio" },
    { key: "proximaRenovacion", header: "Próx. renovación" },
    { key: "metodo", header: "Método" },
    { key: "estado", header: "Estado", render: (s) => <Pill label={ESTADO_LABEL[s.estado]} color={ESTADO_COLOR[s.estado]} /> },
    {
      key: "acciones",
      header: "Acciones",
      render: (s) => (
        <div style={actionsCell}>
          <button style={ghostBtn} onClick={() => confirmAction("Cambiar plan", s.nombre)}>Cambiar plan</button>
          <button style={ghostBtn} onClick={() => confirmAction("Pausar", s.nombre)}>Pausar</button>
          <button style={ghostBtn} onClick={() => confirmAction("Cancelar", s.nombre)}>Cancelar</button>
        </div>
      ),
    },
  ];

  return (
    <>
      <BoHead eyebrow={`${meta.name} · backoffice`} title="Suscripciones" accent={p.accent} />

      <KpiGrid
        items={[
          { label: "Activas", value: String(activas), accent: p.accent },
          { label: "Trials", value: String(count("trial")) },
          { label: "Canceladas", value: String(count("cancelado")) },
          { label: "Pausadas", value: String(count("suspendido")) },
          { label: "Morosas", value: String(count("moroso")) },
          { label: "Renovaciones próximas", value: String(renovacionesProximas), sub: "Próximos 10 días" },
          { label: "Upgrades (mes)", value: String(upgrades), deltaPct: 4.2 },
          { label: "Downgrades (mes)", value: String(downgrades), deltaPct: -1.1 },
        ]}
        min={170}
      />

      <Card title="Suscripciones" hint="Base de clientes con su plan, ciclo de cobro y estado.">
        <FilterBar>
          <SelectFilter value={estado} onChange={setEstado} options={estadoOptions} placeholder="Todos los estados" />
        </FilterBar>
        <DataTable columns={columns} rows={rows} empty="Sin suscripciones con ese estado." maxHeight={560} />
      </Card>
    </>
  );
}
