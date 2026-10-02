"use client";

/**
 * Kit de UI del backoffice SaaS. Componentes ejecutivos reutilizables:
 * KPIs con variación + drill-down, tablas con filtros, gráfico de línea,
 * pills de estado/severidad, badge DEMO. Estética sobria/premium.
 */

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SeriesPoint, AlertSeverity } from "@/lib/backoffice-demo";

// ---------------- PageHead ----------------
export function BoHead({
  eyebrow,
  title,
  accent,
  right,
}: {
  eyebrow: string;
  title: string;
  accent: string;
  right?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: accent, fontWeight: 700 }}>{eyebrow}</span>
          <DemoBadge />
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--deep-green)", margin: 0 }}>{title}</h1>
      </div>
      {right}
    </div>
  );
}

export function DemoBadge() {
  return (
    <span
      title="Datos de demostración — se reemplazan por datos reales al conectar cada fuente."
      style={{ fontSize: 9, letterSpacing: "0.12em", fontWeight: 800, color: "#9B8259", background: "rgba(155,130,89,0.12)", border: "1px solid rgba(155,130,89,0.3)", padding: "2px 6px", borderRadius: 4 }}
    >
      DEMO
    </span>
  );
}

// ---------------- KPIs ----------------
export interface KpiDef {
  label: string;
  value: string;
  sub?: string;
  deltaPct?: number;
  accent?: string;
  onClick?: () => void;
}

export function KpiGrid({ items, min = 190 }: { items: KpiDef[]; min?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 14, marginBottom: 22 }}>
      {items.map((k) => <KpiCard key={k.label} {...k} />)}
    </div>
  );
}

export function KpiCard({ label, value, sub, deltaPct, accent, onClick }: KpiDef) {
  const up = (deltaPct ?? 0) >= 0;
  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--white)",
        border: "1px solid rgba(10,26,12,0.08)",
        borderRadius: "var(--r-md)",
        padding: 18,
        boxShadow: "var(--shadow-sm)",
        cursor: onClick ? "pointer" : "default",
        transition: "box-shadow 0.15s ease, transform 0.15s ease",
      }}
      onMouseEnter={onClick ? (e) => { e.currentTarget.style.boxShadow = "0 6px 20px rgba(10,26,12,0.1)"; } : undefined}
      onMouseLeave={onClick ? (e) => { e.currentTarget.style.boxShadow = "var(--shadow-sm)"; } : undefined}
    >
      <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--sand-dark)", fontWeight: 700, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent ?? "var(--deep-green)", lineHeight: 1.1 }}>{value}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, minHeight: 16 }}>
        {deltaPct !== undefined && (
          <span style={{ fontSize: 12, fontWeight: 700, color: up ? "#1F9D55" : "#b04b3a" }}>
            {up ? "▲" : "▼"} {Math.abs(deltaPct)}%
          </span>
        )}
        {sub && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{sub}</span>}
      </div>
    </div>
  );
}

// ---------------- Panel ----------------
export function Card({
  title,
  hint,
  right,
  children,
  pad = 20,
}: {
  title?: string;
  hint?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  pad?: number;
}) {
  return (
    <section style={{ background: "var(--white)", border: "1px solid rgba(10,26,12,0.08)", borderRadius: "var(--r-lg)", padding: pad, boxShadow: "var(--shadow-sm)", marginBottom: 18 }}>
      {(title || right) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <div>
            {title && <div style={{ fontSize: 15, fontWeight: 700, color: "var(--deep-green)" }}>{title}</div>}
            {hint && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{hint}</div>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 28, textAlign: "center", color: "var(--text-muted)", fontSize: 13, border: "1px dashed rgba(10,26,12,0.12)", borderRadius: "var(--r-md)" }}>
      {children}
    </div>
  );
}

// ---------------- Pills ----------------
export function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, color, background: `${color}1A`, whiteSpace: "nowrap" }}>{label}</span>
  );
}

const SEV_COLOR: Record<AlertSeverity, string> = { critica: "#b04b3a", alta: "#C98A1A", media: "#2F7D6B", info: "#5A6A5E" };
const SEV_LABEL: Record<AlertSeverity, string> = { critica: "Crítica", alta: "Alta", media: "Media", info: "Info" };
export function SeverityPill({ severity }: { severity: AlertSeverity }) {
  return <Pill label={SEV_LABEL[severity]} color={SEV_COLOR[severity]} />;
}

// ---------------- Gráfico de línea ----------------
export function LineTrend({ data, color = "#2F7D6B", height = 240 }: { data: SeriesPoint[]; color?: string; height?: number }) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,26,12,0.06)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} width={48} />
          <Tooltip
            contentStyle={{ borderRadius: 10, border: "1px solid rgba(10,26,12,0.1)", fontSize: 12 }}
            labelStyle={{ color: "var(--deep-green)", fontWeight: 700 }}
          />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------- Barras simples (distribución) ----------------
