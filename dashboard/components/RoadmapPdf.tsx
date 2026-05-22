"use client";

/**
 * RoadmapPdf — PDF del roadmap del cliente con N meses consecutivos.
 *
 * Para cada mes hay 2 páginas:
 *   1) A4 horizontal con el calendario:
 *      - Header: cliente + mes/año
 *      - Bandas de eventos multi-día arriba
 *      - Grilla del calendario con días numerados
 *      - Flag de fechas comerciales
 *      - Posts reales (chip sólido con color de la red)
 *      - Slots sugeridos (chip ghost + tag V/O/E si hay mix)
 *   2) A4 vertical con la estrategia escrita del mes (si existe).
 *      Si no hay nota de ese mes, esa página no se incluye.
 */

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import type { CalEvent, ContentMix, ContentPost } from "@/lib/types";
import {
  CONTENT_SLOTS,
  CONTENT_TYPE_META,
  NETWORK_COLORS,
  distributeContentTypes,
  normalizeFrequency,
  suggestedWeekdays,
  weekdayLunFirst,
  type ContentType,
} from "@/lib/content-frequency";
import { commercialDatesIndex } from "@/lib/commercial-dates";

const FONT_REG = "Helvetica";
const FONT_BOLD = "Helvetica-Bold";
Font.registerHyphenationCallback((w) => [w]);

const C = {
  deepGreen: "#0A1A0C",
  sand: "#C4A882",
  sandDark: "#9B8259",
  offWhite: "#E8E4DC",
  ivory: "#F5F2EC",
  textMuted: "#5A6A5E",
  hairline: "#D6D2C8",
};

const NETWORK_COLOR_SOLID: Record<string, string> = {
  ig: NETWORK_COLORS.ig.solid,
  tt: NETWORK_COLORS.tt.solid,
  in: NETWORK_COLORS.in.solid,
  fb: NETWORK_COLORS.fb.solid,
  yt: NETWORK_COLORS.yt.solid,
};

const NETWORK_COLOR_FG: Record<string, string> = {
  ig: NETWORK_COLORS.ig.onSolid,
  tt: NETWORK_COLORS.tt.onSolid,
  in: NETWORK_COLORS.in.onSolid,
  fb: NETWORK_COLORS.fb.onSolid,
  yt: NETWORK_COLORS.yt.onSolid,
};

const EVENT_TYPE_COLOR: Record<string, string> = {
  reunion: "#5A6A5E",
  cobro: "#2f7d4f",
  reporte: "#1f3a26",
  dev: "#9b8259",
  contenido: "#0A1A0C",
  pauta: "#b04b3a",
};
const EVENT_TYPE_LABEL: Record<string, string> = {
  reunion: "Reunión",
  cobro: "Cobro",
  reporte: "Reporte",
  dev: "Dev",
  contenido: "Contenido",
  pauta: "Pauta",
};

