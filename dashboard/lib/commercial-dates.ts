/**
 * Fechas comerciales argentinas — calendario hot.
 *
 * El roadmap las muestra como flag en el calendario para que el equipo
 * tenga visibilidad de cuándo activar campañas, ofertas, contenidos
 * temáticos.
 *
 * Cada fecha tiene:
 *  - label: texto corto que aparece en el calendario
 *  - emoji: emoji visual para identificarla rápido
 *  - importance: "alta" (afecta plan comercial) | "media" (oportunidad
 *    de contenido) | "baja" (referencia cultural)
 *  - kind: tipo (comercial / fecha-patria / cultural / estacional)
 *
 * Implementación:
 *  - Las fechas FIJAS se devuelven directamente (Navidad 25-12 siempre).
 *  - Las fechas MÓVILES tipo "tercer domingo de octubre" se calculan
 *    año por año con helpers.
 *
 * Cobertura: Argentina (rioplatense) + algunas fechas globales que se
 * activan acá (Black Friday, Cyber Monday, San Valentín).
 */

export type CommercialDateKind =
  | "comercial"
  | "patria"
  | "cultural"
  | "estacional";

export interface CommercialDate {
  /** YYYY-MM-DD */
  date: string;
  label: string;
  emoji: string;
  importance: "alta" | "media" | "baja";
  kind: CommercialDateKind;
}

// ============================================================
// Helpers para fechas móviles
// ============================================================

/** Tercer domingo de un mes. Día de la Madre en Argentina = 3er
 *  domingo de octubre. Día del Padre en Argentina = 3er domingo de
 *  junio. */
function thirdSundayOf(year: number, month0: number): Date {
  // Buscamos el primer domingo del mes y sumamos 14 días
  const first = new Date(year, month0, 1);
  const offset = (7 - first.getDay()) % 7; // días hasta el próximo domingo
  return new Date(year, month0, 1 + offset + 14);
}

/** Día del Niño en Argentina = 3er domingo de agosto (cambió en 2020). */
function dayOfChild(year: number): Date {
  return thirdSundayOf(year, 7);
}

/** Black Friday = viernes después de Thanksgiving (4to jueves de
 *  noviembre). */
function blackFriday(year: number): Date {
  const first = new Date(year, 10, 1); // noviembre
  // Día hasta el primer jueves (jueves = 4)
  const offset = (4 - first.getDay() + 7) % 7;
  // 4to jueves
  const thanksgiving = new Date(year, 10, 1 + offset + 21);
  // Viernes siguiente
  return new Date(thanksgiving.getTime() + 24 * 60 * 60 * 1000);
}

function cyberMonday(year: number): Date {
  const bf = blackFriday(year);
  return new Date(bf.getTime() + 3 * 24 * 60 * 60 * 1000);
}

/** Formato YYYY-MM-DD. */
function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ============================================================
// Lista canónica de fechas para un año dado
// ============================================================

/**
 * Devuelve todas las fechas comerciales del año pedido.
 * Calculadas en runtime — no se cachean para no equivocarse con
 * cambios de timezone.
 */
