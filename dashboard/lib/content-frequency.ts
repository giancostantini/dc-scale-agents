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
 * Colores oficiales por red social. Los usamos consistentemente en:
 *  - chips de posteo en el calendario
 *  - chips ghost de sugerencia
 *  - leyenda y barras del PDF
 *  - modal de frecuencia
 *
 * Cada red tiene un color "fuerte" identificable a primera vista:
 *  - Instagram: rosa/magenta (palette del gradient oficial)
 *  - TikTok: cyan (Tiffany blue del logo)
 *  - LinkedIn: azul corporativo
 *  - Facebook: azul Meta
 *  - YouTube: rojo
 */
export const NETWORK_COLORS: Record<
  "ig" | "tt" | "in" | "fb" | "yt",
  { solid: string; soft: string; onSolid: string }
> = {
  ig: { solid: "#E1306C", soft: "rgba(225,48,108,0.10)", onSolid: "#FFFFFF" },
  tt: { solid: "#111111", soft: "rgba(37,244,238,0.10)", onSolid: "#25F4EE" },
  in: { solid: "#0A66C2", soft: "rgba(10,102,194,0.10)", onSolid: "#FFFFFF" },
  fb: { solid: "#1877F2", soft: "rgba(24,119,242,0.10)", onSolid: "#FFFFFF" },
  yt: { solid: "#FF0000", soft: "rgba(255,0,0,0.08)",   onSolid: "#FFFFFF" },
};

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
  { key: "ig_feed",  network: "ig", networkLabel: "Instagram", format: "feed",  formatLabel: "Feed",   shortCode: "IG·F", color: NETWORK_COLORS.ig.solid },
  { key: "ig_story", network: "ig", networkLabel: "Instagram", format: "story", formatLabel: "Story",  shortCode: "IG·S", color: NETWORK_COLORS.ig.solid },
  { key: "ig_reel",  network: "ig", networkLabel: "Instagram", format: "reel",  formatLabel: "Reel",   shortCode: "IG·R", color: NETWORK_COLORS.ig.solid },
  // TikTok
  { key: "tt_video", network: "tt", networkLabel: "TikTok",    format: "video", formatLabel: "Video",  shortCode: "TT·V", color: NETWORK_COLORS.tt.solid },
  { key: "tt_story", network: "tt", networkLabel: "TikTok",    format: "story", formatLabel: "Story",  shortCode: "TT·S", color: NETWORK_COLORS.tt.solid },
  // LinkedIn
  { key: "in_feed",  network: "in", networkLabel: "LinkedIn",  format: "feed",  formatLabel: "Post",   shortCode: "IN·P", color: NETWORK_COLORS.in.solid },
  // Facebook
  { key: "fb_feed",  network: "fb", networkLabel: "Facebook",  format: "feed",  formatLabel: "Post",   shortCode: "FB·P", color: NETWORK_COLORS.fb.solid },
  { key: "fb_story", network: "fb", networkLabel: "Facebook",  format: "story", formatLabel: "Story",  shortCode: "FB·S", color: NETWORK_COLORS.fb.solid },
  { key: "fb_reel",  network: "fb", networkLabel: "Facebook",  format: "reel",  formatLabel: "Reel",   shortCode: "FB·R", color: NETWORK_COLORS.fb.solid },
  // YouTube
  { key: "yt_video", network: "yt", networkLabel: "YouTube",   format: "video", formatLabel: "Video",  shortCode: "YT·V", color: NETWORK_COLORS.yt.solid },
  { key: "yt_short", network: "yt", networkLabel: "YouTube",   format: "short", formatLabel: "Short",  shortCode: "YT·S", color: NETWORK_COLORS.yt.solid },
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

/**
 * Tipo de contenido — valor, oferta o engagement.
 * - valor: educativo / informativo / expertise.
 * - oferta: comercial / promo / CTA directo.
 * - engagement: conversacional / comunidad / behind-the-scenes.
 */
export type ContentType = "valor" | "oferta" | "engagement";

export const CONTENT_TYPE_META: Record<
  ContentType,
  { label: string; short: string; color: string }
> = {
  valor:      { label: "Valor",      short: "V", color: "#2f7d4f" },
  oferta:     { label: "Oferta",     short: "O", color: "#b04b3a" },
  engagement: { label: "Engagement", short: "E", color: "#9b8259" },
};

/**
 * Dada una distribución porcentual (valor/oferta/engagement) y la
 * lista de días sugeridos para una red en el mes, devuelve un mapa
 * (índice ordinal del día sugerido → ContentType) que asigna a cada
 * posteo el tipo correspondiente.
 *
 * La asignación es determinística (mismo input → mismo output) y
 * distribuida — usa un "spread" round-robin ponderado por % para
 * que los tipos queden intercalados, no agrupados en bloques.
 *
 * Ej: mix={valor:60, oferta:25, engagement:15}, slots=10 →
 *     [V,V,O,V,E,V,O,V,V,O] (6 V, 3 O, 1 E aprox).
 */
export function distributeContentTypes(
  mix: { valor?: number; oferta?: number; engagement?: number } | undefined | null,
  slotCount: number,
): ContentType[] {
  if (slotCount <= 0) return [];
  const v = mix?.valor ?? 0;
  const o = mix?.oferta ?? 0;
  const e = mix?.engagement ?? 0;
  const total = v + o + e;
  // Sin mix configurado → todos asumen "valor" como default neutro
  if (total <= 0) return Array.from({ length: slotCount }, () => "valor");

  // Distribución por largest-remainder: cuántos slots de cada tipo
  const vCount = Math.floor((v / total) * slotCount);
  const oCount = Math.floor((o / total) * slotCount);
  const eCount = Math.floor((e / total) * slotCount);
  let remainder = slotCount - vCount - oCount - eCount;
  // Reparto el resto al de mayor remainder fraccional
  const remaindersRaw: [ContentType, number][] = [
    ["valor",       ((v / total) * slotCount) - vCount],
    ["oferta",      ((o / total) * slotCount) - oCount],
    ["engagement",  ((e / total) * slotCount) - eCount],
  ];
  const remainders: [ContentType, number][] = remaindersRaw.sort(
    (a, b) => b[1] - a[1],
  );
  const counts: Record<ContentType, number> = {
    valor: vCount,
    oferta: oCount,
    engagement: eCount,
  };
  let i = 0;
  while (remainder > 0) {
    counts[remainders[i % 3][0]] += 1;
    remainder -= 1;
    i += 1;
  }

  // Spread: intercalo round-robin proporcional para no agrupar todo
  // junto. Algoritmo Bresenham-like: avanza el "balance" de cada tipo.
  const out: ContentType[] = [];
  const balances: Record<ContentType, number> = {
    valor: 0,
    oferta: 0,
    engagement: 0,
  };
  for (let s = 0; s < slotCount; s++) {
    // Sumamos la fracción "que toca" en este slot a cada tipo
    balances.valor      += counts.valor / slotCount;
    balances.oferta     += counts.oferta / slotCount;
    balances.engagement += counts.engagement / slotCount;
    // Elegimos el tipo con mayor balance que todavía tenga cupo
    let pick: ContentType = "valor";
    let best = -Infinity;
    for (const t of ["valor", "oferta", "engagement"] as ContentType[]) {
      if (counts[t] <= 0) continue;
      if (balances[t] > best) {
        best = balances[t];
        pick = t;
      }
    }
    counts[pick] -= 1;
    balances[pick] -= 1;
    out.push(pick);
  }
  return out;
}
