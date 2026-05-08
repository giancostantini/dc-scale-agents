"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import styles from "./ConsultorHistoryPanel.module.css";

interface Conversation {
  id: string;
  title: string | null;
  updated_at: string;
  message_count: number;
}

interface Props {
  currentConversationId: string | null;
  /** Se incrementa desde fuera cuando hay actividad nueva (mensaje enviado, etc.) → fuerza refetch. */
  refreshTick?: number;
  onSelect: (id: string) => void;
  onNewConversation: () => void;
}

/** Formato "hace X" — definido fuera del componente porque usa Date.now (impuro). */
function formatRelative(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  const diffH = Math.round(diffMs / 3_600_000);
  const diffD = Math.round(diffMs / 86_400_000);
  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `hace ${diffMin} min`;
  if (diffH < 24) return `hace ${diffH} h`;
  if (diffD < 7) return `hace ${diffD} d`;
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: diffD > 365 ? "2-digit" : undefined,
  });
}

/**
 * Panel colapsable con historial de conversaciones del Consultor IA.
 * Vive abajo del ConsultorChatPanel en /portal home, ocupando el espacio
 * vacío que deja el sidebar más alto que el chat. Cuando se expande,
 * tiene max-height + scroll interno — no extiende la página.
 */
export default function ConsultorHistoryPanel({
  currentConversationId,
  refreshTick = 0,
  onSelect,
  onNewConversation,
}: Props) {
  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch al montar y cuando: refreshTick cambie (actividad externa) o se abra
  // el panel (refrescar por si cambió algo desde la última carga). Usamos IIFE
  // async para evitar setState síncrono en el cuerpo del effect (regla React 19).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const supabase = getSupabase();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!active) return;
        if (!session) {
          setError("Tu sesión expiró.");
          setLoading(false);
          return;
        }
        setLoading(true);
        setError(null);
        const res = await fetch("/api/portal/consultant/conversations", {
          method: "GET",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!active) return;
        const data = (await res.json().catch(() => ({}))) as {
          conversations?: Conversation[];
          error?: string;
        };
        if (!active) return;
        if (!res.ok) {
          setError(data.error ?? "No pude cargar el historial.");
          setConversations([]);
          setLoading(false);
          return;
        }
        setConversations(data.conversations ?? []);
        setLoading(false);
      } catch (err) {
        console.error("history fetch error:", err);
        if (active) {
          setError("Error de red cargando el historial.");
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [open, refreshTick]);

  const total = conversations.length;

  function handleSelect(id: string) {
    onSelect(id);
    setOpen(false);
  }

  async function handleNew() {
    onNewConversation();
    // refetch después de crear; el padre llamará a setRefreshTick → useEffect
    setOpen(false);
  }

  return (
    <section className={styles.panel} aria-label="Historial de conversaciones">
      <button
        type="button"
        className={styles.header}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className={styles.headerLabel}>
          Historial de conversaciones
          <span className={styles.count}>{total > 0 ? `(${total})` : ""}</span>
        </span>
        <span className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}>▾</span>
      </button>

      <div className={`${styles.body} ${open ? styles.bodyOpen : ""}`}>
        <div className={styles.actions}>
          <button type="button" className={styles.newBtn} onClick={handleNew}>
            + Nueva conversación
          </button>
        </div>

        <div className={styles.list}>
          {loading && conversations.length === 0 && (
            <div className={styles.muted}>Cargando…</div>
          )}
          {error && <div className={styles.error}>{error}</div>}
          {!loading && !error && conversations.length === 0 && (
            <div className={styles.muted}>
              Todavía no hay conversaciones guardadas. La próxima que tengas con el
              Advisor va a quedar registrada acá.
            </div>
          )}
          {conversations.map((c) => {
            const isActive = c.id === currentConversationId;
            return (
              <button
                key={c.id}
                type="button"
                className={`${styles.item} ${isActive ? styles.itemActive : ""}`}
                onClick={() => handleSelect(c.id)}
              >
                <div className={styles.itemTitle}>
                  {c.title || "Conversación sin título"}
                </div>
                <div className={styles.itemMeta}>
                  {formatRelative(c.updated_at)} · {c.message_count} mensaje
                  {c.message_count === 1 ? "" : "s"}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
