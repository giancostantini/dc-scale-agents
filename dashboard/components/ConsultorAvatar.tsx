"use client";

/**
 * ConsultorAvatar — Avatar del consultor IA del portal.
 *
 * Reemplaza el `✦` estático plano por un avatar con gradient + spark
 * decorativo + indicador "online" pulsante. Genera la sensación de
 * "agente real" sin tocar el endpoint (rediseño es solo estético).
 *
 * Tamaños:
 *   - sm (24px) — bubbles del assistant
 *   - md (32px) — typing indicator + mobile header
 *   - lg (40px) — header desktop
 */

import styles from "./ConsultorAvatar.module.css";

type Size = "sm" | "md" | "lg";

interface Props {
  size?: Size;
  /** Si true, muestra el dot verde "online" pulsante en bottom-right. */
  showStatus?: boolean;
}

export default function ConsultorAvatar({
  size = "md",
  showStatus = false,
}: Props) {
  return (
    <div
      className={`${styles.avatar} ${styles[`size_${size}`]}`}
      aria-hidden="true"
    >
      <div className={styles.glow} />
      <svg
        viewBox="0 0 24 24"
        className={styles.spark}
        fill="currentColor"
      >
        {/* Spark / 4-point star — más sofisticado que el ✦ Unicode */}
        <path d="M12 2L13.5 9 21 10.5 13.5 12 12 19 10.5 12 3 10.5 10.5 9 12 2z" />
      </svg>
      {showStatus && <span className={styles.statusDot} />}
    </div>
  );
}
