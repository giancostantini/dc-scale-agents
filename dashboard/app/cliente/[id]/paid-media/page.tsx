"use client";

import { use, useEffect, useState } from "react";
import { getClient } from "@/lib/storage";
import type { Client } from "@/lib/types";
import ui from "@/components/ClientUI.module.css";

const DEFAULT_BUDGET = 5000;
const DEFAULT_SPENT = { meta: 0, google: 0, tiktok: 0, email: 0 };

export default function PaidMediaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [client, setClient] = useState<Client | null>(null);
  const [budget] = useState(DEFAULT_BUDGET);
  const [spent] = useState(DEFAULT_SPENT);

  useEffect(() => {
    getClient(id).then((c) => setClient(c ?? null));
  }, [id]);

  if (!client) return null;

  const totalSpent = spent.meta + spent.google + spent.tiktok + spent.email;
  const pct = (v: number) => (budget > 0 ? Math.round((v / budget) * 100) : 0);
  const hasSpent = totalSpent > 0;

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Paid Media · Distribución de presupuesto</div>
          <h1>Inversión de marketing</h1>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className={ui.eyebrow} style={{ marginBottom: 6 }}>Presupuesto mensual</div>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em" }}>
            US$ {budget.toLocaleString()}
          </div>
        </div>
      </div>

      {!hasSpent && (
        <div className={ui.empty} style={{ marginBottom: 24 }}>
          <div className={ui.emptyIcon}>◉</div>
          <div className={ui.emptyTitle}>Todavía no hay inversión cargada</div>
          <div className={ui.emptyDesc}>
            Conectá Meta Ads, Google Ads, TikTok y tu plataforma de email desde la sección <strong>Integraciones</strong> para ver métricas en vivo.
            Por ahora se muestra la estructura del panel.
          </div>
        </div>
      )}

      <div className={ui.panel} style={{ marginBottom: 24 }}>
        <div className={ui.panelHead}>
          <div className={ui.panelTitle}>Distribución del presupuesto · Mes actual</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            US$ {totalSpent.toLocaleString()} / US$ {budget.toLocaleString()} · {Math.round((totalSpent / budget) * 100)}% utilizado
          </div>
        </div>
        <div style={{ display: "flex", height: 56, marginBottom: 12, overflow: "hidden" }}>
          {hasSpent ? (
            <>
              <div style={{ width: `${pct(spent.meta)}%`, background: "var(--forest)", color: "var(--off-white)", display: "flex", alignItems: "center", padding: "0 16px", fontSize: 12 }}>
                Meta · {pct(spent.meta)}%
              </div>
              <div style={{ width: `${pct(spent.google)}%`, background: "var(--sand)", color: "var(--deep-green)", display: "flex", alignItems: "center", padding: "0 16px", fontSize: 12 }}>
                Google · {pct(spent.google)}%
              </div>
              <div style={{ width: `${pct(spent.tiktok)}%`, background: "var(--sand-dark)", color: "var(--white)", display: "flex", alignItems: "center", padding: "0 16px", fontSize: 12 }}>
                TikTok · {pct(spent.tiktok)}%
              </div>
              <div style={{ width: `${pct(spent.email)}%`, background: "var(--forest-2)", color: "var(--off-white)", display: "flex", alignItems: "center", padding: "0 12px", fontSize: 11 }}>
                Email · {pct(spent.email)}%
              </div>
              <div style={{ flex: 1, background: "var(--off-white)", display: "flex", alignItems: "center", padding: "0 12px", fontSize: 11, color: "var(--text-muted)" }}>
                Disponible · US$ {(budget - totalSpent).toLocaleString()}
              </div>
            </>
          ) : (
            <div style={{ flex: 1, background: "var(--off-white)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--text-muted)" }}>
              Sin inversión cargada · US$ {budget.toLocaleString()} disponible
            </div>
          )}
        </div>
      </div>

      {/* Platform blocks */}
      {[
        { key: "meta", name: "◐ Meta Ads · Facebook + Instagram", color: "var(--forest)" },
        { key: "google", name: "◉ Google Ads · Search + Display", color: "var(--sand)" },
        { key: "tiktok", name: "◇ TikTok Ads", color: "var(--sand-dark)" },
        { key: "email", name: "✉ Email Marketing", color: "var(--forest-2)" },
      ].map((p) => (
        <div key={p.key} className={ui.panel} style={{ marginBottom: 20, borderLeft: `3px solid ${p.color}` }}>
          <div className={ui.panelHead}>
            <div className={ui.panelTitle}>{p.name}</div>
            <span className={`${ui.pill} ${ui.pillGrey}`}>No conectado</span>
          </div>
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            Conectá {p.name.split(" · ")[0].replace(/^[◐◉◇✉]\s*/, "")} desde <strong>Integraciones</strong> para ver ROAS, inversión, CTR y conversiones en vivo.
          </div>
        </div>
      ))}
    </>
  );
}
