"use client";

/**
 * ContentAdsBoard — vista Publicidad.
 *
 * Muestra solo las piezas con format="anuncio", en cards grandes
 * centradas en lo que importa de un anuncio: el creative, el copy y el
 * CTA. En la tabla el CTA es un campo más perdido en la fila expandida;
 * acá es protagonista, y si falta se avisa — un anuncio sin CTA no se
 * puede pautar.
 *
 * Read-only a propósito: la edición vive en Tabla y Tablero. Click en
 * una card abre el mismo modal de detalle que el feed.
 */

import { useMemo } from "react";
import type { ClientContentClassification, ContentPost } from "@/lib/types";
import { classificationMetaById } from "@/lib/types";
import type { Profile } from "@/lib/supabase/auth";
import { NETWORK_COLORS } from "@/lib/content-frequency";
import {
  NETWORK_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
  formatShortDate,
  isoLocalDate,
  networksOf,
} from "@/lib/content-labels";

export interface ContentAdsBoardProps {
  /** Piezas ya filtradas por la página; acá se recorta a los anuncios. */
  posts: ContentPost[];
  classifications: ClientContentClassification[];
  teamMembers: Profile[];
  codeOf: (post: ContentPost) => string;
  onCardClick: (post: ContentPost) => void;
}

export default function ContentAdsBoard({
  posts,
  classifications,
  teamMembers,
  codeOf,
  onCardClick,
}: ContentAdsBoardProps) {
  // Se filtra acá y no en la página para heredar todo lo que el usuario
  // ya eligió arriba: estado, período, red, "Mis piezas", búsqueda.
  const ads = useMemo(
    () => posts.filter((p) => p.format === "anuncio"),
    [posts],
  );

  const memberById = useMemo(() => {
    const m = new Map<string, Profile>();
    for (const t of teamMembers) m.set(t.id, t);
    return m;
  }, [teamMembers]);

  if (ads.length === 0) {
    return (
      <div
        style={{
          padding: "48px 20px",
          textAlign: "center",
          background: "var(--off-white)",
          border: "1px solid rgba(10,26,12,0.08)",
          borderRadius: "var(--r-lg)",
          marginBottom: 24,
        }}
      >
        <div style={{ fontSize: 26, marginBottom: 8, opacity: 0.4 }}>◎</div>
        <div
          style={{
            fontSize: 13,
            color: "var(--text-muted)",
            fontStyle: "italic",
          }}
        >
          {posts.length > 0
            ? "No hay piezas con formato Anuncio en el filtro actual."
            : "Todavía no hay anuncios cargados para este cliente."}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            marginTop: 8,
          }}
        >
          Las piezas aparecen acá cuando su formato es{" "}
          <strong>Anuncio</strong>.
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
        gap: 16,
        marginBottom: 24,
      }}
    >
      {ads.map((p) => (
        <AdCard
          key={p.id}
          post={p}
          code={codeOf(p)}
          classifications={classifications}
          assignee={p.assignedTo ? memberById.get(p.assignedTo) : undefined}
          onClick={onCardClick}
        />
      ))}
    </div>
  );
}

