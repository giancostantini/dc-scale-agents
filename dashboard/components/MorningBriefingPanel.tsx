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

  return (
    <div className={ui.panel} style={{ marginBottom: 20 }}>
      <div className={ui.panelHead}>
        <div className={ui.panelTitle}>Morning Briefing</div>
        {briefing && (
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {formatBriefingDate(briefing.created_at)}
          </div>
        )}
      </div>
      {loading ? (
        <div
          style={{
            fontSize: 13,
            color: "var(--text-muted)",
            padding: "8px 0",
          }}
        >
          Cargando…
        </div>
      ) : briefing ? (
        <MarkdownRenderer content={briefing.body_md} shiftHeadings />
      ) : (
        <div style={{ padding: "12px 0" }}>
          <div
            style={{
              fontSize: 13,
              color: "var(--text-muted)",
              marginBottom: 10,
              lineHeight: 1.5,
            }}
          >
            Aún no hay briefing generado para este cliente. Se ejecuta
            automáticamente cada día a las 8:00 (Uruguay).
          </div>
          <Link
            href={`/cliente/${clientId}/agentes`}
            className={ui.btnGhost}
            style={{
              display: "inline-block",
              padding: "6px 14px",
              fontSize: 12,
            }}
          >
            Ir a agentes →
          </Link>
        </div>
      )}
    </div>
  );
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
