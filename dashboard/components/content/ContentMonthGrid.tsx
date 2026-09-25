"use client";

/**
 * ContentMonthGrid — la grilla mensual del Calendario de contenido
 * (migración 102), compartida entre el equipo (/cliente/[id]/planificador)
 * y el portal del cliente (/portal/agenda), para que los dos vean el mes
 * igual: chips por pieza (color = red; punteado = pendiente, relleno =
 * preparado, ✓ = subido), badge de tipo, fechas comerciales y bandas de
 * eventos multi-día.
 *
 * No carga datos ni edita: recibe las piezas y avisa los clicks. Quien lo
 * usa decide qué piezas pasar (el portal no pasa las pendientes).
 */

import { useMemo } from "react";
import {
  CONTENT_TYPE_META,
  NETWORK_COLORS,
  type ContentType,
} from "@/lib/content-frequency";
import {
  PIECE_STATE_META,
  formatWord,
  isOverdue,
  pieceState,
  pieceTitle,
} from "@/lib/content-plan";
import { networksOf } from "@/lib/content-labels";
import { commercialDatesIndex } from "@/lib/commercial-dates";
import type { CalEvent, ContentNetwork, ContentPost } from "@/lib/types";

export const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export const NETWORK_SHORT: Record<ContentNetwork, string> = {
  ig: "IG",
  tt: "TT",
  in: "IN",
  fb: "FB",
};
export const NETWORK_ORDER: ContentNetwork[] = ["ig", "tt", "in", "fb"];

/** Colores para tipos de evento del calendario (multi-día). */
export const EVENT_TYPE_COLOR: Record<string, string> = {
  reunion: "#5A6A5E",
  cobro: "#2f7d4f",
  reporte: "#1f3a26",
  dev: "#9b8259",
  contenido: "#0A1A0C",
  pauta: "#b04b3a",
};
export const EVENT_TYPE_LABEL: Record<string, string> = {
  reunion: "Reunión",
  cobro: "Cobro",
  reporte: "Reporte",
  dev: "Dev",
  contenido: "Contenido",
  pauta: "Pauta",
};

export const OVERDUE_COLOR = "var(--red-warn)";

export function mainNetwork(post: ContentPost): ContentNetwork {
  return networksOf(post)[0] ?? post.network;
}

export function sortPieces(a: ContentPost, b: ContentPost): number {
  const na = NETWORK_ORDER.indexOf(mainNetwork(a));
  const nb = NETWORK_ORDER.indexOf(mainNetwork(b));
  if (na !== nb) return na - nb;
  return a.format.localeCompare(b.format);
}

export function TypeBadge({ type }: { type: ContentType }) {
  const meta = CONTENT_TYPE_META[type];
  return (
    <span
      title={meta.label}
      style={{
        width: 13,
        height: 13,
        flexShrink: 0,
        background: meta.color,
        color: "#fff",
        fontSize: 8,
        fontWeight: 700,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 3,
      }}
    >
      {meta.short}
    </span>
  );
}

export function LegendTitle({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 9,
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        color: "var(--sand-dark)",
        fontWeight: 700,
      }}
    >
      {children}
    </span>
  );
}

export function StatePill({
  state,
  overdue,
}: {
  state: "pendiente" | "preparado" | "subido";
  overdue: boolean;
}) {
  const meta = PIECE_STATE_META[state];
  const color = overdue ? OVERDUE_COLOR : meta.color;
  return (
    <span
      style={{
        flexShrink: 0,
        padding: "3px 9px",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color,
        border: `1px solid ${color}`,
        borderRadius: "var(--r-pill)",
        whiteSpace: "nowrap",
      }}
    >
      {state === "subido" ? "✓ " : ""}
      {meta.label}
      {overdue ? " · atrasado" : ""}
    </span>
  );
}

/**
 * Chip de una pieza en la celda del calendario. Color = red. Estado:
 * pendiente = borde punteado · preparado = relleno suave · subido =
 * relleno sólido con ✓ · atrasado = borde rojo (si markOverdue).
 */
