"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import styles from "./MonthSummaryBlock.module.css";

interface ThisMonthData {
  period: { from: string; until: string; label: string };
  counts: {
    contentPosts: number;
    campaigns: number;
    reports: number;
    meetings: number;
    requestsResolved: number;
    agentRuns: number;
  };
  highlights: {
    lastPosts: Array<{
      id: string;
      network: string;
      format: string | null;
      brief: string | null;
      date: string;
    }>;
    lastMeetings: Array<{
      id: string;
      title: string;
      date: string;
      time: string | null;
      type: string;
    }>;
    lastReports: Array<{ phase: string; approved_at: string }>;
    lastResolvedRequests: Array<{
      id: string;
      type: string;
      title: string;
      status: string;
      updated_at: string;
    }>;
  };
}

const PHASE_LABELS: Record<string, string> = {
  diagnostico: "Diagnóstico",
  estrategia: "Estrategia",
  setup: "Setup",
  lanzamiento: "Lanzamiento",
};

/**
 * Bloque "Qué hicimos este mes". Agrega contenido, campañas, reportes,
 * reuniones, solicitudes resueltas y corridas de agentes IA del mes
 * actual y muestra:
 * - 6 stats con número grande
 * - Sección de highlights con los items más recientes
 *
 * Si todos los counts son 0, muestra un mensaje cálido para clientes
 * recién empezando.
 */
export default function MonthSummaryBlock() {
  const [data, setData] = useState<ThisMonthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const supabase = getSupabase();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          if (active) {
            setError("Sin sesión.");
            setLoading(false);
          }
          return;
        }
        const res = await fetch("/api/portal/this-month", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const json = (await res.json().catch(() => ({}))) as
          | ThisMonthData
          | { error: string };
        if (!active) return;
        if (!res.ok || !("counts" in json)) {
          setError(("error" in json && json.error) || `Error ${res.status}`);
          setLoading(false);
          return;
        }
        setData(json);
        setLoading(false);
      } catch (err) {
        console.error("this-month fetch error:", err);
        if (active) {
          setError("Error de red.");
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <section className={styles.wrapper} aria-label="Cargando resumen del mes">
        <div className={styles.header}>
          <div className={styles.eyebrow}>Qué hicimos este mes</div>
        </div>
        <div className={styles.skeleton} />
      </section>
    );
  }

  if (error || !data) {
    // Silent fallback — el bloque no es crítico, no mostramos error feo.
    return null;
  }

  const { counts, highlights, period } = data;
  const totalActions = Object.values(counts).reduce((acc, n) => acc + n, 0);

  return (
    <section className={styles.wrapper} aria-label="Resumen del mes">
      <div className={styles.header}>
        <div className={styles.eyebrow}>Qué hicimos este mes</div>
        <div className={styles.subtle}>
          {period.label.charAt(0).toUpperCase() + period.label.slice(1)}
        </div>
      </div>

      {totalActions === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>Estamos arrancando</div>
          <div className={styles.emptyBody}>
            Este es tu primer mes con el equipo. Pronto vas a ver acá las
            piezas de contenido, campañas, reuniones y reportes que vamos
            armando para tu cuenta.
          </div>
        </div>
      ) : (
        <>
          <div className={styles.statsGrid}>
            <Stat
              n={counts.contentPosts}
              label="Posts publicados"
              icon="✦"
            />
            <Stat n={counts.campaigns} label="Campañas lanzadas" icon="◈" />
            <Stat n={counts.reports} label="Reportes aprobados" icon="✓" />
            <Stat n={counts.meetings} label="Reuniones tuvimos" icon="◉" />
            <Stat
              n={counts.requestsResolved}
              label="Solicitudes resueltas"
              icon="◐"
            />
          </div>

          {(highlights.lastPosts.length > 0 ||
            highlights.lastMeetings.length > 0 ||
            highlights.lastReports.length > 0 ||
            highlights.lastResolvedRequests.length > 0) && (
            <div className={styles.highlights}>
              {highlights.lastReports.length > 0 && (
                <Highlight title="Reportes aprobados">
                  {highlights.lastReports.map((r, i) => (
                    <li key={i}>
                      <strong>{PHASE_LABELS[r.phase] ?? r.phase}</strong>
                      <span>
                        {new Date(r.approved_at).toLocaleDateString("es-AR", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </span>
                    </li>
                  ))}
                </Highlight>
              )}
              {highlights.lastMeetings.length > 0 && (
                <Highlight title="Últimas reuniones">
                  {highlights.lastMeetings.map((m) => (
                    <li key={m.id}>
                      <strong>{m.title}</strong>
                      <span>
                        {new Date(m.date).toLocaleDateString("es-AR", {
                          day: "2-digit",
                          month: "short",
                        })}
                        {m.time ? ` · ${m.time}` : ""}
                      </span>
                    </li>
                  ))}
                </Highlight>
              )}
              {highlights.lastPosts.length > 0 && (
                <Highlight title="Contenido reciente">
                  {highlights.lastPosts.map((p) => (
                    <li key={p.id}>
                      <strong>{p.network.toUpperCase()}</strong>
                      <span>
                        {p.format ?? "Post"} ·{" "}
                        {new Date(p.date).toLocaleDateString("es-AR", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </span>
                    </li>
                  ))}
                </Highlight>
              )}
              {highlights.lastResolvedRequests.length > 0 && (
                <Highlight title="Solicitudes cerradas">
                  {highlights.lastResolvedRequests.map((r) => (
                    <li key={r.id}>
                      <strong>{r.title}</strong>
                      <span>
                        {r.type === "oferta" ? "Oferta" : "Acción"} ·{" "}
                        {r.status === "done" ? "Completada" : "Rechazada"}
                      </span>
                    </li>
                  ))}
                </Highlight>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Stat({
  n,
  label,
  icon,
}: {
  n: number;
  label: string;
  icon: string;
}) {
  return (
    <div className={styles.stat}>
      <div className={styles.statIcon}>{icon}</div>
      <div className={styles.statNumber}>{n}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}

function Highlight({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.highlightCol}>
      <div className={styles.highlightTitle}>{title}</div>
      <ul className={styles.highlightList}>{children}</ul>
    </div>
  );
}