export function BarsRow({ items }: { items: { label: string; value: number; color: string }[] }) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", height: 14, borderRadius: 999, overflow: "hidden", background: "var(--off-white)" }}>
        {items.map((i) => (
          <div key={i.label} style={{ width: `${(i.value / total) * 100}%`, background: i.color }} title={`${i.label}: ${i.value}`} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        {items.map((i) => (
          <span key={i.label} style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: i.color }} />
            <strong style={{ color: "var(--deep-green)" }}>{i.value}</strong> {i.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Barra de progreso (uso vs límite). */
export function UsageBar({ value, max, color = "#2F7D6B" }: { value: number; max: number; color?: string }) {
  const pct = Math.min(100, Math.round((value / Math.max(1, max)) * 100));
  const c = pct >= 95 ? "#b04b3a" : pct >= 85 ? "#C98A1A" : color;
  return (
    <div style={{ minWidth: 120 }}>
      <div style={{ height: 8, borderRadius: 999, background: "var(--off-white)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: c }} />
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{value.toLocaleString("es-UY")} / {max.toLocaleString("es-UY")} · {pct}%</div>
    </div>
  );
}

// ---------------- Tabla genérica ----------------
export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  align?: "left" | "right" | "center";
  width?: number | string;
}

export function DataTable<T>({
  columns,
  rows,
  onRowClick,
  empty = "Sin datos.",
  maxHeight,
}: {
  columns: Column<T>[];
  rows: T[];
  onRowClick?: (row: T) => void;
  empty?: string;
  maxHeight?: number;
}) {
  if (rows.length === 0) return <EmptyState>{empty}</EmptyState>;
  return (
    <div style={{ overflowX: "auto", maxHeight, overflowY: maxHeight ? "auto" : undefined, borderRadius: "var(--r-md)", border: "1px solid rgba(10,26,12,0.06)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "var(--off-white)", position: maxHeight ? "sticky" : undefined, top: 0, zIndex: 1 }}>
            {columns.map((c) => (
              <th key={c.key} style={{ textAlign: c.align ?? "left", padding: "10px 12px", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--sand-dark)", fontWeight: 700, whiteSpace: "nowrap", width: c.width }}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={(row as { id?: string | number }).id ?? i}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={{ borderTop: "1px solid rgba(10,26,12,0.06)", cursor: onRowClick ? "pointer" : "default" }}
              onMouseEnter={onRowClick ? (e) => { e.currentTarget.style.background = "var(--off-white)"; } : undefined}
              onMouseLeave={onRowClick ? (e) => { e.currentTarget.style.background = "transparent"; } : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} style={{ textAlign: c.align ?? "left", padding: "10px 12px", color: "var(--deep-green)", whiteSpace: "nowrap" }}>
                  {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------- Filtros ----------------
export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>{children}</div>;
}

export function SelectFilter({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={selectStyle}>
      <option value="">{placeholder ?? "Todos"}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function SearchFilter({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? "Buscar…"} style={{ ...selectStyle, minWidth: 220 }} />;
}

/** Hook simple para filtrar + buscar en una tabla. */
export function useTableFilter<T>(rows: T[], predicate: (row: T, q: string) => boolean, q: string) {
  return useMemo(() => (q.trim() ? rows.filter((r) => predicate(r, q.toLowerCase())) : rows), [rows, q, predicate]);
}

// ---------------- Período ----------------
export const PERIODS = [
  { value: "7d", label: "7 días" },
  { value: "30d", label: "30 días" },
  { value: "3m", label: "3 meses" },
  { value: "6m", label: "6 meses" },
  { value: "12m", label: "12 meses" },
];
export function PeriodSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "inline-flex", gap: 2, background: "var(--off-white)", borderRadius: 8, padding: 3 }}>
      {PERIODS.map((p) => (
        <button
          key={p.value}
          onClick={() => onChange(p.value)}
          style={{
            padding: "5px 11px", fontSize: 12, fontWeight: 600, border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
            background: value === p.value ? "var(--white)" : "transparent",
            color: value === p.value ? "var(--deep-green)" : "var(--text-muted)",
            boxShadow: value === p.value ? "var(--shadow-sm)" : "none",
          }}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

// ---------------- estilos ----------------
export const selectStyle: React.CSSProperties = {
  padding: "8px 10px", border: "1px solid rgba(10,26,12,0.15)", borderRadius: 6, fontSize: 13,
  fontFamily: "inherit", background: "var(--white)", color: "var(--deep-green)", outline: "none",
};
export const ghostBtn: React.CSSProperties = {
  padding: "8px 14px", fontSize: 12, fontWeight: 600, background: "transparent",
  border: "1px solid rgba(10,26,12,0.15)", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", color: "var(--deep-green)",
};
export function solidBtn(bg: string): React.CSSProperties {
  return { padding: "8px 16px", fontSize: 12, fontWeight: 700, background: bg, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" };
}
