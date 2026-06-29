"use client";

/**
 * Consultor de Contenido — panel de chat del portal de EQUIPO.
 *
 * Da ideas de contenido para el cliente, alineadas a su marca (brandbook +
 * estrategia) Y a las últimas tendencias del nicho. Habla con el endpoint
 * /api/clients/[id]/content-consultant (GET carga el hilo persistido,
 * POST conversa). Memoria entre sesiones: al montar trae el hilo guardado.
 *
 * Es interno (director / team asignado). No confundir con el Asistente
 * Creativo (batch de piezas) ni con el Consultor del cliente (portal).
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { getSupabase } from "@/lib/supabase/client";
import MarkdownRenderer from "@/components/MarkdownRenderer";

interface ChatMessage {
  /** id de DB (solo mensajes persistidos; los recién enviados lo reciben del POST). */
  id?: string | null;
  role: "user" | "assistant";
  content: string;
  /** 👍=1, 👎=-1, null=sin calificar. Solo en respuestas del asistente. */
  rating?: number | null;
}

const SUGGESTIONS = [
  "Texto para una placa sobre una oferta/novedad",
  "Textos placa por placa para un carrusel",
  "3 variantes de título para una placa",
  "Referencias de cómo escribir el texto de las placas del nicho",
];

/** Estilo del botón 👍/👎. Resaltado cuando es el voto activo. */
function ratePillStyle(active: boolean): CSSProperties {
  return {
    fontSize: 13,
    lineHeight: 1,
    padding: "3px 9px",
    background: active ? "var(--deep-green)" : "transparent",
    border: active
      ? "1px solid var(--deep-green)"
      : "1px solid rgba(10,26,12,0.15)",
    borderRadius: "var(--r-pill)",
    cursor: "pointer",
    opacity: active ? 1 : 0.5,
    fontFamily: "inherit",
  };
}