function AdCard({
  post,
  code,
  classifications,
  assignee,
  onClick,
}: {
  post: ContentPost;
  code: string;
  classifications: ClientContentClassification[];
  assignee?: Profile;
  onClick: (post: ContentPost) => void;
}) {
  const meta = classificationMetaById(classifications, post.classification);
  const accent = meta?.color ?? "var(--sand)";
  const overdue =
    post.status !== "published" && post.date < isoLocalDate(new Date());
  const nets = networksOf(post);

  return (
    // Direct child del grid y <div> en vez de <button>: un <button>
    // inline-block colapsa el ancho de la celda (ver commit d7f25b5).
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(post)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(post);
        }
      }}
      style={{
        width: "100%",
        boxSizing: "border-box",
        background: "var(--white)",
        border: `1px solid ${overdue ? "rgba(176,75,58,0.35)" : "rgba(10,26,12,0.08)"}`,
        borderRadius: "var(--r-lg)",
        overflow: "hidden",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        fontFamily: "inherit",
        textAlign: "left",
      }}
    >
      {/* Creative — 4:5, el ratio del feed de Meta. */}
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "4 / 5",
          background: "var(--off-white)",
          overflow: "hidden",
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
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              background: `linear-gradient(160deg, ${accent}22, var(--off-white))`,
            }}
          >
            <div style={{ fontSize: 30, opacity: 0.35 }}>◎</div>
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--text-muted)",
                fontWeight: 700,
              }}
            >
              Sin creative
            </div>
          </div>
        )}

        <div
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            display: "flex",
            gap: 4,
          }}
        >
          <span
            style={{
              padding: "3px 8px",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              background: "var(--white)",
              color: STATUS_COLOR[post.status],
              borderRadius: "var(--r-pill)",
            }}
          >
            {STATUS_LABEL[post.status]}
          </span>
          {overdue && (
            <span
              style={{
                padding: "3px 8px",
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.06em",
                background: "var(--red-warn)",
                color: "#fff",
                borderRadius: "var(--r-pill)",
              }}
            >
              VENCIDA
            </span>
          )}
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 8,
            left: 8,
            display: "flex",
            gap: 4,
            flexWrap: "wrap",
          }}
        >
          {nets.map((n) => (
            <span
              key={n}
              style={{
                padding: "3px 8px",
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                background: NETWORK_COLORS[n]?.solid ?? "var(--deep-green)",
                color: "#fff",
                borderRadius: "var(--r-pill)",
              }}
            >
              {NETWORK_LABEL[n] ?? n}
            </span>
          ))}
        </div>
      </div>

      <div
        style={{
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          flex: 1,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 10,
            color: "var(--text-muted)",
          }}
        >
          <span style={{ fontFamily: "monospace", fontWeight: 700 }}>
            {code}
          </span>
          <span>
            {formatShortDate(post.date)}
            {post.time ? ` · ${post.time}` : ""}
          </span>
        </div>

        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            lineHeight: 1.35,
            color: post.idea ? "var(--deep-green)" : "var(--text-muted)",
            fontStyle: post.idea ? "normal" : "italic",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {post.idea ?? "(sin idea)"}
        </div>

        <div
          style={{
            fontSize: 12,
            lineHeight: 1.5,
            color: post.copy ? "var(--deep-green)" : "var(--text-muted)",
            fontStyle: post.copy ? "normal" : "italic",
            whiteSpace: "pre-wrap",
            display: "-webkit-box",
            WebkitLineClamp: 5,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            opacity: post.copy ? 0.85 : 1,
          }}
        >
          {post.copy ?? "Sin copy cargado"}
        </div>

        {/* El CTA es el dato accionable número uno de un anuncio: si
            falta, no se puede pautar. Por eso se destaca o se avisa. */}
        <div style={{ marginTop: "auto", paddingTop: 4 }}>
          {post.cta ? (
            <div
              style={{
                background: "var(--sand)",
                color: "var(--deep-green)",
                borderRadius: "var(--r-pill)",
                padding: "8px 16px",
                textAlign: "center",
                fontWeight: 700,
                fontSize: 12,
              }}
            >
              {post.cta}
            </div>
          ) : (
            <div
              style={{
                border: "1px dashed rgba(176,75,58,0.4)",
                color: "var(--red-warn)",
                borderRadius: "var(--r-pill)",
                padding: "8px 16px",
                textAlign: "center",
                fontWeight: 600,
                fontSize: 11,
              }}
            >
              ⚠ Falta el CTA
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 6,
            borderTop: "1px solid rgba(10,26,12,0.06)",
            paddingTop: 8,
          }}
        >
          {assignee ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div
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
              <span style={{ fontSize: 11, color: "var(--deep-green)" }}>
                {assignee.name.split(" ")[0]}
              </span>
            </div>
          ) : (
            <span
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                fontStyle: "italic",
              }}
            >
              Sin asignar
            </span>
          )}
          {post.assetUrl && (
            <a
              href={post.assetUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title="Abrir archivo (OneDrive / Drive)"
              style={{ fontSize: 12, textDecoration: "none" }}
            >
              📎
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
