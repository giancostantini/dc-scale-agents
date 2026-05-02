"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  getCurrentProfile,
  hasSession,
  type Profile,
} from "@/lib/supabase/auth";
import { getSupabase } from "@/lib/supabase/client";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import Lockup from "@/components/Lockup";
import portalStyles from "../portal.module.css";
import styles from "./consultor.module.css";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTED_QUESTIONS = [
  "¿Cómo va mi cuenta este mes?",
  "Resumime el último reporte aprobado",
  "¿Qué campañas tengo activas?",
  "¿Cuáles son mis próximas reuniones?",
];

export default function PortalConsultorPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    hasSession().then(async (has) => {
      if (!has) {
        router.replace("/");
        return;
      }
      const p = await getCurrentProfile();
      if (!p || p.role !== "client") {
        router.replace(p?.role === "client" ? "/portal" : "/hub");
        return;
      }
      setProfile(p);
      setLoading(false);
    });
  }, [router]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setError("");
    const newMessages: Message[] = [
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
        setError("Tu sesión expiró. Volvé a iniciar sesión.");
        return;
      }
      const res = await fetch("/api/portal/consultant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error desconocido.");
        // remove the optimistic user msg if backend failed
        setMessages(messages);
        return;
      }
      setMessages([
        ...newMessages,
        { role: "assistant", content: data.reply ?? "" },
      ]);
    } catch (err) {
      console.error("consultor error:", err);
      setError("Error de red. Probá de nuevo.");
      setMessages(messages);
    } finally {
      setSending(false);
    }
  }

  if (loading || !profile) return null;

  return (
    <>
      <header className={portalStyles.header}>
        <div className={portalStyles.headerLeft}>
          <Lockup size="sm" />
        </div>
        <div className={portalStyles.headerCenter}>
          <div className={portalStyles.eyebrow}>Consultor IA</div>
        </div>
        <div className={portalStyles.headerRight}>
          <Link href="/portal" className={portalStyles.btnGhost}>
            ← Portal
          </Link>
        </div>
      </header>

      <main className={styles.wrap}>
        <div className={styles.intro}>
          <div className={portalStyles.heroEyebrow}>Asistente</div>
          <h1 className={portalStyles.heroTitle}>Consultor IA</h1>
          <p className={portalStyles.heroSub}>
            Preguntale al consultor cómo va tu cuenta, qué dicen los reportes
            o cualquier cosa sobre el negocio. Tiene acceso a tu data en
            tiempo real.
          </p>
        </div>

        <div className={styles.chatBox}>
          <div className={styles.messages} ref={scrollRef}>
            {messages.length === 0 && (
              <div className={styles.empty}>
                <div className={styles.emptyIcon}>✨</div>
                <div className={styles.emptyTitle}>
                  ¿En qué te ayudo?
                </div>
                <div className={styles.emptySub}>
                  Algunos ejemplos de lo que podés preguntar:
                </div>
                <div className={styles.suggestions}>
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      className={styles.suggestion}
                      onClick={() => send(q)}
                      disabled={sending}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user" ? styles.msgUser : styles.msgAssistant
                }
              >
                {m.role === "assistant" ? (
                  <MarkdownRenderer content={m.content} shiftHeadings />
                ) : (
                  m.content
                )}
              </div>
            ))}
            {sending && (
              <div className={styles.msgAssistant}>
                <div className={styles.thinking}>Pensando…</div>
              </div>
            )}
          </div>

          <form
            className={styles.composer}
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Preguntale al consultor…"
              rows={2}
              disabled={sending}
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
              disabled={!input.trim() || sending}
            >
              {sending ? "…" : "→"}
            </button>
          </form>

          {error && (
            <div
              style={{
                margin: "12px 16px",
                padding: 12,
                background: "rgba(176,75,58,0.08)",
                borderLeft: "3px solid var(--red-warn)",
                color: "var(--red-warn)",
                fontSize: 12,
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div className={styles.disclaimer}>
          ℹ️ Para cambios sobre cosas ya aprobadas, hablá con tu account lead.
          Para nuevas iniciativas (promos, ideas) cargá una{" "}
          <Link href="/portal/solicitudes" className={styles.link}>
            solicitud
          </Link>{" "}
          desde tu portal.
        </div>
      </main>
    </>
  );
}