export function PieceChip({
  post,
  todayIso,
  onOpen,
  markOverdue = true,
}: {
  post: ContentPost;
  todayIso: string;
  onOpen: () => void;
  markOverdue?: boolean;
}) {
  const net = mainNetwork(post);
  const colors = NETWORK_COLORS[net];
  const state = pieceState(post);
  const overdue = markOverdue && isOverdue(post, todayIso);
  const border = overdue
    ? `1px solid ${OVERDUE_COLOR}`
    : state === "pendiente"
      ? `1px dashed ${colors.solid}`
      : `1px solid ${colors.solid}`;
  const background =
    state === "subido" ? colors.solid : state === "preparado" ? colors.soft : "var(--white)";
  const color = state === "subido" ? colors.onSolid : "var(--deep-green)";
  return (
    <button
      type="button"
      onClick={(ev) => {
        // No abrir también el modal del día (la celda padre).
        ev.stopPropagation();
        onOpen();
      }}
      title={`${pieceTitle(post)} · ${PIECE_STATE_META[state].label}${overdue ? " · atrasado" : ""}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        width: "100%",
        marginTop: 4,
        padding: "2px 5px",
        fontSize: 10,
        fontFamily: "inherit",
        textAlign: "left",
        background,
        color,
        border,
        borderRadius: 3,
        cursor: "pointer",
        minWidth: 0,
      }}
    >
      <span style={{ fontWeight: 700, flexShrink: 0 }}>
        {state === "subido" ? "✓" : NETWORK_SHORT[net]}
      </span>
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, minWidth: 0 }}>
        {state === "subido" ? `${NETWORK_SHORT[net]} ` : ""}
        {formatWord(net, post.format)}
      </span>
      {post.contentType && <TypeBadge type={post.contentType} />}
    </button>
  );
}

interface GridProps {
  year: number;
  /** Mes 0-based. */
  month: number;
  /** Piezas a mostrar (se filtran al mes acá). */
  posts: ContentPost[];
  /** Eventos del cliente para las bandas multi-día. Opcional. */
  events?: CalEvent[];
  todayIso: string;
  /** Borde rojo en lo atrasado. El portal lo apaga. */
  markOverdue?: boolean;
  onOpenPiece: (post: ContentPost) => void;
  /** Click en la celda del día (el equipo abre el modal del día). */
  onOpenDay?: (iso: string) => void;
}

export default function ContentMonthGrid({
  year,
  month,
  posts,
  events = [],
  todayIso,
  markOverdue = true,
  onOpenPiece,
  onOpenDay,
}: GridProps) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const lastDayIso = `${monthKey}-${String(daysInMonth).padStart(2, "0")}`;
  const dayKey = (d: number) => `${monthKey}-${String(d).padStart(2, "0")}`;

  const monthPosts = useMemo(
    () => posts.filter((p) => p.date.startsWith(`${monthKey}-`)),
    [posts, monthKey],
  );

  // Fechas comerciales del año visible (lookup O(1) por día).
  const commercialIdx = useMemo(() => commercialDatesIndex(year), [year]);

  /** Eventos visibles en este mes, sin los auto-generados por
   *  seed-from-strategy (marcados "[Auto-estrategia]" en notes). */
  const visibleEvents = useMemo(() => {
    const startOfMonthIso = `${monthKey}-01`;
    const AUTO_MARKER = "[Auto-estrategia]";
    return events.filter((ev) => {
      const evEnd = ev.end_date ?? ev.date;
      if (!(ev.date <= lastDayIso && evEnd >= startOfMonthIso)) return false;
      if ((ev.notes ?? "").startsWith(AUTO_MARKER)) return false;
      return true;
    });
  }, [events, monthKey, lastDayIso]);

  return (
    <>
      {/* Bandas de eventos multi-día arriba del calendario. */}
      {visibleEvents.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            padding: "8px 0 12px",
            borderBottom: "1px solid rgba(10,26,12,0.06)",
            marginBottom: 8,
          }}
        >
          <LegendTitle>Eventos y producciones del mes</LegendTitle>
          {visibleEvents.map((ev) => {
            const endIso = ev.end_date ?? ev.date;
            const startD = ev.date.startsWith(`${monthKey}-`) ? Number(ev.date.slice(8, 10)) : 1;
            const endD = endIso.startsWith(`${monthKey}-`) ? Number(endIso.slice(8, 10)) : daysInMonth;
            const days = endD - startD + 1;
            const color = EVENT_TYPE_COLOR[ev.type] ?? EVENT_TYPE_COLOR.contenido;
            return (
              <div
                key={ev.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 11,
                  background: `${color}14`,
                  padding: "4px 8px",
                  borderLeft: `3px solid ${color}`,
                }}
              >
                <span
                  style={{
                    fontSize: 8.5,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color,
                    fontWeight: 700,
                    minWidth: 56,
                  }}
                >
                  {EVENT_TYPE_LABEL[ev.type] ?? ev.type}
                </span>
                <span style={{ fontWeight: 600 }}>{ev.title}</span>
                <span style={{ color: "var(--text-muted)" }}>
                  {ev.end_date
                    ? `${ev.date} → ${ev.end_date} (${days} día${days === 1 ? "" : "s"})`
                    : ev.date}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 560 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, marginBottom: 1 }}>
            {WEEKDAYS.map((d) => (
              <div key={d} style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--sand-dark)", textAlign: "center", padding: "10px 0", fontWeight: 500 }}>{d}</div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, background: "rgba(10,26,12,0.08)", border: "1px solid rgba(10,26,12,0.08)" }}>
            {Array.from({ length: startOffset }).map((_, i) => (
              <div key={`m${i}`} style={{ background: "var(--ivory)", minHeight: 96 }} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const d = i + 1;
              const key = dayKey(d);
              const dayPosts = monthPosts.filter((p) => p.date === key).sort(sortPieces);
              const isToday = key === todayIso;
              const commercial = commercialIdx.get(key);
              const dayEvents = visibleEvents.filter(
                (ev) => ev.date <= key && (ev.end_date ?? ev.date) >= key,
              );

              return (
                <div
                  key={d}
                  onClick={onOpenDay ? () => onOpenDay(key) : undefined}
                  style={{
                    background: isToday ? "var(--off-white)" : "var(--white)",
                    minHeight: 96,
                    padding: "6px 6px 12px",
                    cursor: onOpenDay ? "pointer" : "default",
                    position: "relative",
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 4,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: isToday ? 700 : 500,
                        color: isToday ? "var(--sand-dark)" : "var(--deep-green)",
                      }}
                    >
                      {d}
                    </div>
                    {commercial && (
                      <div
                        title={commercial.label}
                        style={{
                          fontSize: 9,
                          padding: "1px 5px",
                          background:
                            commercial.importance === "alta"
                              ? "rgba(196, 168, 130, 0.25)"
                              : "rgba(196, 168, 130, 0.10)",
                          color: "var(--sand-dark)",
                          fontWeight: 600,
                          letterSpacing: "0.04em",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          maxWidth: "100%",
                          borderRadius: 2,
                        }}
                      >
                        {commercial.emoji} {commercial.label.length > 12
                          ? commercial.label.slice(0, 11) + "…"
                          : commercial.label}
                      </div>
                    )}
                  </div>

                  {(onOpenDay ? dayPosts.slice(0, 3) : dayPosts).map((p) => (
                    <PieceChip
                      key={p.id}
                      post={p}
                      todayIso={todayIso}
                      markOverdue={markOverdue}
                      onOpen={() => onOpenPiece(p)}
                    />
                  ))}
                  {onOpenDay && dayPosts.length > 3 && (
                    <span style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2, display: "block" }}>
                      +{dayPosts.length - 3} más
                    </span>
                  )}

                  {/* Pie de celda: bandas de eventos multi-día que la cubren */}
                  {dayEvents.length > 0 && (
                    <div
                      style={{
                        position: "absolute",
                        left: 4,
                        right: 4,
                        bottom: 4,
                        display: "flex",
                        flexDirection: "column",
                        gap: 1,
                      }}
                    >
                      {dayEvents.slice(0, 2).map((ev) => {
                        const color = EVENT_TYPE_COLOR[ev.type] ?? EVENT_TYPE_COLOR.contenido;
                        const isStart = ev.date === key;
                        const isEnd = (ev.end_date ?? ev.date) === key;
                        return (
                          <div
                            key={ev.id}
                            style={{
                              height: 4,
                              background: color,
                              borderTopLeftRadius: isStart ? 2 : 0,
                              borderBottomLeftRadius: isStart ? 2 : 0,
                              borderTopRightRadius: isEnd ? 2 : 0,
                              borderBottomRightRadius: isEnd ? 2 : 0,
                            }}
                            title={`${EVENT_TYPE_LABEL[ev.type] ?? ev.type}: ${ev.title}`}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
