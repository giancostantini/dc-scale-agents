"use client";

/**
 * TesoreriaView — FIN-0 · Tesorería multimoneda
 *
 * El dolor que resuelve: 3 clientes pagan en USD, 1 en UYU, y los egresos
 * salen en ambas monedas. Esta vista responde de un vistazo:
 *   · TC USD/UYU del día (lo carga el cron fx-rates — ya no el 1/39
 *     hardcodeado de Cuentas Bancarias).
 *   · Posición: cuánta plata hay HOY en cada moneda (cuentas activas).
 *   · Flujo proyectado del mes por moneda (fees por moneda de facturación
 *     + ingresos manuales vs egresos únicos y recurrentes).
 *   · Descalce: si una moneda no se autofinancia, cuánto habría que
 *     convertir al TC del día. La conversión la ejecutan los socios
 *     (gate RED) — acá solo se avisa.
 *
 * Los datos de clients/expenses/revenues/schedules vienen por props (ya
 * los carga la página de Finanzas); cuentas y TC se cargan acá.
 */

import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { listCuentas, type CuentaBancaria } from "@/lib/cuentas-bancarias";
import {
  currentMonthUY,
  posicionPorMoneda,
  proyeccionDelMes,
  descalceResumen,
  type ExchangeRateRow,
} from "@/lib/tesoreria";
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

const fmtMoney = (n: number, currency: string) =>
  `${currency} ${Math.round(n).toLocaleString("es-UY")}`;

