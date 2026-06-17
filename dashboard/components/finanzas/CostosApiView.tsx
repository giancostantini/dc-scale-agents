"use client";

/**
 * CostosApiView — panel de gasto de la API de Claude, como sub-vista de
 * Finanzas. Lee /api/usage (agrega api_usage + calcula costo) y muestra total
 * del período + desglose por agente/endpoint, por cliente y por modelo.
 *
 * No tiene auth gate propio: vive dentro de /finanzas, que ya restringe a
 * director. La fuente de verdad absoluta del gasto es console.anthropic.com →
 * Usage; este panel da el desglose por agente/cliente que la consola no da.
 */

import { useCallback, useEffect, useState } from "react";

interface Bucket {
  key: string;
  cost: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}
interface UsageData {
  days: number;
  calls: number;
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  cacheReadTokens: number;
  bySource: Bucket[];
  byClient: Bucket[];
  byModel: Bucket[];
}

const usd = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (n: number) => n.toLocaleString("es-AR");

export default function CostosApiView() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/usage?days=${days}`);
      if (!res.ok) throw new Error("No se pudo cargar el gasto.");
      setData(await res.json());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div style={head}>
        <div>
          <h2 style={h2}>Costos de la API de Claude</h2>
          <div style={sub}>
            Últimos {days} días. El total absoluto está en{" "}
            <a
              href="https://console.anthropic.com/settings/usage"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--sand-dark)" }}
            >
              console.anthropic.com → Usage
            </a>
            ; acá ves el desglose por agente y por cliente (lo ya instrumentado).
          </div>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          style={selectStyle}
        >
          <option value={7}>7 días</option>
          <option value={30}>30 días</option>
          <option value={90}>90 días</option>
        </select>
      </div>

      {err && <div style={errorBox}>{err}</div>}
      {loading && <div style={panel}>Cargando…</div>}

      {!loading && data && (
        <>
          <div style={statsRow}>
            <Stat label="Costo estimado" value={usd(data.totalCost)} big />
            <Stat label="Llamadas" value={fmt(data.calls)} />
            <Stat
              label="Tokens (in/out)"
              value={`${fmt(data.totalInputTokens)} / ${fmt(data.totalOutputTokens)}`}
            />
            <Stat label="Cache-read (tok)" value={fmt(data.cacheReadTokens)} />
          </div>

          {data.calls === 0 ? (
            <div style={panel}>
              Todavía no hay registros de uso en este período. Se puebla cuando
              corren los agentes / se usa el dashboard (logging ya activo en los
              call sites instrumentados).
            </div>
          ) : (
            <div style={grid}>
              <Table title="Por agente / endpoint" rows={data.bySource} />
              <Table title="Por cliente" rows={data.byClient} />
              <Table title="Por modelo" rows={data.byModel} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div style={statCard}>
      <div style={statLabel}>{label}</div>
      <div style={{ ...statValue, fontSize: big ? 28 : 19 }}>{value}</div>
    </div>
  );
}

function Table({ title, rows }: { title: string; rows: Bucket[] }) {
  return (
    <div style={panel}>
      <div style={panelTitle}>{title}</div>
      <div>
        {rows.map((r) => (
          <div key={r.key} style={tableRow}>
            <div
              style={{
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {r.key}
              <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                {" "}
                · {r.calls}
              </span>
            </div>
            <div style={{ fontWeight: 700, color: "var(--deep-green)" }}>
              {usd(r.cost)}
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Sin datos.</div>
        )}
      </div>
    </div>
  );
}

// ---- estilos ----
const head: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  marginBottom: 20,
};
const h2: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 800,
  letterSpacing: "-0.02em",
  color: "var(--deep-green)",
  margin: 0,
};
const sub: React.CSSProperties = {
  fontSize: 13,
  color: "var(--text-muted)",
  marginTop: 6,
  maxWidth: 640,
  lineHeight: 1.5,
};
const selectStyle: React.CSSProperties = {
  padding: "8px 12px",
  border: "1px solid rgba(10,26,12,0.15)",
  borderRadius: 6,
  fontSize: 13,
  fontFamily: "inherit",
  background: "var(--white)",
};
const statsRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 12,
  marginBottom: 20,
};
const statCard: React.CSSProperties = {
  background: "var(--white)",
  border: "1px solid var(--hairline)",
  borderRadius: 12,
  padding: "16px 18px",
};
const statLabel: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--sand-dark)",
  fontWeight: 700,
  marginBottom: 8,
};
const statValue: React.CSSProperties = {
  fontWeight: 800,
  color: "var(--deep-green)",
  letterSpacing: "-0.02em",
};
const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 16,
};
const panel: React.CSSProperties = {
  background: "var(--white)",
  border: "1px solid var(--hairline)",
  borderRadius: 12,
  padding: 20,
  fontSize: 13,
  color: "var(--text-muted)",
};
const panelTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: "var(--deep-green)",
  marginBottom: 12,
};
const tableRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "8px 0",
  borderBottom: "1px solid var(--hairline)",
  fontSize: 12.5,
  color: "var(--deep-green)",
};
const errorBox: React.CSSProperties = {
  padding: "10px 12px",
  background: "rgba(176,75,58,0.08)",
  border: "1px solid rgba(176,75,58,0.25)",
  borderRadius: 6,
  fontSize: 12.5,
  color: "#B91C1C",
  marginBottom: 14,
};
