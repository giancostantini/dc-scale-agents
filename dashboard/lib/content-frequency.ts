/**
 * Distribución de días sugeridos según la frecuencia semanal de
 * publicación.
 *
 * Convención de días: 0=Lun, 1=Mar, 2=Mié, 3=Jue, 4=Vie, 5=Sáb, 6=Dom
 * (Lun-first, igual que el calendario del planificador).
 *
 * Estrategia: spread "natural" — distribuir uniforme respetando que
 * los días "más fuertes" para engagement son entre semana (Lun-Vie),
 * y Sáb-Dom solo entran cuando la frecuencia es alta.
 *
 * - 1/sem: Mié
 * - 2/sem: Mar, Jue
 * - 3/sem: Lun, Mié, Vie
 * - 4/sem: Lun, Mar, Jue, Vie
 * - 5/sem: Lun-Vie
 * - 6/sem: Lun-Sáb
 * - 7/sem: Lun-Dom
 */
export function suggestedWeekdays(perWeek: number): Set<number> {
  const map: Record<number, number[]> = {
    1: [2],                     // Mié
    2: [1, 3],                  // Mar, Jue
    3: [0, 2, 4],               // Lun, Mié, Vie
    4: [0, 1, 3, 4],            // Lun, Mar, Jue, Vie
    5: [0, 1, 2, 3, 4],         // Lun-Vie
    6: [0, 1, 2, 3, 4, 5],      // Lun-Sáb
    7: [0, 1, 2, 3, 4, 5, 6],   // Lun-Dom
  };
  return new Set(map[perWeek] ?? []);
}

/**
 * Convierte una fecha JS a su día de la semana en convención
 * Lun=0..Dom=6.
 */
export function weekdayLunFirst(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/**
 * Definición canónica de slots (red × formato) que se pueden configurar
 * en el modal de Frecuencia. El orden de este array determina el orden
 * de display tanto en el modal como en los chips ghost del calendario.
 */
export const CONTENT_SLOTS: {
  key: string;
  network: "ig" | "tt" | "in" | "fb" | "yt";
  networkLabel: string;
  format: "feed" | "story" | "reel" | "video" | "short";
  formatLabel: string;
  /** Sigla corta de 2-3 chars para el chip ghost en el calendario. */
  shortCode: string;
  color: string;
}[] = [
  // Instagram
  { key: "ig_feed",  network: "ig", networkLabel: "Instagram", format: "feed",  formatLabel: "Feed",   shortCode: "IG·F", color: "var(--deep-green)" },
  { key: "ig_story", network: "ig", networkLabel: "Instagram", format: "story", formatLabel: "Story",  shortCode: "IG·S", color: "var(--deep-green)" },
  { key: "ig_reel",  network: "ig", networkLabel: "Instagram", format: "reel",  formatLabel: "Reel",   shortCode: "IG·R", color: "var(--deep-green)" },
  // TikTok
  { key: "tt_video", network: "tt", networkLabel: "TikTok",    format: "video", formatLabel: "Video",  shortCode: "TT·V", color: "var(--sand-dark)" },
  { key: "tt_story", network: "tt", networkLabel: "TikTok",    format: "story", formatLabel: "Story",  shortCode: "TT·S", color: "var(--sand-dark)" },
  // LinkedIn
  { key: "in_feed",  network: "in", networkLabel: "LinkedIn",  format: "feed",  formatLabel: "Post",   shortCode: "IN·P", color: "var(--forest-2, #2d5036)" },
  // Facebook
  { key: "fb_feed",  network: "fb", networkLabel: "Facebook",  format: "feed",  formatLabel: "Post",   shortCode: "FB·P", color: "var(--forest, #1f3a26)" },
  { key: "fb_story", network: "fb", networkLabel: "Facebook",  format: "story", formatLabel: "Story",  shortCode: "FB·S", color: "var(--forest, #1f3a26)" },
  { key: "fb_reel",  network: "fb", networkLabel: "Facebook",  format: "reel",  formatLabel: "Reel",   shortCode: "FB·R", color: "var(--forest, #1f3a26)" },
  // YouTube
  { key: "yt_video", network: "yt", networkLabel: "YouTube",   format: "video", formatLabel: "Video",  shortCode: "YT·V", color: "#a02020" },
  { key: "yt_short", network: "yt", networkLabel: "YouTube",   format: "short", formatLabel: "Short",  shortCode: "YT·S", color: "#a02020" },
];

/**
 * Normaliza la frecuencia de un cliente: convierte las keys legacy
 * (ig, tt, in, fb) a sus equivalentes con sufijo de formato (_feed).
 * Devuelve un Record<string, number> listo para iterar.
 */
export function normalizeFrequency(
  freq: Record<string, number | undefined> | null | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!freq) return out;
  for (const [k, v] of Object.entries(freq)) {
    if (!v || v <= 0) continue;
    // Legacy: ig → ig_feed, tt → tt_video, in → in_feed, fb → fb_feed
    const legacyMap: Record<string, string> = {
      ig: "ig_feed",
      tt: "tt_video",
      in: "in_feed",
      fb: "fb_feed",
    };
    const canonical = legacyMap[k] ?? k;
    out[canonical] = (out[canonical] ?? 0) + v;
  }
  return out;
}
