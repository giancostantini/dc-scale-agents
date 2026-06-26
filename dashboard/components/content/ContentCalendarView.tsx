"use client";

/**
 * ContentCalendarView — vista calendario editorial con drag & drop.
 *
 * MODO "sesión limpia": al cargar, el calendario está vacío aunque
 * en DB haya posts con fecha asignada. La idea es que el director
 * arme la planificación de cero — todo el contenido aparece en la
 * lista lateral y él va arrastrando lo que quiere ver programado.
 * Trackeamos qué se asignó EN ESTA SESIÓN con un Set local; cuando
 * refresca, vuelve a empezar limpio.
 *
 * Layout split:
 *   · Izquierda (~70%): calendario. Cuadrantes muestran SOLO los
 *     posts asignados durante la sesión actual. Reciben drop.
 *   · Derecha (~30%): lista de TODO el contenido que todavía no se
 *     arrastró al calendario en esta sesión. Titular completo. Cada
 *     item es arrastrable.
 *
 * Flow:
 *   1. Director agarra un item de la lista.
 *   2. Lo suelta sobre un día del calendario.
 *   3. Se persiste en DB: date = día elegido + status = 'scheduled'.
 *   4. El item desaparece de la lista y aparece en el cuadrante.
 *
 * Si refresca, el state de sesión se pierde y el calendario vuelve
 * a estar vacío — pero las fechas SÍ se persistieron en DB (visibles
 * en Tabla y en Vista feed).
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
  /** Asignar fecha por drag-and-drop. El caller persiste en DB
   *  (fecha + status='scheduled' para que salga del pool de
   *  borradores) y refresca la lista. */
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
  const [busy, setBusy] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const [dragOverList, setDragOverList] = useState(false);
  // IDs de los posts que el director arrastró durante esta sesión.
  // El calendario muestra SOLO estos; la lista lateral muestra todos
  // los demás. Al refrescar la página, este state se pierde y el
  // calendario vuelve a estar vacío — aunque las fechas SÍ quedan
  // persistidas en DB.
  const [assignedThisSession, setAssignedThisSession] = useState<Set<string>>(
    () => new Set(),
  );

  /** Posts agrupados por día — SOLO los asignados en esta sesión.
   *  Clave = YYYY-MM-DD. */
  const postsByDay = useMemo(() => {
    const map = new Map<string, ContentPost[]>();
    for (const p of posts) {
      if (!assignedThisSession.has(p.id)) continue;
      const list = map.get(p.date) ?? [];
      list.push(p);
      map.set(p.date, list);
    }
    // Ordenar cada día por hora ascendente (chips arriba = más temprano).
    for (const list of map.values()) {
      list.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
    }
    return map;
  }, [posts, assignedThisSession]);

  /** Pool lateral: TODO el contenido excepto lo que ya se arrastró
   *  al calendario en esta sesión. Orden por createdAt DESC para que
   *  lo más reciente quede arriba. */
  const draftPool = useMemo(
    () =>
      posts
        .filter((p) => !assignedThisSession.has(p.id))
        .slice()
        .sort((a, b) =>
          a.createdAt > b.createdAt ? -1 : a.createdAt < b.createdAt ? 1 : 0,
        ),
    [posts, assignedThisSession],
  );

  const cells = useMemo(
    () => monthCells(cursor.year, cursor.month),
    [cursor],
  );

  /** Drop sobre un día del calendario. Maneja dos casos:
   *  · El post venía de la lista lateral → persiste fecha + lo marca
   *    como asignado-en-esta-sesión (aparece en el cuadrante).
   *  · El post venía de OTRO cuadrante del calendario → cambia la
   *    fecha en DB; sigue marcado como asignado (se mueve de día). */
  async function handleDropOnDay(day: string) {
    if (!draggingId) return;
    const dragged = posts.find((p) => p.id === draggingId);
    const draggedId = draggingId;
    setDraggingId(null);
    setDragOverDay(null);
    if (!dragged) return;
    if (dragged.date === day && assignedThisSession.has(draggedId)) {
      return; // no-op: ya está acá
    }
    setBusy(true);
    try {
      await onAssignDate(dragged, day);
      setAssignedThisSession((prev) => {
        const next = new Set(prev);
        next.add(draggedId);
        return next;
      });
    } catch (err) {
      console.error("[ContentCalendarView] assign failed:", err);
      alert(`No se pudo asignar la fecha:\n${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  /** Drop sobre la lista lateral. Si el post venía del calendario,
   *  lo saca del set de "asignados en esta sesión" — vuelve a
   *  aparecer en la lista para que el director pueda re-arrastrarlo
   *  a otro día. NO toca la DB (la fecha del post sigue siendo la
   *  que tenía); solo cambia la vista local. */
  function handleDropOnList() {
    if (!draggingId) return;
    const id = draggingId;
    setDraggingId(null);
    setDragOverDay(null);
    if (!assignedThisSession.has(id)) return; // ya estaba en la lista
    setAssignedThisSession((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
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
                    ? "rgba(47,125,79,0.12)"
                    : inMonth
                      ? "var(--white)"
                      : "var(--off-white)",
                  outline: isOver ? "2px solid var(--green-ok)" : "none",
                  outlineOffset: isOver ? -2 : 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  minHeight: 100,
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

                {/* Chips de posts del día — arrastrables. Permiten
                    volver a la lista (drop sobre el panel lateral) o
                    cambiar de día (drop sobre otro cuadrante). */}
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {dayPosts.slice(0, 4).map((p) => (
                    <DayChip
                      key={p.id}
                      post={p}
                      classifications={classifications}
                      onClick={onPostClick}
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

      {/* ====================== LISTA LATERAL ======================
          También es drop target: si arrastrás un chip del calendario
          aquí, lo saca del calendario y vuelve a estar disponible
          en la lista. Solo se aplica para chips que ya están en
          assignedThisSession (los de la lista no se "vuelven a la
          lista" — ya están). */}
      <div
        onDragOver={(e) => {
          if (!draggingId) return;
          // Solo aceptamos drop si viene del calendario.
          if (!assignedThisSession.has(draggingId)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (!dragOverList) setDragOverList(true);
        }}
        onDragLeave={(e) => {
          // El dragleave dispara también cuando el cursor entra a un
          // hijo. Comparamos con currentTarget para distinguir.
          if (e.currentTarget === e.target) setDragOverList(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOverList(false);
          handleDropOnList();
        }}
        style={{
          background: dragOverList
            ? "rgba(47,125,79,0.06)"
            : "var(--white)",
          border: dragOverList
            ? "2px dashed var(--green-ok)"
            : "1px solid rgba(10,26,12,0.08)",
          borderRadius: "var(--r-md)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          maxHeight: "calc(100vh - 240px)",
          position: "sticky",
          top: 16,
          transition: "background 0.12s, border-color 0.12s",
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
            Contenido
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
            gap: 8,
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
              asignarles fecha.
            </div>
          ) : (
            draftPool.map((p) => (
              <DraftItem
                key={p.id}
                post={p}
                classifications={classifications}
                onClick={onPostClick}
                isDragging={draggingId === p.id}
                onDragStart={() => setDraggingId(p.id)}
                onDragEnd={() => {
                  setDraggingId(null);
                  setDragOverDay(null);
                }}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// DayChip — chip compacto que se renderea adentro de los cuadrantes
// del calendario. Es ARRASTRABLE:
//   · Drop sobre otro cuadrante → cambia la fecha.
//   · Drop sobre la lista lateral → vuelve a la lista (sin tocar DB).
// Click (sin drag) abre el modal de detalle del post.
// ============================================================
function DayChip({
  post,
  classifications,
  onClick,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  post: ContentPost;
  classifications: ClientContentClassification[];
  onClick?: (p: ContentPost) => void;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const classMeta = classificationMetaById(classifications, post.classification);
  const bg = classMeta?.bg ?? "rgba(10,26,12,0.06)";
  const color = classMeta?.color ?? "var(--deep-green)";
  const idea = (post.idea ?? post.brief ?? "").slice(0, 30);
  const code =
    post.code != null
      ? `C-${String(post.code).padStart(4, "0")}`
      : `C-${post.id.slice(0, 4).toUpperCase()}`;

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", post.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={(e) => {
        e.stopPropagation();
        if (onClick) onClick(post);
      }}
      title="Arrastrá a otro día para cambiar la fecha, o a la lista para devolverlo"
      style={{
        background: bg,
        borderLeft: `3px solid ${color}`,
        borderRadius: 3,
        padding: "3px 6px",
        cursor: "grab",
        fontSize: 10,
        color: "var(--deep-green)",
        fontWeight: 600,
        display: "flex",
        flexDirection: "column",
        gap: 0,
        overflow: "hidden",
        textAlign: "left",
        fontFamily: "inherit",
        opacity: isDragging ? 0.35 : 1,
        transition: "opacity 0.12s",
      }}
    >
      <div
        style={{
          fontSize: 9,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
          display: "flex",
          gap: 4,
        }}
      >
        <span>{code}</span>
        {post.time && <span>· {post.time}</span>}
      </div>
      <div
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          lineHeight: 1.3,
        }}
      >
        {idea || "Sin idea"}
      </div>
    </div>
  );
}

// ============================================================
// DraftItem — fila arrastrable de la lista lateral. Muestra código,
// formato, clasificación y titular COMPLETO (no truncado). El user
// arrastra el item y lo suelta sobre un día del calendario para
// asignarle esa fecha. El componente padre maneja el state del drag.
// ============================================================
function DraftItem({
  post,
  classifications,
  onClick,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  post: ContentPost;
  classifications: ClientContentClassification[];
  onClick?: (p: ContentPost) => void;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const classMeta = classificationMetaById(classifications, post.classification);
  const accent = classMeta?.color ?? "var(--deep-green)";
  const idea = post.idea ?? post.brief ?? "Sin idea";
  const code =
    post.code != null
      ? `C-${String(post.code).padStart(4, "0")}`
      : `C-${post.id.slice(0, 4).toUpperCase()}`;

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", post.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      title="Arrastrá al día que quieras para asignarle esa fecha"
      style={{
        background: "var(--white)",
        border: "1px solid rgba(10,26,12,0.08)",
        borderLeft: `3px solid ${accent}`,
        borderRadius: 4,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        cursor: "grab",
        opacity: isDragging ? 0.35 : 1,
        transition: "opacity 0.12s",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 10,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
        }}
      >
        <span style={{ fontWeight: 700, color: "var(--deep-green)" }}>
          {code}
        </span>
        <span>· {post.format}</span>
        {classMeta?.short && (
          <span
            style={{
              background: classMeta.bg,
              color: classMeta.color,
              padding: "1px 6px",
              borderRadius: 3,
              fontSize: 9,
              fontWeight: 700,
            }}
          >
            {classMeta.short}
          </span>
        )}
      </div>

      {/* Titular completo de la idea — sin truncar. */}
      <button
        type="button"
        onClick={(e) => {
          // Stopear el click cuando el user está arrastrando para que
          // el modal no se abra cuando solo quiere mover.
          e.stopPropagation();
          if (onClick) onClick(post);
        }}
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          textAlign: "left",
          fontFamily: "inherit",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--deep-green)",
          lineHeight: 1.4,
          cursor: "pointer",
        }}
      >
        {idea}
      </button>
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