const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const WEEKDAYS_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const styles = StyleSheet.create({
  page: {
    padding: 28,
    backgroundColor: "#FFFFFF",
    fontFamily: FONT_REG,
    color: C.deepGreen,
  },
  pageVertical: {
    padding: 56,
    backgroundColor: "#FFFFFF",
    fontFamily: FONT_REG,
    color: C.deepGreen,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 1,
    borderBottomColor: C.hairline,
    paddingBottom: 10,
    marginBottom: 10,
  },
  headerLeft: { flexDirection: "column" },
  eyebrow: {
    fontSize: 7,
    color: C.sandDark,
    letterSpacing: 2,
    fontFamily: FONT_BOLD,
    marginBottom: 4,
  },
  monthTitle: {
    fontSize: 22,
    fontFamily: FONT_BOLD,
    letterSpacing: -0.5,
  },
  headerRight: { fontSize: 9, color: C.textMuted },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 6,
    fontSize: 7,
  },
  legendChip: {
    flexDirection: "row",
    alignItems: "center",
    padding: "2 6",
    backgroundColor: C.ivory,
  },
  legendDot: { width: 6, height: 6, marginRight: 4 },
  legendText: { fontSize: 7, color: C.deepGreen },
  weekHeader: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: C.hairline,
    paddingBottom: 4,
    marginBottom: 4,
  },
  weekHeaderCell: {
    flex: 1,
    textAlign: "center",
    fontSize: 7,
    color: C.sandDark,
    fontFamily: FONT_BOLD,
    letterSpacing: 1.5,
  },
  week: {
    flexDirection: "row",
    minHeight: 70,
  },
  cell: {
    flex: 1,
    borderRightWidth: 0.4,
    borderBottomWidth: 0.4,
    borderColor: C.hairline,
    padding: 3,
    overflow: "hidden",
  },
  cellEmpty: {
    flex: 1,
    borderRightWidth: 0.4,
    borderBottomWidth: 0.4,
    borderColor: C.hairline,
    backgroundColor: C.ivory,
  },
  cellHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 3,
  },
  cellDayNum: {
    fontSize: 8,
    fontFamily: FONT_BOLD,
  },
  cellCommercial: {
    fontSize: 5.5,
    backgroundColor: "#EFE5D2",
    color: C.sandDark,
    padding: "1 2",
    fontFamily: FONT_BOLD,
    maxWidth: 70,
  },
  postChip: {
    fontSize: 6,
    padding: "1 3",
    marginTop: 2,
    fontFamily: FONT_BOLD,
  },
  ghostChip: {
    fontSize: 5.5,
    paddingHorizontal: 2,
    paddingVertical: 1,
    marginRight: 2,
    marginBottom: 2,
    borderWidth: 0.5,
    fontFamily: FONT_BOLD,
    flexDirection: "row",
    alignItems: "center",
  },
  ghostRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 2,
  },
  eventBandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    marginBottom: 2,
  },
  eventBandLabel: {
    fontSize: 6,
    fontFamily: FONT_BOLD,
    letterSpacing: 1,
    color: "#FFFFFF",
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  eventBandTitle: {
    fontSize: 7,
    fontFamily: FONT_BOLD,
  },
  eventBandRange: {
    fontSize: 6,
    color: C.textMuted,
  },
  footer: {
    position: "absolute",
    bottom: 14,
    left: 28,
    right: 28,
    fontSize: 7,
    color: C.textMuted,
    textAlign: "center",
    letterSpacing: 1,
  },
  // Página de estrategia del mes
  strategyHeader: {
    paddingBottom: 18,
    marginBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: C.hairline,
  },
  strategyEyebrow: {
    fontSize: 9,
    letterSpacing: 3,
    color: C.sandDark,
    fontFamily: FONT_BOLD,
    marginBottom: 8,
  },
  strategyTitle: {
    fontSize: 36,
    fontFamily: FONT_BOLD,
    letterSpacing: -1,
  },
  strategySubtitle: {
    fontSize: 13,
    color: C.textMuted,
    marginTop: 6,
  },
  strategyBody: {
    fontSize: 11.5,
    lineHeight: 1.6,
    color: C.deepGreen,
  },
});

export interface RoadmapPdfProps {
  clientName: string;
  posts: ContentPost[];
  events: CalEvent[];
  contentFrequency: Record<string, number | undefined> | undefined;
  contentMix: ContentMix | undefined;
  monthNotes: Record<string, string> | undefined;
  months: { year: number; month0: number }[];
}