export default function ContentConsultantPanel({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName?: string | null;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Controlador del pedido en curso → permite "Detener" mientras piensa.
  const abortRef = useRef<AbortController | null>(null);

  // Cargar el hilo persistido al montar (memoria entre sesiones).
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
          setError("Tu sesión expiró. Volvé a iniciar sesión.");
          setLoading(false);
          return;
        }
        const res = await fetch(`/api/clients/${clientId}/content-consultant`, {
          method: "GET",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = (await res.json().catch(() => ({}))) as {
          messages?: ChatMessage[];
          error?: string;
        };
        if (!active) return;
        if (res.ok && Array.isArray(data.messages)) {
          setMessages(data.messages);
        }
      } catch {
        /* sin hilo previo: arrancamos vacío */
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [clientId]);

  // Auto-scroll al último mensaje.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, sending]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      setError(null);

      const next: ChatMessage[] = [
        ...messages,
        { role: "user", content: trimmed },
      ];
      setMessages(next);
      setInput("");
      setSending(true);

      try {
        const supabase = getSupabase();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          setError("Tu sesión expiró. Volvé a iniciar sesión.");
          setMessages(messages);
          setSending(false);
          return;
        }

        const ac = new AbortController();
        abortRef.current = ac;
        const res = await fetch(`/api/clients/${clientId}/content-consultant`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: next.map((m) => ({ role: m.role, content: m.content })),
          }),
          signal: ac.signal,
        });
        const data = (await res.json().catch(() => ({}))) as {
          reply?: string;
          messageId?: string | null;
          error?: string;
          detail?: string;
        };
        if (!res.ok) {
          setError(
            [data.error, data.detail].filter(Boolean).join(" — ") ||
              "Error desconocido.",
          );
          setMessages(messages);
          setSending(false);
          return;
        }
        setMessages([
          ...next,
          {
            id: data.messageId ?? null,
            role: "assistant",
            content: data.reply ?? "",
            rating: null,
          },
        ]);
      } catch (err) {
        if ((err as Error)?.name === "AbortError") {
          // Detenido por el usuario: restauramos el estado sin marcar error
          // y devolvemos el texto al input para que pueda reintentar.
          setMessages(messages);
          setInput(trimmed);
        } else {
          setError("Error de red. Probá de nuevo.");
          setMessages(messages);
        }
      } finally {
        abortRef.current = null;
        setSending(false);
      }
    },
    [clientId, messages, sending],
  );

  // 👍/👎 sobre una respuesta del asistente. Toggle: reclickear quita el voto.
  // Optimista; si el PATCH falla, el próximo GET reconcilia.
  const rate = useCallback(
    async (messageId: string, value: 1 | -1) => {
      const current = messages.find((m) => m.id === messageId)?.rating ?? null;
      const nextRating = current === value ? null : value;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, rating: nextRating } : m,
        ),
      );
      try {
        const supabase = getSupabase();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return;
        await fetch(`/api/clients/${clientId}/content-consultant`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ messageId, rating: nextRating }),
        });
      } catch {
        /* no rompemos la UI; el GET siguiente reconcilia */
      }
    },
    [clientId, messages],
  );

  const showSuggestions = !loading && messages.length === 0;

  return (
    <div
      style={{
        background: "var(--white)",
        border: "1px solid rgba(10,26,12,0.08)",
        borderRadius: "var(--r-lg)",
        padding: 18,
        marginTop: 8,
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--sand-dark)",
            fontWeight: 700,
          }}
        >
          💡 Consultor de Contenido
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
          Te ayuda a escribir el texto de las placas/statics (título en imagen,
          bajada, CTA, textos de carrusel) alineado a la marca
          {clientName ? ` de ${clientName}` : ""} y a las tendencias del nicho.
          Pensado para la CM al producir las piezas.
        </div>
      </div>

      {/* Hilo */}
      {(messages.length > 0 || sending || loading) && (
        <div
          ref={scrollRef}
          style={{
            maxHeight: 360,
            overflowY: "auto",
            padding: 4,
            marginBottom: 10,
            border: "1px solid rgba(10,26,12,0.06)",
            borderRadius: "var(--r-sm)",
          }}
        >
          {loading && (
            <div
              style={{
                padding: 10,
                color: "var(--text-muted)",
                fontStyle: "italic",
                fontSize: 12,
              }}
            >
              Cargando…
            </div>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                padding: 10,
                background:
                  m.role === "user" ? "var(--off-white)" : "var(--ivory)",
                borderLeft: `3px solid ${
                  m.role === "user" ? "var(--sand-dark)" : "var(--deep-green)"
                }`,
                fontSize: 12,
                lineHeight: 1.6,
                marginBottom: 6,
                borderRadius: "0 var(--r-sm) var(--r-sm) 0",
              }}
            >
              {m.role === "assistant" ? (
                <>
                  <MarkdownRenderer content={m.content} shiftHeadings />
                  {m.id && (
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        marginTop: 8,
                        alignItems: "center",
                      }}
                    >
                      <span
                        style={{ fontSize: 10, color: "var(--text-muted)" }}
                      >
                        ¿Te sirvió?
                      </span>
                      <button
                        type="button"
                        title="Sí, útil"
                        onClick={() => rate(m.id as string, 1)}
                        style={ratePillStyle(m.rating === 1)}
                      >
                        👍
                      </button>
                      <button
                        type="button"
                        title="No sirvió"
                        onClick={() => rate(m.id as string, -1)}
                        style={ratePillStyle(m.rating === -1)}
                      >
                        👎
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <span style={{ whiteSpace: "pre-wrap" }}>{m.content}</span>
              )}
            </div>
          ))}
          {sending && (
            <div
              style={{
                padding: 10,
                color: "var(--text-muted)",
                fontStyle: "italic",
                fontSize: 12,
              }}
            >
              Pensando…
            </div>
          )}
        </div>
      )}

      {/* Sugerencias (hilo vacío) */}
      {showSuggestions && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {SUGGESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => send(q)}
              disabled={sending}
              style={{
                padding: "6px 12px",
                fontSize: 11,
                fontWeight: 600,
                background: "var(--off-white)",
                color: "var(--deep-green)",
                border: "1px solid rgba(10,26,12,0.12)",
                borderRadius: "var(--r-pill)",
                cursor: sending ? "default" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        style={{ display: "flex", flexDirection: "column", gap: 6 }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pedile el texto de una placa… (ej: 'título y bajada para una placa de promo de invierno')"
          rows={2}
          disabled={sending || loading}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          style={{
            padding: "10px 12px",
            border: "1px solid rgba(10,26,12,0.15)",
            background: "var(--white)",
            color: "var(--deep-green)",
            fontFamily: "inherit",
            fontSize: 12,
            resize: "vertical",
            borderRadius: "var(--r-sm)",
            outline: "none",
          }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          {sending && (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              title="Frenar al consultor"
              style={{
                padding: "8px 16px",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                background: "transparent",
                color: "var(--red-warn)",
                border: "1px solid var(--red-warn)",
                borderRadius: "var(--r-sm)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              ■ Detener
            </button>
          )}
          <button
            type="submit"
            disabled={!input.trim() || sending || loading}
            style={{
              padding: "8px 18px",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              background: "var(--deep-green)",
              color: "var(--off-white)",
              border: "none",
              borderRadius: "var(--r-sm)",
              cursor:
                !input.trim() || sending || loading ? "default" : "pointer",
              opacity: !input.trim() || sending || loading ? 0.5 : 1,
              fontFamily: "inherit",
            }}
          >
            {sending ? "Pensando…" : "Enviar"}
          </button>
        </div>
      </form>

      {error && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: "var(--red-warn)",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
