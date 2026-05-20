"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { addContent, deleteContent, getClient, getContent } from "@/lib/storage";
import { getCurrentProfile } from "@/lib/supabase/auth";
import {
  CONTENT_SLOTS,
  normalizeFrequency,
  suggestedWeekdays,
  weekdayLunFirst,
} from "@/lib/content-frequency";
import ContentFrequencyModal from "@/components/ContentFrequencyModal";
import NewEventModal from "@/components/NewEventModal";
import type {
  Client,
  ContentFormat,
  ContentFrequency,
  ContentNetwork,
  ContentPost,
  ContentStatus,
} from "@/lib/types";
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
  const [client, setClient] = useState<Client | null>(null);
  const [isDirector, setIsDirector] = useState(false);
  const [freqModal, setFreqModal] = useState(false);
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [modalDate, setModalDate] = useState<string | null>(null);
  const [eventModalDate, setEventModalDate] = useState<string | null>(null);
  const [pdfModal, setPdfModal] = useState(false);
  const [pdfFromYear, setPdfFromYear] = useState(today.getFullYear());
  const [pdfFromMonth, setPdfFromMonth] = useState(today.getMonth());
  const [pdfToYear, setPdfToYear] = useState(today.getFullYear());
  const [pdfToMonth, setPdfToMonth] = useState(today.getMonth());
  const [pdfBusy, setPdfBusy] = useState(false);

  const refresh = useCallback(() => {
    getContent(id).then(setPosts);
  }, [id]);

  useEffect(() => refresh(), [refresh]);

  useEffect(() => {
    getClient(id).then((c) => setClient(c ?? null));
    getCurrentProfile().then((p) => setIsDirector(p?.role === "director"));
  }, [id]);

  // Para cada SLOT configurado (red × formato), qué días de la semana
  // corresponden. Ej: { ig_feed: 3, ig_story: 7 } →
  //   ig_feed: Lun/Mié/Vie (3x/sem)
  //   ig_story: Lun-Dom (7x/sem)
  // Soporta back-compat con keys legacy (ig, tt, in, fb) via normalizeFrequency.
  const suggestedBySlot = useMemo(() => {
    const normalized = normalizeFrequency(
      client?.content_frequency as
        | Record<string, number | undefined>
        | undefined,
    );
    const map = new Map<string, Set<number>>();
    for (const slot of CONTENT_SLOTS) {
      const perWeek = normalized[slot.key] ?? 0;
      if (perWeek > 0) map.set(slot.key, suggestedWeekdays(perWeek));
    }
    return map;
  }, [client?.content_frequency]);

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

  /**
   * Descarga el PDF del roadmap para el rango pdfFromYear/Month →
   * pdfToYear/Month. Lazy-load de react-pdf para no inflar el bundle
   * inicial. La grilla por mes va en página A4 horizontal.
   */
  async function downloadRoadmapPdf() {
    if (pdfBusy || !client) return;
    setPdfBusy(true);
    try {
      // Validar rango: from <= to
      const fromIdx = pdfFromYear * 12 + pdfFromMonth;
      const toIdx = pdfToYear * 12 + pdfToMonth;
      if (toIdx < fromIdx) {
        alert("El mes 'hasta' tiene que ser igual o posterior al 'desde'.");
        setPdfBusy(false);
        return;
      }
      // Generar array de meses del rango
      const months: { year: number; month0: number }[] = [];
      let cur = fromIdx;
      while (cur <= toIdx) {
        months.push({
          year: Math.floor(cur / 12),
          month0: cur % 12,
        });
        cur++;
      }
      // Cap defensivo: no permitimos rangos absurdos (>24 meses)
      if (months.length > 24) {
        alert(
          `El rango es de ${months.length} meses. Cap máximo: 24. Reducí el rango.`,
        );
        setPdfBusy(false);
        return;
      }

      // Lazy-load react-pdf + componente
      const { pdf } = await import("@react-pdf/renderer");
      const { default: RoadmapPdf } = await import("@/components/RoadmapPdf");

      // Pasamos TODOS los posts y dejamos que el componente filtre
      // por mes — más simple que pre-filtrar.
      const blob = await pdf(
        <RoadmapPdf
          clientName={client.name}
          posts={posts}
          contentFrequency={
            client.content_frequency as
              | Record<string, number | undefined>
              | undefined
          }
          months={months}
        />,
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const fromLabel = `${pdfFromYear}-${String(pdfFromMonth + 1).padStart(2, "0")}`;
      const toLabel = `${pdfToYear}-${String(pdfToMonth + 1).padStart(2, "0")}`;
      a.download = `Roadmap ${client.name} ${fromLabel}_${toLabel}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setPdfModal(false);
    } catch (err) {
      const e = err as Error;
      console.error("downloadRoadmapPdf error:", err);
      alert(`No se pudo generar el PDF:\n${e.message}`);
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Roadmap · Acciones del cliente</div>
          <h1>Calendario de acciones</h1>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            className={ui.btnGhost}
            onClick={() => setPdfModal(true)}
            style={{ fontWeight: 600 }}
          >
            ↓ Descargar PDF
          </button>
          <button
            className={ui.btnGhost}
            onClick={() =>
              setEventModalDate(new Date().toISOString().slice(0, 10))
            }
            style={{ fontWeight: 600 }}
          >
            + Nuevo evento / producción
          </button>
          {isDirector && (
            <button
              className={ui.btnSolid}
              onClick={() => setFreqModal(true)}
            >
              ⚑ Frecuencia de contenido
            </button>
          )}
        </div>
      </div>

      {/* Leyenda de slots configurados (red × formato) — visible para todos */}
      {suggestedBySlot.size > 0 && (
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            marginBottom: 16,
            padding: "10px 14px",
            background: "var(--off-white)",
            fontSize: 11,
          }}
        >
          <span
            style={{
              fontSize: 9,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "var(--sand-dark)",
              fontWeight: 700,
              marginRight: 4,
            }}
          >
            Frecuencia
          </span>
          {CONTENT_SLOTS.filter((s) => suggestedBySlot.has(s.key)).map(
            (slot) => {
              const days = suggestedBySlot.get(slot.key)!;
              return (
                <span
                  key={slot.key}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    color: "var(--deep-green)",
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      background: slot.color,
                      display: "inline-block",
                    }}
                  />
                  <strong>
                    {slot.networkLabel} {slot.formatLabel}
                  </strong>
                  <span style={{ color: "var(--text-muted)" }}>
                    {days.size}x/sem
                  </span>
                </span>
              );
            },
          )}
        </div>
      )}

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

            // Día de la semana (Lun=0..Dom=6) para chequear sugeridos.
            const cellDate = new Date(year, month, d);
            const weekday = weekdayLunFirst(cellDate);

            // Slots sugeridos para este día (red × formato).
            // Excluimos los slots cuyo network+format ya tiene un post
            // cargado para ese día — para no doblar la info.
            // Mapping de ContentFormat de la DB a "feed/story/reel/video":
            //   reel → reel; story → story; otros → feed (excepto TikTok
            //   donde "video" sigue siendo el formato principal).
            const slotsWithRealPost = new Set<string>();
            for (const p of dayPosts) {
              let fmt: string;
              if (p.format === "story") fmt = "story";
              else if (p.format === "reel") fmt = "reel";
              else if (p.network === "tt") fmt = "video";
              else fmt = "feed";
              slotsWithRealPost.add(`${p.network}_${fmt}`);
            }
            const suggestedSlots = CONTENT_SLOTS.filter((slot) => {
              const days = suggestedBySlot.get(slot.key);
              if (!days || !days.has(weekday)) return false;
              return !slotsWithRealPost.has(slot.key);
            });

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
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: isToday ? 700 : 500,
                    color: isToday ? "var(--sand-dark)" : "var(--deep-green)",
                  }}
                >
                  {d}
                </div>

                {/* Posts reales — chip sólido con info */}
                {dayPosts.slice(0, 3).map((p) => (
                  <span
                    key={p.id}
                    style={{
                      display: "block",
                      fontSize: 10,
                      padding: "2px 6px",
                      marginTop: 4,
                      background: NETWORK_COLOR[p.network],
                      color:
                        p.network === "ig"
                          ? "var(--sand)"
                          : p.network === "tt"
                          ? "var(--white)"
                          : "var(--off-white)",
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

                {/* Días sugeridos — chips ghost por SLOT.
                    Indican "tocaría publicar este formato en esta red"
                    según la frecuencia configurada. Sigla corta tipo
                    IG·F / IG·S / IG·R / TT·V. */}
                {suggestedSlots.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      gap: 3,
                      marginTop: 4,
                      flexWrap: "wrap",
                    }}
                  >
                    {suggestedSlots.map((slot) => (
                      <span
                        key={slot.key}
                        title={`${slot.networkLabel} ${slot.formatLabel} · día sugerido`}
                        style={{
                          fontSize: 8.5,
                          padding: "1px 4px",
                          background: "transparent",
                          color: slot.color,
                          border: `1px dashed ${slot.color}`,
                          fontWeight: 600,
                          letterSpacing: "0.03em",
                        }}
                      >
                        {slot.shortCode}
                      </span>
                    ))}
                  </div>
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
          onOpenEvent={(d) => {
            setModalDate(null);
            setEventModalDate(d);
          }}
        />
      )}

      {/* NewEventModal: produccion / reunion / deadline. Misma fecha
          que clickeó el usuario o "hoy" si vino desde botón del header. */}
      <NewEventModal
        open={eventModalDate !== null}
        initialDate={eventModalDate ?? undefined}
        initialClientId={id}
        onClose={() => setEventModalDate(null)}
        onCreated={() => setEventModalDate(null)}
      />

      <ContentFrequencyModal
        open={freqModal}
        clientId={id}
        current={client?.content_frequency}
        onClose={() => setFreqModal(false)}
        onSaved={(newFreq: ContentFrequency) => {
          // Update local state inmediato sin necesidad de re-fetch del cliente
          setClient((prev) =>
            prev ? { ...prev, content_frequency: newFreq } : prev,
          );
        }}
      />

      {/* Modal de descarga PDF: rango de meses */}
      {pdfModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !pdfBusy) setPdfModal(false);
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
              padding: 36,
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.25em",
                textTransform: "uppercase",
                color: "var(--sand-dark)",
                fontWeight: 600,
                marginBottom: 12,
              }}
            >
              Roadmap · Descarga PDF
            </div>
            <h2
              style={{
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                marginBottom: 8,
              }}
            >
              Elegí el rango de meses
            </h2>
            <p
              style={{
                fontSize: 13,
                color: "var(--text-muted)",
                marginBottom: 20,
                lineHeight: 1.5,
              }}
            >
              Se genera un PDF con un mes por página (A4 horizontal) con
              los posts cargados + chips de frecuencia sugerida. Máximo 24 meses.
            </p>

            <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 10,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "var(--sand-dark)",
                    fontWeight: 700,
                    marginBottom: 6,
                  }}
                >
                  Desde
                </label>
                <div style={{ display: "flex", gap: 6 }}>
                  <select
                    value={pdfFromMonth}
                    onChange={(e) => setPdfFromMonth(Number(e.target.value))}
                    disabled={pdfBusy}
                    style={selectStyle}
                  >
                    {MONTHS_ES.map((m, i) => (
                      <option key={i} value={i}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={pdfFromYear}
                    onChange={(e) => setPdfFromYear(Number(e.target.value))}
                    disabled={pdfBusy}
                    min={2020}
                    max={2099}
                    style={{ ...selectStyle, width: 70 }}
                  />
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 10,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "var(--sand-dark)",
                    fontWeight: 700,
                    marginBottom: 6,
                  }}
                >
                  Hasta
                </label>
                <div style={{ display: "flex", gap: 6 }}>
                  <select
                    value={pdfToMonth}
                    onChange={(e) => setPdfToMonth(Number(e.target.value))}
                    disabled={pdfBusy}
                    style={selectStyle}
                  >
                    {MONTHS_ES.map((m, i) => (
                      <option key={i} value={i}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={pdfToYear}
                    onChange={(e) => setPdfToYear(Number(e.target.value))}
                    disabled={pdfBusy}
                    min={2020}
                    max={2099}
                    style={{ ...selectStyle, width: 70 }}
                  />
                </div>
              </div>
            </div>

            <div
              style={{
                padding: "10px 14px",
                background: "var(--ivory)",
                fontSize: 12,
                color: "var(--text-muted)",
                marginBottom: 20,
              }}
            >
              {(() => {
                const from = pdfFromYear * 12 + pdfFromMonth;
                const to = pdfToYear * 12 + pdfToMonth;
                const count = to - from + 1;
                if (count <= 0) return "⚠ El rango es inválido.";
                if (count > 24) return `⚠ ${count} meses — máximo 24.`;
                return `${count} ${count === 1 ? "página" : "páginas"} (un mes por página).`;
              })()}
            </div>

            <div
              style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}
            >
              <button
                onClick={() => setPdfModal(false)}
                disabled={pdfBusy}
                className={ui.btnGhost}
              >
                Cancelar
              </button>
              <button
                onClick={downloadRoadmapPdf}
                disabled={pdfBusy}
                className={ui.btnSolid}
              >
                {pdfBusy ? "Generando…" : "↓ Descargar PDF"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const selectStyle: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid rgba(10,26,12,0.15)",
  background: "var(--white)",
  color: "var(--deep-green)",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
};

function ContentDayModal({
  clientId, date, posts, onClose, onChange, onOpenEvent,
}: {
  clientId: string; date: string; posts: ContentPost[];
  onClose: () => void; onChange: () => void;
  onOpenEvent: (date: string) => void;
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

        {/* Quick-link a NewEventModal para crear producción / evento
            con la fecha ya seteada. */}
        <div
          style={{
            marginTop: 8,
            marginBottom: 24,
            padding: "10px 14px",
            background: "var(--ivory)",
            borderLeft: "3px solid var(--sand)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            fontSize: 12,
            color: "var(--text-muted)",
          }}
        >
          <span>
            ¿No es contenido? Creá una <strong>producción, reunión, sesión o
            deadline</strong> en el calendario.
          </span>
          <button
            onClick={() => onOpenEvent(date)}
            style={{
              background: "transparent",
              border: "1px solid var(--sand)",
              color: "var(--deep-green)",
              padding: "6px 12px",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              whiteSpace: "nowrap",
            }}
          >
            + Producción / Evento →
          </button>
        </div>

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
