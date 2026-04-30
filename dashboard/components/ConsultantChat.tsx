"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentRun } from "@/lib/types";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  dispatched?: { agent: string; runId: number } | null;
  memorySaved?: { kind: string; content: string } | null;
  /** Para mensajes role="system" de completion: el run que terminó. */
  completion?: {
    runId: number;
    agent: string;
    status: "success" | "error";
    summary: string | null;
    /** Si el output tiene video (pieza de Content Creator con produceVideo true). */
    videoPieceId?: string | null;
    /** Si produceVideo falló, mensaje de error legible. */
    videoError?: string | null;
    /** stderr crudo del bundler/render (sin ANSI). El TSX en sí no viaja al
     *  chat por tamaño; solo el flag indica que hay disponible. */
    videoErrorStderr?: string | null;
    /** Indica si el output tiene compositionTsx para abrir desde el drawer. */
    hasCompositionTsx?: boolean;
  } | null;
}

const STORAGE_VERSION = 1;
const MESSAGES_CAP = 50;

interface PersistedChat {
  v: number;
  messages: ChatMessage[];
  dispatched: number[];
  shown: number[];
}

function storageKey(clientId: string): string {
  return `consultantChat:${clientId}`;
}

function loadPersistedChat(clientId: string): PersistedChat | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(clientId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedChat;
    if (parsed?.v !== STORAGE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function savePersistedChat(clientId: string, state: PersistedChat): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed: PersistedChat = {
      ...state,
      messages: state.messages.slice(-MESSAGES_CAP),
    };
    window.localStorage.setItem(storageKey(clientId), JSON.stringify(trimmed));
  } catch {
    // localStorage puede fallar (quota, modo privado). No es crítico.
  }
}

function clearPersistedChat(clientId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(clientId));
  } catch {
    /* noop */
  }
}

interface ConsultantChatProps {
  clientId: string;
  /** Lista de runs del cliente. Viene del padre (que ya subscribe via
   *  useAgentRuns). Pasarla como prop evita doble subscription al mismo
   *  channel Realtime — eso crashea la página. */
  runs: AgentRun[];
  /** Callback cuando el usuario clickea "Ver detalle" en un mensaje de
   *  completion. El padre debe abrir el RunOutputDrawer del run. */
  onSelectRun?: (run: AgentRun) => void;
}

interface ConsultantResponse {
  reply: string;
  dispatched?: { agent: string; runId: number } | null;
  memorySaved?: { kind: string; content: string } | null;
  error?: string;
}

