"use client";

/**
 * Contenido — lista de content_posts del cliente + Asistente Creativo.
 *
 * - Lista ordenada por fecha y urgencia.
 * - Click en cada pieza expande detalle (idea/brief, copy, formato,
 *   día de publicación, status).
 * - Lateral derecho: chat con el Asistente Creativo. Dos modos:
 *   "chat" libre y "propose" (genera batch para aprobar).
 * - Aprobar batch → bulk save a content_posts.
 */

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { getClient, getContent, deleteContent } from "@/lib/storage";
import { getSupabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/auth";
import { NETWORK_COLORS } from "@/lib/content-frequency";
import type { Client, ContentPost } from "@/lib/types";
import ui from "@/components/ClientUI.module.css";

const NETWORK_LABEL: Record<string, string> = {
  ig: "Instagram",
  tt: "TikTok",
  in: "LinkedIn",
  fb: "Facebook",
  yt: "YouTube",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  scheduled: "Programado",
  published: "Publicado",
};

const STATUS_COLOR: Record<string, string> = {
  draft: "#9B8259",
  scheduled: "#C9A14A",
  published: "#2f7d4f",
};

interface ProposedPiece {
  date: string;
  time: string;
  network: string;
  format: string;
  type?: string;
  idea: string;
  copy: string;
  brief: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export default function ContenidoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [client, setClient] = useState<Client | null>(null);
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [isDirector, setIsDirector] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "draft" | "scheduled" | "published">("all");

  // Asistente Creativo
  const [chatOpen, setChatOpen] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  /** Modo "propose": cuando el modelo devolvió piezas para aprobar. */
  const [proposed, setProposed] = useState<{
    intro: string;
    pieces: ProposedPiece[];
  } | null>(null);
  const [savingBatch, setSavingBatch] = useState(false);

  const refresh = useCallback(() => {
    getContent(id).then(setPosts);
  }, [id]);

  useEffect(() => {
    refresh();
    getClient(id).then((c) => setClient(c ?? null));
    getCurrentProfile().then((p) => setIsDirector(p?.role === "director"));
  }, [id, refresh]);

  const sortedFiltered = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const filtered = filter === "all" ? posts : posts.filter((p) => p.status === filter);
    return [...filtered].sort((a, b) => {
      // Vencidos primero (status != published y date < today)
      const aOverdue = a.status !== "published" && a.date < today;
      const bOverdue = b.status !== "published" && b.date < today;
      if (aOverdue && !bOverdue) return -1;
      if (bOverdue && !aOverdue) return 1;
      // Después por fecha ascendente (próximos primero)
      return a.date.localeCompare(b.date) || a.time.localeCompare(b.time);
    });
  }, [posts, filter]);

  const stats = {
    total: posts.length,
    draft: posts.filter((p) => p.status === "draft").length,
    scheduled: posts.filter((p) => p.status === "scheduled").length,
    published: posts.filter((p) => p.status === "published").length,
  };

  async function sendChat(mode: "chat" | "propose") {
    if (!input.trim() || thinking) return;
    const userMsg: ChatMessage = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setThinking(true);
    setProposed(null);

    try {
      const supabase = getSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Sin sesión");

      const res = await fetch(
        `/api/clients/${id}/creative-assistant`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            mode,
            messages: [...messages, userMsg],
            constraints: mode === "propose" ? { count: 7 } : undefined,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          [data?.error, data?.detail].filter(Boolean).join(" — "),
        );
      }

      const reply = data.reply ?? "";
      if (mode === "propose") {
        // Intentar parsear JSON
        try {
          const cleaned = reply
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```\s*$/i, "")
            .trim();
          const parsed = JSON.parse(cleaned);
          if (parsed.pieces && Array.isArray(parsed.pieces)) {
            setProposed(parsed);
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content:
                  parsed.intro ??
                  `Te propongo ${parsed.pieces.length} piezas. Revisalas abajo y aprobalas o ajustá lo que quieras.`,
              },
            ]);
            return;
          }
        } catch {
          // fallthrough — mostrar como chat
        }
      }
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
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

  async function approveBatch() {
    if (!proposed) return;
    setSavingBatch(true);
    try {
      const supabase = getSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Sin sesión");

      const res = await fetch(
        `/api/clients/${id}/creative-bulk-save`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            pieces: proposed.pieces.map((p) => ({
              date: p.date,
              time: p.time,
              network: p.network,
              format: p.format,
              brief: `[${p.type ?? "—"}] ${p.idea}\n\n${p.copy}\n\n— BRIEF —\n${p.brief}`,
              status: "draft",
            })),
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error([data?.error, data?.detail].filter(Boolean).join(" — "));
      }
      alert(
        `✓ ${data.created} piezas agregadas al calendario.${data.skipped > 0 ? ` (${data.skipped} descartadas por formato inválido)` : ""}`,
      );
      setProposed(null);
      refresh();
    } catch (err) {
      const e = err as Error;
      alert(`No se pudieron guardar:\n${e.message}`);
    } finally {
      setSavingBatch(false);
    }
  }

  async function deleteOne(postId: string) {
    if (!confirm("¿Eliminar esta pieza?")) return;
    await deleteContent(postId);
    refresh();
  }

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Cliente · Contenido</div>
          <h1>Pipeline de contenido</h1>
        </div>
        <button
          className={ui.btnGhost}
          onClick={() => setChatOpen(!chatOpen)}
        >
          {chatOpen ? "Ocultar asistente →" : "← Mostrar asistente"}
        </button>
      </div>

      {/* KPIs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <Kpi label="Total" value={stats.total} sub="Piezas creadas" />
        <Kpi
          label="Borradores"
          value={stats.draft}
          color={STATUS_COLOR.draft}
        />
        <Kpi
          label="Programadas"
          value={stats.scheduled}
          color={STATUS_COLOR.scheduled}
        />
        <Kpi
          label="Publicadas"
          value={stats.published}
          color={STATUS_COLOR.published}
        />
      </div>

      {/* Layout: lista a la izq, chat a la der */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: chatOpen ? "1.6fr 1fr" : "1fr",
          gap: 20,
          alignItems: "start",
        }}
      >
        {/* LISTA */}
        <div>
          {/* Filtros */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {(["all", "draft", "scheduled", "published"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "6px 14px",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  background:
                    filter === f ? "var(--deep-green)" : "transparent",
                  color: filter === f ? "var(--off-white)" : "var(--deep-green)",
                  border: "1px solid rgba(10,26,12,0.15)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  borderRadius: "var(--r-sm)",
                }}
              >
                {f === "all" ? `Todas · ${stats.total}` : `${STATUS_LABEL[f]} · ${stats[f]}`}
              </button>
            ))}
          </div>

          {/* Lista */}
          <div className={ui.panel}>
            {sortedFiltered.length === 0 ? (
              <div
                style={{
                  padding: 40,
                  textAlign: "center",
                  color: "var(--text-muted)",
                  fontSize: 13,
                  fontStyle: "italic",
                }}
              >
                Sin piezas todavía. Usá el Asistente Creativo →
              </div>
            ) : (
              sortedFiltered.map((p) => {
                const today = new Date().toISOString().slice(0, 10);
                const overdue =
                  p.status !== "published" && p.date < today;
                const netColor =
                  (NETWORK_COLORS as Record<string, { solid: string }>)[p.network]?.solid ??
                  "#0A1A0C";
                const isExpanded = expandedId === p.id;
                return (
                  <div
                    key={p.id}
                    style={{
                      padding: "14px 0",
                      borderBottom: "1px solid rgba(10,26,12,0.05)",
                    }}
                  >
                    <div
                      onClick={() => setExpandedId(isExpanded ? null : p.id)}
                      style={{
                        cursor: "pointer",
                        display: "grid",
                        gridTemplateColumns: "0.8fr 0.8fr 0.6fr 2fr 0.6fr",
                        gap: 10,
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: 13 }}>
                          {isExpanded ? "▼ " : "▶ "}
                          {p.date}
                        </strong>
                        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                          {p.time}
                        </div>
                      </div>
                      <div>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "3px 8px",
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            background: netColor,
                            color: "#fff",
                            borderRadius: "var(--r-pill)",
                          }}
                        >
                          {NETWORK_LABEL[p.network] ?? p.network}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "capitalize" }}>
                        {p.format}
                      </div>
                      <div style={{ fontSize: 12 }}>
                        {p.brief?.split("\n")[0]?.slice(0, 100) ?? "(sin brief)"}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        {overdue && (
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              color: "#b04b3a",
                              letterSpacing: "0.1em",
                              marginRight: 6,
                            }}
                          >
                            VENCIDA
                          </span>
                        )}
                        <span
                          style={{
                            fontSize: 9,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            color: STATUS_COLOR[p.status],
                            fontWeight: 700,
                          }}
                        >
                          {STATUS_LABEL[p.status]}
                        </span>
                      </div>
                    </div>

                    {isExpanded && (
                      <div
                        style={{
                          marginTop: 14,
                          padding: 16,
                          background: "var(--off-white)",
                          borderLeft: `3px solid ${netColor}`,
                          fontSize: 13,
                          lineHeight: 1.6,
                          whiteSpace: "pre-wrap",
                          borderRadius: "0 var(--r-md) var(--r-md) 0",
                        }}
                      >
                        {p.brief}
                        {isDirector && (
                          <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
                            <button
                              onClick={() => deleteOne(p.id)}
                              style={{
                                padding: "5px 12px",
                                fontSize: 11,
                                background: "transparent",
                                border: "1px solid rgba(176,75,58,0.3)",
                                color: "var(--red-warn)",
                                cursor: "pointer",
                                fontFamily: "inherit",
                                borderRadius: "var(--r-sm)",
                              }}
                            >
                              × Eliminar
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ASISTENTE CREATIVO */}
        {chatOpen && (
          <div
            style={{
              background: "var(--white)",
              border: "1px solid rgba(10,26,12,0.08)",
              borderRadius: "var(--r-lg)",
              padding: 16,
              position: "sticky",
              top: 20,
              maxHeight: "calc(100vh - 40px)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--sand-dark)",
                fontWeight: 700,
                marginBottom: 6,
              }}
            >
              ✨ Asistente creativo
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                marginBottom: 14,
                lineHeight: 1.5,
              }}
            >
              Pedile ideas de contenido, copies, o que arme un batch de
              piezas para la semana. Conoce tu estrategia, frecuencia
              y mix.
            </div>

            {/* Mensajes */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                maxHeight: 360,
                padding: 4,
                marginBottom: 12,
              }}
            >
              {messages.length === 0 && !proposed && (
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
                  Ej: <strong>"dame ideas de contenido para mayo"</strong>,
                  <strong>"copy para un reel de oferta"</strong>, o usá el
                  botón ✨ Generar batch para que arme una semana entera.
                </div>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  style={{
                    marginBottom: 10,
                    padding: 10,
                    background: m.role === "user" ? "var(--off-white)" : "var(--ivory)",
                    borderLeft: `3px solid ${m.role === "user" ? "var(--sand-dark)" : "var(--deep-green)"}`,
                    fontSize: 12,
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                    borderRadius: "0 var(--r-sm) var(--r-sm) 0",
                  }}
                >
                  {m.content}
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
                  Pensando…
                </div>
              )}
            </div>

            {/* Piezas propuestas */}
            {proposed && (
              <div
                style={{
                  marginBottom: 12,
                  padding: 12,
                  background: "rgba(196,168,130,0.08)",
                  border: "1px solid rgba(196,168,130,0.3)",
                  borderRadius: "var(--r-sm)",
                  maxHeight: 280,
                  overflowY: "auto",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--sand-dark)",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    marginBottom: 8,
                  }}
                >
                  {proposed.pieces.length} piezas propuestas
                </div>
                {proposed.pieces.map((p, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "8px 10px",
                      background: "var(--white)",
                      marginBottom: 6,
                      fontSize: 11,
                      borderLeft: "2px solid var(--sand-dark)",
                      borderRadius: "var(--r-sm)",
                    }}
                  >
                    <strong>{p.date} {p.time}</strong> · {NETWORK_LABEL[p.network] ?? p.network} {p.format}
                    {p.type && (
                      <span style={{ marginLeft: 4, color: "var(--sand-dark)", fontWeight: 700 }}>
                        · {p.type}
                      </span>
                    )}
                    <div style={{ marginTop: 4 }}>{p.idea}</div>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  <button
                    onClick={approveBatch}
                    disabled={savingBatch}
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      fontSize: 11,
                      fontWeight: 600,
                      background: "var(--deep-green)",
                      color: "var(--off-white)",
                      border: "none",
                      cursor: savingBatch ? "default" : "pointer",
                      fontFamily: "inherit",
                      borderRadius: "var(--r-sm)",
                      opacity: savingBatch ? 0.5 : 1,
                    }}
                  >
                    {savingBatch ? "Guardando…" : "✓ Aprobar y agregar al calendario"}
                  </button>
                  <button
                    onClick={() => setProposed(null)}
                    style={{
                      padding: "8px 12px",
                      fontSize: 11,
                      background: "transparent",
                      border: "1px solid rgba(10,26,12,0.15)",
                      color: "var(--deep-green)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      borderRadius: "var(--r-sm)",
                    }}
                  >
                    Descartar
                  </button>
                </div>
              </div>
            )}

            {/* Input */}
            <div>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isDirector ? "Preguntá al asistente…" : "Solo director puede usar el asistente"}
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
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button
                  onClick={() => sendChat("chat")}
                  disabled={!isDirector || thinking || !input.trim()}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    fontSize: 11,
                    fontWeight: 600,
                    background: "var(--deep-green)",
                    color: "var(--off-white)",
                    border: "none",
                    cursor: thinking ? "default" : "pointer",
                    fontFamily: "inherit",
                    borderRadius: "var(--r-sm)",
                    opacity: thinking || !input.trim() ? 0.5 : 1,
                  }}
                >
                  ↑ Preguntar
                </button>
                <button
                  onClick={() => sendChat("propose")}
                  disabled={!isDirector || thinking || !input.trim()}
                  style={{
                    padding: "8px 12px",
                    fontSize: 11,
                    fontWeight: 600,
                    background: "transparent",
                    border: "1px solid var(--sand-dark)",
                    color: "var(--sand-dark)",
                    cursor: thinking ? "default" : "pointer",
                    fontFamily: "inherit",
                    borderRadius: "var(--r-sm)",
                    opacity: thinking || !input.trim() ? 0.5 : 1,
                  }}
                  title="Generar batch de piezas para aprobar"
                >
                  ✨ Generar batch
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function Kpi({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div
      style={{
        padding: "16px 20px",
        background: "var(--white)",
        border: "1px solid rgba(10,26,12,0.08)",
        borderRadius: "var(--r-md)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--sand-dark)",
          fontWeight: 600,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: color ?? "var(--deep-green)",
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  );
}
