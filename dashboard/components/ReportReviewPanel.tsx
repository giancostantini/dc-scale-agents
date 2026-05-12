"use client";

/**
 * Panel de "feedback y análisis" del reporte que aparece debajo de
 * los botones de acción. Reemplaza la vista de markdown del contenido
 * (el contenido visual lo mira el director descargando el PDF subido).
 *
 * El panel tiene dos secciones:
 *
 * 1. MÉTRICAS ESTRUCTURALES (computadas client-side desde content_md):
 *    palabras, secciones detectadas vs esperadas, bullets, tablas,
 *    links, tiempo estimado de lectura.
 *
 * 2. ANÁLISIS CRÍTICO IA: un agente lee el reporte y devuelve
 *    fortalezas, huecos, riesgo de aprobación, sugerencias. Se
 *    cachea en phase_reports.review_md hasta que el contenido cambie.
 *    El director pide regeneración con un botón.
 */

import { useMemo, useState } from "react";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { getSupabase } from "@/lib/supabase/client";
import type { PhaseKey } from "@/lib/types";

interface Props {
  clientId: string;
  phaseKey: PhaseKey;
  contentMd: string | null;
  reviewMd: string | null;
  /** Lista de secciones esperadas para esta fase, usada para detectar
   *  huecos en las métricas. */
  expectedSections: string[];
  /** Callback cuando el análisis se regenera — para refrescar el
   *  parent con el nuevo review_md sin tener que reload completo. */
  onReviewUpdated: (newReview: string) => void;
}

// ============================================================
// Métricas — sin IA, computadas client-side desde el markdown
// ============================================================

interface Metrics {
  words: number;
  paragraphs: number;
  bullets: number;
  tables: number;
  links: number;
  sectionsFound: string[];
  sectionsMissing: string[];
  readingMinutes: number;
}

function computeMetrics(md: string, expected: string[]): Metrics {
  // Word count: simple split por whitespace
  const words = md.split(/\s+/).filter((w) => w.length > 0).length;

  // Paragraphs: lines no-vacías que NO son heading/bullet/table
  const lines = md.split("\n");
  let paragraphs = 0;
  let bullets = 0;
  let tables = 0;
  let inTable = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      inTable = false;
      continue;
    }
    if (/^#{1,6}\s+/.test(line)) {
      inTable = false;
      continue;
    }
    if (/^[-*+]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      bullets++;
      inTable = false;
      continue;
    }
    if (line.startsWith("|") && line.endsWith("|")) {
      if (!inTable) {
        tables++;
        inTable = true;
      }
      continue;
    }
    inTable = false;
    paragraphs++;
  }

  // Links: markdown links + URLs sueltas
  const linkMatches = md.match(/\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s)]+/g);
  const links = linkMatches ? linkMatches.length : 0;

  // Secciones detectadas: H2 con número (## N. Title) o H2 cualquiera
  const sectionTitles: string[] = [];
  for (const raw of lines) {
    const m = raw.match(/^##\s+(?:\*\*)?\s*\d*\.?\s*([^*#\n]+?)\s*(?:\*\*)?\s*$/);
    if (m && m[1]) sectionTitles.push(m[1].trim());
  }

  // Match esperado vs encontrado por inclusión "loose" de keywords
  const sectionsFound: string[] = [];
  const sectionsMissing: string[] = [];
  for (const exp of expected) {
    const expLower = exp.toLowerCase();
    const found = sectionTitles.some((t) => {
      const tLower = t.toLowerCase();
      // Match si las primeras 3 palabras del esperado están en el título encontrado
      const keyWords = expLower.split(/\s+/).slice(0, 3);
      return keyWords.every((w) => tLower.includes(w));
    });
    (found ? sectionsFound : sectionsMissing).push(exp);
  }

  return {
    words,
    paragraphs,
    bullets,
    tables,
    links,
    sectionsFound,
    sectionsMissing,
    readingMinutes: Math.max(1, Math.round(words / 200)),
  };
}

// ============================================================
// Componente principal
// ============================================================

export default function ReportReviewPanel({
  clientId,
  phaseKey,
  contentMd,
  reviewMd,
  expectedSections,
  onReviewUpdated,
}: Props) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const metrics = useMemo(
    () => (contentMd ? computeMetrics(contentMd, expectedSections) : null),
    [contentMd, expectedSections],
  );

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
      {/* ============ MÉTRICAS ============ */}
      {metrics && (
        <section>
          <div
            style={{
              fontSize: 9,
              letterSpacing: "0.25em",
              textTransform: "uppercase",
              color: "var(--sand-dark)",
              fontWeight: 700,
              marginBottom: 12,
            }}
          >
            Métricas estructurales
          </div>

          {/* Chips de stats */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: 10,
              marginBottom: 16,
            }}
          >
            <MetricChip label="Palabras" value={metrics.words.toLocaleString()} />
            <MetricChip
              label="Tiempo lectura"
              value={`${metrics.readingMinutes} min`}
            />
            <MetricChip label="Párrafos" value={metrics.paragraphs} />
            <MetricChip label="Bullets" value={metrics.bullets} />
            <MetricChip label="Tablas" value={metrics.tables} />
            <MetricChip label="Links" value={metrics.links} />
            <MetricChip
              label="Secciones"
              value={`${metrics.sectionsFound.length} / ${expectedSections.length}`}
              warn={
                metrics.sectionsFound.length < expectedSections.length &&
                expectedSections.length > 0
              }
            />
          </div>

          {/* Secciones faltantes */}
          {metrics.sectionsMissing.length > 0 && (
            <div
              style={{
                background: "rgba(176, 75, 58, 0.06)",
                border: "1px solid rgba(176, 75, 58, 0.2)",
                padding: "10px 14px",
                fontSize: 12.5,
                color: "var(--deep-green)",
                lineHeight: 1.5,
              }}
            >
              <strong style={{ color: "var(--red-warn)" }}>
                ⚠ Secciones esperadas no detectadas
              </strong>
              <ul style={{ margin: "6px 0 0 16px", padding: 0 }}>
                {metrics.sectionsMissing.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              <div
                style={{
                  marginTop: 8,
                  fontSize: 11,
                  color: "var(--text-muted)",
                  fontStyle: "italic",
                }}
              >
                Esta detección es por matching de keywords sobre los headings —
                puede haber falsos positivos si el reporte usa títulos distintos
                a los esperados.
              </div>
            </div>
          )}
        </section>
      )}

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

// ============================================================
// Sub-componente: chip de stat
// ============================================================
function MetricChip({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: string | number;
  warn?: boolean;
}) {
  return (
    <div
      style={{
        padding: "10px 12px",
        background: warn ? "rgba(176, 75, 58, 0.06)" : "var(--ivory)",
        border: warn
          ? "1px solid rgba(176, 75, 58, 0.2)"
          : "1px solid rgba(10,26,12,0.06)",
      }}
    >
      <div
        style={{
          fontSize: 8.5,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--sand-dark)",
          fontWeight: 600,
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: warn ? "var(--red-warn)" : "var(--deep-green)",
          letterSpacing: "-0.01em",
        }}
      >
        {value}
      </div>
    </div>
  );
}
