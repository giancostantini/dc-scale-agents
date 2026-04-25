// Lockup oficial de la marca · Brand Board 2026
// ---------------------------------------------
// La firma visual de Dearmas Costantini es el contraste tipográfico:
//   "Dearmas"     → Inter Bold 700
//   "Costantini"  → Inter Light 300 con 55% de opacidad (mismo color base)
//
// El & ya no es la firma de marca: se usa solo como conector lingüístico
// ocasional (ej "Captación & ventas") con la clase utilitaria .amp.
//
// Para espacios chicos (favicon, avatar, app icon, sello) usar el isotipo
// "DC" via <Lockup variant="monogram" />.

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
        DC
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
      <span className={styles.dearmas}>Dearmas</span>
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
