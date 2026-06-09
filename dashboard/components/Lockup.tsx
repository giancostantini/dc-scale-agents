// Lockup oficial de la marca · Brand Board 2026
// ---------------------------------------------
// La firma visual de Dearmas & Costantini lleva el "&" como elemento
// gráfico central. Brand Board 2026: "El & es la firma. No se negocia."
//   "Dearmas"     → Inter Bold 700
//   "&"           → DM Sans 200, color sand (var(--sand))
//   "Costantini"  → Inter Light 300 con 55% de opacidad (mismo color base)
//
// Para espacios chicos (favicon, avatar, app icon, sello) usar el isotipo
// "D&C" via <Lockup variant="monogram" />.

import styles from "./Lockup.module.css";

interface LockupProps {
  /** Tamaño tipográfico aplicado al "Dearmas" principal. */
  size?: "sm" | "md" | "lg" | "hero";
  /** Renderiza el lockup completo o sólo el monograma DC. */
  variant?: "full" | "stacked" | "monogram";
  /** Añade la tagline "Business Growth Partners · LATAM". */
  tagline?: boolean;
  /** Color base del lockup (Costantini hereda con 55% opacidad). */
  color?: string;
  /** Color sand para la tagline. */
  taglineColor?: string;
  /** Para className extra. */
  className?: string;
}

export default function Lockup({
  size = "md",
  variant = "full",
  tagline = false,
  color,
  taglineColor,
  className = "",
}: LockupProps) {
  if (variant === "monogram") {
    return (
      <span
        className={`${styles.monogram} ${styles[`size-${size}`]} ${className}`}
        style={color ? { color } : undefined}
      >
        D<span className={styles.amp}>&amp;</span>C
      </span>
    );
  }

  const stacked = variant === "stacked";

  return (
    <span
      className={`${styles.lockup} ${styles[`size-${size}`]} ${
        stacked ? styles.stacked : ""
      } ${className}`}
      style={color ? { color } : undefined}
    >
      <span className={styles.dearmas}>Dearmas</span>{" "}
      <span className={styles.amp}>&amp;</span>
      {stacked ? <br /> : " "}
      <span className={styles.costantini}>Costantini</span>
      {tagline && (
        <span
          className={styles.tagline}
          style={taglineColor ? { color: taglineColor } : undefined}
        >
          Business Growth Partners · LATAM
        </span>
      )}
    </span>
  );
}
