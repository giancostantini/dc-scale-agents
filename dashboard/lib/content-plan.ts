/**
 * content-plan — el "asistente creativo" del calendario.
 *
 * Carga en qué día hay contenido, en qué red, de qué formato y con qué
 * intención (valor / oferta / engagement), a partir de la frecuencia y
 * el mix del cliente (clients.content_frequency / content_mix). NO
 * escribe texto: la descripción la pone la persona que prepara la
 * pieza. Es determinístico — mismo input, mismo plan — así que no hace
 * falta un LLM para repartir "3 posteos por semana, 60/25/15".
 *
 * Todo acá es puro (sin Supabase ni React) para poder probarlo aislado.
 * Los estados de una pieza están documentados en ContentStatus
 * (lib/types.ts) y en la migración 102.
 */

import type {
  ContentFormat,
  ContentFrequency,
  ContentMix,
  ContentNetwork,
  ContentPost,
} from "./types";
import {
  CONTENT_SLOTS,
  CONTENT_TYPE_META,
  distributeContentTypes,
  normalizeFrequency,
  suggestedWeekdays,
  weekdayLunFirst,
  type ContentType,
} from "./content-frequency";
import { NETWORK_LABEL, isoLocalDate, networksOf } from "./content-labels";
import { commercialDatesForYear } from "./commercial-dates";

// ==================== SLOTS ↔ PIEZAS ====================

/**
 * Slot de frecuencia (red × formato) → cómo se guarda la pieza en
 * content_posts. null = el slot no se puede guardar: YouTube no entra
 * en content_posts.network (CHECK ig/tt/in/fb).
 */
export function slotToPiece(
  slotKey: string,
): { network: ContentNetwork; format: ContentFormat } | null {
  const slot = CONTENT_SLOTS.find((s) => s.key === slotKey);
  if (!slot || slot.network === "yt") return null;
  const network = slot.network as ContentNetwork;
  switch (slot.format) {
    case "feed":
      return { network, format: "post" };
    case "story":
      return { network, format: "story" };
    case "reel":
      return { network, format: "reel" };
    // El video de TikTok es vertical: se guarda como reel.
    case "video":
      return { network, format: "reel" };
    default:
      return null;
  }
}

/** Slot que cubre una pieza en UNA red. Un carrusel cubre el slot de
 *  posteo; en TikTok todo lo que no es historia es video. UGC y
 *  anuncios no cubren ningún slot de frecuencia. */
function slotKeyFor(network: ContentNetwork, format: ContentFormat): string | null {
  if (format === "ugc" || format === "anuncio") return null;
  if (format === "story") return `${network}_story`;
  if (network === "tt") return "tt_video";
  if (format === "reel") return `${network}_reel`;
  return `${network}_feed`;
}

/**
 * Inversa de slotToPiece: qué slots cubre una pieza guardada, uno por
 * cada red en la que sale (multi-red, migración 065).
 */
export function slotKeysOf(
  post: Pick<ContentPost, "network" | "networks" | "format">,
): string[] {
  const out: string[] = [];
  for (const n of networksOf(post)) {
    const key = slotKeyFor(n, post.format);
    if (key) out.push(key);
  }
  return out;
}

/**
 * Slots con frecuencia > 0 que el asistente puede cargar (YouTube no
 * entra en content_posts). Acepta las keys legacy (ig/tt/in/fb).
 */
export function plannableSlots(
  frequency: ContentFrequency | null | undefined,
): { slot: (typeof CONTENT_SLOTS)[number]; perWeek: number }[] {
  const norm = normalizeFrequency(
    frequency as Record<string, number | undefined> | null | undefined,
  );
  return CONTENT_SLOTS.filter(
    (s) => (norm[s.key] ?? 0) > 0 && slotToPiece(s.key) !== null,
  ).map((s) => ({ slot: s, perWeek: norm[s.key] }));
}

// ==================== REPARTO ====================

/**
 * Cuántas piezas por día de la semana (Lun=0 … Dom=6) para una
 * frecuencia semanal. Hasta 7 usa el patrón de suggestedWeekdays;
 * arriba de 7 (ej. historias dobles) pone la base en todos los días y
 * reparte el resto con el mismo patrón: 10/sem → 2 los Lun/Mié/Vie y
 * 1 el resto.
 */
