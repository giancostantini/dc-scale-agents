"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import styles from "./ReportCommentsDrawer.module.css";

interface ReportComment {
  id: string;
  report_id: string;
  client_id: string;
  author_id: string;
  author_role: "director" | "team" | "client";
  body: string;
  created_at: string;
}

export interface ReportCommentsDrawerProps {
  open: boolean;
  reportId: string | null;
  reportLabel: string;
  onClose: () => void;
}

export default function ReportCommentsDrawer({
  open,
  reportId,
  reportLabel,
  onClose,
}: ReportCommentsDrawerProps) {
  const [comments, setComments] = useState<ReportComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derived state pattern (React 19): cuando cambia reportId, reseteamos
  // loading/error/comments durante el render. Evita el cascading render
  // del useEffect+setState.
  const [lastKey, setLastKey] = useState<string | null>(null);
  const currentKey = open && reportId ? reportId : null;
  if (lastKey !== currentKey) {
    setLastKey(currentKey);
    setComments([]);
    setError(null);
    setInput("");
    setLoading(currentKey !== null);
  }

  // Load comments cuando se abre con un reportId
  useEffect(() => {
    if (!open || !reportId) return;
    let active = true;
    (async () => {
      try {
        const supabase = getSupabase();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          if (active) {
            setError("Tu sesión expiró.");
            setLoading(false);
          }
          return;
        }
        const res = await fetch(`/api/portal/reports/${reportId}/comments`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = (await res.json().catch(() => ({}))) as {
          comments?: ReportComment[];
          error?: string;
        };
        if (!active) return;
        if (!res.ok) {
          setError(data.error ?? `Error ${res.status}.`);
          setLoading(false);
          return;
        }
        setComments(data.comments ?? []);
        setLoading(false);
      } catch (err) {
        console.error("comments fetch error:", err);
        if (active) {
          setError("Error de red.");
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [open, reportId]);

  // ESC para cerrar
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, submitting, onClose]);

  if (!open || !reportId) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const text = input.trim();
    if (!text) return;
    setError(null);
    setSubmitting(true);
    try {
      const supabase = getSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setError("Tu sesión expiró.");
        setSubmitting(false);
        return;
      }
      const res = await fetch(`/api/portal/reports/${reportId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ body: text }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        comment?: ReportComment;
        error?: string;
      };
      if (!res.ok || !data.comment) {
        setError(data.error ?? `Error ${res.status}.`);
        setSubmitting(false);
        return;
      }
      setComments((prev) => [...prev, data.comment!]);
      setInput("");
      setSubmitting(false);
    } catch (err) {
      console.error("comment submit error:", err);
      setError("Error de red.");
      setSubmitting(false);
    }
  }

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="comments-drawer-title"
    >
      <aside className={styles.drawer}>
        <header className={styles.header}>
          <div>
            <div className={styles.eyebrow}>Comentarios · {reportLabel}</div>
            <h2 id="comments-drawer-title" className={styles.title}>
              Tu feedback sobre este reporte
            </h2>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            disabled={submitting}
            aria-label="Cerrar"
          >
            ×
          </button>
        </header>

        <div className={styles.body}>
          {loading && <div className={styles.muted}>Cargando…</div>}

          {!loading && comments.length === 0 && !error && (
            <div className={styles.empty}>
              Todavía no hay comentarios. Dejá tus dudas o ideas y el equipo
              te va a responder acá mismo.
            </div>
          )}

          {comments.map((c) => (
            <CommentBubble key={c.id} comment={c} />
          ))}

          {error && <div className={styles.error}>{error}</div>}
        </div>

        <form className={styles.composer} onSubmit={submit}>
          <textarea
            className={styles.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribí tu comentario…"
            rows={3}
            disabled={submitting}
            maxLength={2000}
          />
          <div className={styles.composerFooter}>
            <span className={styles.charCount}>{input.length}/2000</span>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={!input.trim() || submitting}
            >
              {submitting ? "Enviando…" : "Enviar"}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}

function CommentBubble({ comment }: { comment: ReportComment }) {
  const isClient = comment.author_role === "client";
  const date = new Date(comment.created_at).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const roleLabel =
    comment.author_role === "client"
      ? "Vos"
      : comment.author_role === "director"
        ? "Director D&C"
        : "Equipo D&C";

  return (
    <div className={isClient ? styles.bubbleClient : styles.bubbleTeam}>
      <div className={styles.bubbleMeta}>
        <span className={styles.bubbleRole}>{roleLabel}</span>
        <span className={styles.bubbleDate}>{date}</span>
      </div>
      <div className={styles.bubbleBody}>{comment.body}</div>
    </div>
  );
}
