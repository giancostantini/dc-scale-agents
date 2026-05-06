"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { getSupabase } from "@/lib/supabase/client";
import styles from "./KpiTrendChart.module.css";

interface SnapshotRow {
  month: string;
  kpis: Record<string, unknown>;
  captured_at: string;
}

interface MetricConfig {
  key: string;
  label: string;
  /** Cómo formatear el valor del eje Y / tooltip. */
  format?: "number" | "currency" | "percent" | "ratio";
}

const METRICS: MetricConfig[] = [
  { key: "roas", label: "ROAS", format: "ratio" },
  { key: "leads", label: "Leads", format: "number" },
  { key: "cac", label: "CAC", format: "currency" },
  { key: "conv", label: "Conversión", format: "percent" },
];

const MONTH_SHORT_ES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

/**
 * Grid con 4 mini-charts de evolución mensual de los KPIs principales.
 * Hace una sola request al backend (`/api/portal/kpi-history`) y deriva
 * cada serie en cliente.
 */
export default function KpiTrendChart() {
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const supabase = getSupabase();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          if (active) {
            setError("Sin sesión.");
            setLoading(false);
          }
          return;
        }
        const res = await fetch("/api/portal/kpi-history?months=12", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = (await res.json().catch(() => ({}))) as {
          snapshots?: SnapshotRow[];
          error?: string;
        };
        if (!active) return;
        if (!res.ok) {
          setError(data.error ?? `Error ${res.status}`);
          setLoading(false);
          return;
        }
        setSnapshots(data.snapshots ?? []);
        setLoading(false);
      } catch (err) {
        console.error("kpi-history fetch error:", err);
        if (active) {
          setError("Error de red.");
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.eyebrow}>Evolución de KPIs</div>
        <div className={styles.skeleton} />
      </div>
    );
  }

  if (error) return null; // silent fallback

  if (snapshots.length < 2) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.eyebrow}>Evolución de KPIs</div>
        <div className={styles.empty}>
          Vamos a ver la evolución cuando tengamos al menos 2 meses de
          datos cargados. Por ahora solo hay {snapshots.length === 0 ? "snapshot inicial" : "1 snapshot"} guardado.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.eyebrow}>Evolución de KPIs (últimos meses)</div>
      <div className={styles.grid}>
        {METRICS.map((m) => (
          <MiniChart key={m.key} metric={m} snapshots={snapshots} />
        ))}
      </div>
    </div>
  );
}

function MiniChart({
  metric,
  snapshots,
}: {
  metric: MetricConfig;
  snapshots: SnapshotRow[];
}) {
  const data = useMemo(() => {
    return snapshots
      .map((s) => {
        const raw = (s.kpis as Record<string, unknown>)?.[metric.key];
        const value = parseKpiValue(raw);
        return {
          month: s.month,
          monthLabel: shortMonth(s.month),
          value,
          rawLabel: typeof raw === "string" ? raw : raw != null ? String(raw) : "",
        };
      })
      .filter((p) => p.value !== null);
  }, [snapshots, metric.key]);

  if (data.length === 0) {
    return (
      <div className={styles.miniChart}>
        <div className={styles.miniLabel}>{metric.label}</div>
        <div className={styles.miniEmpty}>Sin datos</div>
      </div>
    );
  }

  const last = data[data.length - 1];
  const first = data[0];
  const delta = last.value !== null && first.value !== null
    ? last.value - first.value
    : 0;
  const deltaPositive = delta >= 0;
  const isInverted = metric.key === "cac"; // CAC menor es mejor

  return (
    <div className={styles.miniChart}>
      <div className={styles.miniHead}>
        <div className={styles.miniLabel}>{metric.label}</div>
        <div className={styles.miniValue}>
          {last.rawLabel || formatValue(last.value, metric.format)}
        </div>
      </div>
      {data.length >= 2 && (
        <div
          className={styles.miniDelta}
          style={{
            color:
              (deltaPositive && !isInverted) || (!deltaPositive && isInverted)
                ? "var(--green-ok)"
                : "var(--red-warn)",
          }}
        >
          {deltaPositive ? "↑" : "↓"} {Math.abs(delta).toFixed(2)} vs primer mes
        </div>
      )}
      <div className={styles.chartArea}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 6, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="2 2"
              stroke="rgba(10, 26, 12, 0.06)"
              vertical={false}
            />
            <XAxis
              dataKey="monthLabel"
              tick={{ fontSize: 10, fill: "var(--text-muted)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--text-muted)" }}
              axisLine={false}
              tickLine={false}
              width={28}
              tickFormatter={(v) => formatTickAxis(v, metric.format)}
            />
            <Tooltip
              cursor={{ stroke: "var(--sand)", strokeWidth: 1 }}
              contentStyle={{
                background: "var(--white)",
                border: "1px solid rgba(10,26,12,0.1)",
                borderRadius: 1,
                fontSize: 12,
                fontFamily: "inherit",
              }}
              labelStyle={{ fontWeight: 600, color: "var(--deep-green)" }}
              formatter={(v: number) => [formatValue(v, metric.format), metric.label]}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--sand)"
              strokeWidth={2}
              dot={{
                fill: "var(--sand)",
                strokeWidth: 0,
                r: 3,
              }}
              activeDot={{
                r: 5,
                fill: "var(--deep-green)",
                strokeWidth: 0,
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function parseKpiValue(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") {
    const cleaned = raw.replace(/[^0-9.,-]/g, "").replace(",", ".");
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function shortMonth(yearMonth: string): string {
  const m = parseInt(yearMonth.slice(5, 7), 10);
  return MONTH_SHORT_ES[m - 1] ?? yearMonth.slice(5, 7);
}

function formatValue(v: number | null, fmt?: MetricConfig["format"]): string {
  if (v === null) return "—";
  switch (fmt) {
    case "currency":
      return `US$${v.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
    case "percent":
      return `${v.toFixed(1)}%`;
    case "ratio":
      return `${v.toFixed(2)}x`;
    default:
      return v.toLocaleString("es-AR", { maximumFractionDigits: 2 });
  }
}

function formatTickAxis(v: number, fmt?: MetricConfig["format"]): string {
  if (fmt === "currency") return v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`;
  if (fmt === "percent") return `${v.toFixed(0)}%`;
  if (fmt === "ratio") return `${v.toFixed(1)}`;
  return v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`;
}
