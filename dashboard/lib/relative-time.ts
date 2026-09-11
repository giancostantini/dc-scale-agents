// ==================== FECHAS RELATIVAS (client-safe) ====================
// "Publicado hace 5 días" para la card y la ficha del prospecto.
//
// Ojo con la zona horaria: `new Date("2026-09-03")` se parsea como medianoche
// UTC, y en Uruguay (UTC-3) eso cae el 2 a las 21:00. Restar contra un Date
// local se va un día entero. Por eso los dos extremos se arman con Date.UTC.
//
// `daysInStage` (pipeline/page.tsx) NO se toca: opera sobre timestamps
// completos, no sobre fechas sueltas.

/** Días entre una fecha "YYYY-MM-DD" y hoy. null si no parsea. */
export function daysSinceDate(ymd?: string | null): number | null {
  if (!ymd) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return null;
  const then = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const n = new Date();
  const today = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
  return Math.round((today - then) / 86_400_000);
}

/** "hoy" · "ayer" · "hace 5 días" · "hace 3 semanas" · "hace 2 meses". */
export function agoFromDate(ymd?: string | null): string | null {
  const d = daysSinceDate(ymd);
  if (d == null || d < 0) return null;
  if (d === 0) return "hoy";
  if (d === 1) return "ayer";
  if (d < 14) return `hace ${d} días`;
  if (d < 60) return `hace ${Math.floor(d / 7)} semanas`;
  return `hace ${Math.floor(d / 30)} meses`;
}
