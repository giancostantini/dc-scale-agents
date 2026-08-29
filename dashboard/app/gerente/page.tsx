"use client";

/**
 * /gerente — la oficina del Gerente General.
 *
 * Chat full-page con el mismo motor del widget (useGlobalConsultantChat +
 * /api/consultant/global, streaming SSE) + rail con el estado de las 6
 * gerencias (tabla digests, mig 096). El GG responde con los digests de
 * área YA inyectados: le preguntás por cualquier gerencia o cliente y
 * contesta con la info preparada de antemano por la jerarquía.
 *
 * - ?gerencia=<slug> preselecciona la persona (marketing → Gerente de
 *   Marketing; finanzas → Gerente de Finanzas solo si sos director; el
 *   resto atiende el GG).
 * - El widget flotante NO se monta acá (ConsultantWidgetMount excluye
 *   /gerente) — esta página ES el chat.
 * - Guard igual que /hub: sin sesión → login; role client → /portal.
 */

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Topbar from "@/components/Topbar";
import EstadoEmpresa from "@/components/EstadoEmpresa";
import {
  useGlobalConsultantChat,
  type UIMessage,
} from "@/components/consultant/useGlobalConsultantChat";
import {
  PERSONA_LABEL,
  PERSONA_EMOJI,
  personaForGerencia,
  type PersonaId,
} from "@/lib/gerencias";
import { hasSession, getCurrentProfile } from "@/lib/supabase/auth";
import styles from "./gerente.module.css";

export default function GerentePage() {
  // useSearchParams exige Suspense boundary en páginas client (Next 16).
  return (
    <Suspense fallback={null}>
      <GerenteInner />
    </Suspense>
  );
}

function GerenteInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const gerenciaParam = searchParams.get("gerencia");

  const [authChecked, setAuthChecked] = useState(false);

  const chat = useGlobalConsultantChat();
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
  const appliedParamRef = useRef<string | null>(null);

  // ===== Guard =====
  useEffect(() => {
    hasSession().then(async (has) => {
      if (!has) {
        router.replace("/");
        return;
      }
      const p = await getCurrentProfile();
      if (p?.role === "client") {
        router.replace("/portal");
        return;
      }
      setAuthChecked(true);
    });
  }, [router]);

  // ===== ?gerencia= preselecciona persona (una vez por valor del param,
  // recién cuando el profile cargó — finanzas exige director) =====
  useEffect(() => {
    if (!profile || !gerenciaParam) return;
    if (appliedParamRef.current === gerenciaParam) return;
    appliedParamRef.current = gerenciaParam;
    const target = personaForGerencia(
      gerenciaParam,
      profile.role === "director" ? "director" : "team",
    );
    setPersona(target);
  }, [profile, gerenciaParam, setPersona]);

  // ===== Briefing: al entrar a la página lo damos por visto =====
  useEffect(() => {
    if (hasUnreadBriefing) markBriefingRead();
  }, [hasUnreadBriefing, markBriefingRead]);

  // ===== Auto scroll =====
  useEffect(() => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ block: "end" });
    });
  }, [messages]);

  // ===== Abort streaming al desmontar =====
  useEffect(() => abort, [abort]);

  const handleNewConversation = useCallback(() => {
    if (
      !window.confirm(
        "¿Empezar una conversación nueva? Esto limpia el chat visible (el historial queda guardado).",
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

  if (!authChecked || !profile || profile.role === "client") return null;

  const firstName = profile.name.split(" ")[0];

  return (
    <>
      <Topbar showPrimary={false} />
      <div className={styles.wrap}>
        <div style={{ marginBottom: 18 }}>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "var(--deep-green)",
              margin: 0,
            }}
          >
            {PERSONA_EMOJI[persona]} {PERSONA_LABEL[persona]}
          </h1>
          <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 4 }}>
            La jerarquía trabaja para vos: cada cliente tiene su Gerente de
            Proyecto, cada gerencia agrega los suyos, y el Gerente General
            responde con todo eso ya preparado.
          </div>
        </div>

        <div className={styles.layout}>
          {/* ===== Chat ===== */}
          <div className={styles.chatCard}>
            <div className={styles.chatHeader}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {profile.role === "director" ? "Director" : "Team"} ·{" "}
                  {profile.name}
                </div>
                <button
                  type="button"
                  onClick={handleNewConversation}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    fontFamily: "inherit",
                    border: "none",
                    background: "transparent",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                  }}
                >
                  Limpiar chat
                </button>
              </div>
              {/* Personas — finanzas solo director */}
              <div className={styles.personaRow}>
                {(["general", "marketing", "finanzas"] as PersonaId[])
                  .filter((p) => p !== "finanzas" || profile.role === "director")
                  .map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPersona(p)}
                      disabled={sending}
                      className={`${styles.personaChip} ${
                        persona === p ? styles.personaChipActive : ""
                      }`}
                    >
                      {PERSONA_EMOJI[p]} {PERSONA_LABEL[p]}
                    </button>
                  ))}
              </div>
            </div>

            <div className={styles.messages}>
              {messages.length === 0 ? (
                <div className={styles.empty}>
                  Hola {firstName}, soy el {PERSONA_LABEL[persona]}.
                  <br />
                  Preguntame por el estado de cualquier gerencia, cliente o
                  proceso — tengo el estado de la empresa preparado de antemano.
                </div>
              ) : (
                messages.map((m, idx) => (
                  <Bubble
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
                placeholder="¿Cómo está la empresa? ¿En qué estamos con un cliente? ¿Qué destraba el ciclo del mes?"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKey}
                disabled={sending}
                rows={3}
              />
              <div className={styles.composerRow}>
                <span className={styles.hint}>
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

          {/* ===== Rail: estado por gerencia ===== */}
          <div>
            <EstadoEmpresa variant="rail" />
          </div>
        </div>
      </div>
    </>
  );
}

function Bubble({
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
          <div className={styles.briefingTag}>BRIEFING DEL DÍA</div>
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
