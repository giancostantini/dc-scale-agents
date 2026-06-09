"use client";

/**
 * Brand Icons — biblioteca custom de iconos inspirada en el
 * Brand Board de Dearmas & Costantini (2026).
 *
 * Principios:
 *   · Trazos finos (1.5–1.6 stroke) → editorial, no startup-y.
 *   · Geometría simple, sin ruido. Cada ícono tiene 3–7 elementos máx.
 *   · currentColor para que herede del padre.
 *   · Acentos sand opcionales (.dot fill="var(--sand)") en algunos
 *     iconos para reforzar la firma visual de marca.
 *   · API compatible con Lucide (size, strokeWidth, className, color)
 *     → swap directo sin cambiar callsites.
 *
 * Si agregás un ícono nuevo, mantené esta línea estética: cuadrado
 * 24x24, trazos finos, formas geométricas básicas.
 */

import type { CSSProperties, ReactNode } from "react";

export interface BrandIconProps {
  size?: number | string;
  strokeWidth?: number;
  className?: string;
  color?: string;
  style?: CSSProperties;
}

interface IconShellProps extends BrandIconProps {
  children: ReactNode;
}

function IconShell({
  size = 18,
  strokeWidth = 1.6,
  className,
  color,
  style,
  children,
}: IconShellProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? "currentColor"}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

const SAND = "var(--sand, #C4A882)";

// ============================================================
// Navegación principal
// ============================================================

export function IDashboard(props: BrandIconProps) {
  return (
    <IconShell {...props}>
      <rect x="3" y="3" width="8" height="9" rx="0.5" />
      <rect x="13" y="3" width="8" height="5" rx="0.5" />
      <rect x="13" y="11" width="8" height="10" rx="0.5" />
      <rect x="3" y="14" width="8" height="7" rx="0.5" />
    </IconShell>
  );
}

export function IPipeline(props: BrandIconProps) {
  // Funnel — 3 segmentos descendiendo en ancho
  return (
    <IconShell {...props}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="6" y1="12" x2="18" y2="12" />
      <line x1="9" y1="18" x2="15" y2="18" />
      <circle cx="20" cy="6" r="0.9" fill={SAND} stroke="none" />
    </IconShell>
  );
}

export function IClientes(props: BrandIconProps) {
  // Dos círculos sutiles superpuestos
  return (
    <IconShell {...props}>
      <circle cx="9" cy="12" r="5" />
      <circle cx="15.5" cy="9" r="3.2" />
    </IconShell>
  );
}

export function IEquipo(props: BrandIconProps) {
  // Dos personas — equipo. Una al frente, otra detrás-derecha
  // (clásico "users" / team icon editorial).
  return (
    <IconShell {...props}>
      {/* Persona del fondo (derecha) — más chica */}
      <circle cx="16" cy="8" r="2.4" />
      <path d="M11.5 19 C12 16, 14, 14.5, 16, 14.5 C18 14.5, 20, 16, 20.5, 19" />
      {/* Persona del frente (izquierda) — más prominente */}
      <circle cx="9.5" cy="9" r="3" />
      <path d="M4 20 C4.8 16.5, 7, 14.8, 9.5, 14.8 C12 14.8, 14.2, 16.5, 15, 20" />
    </IconShell>
  );
}

export function ITareas(props: BrandIconProps) {
  // Checklist editorial
  return (
    <IconShell {...props}>
      <line x1="9" y1="6" x2="20" y2="6" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <line x1="9" y1="18" x2="16" y2="18" />
      <path d="M3 6 L4.5 7.5 L6.5 5" />
      <circle cx="4.5" cy="12" r="1.4" />
      <circle cx="4.5" cy="18" r="1.4" />
    </IconShell>
  );
}

export function ICalendario(props: BrandIconProps) {
  // Marco de calendario con puntito sand
  return (
    <IconShell {...props}>
      <rect x="3.5" y="5" width="17" height="15" rx="1" />
      <line x1="3.5" y1="10" x2="20.5" y2="10" />
      <line x1="8" y1="3" x2="8" y2="6.5" />
      <line x1="16" y1="3" x2="16" y2="6.5" />
      <circle cx="16" cy="15.5" r="1.4" fill={SAND} stroke="none" />
    </IconShell>
  );
}

export function IFinanzas(props: BrandIconProps) {
  // Círculo + barras ascendentes adentro (riqueza, crecimiento)
  return (
    <IconShell {...props}>
      <circle cx="12" cy="12" r="9" />
      <line x1="8.5" y1="15" x2="8.5" y2="13" />
      <line x1="12" y1="15" x2="12" y2="11" />
      <line x1="15.5" y1="15" x2="15.5" y2="9" />
    </IconShell>
  );
}

export function IFases(props: BrandIconProps) {
  // Capas / escalones
  return (
    <IconShell {...props}>
      <path d="M3 7 L12 3 L21 7 L12 11 Z" />
      <polyline points="3 12 12 16 21 12" />
      <polyline points="3 17 12 21 21 17" />
    </IconShell>
  );
}

