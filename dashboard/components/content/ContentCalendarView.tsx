"use client";

/**
 * ContentCalendarView — vista calendario editorial.
 *
 * Layout split:
 *   · Izquierda (~70%): grid mensual con cuadrantes por fecha. Cada
 *     cuadrante muestra los posts asignados a ese día (chips
 *     compactos con código + idea). VISTA DE LECTURA — no recibe
 *     drag & drop.
 *   · Derecha (~30%): lista de borradores (status='draft') con cada
 *     post mostrando código + idea/titular completo + status +
 *     formato + **date picker** para asignar fecha manualmente.
 *
 * Flow de asignación (antes era drag al calendario, ahora es manual):
 *   El director quería tener control granular: en lugar de arrastrar
 *   y soltar (fácil de equivocarse), elige la fecha desde un input
 *   date al pie de cada chip. Al cambiar el valor:
 *     1. Se llama onAssignDate(post, newDate).
 *     2. El caller persiste con patchPost.
 *     3. El post aparece automáticamente en el cuadrante de esa
 *        fecha (la grid se rerenderea con la lista actualizada) y
 *        en el feed (que ordena por date desc).
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

  /** Asignar fecha desde el date picker del chip lateral. El director
   *  pidió explícitamente que la asignación sea manual (no drag-and-
   *  drop sobre el calendario, que era propenso a errores). */
  async function handleAssignFromPicker(post: ContentPost, newDate: string) {
    if (!newDate || newDate === post.date) return;
    setBusy(true);
    try {
      await onAssignDate(post, newDate);
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
            return (
              <div
                key={idx}
                style={{
                  borderRight: "1px solid rgba(10,26,12,0.06)",
                  borderBottom: "1px solid rgba(10,26,12,0.06)",
                  padding: 6,
                  background: inMonth ? "var(--white)" : "var(--off-white)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  minHeight: 100,
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

                {/* Chips de posts del día — solo lectura (click abre
                    detalle). La asignación pasó al date picker de la
                    lista lateral. */}
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {dayPosts.slice(0, 4).map((p) => (
                    <DayChip
                      key={p.id}
                      post={p}
                      classifications={classifications}
                      onClick={onPostClick}
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
                onAssignDate={(newDate) => handleAssignFromPicker(p, newDate)}
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
// del calendario. Es solo lectura (click abre detalle). La
// asignación de fecha vive en el DraftItem de la lista lateral.
// ============================================================
function DayChip({
  post,
  classifications,
  onClick,
}: {
  post: ContentPost;
  classifications: ClientContentClassification[];
  onClick?: (p: ContentPost) => void;
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
    <button
      type="button"
      onClick={() => {
        if (onClick) onClick(post);
      }}
      style={{
        background: bg,
        borderLeft: `3px solid ${color}`,
        border: "none",
        borderRadius: 3,
        padding: "3px 6px",
        cursor: onClick ? "pointer" : "default",
        fontSize: 10,
        color: "var(--deep-green)",
        fontWeight: 600,
        display: "flex",
        flexDirection: "column",
        gap: 0,
        overflow: "hidden",
        textAlign: "left",
        fontFamily: "inherit",
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
    </button>
  );
}

// ============================================================
// DraftItem — fila expandida de la lista lateral. Muestra código,
// status, formato, idea/titular COMPLETO (no truncado) y un date
// picker para asignar fecha manualmente. Al cambiar la fecha del
// picker se llama onAssignDate (que persiste con patchPost).
// ============================================================
function DraftItem({
  post,
  classifications,
  onClick,
  onAssignDate,
}: {
  post: ContentPost;
  classifications: ClientContentClassification[];
  onClick?: (p: ContentPost) => void;
  onAssignDate: (newDate: string) => void | Promise<void>;
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
      style={{
        background: "var(--white)",
        border: "1px solid rgba(10,26,12,0.08)",
        borderLeft: `3px solid ${accent}`,
        borderRadius: 4,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
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

      {/* Titular completo de la idea — el director pidió poder leer
          aunque sea el titular, sin truncar.  */}
      <button
        type="button"
        onClick={() => {
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
          cursor: onClick ? "pointer" : "default",
        }}
      >
        {idea}
      </button>

      {/* Date picker — al cambiarlo, se asigna la fecha. La fecha
          actual del post sirve como defaultValue. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginTop: 2,
        }}
      >
        <span
          style={{
            fontSize: 9,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--sand-dark)",
            fontWeight: 700,
          }}
        >
          Fecha
        </span>
        <input
          type="date"
          value={post.date}
          onChange={(e) => {
            const next = e.target.value;
            void onAssignDate(next);
          }}
          style={{
            flex: 1,
            padding: "5px 8px",
            border: "1px solid rgba(10,26,12,0.15)",
            borderRadius: 4,
            fontSize: 12,
            fontFamily: "inherit",
            color: "var(--deep-green)",
            background: "var(--white)",
          }}
        />
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
