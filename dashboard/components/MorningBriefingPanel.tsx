"use client";

/**
 * Panel del Morning Briefing — muestra el último briefing del cliente.
 * Se renderiza en el Dashboard del cliente (página principal). El
 * briefing en sí lo genera un cron diario a las 8:00 UY; este panel
 * solo consume /api/clients/[id]/briefing/latest.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import ui from "@/components/ClientUI.module.css";

interface LatestBriefing {
  body_md: string;
  title: string | null;
  created_at: string;
}

export default function MorningBriefingPanel({
  clientId,
}: {
  clientId: string;
}) {
  const [briefing, setBriefing] = useState<LatestBriefing | null>(null);
  const [loading, setLoading] = useState(true);
  // Colapsado por defecto — el director ve el header + preview de la
  // primera línea, y expande si quiere ver el briefing completo.
  // Así no ocupa media pantalla en el dashboard.
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/clients/${clientId}/briefing/latest`)
      .then((r) => (r.ok ? r.json() : { briefing: null }))
      .then((data: { briefing: LatestBriefing | null }) => {
        if (cancelled) return;
        setBriefing(data.briefing);
      })
      .catch(() => {
        if (!cancelled) setBriefing(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  // Si no hay briefing, mostrar solo una línea muy compacta — no
  // queremos un panel grande con un mensaje de "todavía no hay nada".
  if (!loading && !briefing) {
    return (
      <div
        style={{
          padding: "10px 14px",
          marginBottom: 16,
          background: "var(--off-white)",
          borderLeft: "2px solid var(--sand)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          fontSize: 12,
          color: "var(--text-muted)",
        }}
      >
        <span>
          <strong style={{ color: "var(--deep-green)" }}>Morning Briefing</strong>{" "}
          · Sin briefing todavía. Se ejecuta automáticamente cada día a las 8:00 UY.
        </span>
        <Link
          href={`/cliente/${clientId}/agentes`}
          style={{
            fontSize: 11,
            color: "var(--sand-dark)",
            fontWeight: 600,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          Ir a agentes →
        </Link>
      </div>
    );
  }

  // Preview: primer línea no vacía del markdown, sin headings.
  const preview = briefing ? extractPreview(briefing.body_md) : "";

  return (
    <div className={ui.panel} style={{ marginBottom: 16 }}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: "100%",
          background: "transparent",
          border: "none",
          padding: 0,
          textAlign: "left",
          cursor: "pointer",
          fontFamily: "inherit",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--deep-green)",
              letterSpacing: "-0.01em",
              marginBottom: 2,
            }}
          >
            Morning Briefing
            {briefing && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: "var(--text-muted)",
                  marginLeft: 10,
                }}
              >
                {formatBriefingDate(briefing.created_at)}
              </span>
            )}
          </div>
          {!expanded && preview && (
            <div
              style={{
                fontSize: 12.5,
                color: "var(--text-muted)",
                lineHeight: 1.5,
                overflow: "hidden",
                textOverflow: "ellipsis",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              }}
            >
              {preview}
            </div>
          )}
          {loading && (
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Cargando…
            </div>
          )}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--sand-dark)",
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          {expanded ? "Ocultar ▲" : "Ver completo ▼"}
        </div>
      </button>

      {expanded && briefing && (
        <div
          style={{
            marginTop: 14,
            paddingTop: 14,
            borderTop: "1px solid rgba(10,26,12,0.06)",
          }}
        >
          <MarkdownRenderer content={briefing.body_md} shiftHeadings />
        </div>
      )}
    </div>
  );
}

/**
 * Saca un preview de 1-2 líneas para mostrar colapsado: skip headings,
 * agarra el primer párrafo de texto puro.
 */
function extractPreview(md: string): string {
  const lines = md.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) continue; // saltea headings
    // Saca markup básico (**, _, *, `, [link](url))
    const clean = trimmed
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/_([^_]+)_/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    return clean;
  }
  return "";
}

function formatBriefingDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfBriefing = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round(
    (startOfToday.getTime() - startOfBriefing.getTime()) / (1000 * 60 * 60 * 24),
  );
  const time = d.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 0) return `Hoy · ${time}`;
  if (diffDays === 1) return `Ayer · ${time}`;
  return d.toLocaleDateString("es-UY", { day: "numeric", month: "short" });
}
