"use client";

/**
 * ContentCalendarView — vista calendario editorial con drag & drop.
 *
 * Layout split:
 *   · Izquierda (~70%): grid mensual con cuadrantes por fecha. Cada
 *     cuadrante muestra los posts asignados a ese día (chips
 *     compactos con código + clasificación).
 *   · Derecha (~30%): lista de "Sin asignar" — posts que están en
 *     fechas ya pasadas o que el GP quiere mover. Hoy hidratamos
 *     simplemente con los posts en status='draft' como pool de
 *     piezas no programadas todavía. El director puede arrastrar
 *     cualquier post de la lista a un cuadrante del calendario.
 *
 * Drag & drop:
 *   · Arrastrar desde la lista → drop en cuadrante = asignar esa
 *     fecha al post.
 *   · Arrastrar desde un cuadrante → drop en otro cuadrante = mover
 *     a esa fecha.
 *   · Arrastrar desde un cuadrante → drop en la lista = "desasignar"
 *     (en esta versión, simplemente mueve el post al día de hoy
 *     marcado como draft — no implementamos "fecha nula" porque la
 *     columna date es NOT NULL en DB).
 *
 * Navegación: botones < / > para cambiar de mes; "Hoy" vuelve al
 * mes corriente.
 */

import { useMemo, useState } from "react";
import type { ContentPost, ClientContentClassification } from "@/lib/types";
import { classificationMetaById } from "@/lib/types";

interface Props {
  posts: ContentPost[];
  classifications: ClientContentClassification[];
  /** Click en un chip de post → abre detalle. */
  onPostClick?: (p: ContentPost) => void;
  /** Cambiar la fecha de un post. El caller persiste en DB y refresca. */
  onAssignDate: (post: ContentPost, newDate: string) => Promise<void>;
}

const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const MONTH_LABELS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

/** YYYY-MM-DD del día (local). */
function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Genera matriz 6x7 (filas x días) del mes pedido, con padding del
 *  mes anterior/siguiente para llenar las semanas. */
function monthCells(year: number, month: number): { date: Date; inMonth: boolean }[] {
  // Lunes = 1 ... Domingo = 0. Queremos semana arrancando lunes.
  const firstOfMonth = new Date(year, month, 1);
  // jsDay: 0=domingo .. 6=sábado. Queremos índice Mon=0 ... Sun=6.
  const jsDay = firstOfMonth.getDay();
  const mondayIdx = (jsDay + 6) % 7;
  // Lunes de la primera fila (puede estar en el mes anterior).
  const start = new Date(year, month, 1 - mondayIdx);
  const cells: { date: Date; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push({ date: d, inMonth: d.getMonth() === month });
  }
  return cells;
}

