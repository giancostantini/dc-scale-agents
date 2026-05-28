"use client";

/**
 * Reporting — agente de IA que genera reportes ejecutivos del cliente
 * para enviar por mail.
 *
 * Flow:
 *   1. Director chatea con el agente pidiendo el reporte que necesita
 *      (ej "reporte mensual de mayo", "informe de pauta de la última
 *      campaña", "resumen para presentar al cliente").
 *   2. Agente genera markdown contextualizado con KPIs, contenido,
 *      pagos, fases, etc.
 *   3. Director puede editar el markdown en un textarea.
 *   4. Click "Enviar por mail" → modal con destinatarios + subject
 *      → envío via Resend.
 */

import { use, useEffect, useState } from "react";
import { getClient } from "@/lib/storage";
import { getSupabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/auth";
import type { Client } from "@/lib/types";
import ui from "@/components/ClientUI.module.css";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export default function ReportingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [client, setClient] = useState<Client | null>(null);
  const [isDirector, setIsDirector] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  /** El último reply del agente que se puede editar y enviar. */
  const [editableReport, setEditableReport] = useState("");
  const [sendModal, setSendModal] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    getClient(id).then((c) => {
      setClient(c ?? null);
      if (c?.onboarding) {
        const ob = c.onboarding as Record<string, unknown>;
        if (typeof ob.contact_email === "string") setEmailTo(ob.contact_email);
      }
    });
    getCurrentProfile().then((p) => setIsDirector(p?.role === "director"));
  }, [id]);

  async function sendChat() {
    if (!input.trim() || thinking) return;
    const userMsg: ChatMessage = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setThinking(true);

    try {
      const supabase = getSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Sin sesión");

      const res = await fetch(
        `/api/clients/${id}/reporting-agent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: [...messages, userMsg],
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error([data?.error, data?.detail].filter(Boolean).join(" — "));
      }
      const reply = data.reply ?? "";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      setEditableReport(reply);
      // Sugerir un subject por defecto
      if (!emailSubject) {
        const monthLabel = new Date().toLocaleDateString("es-AR", {
          month: "long",
          year: "numeric",
        });
        setEmailSubject(`Reporte ${monthLabel} · ${client?.name ?? "Cliente"}`);
      }
    } catch (err) {
      const e = err as Error;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `⚠ Error: ${e.message}` },
      ]);
    } finally {
      setThinking(false);
    }
  }

  async function sendEmail() {
    if (!emailTo.trim() || !emailSubject.trim() || !editableReport.trim()) {
      alert("Completá destinatarios, asunto y el cuerpo del reporte.");
      return;
    }
    setSending(true);
    try {
      const supabase = getSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Sin sesión");

      const res = await fetch(
        `/api/clients/${id}/reporting-send`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            to: emailTo.split(",").map((s) => s.trim()).filter(Boolean),
            subject: emailSubject.trim(),
            markdown: editableReport,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error([data?.error, data?.detail].filter(Boolean).join(" — "));
      }
      alert(`✓ Email enviado (ID: ${data.emailId}).`);
      setSendModal(false);
    } catch (err) {
      const e = err as Error;
      alert(`No se pudo enviar:\n${e.message}`);
    } finally {
      setSending(false);
    }
  }

  function copyToClipboard() {
    navigator.clipboard.writeText(editableReport);
    alert("✓ Copiado al portapapeles.");
  }

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Cliente · Reporting</div>
          <h1>Reporting con IA</h1>
        </div>
      </div>

      <div
        style={{
          padding: 14,
          background: "var(--ivory)",
          borderLeft: "3px solid var(--sand)",
          marginBottom: 24,
          fontSize: 13,
          lineHeight: 1.5,
          color: "var(--text-soft, #5a6a5e)",
          borderRadius: "var(--r-md)",
        }}
      >
        Pedile al agente que arme el reporte que necesites enviar. Tiene
        acceso a KPIs, contenido publicado, pagos, fases del onboarding,
        objetivos y solicitudes recientes del cliente. Después podés
        editar el texto antes de enviarlo por mail.
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1.5fr",
          gap: 20,
          alignItems: "start",
        }}
      >
        {/* CHAT */}
        <div
          style={{
            background: "var(--white)",
            border: "1px solid rgba(10,26,12,0.08)",
            borderRadius: "var(--r-lg)",
            padding: 16,
            position: "sticky",
            top: 20,
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--sand-dark)",
              fontWeight: 700,
              marginBottom: 10,
            }}
          >
            📄 Agente de reporting
          </div>

          {/* Mensajes */}
          <div
            style={{
              maxHeight: 360,
              overflowY: "auto",
              marginBottom: 12,
              padding: 4,
            }}
          >
            {messages.length === 0 && (
              <div
                style={{
                  padding: 16,
                  background: "var(--ivory)",
                  fontSize: 12,
                  color: "var(--text-muted)",
                  lineHeight: 1.6,
                  borderRadius: "var(--r-sm)",
                  fontStyle: "italic",
                }}
              >
                Ejemplos:
                <br />
                <br />
                <strong>"Reporte mensual de mayo para enviar al cliente"</strong>
                <br />
                <strong>"Resumen de últimos 30 días de pauta"</strong>
                <br />
                <strong>"Informe interno para Federico y Gianluca con métricas y costos"</strong>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  marginBottom: 10,
                  padding: 10,
                  background:
                    m.role === "user"
                      ? "var(--off-white)"
                      : "var(--ivory)",
                  borderLeft: `3px solid ${m.role === "user" ? "var(--sand-dark)" : "var(--deep-green)"}`,
                  fontSize: 12,
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                  borderRadius: "0 var(--r-sm) var(--r-sm) 0",
                }}
              >
                {m.content.slice(0, 240)}
                {m.content.length > 240 && "…"}
              </div>
            ))}
            {thinking && (
              <div
                style={{
                  padding: 10,
                  color: "var(--text-muted)",
                  fontStyle: "italic",
                  fontSize: 12,
                }}
              >
                Generando reporte…
              </div>
            )}
          </div>

          {/* Input */}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              isDirector
                ? "Pedile al agente el reporte que necesites…"
                : "Solo director puede usar el agente"
            }
            rows={3}
            disabled={!isDirector || thinking}
            style={{
              width: "100%",
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
          <button
            onClick={sendChat}
            disabled={!isDirector || thinking || !input.trim()}
            style={{
              width: "100%",
              marginTop: 8,
              padding: "10px 12px",
              fontSize: 12,
              fontWeight: 600,
              background: "var(--deep-green)",
              color: "var(--off-white)",
              border: "none",
              cursor: thinking ? "default" : "pointer",
              fontFamily: "inherit",
              borderRadius: "var(--r-sm)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              opacity: thinking || !input.trim() ? 0.5 : 1,
            }}
          >
            {thinking ? "Pensando…" : "↑ Generar reporte"}
          </button>
        </div>

        {/* EDITOR DEL REPORTE */}
        <div>
          <div
            style={{
              background: "var(--white)",
              border: "1px solid rgba(10,26,12,0.08)",
              borderRadius: "var(--r-lg)",
              padding: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "var(--sand-dark)",
                  fontWeight: 700,
                }}
              >
                Reporte editable (markdown)
              </div>
              {editableReport && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={copyToClipboard}
                    style={{
                      padding: "5px 10px",
                      fontSize: 10,
                      background: "transparent",
                      border: "1px solid rgba(10,26,12,0.15)",
                      color: "var(--deep-green)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      borderRadius: "var(--r-sm)",
                    }}
                  >
                    ⎘ Copiar
                  </button>
                  <button
                    onClick={() => setSendModal(true)}
                    style={{
                      padding: "5px 12px",
                      fontSize: 10,
                      fontWeight: 600,
                      background: "var(--deep-green)",
                      color: "var(--off-white)",
                      border: "none",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      borderRadius: "var(--r-sm)",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    ✉ Enviar por mail
                  </button>
                </div>
              )}
            </div>
            {editableReport ? (
              <textarea
                value={editableReport}
                onChange={(e) => setEditableReport(e.target.value)}
                rows={24}
                style={{
                  width: "100%",
                  padding: 14,
                  border: "1px solid rgba(10,26,12,0.15)",
                  background: "var(--white)",
                  color: "var(--deep-green)",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 12,
                  lineHeight: 1.6,
                  resize: "vertical",
                  borderRadius: "var(--r-sm)",
                  outline: "none",
                }}
              />
            ) : (
              <div
                style={{
                  padding: 40,
                  textAlign: "center",
                  color: "var(--text-muted)",
                  fontSize: 13,
                  fontStyle: "italic",
                  background: "var(--ivory)",
                  borderRadius: "var(--r-sm)",
                }}
              >
                El reporte va a aparecer acá una vez que el agente lo
                genere. Pedile el reporte que necesites en el chat ←
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de envío de email */}
      {sendModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !sending) setSendModal(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(10,26,12,0.6)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 40,
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            style={{
              background: "var(--white)",
              maxWidth: 520,
              width: "100%",
              padding: 32,
              borderRadius: "var(--r-lg)",
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--sand-dark)",
                fontWeight: 700,
                marginBottom: 8,
              }}
            >
              Enviar por mail
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>
              Reporte vía email
            </h2>

            <div style={{ marginBottom: 14 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "var(--sand-dark)",
                  fontWeight: 700,
                  marginBottom: 4,
                }}
              >
                Destinatarios (coma para varios)
              </label>
              <input
                type="text"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="cliente@empresa.com, federico@dearmascostantini.com"
                style={modalInput}
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "var(--sand-dark)",
                  fontWeight: 700,
                  marginBottom: 4,
                }}
              >
                Asunto
              </label>
              <input
                type="text"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                style={modalInput}
              />
            </div>
            <div
              style={{
                padding: 10,
                background: "var(--ivory)",
                fontSize: 11,
                color: "var(--text-muted)",
                marginBottom: 20,
                borderRadius: "var(--r-sm)",
              }}
            >
              El cuerpo del email es el reporte que tenés en el editor.
              Si necesitás cambiar algo, cerrá este modal y editalo.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setSendModal(false)}
                disabled={sending}
                style={{
                  padding: "10px 18px",
                  fontSize: 12,
                  background: "transparent",
                  border: "1px solid rgba(10,26,12,0.15)",
                  color: "var(--deep-green)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  borderRadius: "var(--r-sm)",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={sendEmail}
                disabled={sending}
                style={{
                  padding: "10px 18px",
                  fontSize: 12,
                  fontWeight: 600,
                  background: "var(--deep-green)",
                  color: "var(--off-white)",
                  border: "none",
                  cursor: sending ? "default" : "pointer",
                  fontFamily: "inherit",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  borderRadius: "var(--r-sm)",
                  opacity: sending ? 0.5 : 1,
                }}
              >
                {sending ? "Enviando…" : "✉ Enviar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const modalInput: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid rgba(10,26,12,0.15)",
  background: "var(--white)",
  color: "var(--deep-green)",
  fontFamily: "inherit",
  fontSize: 13,
  outline: "none",
  borderRadius: "var(--r-sm)",
};
