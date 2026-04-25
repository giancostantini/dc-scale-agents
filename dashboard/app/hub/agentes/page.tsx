"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Topbar from "@/components/Topbar";
import RunOutputDrawer from "@/components/RunOutputDrawer";
import { hasSession } from "@/lib/supabase/auth";
import { getClients } from "@/lib/storage";
import type { AgentRun, Client } from "@/lib/types";
import { useAgentRuns } from "@/lib/use-agent-runs";

export default function HubAgentesPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedRun, setSelectedRun] = useState<AgentRun | null>(null);
  const [filter, setFilter] = useState<"all" | "running" | "success" | "error">("all");

  // Realtime cross-client (sin filtro por client) — reemplaza el polling 20s.
  const { items: runs } = useAgentRuns({ limit: 100 });

  useEffect(() => {
    hasSession().then((has) => {
      if (!has) {
        router.replace("/");
        return;
      }
      setAuthChecked(true);
      void getClients().then(setClients);
    });
  }, [router]);

  const clientNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of clients) m.set(c.id, c.name);
    return m;
  }, [clients]);

  const filtered = filter === "all" ? runs : runs.filter((r) => r.status === filter);

  if (!authChecked) return null;

  return (
    <>
      <Topbar />

      <main style={{ maxWidth: 1400, margin: "0 auto", padding: "40px 32px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginBottom: 32,
            paddingBottom: 24,
            borderBottom: "1px solid rgba(10,26,12,0.08)",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.25em",
                textTransform: "uppercase",
                color: "var(--sand-dark)",
                marginBottom: 12,
                fontWeight: 500,
              }}
            >
              Hub · Agentes
            </div>
            <h1
              style={{
                fontSize: 40,
                fontWeight: 700,
                letterSpacing: "-0.03em",
                lineHeight: 1,
                color: "var(--deep-green)",
              }}
            >
              Feed cross-client
            </h1>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {(["all", "running", "success", "error"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                style={{
                  padding: "8px 14px",
                  background: filter === k ? "var(--deep-green)" : "transparent",
                  color: filter === k ? "var(--off-white)" : "var(--deep-green)",
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  border: "1px solid rgba(10,26,12,0.15)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {k === "all" ? "Todos" : k}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div
            style={{
              padding: 60,
              textAlign: "center",
              border: "1px dashed rgba(10,26,12,0.12)",
              background: "var(--white)",
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 600, color: "var(--deep-green)", marginBottom: 10 }}>
              Sin runs por ahora
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Cuando los agentes empiecen a correr van a aparecer acá.
            </div>
          </div>
        ) : (
          <div style={{ background: "var(--white)", border: "1px solid rgba(10,26,12,0.08)" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "160px 180px 1fr 100px 160px",
                gap: 16,
                padding: "12px 24px",
                borderBottom: "1px solid rgba(10,26,12,0.08)",
                fontSize: 10,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: "var(--sand-dark)",
                fontWeight: 600,
              }}
            >
              <span>Cliente</span>
              <span>Agente</span>
              <span>Resumen</span>
              <span>Status</span>
              <span>Cuándo</span>
            </div>
            {filtered.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedRun(r)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "160px 180px 1fr 100px 160px",
                  gap: 16,
                  padding: "14px 24px",
                  borderBottom: "1px solid rgba(10,26,12,0.05)",
                  fontSize: 13,
                  textAlign: "left",
                  background: "transparent",
                  border: "none",
                  borderTop: "none",
                  borderLeft: "none",
                  borderRight: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  color: "inherit",
                  alignItems: "center",
                }}
              >
                <span style={{ fontWeight: 500 }}>
                  {clientNameById.get(r.client) ?? r.client}
                </span>
                <span style={{ color: "var(--text-muted)" }}>{r.agent}</span>
                <span
                  style={{
                    color: "var(--text-muted)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.summary_md ?? r.summary ?? "—"}
                </span>
                <span>
                  <span
                    style={{
                      padding: "3px 8px",
                      fontSize: 9,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      fontWeight: 700,
                      background:
                        r.status === "success"
                          ? "rgba(58,139,92,0.18)"
                          : r.status === "error"
                          ? "rgba(176,75,58,0.2)"
                          : "rgba(201,161,74,0.2)",
                      color:
                        r.status === "success"
                          ? "var(--green-ok)"
                          : r.status === "error"
                          ? "var(--red-warn)"
                          : "var(--yellow-warn)",
                    }}
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
      </main>

      <RunOutputDrawer run={selectedRun} onClose={() => setSelectedRun(null)} />
    </>
  );
}
