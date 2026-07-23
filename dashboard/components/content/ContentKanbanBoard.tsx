"use client";

/**
 * ContentKanbanBoard — tablero de contenido por estado.
 *
 * Tres columnas (Borrador → Aprobada → Publicada) con drag & drop
 * nativo HTML5 entre ellas: soltar una card en otra columna cambia el
 * status de la pieza.
 *
 * Es la vista default del equipo. La tabla sigue siendo la vista de
 * gestión fina (filtros por columna, edición inline, acciones en
 * bloque); el tablero responde a otra pregunta: "¿qué tengo que hacer
 * ahora y en qué estado está?".
 *
 * NO re-filtra nada: recibe `posts` ya filtrado por la página
 * (sortedFiltered) y solo agrupa por estado.
 */

import { useCallback, useMemo, useState } from "react";
import type {
  ClientContentClassification,
  ContentPost,
  ContentStatus,
} from "@/lib/types";
import { classificationMetaById } from "@/lib/types";
import type { Profile } from "@/lib/supabase/auth";
import { NETWORK_COLORS } from "@/lib/content-frequency";
import {
  FORMAT_LABEL,
  NETWORK_LABEL,
  STATUS_LABEL,
  formatShortDate,
  isoLocalDate,
  networksOf,
} from "@/lib/content-labels";

const COLUMNS: { status: ContentStatus; hint: string }[] = [
  { status: "draft", hint: "Ideas sin aprobar" },
  { status: "scheduled", hint: "Aprobadas, listas para producir" },
  { status: "published", hint: "Ya publicadas" },
];

export interface ContentKanbanBoardProps {
  /** Piezas YA filtradas por la página. El tablero solo las agrupa. */
  posts: ContentPost[];
  classifications: ClientContentClassification[];
  teamMembers: Profile[];
  /** Resolver de código C-XXXX — la página tiene el mapa de fallback. */
  codeOf: (post: ContentPost) => string;
  /** Si es false las cards no se arrastran ni muestran el select. */
  canEdit: boolean;
  onCardClick: (post: ContentPost) => void;
  /** Persiste el nuevo estado. Devuelve false si la DB lo rechazó. */
  onStatusChange: (post: ContentPost, status: ContentStatus) => Promise<boolean>;
}

