"use client";

/**
 * Portal · Agenda de publicaciones — vista READ-ONLY del cliente
 * sobre las ideas/posts cargados por el equipo en /cliente/[id]/contenido.
 *
 * Lo que SÍ puede hacer el cliente:
 *   - Ver la tabla con los posts (código, red, formato, idea, fecha, estado).
 *   - Ver el feed simulado (grilla 3-col tipo perfil IG).
 *   - Agregar una "recomendación" por post — eso crea una entrada en
 *     client_requests con type='recomendacion' y metadata.post_id, que
 *     el director ve en el menú "Solicitudes" del dashboard GP.
 *
 * Lo que NO puede:
 *   - Editar ningún campo del post.
 *   - Cambiar status/aprobación.
 *   - Crear/borrar posts.
 *
 * Esta página es paralela a /cliente/[id]/contenido pero mucho más
 * simple: sin filtros sofisticados, sin asistente IA, sin upload de
 * imagen — solo lectura y feedback.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getCurrentProfile,
  hasSession,
  type Profile,
} from "@/lib/supabase/auth";
import { getClient, getContent } from "@/lib/storage";
import { createRequest, listRequestsForClient } from "@/lib/requests";
import PortalHeader from "@/components/PortalHeader";
import { NETWORK_COLORS } from "@/lib/content-frequency";
import {
  classificationsFor,
  classificationMetaById,
} from "@/lib/types";
import ContentFeedPreview from "@/components/content/ContentFeedPreview";
import type {
  Client,
  ClientRequest,
  ContentFormat,
  ContentNetwork,
  ContentPost,
  ContentStatus,
} from "@/lib/types";
import portalStyles from "../portal.module.css";

const NETWORK_LABEL: Record<ContentNetwork, string> = {
  ig: "Instagram",
  tt: "TikTok",
  in: "LinkedIn",
  fb: "Facebook",
};

const FORMAT_LABEL: Record<ContentFormat, string> = {
  reel: "Reel",
  post: "Post",
  carrusel: "Carrusel",
  story: "Story",
  ugc: "UGC",
  anuncio: "Anuncio",
};

const STATUS_LABEL: Record<ContentStatus, string> = {
  draft: "Borrador",
  scheduled: "Aprobada",
  published: "Publicada",
};

const STATUS_COLOR: Record<ContentStatus, string> = {
  draft: "#9B8259",
  scheduled: "#2f7d4f",
  published: "#0A1A0C",
};

const MONTHS_ES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

function formatShortDate(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7)) - 1;
  const d = Number(iso.slice(8, 10));
  if (Number.isNaN(m) || Number.isNaN(d)) return iso;
  const now = new Date().getFullYear();
  return y === now
    ? `${d} ${MONTHS_ES[m]}`
    : `${d} ${MONTHS_ES[m]} ${y}`;
}

function codeOf(post: ContentPost): string {
  if (post.code != null) return `C-${String(post.code).padStart(4, "0")}`;
  return `C-${post.id.slice(0, 4).toUpperCase()}`;
}

export default function PortalAgendaPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [requests, setRequests] = useState<ClientRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"table" | "feed">("table");
  const [feedNetwork, setFeedNetwork] = useState<ContentNetwork>("ig");
  const [recoModal, setRecoModal] = useState<ContentPost | null>(null);
  // Tile detail vivía dentro de PortalAgendaFeed (state local). Ahora
  // que reusamos <ContentFeedPreview>, lo subimos al nivel de página
  // para poder renderizar TileDetailModal afuera del componente común.
  const [tileDetail, setTileDetail] = useState<ContentPost | null>(null);

  useEffect(() => {
    let active = true;
    hasSession().then(async (has) => {
      if (!has) {
        router.replace("/");
        return;
      }
      const p = await getCurrentProfile();
      if (!active) return;
      if (!p) {
        router.replace("/");
        return;
      }
      if (p.role !== "client") {
        router.replace("/hub");
        return;
      }
      setProfile(p);
      if (p.client_id) {
        const [c, pts, reqs] = await Promise.all([
          getClient(p.client_id),
          getContent(p.client_id),
          listRequestsForClient(p.client_id),
        ]);
        if (active) {
          setClient(c ?? null);
          setPosts(pts);
          setRequests(reqs);
        }
      }
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [router]);

  // Mapa post_id → cantidad de recomendaciones ya cargadas. Lo usamos
  // para mostrar un badge "X recomendaciones" en cada fila y evitar
  // que el cliente cargue duplicados sin saberlo.
  const recoCountByPost = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of requests) {
      if (r.type !== "recomendacion") continue;
      const meta = (r.metadata ?? {}) as { post_id?: string };
      if (!meta.post_id) continue;
      map.set(meta.post_id, (map.get(meta.post_id) ?? 0) + 1);
    }
    return map;
  }, [requests]);

  // Sort newest first para que lo más reciente esté arriba en la tabla.
  const sortedPosts = useMemo(
    () =>
      [...posts].sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return (b.time ?? "").localeCompare(a.time ?? "");
      }),
    [posts],
  );

  const classifications = classificationsFor(client);

  async function handleSubmitReco(text: string) {
    if (!recoModal || !client) return;
    try {
      const code = codeOf(recoModal);
      const ideaExcerpt = (recoModal.idea ?? recoModal.brief ?? "")
        .slice(0, 120)
        .trim();
      await createRequest({
        client_id: client.id,
        type: "recomendacion",
        title: `Recomendación sobre ${code}`,
        description: text,
        metadata: {
          post_id: recoModal.id,
          post_code: code,
          post_idea_excerpt: ideaExcerpt,
        },
        urgency: "media",
      });
      // Refresh la lista para que el badge se actualice y mostrar
      // confirmación.
      if (profile?.client_id) {
        const fresh = await listRequestsForClient(profile.client_id);
        setRequests(fresh);
      }
      setRecoModal(null);
      alert(
        "¡Listo! La recomendación llegó al equipo. Te van a contestar por el portal.",
      );
    } catch (e) {
      alert(`No se pudo enviar la recomendación:\n${(e as Error).message}`);
    }
  }

  if (loading || !profile) return null;

  return (
    <>
      <PortalHeader
        client={client}
        profile={profile}
        eyebrow="Agenda de publicaciones"
        showBack
      />

      <main className={portalStyles.wrap}>
        <section className={portalStyles.heroBlock}>
          <div className={portalStyles.heroLeft}>
            <div className={portalStyles.heroEyebrow}>Solo lectura</div>
            <h1 className={portalStyles.heroTitle}>
              Agenda de publicaciones
            </h1>
            <p className={portalStyles.heroSub}>
              Acá ves lo que el equipo tiene planeado publicar. Vos no
              podés editar las piezas, pero sí{" "}
              <strong>agregar una recomendación</strong> a cualquier idea
              — nos llega como solicitud y te respondemos por el portal.
            </p>
          </div>
        </section>

        {/* Toggle Tabla / Feed */}
        <div
          style={{
            display: "flex",
            gap: 0,
            marginBottom: 18,
            background: "var(--off-white)",
            padding: 4,
            borderRadius: 8,
            width: "fit-content",
            border: "1px solid rgba(10,26,12,0.08)",
          }}
        >
          {(["table", "feed"] as const).map((mode) => {
            const active = viewMode === mode;
            const label = mode === "table" ? "▤ Tabla" : "▦ Vista feed";
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                style={{
                  padding: "8px 16px",
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  background: active ? "var(--white)" : "transparent",
                  color: active ? "var(--deep-green)" : "var(--text-muted)",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  boxShadow: active
                    ? "0 1px 3px rgba(0,0,0,0.08)"
                    : "none",
                  transition: "all 0.12s",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {posts.length === 0 ? (
          <div
            style={{
              padding: 40,
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: 13,
              fontStyle: "italic",
              background: "var(--white)",
              borderRadius: "var(--r-lg)",
              border: "1px solid rgba(10,26,12,0.08)",
            }}
          >
            El equipo todavía no cargó publicaciones para vos.
          </div>
        ) : viewMode === "table" ? (
          <PortalAgendaTable
            posts={sortedPosts}
            classifications={classifications}
            recoCountByPost={recoCountByPost}
            onAddReco={(p) => setRecoModal(p)}
          />
        ) : (
          <ContentFeedPreview
            posts={sortedPosts}
            network={feedNetwork}
            onNetworkChange={setFeedNetwork}
            clientName={client?.name ?? ""}
            clientLogoUrl={client?.logo_url ?? null}
            clientSocialLinks={client?.social_links ?? null}
            classifications={classifications}
            badgeByPostId={recoCountByPost}
            onTileClick={setTileDetail}
          />
        )}
      </main>

      {tileDetail && (
        <TileDetailModal
          post={tileDetail}
          existingCount={recoCountByPost.get(tileDetail.id) ?? 0}
          onClose={() => setTileDetail(null)}
          onAddReco={() => {
            const p = tileDetail;
            setTileDetail(null);
            setRecoModal(p);
          }}
        />
      )}

      {recoModal && (
        <RecommendationModal
          post={recoModal}
          existingCount={recoCountByPost.get(recoModal.id) ?? 0}
          onClose={() => setRecoModal(null)}
          onSubmit={handleSubmitReco}
        />
      )}
    </>
  );
}

// ============================================================
// PortalAgendaTable — versión read-only de la tabla de /contenido.
// Sin filtros por columna, sin editar inline, sin botones de aprobar.
// Solo info + badge de "X recomendaciones" + botón "+ Recomendación".
// ============================================================
function PortalAgendaTable({
  posts,
  classifications,
  recoCountByPost,
  onAddReco,
}: {
  posts: ContentPost[];
  classifications: ReturnType<typeof classificationsFor>;
  recoCountByPost: Map<string, number>;
  onAddReco: (p: ContentPost) => void;
}) {
  return (
    <div
      style={{
        background: "var(--white)",
        border: "1px solid rgba(10,26,12,0.08)",
        borderRadius: "var(--r-lg)",
        overflow: "hidden",
        overflowX: "auto",
      }}
    >
      <table
        style={{
          width: "100%",
          fontSize: 13,
          borderCollapse: "collapse",
        }}
      >
        <thead>
          <tr
            style={{
              background: "var(--off-white)",
              borderBottom: "1px solid rgba(10,26,12,0.1)",
            }}
          >
            <th style={th}>Código</th>
            <th style={th}>Red</th>
            <th style={th}>Formato</th>
            <th style={{ ...th, minWidth: 260 }}>Idea</th>
            <th style={th}>Fecha</th>
            <th style={th}>Estado</th>
            <th style={{ ...th, textAlign: "right" }}>Recomendación</th>
          </tr>
        </thead>
        <tbody>
          {posts.map((p) => {
            const networks =
              p.networks && p.networks.length > 0
                ? p.networks
                : [p.network];
            const classMeta = classificationMetaById(
              classifications,
              p.classification,
            );
            const recoCount = recoCountByPost.get(p.id) ?? 0;
            return (
              <tr
                key={p.id}
                style={{
                  borderBottom: "1px solid rgba(10,26,12,0.05)",
                }}
              >
                <td
                  style={{
                    ...td,
                    fontFamily: "monospace",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                >
                  {codeOf(p)}
                </td>
                <td style={td}>
                  <div
                    style={{ display: "flex", gap: 4, flexWrap: "wrap" }}
                  >
                    {networks.map((n) => (
                      <span
                        key={n}
                        style={{
                          display: "inline-block",
                          padding: "3px 8px",
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          background:
                            NETWORK_COLORS[n]?.solid ?? "#0A1A0C",
                          color: "#fff",
                          borderRadius: "var(--r-pill)",
                        }}
                      >
                        {NETWORK_LABEL[n] ?? n}
                      </span>
                    ))}
                  </div>
                </td>
                <td style={{ ...td, textTransform: "capitalize" }}>
                  {FORMAT_LABEL[p.format] ?? p.format}
                </td>
                <td style={td}>
                  <div
                    style={{
                      maxWidth: 420,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      lineHeight: 1.4,
                      color: p.idea
                        ? "var(--deep-green)"
                        : "var(--text-muted)",
                      fontStyle: p.idea ? "normal" : "italic",
                    }}
                  >
                    {p.idea ?? p.brief?.slice(0, 100) ?? "(sin idea)"}
                  </div>
                  {classMeta && (
                    <div style={{ marginTop: 4 }}>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 800,
                          letterSpacing: "0.06em",
                          padding: "2px 6px",
                          background: classMeta.color,
                          color: "#fff",
                          borderRadius: 3,
                        }}
                      >
                        {classMeta.label}
                      </span>
                    </div>
                  )}
                </td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>
                  <div style={{ fontWeight: 600 }}>
                    {formatShortDate(p.date)}
                  </div>
                  {p.time && (
                    <div
                      style={{ fontSize: 10, color: "var(--text-muted)" }}
                    >
                      {p.time}
                    </div>
                  )}
                </td>
                <td style={td}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      background:
                        p.status === "scheduled"
                          ? "rgba(47,125,79,0.12)"
                          : p.status === "published"
                            ? "rgba(10,26,12,0.08)"
                            : "rgba(155,130,89,0.15)",
                      color: STATUS_COLOR[p.status],
                      borderRadius: "var(--r-pill)",
                    }}
                  >
                    {STATUS_LABEL[p.status]}
                  </span>
                </td>
                <td style={{ ...td, textAlign: "right" }}>
                  {recoCount > 0 && (
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--text-muted)",
                        marginRight: 8,
                      }}
                    >
                      {recoCount}{" "}
                      {recoCount === 1 ? "enviada" : "enviadas"}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onAddReco(p)}
                    style={{
                      padding: "5px 12px",
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      background: "var(--deep-green)",
                      color: "var(--off-white)",
                      border: "none",
                      borderRadius: 4,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    + Recomendar
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


// Modal mostrando el detalle de un post (read-only) cuando el cliente
// toca un tile de la grilla. Botón CTA para abrir el modal de
// recomendación.
function TileDetailModal({
  post,
  existingCount,
  onClose,
  onAddReco,
}: {
  post: ContentPost;
  existingCount: number;
  onClose: () => void;
  onAddReco: () => void;
}) {
  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,26,12,0.6)",
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        backdropFilter: "blur(3px)",
      }}
    >
      <div
        style={{
          background: "var(--white)",
          maxWidth: 480,
          width: "100%",
          padding: 28,
          borderRadius: "var(--r-lg)",
          position: "relative",
          maxHeight: "85vh",
          overflowY: "auto",
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            fontSize: 18,
            width: 32,
            height: 32,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--text-muted)",
          }}
        >
          ×
        </button>

        {post.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.imageUrl}
            alt={post.idea ?? ""}
            style={{
              width: "100%",
              maxHeight: 280,
              objectFit: "cover",
              borderRadius: "var(--r-sm)",
              marginBottom: 14,
            }}
          />
        )}
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--sand-dark)",
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          {codeOf(post)} · {NETWORK_LABEL[post.network]} ·{" "}
          {FORMAT_LABEL[post.format]}
        </div>
        <h2
          style={{
            fontSize: 20,
            fontWeight: 700,
            marginBottom: 12,
            color: "var(--deep-green)",
          }}
        >
          {post.idea || "Sin idea cargada"}
        </h2>
        <div
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            marginBottom: 14,
          }}
        >
          {formatShortDate(post.date)}
          {post.time ? ` · ${post.time}` : ""}
        </div>

        {post.copy && (
          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                fontWeight: 600,
                color: "var(--sand-dark)",
                marginBottom: 4,
              }}
            >
              Copy
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--deep-green)",
                lineHeight: 1.55,
                whiteSpace: "pre-wrap",
                padding: 12,
                background: "var(--off-white)",
                borderRadius: "var(--r-sm)",
              }}
            >
              {post.copy}
            </div>
          </div>
        )}

        {existingCount > 0 && (
          <div
            style={{
              padding: 10,
              background: "rgba(196,168,130,0.08)",
              borderLeft: "3px solid var(--sand-dark)",
              borderRadius: 4,
              fontSize: 12,
              color: "var(--sand-dark)",
              marginBottom: 14,
            }}
          >
            Ya enviaste {existingCount}{" "}
            {existingCount === 1 ? "recomendación" : "recomendaciones"}{" "}
            sobre esta pieza.
          </div>
        )}

        <button
          type="button"
          onClick={onAddReco}
          style={{
            width: "100%",
            padding: "12px 18px",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.04em",
            background: "var(--deep-green)",
            color: "var(--off-white)",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          + Agregar recomendación
        </button>
      </div>
    </div>
  );
}