export default function ContentCalendarView({
  posts,
  classifications,
  onPostClick,
  onAssignDate,
}: Props) {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState({
    year: today.getFullYear(),
    month: today.getMonth(),
  });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Posts agrupados por día. Clave = YYYY-MM-DD. */
  const postsByDay = useMemo(() => {
    const map = new Map<string, ContentPost[]>();
    for (const p of posts) {
      // p.date ya está en YYYY-MM-DD (columna date de DB).
      const list = map.get(p.date) ?? [];
      list.push(p);
      map.set(p.date, list);
    }
    // Ordenar cada día por hora ascendente (chips arriba = más temprano).
    for (const list of map.values()) {
      list.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
    }
    return map;
  }, [posts]);

  /** Pool lateral: posts en draft que el director querría mover. Si
   *  quisieras mostrar TODOS los drafts incluso de meses pasados,
   *  acá los devolvés sin filtro. Para no abrumar limitamos a los
   *  drafts ordenados por createdAt DESC. */
  const draftPool = useMemo(
    () =>
      posts
        .filter((p) => p.status === "draft")
        .slice()
        .sort((a, b) =>
          a.createdAt > b.createdAt ? -1 : a.createdAt < b.createdAt ? 1 : 0,
        ),
    [posts],
  );

  const cells = useMemo(
    () => monthCells(cursor.year, cursor.month),
    [cursor],
  );

  async function handleDropOnDay(day: string) {
    if (!draggingId) return;
    const dragged = posts.find((p) => p.id === draggingId);
    setDraggingId(null);
    setDragOverDay(null);
    if (!dragged || dragged.date === day) return;
    setBusy(true);
    try {
      await onAssignDate(dragged, day);
    } catch (err) {
      console.error("[ContentCalendarView] assign failed:", err);
      alert(`No se pudo cambiar la fecha:\n${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const monthLabel = `${MONTH_LABELS[cursor.month]} ${cursor.year}`;
  const todayIso = isoDay(today);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 280px",
        gap: 16,
        opacity: busy ? 0.6 : 1,
        pointerEvents: busy ? "none" : undefined,
      }}
    >
      {/* ====================== CALENDARIO ====================== */}
      <div
        style={{
          background: "var(--white)",
          border: "1px solid rgba(10,26,12,0.08)",
          borderRadius: "var(--r-md)",
          overflow: "hidden",
        }}
      >
        {/* Header: navegación + mes */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px",
            borderBottom: "1px solid rgba(10,26,12,0.08)",
            background: "var(--off-white)",
          }}
        >
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              type="button"
              onClick={() =>
                setCursor((c) => {
                  const m = c.month - 1;
                  if (m < 0) return { year: c.year - 1, month: 11 };
                  return { year: c.year, month: m };
                })
              }
              style={navBtnStyle}
              aria-label="Mes anterior"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() =>
                setCursor({ year: today.getFullYear(), month: today.getMonth() })
              }
              style={{
                ...navBtnStyle,
                fontSize: 11,
                padding: "5px 10px",
              }}
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() =>
                setCursor((c) => {
                  const m = c.month + 1;
                  if (m > 11) return { year: c.year + 1, month: 0 };
                  return { year: c.year, month: m };
                })
              }
              style={navBtnStyle}
              aria-label="Mes siguiente"
            >
              ›
            </button>
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "var(--deep-green)",
              letterSpacing: "-0.01em",
              textTransform: "capitalize",
            }}
          >
            {monthLabel}
          </div>
        </div>

        {/* Cabecera de días de la semana */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            background: "var(--off-white)",
            borderBottom: "1px solid rgba(10,26,12,0.08)",
          }}
        >
          {DAY_LABELS.map((d) => (
            <div
              key={d}
              style={{
                padding: "8px 6px",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--sand-dark)",
                textAlign: "center",
              }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Grid 6x7 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gridAutoRows: "minmax(100px, auto)",
          }}
        >
          {cells.map(({ date, inMonth }, idx) => {
            const day = isoDay(date);
            const dayPosts = postsByDay.get(day) ?? [];
            const isToday = day === todayIso;
            const isOver = dragOverDay === day && !!draggingId;
            return (
              <div
                key={idx}
                onDragOver={(e) => {
                  if (!draggingId) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragOverDay !== day) setDragOverDay(day);
                }}
                onDragLeave={() => {
                  if (dragOverDay === day) setDragOverDay(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  void handleDropOnDay(day);
                }}
                style={{
                  borderRight: "1px solid rgba(10,26,12,0.06)",
                  borderBottom: "1px solid rgba(10,26,12,0.06)",
                  padding: 6,
                  background: isOver
                    ? "rgba(47,125,79,0.10)"
                    : inMonth
                      ? "var(--white)"
                      : "var(--off-white)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  minHeight: 100,
                  outline: isOver ? "2px solid var(--green-ok)" : "none",
                  outlineOffset: isOver ? -2 : 0,
                  transition: "background 0.12s",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: isToday ? 800 : 600,
                      color: isToday
                        ? "var(--green-ok)"
                        : inMonth
                          ? "var(--deep-green)"
                          : "var(--text-muted)",
                      lineHeight: 1,
                    }}
                  >
                    {date.getDate()}
                  </span>
                  {dayPosts.length > 0 && (
                    <span
                      style={{
                        fontSize: 9,
                        color: "var(--text-muted)",
                        fontWeight: 700,
                      }}
                    >
                      {dayPosts.length}
                    </span>
                  )}
                </div>

                {/* Chips de posts del día — arrastrables */}
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {dayPosts.slice(0, 4).map((p) => (
                    <PostChip
                      key={p.id}
                      post={p}
                      classifications={classifications}
                      onClick={onPostClick}
                      draggable
                      isDragging={draggingId === p.id}
                      onDragStart={() => setDraggingId(p.id)}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setDragOverDay(null);
                      }}
                    />
                  ))}
                  {dayPosts.length > 4 && (
                    <div
                      style={{
                        fontSize: 9,
                        color: "var(--text-muted)",
                        fontWeight: 600,
                        paddingLeft: 4,
                      }}
                    >
                      +{dayPosts.length - 4} más
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ====================== LISTA LATERAL ====================== */}
      <div
        style={{
          background: "var(--white)",
          border: "1px solid rgba(10,26,12,0.08)",
          borderRadius: "var(--r-md)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          maxHeight: "calc(100vh - 240px)",
          position: "sticky",
          top: 16,
        }}
      >
        <div
          style={{
            padding: "12px 14px",
            background: "var(--off-white)",
            borderBottom: "1px solid rgba(10,26,12,0.08)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--sand-dark)",
            }}
          >
            Borradores
          </div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--text-muted)",
            }}
          >
            {draftPool.length}
          </span>
        </div>
        <div
          style={{
            overflowY: "auto",
            padding: 8,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {draftPool.length === 0 ? (
            <div
              style={{
                padding: "20px 12px",
                textAlign: "center",
                fontSize: 11,
                color: "var(--text-muted)",
                fontStyle: "italic",
                lineHeight: 1.5,
              }}
            >
              No hay borradores. Cuando crees ideas nuevas o cambies un
              post a borrador, aparecerán acá para que puedas
              arrastrarlos al calendario.
            </div>
          ) : (
            draftPool.map((p) => (
              <PostChip
                key={p.id}
                post={p}
                classifications={classifications}
                onClick={onPostClick}
                draggable
                isDragging={draggingId === p.id}
                onDragStart={() => setDraggingId(p.id)}
                onDragEnd={() => {
                  setDraggingId(null);
                  setDragOverDay(null);
                }}
                expanded
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PostChip — chip arrastrable que se usa adentro de los cuadrantes
// (compacto) y en la lista lateral (expanded).
// ============================================================
function PostChip({
  post,
  classifications,
  onClick,
  draggable,
  isDragging,
  onDragStart,
  onDragEnd,
  expanded = false,
}: {
  post: ContentPost;
  classifications: ClientContentClassification[];
  onClick?: (p: ContentPost) => void;
  draggable: boolean;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  expanded?: boolean;
}) {
  const classMeta = classificationMetaById(classifications, post.classification);
  const bg = classMeta?.bg ?? "rgba(10,26,12,0.06)";
  const color = classMeta?.color ?? "var(--deep-green)";
  const idea = (post.idea ?? post.brief ?? "").slice(0, expanded ? 80 : 30);
  const code =
    post.code != null
      ? `C-${String(post.code).padStart(4, "0")}`
      : `C-${post.id.slice(0, 4).toUpperCase()}`;

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        if (!draggable) return;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", post.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={() => {
        if (onClick) onClick(post);
      }}
      title={`Arrastrá al calendario para asignar fecha`}
      style={{
        background: bg,
        borderLeft: `3px solid ${color}`,
        borderRadius: 3,
        padding: expanded ? "8px 10px" : "3px 6px",
        cursor: draggable ? "grab" : "pointer",
        fontSize: expanded ? 12 : 10,
        color: "var(--deep-green)",
        fontWeight: 600,
        opacity: isDragging ? 0.35 : 1,
        display: "flex",
        flexDirection: "column",
        gap: expanded ? 4 : 0,
        overflow: "hidden",
        transition: "opacity 0.12s",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: expanded ? 10 : 9,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
        }}
      >
        <span>{code}</span>
        {post.time && <span>· {post.time}</span>}
      </div>
      <div
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: expanded ? "normal" : "nowrap",
          lineHeight: 1.3,
        }}
      >
        {idea || "Sin idea"}
      </div>
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  background: "var(--white)",
  border: "1px solid rgba(10,26,12,0.15)",
  color: "var(--deep-green)",
  fontSize: 13,
  fontWeight: 700,
  padding: "5px 10px",
  borderRadius: 4,
  cursor: "pointer",
  fontFamily: "inherit",
  lineHeight: 1,
};
