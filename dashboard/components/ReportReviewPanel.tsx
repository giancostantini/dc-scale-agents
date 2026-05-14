"use client";

/**
 * Panel de "análisis crítico" del reporte que aparece debajo de
 * los botones de acción. Reemplaza la vista de markdown del contenido
 * (el contenido visual lo mira el director descargando el PDF subido).
 *
 * Un agente lee el reporte y devuelve fortalezas, huecos, riesgo de
 * aprobación y sugerencias. Se cachea en phase_reports.review_md
 * hasta que el contenido cambie. El director pide regeneración
 * con un botón.
 */

import { useState } from "react";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { getSupabase } from "@/lib/supabase/client";
import type { PhaseKey } from "@/lib/types";

interface Props {
  clientId: string;
  phaseKey: PhaseKey;
  contentMd: string | null;
  reviewMd: string | null;
  /** Callback cuando el análisis se regenera — para refrescar el
   *  parent con el nuevo review_md sin tener que reload completo. */
  onReviewUpdated: (newReview: string) => void;
}

export default function ReportReviewPanel({
  clientId,
  phaseKey,
  contentMd,
  reviewMd,
  onReviewUpdated,
}: Props) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateReview(force: boolean) {
    if (generating) return;
    setGenerating(true);
    setError(null);
    try {
      const supabase = getSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Sin sesión");

      const res = await fetch("/api/phases/review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ clientId, phase: phaseKey, force }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      onReviewUpdated(data.review_md);
    } catch (err) {
      const e = err as Error;
      setError(e.message ?? "Error desconocido");
    } finally {
      setGenerating(false);
    }
  }

  if (!contentMd) {
    return (
      <div
        style={{
          padding: 40,
          background: "var(--ivory)",
          textAlign: "center",
          color: "var(--text-muted)",
          fontSize: 13,
        }}
      >
        El reporte todavía no tiene contenido para analizar.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* ============ ANÁLISIS IA ============ */}
      <section>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
            gap: 12,
          }}
        >
          <div
            style={{
              fontSize: 9,
              letterSpacing: "0.25em",
              textTransform: "uppercase",
              color: "var(--sand-dark)",
              fontWeight: 700,
            }}
          >
            Análisis crítico (IA)
          </div>
          {reviewMd ? (
            <button
              onClick={() => generateReview(true)}
              disabled={generating}
              style={{
                background: "transparent",
                border: "1px solid rgba(10,26,12,0.15)",
                color: "var(--deep-green)",
                fontSize: 11,
                padding: "4px 10px",
                cursor: generating ? "default" : "pointer",
                fontWeight: 500,
              }}
            >
              {generating ? "Generando…" : "↻ Regenerar análisis"}
            </button>
          ) : null}
        </div>

        {reviewMd ? (
          <div
            style={{
              padding: "20px 24px",
              background: "var(--ivory)",
              border: "1px solid rgba(10,26,12,0.08)",
              borderLeft: "3px solid var(--sand)",
            }}
          >
            <MarkdownRenderer content={reviewMd} shiftHeadings />
          </div>
        ) : (
          <div
            style={{
              padding: 24,
              background: "var(--ivory)",
              border: "1px dashed rgba(10,26,12,0.15)",
              textAlign: "center",
            }}
          >
            <p
              style={{
                fontSize: 13,
                color: "var(--text-muted)",
                margin: "0 0 14px",
                lineHeight: 1.5,
              }}
            >
              Un agente lee el reporte y te devuelve fortalezas, huecos, riesgos
              de aprobación y sugerencias accionables. Útil para revisar antes
              de mostrarle al cliente.
            </p>
            <button
              onClick={() => generateReview(false)}
              disabled={generating}
              style={{
                background: "var(--deep-green)",
                color: "var(--bone)",
                border: "none",
                padding: "10px 18px",
                fontSize: 12,
                fontWeight: 600,
                cursor: generating ? "default" : "pointer",
                letterSpacing: "0.5px",
              }}
            >
              {generating ? "Analizando…" : "Generar análisis"}
            </button>
          </div>
        )}

        {error && (
          <div
            style={{
              marginTop: 10,
              padding: "8px 12px",
              background: "rgba(176, 75, 58, 0.08)",
              fontSize: 12,
              color: "var(--red-warn)",
            }}
          >
            No se pudo generar: {error}
          </div>
        )}
      </section>
    </div>
  );
}
