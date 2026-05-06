"use client";

import { use, useEffect, useState } from "react";
import { getIntegrations, saveIntegrations, toggleIntegration } from "@/lib/storage";
import { DEFAULT_INTEGRATIONS } from "@/lib/integrations-defaults";
import type { Integration } from "@/lib/types";
import ui from "@/components/ClientUI.module.css";

export default function IntegracionesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [integrations, setIntegrations] = useState<Integration[]>([]);

  useEffect(() => {
    getIntegrations(id).then((existing) => {
      if (existing.length === 0) {
        const seeded = DEFAULT_INTEGRATIONS.map((i) => ({ ...i, clientId: id }));
        saveIntegrations(id, seeded).then(() => setIntegrations(seeded));
      } else {
        setIntegrations(existing);
      }
    });
  }, [id]);

  async function toggle(key: string) {
    await toggleIntegration(id, key);
    getIntegrations(id).then(setIntegrations);
  }

  const groups = Array.from(new Set(integrations.map((i) => i.group)));
  const connected = integrations.filter((i) => i.status === "connected").length;

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Configuración · Herramientas conectadas</div>
          <h1>Integraciones</h1>
        </div>
      </div>

      <div className={ui.kpiGrid} style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className={ui.kpiCell}>
          <div className={ui.kLabel}>Conectadas</div>
          <div className={ui.kValue} style={{ color: "var(--green-ok)" }}>{connected}</div>
          <div className={ui.kDelta}>de {integrations.length} disponibles</div>
        </div>
        <div className={ui.kpiCell}>
          <div className={ui.kLabel}>Grupos</div>
          <div className={ui.kValue}>{groups.length}</div>
        </div>
        <div className={ui.kpiCell}>
          <div className={ui.kLabel}>Estado general</div>
          <div className={ui.kValue} style={{ fontSize: 18 }}>
            {connected === 0 ? "Sin configurar" : connected < 5 ? "Parcial" : "Operativo"}
          </div>
        </div>
      </div>

      {groups.map((g) => {
        const items = integrations.filter((i) => i.group === g);
        const gConn = items.filter((i) => i.status === "connected").length;
        return (
          <div key={g} className={ui.panel} style={{ marginBottom: 20 }}>
            <div className={ui.panelHead}>
              <div className={ui.panelTitle}>{g}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {gConn} / {items.length} conectadas
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
              {items.map((i) => (
                <div
                  key={i.id}
                  style={{
                    padding: 18,
                    border: "1px solid rgba(10,26,12,0.08)",
                    borderLeft: `3px solid ${i.status === "connected" ? "var(--green-ok)" : "var(--rule)"}`,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 16,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{i.name}</div>
                      <span className={`${ui.pill} ${i.status === "connected" ? ui.pillGreen : ui.pillGrey}`}>
                        {i.status === "connected" ? "● Conectada" : "○ Off"}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => toggle(i.key)}
                    className={ui.btnGhost}
                    style={{ fontSize: 11, padding: "6px 12px" }}
                  >
                    {i.status === "connected" ? "Desconectar" : "Conectar"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className={ui.panel} style={{ background: "var(--deep-green)", color: "var(--off-white)", border: "none" }}>
        <div style={{ fontSize: 10, letterSpacing: "0.25em", textTransform: "uppercase", color: "var(--sand)", fontWeight: 600, marginBottom: 12 }}>
          ⚡ Integración custom
        </div>
        <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.015em", marginBottom: 8 }}>
          ¿Necesitás conectar otra herramienta?
        </div>
        <div style={{ fontSize: 13, color: "rgba(232,228,220,0.7)", lineHeight: 1.6 }}>
          Cualquier servicio con API se puede conectar vía n8n — CRMs, pagos, herramientas internas.
          Este panel hoy funciona como checklist; el OAuth real de cada plataforma lo implementamos después de Supabase.
        </div>
      </div>
    </>
  );
}