export function commercialDatesForYear(year: number): CommercialDate[] {
  const fixed: CommercialDate[] = [
    // Enero
    { date: `${year}-01-01`, label: "Año Nuevo",                    emoji: "🎆", importance: "alta",  kind: "estacional" },
    // Febrero
    { date: `${year}-02-14`, label: "San Valentín",                  emoji: "💌", importance: "alta",  kind: "comercial" },
    // Marzo
    { date: `${year}-03-08`, label: "Día de la Mujer",               emoji: "♀",  importance: "alta",  kind: "cultural" },
    { date: `${year}-03-24`, label: "Día de la Memoria",             emoji: "🕊", importance: "media", kind: "patria" },
    // Abril
    { date: `${year}-04-02`, label: "Malvinas",                      emoji: "🇦🇷", importance: "media", kind: "patria" },
    // Mayo
    { date: `${year}-05-01`, label: "Día del Trabajador",            emoji: "🛠", importance: "media", kind: "patria" },
    { date: `${year}-05-25`, label: "Revolución de Mayo",            emoji: "🇦🇷", importance: "media", kind: "patria" },
    // Junio
    { date: `${year}-06-20`, label: "Día de la Bandera",             emoji: "🇦🇷", importance: "media", kind: "patria" },
    // Julio
    { date: `${year}-07-09`, label: "Día de la Independencia",       emoji: "🇦🇷", importance: "media", kind: "patria" },
    { date: `${year}-07-20`, label: "Día del Amigo",                 emoji: "🤝", importance: "alta",  kind: "comercial" },
    // Setiembre
    { date: `${year}-09-11`, label: "Día del Maestro",               emoji: "👩‍🏫", importance: "baja",  kind: "cultural" },
    { date: `${year}-09-21`, label: "Día del Estudiante / Primavera", emoji: "🌸", importance: "alta", kind: "comercial" },
    // Octubre
    { date: `${year}-10-12`, label: "Día de la Diversidad Cultural", emoji: "🌎", importance: "media", kind: "patria" },
    { date: `${year}-10-31`, label: "Halloween",                     emoji: "🎃", importance: "media", kind: "comercial" },
    // Noviembre
    { date: `${year}-11-20`, label: "Día de la Soberanía",           emoji: "🇦🇷", importance: "baja",  kind: "patria" },
    // Diciembre
    { date: `${year}-12-08`, label: "Inmaculada Concepción",         emoji: "✝",  importance: "baja",  kind: "cultural" },
    { date: `${year}-12-24`, label: "Nochebuena",                    emoji: "🎄", importance: "alta",  kind: "estacional" },
    { date: `${year}-12-25`, label: "Navidad",                       emoji: "🎄", importance: "alta",  kind: "estacional" },
    { date: `${year}-12-31`, label: "Año Nuevo / Reveillon",         emoji: "🎉", importance: "alta",  kind: "estacional" },
  ];

  // Fechas móviles
  const movable: CommercialDate[] = [
    { date: fmt(thirdSundayOf(year, 5)),  label: "Día del Padre",  emoji: "👨", importance: "alta", kind: "comercial" },
    { date: fmt(dayOfChild(year)),         label: "Día del Niño",   emoji: "🧒", importance: "alta", kind: "comercial" },
    { date: fmt(thirdSundayOf(year, 9)),  label: "Día de la Madre", emoji: "👩", importance: "alta", kind: "comercial" },
    { date: fmt(blackFriday(year)),        label: "Black Friday",   emoji: "🛍", importance: "alta", kind: "comercial" },
    { date: fmt(cyberMonday(year)),        label: "Cyber Monday",   emoji: "💻", importance: "alta", kind: "comercial" },
  ];

  // Hot Sale Argentina (mayo, miércoles a viernes — fechas las
  // anuncia CACE año a año). Usamos un placeholder: 2da semana de
  // mayo, lunes a miércoles. El director puede sobreescribir manualmente.
  // 2026: 11-13 mayo · 2027: estimado 10-12 mayo
  const hotSaleStart = new Date(year, 4, 11);
  // Ajustar al lunes más cercano si no cae lunes
  const dow = hotSaleStart.getDay(); // 0 dom, 1 lun, ...
  if (dow !== 1) hotSaleStart.setDate(hotSaleStart.getDate() + ((1 - dow + 7) % 7));
  movable.push({
    date: fmt(hotSaleStart),
    label: "Hot Sale (inicio)",
    emoji: "🔥",
    importance: "alta",
    kind: "comercial",
  });

  const all = [...fixed, ...movable];
  all.sort((a, b) => a.date.localeCompare(b.date));
  return all;
}

/**
 * Helper: indexa las fechas por YYYY-MM-DD para lookup O(1).
 * Devuelve un Map<dateKey, CommercialDate>.
 */
export function commercialDatesIndex(
  year: number,
): Map<string, CommercialDate> {
  const m = new Map<string, CommercialDate>();
  for (const d of commercialDatesForYear(year)) {
    m.set(d.date, d);
  }
  return m;
}
