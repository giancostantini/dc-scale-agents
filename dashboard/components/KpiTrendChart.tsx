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
  ReferenceLine,
} from "recharts";
import { getSupabase } from "@/lib/supabase/client";
import styles from "./KpiTrendChart.module.css";

const PROJECT_MONTHS = 3; // cuántos meses proyectar hacia adelante

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
      <div className={styles.disclaimer}>
        Las líneas punteadas son proyecciones basadas en tendencia simple
        de los meses cargados. No son objetivos ni promesas — sirven solo
        para tener una idea de a dónde va el ritmo si nada cambia.
      </div>
    </div>
  );
}

/**
 * Regresión linear simple sobre puntos (x, y).
 * Devuelve null si hay <3 puntos o varianza cero (todos iguales).
 */
function linearRegression(
  points: Array<{ x: number; y: number }>,
): { slope: number; intercept: number } | null {
  if (points.length < 3) return null;
  const n = points.length;
  const sumX = points.reduce((acc, p) => acc + p.x, 0);
  const sumY = points.reduce((acc, p) => acc + p.y, 0);
  const sumXY = points.reduce((acc, p) => acc + p.x * p.y, 0);
  const sumX2 = points.reduce((acc, p) => acc + p.x * p.x, 0);
  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  if (!Number.isFinite(slope) || !Number.isFinite(intercept)) return null;
  return { slope, intercept };
}

/**
 * Suma N meses a un YYYY-MM. Ej. addMonths("2026-05", 2) = "2026-07".
 */
function addMonths(yearMonth: string, delta: number): string {
  const [yStr, mStr] = yearMonth.split("-");
  let y = parseInt(yStr, 10);
  let m = parseInt(mStr, 10) + delta;
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

function MiniChart({
  metric,
  snapshots,
}: {
  metric: MetricConfig;
  snapshots: SnapshotRow[];
}) {
  // Puntos reales con su valor numérico parseado.
  const realPoints = useMemo(() => {
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

  // Regresión linear sobre los puntos reales para extrapolar.
  // x = índice del mes (0, 1, 2, ...), y = valor.
  const projection = useMemo(() => {
    if (realPoints.length < 3) return null;
    const reg = linearRegression(
      realPoints.map((p, i) => ({ x: i, y: p.value as number })),
    );
    if (!reg) return null;

    const lastIdx = realPoints.length - 1;
    const lastMonth = realPoints[lastIdx].month;
    const projectedPoints: Array<{
      month: string;
      monthLabel: string;
      value: number;
    }> = [];
    for (let i = 1; i <= PROJECT_MONTHS; i++) {
      const futureX = lastIdx + i;
      const futureValue = reg.slope * futureX + reg.intercept;
      // Solo proyectar valores no-negativos para métricas que no tiene sentido
      // ver en negativo (todos los nuestros). Si el slope llevaría a negativo,
      // recortamos a 0.
      const safe = Math.max(0, futureValue);
      projectedPoints.push({
        month: addMonths(lastMonth, i),
        monthLabel: shortMonth(addMonths(lastMonth, i)),
        value: safe,
      });
    }

    return { slope: reg.slope, points: projectedPoints };
  }, [realPoints]);

  // Combinar real + proyección en una sola serie con dos campos:
  // `real` (sólido) y `projected` (punteado). El último punto real
  // tiene AMBOS valores para que la línea punteada se conecte
  // visualmente con la sólida.
  type ChartPoint = {
    month: string;
    monthLabel: string;
    real: number | null;
    projected: number | null;
    rawLabel?: string;
  };

  const chartData: ChartPoint[] = useMemo(() => {
    const out: ChartPoint[] = [];
    realPoints.forEach((p, i) => {
      const isLast = i === realPoints.length - 1 && projection !== null;
      out.push({
        month: p.month,
        monthLabel: p.monthLabel,
        real: p.value,
        projected: isLast ? p.value : null,
        rawLabel: p.rawLabel,
      });
    });
    if (projection) {
      for (const proj of projection.points) {
        out.push({
          month: proj.month,
          monthLabel: proj.monthLabel,
          real: null,
          projected: proj.value,
        });
      }
    }
    return out;
  }, [realPoints, projection]);

  // Estos hooks tienen que ir ANTES del early return de "Sin datos"
  // (rules-of-hooks). El último valor real lo computamos seguro
  // (puede ser undefined si no hay puntos, pero el useMemo lo maneja).
  const lastValue = realPoints.length > 0
    ? (realPoints[realPoints.length - 1].value as number)
    : null;

  // Tasa textual a partir de la regresión: cuánto crece/decrece por mes.
  const growthRateLabel = useMemo(() => {
    if (!projection || lastValue === null) return null;
    if (lastValue === 0) {
      return formatValue(projection.slope, metric.format) + "/mes";
    }
    const pctMonthly = (projection.slope / lastValue) * 100;
    if (Math.abs(pctMonthly) < 0.1) return "estable mes a mes";
    const sign = pctMonthly > 0 ? "+" : "";
    return `${sign}${pctMonthly.toFixed(1)}% por mes`;
  }, [projection, lastValue, metric.format]);

  if (realPoints.length === 0) {
    return (
      <div className={styles.miniChart}>
        <div className={styles.miniLabel}>{metric.label}</div>
        <div className={styles.miniEmpty}>Sin datos</div>
      </div>
    );
  }

  const last = realPoints[realPoints.length - 1];
  const first = realPoints[0];
  const delta = last.value !== null && first.value !== null
    ? (last.value as number) - (first.value as number)
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
      {realPoints.length >= 2 && (
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
      {growthRateLabel && (
        <div className={styles.miniRate}>
          Ritmo proyectado: {growthRateLabel}
        </div>
      )}
      <div className={styles.chartArea}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
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
            {/* Línea vertical que separa "real" de "proyección" */}
            {projection && realPoints.length > 0 && (
              <ReferenceLine
                x={realPoints[realPoints.length - 1].monthLabel}
                stroke="rgba(10, 26, 12, 0.18)"
                strokeDasharray="2 3"
                ifOverflow="extendDomain"
              />
            )}
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
              formatter={(v: number, name: string) => {
                if (v === null || v === undefined) return ["", ""];
                const label = name === "projected" ? "Proyección" : metric.label;
                return [formatValue(v, metric.format), label];
              }}
            />
            <Line
              type="monotone"
              dataKey="real"
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
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="projected"
              stroke="var(--sand-dark)"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={{
                fill: "var(--sand-light)",
                strokeWidth: 0,
                r: 2,
              }}
              activeDot={{
                r: 4,
                fill: "var(--sand-dark)",
                strokeWidth: 0,
              }}
              connectNulls={false}
              isAnimationActive={false}
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
