"use client";

/**
 * Portal · Agenda de publicaciones — el cliente ve el MISMO calendario de
 * contenido que usa el equipo (/cliente/[id]/planificador, migración 102):
 * la grilla del mes con una chip por pieza (color = red, relleno =
 * preparado, ✓ = subido, badge de tipo), fechas comerciales y eventos.
 * La grilla es el componente compartido ContentMonthGrid.
 *
 * Solo lectura. El cliente ve las piezas preparadas y subidas: las
 * pendientes (planned, sin descripción ni foto) y los borradores IA viejos
 * (draft) son trabajo interno — todo lo que ve lo escribió una persona.
 *
 * Lo que SÍ puede hacer: abrir una pieza (descripción + foto) y dejar una
 * "recomendación" → client_requests type='recomendacion' con
 * metadata.post_id, que el equipo ve en Solicitudes.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getCurrentProfile,
  hasSession,
  type Profile,
} from "@/lib/supabase/auth";
import { getClient, getContent, getEventsByClient } from "@/lib/storage";
import { createRequest, listRequestsForClient } from "@/lib/requests";
import PortalHeader from "@/components/PortalHeader";
import ContentMonthGrid, {
  LegendTitle,
  StatePill,
  TypeBadge,
} from "@/components/content/ContentMonthGrid";
import { CONTENT_TYPE_META, type ContentType } from "@/lib/content-frequency";
import { PIECE_STATE_META, pieceState, pieceTitle } from "@/lib/content-plan";
import { isoLocalDate } from "@/lib/content-labels";
import type { CalEvent, Client, ClientRequest, ContentPost } from "@/lib/types";
import portalStyles from "../portal.module.css";

const MONTHS_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const WEEKDAYS_LONG = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function codeOf(post: ContentPost): string {
  if (post.code != null) return `C-${String(post.code).padStart(4, "0")}`;
  return `C-${post.id.slice(0, 4).toUpperCase()}`;
}

/** "Jueves 24/9". */
function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = WEEKDAYS_LONG[new Date(y, m - 1, d).getDay()];
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${d}/${m}`;
}

const panelS: React.CSSProperties = {
  background: "var(--white)",
  border: "1px solid rgba(10,26,12,0.08)",
  borderRadius: "var(--r-lg)",
  padding: 20,
  marginBottom: 16,
};

const navBtnS: React.CSSProperties = {
  padding: "5px 12px",
  fontSize: 12,
  fontWeight: 600,
  fontFamily: "inherit",
  color: "var(--deep-green)",
  background: "transparent",
  border: "1px solid rgba(10,26,12,0.15)",
  borderRadius: "var(--r-sm)",
  cursor: "pointer",
};

export default function PortalAgendaPage() {
  const router = useRouter();
  const today = new Date();
  const todayIso = isoLocalDate(today);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [requests, setRequests] = useState<ClientRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [openPiece, setOpenPiece] = useState<ContentPost | null>(null);
  const [recoModal, setRecoModal] = useState<ContentPost | null>(null);

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
        const [c, pts, evs, reqs] = await Promise.all([
          getClient(p.client_id),
          getContent(p.client_id),
          getEventsByClient(p.client_id).catch(() => [] as CalEvent[]),
          listRequestsForClient(p.client_id),
        ]);
        if (active) {
          setClient(c ?? null);
          // Solo lo que ya preparó una persona: preparado o subido.
          setPosts(pts.filter((pt) => pt.status === "scheduled" || pt.status === "published"));
          setEvents(evs);
          setRequests(reqs);
        }
      }
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [router]);

  // post_id → cantidad de recomendaciones ya enviadas (evita duplicados).
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

  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthPosts = useMemo(
    () => posts.filter((p) => p.date.startsWith(`${monthKey}-`)),
    [posts, monthKey],
  );
  const subidos = monthPosts.filter((p) => p.status === "published").length;
  const preparados = monthPosts.length - subidos;
  const monthLabel = MONTHS_ES[month];

  function prevMonth() {
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else setMonth(month - 1);
  }
  function nextMonth() {
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else setMonth(month + 1);
  }

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
            <div className={portalStyles.heroEyebrow}>Calendario de contenido</div>
            <h1 className={portalStyles.heroTitle}>Agenda de publicaciones</h1>
            <p className={portalStyles.heroSub}>
              El mismo calendario con el que trabaja el equipo: qué se sube
              cada día y en qué red. Tocá una pieza para verla y, si querés,{" "}
              <strong>dejar una recomendación</strong>; te respondemos por el
              portal.
            </p>
          </div>
        </section>

        {/* Resumen del mes + leyenda */}
        <div
          style={{
            ...panelS,
            display: "flex",
            gap: 14,
            flexWrap: "wrap",
            alignItems: "center",
            fontSize: 12,
            borderLeft: "3px solid var(--sand)",
          }}
        >
          <span style={{ color: "var(--text-muted)" }}>
            <strong style={{ color: "var(--deep-green)" }}>{monthPosts.length}</strong>{" "}
            contenido{monthPosts.length === 1 ? "" : "s"} en {monthLabel.toLowerCase()}
          </span>
          <span style={{ color: PIECE_STATE_META.subido.color }}>
            ✓ <strong>{subidos}</strong> subido{subidos === 1 ? "" : "s"}
          </span>
          <span style={{ color: PIECE_STATE_META.preparado.color }}>
            ● <strong>{preparados}</strong> preparado{preparados === 1 ? "" : "s"}
          </span>
          <span style={{ flex: 1 }} />
          <LegendTitle>Tipo</LegendTitle>
          {(["valor", "oferta", "engagement"] as ContentType[]).map((t) => (
            <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600, color: "var(--deep-green)" }}>
              <TypeBadge type={t} />
              {CONTENT_TYPE_META[t].label}
            </span>
          ))}
          <LegendTitle>Estado</LegendTitle>
          <span style={{ color: "var(--text-muted)" }}>lleno = preparado · ✓ = subido</span>
        </div>

        {/* Calendario */}
        <div style={panelS}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              marginBottom: 8,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--deep-green)" }}>
              {monthLabel} {year}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={prevMonth} style={navBtnS} aria-label="Mes anterior">‹</button>
              <button
                type="button"
                onClick={() => {
                  setMonth(today.getMonth());
                  setYear(today.getFullYear());
                }}
                style={navBtnS}
              >
                Hoy
              </button>
              <button type="button" onClick={nextMonth} style={navBtnS} aria-label="Mes siguiente">›</button>
            </div>
          </div>

          <ContentMonthGrid
            year={year}
            month={month}
            posts={posts}
            events={events}
            todayIso={todayIso}
            markOverdue={false}
            onOpenPiece={setOpenPiece}
          />

          {monthPosts.length === 0 && (
            <div style={{ marginTop: 14, fontSize: 13, color: "var(--text-muted)", fontStyle: "italic" }}>
              Todavía no hay publicaciones preparadas para {monthLabel.toLowerCase()}.
            </div>
          )}
        </div>
      </main>

      {openPiece && (
        <PieceDetailModal
          post={openPiece}
          existingCount={recoCountByPost.get(openPiece.id) ?? 0}
          onClose={() => setOpenPiece(null)}
          onAddReco={() => {
            const p = openPiece;
            setOpenPiece(null);
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

// Detalle de una pieza, solo lectura: lo que el equipo cargó (descripción +
// foto) y el botón para dejar una recomendación.
function PieceDetailModal({
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
  const state = pieceState(post);
  const text = (post.brief ?? "").trim() || (post.copy ?? "").trim();
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
        role="dialog"
        aria-label="Detalle de la publicación"
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
          aria-label="Cerrar"
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
          {longDate(post.date)}
          {post.time ? ` · ${post.time}` : ""}
        </div>
        <h2
          style={{
            fontSize: 20,
            fontWeight: 700,
            marginBottom: 10,
            color: "var(--deep-green)",
            lineHeight: 1.3,
          }}
        >
          {pieceTitle(post)}
        </h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
          <StatePill state={state} overdue={false} />
          {post.status === "published" && post.publishedAt && (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Subido el {new Date(post.publishedAt).toLocaleDateString("es-UY")}
            </span>
          )}
        </div>

        {post.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.imageUrl}
            alt="Foto de la publicación"
            style={{
              width: "100%",
              maxHeight: 320,
              objectFit: "cover",
              borderRadius: "var(--r-sm)",
              marginBottom: 14,
            }}
          />
        )}

        {text && (
          <div
            style={{
              fontSize: 13,
              color: "var(--deep-green)",
              lineHeight: 1.55,
              whiteSpace: "pre-wrap",
              padding: 12,
              background: "var(--off-white)",
              borderRadius: "var(--r-sm)",
              marginBottom: 14,
            }}
          >
            {text}
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
