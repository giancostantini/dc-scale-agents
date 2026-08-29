"use client";

/**
 * ConsultantWidget — chat flotante del Gerente General.
 *
 * - FAB cerrado bottom-right con badge si hay briefing sin leer.
 * - Panel abierto: chat con streaming SSE contra /api/consultant/global.
 * - Persistencia: server-side (consultant_messages). localStorage solo guarda
 *   { open: bool, draft: string } para UX.
 * - Pathname hint: si estás en /cliente/[id], se manda como activeClient para
 *   que el backend pre-cargue ese cliente.
 *
 * La lógica del chat (carga por persona, streaming, briefing) vive en
 * useGlobalConsultantChat — compartida con la página /gerente. Acá queda
 * solo el markup del panel flotante.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  useGlobalConsultantChat,
  type UIMessage,
} from "./consultant/useGlobalConsultantChat";
import {
  PERSONA_LABEL,
  PERSONA_EMOJI,
  PERSONA_SHORT,
  personasVisibles,
} from "@/lib/gerencias";
import styles from "./ConsultantWidget.module.css";

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
  const [briefingShown, setBriefingShown] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const chat = useGlobalConsultantChat({ activeClient });
  const {
    profile,
    messages,
    draft,
    setDraft,
    sending,
    persona,
    setPersona,
    hasUnreadBriefing,
    send,
    clearChat,
    markBriefingRead,
    abort,
  } = chat;

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // ===== Hydration =====
  useEffect(() => {
    const ui = loadUiState();
    setOpen(ui.open);
    setDraft(ui.draft);
    setHydrated(true);
    // setDraft es estable (viene de useState dentro del hook)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== Persist UI state =====
  useEffect(() => {
    if (!hydrated) return;
    saveUiState({ open, draft });
  }, [open, draft, hydrated]);

  // ===== Auto scroll =====
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ block: "end" });
    });
  }, [messages, open]);

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
    abort();
  }, [abort]);

  const handleNewConversation = useCallback(() => {
    // Limpiar REAL: archiva la conversación server-side (queda guardada
    // despinneada) y el próximo mensaje arranca una nueva.
    if (
      !window.confirm(
        "¿Empezar de cero con este gerente? La conversación actual se archiva (no se borra) y el chat arranca vacío.",
      )
    )
      return;
    clearChat();
  }, [clearChat]);

  const handleKey = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    },
    [send],
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
        aria-label="Abrir Gerente General"
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
    <div className={styles.panel} role="dialog" aria-label="Gerente General">
      <div className={styles.header}>
        <div>
          <div className={styles.headerTitle}>{PERSONA_LABEL[persona]}</div>
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

      {/* Selector de persona (mig 097): los 7 gerentes — team no ve
          finanzas/ventas (mismo gating server-side + RLS de digests) */}
      <div style={{ display: "flex", gap: 6, padding: "6px 12px", borderBottom: "1px solid rgba(10,26,12,0.08)", flexWrap: "wrap" }}>
        {personasVisibles(
          profile.role === "director" ? "director" : "team",
        ).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPersona(p)}
            disabled={sending}
            style={{
              padding: "4px 10px",
              fontSize: 11,
              fontWeight: 600,
              fontFamily: "inherit",
              borderRadius: 999,
              cursor: "pointer",
              border: persona === p ? "1px solid var(--deep-green)" : "1px solid rgba(10,26,12,0.15)",
              background: persona === p ? "var(--deep-green)" : "transparent",
              color: persona === p ? "var(--off-white)" : "var(--deep-green)",
            }}
          >
            {PERSONA_EMOJI[p]} {PERSONA_SHORT[p]}
            {p === "general" && hasUnreadBriefing ? " •" : ""}
          </button>
        ))}
      </div>

      {briefingShown && messages.some((m) => m.isBriefing) && (
        <div className={styles.briefingBanner}>
          <span>Buen día {profile.name.split(" ")[0]} — tu briefing del día</span>
        </div>
      )}

      <div className={styles.messages}>
        {messages.length === 0 ? (
          <div className={styles.empty}>
            Hola {profile.name.split(" ")[0]}, soy el Gerente General.
            <br />
            Preguntame sobre cualquier cliente, gerencia o estado de la operación.
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
            onClick={send}
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
