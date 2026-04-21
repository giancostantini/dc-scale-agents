"use client";

import { useState } from "react";
import type { AgentDef } from "@/lib/agents";
import type { AgentRun } from "@/lib/types";

interface AgentCardProps {
  agent: AgentDef;
  lastRun?: AgentRun;
  onRun: (agent: AgentDef) => Promise<void>;
  onOpenRun: (run: AgentRun) => void;
}

const STATUS_COLORS: Record<string, string> = {
  success: "var(--green-ok)",
  running: "var(--yellow-warn)",
  error: "var(--red-warn)",
};

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "nunca";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "recién";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `hace ${days} d`;
  return d.toLocaleDateString("es-UY", { day: "2-digit", month: "short" });
}

export default function AgentCard({ agent, lastRun, onRun, onOpenRun }: AgentCardProps) {
  const [busy, setBusy] = useState(false);

  async function handleRun(e: React.MouseEvent) {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      await onRun(agent);
    } finally {
      setBusy(false);
    }
  }

  const statusColor = lastRun ? STATUS_COLORS[lastRun.status] ?? "var(--sand-dark)" : "var(--sand-dark)";

  return (
    <div
      style={{
        background: "var(--deep-green)",
        color: "var(--off-white)",
        padding: 24,
        borderTop: "2px solid var(--sand)",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        cursor: lastRun ? "pointer" : "default",
        transition: "transform 0.15s",
      }}
      onClick={() => lastRun && onOpenRun(lastRun)}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            marginBottom: 6,
          }}
        >
          {agent.name}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "rgba(232,228,220,0.65)",
            lineHeight: 1.5,
          }}
        >
          {agent.desc}
        </div>
      </div>

      <div
        style={{
          borderTop: "1px solid rgba(196,168,130,0.2)",
          paddingTop: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div
            style={{
              fontSize: 9,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "var(--sand)",
              fontWeight: 600,
            }}
          >
            Último run
          </div>
          <div style={{ fontSize: 11, color: "rgba(232,228,220,0.8)", display: "flex", gap: 6, alignItems: "center" }}>
            <span
              style={{
                display: "inline-block",
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: statusColor,
              }}
            />
            {lastRun ? (
              <>
                <span>{lastRun.status}</span>
                <span style={{ opacity: 0.6 }}>· {formatTime(lastRun.created_at)}</span>
              </>
            ) : (
              <span style={{ opacity: 0.6 }}>sin runs todavía</span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleRun}
          disabled={busy}
          style={{
            padding: "8px 14px",
            background: busy ? "rgba(196,168,130,0.3)" : "var(--sand)",
            color: "var(--deep-green)",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            border: "none",
            cursor: busy ? "wait" : "pointer",
            fontFamily: "inherit",
            whiteSpace: "nowrap",
          }}
        >
          {busy ? "…" : "Ejecutar"}
        </button>
      </div>
    </div>
  );
}
