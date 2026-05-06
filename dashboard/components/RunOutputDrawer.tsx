"use client";

import { useEffect, useState } from "react";
import { getOutputsForRun } from "@/lib/agents";
import { getSupabase } from "@/lib/supabase/client";
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

  // Realtime: si llegan nuevos outputs mientras está abierto el drawer,
  // los pusheamos a la lista. Útil para agentes que producen outputs
  // en streaming (ej. content-creator).
  useEffect(() => {
    const supabase = getSupabase();
    const channel = supabase
      .channel(`agent_outputs-${run.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_outputs",
          filter: `run_id=eq.${run.id}`,
        },
        (payload) => {
          const newOutput = payload.new as AgentOutput;
          setOutputs((prev) => {
            if (prev.some((o) => o.id === newOutput.id)) return prev;
            return [...prev, newOutput];
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
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
          {/* Si el run terminó en error, mostrar banner prominente con
              el summary completo. Útil para errores de dispatch o de
              setup donde no hay outputs estructurados todavía. */}
          {run.status === "error" && (
            <div
              style={{
                padding: 16,
                background: "rgba(176,75,58,0.08)",
                borderLeft: "3px solid var(--red-warn)",
                fontSize: 13,
                color: "var(--deep-green)",
                marginBottom: 20,
                lineHeight: 1.6,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "var(--red-warn)",
                  fontWeight: 700,
                  marginBottom: 6,
                }}
              >
                Run con error
              </div>
              <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {run.summary_md ?? run.summary ?? "Sin detalle del error"}
              </div>
            </div>
          )}

          {/* Brief con el que se disparó el run (útil para reproducir
              o entender qué se intentó hacer cuando falla). */}
          {run.metadata &&
            typeof run.metadata === "object" &&
            "brief" in run.metadata &&
            run.metadata.brief !== null &&
            typeof run.metadata.brief === "object" && (
              <details style={{ marginBottom: 20 }}>
                <summary
                  style={{
                    cursor: "pointer",
                    fontSize: 11,
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    color: "var(--sand-dark)",
                    fontWeight: 600,
                  }}
                >
                  Brief del dispatch
                </summary>
                <pre
                  style={{
                    fontFamily: "ui-monospace, monospace",
                    fontSize: 11,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    padding: "10px 12px",
                    border: "1px solid rgba(10,26,12,0.08)",
                    margin: "8px 0 0 0",
                    background: "var(--off-white)",
                    maxHeight: 240,
                    overflow: "auto",
                  }}
                >
                  {JSON.stringify(run.metadata.brief, null, 2)}
                </pre>
              </details>
            )}

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
              {run.status === "error"
                ? "El error ocurrió antes de que el agente registrara outputs estructurados. Mirá el summary y el brief de arriba."
                : run.status === "running"
                ? "El agente sigue corriendo. Cuando termine, los outputs van a aparecer acá automáticamente."
                : "Este run no registró outputs estructurados."}
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
      {output.structured && typeof output.structured === "object" && (
        <StructuredVideoSection
          structured={output.structured as Record<string, unknown>}
        />
      )}
    </div>
  );
}

function StructuredVideoSection({
  structured,
}: {
  structured: Record<string, unknown>;
}) {
  const tsx =
    typeof structured.compositionTsx === "string"
      ? structured.compositionTsx
      : null;
  const stderr =
    typeof structured.videoErrorStderr === "string"
      ? structured.videoErrorStderr
      : null;
  const stage =
    typeof structured.videoErrorStage === "string"
      ? structured.videoErrorStage
      : null;
  const file =
    typeof structured.compositionFile === "string"
      ? structured.compositionFile
      : null;

  if (!tsx && !stderr) return null;

  const codeBlockStyle = {
    fontFamily: "ui-monospace, monospace" as const,
    fontSize: 11 as const,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
    overflow: "auto" as const,
    padding: "10px 12px",
    border: "1px solid rgba(10,26,12,0.08)",
    margin: "8px 0 0 0",
    background: "var(--off-white)",
  };

  return (
    <div
      style={{
        marginTop: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {stage && (
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "var(--red-warn)",
            fontWeight: 700,
          }}
        >
          Falla en fase: {stage}
        </div>
      )}
      {stderr && (
        <details>
          <summary
            style={{
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--red-warn)",
              letterSpacing: "0.02em",
            }}
          >
            stderr completo (Remotion bundler/render)
          </summary>
          <pre style={{ ...codeBlockStyle, maxHeight: 320 }}>{stderr}</pre>
        </details>
      )}
      {tsx && (
        <details open={!!stderr}>
          <summary
            style={{
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--deep-green)",
              letterSpacing: "0.02em",
            }}
            title={file ?? undefined}
          >
            TSX generado por Claude
            {file ? ` · ${file.split(/[\\/]/).slice(-3).join("/")}` : ""}
          </summary>
          <pre style={{ ...codeBlockStyle, maxHeight: 480 }}>{tsx}</pre>
        </details>
      )}
    </div>
  );
}
