"use client";

import { use, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import ui from "@/components/ClientUI.module.css";

interface CompetitorPiece {
  id: number;
  client: string;
  competitor: string;
  platform: string | null;
  url: string | null;
  piece_type: string | null;
  hook: string | null;
  format: string | null;
  performance_estimate: Record<string, number | string> | null;
  captured_at: string;
  notes: string | null;
  archived: boolean;
}

export default function CompetenciaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [pieces, setPieces] = useState<CompetitorPiece[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabase();
    supabase
      .from("competitor_pieces")
      .select("*")
      .eq("client", id)
      .order("captured_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        if (cancelled) return;
        setPieces((data as CompetitorPiece[]) ?? []);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, refreshTick]);

  const visible = pieces.filter((p) => (showArchived ? p.archived : !p.archived));

  async function toggleArchive(piece: CompetitorPiece) {
    const supabase = getSupabase();
    await supabase
      .from("competitor_pieces")
      .update({ archived: !piece.archived })
      .eq("id", piece.id);
    setRefreshTick((t) => t + 1);
  }

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Biblioteca · Inteligencia de competencia</div>
          <h1>Piezas capturadas</h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setShowArchived((s) => !s)}
            className={ui.btnGhost}
          >
            {showArchived ? "Ver activas" : "Ver archivadas"}
          </button>
        </div>
      </div>

      <div className={ui.kpiGrid} style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className={ui.kpiCell}>
          <div className={ui.kLabel}>Activas</div>
          <div className={ui.kValue}>{pieces.filter((p) => !p.archived).length}</div>
        </div>
        <div className={ui.kpiCell}>
          <div className={ui.kLabel}>Archivadas</div>
          <div className={ui.kValue}>{pieces.filter((p) => p.archived).length}</div>
        </div>
        <div className={ui.kpiCell}>
          <div className={ui.kLabel}>Fuente</div>
          <div className={ui.kValue} style={{ fontSize: 14 }}>
            vault/clients/{id}/competitors.md
          </div>
          <div className={ui.kDelta}>scanner · Mon/Wed/Fri</div>
        </div>
      </div>

      <div className={ui.panel}>
        <div className={ui.panelHead}>
          <div className={ui.panelTitle}>
            {showArchived ? "Archivadas" : "Piezas activas"} ({visible.length})
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            El Consultor inyecta las top-3 más recientes como <code>examples[]</code> en cada
            brief de Content Creator.
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 24, color: "var(--text-muted)", fontSize: 13 }}>
            Cargando…
          </div>
        ) : visible.length === 0 ? (
          <div
            style={{
              padding: 40,
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: 13,
            }}
          >
            {showArchived
              ? "No hay piezas archivadas."
              : "Todavía no hay piezas capturadas. Agregá URLs a vault/clients/" +
                id +
                "/competitors.md y esperá al próximo run del scanner."}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {visible.map((p) => (
              <div
                key={p.id}
                style={{
                  padding: 18,
                  background: "var(--white)",
                  border: "1px solid rgba(10,26,12,0.08)",
                  borderLeft: "3px solid var(--sand)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 16,
                    marginBottom: 8,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
                      @{p.competitor}
                      {p.platform ? ` · ${p.platform}` : ""}
                      {p.piece_type ? ` · ${p.piece_type}` : ""}
                    </div>
                    {p.hook && (
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 600,
                          marginBottom: 6,
                          letterSpacing: "-0.01em",
                        }}
                      >
                        “{p.hook}”
                      </div>
                    )}
                    {p.format && (
                      <div style={{ fontSize: 12, color: "var(--sand-dark)", marginBottom: 6 }}>
                        formato: {p.format}
                      </div>
                    )}
                    {p.notes && (
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>
                        {p.notes}
                      </div>
                    )}
                    {p.performance_estimate && Object.keys(p.performance_estimate).length > 0 && (
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {Object.entries(p.performance_estimate)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(" · ")}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                    {p.url && (
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={ui.btnGhost}
                        style={{ textAlign: "center", textDecoration: "none" }}
                      >
                        Abrir
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleArchive(p)}
                      className={ui.btnGhost}
                    >
                      {p.archived ? "Restaurar" : "Descartar"}
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.05em" }}>
                  Capturada {new Date(p.captured_at).toLocaleString("es-UY")}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
