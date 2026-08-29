"use client";

/**
 * useGlobalConsultantChat — la LÓGICA del chat con el Gerente General,
 * compartida entre el widget flotante (ConsultantWidget) y la página
 * /gerente. El markup NO se comparte a propósito: cada superficie
 * renderiza el suyo; acá vive solo el estado + streaming.
 *
 * Extraído de ConsultantWidget (que era dueño único de esto) al crear
 * /gerente. Comportamiento idéntico al original:
 *   - carga la conversación pinned de la persona activa + briefing status
 *   - send() = streaming SSE contra /api/consultant/global con merge de
 *     deltas, chips de dispatch y errores de tools
 *   - cambiar de persona limpia el view y carga SU conversación
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { getCurrentProfile, type Profile } from "@/lib/supabase/auth";
import { streamChat, type StreamMessageInput } from "@/lib/consultant-stream";
import type { PersonaId } from "@/lib/gerencias";

export interface UIMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  isBriefing?: boolean;
  isError?: boolean;
}

export interface GlobalConsultantChat {
  profile: Profile | null;
  messages: UIMessage[];
  draft: string;
  setDraft: (v: string) => void;
  sending: boolean;
  persona: PersonaId;
  setPersona: (p: PersonaId) => void;
  hasUnreadBriefing: boolean;
  /** Envía el draft actual (no-op si está vacío o ya hay un send en vuelo). */
  send: () => Promise<void>;
  /** Limpia el chat visible (la conversación server-side queda). */
  clearChat: () => void;
  /** Marca el briefing como leído (llamar al abrir la superficie). */
  markBriefingRead: () => Promise<void>;
  /** Aborta el streaming en vuelo (llamar al cerrar/desmontar). */
  abort: () => void;
}

export function useGlobalConsultantChat(options?: {
  initialPersona?: PersonaId;
  /** Hint de cliente activo (/cliente/[id]) — lo manda el widget. */
  activeClient?: string | null;
}): GlobalConsultantChat {
  const activeClient = options?.activeClient ?? null;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [hasUnreadBriefing, setHasUnreadBriefing] = useState(false);
  const [persona, setPersona] = useState<PersonaId>(
    options?.initialPersona ?? "general",
  );

  const abortRef = useRef<AbortController | null>(null);

  // ===== Load profile + conversation de la persona + briefing status =====
  // Corre al montar Y al cambiar de persona (cada persona tiene su chat).
  useEffect(() => {
    let cancelled = false;
    setMessages([]);
    (async () => {
      const p = await getCurrentProfile();
      if (cancelled) return;
      setProfile(p);

      // Si es client role, no cargamos nada — defensa en profundidad
      // (las superficies tampoco deberían montarse para ellos).
      if (!p || p.role === "client") return;

      const supabase = getSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const [convRes, briefRes] = await Promise.all([
        fetch(`/api/consultant/global/conversation?persona=${persona}`, {
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
  }, [persona]);

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

  const send = useCallback(async () => {
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

    const appendToLast = (extra: string) => {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === "assistant") {
          next[next.length - 1] = { ...last, content: last.content + extra };
        }
        return next;
      });
    };

    try {
      await streamChat(
        {
          messages: historyForApi,
          activeClient,
          persona,
          accessToken: session.access_token,
          signal: controller.signal,
        },
        {
          onDelta: (delta) => appendToLast(delta),
          onToolResult: (name, ok, detail) => {
            if (name === "run_agent" && ok) {
              const agent = detail.agent as string | undefined;
              const client = detail.client as string | undefined;
              const runId = detail.runId as number | undefined;
              appendToLast(
                `\n\n_[dispatch: ${agent} para ${client}${runId ? ` · run #${runId}` : ""}]_`,
              );
            }
            if (!ok) {
              const err = detail.error as string | undefined;
              appendToLast(`\n\n_[error en ${name}: ${err ?? "desconocido"}]_`);
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
  }, [draft, sending, messages, activeClient, persona]);

  const clearChat = useCallback(() => {
    setMessages([]);
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  return {
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
  };
}