export default function RoadmapPdf({
  clientName,
  posts,
  events,
  contentFrequency,
  contentMix,
  monthNotes,
  months,
}: RoadmapPdfProps) {
  const normalized = normalizeFrequency(contentFrequency);
  const suggestedBySlot = new Map<string, Set<number>>();
  for (const slot of CONTENT_SLOTS) {
    const perWeek = normalized[slot.key] ?? 0;
    if (perWeek > 0) {
      suggestedBySlot.set(slot.key, suggestedWeekdays(perWeek));
    }
  }

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  return (
    <Document
      title={`Roadmap · ${clientName}`}
      author="Dearmas Costantini"
      subject="Roadmap de contenido y acciones"
    >
      {months.flatMap(({ year, month0 }, monthIdx) => {
        const monthLabel = `${MONTHS_ES[month0]} ${year}`;
        const firstOfMonth = new Date(year, month0, 1);
        const daysInMonth = new Date(year, month0 + 1, 0).getDate();
        const startOffset = (firstOfMonth.getDay() + 6) % 7;
        const commercialIdx = commercialDatesIndex(year);

        // Distribuir tipos V/O/E para cada slot del mes
        const slotOrdinals = new Map<string, { day: number; key: string }[]>();
        for (let d = 1; d <= daysInMonth; d++) {
          const cellDate = new Date(year, month0, d);
          const weekday = weekdayLunFirst(cellDate);
          for (const slot of CONTENT_SLOTS) {
            const days = suggestedBySlot.get(slot.key);
            if (!days || !days.has(weekday)) continue;
            const list = slotOrdinals.get(slot.key) ?? [];
            const key = `${year}-${String(month0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            list.push({ day: d, key });
            slotOrdinals.set(slot.key, list);
          }
        }
        const typesByDayBySlot = new Map<string, Map<string, ContentType>>();
        for (const [slotKey, ordinals] of slotOrdinals.entries()) {
          const slot = CONTENT_SLOTS.find((s) => s.key === slotKey);
          if (!slot) continue;
          const networkMix = contentMix?.[slot.network];
          const types = distributeContentTypes(networkMix, ordinals.length);
          ordinals.forEach((o, i) => {
            const inner =
              typesByDayBySlot.get(o.key) ?? new Map<string, ContentType>();
            inner.set(slotKey, types[i]);
            typesByDayBySlot.set(o.key, inner);
          });
        }

        const cells: (number | null)[] = [];
        for (let i = 0; i < startOffset; i++) cells.push(null);
        for (let d = 1; d <= daysInMonth; d++) cells.push(d);
        while (cells.length % 7 !== 0) cells.push(null);
        const weeks: (number | null)[][] = [];
        for (let i = 0; i < cells.length; i += 7) {
          weeks.push(cells.slice(i, i + 7));
        }

        function dayKey(d: number) {
          return `${year}-${String(month0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        }

        const monthKey = `${year}-${String(month0 + 1).padStart(2, "0")}`;
        const monthNote = monthNotes?.[monthKey] ?? "";
        const startOfMonthIso = dayKey(1);
        const endOfMonthIso = dayKey(daysInMonth);
        const monthEvents = events.filter((ev) => {
          const evStart = ev.date;
          const evEnd = ev.end_date ?? ev.date;
          return evStart <= endOfMonthIso && evEnd >= startOfMonthIso;
        });

        const pages: React.ReactElement[] = [];

        // ===== Página 1: Calendario =====
        pages.push(
          <Page
            key={`cal-${year}-${month0}`}
            size="A4"
            orientation="landscape"
            style={styles.page}
          >
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Text style={styles.eyebrow}>
                  ROADMAP · {clientName.toUpperCase()}
                </Text>
                <Text style={styles.monthTitle}>{monthLabel}</Text>
              </View>
              <Text style={styles.headerRight}>
                Página {monthIdx * 2 + 1} de {months.length * 2}
              </Text>
            </View>

            {/* Bandas de eventos multi-día */}
            {monthEvents.length > 0 && (
              <View style={{ marginBottom: 6 }}>
                {monthEvents.slice(0, 4).map((ev) => {
                  const color =
                    EVENT_TYPE_COLOR[ev.type] ?? EVENT_TYPE_COLOR.contenido;
                  const range = ev.end_date
                    ? `${ev.date} → ${ev.end_date}`
                    : ev.date;
                  return (
                    <View
                      key={ev.id}
                      style={{
                        ...styles.eventBandRow,
                        backgroundColor: `${color}1A`,
                        borderLeftWidth: 2,
                        borderLeftColor: color,
                      }}
                    >
                      <Text
                        style={{
                          ...styles.eventBandLabel,
                          backgroundColor: color,
                        }}
                      >
                        {EVENT_TYPE_LABEL[ev.type] ?? ev.type}
                      </Text>
                      <Text style={styles.eventBandTitle}>{ev.title}</Text>
                      <Text style={styles.eventBandRange}>{range}</Text>
                    </View>
                  );
                })}
                {monthEvents.length > 4 && (
                  <Text style={{ fontSize: 6, color: C.textMuted, marginLeft: 4 }}>
                    +{monthEvents.length - 4} eventos más
                  </Text>
                )}
              </View>
            )}

            {/* Leyenda de slots */}
            {suggestedBySlot.size > 0 && (
              <View style={styles.legend}>
                {CONTENT_SLOTS.filter((s) => suggestedBySlot.has(s.key)).map(
                  (slot) => {
                    const days = suggestedBySlot.get(slot.key)!;
                    return (
                      <View key={slot.key} style={styles.legendChip}>
                        <View
                          style={{
                            ...styles.legendDot,
                            backgroundColor:
                              NETWORK_COLOR_SOLID[slot.network] ?? C.deepGreen,
                          }}
                        />
                        <Text style={styles.legendText}>
                          {slot.networkLabel} {slot.formatLabel} · {days.size}x/sem
                        </Text>
                      </View>
                    );
                  },
                )}
                {/* Tipos V/O/E */}
                {(["valor", "oferta", "engagement"] as ContentType[]).map((t) => {
                  const meta = CONTENT_TYPE_META[t];
                  return (
                    <View key={t} style={styles.legendChip}>
                      <View
                        style={{
                          ...styles.legendDot,
                          backgroundColor: meta.color,
                        }}
                      />
                      <Text style={styles.legendText}>{meta.label}</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Header de columnas */}
            <View style={styles.weekHeader}>
              {WEEKDAYS_ES.map((d) => (
                <Text key={d} style={styles.weekHeaderCell}>
                  {d}
                </Text>
              ))}
            </View>

            {/* Semanas */}
            {weeks.map((week, wIdx) => (
              <View key={wIdx} style={styles.week}>
                {week.map((d, dIdx) => {
                  if (d === null) {
                    return <View key={dIdx} style={styles.cellEmpty} />;
                  }
                  const key = dayKey(d);
                  const isToday = key === todayKey;
                  const dayPosts = posts.filter((p) => p.date === key);
                  const cellDate = new Date(year, month0, d);
                  const weekday = weekdayLunFirst(cellDate);
                  const commercial = commercialIdx.get(key);

                  const slotsWithRealPost = new Set<string>();
                  for (const p of dayPosts) {
                    let fmt: string;
                    if (p.format === "story") fmt = "story";
                    else if (p.format === "reel") fmt = "reel";
                    else if (p.network === "tt") fmt = "video";
                    else fmt = "feed";
                    slotsWithRealPost.add(`${p.network}_${fmt}`);
                  }
                  const ghostSlots = CONTENT_SLOTS.filter((slot) => {
                    const days = suggestedBySlot.get(slot.key);
                    if (!days || !days.has(weekday)) return false;
                    return !slotsWithRealPost.has(slot.key);
                  });
                  const typesForDay = typesByDayBySlot.get(key);

                  // Eventos cubriendo este día (para barra en pie)
                  const dayEvents = events.filter((ev) => {
                    const evStart = ev.date;
                    const evEnd = ev.end_date ?? ev.date;
                    return evStart <= key && evEnd >= key;
                  });

                  return (
                    <View
                      key={dIdx}
                      style={{
                        ...styles.cell,
                        backgroundColor: isToday ? C.ivory : "#FFFFFF",
                      }}
                    >
                      <View style={styles.cellHeader}>
                        <Text
                          style={{
                            ...styles.cellDayNum,
                            color: isToday ? C.sandDark : C.deepGreen,
                          }}
                        >
                          {d}
                        </Text>
                        {commercial && (
                          <Text style={styles.cellCommercial}>
                            {commercial.label.length > 10
                              ? commercial.label.slice(0, 9) + "…"
                              : commercial.label}
                          </Text>
                        )}
                      </View>

                      {/* Posts reales — max 2 */}
                      {dayPosts.slice(0, 2).map((p) => (
                        <Text
                          key={p.id}
                          style={{
                            ...styles.postChip,
                            backgroundColor:
                              NETWORK_COLOR_SOLID[p.network] ?? C.deepGreen,
                            color: NETWORK_COLOR_FG[p.network] ?? "#FFFFFF",
                          }}
                        >
                          {p.time} {p.brief.slice(0, 16)}
                        </Text>
                      ))}
                      {dayPosts.length > 2 && (
                        <Text style={{ fontSize: 6, color: C.textMuted }}>
                          +{dayPosts.length - 2} más
                        </Text>
                      )}

                      {/* Slots sugeridos (ghost) con tag V/O/E */}
                      {ghostSlots.length > 0 && (
                        <View style={styles.ghostRow}>
                          {ghostSlots.map((slot) => {
                            const type = typesForDay?.get(slot.key);
                            const typeMeta = type
                              ? CONTENT_TYPE_META[type]
                              : null;
                            const c =
                              NETWORK_COLOR_SOLID[slot.network] ?? C.deepGreen;
                            return (
                              <View
                                key={slot.key}
                                style={{
                                  ...styles.ghostChip,
                                  borderColor: c,
                                }}
                              >
                                <Text style={{ fontSize: 5.5, color: c, fontFamily: FONT_BOLD }}>
                                  {slot.shortCode}
                                </Text>
                                {typeMeta && (
                                  <Text
                                    style={{
                                      fontSize: 5,
                                      backgroundColor: typeMeta.color,
                                      color: "#FFFFFF",
                                      paddingHorizontal: 2,
                                      marginLeft: 2,
                                      fontFamily: FONT_BOLD,
                                    }}
                                  >
                                    {typeMeta.short}
                                  </Text>
                                )}
                              </View>
                            );
                          })}
                        </View>
                      )}

                      {/* Barritas de eventos multi-día */}
                      {dayEvents.length > 0 && (
                        <View
                          style={{
                            marginTop: 2,
                            flexDirection: "column",
                            gap: 1,
                          }}
                        >
                          {dayEvents.slice(0, 2).map((ev) => {
                            const c =
                              EVENT_TYPE_COLOR[ev.type] ??
                              EVENT_TYPE_COLOR.contenido;
                            return (
                              <View
                                key={ev.id}
                                style={{
                                  height: 3,
                                  backgroundColor: c,
                                }}
                              />
                            );
                          })}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            ))}

            <Text style={styles.footer}>
              Dearmas Costantini · Roadmap · Generado{" "}
              {today.toLocaleDateString("es-AR", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </Text>
          </Page>,
        );

        // ===== Página 2: Estrategia del mes =====
        // Solo si hay nota cargada — si no, saltamos para no ensuciar.
        if (monthNote && monthNote.trim()) {
          pages.push(
            <Page
              key={`str-${year}-${month0}`}
              size="A4"
              orientation="portrait"
              style={styles.pageVertical}
            >
              <View style={styles.strategyHeader}>
                <Text style={styles.strategyEyebrow}>ESTRATEGIA DEL MES</Text>
                <Text style={styles.strategyTitle}>{monthLabel}</Text>
                <Text style={styles.strategySubtitle}>
                  {clientName}
                </Text>
              </View>
              <Text style={styles.strategyBody}>{monthNote.trim()}</Text>
              <Text
                style={{
                  position: "absolute",
                  bottom: 28,
                  left: 56,
                  right: 56,
                  fontSize: 7,
                  color: C.textMuted,
                  textAlign: "center",
                  letterSpacing: 1,
                }}
              >
                Dearmas Costantini · Roadmap · Página {monthIdx * 2 + 2} de {months.length * 2}
              </Text>
            </Page>,
          );
        }

        return pages;
      })}
    </Document>
  );
}