export default function ContentKanbanBoard({
  posts,
  classifications,
  teamMembers,
  codeOf,
  canEdit,
  onCardClick,
  onStatusChange,
}: ContentKanbanBoardProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<ContentStatus | null>(
    null,
  );

  /**
   * Overlay optimista id → { from, to }.
   *
   * La página refetchea todo después de cada patch y no espera a que
   * el fetch termine, así que sin esto la card se queda ~400ms en la
   * columna vieja y recién después salta.
   *
   * Guardamos también el status del que venía (`from`) para que la
   * entrada se invalide sola: mientras el post real siga en `from` el
   * overlay manda, y en cuanto llega el dato actualizado la condición
   * deja de cumplirse y gana la DB. Así no hace falta un useEffect que
   * limpie el mapa (que además dispara renders en cascada).
   */
  const [optimistic, setOptimistic] = useState<
    Record<string, { from: ContentStatus; to: ContentStatus }>
  >({});

  const effectiveStatus = useCallback(
    (p: ContentPost): ContentStatus => {
      const o = optimistic[p.id];
      return o && p.status === o.from ? o.to : p.status;
    },
    [optimistic],
  );

  const byStatus = useMemo(() => {
    const m: Record<ContentStatus, ContentPost[]> = {
      draft: [],
      scheduled: [],
      published: [],
    };
    for (const p of posts) m[effectiveStatus(p)].push(p);
    return m;
  }, [posts, effectiveStatus]);

  const memberById = useMemo(() => {
    const m = new Map<string, Profile>();
    for (const t of teamMembers) m.set(t.id, t);
    return m;
  }, [teamMembers]);

  const moveTo = useCallback(
    async (status: ContentStatus, postId: string | null) => {
      setDraggingId(null);
      setDragOverStatus(null);
      if (!postId || !canEdit) return;
      const post = posts.find((p) => p.id === postId);
      if (!post) return;
      // El status visible, no post.status: si el usuario mueve dos
      // veces seguidas antes de que refresque, la segunda no es no-op.
      const current = effectiveStatus(post);
      if (current === status) return;

      setOptimistic((prev) => ({
        ...prev,
        [postId]: { from: post.status, to: status },
      }));
      const ok = await onStatusChange(post, status);
      if (!ok) {
        // La DB rechazó: soltamos el overlay y la card vuelve sola a su
        // columna original. El alert ya lo mostró la página.
        setOptimistic((prev) => {
          const next = { ...prev };
          delete next[postId];
          return next;
        });
      }
    },
    [canEdit, posts, effectiveStatus, onStatusChange],
  );

  if (posts.length === 0) {
    return (
      <div
        style={{
          padding: "48px 20px",
          textAlign: "center",
          color: "var(--text-muted)",
          fontSize: 13,
          fontStyle: "italic",
          background: "var(--off-white)",
          border: "1px solid rgba(10,26,12,0.08)",
          borderRadius: "var(--r-lg)",
          marginBottom: 24,
        }}
      >
        No hay piezas que coincidan con los filtros actuales.
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        // minmax(0, 1fr) y no 1fr: sin el min de 0, una idea larga
        // ensancha la columna y desborda la grilla.
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: 14,
        alignItems: "start",
        marginBottom: 24,
      }}
    >
      {COLUMNS.map((col) => {
        const items = byStatus[col.status];
        const isOver = dragOverStatus === col.status && draggingId !== null;
        return (
          <div
            key={col.status}
            onDragOver={(e) => {
              if (!draggingId || !canEdit) return;
              // preventDefault es obligatorio: sin esto el navegador no
              // considera al elemento un drop target válido.
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (dragOverStatus !== col.status) setDragOverStatus(col.status);
            }}
            onDragLeave={(e) => {
              // dragleave también dispara al entrar a un hijo, así que
              // solo limpiamos cuando el cursor sale de la columna misma.
              if (e.currentTarget === e.target && dragOverStatus === col.status) {
                setDragOverStatus(null);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              void moveTo(col.status, draggingId);
            }}
            style={{
              boxSizing: "border-box",
              background: isOver ? "rgba(47,125,79,0.08)" : "var(--off-white)",
              border: isOver
                ? "2px dashed var(--green-ok)"
                : "1px solid rgba(10,26,12,0.08)",
              borderRadius: "var(--r-lg)",
              padding: 10,
              minHeight: 220,
              maxHeight: "calc(100vh - 240px)",
              overflowY: "auto",
              // Columna en flex-column (no grid anidado): cada card es un
              // bloque de ancho completo y no puede colapsar.
              display: "flex",
              flexDirection: "column",
              gap: 8,
              transition: "background 0.12s, border-color 0.12s",
            }}
          >
            <div style={{ marginBottom: 2 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--deep-green)",
                  }}
                >
                  {STATUS_LABEL[col.status]}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    background: "rgba(10,26,12,0.06)",
                    padding: "1px 8px",
                    borderRadius: "var(--r-pill)",
                  }}
                >
                  {items.length}
                </span>
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                  marginTop: 2,
                }}
              >
                {col.hint}
              </div>
            </div>

            {items.map((p) => (
              <KanbanCard
                key={p.id}
                post={p}
                code={codeOf(p)}
                classifications={classifications}
                assignee={p.assignedTo ? memberById.get(p.assignedTo) : undefined}
                status={effectiveStatus(p)}
                canEdit={canEdit}
                isDragging={draggingId === p.id}
                onDragStart={() => setDraggingId(p.id)}
                onDragEnd={() => {
                  setDraggingId(null);
                  setDragOverStatus(null);
                }}
                onClick={onCardClick}
                onStatusChange={(status) => void moveTo(status, p.id)}
              />
            ))}

            {items.length === 0 && (
              <div
                style={{
                  padding: "20px 10px",
                  textAlign: "center",
                  fontSize: 11,
                  fontStyle: "italic",
                  color: "var(--text-muted)",
                }}
              >
                {canEdit ? "Arrastrá piezas acá" : "Sin piezas"}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface KanbanCardProps {
  post: ContentPost;
  code: string;
  classifications: ClientContentClassification[];
  assignee?: Profile;
  /** Status visible = el optimista si hay uno pendiente, si no el real. */
  status: ContentStatus;
  canEdit: boolean;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onClick: (post: ContentPost) => void;
  onStatusChange: (status: ContentStatus) => void;
}

function KanbanCard({
  post,
  code,
  classifications,
  assignee,
  status,
  canEdit,
  isDragging,
  onDragStart,
  onDragEnd,
  onClick,
  onStatusChange,
}: KanbanCardProps) {
  const meta = classificationMetaById(classifications, post.classification);
  const accent = meta?.color ?? "var(--sand)";
  const overdue = status !== "published" && post.date < isoLocalDate(new Date());
  const nets = networksOf(post);
  const idea =
    post.idea ?? post.brief?.split("\n")[0]?.slice(0, 120) ?? "(sin idea)";

  return (
    // <div>, NO <button>: un <button> es inline-block y dentro de un
    // contenedor flex/grid puede colapsar a ancho 0 — es exactamente el
    // bug que dejó el feed de Instagram vacío (commit d7f25b5). El
    // width/boxSizing/flex explícitos son el cinturón además del tirante.
    <div
      draggable={canEdit}
      onDragStart={(e) => {
        if (!canEdit) return;
        e.dataTransfer.effectAllowed = "move";
        // Firefox no arranca el drag sin algún dato seteado.
        e.dataTransfer.setData("text/plain", post.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={() => onClick(post)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(post);
        }
      }}
      title={
        canEdit ? "Arrastrá a otra columna para cambiar el estado" : undefined
      }
      style={{
        width: "100%",
        boxSizing: "border-box",
        flex: "0 0 auto",
        background: "var(--white)",
        border: `1px solid ${overdue ? "rgba(176,75,58,0.35)" : "rgba(10,26,12,0.08)"}`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: "var(--r-sm)",
        padding: 10,
        cursor: canEdit ? "grab" : "pointer",
        opacity: isDragging ? 0.35 : 1,
        textAlign: "left",
        fontFamily: "inherit",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        transition: "opacity 0.12s",
      }}
    >
      {post.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.imageUrl}
          alt=""
          loading="lazy"
          style={{
            width: "100%",
            height: 96,
            objectFit: "cover",
            borderRadius: 4,
            display: "block",
          }}
        />
      ) : (
        // Sin imagen, una franja del color de la clasificación — nunca
        // un hueco vacío que rompa el ritmo de la columna.
        <div
          style={{
            width: "100%",
            height: 4,
            background: accent,
            borderRadius: 2,
            opacity: 0.5,
          }}
        />
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontFamily: "monospace",
            fontSize: 10,
            fontWeight: 700,
            color: "var(--text-muted)",
          }}
        >
          {code}
        </span>
        {nets.map((n) => (
          <span
            key={n}
            style={{
              padding: "2px 6px",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              background: NETWORK_COLORS[n]?.solid ?? "var(--deep-green)",
              color: "#fff",
              borderRadius: "var(--r-pill)",
            }}
          >
            {NETWORK_LABEL[n] ?? n}
          </span>
        ))}
        <span
          style={{
            padding: "2px 6px",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            background: "var(--sand)",
            color: "var(--deep-green)",
            borderRadius: "var(--r-pill)",
          }}
        >
          {FORMAT_LABEL[post.format] ?? post.format}
        </span>
      </div>

      <div
        style={{
          fontSize: 12,
          lineHeight: 1.4,
          color: post.idea ? "var(--deep-green)" : "var(--text-muted)",
          fontStyle: post.idea ? "normal" : "italic",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {idea}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          marginTop: 2,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
            {formatShortDate(post.date)}
            {post.time ? ` · ${post.time}` : ""}
          </span>
          {overdue && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.1em",
                color: "var(--red-warn)",
              }}
            >
              VENCIDA
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {post.assetUrl && (
            <a
              href={post.assetUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title="Abrir archivo (OneDrive / Drive)"
              style={{ fontSize: 11, textDecoration: "none" }}
            >
              📎
            </a>
          )}
          {assignee ? (
            <div
              title={assignee.name}
              style={{
                width: 20,
                height: 20,
                background: "var(--sand)",
                color: "var(--deep-green)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 8,
                fontWeight: 700,
                borderRadius: "50%",
              }}
            >
              {assignee.initials || assignee.name.slice(0, 2).toUpperCase()}
            </div>
          ) : (
            <div
              title="Sin responsable asignado"
              style={{
                width: 20,
                height: 20,
                border: "1px dashed rgba(10,26,12,0.25)",
                color: "var(--text-muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9,
                fontWeight: 700,
                borderRadius: "50%",
              }}
            >
              ?
            </div>
          )}
        </div>
      </div>

      {/* Fallback táctil. El drag & drop HTML5 no existe en touch, así
          que sin este select el equipo no podría mover nada desde un
          iPad o un celular. */}
      {canEdit && (
        <select
          value={status}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            e.stopPropagation();
            onStatusChange(e.target.value as ContentStatus);
          }}
          title="Cambiar estado"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "3px 6px",
            fontSize: 10,
            fontWeight: 600,
            border: "1px solid rgba(10,26,12,0.12)",
            borderRadius: 4,
            background: "var(--off-white)",
            color: "var(--deep-green)",
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          {COLUMNS.map((c) => (
            <option key={c.status} value={c.status}>
              {STATUS_LABEL[c.status]}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
