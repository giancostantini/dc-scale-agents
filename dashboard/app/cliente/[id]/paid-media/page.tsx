"use client";

import { use, useEffect, useState } from "react";
import { getClient } from "@/lib/storage";
import { getSupabase } from "@/lib/supabase/client";
import type { Client, PaidMediaPlatform, PlatformMetrics } from "@/lib/types";
import ui from "@/components/ClientUI.module.css";

interface PlatformDef {
  key: PaidMediaPlatform;
  name: string;
  short: string;
  color: string;
}

const PLATFORMS: PlatformDef[] = [
  {
    key: "meta",
    name: "Meta Ads · Facebook + Instagram",
    short: "Meta",
    color: "var(--forest)",
  },
  {
    key: "google",
    name: "Google Ads · Search + Display",
    short: "Google",
    color: "var(--sand)",
  },
  {
    key: "tiktok",
    name: "TikTok Ads",
    short: "TikTok",
    color: "var(--sand-dark)",
  },
  {
    key: "email",
    name: "Email Marketing",
    short: "Email",
    color: "var(--forest-2)",
  },
];

export default function PaidMediaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [client, setClient] = useState<Client | null>(null);
  const [editing, setEditing] = useState<PaidMediaPlatform | null>(null);

  useEffect(() => {
    getClient(id).then((c) => setClient(c ?? null));
  }, [id]);

  if (!client) return null;

  const paidMedia = client.kpis?.paid_media ?? {};
  const budget = client.fee || 0;
  const spent = (p: PaidMediaPlatform) => paidMedia[p]?.spent ?? 0;
  const totalSpent =
    spent("meta") + spent("google") + spent("tiktok") + spent("email");
  const pct = (v: number) => (budget > 0 ? Math.round((v / budget) * 100) : 0);
  const updatedAt = paidMedia.updated_at;

  async function refresh() {
    const c = await getClient(id);
    setClient(c ?? null);
  }

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>
            Paid Media · Distribución de presupuesto
          </div>
          <h1>Inversión de marketing</h1>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className={ui.eyebrow} style={{ marginBottom: 6 }}>
            Fee mensual del cliente
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            US$ {budget.toLocaleString()}
          </div>
        </div>
      </div>

      {totalSpent === 0 && (
        <div className={ui.empty} style={{ marginBottom: 24 }}>
          <div className={ui.emptyIcon}>◉</div>
          <div className={ui.emptyTitle}>Aún no cargaste métricas</div>
          <div className={ui.emptyDesc}>
            Cargá manualmente las métricas del mes por plataforma usando los
            paneles de abajo. Cuando integremos OAuth con Meta y Google, esto
            se va a sincronizar automáticamente.
          </div>
        </div>
      )}

      <div className={ui.panel} style={{ marginBottom: 24 }}>
        <div className={ui.panelHead}>
          <div className={ui.panelTitle}>
            Distribución de inversión · Mes actual
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {updatedAt
              ? `Última actualización: ${new Date(updatedAt).toLocaleDateString(
                  "es-UY",
                  { day: "2-digit", month: "short", year: "numeric" },
                )}`
              : "Sin datos cargados"}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            height: 56,
            marginBottom: 12,
            overflow: "hidden",
          }}
        >
          {totalSpent > 0 ? (
            <>
              {PLATFORMS.map((p) => {
                const s = spent(p.key);
                if (s <= 0) return null;
                return (
                  <div
                    key={p.key}
                    style={{
                      width: `${pct(s)}%`,
                      background: p.color,
                      color: "var(--off-white)",
                      display: "flex",
                      alignItems: "center",
                      padding: "0 16px",
                      fontSize: 12,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.short} · {pct(s)}%
                  </div>
                );
              })}
              <div
                style={{
                  flex: 1,
                  background: "var(--off-white)",
                  display: "flex",
                  alignItems: "center",
                  padding: "0 12px",
                  fontSize: 11,
                  color: "var(--text-muted)",
                }}
              >
                {totalSpent < budget
                  ? `Disponible · US$ ${(budget - totalSpent).toLocaleString()}`
                  : `Por encima del fee · US$ ${(totalSpent - budget).toLocaleString()}`}
              </div>
            </>
          ) : (
            <div
              style={{
                flex: 1,
                background: "var(--off-white)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              Sin inversión cargada · US$ {budget.toLocaleString()} disponible
            </div>
          )}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          US$ {totalSpent.toLocaleString()} invertido /
          US$ {budget.toLocaleString()} fee
        </div>
      </div>

      {/* Platform blocks */}
      {PLATFORMS.map((p) => (
        <PlatformPanel
          key={p.key}
          platform={p}
          metrics={paidMedia[p.key]}
          editing={editing === p.key}
          onEditToggle={() => setEditing(editing === p.key ? null : p.key)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
          clientId={id}
        />
      ))}
    </>
  );
}

// ==================== PLATFORM PANEL ====================

function PlatformPanel({
  platform,
  metrics,
  editing,
  onEditToggle,
  onSaved,
  clientId,
}: {
  platform: PlatformDef;
  metrics?: PlatformMetrics;
  editing: boolean;
  onEditToggle: () => void;
  onSaved: () => void;
  clientId: string;
}) {
  const hasData = Boolean(metrics && Object.keys(metrics).length > 0);

  return (
    <div
      className={ui.panel}
      style={{
        marginBottom: 20,
        borderLeft: `3px solid ${platform.color}`,
      }}
    >
      <div className={ui.panelHead}>
        <div className={ui.panelTitle}>{platform.name}</div>
        <button
          className={ui.panelAction}
          onClick={onEditToggle}
          type="button"
        >
          {editing ? "Cancelar" : hasData ? "Editar métricas →" : "+ Cargar métricas"}
        </button>
      </div>

      {editing ? (
        <PlatformEditor
          platform={platform.key}
          clientId={clientId}
          initial={metrics ?? {}}
          onSaved={onSaved}
          onCancel={() => onEditToggle()}
        />
      ) : hasData ? (
        <PlatformMetricsView metrics={metrics!} />
      ) : (
        <div
          style={{
            padding: 24,
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: 13,
          }}
        >
          Sin datos cargados · Cargá las métricas manualmente desde el botón de
          arriba.
        </div>
      )}
    </div>
  );
}

// ==================== METRICS VIEW ====================

function PlatformMetricsView({ metrics }: { metrics: PlatformMetrics }) {
  const cells: Array<{ label: string; value: string }> = [
    {
      label: "Inversión",
      value: metrics.spent != null ? `US$ ${metrics.spent.toLocaleString()}` : "—",
    },
    {
      label: "ROAS",
      value: metrics.roas != null ? `${metrics.roas}x` : "—",
    },
    {
      label: "Conversiones",
      value: metrics.conversions != null ? String(metrics.conversions) : "—",
    },
    {
      label: "CPA",
      value: metrics.cpa != null ? `US$ ${metrics.cpa.toLocaleString()}` : "—",
    },
    {
      label: "CTR",
      value: metrics.ctr != null ? `${(metrics.ctr * 100).toFixed(2)}%` : "—",
    },
    {
      label: "CPC",
      value: metrics.cpc != null ? `US$ ${metrics.cpc.toLocaleString()}` : "—",
    },
  ];

  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: 16,
          padding: "14px 0",
        }}
      >
        {cells.map((c) => (
          <div key={c.label}>
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.18em",
                color: "var(--sand-dark)",
                textTransform: "uppercase",
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              {c.label}
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "var(--deep-green)",
              }}
            >
              {c.value}
            </div>
          </div>
        ))}
      </div>
      {metrics.notes && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            background: "var(--off-white)",
            borderLeft: "2px solid var(--sand)",
            fontSize: 13,
            color: "var(--text-muted)",
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: "var(--deep-green)" }}>Notas:</strong>{" "}
          {metrics.notes}
        </div>
      )}
    </>
  );
}

