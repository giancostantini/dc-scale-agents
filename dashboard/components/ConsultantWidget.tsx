"use client";

/**
 * ConsultantWidget — chat flotante del Consultor global.
 *
 * - FAB cerrado bottom-right con badge si hay briefing sin leer.
 * - Panel abierto: chat con streaming SSE contra /api/consultant/global.
 * - Persistencia: server-side (consultant_messages). localStorage solo guarda
 *   { open: bool, draft: string } para UX.
 * - Pathname hint: si estás en /cliente/[id], se manda como activeClient para
 *   que el backend pre-cargue ese cliente.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getSupabase } from "@/lib/supabase/client";
import { getCurrentProfile, type Profile } from "@/lib/supabase/auth";
import { streamChat, type StreamMessageInput } from "@/lib/consultant-stream";
import styles from "./ConsultantWidget.module.css";

interface UIMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  isBriefing?: boolean;
  isError?: boolean;
}

interface StoredUiState {
  open: boolean;
  draft: string;
}

const LOCALSTORAGE_KEY = "dc:consultant-widget-ui";

function loadUiState(): StoredUiState {
  if (typeof window === "undefined") return { open: false, draft: "" };
  try {
    const raw = window.localStorage.getItem(LOCALSTORAGE_KEY);
    if (!raw) return { open: false, draft: "" };
    const parsed = JSON.parse(raw) as Partial<StoredUiState>;
    return {
      open: Boolean(parsed.open),
      draft: typeof parsed.draft === "string" ? parsed.draft : "",
    };
  } catch {
    return { open: false, draft: "" };
  }
}

function saveUiState(state: StoredUiState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota errors */
  }
}

