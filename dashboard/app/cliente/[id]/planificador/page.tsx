"use client";

import { use, useCallback, useEffect, useState } from "react";
import { addContent, deleteContent, getContent } from "@/lib/storage";
import type { ContentFormat, ContentNetwork, ContentPost, ContentStatus } from "@/lib/types";
import ui from "@/components/ClientUI.module.css";

const MONTHS_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const NETWORK_COLOR: Record<ContentNetwork, string> = {
  ig: "var(--deep-green)",
  tt: "var(--sand-dark)",
  in: "var(--forest-2)",
  fb: "var(--forest)",
};

const NETWORK_LABEL: Record<ContentNetwork, string> = {
  ig: "Instagram",
  tt: "TikTok",
  in: "LinkedIn",
  fb: "Facebook",
};

export default function PlanificadorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [modalDate, setModalDate] = useState<string | null>(null);

  const refresh = useCallback(() => {
    getContent(id).then(setPosts);
  }, [id]);

  useEffect(() => refresh(), [refresh]);

  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (firstOfMonth.getDay() + 6) % 7;
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();

  function dayKey(d: number) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(year - 1); }
    else setMonth(month - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(year + 1); }
    else setMonth(month + 1);
  }

  const summary = {
    total: posts.length,
    published: posts.filter((p) => p.status === "published").length,
    scheduled: posts.filter((p) => p.status === "scheduled").length,
    draft: posts.filter((p) => p.status === "draft").length,
  };

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Contenido · Planificador editorial</div>
          <h1>Calendario de contenido</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", background: "var(--off-white)", borderLeft: "2px solid var(--green-ok)" }}>
          <span style={{ width: 8, height: 8, background: "var(--green-ok)", borderRadius: "50%" }} />
          <span style={{ fontSize: 11, letterSpacing: "0.1em", fontWeight: 500 }}>
            Meta Business Suite · Pendiente de conectar
          </span>
        </div>
      </div>

      {/* Summary */}
      <div className={ui.panel} style={{ marginBottom: 20 }}>
        <div className={ui.panelHead}>
          <div className={ui.panelTitle}>Resumen del mes</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
          {[
            ["Total", summary.total, "var(--deep-green)"],
            ["Publicados", summary.published, "var(--green-ok)"],
            ["Programados", summary.scheduled, "var(--sand)"],
            ["Borradores", summary.draft, "var(--yellow-warn)"],
          ].map(([label, val, color]) => (
            <div key={label as string}>
              <div style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--sand-dark)", marginBottom: 6, fontWeight: 600 }}>{label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: color as string }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Calendar */}
      <div className={ui.panel}>
        <div className={ui.panelHead}>
          <div className={ui.panelTitle}>{MONTHS_ES[month]} {year}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={prevMonth} className={ui.btnGhost} style={{ padding: "4px 10px" }}>‹</button>
            <button onClick={() => { setMonth(today.getMonth()); setYear(today.getFullYear()); }} className={ui.btnGhost} style={{ padding: "4px 12px" }}>Hoy</button>
            <button onClick={nextMonth} className={ui.btnGhost} style={{ padding: "4px 10px" }}>›</button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, marginBottom: 1 }}>
          {WEEKDAYS.map((d) => (
            <div key={d} style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--sand-dark)", textAlign: "center", padding: "10px 0", fontWeight: 500 }}>{d}</div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, background: "rgba(10,26,12,0.08)", border: "1px solid rgba(10,26,12,0.08)" }}>
          {Array.from({ length: startOffset }).map((_, i) => (
            <div key={`m${i}`} style={{ background: "var(--ivory)", minHeight: 80 }} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const d = i + 1;
            const key = dayKey(d);
            const dayPosts = posts.filter((p) => p.date === key);
            const isToday = isCurrentMonth && d === today.getDate();
            return (
              <div
                key={d}
                onClick={() => setModalDate(key)}
                style={{
                  background: isToday ? "var(--off-white)" : "var(--white)",
                  minHeight: 80,
                  padding: "8px 10px",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: isToday ? 700 : 500, color: isToday ? "var(--sand-dark)" : "var(--deep-green)" }}>{d}</div>
                {dayPosts.slice(0, 3).map((p) => (
                  <span
                    key={p.id}
                    style={{
                      display: "block",
                      fontSize: 10,
                      padding: "2px 6px",
                      marginTop: 4,
                      background: NETWORK_COLOR[p.network],
                      color: p.network === "ig" ? "var(--sand)" : p.network === "tt" ? "var(--white)" : "var(--off-white)",
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {p.time} {p.brief.slice(0, 14)}
                  </span>
                ))}
                {dayPosts.length > 3 && (
                  <span style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2, display: "block" }}>
                    +{dayPosts.length - 3}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {modalDate && (
        <ContentDayModal
          clientId={id}
          date={modalDate}
          posts={posts.filter((p) => p.date === modalDate)}
          onClose={() => setModalDate(null)}
          onChange={refresh}
        />
      )}
    </>
  );
}

function ContentDayModal({
  clientId, date, posts, onClose, onChange,
}: {
  clientId: string; date: string; posts: ContentPost[];
  onClose: () => void; onChange: () => void;
}) {
  const [mode, setMode] = useState<"agent" | "upload">("agent");
  const [network, setNetwork] = useState<ContentNetwork>("ig");
  const [format, setFormat] = useState<ContentFormat>("reel");
  const [brief, setBrief] = useState("");
  const [time, setTime] = useState("19:30");

  async function save(status: ContentStatus) {
    if (!brief.trim()) return;
    await addContent({
      clientId, date, time, network, format, brief: brief.trim(),
      status, source: mode === "agent" ? "ai" : "manual",
    });
    setBrief("");
    onChange();
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar este post?")) return;
    await deleteContent(id);
    onChange();
  }

  return (
    <div
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
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: "var(--white)", maxWidth: 640, width: "100%", maxHeight: "90vh", overflowY: "auto", padding: 48, position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 20, right: 20, fontSize: 20, width: 32, height: 32, background: "transparent", border: "none", cursor: "pointer" }}>×</button>

        <div style={{ fontSize: 10, letterSpacing: "0.25em", textTransform: "uppercase", color: "var(--sand-dark)", fontWeight: 600, marginBottom: 12 }}>
          Contenido · {date}
        </div>
        <h2 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.025em", marginBottom: 8 }}>
          {posts.length === 0 ? "Agregar contenido" : `${posts.length} post${posts.length === 1 ? "" : "s"} ese día`}
        </h2>

        {/* Posts existentes */}
        {posts.length > 0 && (
          <div style={{ marginBottom: 24, borderTop: "1px solid rgba(10,26,12,0.08)", paddingTop: 20 }}>
            {posts.map((p) => (
              <div key={p.id} style={{ padding: "12px 0", borderBottom: "1px solid rgba(10,26,12,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                    <span style={{ padding: "2px 8px", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", background: NETWORK_COLOR[p.network], color: p.network === "ig" ? "var(--sand)" : "var(--off-white)", fontWeight: 600 }}>
                      {NETWORK_LABEL[p.network]} · {p.format}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{p.time}</span>
                    <span className={`${ui.pill} ${p.status === "published" ? ui.pillGreen : p.status === "scheduled" ? ui.pillYellow : ui.pillGrey}`}>
                      {p.status === "published" ? "Publicado" : p.status === "scheduled" ? "Programado" : "Borrador"}
                    </span>
                  </div>
                  <div style={{ fontSize: 13 }}>{p.brief}</div>
                </div>
                <button onClick={() => remove(p.id)} style={{ color: "var(--red-warn)", fontSize: 16, background: "transparent", border: "none", cursor: "pointer" }}>×</button>
              </div>
            ))}
          </div>
        )}

        {/* Mode selector */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
          <button
            onClick={() => setMode("agent")}
            style={{
              padding: 20,
              border: `2px solid ${mode === "agent" ? "var(--sand)" : "rgba(10,26,12,0.1)"}`,
              background: mode === "agent" ? "var(--off-white)" : "var(--white)",
              cursor: "pointer",
              textAlign: "left",
              fontFamily: "inherit",
            }}
          >
            <div style={{ fontSize: 20, marginBottom: 8, color: "var(--sand-dark)" }}>⚡</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Agente Creativo</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              Generalo con IA desde el branding del cliente.
            </div>
          </button>
          <button
            onClick={() => setMode("upload")}
            style={{
              padding: 20,
              border: `2px solid ${mode === "upload" ? "var(--sand)" : "rgba(10,26,12,0.1)"}`,
              background: mode === "upload" ? "var(--off-white)" : "var(--white)",
              cursor: "pointer",
              textAlign: "left",
              fontFamily: "inherit",
            }}
          >
            <div style={{ fontSize: 20, marginBottom: 8, color: "var(--sand-dark)" }}>▲</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Subir manualmente</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              Cargá la pieza terminada.
            </div>
          </button>
        </div>

        {/* Form */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div>
            <label style={labelS}>Red</label>
            <select value={network} onChange={(e) => setNetwork(e.target.value as ContentNetwork)} style={inputS}>
              <option value="ig">Instagram</option>
              <option value="tt">TikTok</option>
              <option value="in">LinkedIn</option>
              <option value="fb">Facebook</option>
            </select>
          </div>
          <div>
            <label style={labelS}>Formato</label>
            <select value={format} onChange={(e) => setFormat(e.target.value as ContentFormat)} style={inputS}>
              <option value="reel">Reel / Video</option>
              <option value="carrusel">Carrusel</option>
              <option value="post">Imagen única</option>
              <option value="story">Story</option>
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelS}>Briefing / copy</label>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={3}
            placeholder="Ej: Post sobre la nueva colección primavera — tono cercano, CTA para reservar."
            style={{ ...inputS, resize: "vertical" }}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={labelS}>Horario</label>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={inputS} />
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={() => save("draft")} className={ui.btnGhost} disabled={!brief.trim()}>
            Guardar borrador
          </button>
          <button onClick={() => save("scheduled")} className={ui.btnSolid} disabled={!brief.trim()}>
            Programar →
          </button>
        </div>
      </div>
    </div>
  );
}

const labelS: React.CSSProperties = {
  display: "block",
  fontSize: 10,
  letterSpacing: "0.22em",
  textTransform: "uppercase",
  color: "var(--sand-dark)",
  fontWeight: 600,
  marginBottom: 8,
};

const inputS: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid rgba(10,26,12,0.15)",
  background: "var(--white)",
  color: "var(--deep-green)",
  fontFamily: "inherit",
  fontSize: 13,
  outline: "none",
};
