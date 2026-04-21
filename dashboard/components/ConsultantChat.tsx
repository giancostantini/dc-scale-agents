"use client";

import { useEffect, useRef, useState } from "react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  dispatched?: { agent: string; runId: number } | null;
}

interface ConsultantChatProps {
  clientId: string;
}

interface ConsultantResponse {
  reply: string;
  dispatched?: { agent: string; runId: number } | null;
  error?: string;
}

export default function ConsultantChat({ clientId }: ConsultantChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/consultant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const data = (await res.json()) as ConsultantResponse;

      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply, dispatched: data.dispatched ?? null },
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
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--deep-green)" }}>
            Chat con el agente del cliente
          </div>
        </div>
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
            Hola. Soy el Consultor. Preguntame por el estado del cliente o pedime
            que dispare un agente (contenido, analítica, SEO, stock, logística).
          </div>
        )}

        {messages.map((m, i) => (
          <Bubble key={i} message={m} />
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
            background: loading || !input.trim() ? "var(--sand-dark)" : "var(--deep-green)",
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

function Bubble({ message }: { message: ChatMessage }) {
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
          → Dispatché · {message.dispatched.agent} · run #{message.dispatched.runId}
        </div>
      )}
    </div>
  );
}