const fmtRate = (n: number) =>
  n.toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function TesoreriaView({
  clients,
  expenses,
  manualRevs,
  feeSchedules,
}: Props) {
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([]);
  const [rates, setRates] = useState<ExchangeRateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    Promise.all([
      listCuentas(),
      supabase
        .from("exchange_rates")
        .select("rate_date, usd_uyu_buy, usd_uyu_sell, usd_uyu_mid, source")
        .order("rate_date", { ascending: false })
        .limit(2),
    ])
      .then(([cts, { data: rateRows, error }]) => {
        // 42P01 = la tabla no existe todavía (migración 084 sin correr).
        if (error && !error.message.includes("does not exist")) {
          throw new Error(error.message);
        }
        setCuentas(cts);
        setRates((rateRows ?? []) as ExchangeRateRow[]);
      })
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  const month = currentMonthUY();
  const rate = rates[0] ?? null;
  const prevRate = rates[1] ?? null;

  const posicion = useMemo(() => posicionPorMoneda(cuentas), [cuentas]);

  const proyeccion = useMemo(
    () =>
      proyeccionDelMes({
        month,
        clients,
        feeSchedules,
        revenues: manualRevs,
        expenses,
        rate: rate?.usd_uyu_mid ?? null,
      }),
    [month, clients, feeSchedules, manualRevs, expenses, rate],
  );

  // Monedas fuera del eje USD/UYU con saldo (EUR/ARS/BRL) — solo informativas.
  const otrasMonedas = Object.entries(posicion).filter(
    ([cur, saldo]) => cur !== "USD" && cur !== "UYU" && saldo !== 0,
  );

  const rateDelta =
    rate && prevRate ? rate.usd_uyu_mid - prevRate.usd_uyu_mid : null;

  if (loading) return <div style={panel}>Cargando tesorería…</div>;

  return (
    <div>
      <div style={head}>
        <div>
          <h2 style={h2}>Tesorería</h2>
          <div style={sub}>
            Posición por moneda, flujo proyectado de {month} y descalce
            USD/UYU. El TC se actualiza solo, todos los días (cron
            fx-rates). Convertir o mover plata queda siempre en manos de
            los socios — acá solo se detecta y avisa.
          </div>
        </div>
      </div>

      {err && <div style={errorBox}>Error cargando datos: {err}</div>}

      <div style={statsRow}>
        <div style={statCard}>
          <div style={statLabel}>TC USD/UYU hoy</div>
          {rate ? (
            <>
              <div style={{ ...statValue, fontSize: 24 }}>
                {fmtRate(rate.usd_uyu_mid)}
                {rateDelta != null && Math.abs(rateDelta) >= 0.005 && (
                  <span
                    style={{
                      fontSize: 12,
                      marginLeft: 8,
                      color: rateDelta > 0 ? "#B91C1C" : "var(--sand-dark)",
                    }}
                  >
                    {rateDelta > 0 ? "▲" : "▼"} {fmtRate(Math.abs(rateDelta))}
                  </span>
                )}
              </div>
              <div style={statFootnote}>
                {rate.usd_uyu_buy != null && rate.usd_uyu_sell != null
                  ? `compra ${fmtRate(rate.usd_uyu_buy)} · venta ${fmtRate(rate.usd_uyu_sell)} · `
                  : ""}
                {rate.rate_date} · {rate.source}
              </div>
            </>
          ) : (
            <>
              <div style={{ ...statValue, fontSize: 16 }}>Sin TC cargado</div>
              <div style={statFootnote}>
                Corré la migración 084 y el workflow &quot;FX Rates
                (Tesorería)&quot; una vez — después se actualiza solo cada
                mañana.
              </div>
            </>
          )}
        </div>

        <div style={statCard}>
          <div style={statLabel}>Posición USD</div>
          <div style={{ ...statValue, fontSize: 24 }}>
            {fmtMoney(posicion.USD ?? 0, "USD")}
          </div>
          <div style={statFootnote}>saldo actual en cuentas activas</div>
        </div>

        <div style={statCard}>
          <div style={statLabel}>Posición UYU</div>
          <div style={{ ...statValue, fontSize: 24 }}>
            {fmtMoney(posicion.UYU ?? 0, "UYU")}
          </div>
          <div style={statFootnote}>
            {rate
              ? `≈ ${fmtMoney((posicion.UYU ?? 0) / rate.usd_uyu_mid, "USD")} al TC de hoy`
              : "saldo actual en cuentas activas"}
          </div>
        </div>
      </div>

      {proyeccion.descalces.length > 0 ? (
        <div style={warnBox}>
          <div style={warnTitle}>⚠ Descalce de moneda en {month}</div>
          {proyeccion.descalces.map((d) => (
            <div key={d.currency} style={{ marginTop: 6, lineHeight: 1.5 }}>
              {descalceResumen(d, month)}
            </div>
          ))}
          <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-muted)" }}>
            La conversión la deciden y ejecutan los socios. El aviso también
            llega a la campana del dashboard (1×/día).
          </div>
        </div>
      ) : (
        <div style={okBox}>
          ✓ Este mes cada moneda se autofinancia: los ingresos proyectados en
          USD cubren los egresos en USD, y los de UYU cubren los de UYU.
        </div>
      )}

      <div style={grid}>
        {(["USD", "UYU"] as FinanceCurrency[]).map((cur) => {
          const f = proyeccion.flujo[cur];
          return (
            <div key={cur} style={panel}>
              <div style={panelTitle}>Flujo proyectado {month} · {cur}</div>
              <div style={tableRow}>
                <span>Ingresos (fees + manuales)</span>
                <strong>{fmtMoney(f.ingresos, cur)}</strong>
              </div>
              <div style={tableRow}>
                <span>Egresos (únicos + recurrentes)</span>
                <strong>−{fmtMoney(f.egresos, cur)}</strong>
              </div>
              <div style={{ ...tableRow, borderBottom: "none" }}>
                <span style={{ fontWeight: 700 }}>Neto</span>
                <strong
                  style={{ color: f.neto < 0 ? "#B91C1C" : "var(--deep-green)" }}
                >
                  {f.neto < 0 ? "−" : ""}
                  {fmtMoney(Math.abs(f.neto), cur)}
                </strong>
              </div>
            </div>
          );
        })}
      </div>

      {otrasMonedas.length > 0 && (
        <div style={{ ...panel, marginTop: 16 }}>
          <div style={panelTitle}>Otras monedas en cuentas</div>
          {otrasMonedas.map(([cur, saldo]) => (
            <div key={cur} style={tableRow}>
              <span>{cur}</span>
              <strong>{fmtMoney(saldo, cur)}</strong>
            </div>
          ))}
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)" }}>
            Fuera del eje USD/UYU — no entran en el cálculo de descalce.
          </div>
        </div>
      )}
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
const statsRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
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
const statFootnote: React.CSSProperties = {
  fontSize: 11.5,
  color: "var(--text-muted)",
  marginTop: 6,
  lineHeight: 1.4,
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
const warnBox: React.CSSProperties = {
  padding: "14px 16px",
  background: "rgba(176,75,58,0.08)",
  border: "1px solid rgba(176,75,58,0.25)",
  borderRadius: 12,
  fontSize: 13,
  color: "var(--deep-green)",
  marginBottom: 20,
};
const warnTitle: React.CSSProperties = {
  fontWeight: 700,
  color: "#B91C1C",
};
const okBox: React.CSSProperties = {
  padding: "14px 16px",
  background: "rgba(90,125,90,0.08)",
  border: "1px solid rgba(90,125,90,0.25)",
  borderRadius: 12,
  fontSize: 13,
  color: "var(--deep-green)",
  marginBottom: 20,
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
