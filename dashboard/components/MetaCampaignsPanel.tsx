"use client";

/**
 * MetaCampaignsPanel — vista interna (equipo) de las campañas de Meta del
 * cliente: qué está corriendo y cómo rinde en los últimos 7 días, CON
 * inversión y costo por resultado (el portal del cliente muestra lo mismo
 * pero sin costos, vía /api/portal/campaigns).
 *
 * Lee meta_campaigns_daily (mig 106) directo: la RLS deja leer a
 * director/team. Sin la migración o sin token de Meta, muestra el estado.
 */

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import ui from "@/components/ClientUI.module.css";

interface Row {
  date: string;
  campaign_id: string;
  campaign_name: string;
  effective_status: string | null;
  spend: number | string;
  impressions: number | string;
  clicks: number | string;
  results: number | string | null;
  result_type: string | null;
  conversion_value: number | string | null;
}

interface Agg {
  id: string;
  name: string;
  status: string | null;
  resultType: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  results: number;
  value: number;
}

const n = (v: unknown) => {
  const x = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : 0;
  return Number.isFinite(x) ? x : 0;
};

export default function MetaCampaignsPanel({ clientId }: { clientId: string }) {
  const [list, setList] = useState<Agg[] | null>(null);
  const [updatedTo, setUpdatedTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const from = new Date();
    from.setDate(from.getDate() - 10);
    getSupabase()
      .from("meta_campaigns_daily")
      .select(
        "date, campaign_id, campaign_name, effective_status, spend, impressions, clicks, results, result_type, conversion_value",
      )
      .eq("client_id", clientId)
      .gte("date", from.toISOString().slice(0, 10))
      .order("date", { ascending: false })
      .then(({ data, error: err }) => {
        if (!active) return;
        if (err) {
          setError("Falta correr la migración 106 (meta_campaigns_daily).");
          setList([]);
          return;
        }
        const rows = (data ?? []) as Row[];
        const last = rows[0]?.date ?? null;
        setUpdatedTo(last);
        if (!last) {
          setList([]);
          return;
        }
        const d = new Date(`${last}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() - 6);
        const since = d.toISOString().slice(0, 10);
        const map = new Map<string, Agg>();
        for (const r of rows) {
          let a = map.get(r.campaign_id);
          if (!a) {
            a = {
              id: r.campaign_id,
              name: r.campaign_name,
              status: r.effective_status,
              resultType: null,
              spend: 0,
              impressions: 0,
              clicks: 0,
              results: 0,
              value: 0,
            };
            map.set(r.campaign_id, a);
          }
          if (!a.resultType && r.result_type) a.resultType = r.result_type;
          if (r.date < since) continue;
          a.spend += n(r.spend);
          a.impressions += n(r.impressions);
          a.clicks += n(r.clicks);
          a.results += n(r.results);
          a.value += n(r.conversion_value);
        }
        setList(
          [...map.values()]
            .filter((a) => a.status === "ACTIVE" || a.impressions > 0)
            .sort(
              (x, y) =>
                Number(y.status === "ACTIVE") - Number(x.status === "ACTIVE") || y.spend - x.spend,
            ),
        );
      });
    return () => {
      active = false;
    };
  }, [clientId]);

  if (list === null) return null;

  return (
    <div className={ui.panel} style={{ marginBottom: 24 }}>
      <div className={ui.panelHead}>
        <div className={ui.panelTitle}>Meta · campañas en vivo (últimos 7 días)</div>
        {updatedTo && (
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Datos hasta {updatedTo}</span>
        )}
      </div>
      {error ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{error}</p>
      ) : list.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          Sin datos de campañas. Hace falta el token de Meta (META_SYSTEM_USER_TOKEN en Vercel) y
          el ID de la cuenta publicitaria del cliente en Configuración. El cliente las ve en su
          portal → Campañas, sin inversión ni costos.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-muted)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                <th style={th}>Campaña</th>
                <th style={th}>Estado</th>
                <th style={thR}>Inversión</th>
                <th style={thR}>Resultados</th>
                <th style={thR}>Costo x res.</th>
                <th style={thR}>CTR</th>
                <th style={thR}>ROAS</th>
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id} style={{ borderTop: "1px solid rgba(10,26,12,0.06)" }}>
                  <td style={td}>{a.name}</td>
                  <td style={td}>{a.status === "ACTIVE" ? "Activa" : (a.status ?? "—").toLowerCase()}</td>
                  <td style={tdR}>{a.spend.toFixed(2)}</td>
                  <td style={tdR}>
                    {Math.round(a.results)} {a.resultType ?? ""}
                  </td>
                  <td style={tdR}>{a.results > 0 ? (a.spend / a.results).toFixed(2) : "—"}</td>
                  <td style={tdR}>
                    {a.impressions > 0 ? `${((a.clicks / a.impressions) * 100).toFixed(2)}%` : "—"}
                  </td>
                  <td style={tdR}>{a.spend > 0 && a.value > 0 ? `${(a.value / a.spend).toFixed(1)}x` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: "8px 10px", fontWeight: 700 };
const thR: React.CSSProperties = { ...th, textAlign: "right" };
const td: React.CSSProperties = { padding: "10px", color: "var(--deep-green)" };
const tdR: React.CSSProperties = { ...td, textAlign: "right", whiteSpace: "nowrap" };
