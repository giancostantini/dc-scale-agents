"use client";

import { useEffect, useState } from "react";
import { getOutputsForRun } from "@/lib/agents";
import type { AgentRun, AgentOutput } from "@/lib/types";

interface RunOutputDrawerProps {
  run: AgentRun | null;
  onClose: () => void;
}

export default function RunOutputDrawer({ run, onClose }: RunOutputDrawerProps) {
  if (!run) return null;
  return <DrawerInner key={run.id} run={run} onClose={onClose} />;
}

function DrawerInner({ run, onClose }: { run: AgentRun; onClose: () => void }) {
  const [outputs, setOutputs] = useState<AgentOutput[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getOutputsForRun(run.id).then((data) => {
      if (cancelled) return;
      setOutputs(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [run.id]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10, 26, 12, 0.35)",
        zIndex: 100,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 90vw)",
          background: "var(--white)",
          height: "100%",
          overflowY: "auto",
          boxShadow: "-4px 0 24px rgba(10,26,12,0.15)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid rgba(10, 26, 12, 0.08)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "var(--sand-dark)",
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              {run.agent} · run #{run.id}
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--deep-green)" }}>
              {run.summary_md ?? run.summary ?? "Sin resumen"}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                marginTop: 6,
                display: "flex",
                gap: 10,
                alignItems: "center",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  padding: "2px 8px",
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                  background:
                    run.status === "success"
                      ? "rgba(58,139,92,0.18)"
                      : run.status === "error"
                      ? "rgba(176,75,58,0.2)"
                      : "rgba(201,161,74,0.2)",
                  color:
                    run.status === "success"
                      ? "var(--green-ok)"
                      : run.status === "error"
                      ? "var(--red-warn)"
                      : "var(--yellow-warn)",
                }}
              >
                {run.status}
              </span>
              <span>{new Date(run.created_at).toLocaleString("es-UY")}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              fontSize: 20,
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: 4,
              lineHeight: 1,
            }}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        <div style={{ padding: "20px 24px", flex: 1 }}>
          {loading && (
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Cargando outputs…</div>
          )}

          {!loading && outputs.length === 0 && (
            <div
              style={{
                padding: 20,
                background: "var(--off-white)",
                borderLeft: "3px solid var(--sand)",
                fontSize: 13,
                color: "var(--text-muted)",
              }}
            >
              Este run todavía no registró outputs estructurados.
              {run.status === "running" && " El agente sigue corriendo."}
            </div>
          )}

          {outputs.map((out) => (
            <OutputBlock key={out.id} output={out} />
          ))}
        </div>
      </div>
    </div>
  );
}

function OutputBlock({ output }: { output: AgentOutput }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          color: "var(--sand-dark)",
          fontWeight: 600,
          marginBottom: 6,
        }}
      >
        {output.output_type}
      </div>
      {output.title && (
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--deep-green)",
            marginBottom: 10,
          }}
        >
          {output.title}
        </div>
      )}
      {output.body_md && (
        <pre
          style={{
            fontFamily: "inherit",
            fontSize: 13,
            lineHeight: 1.6,
            color: "var(--deep-green)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            background: "var(--off-white)",
            padding: 16,
            border: "1px solid rgba(10,26,12,0.06)",
            margin: 0,
          }}
        >
          {output.body_md}
        </pre>
      )}
    </div>
  );
}
