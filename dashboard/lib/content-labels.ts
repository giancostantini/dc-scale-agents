/**
 * content-labels — labels, colores y formatters compartidos del módulo
 * de Contenido.
 *
 * Antes vivían como consts locales en
 * `app/cliente/[id]/contenido/page.tsx` y estaban duplicadas literalmente
 * en `components/content/ContentFeedPreview.tsx`. Al sumar el Kanban,
 * el Hero del equipo y el board de Publicidad habría una tercera copia,
 * así que se extraen acá.
 *
 * NOTA: `ContentFeedPreview.tsx` todavía tiene su propia copia — migrarlo
 * es deuda aparte (tocarlo arriesga la vista feed del director sin
 * beneficio inmediato).
 */

import type {
  ContentFormat,
  ContentNetwork,
  ContentPost,
  ContentStatus,
} from "./types";

export const NETWORK_LABEL: Record<ContentNetwork, string> = {
  ig: "Instagram",
  tt: "TikTok",
  in: "LinkedIn",
  fb: "Facebook",
};

export const FORMAT_LABEL: Record<ContentFormat, string> = {
  reel: "Reel",
  post: "Post",
  carrusel: "Carrusel",
  story: "Story",
  ugc: "UGC",
  anuncio: "Anuncio",
};

export const STATUS_LABEL: Record<ContentStatus, string> = {
  draft: "Borrador",
  scheduled: "Aprobada",
  published: "Publicada",
};

export const STATUS_COLOR: Record<ContentStatus, string> = {
  draft: "#9B8259",
  scheduled: "#2f7d4f",
  published: "#0A1A0C",
};

/** Formato del código visual: C-XXXX padded a 4 dígitos. */
export function formatCode(n: number): string {
  return `C-${String(n).padStart(4, "0")}`;
}

const MONTHS_ES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

/**
 * Formatea YYYY-MM-DD a "12 mar 2026" — más legible que el ISO
 * crudo y todavía cabe en una sola línea de la tabla.
 */
export function formatHumanDate(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  const y = iso.slice(0, 4);
  const m = Number(iso.slice(5, 7)) - 1;
  const d = Number(iso.slice(8, 10));
  if (Number.isNaN(m) || Number.isNaN(d)) return iso;
  return `${d} ${MONTHS_ES[m] ?? "?"} ${y}`;
}

/**
 * Versión cortita de la fecha para chips/pills donde no entra el año
 * y el mes va abreviado. Ej: "12 jun". Si el año NO es el actual,
 * agregamos el year corto al final ("12 jun '25").
 */
export function formatShortDate(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7)) - 1;
  const d = Number(iso.slice(8, 10));
  if (Number.isNaN(m) || Number.isNaN(d)) return iso;
  const mLabel = (MONTHS_ES[m] ?? "?").slice(0, 3).toLowerCase();
  const now = new Date().getFullYear();
  return y === now ? `${d} ${mLabel}` : `${d} ${mLabel} '${String(y).slice(-2)}`;
}

/**
 * Fecha local en formato YYYY-MM-DD.
 *
 * Existe porque `new Date().toISOString().slice(0,10)` devuelve UTC:
 * en Uruguay (UTC-3) después de las 21:00 da el día SIGUIENTE, lo que
 * corre un día entero la ventana "esta semana" del hero y marca piezas
 * como vencidas antes de tiempo.
 *
 * El código viejo de page.tsx sigue usando toISOString() a propósito —
 * cambiarlo alteraría el orden de la tabla que ve el director.
 */
export function isoLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Redes en las que se publica una pieza.
 *
 * Multi-red (migración 065) guarda `networks[]`, pero las piezas viejas
 * solo tienen el `network` singular. Este helper normaliza el patrón
 * `p.networks?.length ? p.networks : [p.network]` que estaba repetido en
 * page.tsx, ContentFeedPreview y ContentCalendarView.
 */
export function networksOf(post: ContentPost): ContentNetwork[] {
  return post.networks && post.networks.length > 0
    ? post.networks
    : [post.network];
}

/**
 * Rango lunes→domingo de la semana que contiene `ref`, en fechas
 * locales YYYY-MM-DD.
 *
 * getDay() devuelve 0 para domingo, así que (getDay() + 6) % 7 lo
 * reindexa a 0=lunes … 6=domingo, que es cómo se cuenta la semana acá.
 */
export function weekRange(ref: Date): { from: string; to: string } {
  const monday = new Date(ref);
  monday.setDate(ref.getDate() - ((ref.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: isoLocalDate(monday), to: isoLocalDate(sunday) };
}

/** Contadores del encabezado personal del equipo. */
export interface TeamHeroCounts {
  /** Mías, con fecha en la semana actual, todavía no publicadas. */
  week: number;
  /** Mías, con fecha pasada y sin publicar. */
  overdue: number;
  /** Mías en borrador. */
  inProgress: number;
  /** Mías aprobadas y esperando publicación. */
  approved: number;
  /** Mías ya publicadas. */
  done: number;
}

/**
 * Calcula los contadores del hero para un usuario.
 *
 * `posts` es la lista completa del cliente: el filtro por persona se
 * aplica acá adentro a propósito, porque el hero tiene que seguir
 * diciendo lo mismo aunque el usuario apague "Mis piezas".
 */
export function teamHeroCounts(
  posts: ContentPost[],
  userId: string,
  now: Date,
): TeamHeroCounts {
  const today = isoLocalDate(now);
  const { from, to } = weekRange(now);
  const mine = posts.filter((p) => p.assignedTo === userId);
  const pending = mine.filter((p) => p.status !== "published");
  return {
    week: pending.filter((p) => p.date >= from && p.date <= to).length,
    overdue: pending.filter((p) => p.date < today).length,
    inProgress: mine.filter((p) => p.status === "draft").length,
    approved: mine.filter((p) => p.status === "scheduled").length,
    done: mine.filter((p) => p.status === "published").length,
  };
}
