"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase/client";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import styles from "./ConsultorChatPanel.module.css";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  isWelcome?: boolean;
}

const SUGGESTED_QUESTIONS = [
  "¿Cómo va mi cuenta este mes?",
  "Resumime el último reporte aprobado",
  "¿Qué campañas tengo activas?",
  "¿Cuáles son mis próximas reuniones?",
];

/**
 * Carga el welcome cacheado (compartido entre modo legacy y modo persistencia
 * cuando la conversación todavía está vacía).
 */
async function loadWelcomeInto(
  setMessages: (msgs: ChatMessage[]) => void,
  accessToken: string,
  active: boolean,
): Promise<void> {
  const res = await fetch("/api/portal/consultant/welcome", {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!active) return;
  const data = (await res.json().catch(() => ({}))) as {
    welcome?: string;
    error?: string;
  };
  if (!res.ok || !data.welcome) {
    throw new Error(data.error ?? "No pude cargar el resumen del día.");
  }
  setMessages([{ role: "assistant", content: data.welcome, isWelcome: true }]);
}

export interface ConsultorChatPanelProps {
  clientName: string;
  /** Si true, muestra el botón "Ampliar" que linkea a /portal/consultor. */
  showExpandButton?: boolean;
  /** Variante visual: "embedded" (en el home, con header propio) o "fullscreen". */
  variant?: "embedded" | "fullscreen";
  /**
   * ID de la conversación a cargar/persistir.
   *  - `undefined` → modo legacy: sin persistencia, welcome cacheado, sin conversation_id.
   *  - `null` → persistencia activada pero todavía no hay conversación (se crea lazy en el primer envío).
   *  - `string` → cargar mensajes de esa conversación.
   */
  conversationId?: string | null;
  /** Llamado cuando se crea una nueva conversación lazy (al primer envío con conversationId=null). */
  onConversationCreated?: (id: string) => void;
  /** Llamado después de cada turno exitoso para que el padre refresque el historial. */
  onActivity?: () => void;
}

/**
 * Panel de chat con D&C Advisor (el consultor IA del cliente).
 *
 * Modo legacy (sin `conversationId`):
 *   - GET /api/portal/consultant/welcome (cacheado) como primer assistant message.
 *   - POST /api/portal/consultant en cada turno, sin persistencia.
 *
 * Modo persistencia (con `conversationId`):
 *   - Si conversationId === null: muestra welcome y al primer envío del user
 *     crea una conversación nueva (POST /api/portal/consultant/conversations).
 *   - Si conversationId === string: GET /api/portal/consultant/conversations/[id]
 *     para cargar mensajes persistidos (si vacío, vuelve a mostrar welcome).
 *   - Cada POST a /api/portal/consultant incluye conversation_id; backend persiste.
 *
 * Reusable en /portal (embedded, persistido) y /portal/consultor (fullscreen, legacy hoy).
 */
export default function ConsultorChatPanel({
  clientName,
  showExpandButton = false,
  variant = "embedded",
  conversationId,
  onConversationCreated,
  onActivity,
}: ConsultorChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [welcomeLoading, setWelcomeLoading] = useState(true);
  const [welcomeError, setWelcomeError] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Cache local del id usado en send() — necesario en el lazy-create cuando el
  // padre todavía no propagó el nuevo id como prop. Después converge.
  const lazyCreatedIdRef = useRef<string | null>(null);
  // Modo persistencia: el padre nos pasó conversationId (string o null), no undefined.
  const persistMode = conversationId !== undefined;
  const effectiveConversationId = conversationId ?? lazyCreatedIdRef.current;

  // Cargar mensajes (modo persistencia con conversationId real) o welcome (modo legacy / nueva conversación)
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
          setWelcomeError("Tu sesión expiró.");
          setWelcomeLoading(false);
          return;
        }
        setWelcomeLoading(true);
        setWelcomeError(null);
        setChatError(null);

        // Caso 1: persistencia con conversación existente → cargar mensajes
        if (persistMode && conversationId) {
          // Si el id que está cargando coincide con el que acabamos de lazy-crear,
          // skipeamos el fetch (los mensajes ya están en local desde send()).
          if (lazyCreatedIdRef.current === conversationId) {
            lazyCreatedIdRef.current = null;
            setWelcomeLoading(false);
            return;
          }

          const res = await fetch(
            `/api/portal/consultant/conversations/${conversationId}`,
            {
              method: "GET",
              headers: { Authorization: `Bearer ${session.access_token}` },
            },
          );
          if (!active) return;

          const data = (await res.json().catch(() => ({}))) as {
            messages?: Array<{
              role: "user" | "assistant";
              content: string;
              is_welcome: boolean;
            }>;
            error?: string;
          };
          if (!active) return;

          if (!res.ok) {
            setWelcomeError(data.error ?? "No pude cargar la conversación.");
            setWelcomeLoading(false);
            return;
          }

          const persisted = (data.messages ?? []).map((m) => ({
            role: m.role,
            content: m.content,
            isWelcome: m.is_welcome,
          }));

          // Si la conversación está vacía, fallback al welcome cacheado
          if (persisted.length === 0) {
            await loadWelcomeInto(setMessages, session.access_token, active);
            if (active) setWelcomeLoading(false);
            return;
          }

          setMessages(persisted);
          setWelcomeLoading(false);
          return;
        }

        // Caso 2: modo legacy o persistencia sin conversación todavía → welcome
        await loadWelcomeInto(setMessages, session.access_token, active);
        if (active) setWelcomeLoading(false);
      } catch (err) {
        console.error("chat init error:", err);
        if (active) {
          setWelcomeError("Error de red cargando el chat.");
          setWelcomeLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [conversationId, persistMode]);

  // Auto-scroll a fondo cuando hay mensaje nuevo
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, sending]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setChatError(null);

    const newMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: trimmed },
    ];
    setMessages(newMessages);
    setInput("");
    setSending(true);

    try {
      const supabase = getSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setChatError("Tu sesión expiró. Volvé a iniciar sesión.");
        setMessages(messages);
        setSending(false);
        return;
      }

      // En modo persistencia sin conversación todavía: crear una lazy.
      let convId = effectiveConversationId;
      if (persistMode && !convId) {
        const createRes = await fetch("/api/portal/consultant/conversations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({}),
        });
        const createData = (await createRes.json().catch(() => ({}))) as {
          id?: string;
          error?: string;
        };
        if (!createRes.ok || !createData.id) {
          setChatError(createData.error ?? "No pude iniciar la conversación.");
          setMessages(messages);
          setSending(false);
          return;
        }
        convId = createData.id;
        // Marcamos para que el useEffect skipee el re-fetch cuando el padre
        // empuje el id de vuelta como prop (los mensajes ya están en local).
        lazyCreatedIdRef.current = convId;
        onConversationCreated?.(convId);
      }

      // El backend solo recibe los turnos reales de chat, no el welcome.
      const chatTurns = newMessages
        .filter((m) => !m.isWelcome)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/portal/consultant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          messages: chatTurns,
          ...(persistMode && convId ? { conversation_id: convId } : {}),
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        reply?: string;
        error?: string;
      };

      if (!res.ok) {
        setChatError(data.error ?? "Error desconocido.");
        setMessages(messages);
        setSending(false);
        return;
      }

      setMessages([
        ...newMessages,
        { role: "assistant", content: data.reply ?? "" },
      ]);
      onActivity?.();
    } catch (err) {
      console.error("chat send error:", err);
      setChatError("Error de red. Probá de nuevo.");
      setMessages(messages);
    } finally {
      setSending(false);
    }
  }

  const showSuggestions =
    !welcomeLoading &&
    !welcomeError &&
    messages.length === 1 &&
    messages[0]?.isWelcome;

  return (
    <section
      className={`${styles.panel} ${variant === "fullscreen" ? styles.fullscreen : ""}`}
      aria-label="Chat con D&C Advisor"
    >
      <header className={styles.panelHeader}>
        <div className={styles.headerLeft}>
          <div className={styles.consultorAvatar}>✦</div>
          <div>
            <div className={styles.headerTitle}>D&C Advisor</div>
            <div className={styles.headerSub}>{clientName}</div>
          </div>
        </div>
        {showExpandButton && (
          <Link
            href="/portal/consultor"
            className={styles.expandBtn}
            title="Ampliar a pantalla completa"
          >
            ⛶ Ampliar
          </Link>
        )}
      </header>

      <div className={styles.messages} ref={scrollRef}>
        {welcomeLoading && (
          <WelcomeSkeleton />
        )}

        {welcomeError && (
          <div className={styles.welcomeError}>
            <strong>No pude cargar el resumen automático.</strong>
            <span>{welcomeError}</span>
            <span className={styles.welcomeErrorHint}>
              Igual podés preguntarme lo que quieras abajo.
            </span>
          </div>
        )}

        {messages.map((m, i) => (
          <ChatBubble
            key={i}
            role={m.role}
            isWelcome={m.isWelcome}
            content={m.content}
          />
        ))}

        {sending && (
          <div className={styles.thinkingRow}>
            <div className={styles.thinkingAvatar}>✦</div>
            <div className={styles.thinkingDots}>
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
      </div>

      {showSuggestions && (
        <div className={styles.suggestions}>
          <div className={styles.suggestionsLabel}>Te puede interesar</div>
          <div className={styles.suggestionsGrid}>
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                className={styles.suggestionBtn}
                onClick={() => send(q)}
                disabled={sending}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      <form
        className={styles.composer}
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Preguntale al consultor…"
          rows={2}
          disabled={sending || welcomeLoading}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
        />
        <button
          type="submit"
          className={styles.sendBtn}
          disabled={!input.trim() || sending || welcomeLoading}
          aria-label="Enviar mensaje"
        >
          →
        </button>
      </form>

      {chatError && (
        <div className={styles.chatError}>{chatError}</div>
      )}
    </section>
  );
}

function ChatBubble({
  role,
  isWelcome,
  content,
}: {
  role: "user" | "assistant";
  isWelcome?: boolean;
  content: string;
}) {
  if (role === "user") {
    return (
      <div className={styles.userRow}>
        <div className={styles.userBubble}>{content}</div>
      </div>
    );
  }
  return (
    <div className={styles.assistantRow}>
      <div className={styles.assistantAvatar}>✦</div>
      <div
        className={`${styles.assistantBubble} ${isWelcome ? styles.welcomeBubble : ""}`}
      >
        {isWelcome && (
          <div className={styles.welcomeLabel}>Tu resumen del día</div>
        )}
        <MarkdownRenderer content={content} shiftHeadings />
      </div>
    </div>
  );
}

function WelcomeSkeleton() {
  return (
    <div className={styles.assistantRow}>
      <div className={styles.assistantAvatar}>✦</div>
      <div className={styles.skeleton}>
        <div className={styles.skelLabel}>Preparando tu resumen…</div>
        <div className={styles.skelLine} style={{ width: "85%" }} />
        <div className={styles.skelLine} style={{ width: "92%" }} />
        <div className={styles.skelLine} style={{ width: "70%" }} />
        <div className={styles.skelLine} style={{ width: "78%" }} />
      </div>
    </div>
  );
}
