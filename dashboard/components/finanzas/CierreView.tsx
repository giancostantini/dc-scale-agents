"use client";

/**
 * CierreView — FIN-3 · Cierre mensual + proyección de cashflow
 *
 * Dos mitades:
 *   1. CIERRE (persistido, monthly_closes): números deterministas +
 *      narrativa IA. Nace draft (cron día 2 o botón) y un socio lo marca
 *      FINAL cuando lo revisó — la IA jamás lo declara sola.
 *   2. PROYECCIÓN 90 días (en vivo, no persistida): fees programados +
 *      ingresos fijos vigentes − egresos recurrentes, por moneda, con la
 *      posición proyectada partiendo del saldo actual de cuentas.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { listCuentas } from "@/lib/cuentas-bancarias";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import {
  currentMonthUY,
  addMonths,
  posicionPorMoneda,
  proyeccionMeses,
  type ExchangeRateRow,
} from "@/lib/tesoreria";
import type { MonthlyCloseRow } from "@/lib/cierre-types";
import type { ManualRevenue } from "@/lib/finanzas";
import type {
  Client,
  ClientFeeSchedule,
  Expense,
  FinanceCurrency,
} from "@/lib/types";

interface Props {
  clients: Client[];
  expenses: Expense[];
  manualRevs: ManualRevenue[];
  feeSchedules: ClientFeeSchedule[];
}

const fmt = (n: number) => Math.round(n).toLocaleString("es-UY");

const STATUS_LABEL: Record<string, string> = {
  paid: "pagada",
  pending: "pendiente",
  late: "vencida",
  sin_factura: "sin factura",
};

export default function CierreView({
  clients,
  expenses,
  manualRevs,
  feeSchedules,
}: Props) {
  const [closes, setCloses] = useState<MonthlyCloseRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [posicion, setPosicion] = useState<Record<string, number>>({});
  const [rate, setRate] = useState<ExchangeRateRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadCloses = useCallback(async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("monthly_closes")
      .select("*")
      .order("month", { ascending: false })
      .limit(24);
    if (error && !error.message.includes("does not exist")) {
      setErr(error.message);
      return;
    }
    const rows = (data ?? []) as MonthlyCloseRow[];
    setCloses(rows);
    setSelected((prev) => prev ?? rows[0]?.month ?? null);
  }, []);

  useEffect(() => {
    const supabase = getSupabase();
    loadCloses();
    listCuentas().then((cts) => setPosicion(posicionPorMoneda(cts)));
    supabase
      .from("exchange_rates")
      .select("rate_date, usd_uyu_buy, usd_uyu_sell, usd_uyu_mid, source")
      .order("rate_date", { ascending: false })
      .limit(1)
      .then(({ data }) => setRate((data?.[0] as ExchangeRateRow) ?? null));
  }, [loadCloses]);

  const close = closes.find((c) => c.month === selected) ?? null;
  const prevMonth = addMonths(currentMonthUY(), -1);

  async function generate(month: string) {
    setBusy(true);
    setErr(null);
    try {
      const supabase = getSupabase();
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const res = await fetch("/api/finanzas/cierre", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ month }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      await loadCloses();
      setSelected(month);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(row: MonthlyCloseRow, status: "draft" | "final") {
    setBusy(true);
    setErr(null);
    try {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("monthly_closes")
        .update(
          status === "final"
            ? { status, finalized_at: new Date().toISOString(), finalized_by: user?.id ?? null }
            : { status, finalized_at: null, finalized_by: null },
        )
        .eq("id", row.id);
      if (error) throw new Error(error.message);
      await loadCloses();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // ===== Proyección 90 días (en vivo) =====
  const proyeccion = useMemo(
    () =>
      proyeccionMeses({
        startMonth: currentMonthUY(),
        count: 3,
        clients,
        feeSchedules,
        revenues: manualRevs,
        expenses,
        rate: rate?.usd_uyu_mid ?? null,
        posicionActual: posicion,
      }),
    [clients, feeSchedules, manualRevs, expenses, rate, posicion],
  );

  const data = close?.data ?? null;

  return (
    <div>
      <div style={head}>
        <div>
          <h2 style={h2}>Cierre y proyección</h2>
          <div style={sub}>
            El cierre del mes se draftea solo (números del sistema + redacción
            IA) y ustedes lo marcan FINAL cuando lo revisaron. Abajo, el
            cashflow proyectado a 90 días por moneda.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {closes.length > 0 && (
            <select
              value={selected ?? ""}
              onChange={(e) => setSelected(e.target.value)}
              style={selectStyle}
            >
              {closes.map((c) => (
                <option key={c.month} value={c.month}>
                  {c.month} {c.status === "final" ? "· FINAL" : "· draft"}
                </option>
              ))}
            </select>
          )}
          <button
            style={primaryBtn}
            disabled={busy}
            onClick={() => generate(selected ?? prevMonth)}
          >
            {busy
              ? "Generando…"
              : close
                ? `Regenerar ${selected}`
                : `Generar cierre de ${prevMonth}`}
          </button>
        </div>
      </div>

      {err && <div style={errorBox}>{err}</div>}

      {!close && closes.length === 0 && (
        <div style={{ ...panel, marginBottom: 16 }}>
          Todavía no hay cierres. Generá el de {prevMonth} con el botón (o
          esperá al día 2 del mes que viene — el cron lo draftea solo). Si la
          tabla no existe, falta correr la migración 088.
        </div>
      )}

      {close && data && (
        <>
          {/* ===== Estado + acciones ===== */}
          <div style={{ ...panel, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div>
              <strong style={{ color: close.status === "final" ? "var(--deep-green)" : "#B45309" }}>
                {close.status === "final" ? "✓ CIERRE FINAL" : "⏳ DRAFT — falta revisión de los socios"}
              </strong>
              <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 10 }}>
                generado {close.generated_at.slice(0, 10)}
                {close.model ? ` · narrativa ${close.model}` : " · sin narrativa IA"}
              </span>
            </div>
            {close.status === "draft" ? (
              <button style={primaryBtn} disabled={busy} onClick={() => setStatus(close, "final")}>
                Marcar como FINAL
              </button>
            ) : (
              <button style={ghostBtn} disabled={busy} onClick={() => setStatus(close, "draft")}>
                Volver a draft
              </button>
            )}
          </div>

          {/* ===== Números por moneda ===== */}
          <div style={statsRow}>
            {(["USD", "UYU"] as FinanceCurrency[]).map((cur) => {
              const m = data.monedas[cur];
              const prev = data.mesAnterior?.[cur] ?? null;
              return (
                <div key={cur} style={panel}>
                  <div style={panelTitle}>{data.month} · {cur}</div>
                  <div style={tableRow}><span>Cobrado</span><strong>{fmt(m.cobrado)}</strong></div>
                  <div style={tableRow}><span>Por cobrar</span><strong style={{ color: m.porCobrar > 0 ? "#B45309" : undefined }}>{fmt(m.porCobrar)}</strong></div>
                  <div style={tableRow}><span>Egresos</span><strong>−{fmt(m.egresos)}</strong></div>
                  <div style={{ ...tableRow, borderBottom: "none" }}>
                    <span style={{ fontWeight: 700 }}>Neto</span>
                    <strong style={{ color: m.neto < 0 ? "#B91C1C" : "var(--deep-green)" }}>
                      {m.neto < 0 ? "−" : ""}{fmt(Math.abs(m.neto))}
                    </strong>
                  </div>
                  {prev && (
                    <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 8 }}>
                      Mes anterior: neto {fmt(prev.neto)} · cobrado {fmt(prev.cobrado)} · egresos {fmt(prev.egresos)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ===== Narrativa ===== */}
          {close.narrative_md && (
            <div style={{ ...panel, marginBottom: 16 }}>
              <div style={panelTitle}>Lectura del mes (borrador IA — verificar contra los números)</div>
              <div style={{ color: "var(--deep-green)", fontSize: 13.5, lineHeight: 1.6 }}>
                <MarkdownRenderer content={close.narrative_md} />
              </div>
            </div>
          )}

          {/* ===== Rentabilidad por cliente ===== */}
          {data.clientes.length > 0 && (
            <div style={{ ...panel, marginBottom: 16 }}>
              <div style={panelTitle}>Por cliente</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
                  <thead>
                    <tr>
                      {["Cliente", "Factura", "Cobrado", "Egresos USD", "Egresos UYU"].map((h) => (
                        <th key={h} style={cellHead}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.clientes.map((c) => (
                      <tr key={c.id}>
                        <td style={cell}>{c.name}</td>
                        <td style={{ ...cell, color: c.facturaStatus === "paid" ? "var(--deep-green)" : c.facturaStatus === "late" ? "#B91C1C" : "#B45309" }}>
                          {STATUS_LABEL[c.facturaStatus] ?? c.facturaStatus}
                        </td>
                        <td style={cell}>{c.currency} {fmt(c.cobrado)}</td>
                        <td style={cell}>{c.egresosUSD > 0 ? `−${fmt(c.egresosUSD)}` : "—"}</td>
                        <td style={cell}>{c.egresosUYU > 0 ? `−${fmt(c.egresosUYU)}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===== Impagas ===== */}
          {data.impagas.length > 0 && (
            <div style={{ ...warnPanel, marginBottom: 16 }}>
              <div style={panelTitle}>Impagas al cierre ({data.impagas.length})</div>
              {data.impagas.map((i) => (
                <div key={`${i.clientId}-${i.month}`} style={tableRow}>
                  <span>{i.name} · {i.month}</span>
                  <strong>{i.currency} {fmt(i.amount)} ({i.status === "late" ? "vencida" : "pendiente"})</strong>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ===== Proyección 90 días ===== */}
      <div style={panel}>
        <div style={panelTitle}>
          Cashflow proyectado — próximos 3 meses
          {rate ? ` (TC ${rate.usd_uyu_mid.toLocaleString("es-UY")})` : " (sin TC cargado)"}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
            <thead>
              <tr>
                {["Mes", "Ingresos USD", "Egresos USD", "Neto USD", "Ingresos UYU", "Egresos UYU", "Neto UYU", "Posición USD", "Posición UYU"].map((h) => (
                  <th key={h} style={cellHead}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {proyeccion.meses.map((m, i) => {
                const pos = proyeccion.posiciones[i];
                return (
                  <tr key={m.month}>
                    <td style={cell}><strong>{m.month}</strong></td>
                    <td style={cell}>{fmt(m.flujo.USD.ingresos)}</td>
                    <td style={cell}>−{fmt(m.flujo.USD.egresos)}</td>
                    <td style={{ ...cell, color: m.flujo.USD.neto < 0 ? "#B91C1C" : "var(--deep-green)", fontWeight: 600 }}>{fmt(m.flujo.USD.neto)}</td>
                    <td style={cell}>{fmt(m.flujo.UYU.ingresos)}</td>
                    <td style={cell}>−{fmt(m.flujo.UYU.egresos)}</td>
                    <td style={{ ...cell, color: m.flujo.UYU.neto < 0 ? "#B91C1C" : "var(--deep-green)", fontWeight: 600 }}>{fmt(m.flujo.UYU.neto)}</td>
                    <td style={{ ...cell, color: pos.USD < 0 ? "#B91C1C" : undefined }}>{fmt(pos.USD)}</td>
                    <td style={{ ...cell, color: pos.UYU < 0 ? "#B91C1C" : undefined }}>{fmt(pos.UYU)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 10, lineHeight: 1.5 }}>
          Determinista: fees programados (tramos incluidos) + ingresos fijos
          vigentes − egresos del mes y recurrentes vigentes. No adivina
          one-time futuros — si no están cargados, no existen. La posición
          parte del saldo actual de cuentas activas. Si una posición
          proyectada queda en rojo, hay que convertir o mover plata —
          decisión de ustedes, siempre.
        </div>
      </div>
    </div>
  );
}

// ==================== estilos (idioma de CostosApiView) ====================

const head: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  marginBottom: 20,
  flexWrap: "wrap",
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
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 16,
  marginBottom: 16,
};
const panel: React.CSSProperties = {
  background: "var(--white)",
  border: "1px solid var(--hairline)",
  borderRadius: 12,
  padding: 20,
  fontSize: 13,
  color: "var(--text-muted)",
};
const warnPanel: React.CSSProperties = {
  background: "rgba(176,75,58,0.06)",
  border: "1px solid rgba(176,75,58,0.25)",
  borderRadius: 12,
  padding: 20,
  fontSize: 13,
  color: "var(--deep-green)",
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
const cellHead: React.CSSProperties = {
  border: "1px solid var(--hairline)",
  padding: "6px 10px",
  background: "rgba(196,168,130,0.12)",
  color: "var(--deep-green)",
  textAlign: "left",
  whiteSpace: "nowrap",
};
const cell: React.CSSProperties = {
  border: "1px solid var(--hairline)",
  padding: "6px 10px",
  whiteSpace: "nowrap",
  color: "var(--deep-green)",
};
const primaryBtn: React.CSSProperties = {
  padding: "9px 16px",
  borderRadius: 8,
  border: "none",
  background: "var(--deep-green)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
const ghostBtn: React.CSSProperties = {
  padding: "9px 16px",
  borderRadius: 8,
  border: "1px solid rgba(10,26,12,0.2)",
  background: "transparent",
  color: "var(--deep-green)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
const errorBox: React.CSSProperties = {
  padding: "10px 12px",
  background: "rgba(176,75,58,0.08)",
  border: "1px solid rgba(176,75,58,0.25)",
  borderRadius: 6,
  fontSize: 12.5,
  color: "#B91C1C",
  marginBottom: 16,
};
