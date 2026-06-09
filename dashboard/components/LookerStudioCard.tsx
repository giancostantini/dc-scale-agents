"use client";

/**
 * LookerStudioCard — Glass CTA en el sidebar del portal del cliente.
 *
 * Reemplaza los KPI charts internos (recharts) que el cliente nunca
 * usaba. Apunta al dashboard real de Looker Studio que arma el equipo
 * por cliente.
 *
 * Estados:
 *   - url presente → tarjeta con CTA "Abrir dashboard →"
 *   - url null/empty → estado "preparando" sin link
 */

import styles from "./LookerStudioCard.module.css";

interface Props {
  url: string | null | undefined;
}

export default function LookerStudioCard({ url }: Props) {
  const hasUrl = typeof url === "string" && url.trim().length > 0;

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.icon} aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v18h18" />
            <path d="M7 14l3-3 4 4 5-6" />
          </svg>
        </div>
        <div>
          <div className={styles.eyebrow}>Tu dashboard</div>
          <div className={styles.title}>Métricas en vivo</div>
        </div>
      </div>

      {hasUrl ? (
        <>
          <p className={styles.body}>
            Tus KPIs actualizados en tiempo real. Datos directos de tus
            cuentas de Meta, Google Ads y Analytics.
          </p>
          <a
            href={url ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.cta}
          >
            Abrir Looker Studio
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M7 17L17 7M9 7h8v8" />
            </svg>
          </a>
        </>
      ) : (
        <>
          <p className={styles.bodyMuted}>
            Tu dashboard de métricas se está preparando. Te avisamos cuando
            esté listo para que veas tus KPIs en vivo.
          </p>
          <div className={styles.statusBadge}>
            <span className={styles.statusDot} />
            En preparación
          </div>
        </>
      )}
    </div>
  );
}
