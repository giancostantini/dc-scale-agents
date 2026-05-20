"use client";

/**
 * RoadmapPdf — PDF del roadmap del cliente con N meses consecutivos.
 *
 * Cada mes se renderiza en su propia página A4 horizontal con:
 *   - Header: nombre del cliente + mes/año
 *   - Grilla de calendario con días numerados
 *   - Posts reales (chip sólido con red+brief+hora)
 *   - Slots sugeridos (chip ghost con sigla IG·F, IG·S, etc)
 *
 * Uso:
 *   const { pdf } = await import("@react-pdf/renderer");
 *   const blob = await pdf(<RoadmapPdf ...props />).toBlob();
 */

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import type { ContentPost } from "@/lib/types";
import {
  CONTENT_SLOTS,
  normalizeFrequency,
  suggestedWeekdays,
  weekdayLunFirst,
} from "@/lib/content-frequency";

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
  ig: C.deepGreen,
  tt: C.sandDark,
  in: "#2d5036",
  fb: "#1f3a26",
  yt: "#a02020",
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 1,
    borderBottomColor: C.hairline,
    paddingBottom: 10,
    marginBottom: 14,
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
    marginBottom: 8,
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
    minHeight: 80,
  },
  cell: {
    flex: 1,
    borderRightWidth: 0.4,
    borderBottomWidth: 0.4,
    borderColor: C.hairline,
    padding: 4,
    overflow: "hidden",
  },
  cellEmpty: {
    flex: 1,
    borderRightWidth: 0.4,
    borderBottomWidth: 0.4,
    borderColor: C.hairline,
    backgroundColor: C.ivory,
  },
  cellDayNum: {
    fontSize: 8,
    fontFamily: FONT_BOLD,
    marginBottom: 3,
  },
  postChip: {
    fontSize: 6,
    padding: "1 3",
    marginBottom: 2,
    color: "#FFFFFF",
    fontFamily: FONT_BOLD,
  },
  ghostChip: {
    fontSize: 6,
    padding: "1 3",
    marginRight: 2,
    marginBottom: 2,
    borderWidth: 0.5,
    fontFamily: FONT_BOLD,
  },
  ghostRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 2,
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
});

export interface RoadmapPdfProps {
  clientName: string;
  /** Posts del cliente cubriendo todo el rango. */
  posts: ContentPost[];
  /** Frecuencia configurada del cliente (puede tener keys legacy). */
  contentFrequency: Record<string, number | undefined> | undefined;
  /** Array de meses a renderizar, en orden cronológico.
   *  Cada uno: { year, month0 } donde month0 es 0-indexed (0=Ene). */
  months: { year: number; month0: number }[];
}

export default function RoadmapPdf({
  clientName,
  posts,
  contentFrequency,
  months,
}: RoadmapPdfProps) {
  // Normalizar frecuencia legacy → canónica
  const normalized = normalizeFrequency(contentFrequency);

  // Map slot → set de weekdays sugeridos (mismo cálculo que en la UI)
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
      {months.map(({ year, month0 }, monthIdx) => {
        const monthLabel = `${MONTHS_ES[month0]} ${year}`;
        const firstOfMonth = new Date(year, month0, 1);
        const daysInMonth = new Date(year, month0 + 1, 0).getDate();
        const startOffset = (firstOfMonth.getDay() + 6) % 7; // Lun-first

        // Generar la grilla de la semana (filas)
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

        return (
          <Page
            key={`${year}-${month0}`}
            size="A4"
            orientation="landscape"
            style={styles.page}
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Text style={styles.eyebrow}>
                  ROADMAP · {clientName.toUpperCase()}
                </Text>
                <Text style={styles.monthTitle}>{monthLabel}</Text>
              </View>
              <Text style={styles.headerRight}>
                Página {monthIdx + 1} de {months.length}
              </Text>
            </View>

            {/* Leyenda de slots */}
            {suggestedBySlot.size > 0 && (
              <View style={styles.legend}>
                {CONTENT_SLOTS.filter((s) =>
                  suggestedBySlot.has(s.key),
                ).map((slot) => {
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
                })}
              </View>
            )}

            {/* Header de columnas (días de la semana) */}
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

                  // Slots con post real (para skip del ghost)
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

                  return (
                    <View
                      key={dIdx}
                      style={{
                        ...styles.cell,
                        backgroundColor: isToday ? C.ivory : "#FFFFFF",
                      }}
                    >
                      <Text
                        style={{
                          ...styles.cellDayNum,
                          color: isToday ? C.sandDark : C.deepGreen,
                        }}
                      >
                        {d}
                      </Text>

                      {/* Posts reales — max 3 */}
                      {dayPosts.slice(0, 3).map((p) => (
                        <Text
                          key={p.id}
                          style={{
                            ...styles.postChip,
                            backgroundColor:
                              NETWORK_COLOR_SOLID[p.network] ?? C.deepGreen,
                          }}
                        >
                          {p.time} {p.brief.slice(0, 18)}
                        </Text>
                      ))}
                      {dayPosts.length > 3 && (
                        <Text style={{ fontSize: 6, color: C.textMuted }}>
                          +{dayPosts.length - 3} más
                        </Text>
                      )}

                      {/* Slots sugeridos (ghost) */}
                      {ghostSlots.length > 0 && (
                        <View style={styles.ghostRow}>
                          {ghostSlots.map((slot) => (
                            <Text
                              key={slot.key}
                              style={{
                                ...styles.ghostChip,
                                color:
                                  NETWORK_COLOR_SOLID[slot.network] ??
                                  C.deepGreen,
                                borderColor:
                                  NETWORK_COLOR_SOLID[slot.network] ??
                                  C.deepGreen,
                              }}
                            >
                              {slot.shortCode}
                            </Text>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            ))}

            {/* Footer */}
            <Text style={styles.footer}>
              Dearmas Costantini · Roadmap · Generado{" "}
              {today.toLocaleDateString("es-AR", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </Text>
          </Page>
        );
      })}
    </Document>
  );
}
