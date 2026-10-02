"use client";

/**
 * /producto/[slug] — INICIO: Dashboard ejecutivo del backoffice de la app.
 * Entender el negocio en <10s: KPIs, evolución, clientes, health, alertas.
 * Todo con datos DEMO (deterministas) hasta conectar datos reales.
 */

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { PRODUCT_BY_SLUG } from "@/lib/productos";
import {
  appMeta, execKpis, series, getAlerts, healthBuckets, getCompanies,
  money, type SeriesMetric,
} from "@/lib/backoffice-demo";
import {
  BoHead, KpiGrid, Card, LineTrend, BarsRow, PeriodSelector, SeverityPill,
  solidBtn, ghostBtn, selectStyle,
} from "@/components/backoffice/BackofficeUI";

const METRICS: { value: SeriesMetric; label: string }[] = [
  { value: "mrr", label: "MRR" },
  { value: "clientes", label: "Clientes" },
  { value: "usuarios", label: "Usuarios" },
  { value: "uso", label: "Uso" },
  { value: "revenue", label: "Revenue" },
  { value: "churn", label: "Churn %" },
];
const PERIOD_MONTHS: Record<string, number> = { "7d": 1, "30d": 1, "3m": 3, "6m": 6, "12m": 12 };

export default function InicioPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const p = PRODUCT_BY_SLUG[slug];
  const [metric, setMetric] = useState<SeriesMetric>("mrr");
  const [period, setPeriod] = useState("12m");

  if (!p) return null;
  const meta = appMeta(slug);
  const k = execKpis(slug);
  const hb = healthBuckets(slug);
  const alerts = getAlerts(slug);
  const cs = getCompanies(slug);
  const base = `/producto/${slug}`;
  const months = PERIOD_MONTHS[period] ?? 12;
  const data = series(slug, metric, Math.max(3, months === 1 ? 6 : months));

  const nuevos = cs.filter((c) => c.estado === "activo").length - k.clientesActivos + k.clientesNuevosMes;

  return (
    <>
      <BoHead
        eyebrow={`${meta.name} · backoffice`}
        title="Dashboard ejecutivo"
        accent={p.accent}
        right={<PeriodSelector value={period} onChange={setPeriod} />}
      />

      {/* KPIs principales */}
      <KpiGrid
        items={[
          { label: "Clientes activos", value: String(k.clientesActivos), deltaPct: 5.1, sub: `+${k.clientesNuevosMes} este mes`, onClick: () => router.push(`${base}/clientes/empresas`) },
          { label: "MRR", value: money(k.mrr, k.moneda), deltaPct: k.crecimientoMrrPct, sub: `Net new ${money(k.mrrNetNew, k.moneda)}`, accent: p.accent, onClick: () => router.push(`/finanzas?app=${slug}`) },
          { label: "ARR", value: money(k.arr, k.moneda), sub: "MRR × 12", onClick: () => router.push(`/finanzas?app=${slug}`) },
          { label: "Churn clientes", value: `${k.churnClientes}%`, deltaPct: -0.4, sub: `Revenue ${k.churnRevenue}%`, onClick: () => router.push(`${base}/clientes/salud`) },
          { label: "Usuarios activos", value: k.usuariosActivos.toLocaleString("es-UY"), deltaPct: 7.2, onClick: () => router.push(`${base}/producto/uso`) },
          { label: meta.unit + " (mes)", value: k.usoMes.toLocaleString("es-UY"), deltaPct: 9.3, sub: "Uso principal", onClick: () => router.push(`${base}/producto/uso`) },
        ]}
        min={180}
      />

      {/* Gráfico principal */}
      <Card
        title="Evolución del negocio"
        right={
          <select value={metric} onChange={(e) => setMetric(e.target.value as SeriesMetric)} style={selectStyle}>
            {METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        }
      >
        <LineTrend data={data} color={p.accent} />
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18 }}>
        {/* Clientes */}
        <Card title="Clientes" right={<button onClick={() => router.push(`${base}/clientes/empresas`)} style={ghostBtn}>Ver todos</button>}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Mini label="Activos" value={k.clientesActivos} color="#1F9D55" onClick={() => router.push(`${base}/clientes/empresas?estado=activo`)} />
            <Mini label="Nuevos (mes)" value={k.clientesNuevosMes} color="#2F7D6B" />
            <Mini label="Trials" value={k.trials} color="#2F7D6B" onClick={() => router.push(`${base}/clientes/empresas?estado=trial`)} />
            <Mini label="Cancelados" value={k.cancelados} color="#8A8F8B" onClick={() => router.push(`${base}/clientes/empresas?estado=cancelado`)} />
            <Mini label="En riesgo" value={k.enRiesgo} color="#b04b3a" onClick={() => router.push(`${base}/clientes/empresas?estado=riesgo`)} />
            <Mini label="Morosos" value={k.morosos} color="#C98A1A" onClick={() => router.push(`${base}/clientes/empresas?estado=moroso`)} />
          </div>
        </Card>

        {/* Health score */}
        <Card title="Health Score" right={<button onClick={() => router.push(`${base}/clientes/salud`)} style={ghostBtn}>Detalle</button>}>
          <div style={{ marginTop: 6 }}>
            <BarsRow items={[
              { label: "saludables", value: hb.saludables, color: "#1F9D55" },
              { label: "atención", value: hb.atencion, color: "#C98A1A" },
              { label: "riesgo", value: hb.riesgo, color: "#b04b3a" },
            ]} />
          </div>
        </Card>
      </div>

      {/* Alertas */}
      <Card title="Centro de alertas" hint="Clasificadas por severidad — accionables.">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {alerts.map((a) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: "var(--off-white)", borderRadius: 10, flexWrap: "wrap" }}>
              <SeverityPill severity={a.severity} />
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--deep-green)" }}>{a.title}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{a.detail}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {a.companyId && <button onClick={() => router.push(`${base}/clientes/${a.companyId}`)} style={ghostBtn}>Ver cliente</button>}
                {a.action === "upgrade" && <button onClick={() => router.push(`${base}/clientes/oportunidades`)} style={solidBtn(p.accent)}>Upgrade</button>}
                {a.action === "cobrar" && <button onClick={() => router.push(`/finanzas?app=${slug}`)} style={solidBtn(p.accent)}>Cobrar</button>}
                {a.action === "contactar" && <button onClick={() => router.push(`${base}/clientes/${a.companyId ?? ""}`)} style={solidBtn(p.accent)}>Contactar</button>}
                {(a.action === "ver") && <button onClick={() => router.push(`${base}/tecnologia/integraciones`)} style={ghostBtn}>Ver</button>}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function Mini({ label, value, color, onClick }: { label: string; value: number; color: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} style={{ padding: 12, background: "var(--off-white)", borderRadius: 10, cursor: onClick ? "pointer" : "default", borderLeft: `3px solid ${color}` }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: "var(--deep-green)" }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{label}</div>
    </div>
  );
}