// ==================== METRICS EDITOR ====================

interface FieldDef {
  key: keyof PlatformMetrics;
  label: string;
  hint?: string;
  step?: string;
}

const NUMBER_FIELDS: FieldDef[] = [
  { key: "spent", label: "Inversión (USD)", step: "0.01" },
  { key: "roas", label: "ROAS", hint: "ej: 3.5", step: "0.01" },
  { key: "conversions", label: "Conversiones", step: "1" },
  { key: "cpa", label: "CPA (USD)", step: "0.01" },
  { key: "ctr", label: "CTR (0-1)", hint: "0.025 = 2.5%", step: "0.001" },
  { key: "cpc", label: "CPC (USD)", step: "0.01" },
  { key: "cpm", label: "CPM (USD)", step: "0.01" },
  { key: "impressions", label: "Impresiones", step: "1" },
  { key: "clicks", label: "Clicks", step: "1" },
];

function PlatformEditor({
  platform,
  clientId,
  initial,
  onSaved,
  onCancel,
}: {
  platform: PaidMediaPlatform;
  clientId: string;
  initial: PlatformMetrics;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const f of NUMBER_FIELDS) {
      const x = initial[f.key];
      v[f.key as string] = x != null ? String(x) : "";
    }
    v.notes = initial.notes ?? "";
    return v;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    try {
      const supabase = getSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Sin sesión");

      const payload = {
        platform,
        metrics: values,
      };
      const res = await fetch(`/api/clients/${clientId}/kpis`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      onSaved();
    } catch (err) {
      const e = err as { message?: string };
      setError(e.message ?? "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: "12px 0" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: 14,
          marginBottom: 16,
        }}
      >
        {NUMBER_FIELDS.map((f) => (
          <div key={f.key as string}>
            <label
              style={{
                display: "block",
                fontSize: 10,
                letterSpacing: "0.18em",
                color: "var(--sand-dark)",
                textTransform: "uppercase",
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              {f.label}
            </label>
            <input
              type="number"
              step={f.step ?? "0.01"}
              value={values[f.key as string]}
              onChange={(e) =>
                setValues({ ...values, [f.key as string]: e.target.value })
              }
              placeholder={f.hint ?? "0"}
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid rgba(10,26,12,0.15)",
                background: "var(--white)",
                fontSize: 14,
                color: "var(--deep-green)",
              }}
            />
          </div>
        ))}
      </div>

      <div>
        <label
          style={{
            display: "block",
            fontSize: 10,
            letterSpacing: "0.18em",
            color: "var(--sand-dark)",
            textTransform: "uppercase",
            fontWeight: 600,
            marginBottom: 6,
          }}
        >
          Notas
        </label>
        <textarea
          value={values.notes}
          onChange={(e) => setValues({ ...values, notes: e.target.value })}
          placeholder="Observaciones del mes (opcional)"
          rows={3}
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "1px solid rgba(10,26,12,0.15)",
            background: "var(--white)",
            fontSize: 14,
            color: "var(--deep-green)",
            resize: "vertical",
          }}
        />
      </div>

      {error && (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            background: "rgba(176,75,58,0.1)",
            borderLeft: "3px solid var(--red-warn)",
            color: "var(--red-warn)",
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
        <button
          onClick={save}
          disabled={saving}
          style={{
            padding: "10px 20px",
            background: "var(--deep-green)",
            color: "var(--off-white)",
            border: "none",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          style={{
            padding: "10px 20px",
            background: "transparent",
            color: "var(--text-muted)",
            border: "1px solid rgba(10,26,12,0.15)",
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