export function IObjetivos(props: BrandIconProps) {
  // Target — círculos concéntricos
  return (
    <IconShell {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5.5" />
      <circle cx="12" cy="12" r="2" fill={SAND} stroke="none" />
    </IconShell>
  );
}

export function IContenido(props: BrandIconProps) {
  // Hoja con marca diagonal + punto sand (creativo/idea)
  return (
    <IconShell {...props}>
      <path d="M5 3 H14 L19 8 V21 H5 Z" />
      <polyline points="14 3 14 8 19 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
      <circle cx="18" cy="5" r="1.2" fill={SAND} stroke="none" />
    </IconShell>
  );
}

export function IProducciones(props: BrandIconProps) {
  // Clapperboard simplificado
  return (
    <IconShell {...props}>
      <rect x="3" y="9" width="18" height="11" rx="1" />
      <polygon points="3 9 7 3 11 9" fill="none" />
      <polygon points="11 9 15 3 19 9" fill="none" />
    </IconShell>
  );
}

export function IAnalitica(props: BrandIconProps) {
  // Línea ascendente con puntos
  return (
    <IconShell {...props}>
      <line x1="3" y1="20" x2="21" y2="20" />
      <polyline points="4 16 9 11 13 14 20 5" />
      <circle cx="9" cy="11" r="1.1" fill={SAND} stroke="none" />
      <circle cx="20" cy="5" r="1.4" fill={SAND} stroke="none" />
    </IconShell>
  );
}

export function IReporting(props: BrandIconProps) {
  // Documento + líneas
  return (
    <IconShell {...props}>
      <path d="M5 3 H14 L19 8 V21 H5 Z" />
      <polyline points="14 3 14 8 19 8" />
      <line x1="8" y1="11" x2="16" y2="11" />
      <line x1="8" y1="14" x2="14" y2="14" />
      <line x1="8" y1="17" x2="16" y2="17" />
    </IconShell>
  );
}

export function IBiblioteca(props: BrandIconProps) {
  // Libro abierto
  return (
    <IconShell {...props}>
      <path d="M3 5 C7 4 10 4.5 12 6 C14 4.5 17 4 21 5 V19 C17 18 14 18.5 12 20 C10 18.5 7 18 3 19 Z" />
      <line x1="12" y1="6" x2="12" y2="20" />
    </IconShell>
  );
}

export function ISolicitudes(props: BrandIconProps) {
  // Bandeja de entrada
  return (
    <IconShell {...props}>
      <path d="M3 13 V19 A2 2 0 0 0 5 21 H19 A2 2 0 0 0 21 19 V13" />
      <polyline points="3 13 7 13 9 16 15 16 17 13 21 13" />
      <line x1="12" y1="3" x2="12" y2="11" />
      <polyline points="9 8 12 11 15 8" />
    </IconShell>
  );
}

export function INotas(props: BrandIconProps) {
  // Pluma editorial
  return (
    <IconShell {...props}>
      <path d="M4 20 L8 19 L19 8 L16 5 L5 16 Z" />
      <line x1="14" y1="7" x2="17" y2="10" />
      <line x1="4" y1="20" x2="6" y2="18" />
    </IconShell>
  );
}

export function IConfiguracion(props: BrandIconProps) {
  // Engranaje minimal — 6 dientes geométricos
  return (
    <IconShell {...props}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2 V5 M12 19 V22 M22 12 H19 M5 12 H2 M19 5 L17 7 M7 17 L5 19 M19 19 L17 17 M7 7 L5 5" />
    </IconShell>
  );
}

export function ISprints(props: BrandIconProps) {
  // Flecha circular — iteración
  return (
    <IconShell {...props}>
      <path d="M20 12 A8 8 0 1 1 12 4" />
      <polyline points="14 2 20 4 18 10" />
      <circle cx="12" cy="12" r="1.4" fill={SAND} stroke="none" />
    </IconShell>
  );
}

// ============================================================
// Acciones (UI buttons)
// ============================================================

export function IPlus(props: BrandIconProps) {
  return (
    <IconShell {...props}>
      <line x1="12" y1="4" x2="12" y2="20" />
      <line x1="4" y1="12" x2="20" y2="12" />
    </IconShell>
  );
}

export function IArrowLeft(props: BrandIconProps) {
  return (
    <IconShell {...props}>
      <line x1="20" y1="12" x2="4" y2="12" />
      <polyline points="10 6 4 12 10 18" />
    </IconShell>
  );
}

export function ISearch(props: BrandIconProps) {
  return (
    <IconShell {...props}>
      <circle cx="11" cy="11" r="7" />
      <line x1="16" y1="16" x2="21" y2="21" />
    </IconShell>
  );
}

export function IBell(props: BrandIconProps) {
  return (
    <IconShell {...props}>
      <path d="M6 10 A6 6 0 0 1 18 10 V14 L20 17 H4 L6 14 Z" />
      <path d="M10 21 A2 2 0 0 0 14 21" />
    </IconShell>
  );
}

export function IMail(props: BrandIconProps) {
  return (
    <IconShell {...props}>
      <rect x="3" y="5" width="18" height="14" rx="1" />
      <polyline points="3 7 12 13 21 7" />
    </IconShell>
  );
}

export function ITrash(props: BrandIconProps) {
  return (
    <IconShell {...props}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6 L18 20 A1 1 0 0 1 17 21 H7 A1 1 0 0 1 6 20 L5 6" />
      <path d="M10 11 V17 M14 11 V17" />
      <path d="M9 6 V4 A1 1 0 0 1 10 3 H14 A1 1 0 0 1 15 4 V6" />
    </IconShell>
  );
}

export function IUserCircle(props: BrandIconProps) {
  return (
    <IconShell {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6 19 A7 7 0 0 1 18 19" />
    </IconShell>
  );
}

// ============================================================
// Brand ampersand (signature mark) — uso decorativo
// ============================================================

export function Ampersand(
  props: Omit<BrandIconProps, "strokeWidth"> & { weight?: 200 | 300 | 400 },
) {
  const { size = 18, color, className, style, weight = 200 } = props;
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        fontFamily: "'DM Sans', sans-serif",
        fontWeight: weight,
        fontSize: typeof size === "number" ? `${size}px` : size,
        color: color ?? SAND,
        letterSpacing: "-0.02em",
        lineHeight: 1,
        ...style,
      }}
    >
      &amp;
    </span>
  );
}