export function weekdayCounts(perWeek: number): number[] {
  const n = Math.max(0, Math.round(perWeek));
  const base = Math.floor(n / 7);
  const counts = Array.from({ length: 7 }, () => base);
  for (const d of suggestedWeekdays(n % 7)) counts[d] += 1;
  return counts;
}

/** Pieza que el asistente propone cargar. */
export interface PlannedPiece {
  /** YYYY-MM-DD (fecha local). */
  date: string;
  network: ContentNetwork;
  format: ContentFormat;
  contentType: ContentType;
}

/**
 * Plan del mes: devuelve las piezas que FALTAN cargar.
 *
 *  - Por cada slot con frecuencia arma todas las ocurrencias del mes
 *    (día × cantidad) y les asigna la intención con el mix de su red
 *    sobre el mes ENTERO — así el reparto no depende del día en que se
 *    aprieta el botón.
 *  - Solo emite fechas >= fromDate: en el mes en curso no rellena días
 *    que ya pasaron.
 *  - Descuenta lo que ya existe ese día para ese slot, en cualquier
 *    estado: correrlo dos veces no duplica, y si alguien agregó una
 *    pieza a mano el asistente no la repite.
 */
export function planMonth(opts: {
  frequency: ContentFrequency | null | undefined;
  mix: ContentMix | null | undefined;
  year: number;
  /** Mes 0-11 (convención de Date). */
  month0: number;
  /** YYYY-MM-DD: no se carga nada antes de esta fecha. */
  fromDate: string;
  /** Piezas ya guardadas del cliente (se filtran al mes acá adentro). */
  existing: Pick<ContentPost, "date" | "network" | "networks" | "format">[];
}): PlannedPiece[] {
  const freq = normalizeFrequency(
    opts.frequency as Record<string, number | undefined> | null | undefined,
  );
  const daysInMonth = new Date(opts.year, opts.month0 + 1, 0).getDate();
  const monthPrefix = `${opts.year}-${String(opts.month0 + 1).padStart(2, "0")}-`;

  // Cobertura existente: "fecha|slot" → cuántas piezas hay.
  const covered = new Map<string, number>();
  for (const p of opts.existing) {
    if (!p.date.startsWith(monthPrefix)) continue;
    for (const key of slotKeysOf(p)) {
      const k = `${p.date}|${key}`;
      covered.set(k, (covered.get(k) ?? 0) + 1);
    }
  }

  const out: PlannedPiece[] = [];
  for (const slot of CONTENT_SLOTS) {
    const perWeek = freq[slot.key] ?? 0;
    if (perWeek <= 0) continue;
    const piece = slotToPiece(slot.key);
    if (!piece) continue;

    const counts = weekdayCounts(perWeek);
    const dates: string[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const day = new Date(opts.year, opts.month0, d);
      const n = counts[weekdayLunFirst(day)];
      for (let i = 0; i < n; i++) dates.push(isoLocalDate(day));
    }
    const types = distributeContentTypes(opts.mix?.[slot.network], dates.length);

    dates.forEach((date, i) => {
      if (date < opts.fromDate) return;
      const k = `${date}|${slot.key}`;
      const have = covered.get(k) ?? 0;
      if (have > 0) {
        covered.set(k, have - 1);
        return;
      }
      out.push({
        date,
        network: piece.network,
        format: piece.format,
        contentType: types[i],
      });
    });
  }

  // ===== Fechas importantes (Día de la Madre, San Valentín, etc.) =====
  // Nos aseguramos de que las fechas comerciales de alta importancia del
  // mes tengan al menos una pieza — aunque caigan en fin de semana o en
  // un día que la frecuencia no cubriría. Si ese día ya tiene una pieza
  // (existente o recién planeada), no agregamos otra.
  const mainSlot = pickMainSlot(freq);
  if (mainSlot) {
    // Días que ya tienen alguna pieza este mes (existentes + planeadas).
    const datesWithPiece = new Set<string>();
    for (const p of opts.existing) {
      if (p.date.startsWith(monthPrefix)) datesWithPiece.add(p.date);
    }
    for (const p of out) datesWithPiece.add(p.date);

    const keyDates = commercialDatesForYear(opts.year).filter(
      (d) =>
        d.importance === "alta" &&
        d.date.startsWith(monthPrefix) &&
        d.date >= opts.fromDate &&
        !datesWithPiece.has(d.date),
    );
    for (const d of keyDates) {
      // Las fechas comerciales/estacionales son oportunidad de venta →
      // pieza de oferta; las culturales/patrias → contenido de valor.
      const contentType: ContentType =
        d.kind === "comercial" || d.kind === "estacional" ? "oferta" : "valor";
      out.push({
        date: d.date,
        network: mainSlot.network,
        format: mainSlot.format,
        contentType,
      });
      datesWithPiece.add(d.date);
    }
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Elige el slot "principal" del cliente para las piezas de fechas
 * importantes: el plannable con mayor frecuencia semanal (desempata por
 * el orden de CONTENT_SLOTS). null si el cliente no tiene ningún slot
 * cargable.
 */
function pickMainSlot(
  freq: Record<string, number>,
): { network: ContentNetwork; format: ContentFormat } | null {
  let bestKey: string | null = null;
  let bestPerWeek = 0;
  for (const slot of CONTENT_SLOTS) {
    const perWeek = freq[slot.key] ?? 0;
    if (perWeek <= 0) continue;
    if (slotToPiece(slot.key) === null) continue; // YouTube no entra
    if (perWeek > bestPerWeek) {
      bestPerWeek = perWeek;
      bestKey = slot.key;
    }
  }
  return bestKey ? slotToPiece(bestKey) : null;
}

// ==================== ESTADOS Y TEXTOS ====================

/** Estado de una pieza tal como lo ve el equipo en el calendario. */
export type PieceState = "pendiente" | "preparado" | "subido";

/** planned y draft (piezas IA viejas) son pendientes: falta prepararlas. */
export function pieceState(post: Pick<ContentPost, "status">): PieceState {
  if (post.status === "published") return "subido";
  if (post.status === "scheduled") return "preparado";
  return "pendiente";
}

/** Atrasada = su día ya pasó y no se subió. `today` en YYYY-MM-DD local. */
export function isOverdue(
  post: Pick<ContentPost, "status" | "date">,
  today: string,
): boolean {
  return post.status !== "published" && post.date < today;
}

export const PIECE_STATE_META: Record<PieceState, { label: string; color: string }> = {
  pendiente: { label: "Pendiente", color: "#9B8259" },
  preparado: { label: "Preparado", color: "#2f7d4f" },
  subido: { label: "Subido", color: "#0A1A0C" },
};

const FORMAT_WORD: Record<ContentFormat, string> = {
  post: "Posteo",
  carrusel: "Carrusel",
  story: "Historia",
  reel: "Reel",
  ugc: "UGC",
  anuncio: "Anuncio",
};

/** El formato como lo dice el equipo. En TikTok un reel es "Video". */
export function formatWord(network: ContentNetwork, format: ContentFormat): string {
  if (network === "tt" && format === "reel") return "Video";
  return FORMAT_WORD[format] ?? format;
}

type TitleInput = Pick<ContentPost, "network" | "networks" | "format" | "contentType">;

/** "Posteo de oferta en Instagram" — lo que dicen el calendario y el
 *  aviso del dashboard ("Hoy toca: …"). */
export function pieceTitle(post: TitleInput): string {
  const nets = networksOf(post);
  const fmt = formatWord(nets[0] ?? post.network, post.format);
  const type = post.contentType
    ? ` de ${CONTENT_TYPE_META[post.contentType].label.toLowerCase()}`
    : "";
  const where = nets.map((n) => NETWORK_LABEL[n] ?? n).join(" + ");
  return `${fmt}${type} en ${where}`;
}

/** Versión corta para los chips del calendario: "Posteo · Oferta". */
export function pieceShortLabel(post: TitleInput): string {
  const nets = networksOf(post);
  const fmt = formatWord(nets[0] ?? post.network, post.format);
  return post.contentType
    ? `${fmt} · ${CONTENT_TYPE_META[post.contentType].label}`
    : fmt;
}

/** Suma días a una fecha YYYY-MM-DD en calendario local. */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return isoLocalDate(new Date(y, m - 1, d + days));
}

/** Conteos del mes para el resumen del calendario. */
export function monthSummary(
  posts: Pick<ContentPost, "status" | "date">[],
  today: string,
): { total: number; pendientes: number; preparados: number; subidos: number; atrasados: number } {
  const out = { total: 0, pendientes: 0, preparados: 0, subidos: 0, atrasados: 0 };
  for (const p of posts) {
    out.total++;
    const st = pieceState(p);
    if (st === "pendiente") out.pendientes++;
    else if (st === "preparado") out.preparados++;
    else out.subidos++;
    if (isOverdue(p, today)) out.atrasados++;
  }
  return out;
}