// Modal para que el cliente escriba su recomendación.
function RecommendationModal({
  post,
  existingCount,
  onClose,
  onSubmit,
}: {
  post: ContentPost;
  existingCount: number;
  onClose: () => void;
  onSubmit: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(text.trim());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,26,12,0.6)",
        zIndex: 1200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        backdropFilter: "blur(3px)",
      }}
    >
      <div
        style={{
          background: "var(--white)",
          maxWidth: 520,
          width: "100%",
          padding: 28,
          borderRadius: "var(--r-lg)",
          position: "relative",
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            fontSize: 18,
            width: 32,
            height: 32,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--text-muted)",
          }}
          disabled={submitting}
        >
          ×
        </button>

        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--sand-dark)",
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          Recomendación · {codeOf(post)}
        </div>
        <h2
          style={{
            fontSize: 20,
            fontWeight: 700,
            marginBottom: 8,
            color: "var(--deep-green)",
          }}
        >
          Recomendar sobre esta pieza
        </h2>
        <p
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            marginBottom: 14,
            lineHeight: 1.5,
          }}
        >
          Escribí lo que querés cambiar, agregar o sugerir. Le llega al
          equipo como solicitud para que la trabajen. No edita la pieza
          original.
        </p>

        {post.idea && (
          <div
            style={{
              padding: 10,
              background: "var(--off-white)",
              borderRadius: 4,
              marginBottom: 14,
              fontSize: 12,
              color: "var(--deep-green)",
            }}
          >
            <strong style={{ display: "block", marginBottom: 4 }}>
              Idea original:
            </strong>
            <span style={{ color: "var(--text-muted)" }}>
              {post.idea.slice(0, 200)}
              {post.idea.length > 200 ? "…" : ""}
            </span>
          </div>
        )}

        {existingCount > 0 && (
          <div
            style={{
              padding: 8,
              background: "rgba(196,168,130,0.08)",
              borderLeft: "3px solid var(--sand-dark)",
              borderRadius: 4,
              fontSize: 11,
              color: "var(--sand-dark)",
              marginBottom: 12,
            }}
          >
            Ya enviaste {existingCount}{" "}
            {existingCount === 1 ? "recomendación" : "recomendaciones"}{" "}
            sobre esta pieza.
          </div>
        )}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ej: Me gustaría que el tono sea más informal, agregando una pregunta al final para generar comentarios…"
          rows={5}
          disabled={submitting}
          autoFocus
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "1px solid rgba(10,26,12,0.15)",
            borderRadius: 4,
            fontSize: 13,
            fontFamily: "inherit",
            background: "var(--white)",
            color: "var(--deep-green)",
            outline: "none",
            resize: "vertical",
            marginBottom: 16,
          }}
        />

        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              padding: "10px 18px",
              fontSize: 12,
              fontWeight: 600,
              background: "transparent",
              color: "var(--deep-green)",
              border: "1px solid rgba(10,26,12,0.15)",
              borderRadius: 4,
              cursor: submitting ? "default" : "pointer",
              fontFamily: "inherit",
              opacity: submitting ? 0.5 : 1,
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !text.trim()}
            style={{
              padding: "10px 22px",
              fontSize: 12,
              fontWeight: 700,
              background: "var(--deep-green)",
              color: "var(--off-white)",
              border: "none",
              borderRadius: 4,
              cursor:
                submitting || !text.trim() ? "default" : "pointer",
              fontFamily: "inherit",
              opacity: submitting || !text.trim() ? 0.5 : 1,
            }}
          >
            {submitting ? "Enviando…" : "Enviar recomendación →"}
          </button>
        </div>
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  padding: "10px 14px",
  textAlign: "left",
  fontSize: 10,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  fontWeight: 700,
};

const td: React.CSSProperties = {
  padding: "12px 14px",
  fontSize: 13,
  color: "var(--deep-green)",
  verticalAlign: "top",
};
