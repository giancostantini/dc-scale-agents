"use client";

import { use, useEffect, useState } from "react";
import ui from "@/components/ClientUI.module.css";
import ConsultantChat from "@/components/ConsultantChat";
import AgentCard from "@/components/AgentCard";
import RunOutputDrawer from "@/components/RunOutputDrawer";
import { getClient } from "@/lib/storage";
import { AGENT_CATALOG, filterAgentsForClient, getRecentRuns, runAgent } from "@/lib/agents";
import type { AgentDef } from "@/lib/agents";
import type { AgentRun, Client } from "@/lib/types";

export default function AgentesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [client, setClient] = useState<Client | null>(null);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<AgentRun | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      Promise.all([getClient(id), getRecentRuns(id)]).then(([c, r]) => {
        if (cancelled) return;
        setClient(c ?? null);
        setRuns(r);
      });
    };
    load();
    const interval = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [id, refreshTick]);

  const refresh = () => setRefreshTick((t) => t + 1);

  const agents = filterAgentsForClient(AGENT_CATALOG, client?.modules, client?.sector);

  const lastRunByAgent = new Map<string, AgentRun>();
  for (const r of runs) {
    if (!lastRunByAgent.has(r.agent)) lastRunByAgent.set(r.agent, r);
  }

  async function handleRun(agent: AgentDef) {
    const result = await runAgent(id, agent.key, agent.defaultBrief);
    if ("error" in result) {
      setToast(`Error: ${result.error}`);
    } else {
      setToast(`${agent.name} dispatchado · run #${result.runId}`);
      refresh();
    }
    setTimeout(() => setToast(null), 4000);
  }

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Operación · Agentes IA</div>
          <h1>Agentes del cliente</h1>
        </div>
      </div>

      <p style={{ maxWidth: 640, color: "var(--text-muted)", marginBottom: 28, fontSize: 14, lineHeight: 1.6 }}>
        El Consultor es tu punto de entrada. Pedile que dispare un agente o preguntale
        por el estado del cliente. Los agentes disponibles se filtran según los módulos contratados.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.2fr)", gap: 24, marginBottom: 32 }}>
        <ConsultantChat clientId={id} />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
          {agents.map((a) => (
            <AgentCard
              key={a.key}
              agent={a}
              lastRun={lastRunByAgent.get(a.key)}
              onRun={handleRun}
              onOpenRun={setSelectedRun}
            />
          ))}
        </div>
      </div>

      <div className={ui.panel}>
        <div className={ui.panelHead}>
          <div className={ui.panelTitle}>Runs recientes</div>
          <div className={ui.panelAction}>Últimos 30</div>
        </div>
        {runs.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-muted)", padding: 16 }}>
            Todavía no hay runs para este cliente.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "140px 1fr 100px 160px",
                gap: 16,
                padding: "10px 0",
                borderBottom: "1px solid rgba(10,26,12,0.08)",
                fontSize: 10,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: "var(--sand-dark)",
                fontWeight: 600,
              }}
            >
              <span>Agente</span>
              <span>Resumen</span>
              <span>Status</span>
              <span>Cuándo</span>
            </div>
            {runs.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedRun(r)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "140px 1fr 100px 160px",
                  gap: 16,
                  padding: "12px 0",
                  borderBottom: "1px solid rgba(10,26,12,0.05)",
                  fontSize: 13,
                  textAlign: "left",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  color: "inherit",
                }}
              >
                <span style={{ fontWeight: 500 }}>{r.agent}</span>
                <span style={{ color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.summary_md ?? r.summary ?? "—"}
                </span>
                <span>
                  <span
                    className={
                      r.status === "success"
                        ? `${ui.pill} ${ui.pillGreen}`
                        : r.status === "error"
                        ? `${ui.pill} ${ui.pillRed}`
                        : `${ui.pill} ${ui.pillYellow}`
                    }
                  >
                    {r.status}
                  </span>
                </span>
                <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                  {new Date(r.created_at).toLocaleString("es-UY", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <RunOutputDrawer run={selectedRun} onClose={() => setSelectedRun(null)} />

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            padding: "14px 20px",
            background: "var(--deep-green)",
            color: "var(--off-white)",
            fontSize: 12,
            letterSpacing: "0.05em",
            fontWeight: 500,
            boxShadow: "0 8px 24px rgba(10,26,12,0.2)",
            zIndex: 200,
          }}
        >
          {toast}
        </div>
      )}
    </>
  );
}