export default function ConsultantChat({
  clientId,
  runs,
  onSelectRun,
}: ConsultantChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Track de runs dispatchados en esta sesión + cuáles ya mostramos como
  // completados (para no duplicar el mensaje de completion). Se persisten
  // junto con messages en localStorage para sobrevivir a un refresh.
  const dispatchedRunIdsRef = useRef<Set<number>>(new Set());
  const completedShownRef = useRef<Set<number>>(new Set());

  // Hidratar desde localStorage al montar / cambiar de cliente. setState
  // dentro del effect es necesario acá: localStorage no existe en SSR, así
  // que sólo lo podemos leer post-mount.
  useEffect(() => {
    const persisted = loadPersistedChat(clientId);
    if (persisted) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessages(persisted.messages);
      dispatchedRunIdsRef.current = new Set(persisted.dispatched);
      completedShownRef.current = new Set(persisted.shown);
    } else {
      setMessages([]);
      dispatchedRunIdsRef.current = new Set();
      completedShownRef.current = new Set();
    }
    setHydrated(true);
  }, [clientId]);

  // Persistir cualquier cambio de messages después de hidratar.
  useEffect(() => {
    if (!hydrated) return;
    savePersistedChat(clientId, {
      v: STORAGE_VERSION,
      messages,
      dispatched: Array.from(dispatchedRunIdsRef.current),
      shown: Array.from(completedShownRef.current),
    });
  }, [clientId, messages, hydrated]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  // Watcher: cuando un run trackeado cambie de status, push completion msg.
  // Esperamos hidratar para no perder/duplicar runs entre el storage y los runs
  // realtime que llegan del padre.
  useEffect(() => {
    if (!hydrated) return;

    async function enrichWithVideoInfo(runId: number): Promise<{
      videoPieceId: string | null;
      videoError: string | null;
      videoErrorStderr: string | null;
      hasCompositionTsx: boolean;
    }> {
      const fallback = {
        videoPieceId: null,
        videoError: null,
        videoErrorStderr: null,
        hasCompositionTsx: false,
      };
      try {
        const res = await fetch(`/api/agents/runs/${runId}/output`);
        if (!res.ok) return fallback;
        const data = await res.json();
        const structured = data?.output?.structured;
        if (!structured || typeof structured !== "object") return fallback;

        const pieceId =
          typeof structured.pieceId === "string" ? structured.pieceId : null;
        const videoPieceId = pieceId && structured.videoPath ? pieceId : null;
        const videoError =
          typeof structured.videoError === "string"
            ? structured.videoError
            : null;
        const videoErrorStderr =
          typeof structured.videoErrorStderr === "string"
            ? structured.videoErrorStderr
            : null;
        const hasCompositionTsx =
          typeof structured.compositionTsx === "string" &&
          structured.compositionTsx.length > 0;
        return { videoPieceId, videoError, videoErrorStderr, hasCompositionTsx };
      } catch {
        return fallback;
      }
    }

    for (const run of runs) {
      const isTracked = dispatchedRunIdsRef.current.has(run.id);
      const alreadyShown = completedShownRef.current.has(run.id);
      const isFinal = run.status === "success" || run.status === "error";
      if (!isTracked || alreadyShown || !isFinal) continue;

      completedShownRef.current.add(run.id);

      void enrichWithVideoInfo(run.id).then((enriched) => {
        setMessages((prev) => [
          ...prev,
          {
            role: "system",
            content: "",
            completion: {
              runId: run.id,
              agent: run.agent,
              status: run.status as "success" | "error",
              summary: run.summary ?? null,
              ...enriched,
            },
          },
        ]);
      });
    }
  }, [runs, hydrated]);

  function clearChat() {
    clearPersistedChat(clientId);
    setMessages([]);
    dispatchedRunIdsRef.current = new Set();
    completedShownRef.current = new Set();
    setConfirmingClear(false);
    setError(null);
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    // Solo mandamos al backend los mensajes user/assistant (system messages
    // son visuales únicamente, no parte del contexto del Consultor).
    const conversationMessages = [
      ...messages.filter((m) => m.role === "user" || m.role === "assistant"),
      { role: "user" as const, content: text },
    ];

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/consultant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          messages: conversationMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = (await res.json()) as ConsultantResponse;

      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      if (data.dispatched) {
        dispatchedRunIdsRef.current.add(data.dispatched.runId);
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply,
          dispatched: data.dispatched ?? null,
          memorySaved: data.memorySaved ?? null,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  function handleViewRun(runId: number) {
    const run = runs.find((r) => r.id === runId);
    if (run && onSelectRun) onSelectRun(run);
  }

  return (
    <div
      style={{
        background: "var(--white)",
        border: "1px solid rgba(10, 26, 12, 0.08)",
        display: "flex",
        flexDirection: "column",
        height: 520,
      }}
    >
      <div
        style={{
          padding: "16px 22px",
          borderBottom: "1px solid rgba(10, 26, 12, 0.08)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "var(--sand-dark)",
              fontWeight: 600,
              marginBottom: 4,
            }}
          >
            Consultor
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--deep-green)",
            }}
          >
            Chat con el agente del cliente
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "var(--sand-dark)",
            }}
          >
            {clientId}
          </div>
          {confirmingClear ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span
                style={{
                  fontSize: 10,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--red-warn)",
                  fontWeight: 600,
                }}
              >
                ¿Empezar de cero?
              </span>
              <button
                type="button"
                onClick={clearChat}
                style={{
                  padding: "4px 10px",
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  fontWeight: 700,
                  background: "var(--red-warn)",
                  color: "var(--off-white)",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Sí, borrar
              </button>
              <button
                type="button"
                onClick={() => setConfirmingClear(false)}
                style={{
                  padding: "4px 10px",
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                  background: "transparent",
                  color: "var(--text-muted)",
                  border: "1px solid rgba(10,26,12,0.15)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingClear(true)}
              disabled={messages.length === 0}
              title="Borrar todos los mensajes y empezar de cero"
              style={{
                padding: "4px 10px",
                fontSize: 10,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                fontWeight: 600,
                background: "transparent",
                color:
                  messages.length === 0
                    ? "var(--text-muted)"
                    : "var(--deep-green)",
                border: "1px solid rgba(10,26,12,0.15)",
                cursor: messages.length === 0 ? "not-allowed" : "pointer",
                fontFamily: "inherit",
              }}
            >
              ✕ Nueva conversación
            </button>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "20px 22px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              fontSize: 13,
              color: "var(--text-muted)",
              lineHeight: 1.6,
              padding: "20px 0",
            }}
          >
            Hola. Soy el Consultor. Preguntame por el estado del cliente o
            pedime que dispare un agente (contenido, analítica, SEO, stock,
            logística). Cuando un agente termine, te aviso acá mismo con el
            resultado.
          </div>
        )}

        {messages.map((m, i) => (
          <Bubble
            key={i}
            message={m}
            clientId={clientId}
            onViewRun={handleViewRun}
          />
        ))}

        {loading && (
          <div
            style={{
              alignSelf: "flex-start",
              fontSize: 12,
              color: "var(--sand-dark)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            Pensando…
          </div>
        )}

        {error && (
          <div
            style={{
              alignSelf: "stretch",
              padding: "10px 14px",
              background: "rgba(176, 75, 58, 0.08)",
              borderLeft: "3px solid var(--red-warn)",
              fontSize: 12,
              color: "var(--red-warn)",
            }}
          >
            {error}
          </div>
        )}
      </div>

      <div
        style={{
          padding: 14,
          borderTop: "1px solid rgba(10, 26, 12, 0.08)",
          display: "flex",
          gap: 10,
          alignItems: "flex-end",
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={loading}
          rows={2}
          placeholder="Escribí tu mensaje. Enter envía, Shift+Enter salto de línea."
          style={{
            flex: 1,
            padding: "10px 12px",
            fontSize: 13,
            fontFamily: "inherit",
            border: "1px solid rgba(10, 26, 12, 0.15)",
            background: "var(--off-white)",
            color: "var(--deep-green)",
            resize: "none",
            outline: "none",
          }}
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={loading || !input.trim()}
          style={{
            padding: "12px 20px",
            background:
              loading || !input.trim()
                ? "var(--sand-dark)"
                : "var(--deep-green)",
            color: "var(--off-white)",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            border: "none",
            cursor: loading || !input.trim() ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}
        >
          Enviar
        </button>
      </div>
    </div>
  );
}

function Bubble({
  message,
  clientId,
  onViewRun,
}: {
  message: ChatMessage;
  clientId: string;
  onViewRun: (runId: number) => void;
}) {
  if (message.role === "system" && message.completion) {
    return <CompletionBubble completion={message.completion} clientId={clientId} onViewRun={onViewRun} />;
  }

  const isUser = message.role === "user";
  return (
    <div
      style={{
        alignSelf: isUser ? "flex-end" : "flex-start",
        maxWidth: "78%",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          background: isUser ? "var(--deep-green)" : "var(--off-white)",
          color: isUser ? "var(--off-white)" : "var(--deep-green)",
          fontSize: 13,
          lineHeight: 1.55,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          borderLeft: isUser ? "none" : "2px solid var(--sand)",
        }}
      >
        {message.content}
      </div>
      {message.dispatched && (
        <div
          style={{
            alignSelf: "flex-start",
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--sand-dark)",
            fontWeight: 600,
          }}
        >
          → Dispatché · {message.dispatched.agent} · run #
          {message.dispatched.runId}
        </div>
      )}
      {message.memorySaved && (
        <div
          style={{
            alignSelf: "flex-start",
            fontSize: 10,
            letterSpacing: "0.08em",
            color: "var(--sand-dark)",
            fontStyle: "italic",
          }}
          title={message.memorySaved.content}
        >
          ◇ Guardé esto en memoria ({message.memorySaved.kind})
        </div>
      )}
    </div>
  );
}

function CompletionBubble({
  completion,
  clientId,
  onViewRun,
}: {
  completion: NonNullable<ChatMessage["completion"]>;
  clientId: string;
  onViewRun: (runId: number) => void;
}) {
  const isSuccess = completion.status === "success";
  const accent = isSuccess ? "var(--green-ok)" : "var(--red-warn)";
  const bg = isSuccess
    ? "rgba(58,139,92,0.06)"
    : "rgba(176,75,58,0.08)";

  const videoUrl = completion.videoPieceId
    ? `/api/clients/${clientId}/videos/${completion.videoPieceId}`
    : null;

  return (
    <div
      style={{
        alignSelf: "stretch",
        padding: "12px 16px",
        background: bg,
        borderLeft: `3px solid ${accent}`,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          color: accent,
          fontWeight: 700,
        }}
      >
        {isSuccess ? "✓" : "✗"} Run #{completion.runId} ·{" "}
        {completion.agent} · {completion.status}
      </div>
      {completion.summary && (
        <div
          style={{
            fontSize: 13,
            color: "var(--deep-green)",
            lineHeight: 1.5,
          }}
        >
          {completion.summary}
        </div>
      )}
      {completion.videoError && (
        <details
          style={{
            fontSize: 11,
            color: "var(--red-warn)",
            lineHeight: 1.5,
            background: "rgba(176,75,58,0.06)",
            padding: "6px 10px",
            borderLeft: "2px solid var(--red-warn)",
          }}
        >
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>
            ⚠ Video falló: {completion.videoError.slice(0, 240)}
            {completion.videoError.length > 240 ? "…" : ""}
          </summary>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              marginTop: 8,
              fontFamily: "ui-monospace, monospace",
              fontSize: 10,
              maxHeight: 280,
              overflow: "auto",
              padding: "6px 8px",
              background: "rgba(176,75,58,0.04)",
            }}
          >
            {completion.videoError}
            {completion.videoErrorStderr
              ? "\n\n--- stderr ---\n" + completion.videoErrorStderr
              : ""}
          </pre>
        </details>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
        {videoUrl ? (
          <>
            <a
              href={videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: "6px 12px",
                background: "var(--deep-green)",
                color: "var(--off-white)",
                border: "1px solid var(--deep-green)",
                fontSize: 10,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                fontWeight: 600,
                textDecoration: "none",
                fontFamily: "inherit",
              }}
            >
              ▶ Reproducir video MP4
            </a>
            <a
              href={`${videoUrl}?download=1`}
              style={{
                padding: "6px 12px",
                background: "transparent",
                color: "var(--deep-green)",
                border: "1px solid rgba(10,26,12,0.15)",
                fontSize: 10,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                fontWeight: 600,
                textDecoration: "none",
                fontFamily: "inherit",
              }}
            >
              ↓ Descargar MP4
            </a>
          </>
        ) : null}
        <button
          type="button"
          onClick={() => onViewRun(completion.runId)}
          style={{
            padding: "6px 12px",
            background: "transparent",
            color: "var(--deep-green)",
            border: "1px solid rgba(10,26,12,0.15)",
            fontSize: 10,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          📄 Abrir script generado
        </button>
        {completion.hasCompositionTsx && (
          <button
            type="button"
            onClick={() => onViewRun(completion.runId)}
            title="Ver el TSX que generó Claude y el stderr completo de Remotion"
            style={{
              padding: "6px 12px",
              background: "transparent",
              color: completion.videoError
                ? "var(--red-warn)"
                : "var(--sand-dark)",
              border: `1px solid ${completion.videoError ? "rgba(176,75,58,0.4)" : "rgba(10,26,12,0.15)"}`,
              fontSize: 10,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            🔧 Ver TSX y stderr
          </button>
        )}
      </div>
    </div>
  );
}
