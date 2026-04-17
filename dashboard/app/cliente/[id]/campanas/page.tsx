"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getProdCampaigns, deleteProdCampaign, getClient } from "@/lib/storage";
import type { Client, ProductionCampaign } from "@/lib/types";
import NewProdCampaignModal from "@/components/NewProdCampaignModal";
import ui from "@/components/ClientUI.module.css";

export default function CampanasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [campaigns, setCampaigns] = useState<ProductionCampaign[]>([]);
  const [modal, setModal] = useState(false);

  const refresh = useCallback(() => {
    getProdCampaigns(id).then(setCampaigns);
  }, [id]);

  useEffect(() => {
    getClient(id).then((c) => setClient(c ?? null));
    refresh();
  }, [id, refresh]);

  if (!client) return null;

  const totalBudget = campaigns.reduce((s, c) => s + c.budget, 0);
  const totalSpent = campaigns.reduce((s, c) => s + c.spent, 0);
  const activeCount = campaigns.filter((c) => c.status === "active").length;

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Producción · Campañas activas</div>
          <h1>Campañas del cliente</h1>
        </div>
        <button className={ui.btnSolid} onClick={() => setModal(true)}>+ Nueva campaña</button>
      </div>

      <p style={{ maxWidth: 720, color: "var(--text-muted)", marginBottom: 28, fontSize: 14, lineHeight: 1.6 }}>
        Producciones de contenido, sesiones UGC, Pooshlo y servicios externos.
        Todos los gastos impactan el presupuesto del cliente.
      </p>

      <div className={ui.kpiGrid} style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className={ui.kpiCell}>
          <div className={ui.kLabel}>Campañas</div>
          <div className={ui.kValue}>{campaigns.length}</div>
          <div className={ui.kDelta}>{activeCount} activas</div>
        </div>
        <div className={ui.kpiCell}>
          <div className={ui.kLabel}>Presupuesto total</div>
          <div className={ui.kValue}>US$ {totalBudget.toLocaleString()}</div>
        </div>
        <div className={ui.kpiCell}>
          <div className={ui.kLabel}>Ejecutado</div>
          <div className={ui.kValue}>US$ {totalSpent.toLocaleString()}</div>
        </div>
        <div className={ui.kpiCell}>
          <div className={ui.kLabel}>Disponible</div>
          <div className={ui.kValue} style={{ color: totalBudget - totalSpent < 0 ? "var(--red-warn)" : "var(--deep-green)" }}>
            US$ {(totalBudget - totalSpent).toLocaleString()}
          </div>
        </div>
      </div>

      {campaigns.length === 0 ? (
        <div className={ui.empty}>
          <div className={ui.emptyIcon}>◎</div>
          <div className={ui.emptyTitle}>Sin campañas activas</div>
          <div className={ui.emptyDesc}>
            Creá campañas de producción (UGC, fotografía, videos, Pooshlo) con sus
            gastos asignados. Todas impactan el presupuesto del cliente.
          </div>
          <button className={ui.btnSolid} onClick={() => setModal(true)}>+ Crear primera campaña</button>
        </div>
      ) : (
        <div className={ui.panel}>
          {campaigns.map((c) => {
            const progress = c.budget > 0 ? Math.round((c.spent / c.budget) * 100) : 0;
            return (
              <div key={c.id} style={{ padding: "20px 0", borderBottom: "1px solid rgba(10,26,12,0.06)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <div style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--sand-dark)", fontWeight: 600 }}>
                        {c.type}
                      </div>
                      <span className={`${ui.pill} ${c.status === "active" ? ui.pillGreen : ui.pillGrey}`}>
                        {c.status === "active" ? "En curso" : "Finalizada"}
                      </span>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em", marginBottom: 6 }}>
                      {c.title}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5, marginBottom: 14 }}>
                      {c.description}
                    </div>
                    <div style={{ display: "flex", gap: 20, fontSize: 12 }}>
                      <div><span style={{ color: "var(--text-muted)" }}>Presupuesto:</span> <strong>US$ {c.budget.toLocaleString()}</strong></div>
                      <div><span style={{ color: "var(--text-muted)" }}>Ejecutado:</span> <strong>US$ {c.spent.toLocaleString()}</strong></div>
                      <div><span style={{ color: "var(--text-muted)" }}>Disponible:</span> <strong>US$ {(c.budget - c.spent).toLocaleString()}</strong></div>
                    </div>
                    <div className={ui.progressBar} style={{ marginTop: 12 }}>
                      <div className={ui.progressFill} style={{ width: `${Math.min(progress, 100)}%`, background: progress >= 100 ? "var(--green-ok)" : "var(--sand)" }} />
                    </div>
                    {c.items.length > 0 && (
                      <details style={{ marginTop: 14 }}>
                        <summary style={{ cursor: "pointer", fontSize: 11, letterSpacing: "0.1em", color: "var(--sand-dark)", fontWeight: 600, textTransform: "uppercase" }}>
                          Ver desglose ({c.items.length}) →
                        </summary>
                        <div style={{ marginTop: 12, padding: 14, background: "var(--off-white)" }}>
                          {c.items.map((it, i) => (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 12, borderBottom: "1px solid rgba(10,26,12,0.06)" }}>
                              <span>{it.label}</span>
                              <strong>US$ {it.amount.toLocaleString()}</strong>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>

                  <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                    {c.hasResult && (
                      <button
                        className={ui.btnGhost}
                        style={{ borderColor: "var(--sand)", background: "var(--off-white)", fontWeight: 600 }}
                        onClick={() => router.push(`/cliente/${id}/biblioteca`)}
                      >
                        ▢ Resultado →
                      </button>
                    )}
                    <button
                      className={ui.btnGhost}
                      style={{ color: "var(--red-warn)", borderColor: "rgba(176,75,58,0.3)" }}
                      onClick={async () => {
                        if (confirm("¿Eliminar esta campaña?")) {
                          await deleteProdCampaign(c.id);
                          refresh();
                        }
                      }}
                    >
                      Archivar
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <NewProdCampaignModal
        open={modal}
        clientId={id}
        onClose={() => setModal(false)}
        onCreated={refresh}
      />
    </>
  );
}