function extractActiveClient(pathname: string | null): string | null {
  if (!pathname) return null;
  const match = pathname.match(/^\/cliente\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export default function ConsultantWidget() {
  const pathname = usePathname();
  const activeClient = extractActiveClient(pathname);

  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [hasUnreadBriefing, setHasUnreadBriefing] = useState(false);
  const [briefingShown, setBriefingShown] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ===== Hydration =====
  useEffect(() => {
    const ui = loadUiState();
    setOpen(ui.open);
    setDraft(ui.draft);
    setHydrated(true);
  }, []);

  // ===== Persist UI state =====
  useEffect(() => {
    if (!hydrated) return;
    saveUiState({ open, draft });
  }, [open, draft, hydrated]);

  // ===== Load profile + initial conversation + briefing status =====
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await getCurrentProfile();
      if (cancelled) return;
      setProfile(p);

      // Si es client role, no cargamos nada — el widget no debe siquiera
      // montarse para ellos, pero defensa en profundidad.
      if (!p || p.role === "client") return;

      const supabase = getSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      // Cargar conversación pinned + briefing status en paralelo
      const [convRes, briefRes] = await Promise.all([
        fetch("/api/consultant/global/conversation", {
          headers: { authorization: `Bearer ${session.access_token}` },
        }).then((r) => (r.ok ? r.json() : null)),
        fetch("/api/consultant/global/briefing-status", {
          headers: { authorization: `Bearer ${session.access_token}` },
        }).then((r) => (r.ok ? r.json() : null)),
      ]);

      if (cancelled) return;

      if (convRes?.messages) {
        type RawMsg = {
          id: string;
          role: "user" | "assistant";
          content: string;
          is_briefing: boolean;
        };
        setMessages(
          (convRes.messages as RawMsg[]).map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            isBriefing: m.is_briefing,
          })),
        );
      }

      if (briefRes?.hasUnread) {
        setHasUnreadBriefing(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ===== Auto scroll =====
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ block: "end" });
    });
  }, [messages, open]);

  // ===== Mark briefing read when user opens =====
  const markBriefingRead = useCallback(async () => {
    if (!hasUnreadBriefing) return;
    const supabase = getSupabase();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    try {
      await fetch("/api/consultant/global/mark-read", {
        method: "POST",
        headers: { authorization: `Bearer ${session.access_token}` },
      });
      setHasUnreadBriefing(false);
    } catch {
      /* non-critical */
    }
  }, [hasUnreadBriefing]);

  // ===== Handlers =====

  const handleOpen = useCallback(() => {
    setOpen(true);
    if (hasUnreadBriefing) {
      setBriefingShown(true);
      markBriefingRead();
    }
    // Focus textarea después del render
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [hasUnreadBriefing, markBriefingRead]);

  const handleClose = useCallback(() => {
    setOpen(false);
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;

    const supabase = getSupabase();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "No hay sesión. Refrescá la página e iniciá sesión.",
          isError: true,
        },
      ]);
      return;
    }

    // Push user message + placeholder assistant
    const userMsg: UIMessage = { role: "user", content: text };
    const assistantPlaceholder: UIMessage = { role: "assistant", content: "" };
    setMessages((prev) => [...prev, userMsg, assistantPlaceholder]);
    setDraft("");
    setSending(true);

    // Build messages para el endpoint (sin briefings ni errores)
    const historyForApi: StreamMessageInput[] = [
      ...messages
        .filter((m) => !m.isError)
        .map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: text },
    ];

    const controller = new AbortController();
    abortRef.current = controller;

    let errored = false;

    try {
      await streamChat(
        {
          messages: historyForApi,
          activeClient,
          accessToken: session.access_token,
          signal: controller.signal,
        },
        {
          onDelta: (delta) => {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === "assistant") {
                next[next.length - 1] = {
                  ...last,
                  content: last.content + delta,
                };
              }
              return next;
            });
          },
          onToolResult: (name, ok, detail) => {
            if (name === "run_agent" && ok) {
              const agent = detail.agent as string | undefined;
              const client = detail.client as string | undefined;
              const runId = detail.runId as number | undefined;
              const note = `\n\n_[dispatch: ${agent} para ${client}${runId ? ` · run #${runId}` : ""}]_`;
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last && last.role === "assistant") {
                  next[next.length - 1] = {
                    ...last,
                    content: last.content + note,
                  };
                }
                return next;
              });
            }
            if (!ok) {
              const err = detail.error as string | undefined;
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last && last.role === "assistant") {
                  next[next.length - 1] = {
                    ...last,
                    content:
                      last.content +
                      `\n\n_[error en ${name}: ${err ?? "desconocido"}]_`,
                  };
                }
                return next;
              });
            }
          },
          onError: (message) => {
            errored = true;
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === "assistant" && !last.content) {
                // Reemplazar placeholder vacío con error
                next[next.length - 1] = {
                  role: "assistant",
                  content: message,
                  isError: true,
                };
              } else {
                next.push({
                  role: "assistant",
                  content: message,
                  isError: true,
                });
              }
              return next;
            });
          },
        },
      );
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        errored = true;
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Error de red: ${err.message}`,
            isError: true,
          },
        ]);
      }
    } finally {
      abortRef.current = null;
      setSending(false);
      // Si el placeholder quedó vacío sin error, lo removemos (caso raro)
      if (!errored) {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === "assistant" && !last.content) {
            return prev.slice(0, -1);
          }
          return prev;
        });
      }
    }
  }, [draft, sending, messages, activeClient]);

  const handleNewConversation = useCallback(async () => {
    // "Nueva conversación" en práctica = vaciar el view local. La pinned
    // sigue siendo la misma server-side; el contexto de Claude usa todos
    // los mensajes del array que mandamos. Si el user quiere reset
    // completo se puede mejorar luego (DELETE messages? otra conv?).
    // Por ahora hacemos visual reset.
    if (
      !window.confirm(
        "¿Empezar una conversación nueva? Esto limpia el chat visible (el historial queda guardado).",
      )
    )
      return;
    setMessages([]);
  }, []);

  const handleKey = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // ===== Render =====

  // Solo team/director ven el widget. Si todavía no cargó el profile,
  // no renderizamos nada (evita flash del FAB en /portal etc).
  if (!profile || profile.role === "client") return null;

  if (!open) {
    return (
      <button
        type="button"
        className={styles.fab}
        onClick={handleOpen}
        aria-label="Abrir consultor"
      >
        <ChatIcon />
        {hasUnreadBriefing && <span className={styles.fabBadge} />}
      </button>
    );
  }

  const headerSubtitle = activeClient
    ? `Contexto activo: ${activeClient}`
    : `${profile.role === "director" ? "Director" : "Team"} · ${profile.name}`;

  return (
    <div className={styles.panel} role="dialog" aria-label="Consultor">
      <div className={styles.header}>
        <div>
          <div className={styles.headerTitle}>Consultor</div>
          <div className={styles.headerSub}>{headerSubtitle}</div>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={handleNewConversation}
            title="Limpiar chat"
            aria-label="Nueva conversación"
          >
            <NewChatIcon />
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={handleClose}
            title="Cerrar"
            aria-label="Cerrar"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      {briefingShown && messages.some((m) => m.isBriefing) && (
        <div className={styles.briefingBanner}>
          <span>Buen día {profile.name.split(" ")[0]} — tu briefing del día</span>
        </div>
      )}

      <div className={styles.messages}>
        {messages.length === 0 ? (
          <div className={styles.empty}>
            Hola {profile.name.split(" ")[0]}, soy el consultor del equipo.
            <br />
            Preguntame sobre cualquier cliente, agente o estado de la operación.
          </div>
        ) : (
          messages.map((m, idx) => (
            <MessageBubble
              key={m.id ?? `${idx}-${m.role}`}
              message={m}
              isLastAssistant={
                idx === messages.length - 1 &&
                m.role === "assistant" &&
                sending
              }
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className={styles.composer}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          placeholder={
            activeClient
              ? `Pregunta sobre ${activeClient} o de cualquier cosa…`
              : "Pregúntame algo…"
          }
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKey}
          disabled={sending}
          rows={2}
        />
        <div className={styles.composerRow}>
          <span className={styles.hintText}>
            Enter = enviar · Shift+Enter = nueva línea
          </span>
          <button
            type="button"
            className={styles.sendBtn}
            onClick={handleSend}
            disabled={!draft.trim() || sending}
          >
            {sending ? "Enviando…" : "Enviar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function MessageBubble({
  message,
  isLastAssistant,
}: {
  message: UIMessage;
  isLastAssistant: boolean;
}) {
  if (message.isError) {
    return (
      <div className={`${styles.bubbleRow} ${styles.bubbleRowAssistant}`}>
        <div className={styles.errorBubble}>{message.content}</div>
      </div>
    );
  }

  const rowClass = `${styles.bubbleRow} ${
    message.role === "user" ? styles.bubbleRowUser : styles.bubbleRowAssistant
  }`;
  const bubbleClass = `${styles.bubble} ${
    message.role === "user" ? styles.bubbleUser : styles.bubbleAssistant
  } ${message.isBriefing ? styles.bubbleBriefing : ""}`;

  return (
    <div className={rowClass}>
      <div className={bubbleClass}>
        {message.isBriefing && (
          <div className={styles.bubbleBriefingTag}>BRIEFING DEL DÍA</div>
        )}
        {message.content ||
          (isLastAssistant && (
            <span className={styles.typingDots}>
              <span /> <span /> <span />
            </span>
          ))}
      </div>
    </div>
  );
}

function ChatIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function NewChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
