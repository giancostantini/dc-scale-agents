"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import {
  addContent,
  deleteContent,
  getClient,
  getContent,
  getEventsByClient,
  updateRoadmapMonthNote,
} from "@/lib/storage";
import { getCurrentProfile } from "@/lib/supabase/auth";
import {
  CONTENT_SLOTS,
  CONTENT_TYPE_META,
  NETWORK_COLORS,
  distributeContentTypes,
  normalizeFrequency,
  suggestedWeekdays,
  weekdayLunFirst,
  type ContentType,
} from "@/lib/content-frequency";
import { commercialDatesIndex } from "@/lib/commercial-dates";
import NewEventModal from "@/components/NewEventModal";
import type {
  CalEvent,
  Client,
  ContentFormat,
  ContentNetwork,
  ContentPost,
  ContentStatus,
} from "@/lib/types";
import ui from "@/components/ClientUI.module.css";

const MONTHS_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** Colores para los chips de posteo en el calendario — usamos los
 *  colores oficiales de cada red para que se diferencien a primera
 *  vista. (Centralizados en lib/content-frequency.ts). */
const NETWORK_COLOR_BG: Record<ContentNetwork, string> = {
  ig: NETWORK_COLORS.ig.solid,
  tt: NETWORK_COLORS.tt.solid,
  in: NETWORK_COLORS.in.solid,
  fb: NETWORK_COLORS.fb.solid,
};
const NETWORK_COLOR_FG: Record<ContentNetwork, string> = {
  ig: NETWORK_COLORS.ig.onSolid,
  tt: NETWORK_COLORS.tt.onSolid,
  in: NETWORK_COLORS.in.onSolid,
  fb: NETWORK_COLORS.fb.onSolid,
};

const NETWORK_LABEL: Record<ContentNetwork, string> = {
  ig: "Instagram",
  tt: "TikTok",
  in: "LinkedIn",
  fb: "Facebook",
};

/** Colores para tipos de evento del calendario (multi-día). */
const EVENT_TYPE_COLOR: Record<string, string> = {
  reunion: "#5A6A5E",
  cobro: "#2f7d4f",
  reporte: "#1f3a26",
  dev: "#9b8259",
  contenido: "#0A1A0C",
  pauta: "#b04b3a",
};
const EVENT_TYPE_LABEL: Record<string, string> = {
  reunion: "Reunión",
  cobro: "Cobro",
  reporte: "Reporte",
  dev: "Dev",
  contenido: "Contenido",
  pauta: "Pauta",
};

export default function PlanificadorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [client, setClient] = useState<Client | null>(null);
  const [isDirector, setIsDirector] = useState(false);
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [modalDate, setModalDate] = useState<string | null>(null);
  /**
   * Modal de detalle de UNA publicación — se abre al tocar un chip
   * de post en una celda del calendario. Solo muestra los datos del
   * post y un botón "Programar" que linkea al Meta Business Suite del
   * cliente cuando el post es IG/FB. El resto de la gestión de ideas
   * (crear, editar, asignar) vive en /contenido.
   */
  const [postDetail, setPostDetail] = useState<ContentPost | null>(null);
  const [eventModalDate, setEventModalDate] = useState<string | null>(null);
  const [pdfModal, setPdfModal] = useState(false);
  const [pdfFromYear, setPdfFromYear] = useState(today.getFullYear());
  const [pdfFromMonth, setPdfFromMonth] = useState(today.getMonth());
  const [pdfToYear, setPdfToYear] = useState(today.getFullYear());
  const [pdfToMonth, setPdfToMonth] = useState(today.getMonth());
  const [pdfBusy, setPdfBusy] = useState(false);
  const [monthNoteEditing, setMonthNoteEditing] = useState(false);
  const [monthNoteDraft, setMonthNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const refresh = useCallback(() => {
    getContent(id).then(setPosts);
    // Eventos: solo los de ESTE cliente. Antes traíamos TODOS y
    // filtrábamos con un check permisivo (clientId === id ||
    // clientId === undefined || clientId === null) — eso dejaba
    // pasar eventos sin client_id (los "globales" del calendario
    // del topbar) como si fueran del cliente. Ahora pegamos directo
    // a getEventsByClient que filtra en DB.
    getEventsByClient(id).then(setEvents);
  }, [id]);

  useEffect(() => refresh(), [refresh]);

  useEffect(() => {
    getClient(id).then((c) => setClient(c ?? null));
    getCurrentProfile().then((p) => setIsDirector(p?.role === "director"));
  }, [id]);

  // Map slot → días sugeridos (Lun-Dom).
  // Soporta back-compat con keys legacy via normalizeFrequency.
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

  // Fechas comerciales del año visible (lookup O(1) por día).
  const commercialIdx = useMemo(
    () => commercialDatesIndex(year),
    [year],
  );

  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (firstOfMonth.getDay() + 6) % 7;
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();

  // Key del mes visible (para roadmap_month_notes).
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthNote = client?.roadmap_month_notes?.[monthKey] ?? "";

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

  /** Para un día del mes, calcula el "índice ordinal" del slot
   *  sugerido en el mes y le asigna un tipo (V/O/E) según el mix
   *  configurado para esa red. Ej: si en IG hay 8 sugeridos en el mes
   *  con mix 60/25/15, el 1° y 2° son V, el 3° es O, el 4° y 5° son V, etc.
   *
   *  Devuelve un Map<dayKey, Map<slotKey, ContentType>>.
   */
  const slotTypesByDay = useMemo(() => {
    if (!client?.content_mix && !client?.content_frequency) {
      return new Map<string, Map<string, ContentType>>();
    }

    // Para cada slot: lista de [day, ordinalIndex] del slot en este mes.
    const slotOrdinals = new Map<string, { day: number; key: string }[]>();
    for (let d = 1; d <= daysInMonth; d++) {
      const cellDate = new Date(year, month, d);
      const weekday = weekdayLunFirst(cellDate);
      for (const slot of CONTENT_SLOTS) {
        const days = suggestedBySlot.get(slot.key);
        if (!days || !days.has(weekday)) continue;
        const list = slotOrdinals.get(slot.key) ?? [];
        list.push({ day: d, key: dayKey(d) });
        slotOrdinals.set(slot.key, list);
      }
    }

    // Para cada slot, distribuir tipos según el mix de su red.
    const out = new Map<string, Map<string, ContentType>>();
    for (const [slotKey, ordinals] of slotOrdinals.entries()) {
      const slot = CONTENT_SLOTS.find((s) => s.key === slotKey);
      if (!slot) continue;
      const networkMix = client?.content_mix?.[slot.network];
      const types = distributeContentTypes(networkMix, ordinals.length);
      ordinals.forEach((o, i) => {
        const inner = out.get(o.key) ?? new Map<string, ContentType>();
        inner.set(slotKey, types[i]);
        out.set(o.key, inner);
      });
    }
    return out;
  }, [
    client?.content_mix,
    client?.content_frequency,
    suggestedBySlot,
    year,
    month,
    daysInMonth,
  ]);

  /** Eventos multi-día visibles en este mes (intersección con el mes
   *  visible). Cada evento puede empezar antes y terminar después del
   *  mes — lo recortamos al rango visible y devolvemos las "bandas"
   *  que tienen que renderizarse.
   *
   *  Filtramos los eventos auto-generados por seed-from-strategy
   *  (marcados con "[Auto-estrategia]" en notes). En "Eventos y
   *  producciones del mes" solo queremos lo que el director agendó
   *  manualmente — los auto-eventos siguen visibles en las celdas
   *  diarias del calendario pero no inflan la lista del header. */
  const visibleEvents = useMemo(() => {
    const startOfMonthIso = dayKey(1);
    const endOfMonthIso = dayKey(daysInMonth);
    const AUTO_MARKER = "[Auto-estrategia]";
    return events.filter((ev) => {
      const evStart = ev.date;
      const evEnd = ev.end_date ?? ev.date;
      // intersección con el mes
      if (!(evStart <= endOfMonthIso && evEnd >= startOfMonthIso)) return false;
      // descartar eventos auto-generados — solo manuales
      if ((ev.notes ?? "").startsWith(AUTO_MARKER)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, year, month]);

  /**
   * Descarga el PDF del roadmap para el rango pdfFromYear/Month →
   * pdfToYear/Month. Lazy-load de react-pdf para no inflar el bundle
   * inicial. La grilla por mes va en página A4 horizontal, seguida
   * de una página de "estrategia del mes" si hay nota cargada.
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
      const months: { year: number; month0: number }[] = [];
      let cur = fromIdx;
      while (cur <= toIdx) {
        months.push({
          year: Math.floor(cur / 12),
          month0: cur % 12,
        });
        cur++;
      }
      if (months.length > 24) {
        alert(
          `El rango es de ${months.length} meses. Cap máximo: 24. Reducí el rango.`,
        );
        setPdfBusy(false);
        return;
      }

      const { pdf } = await import("@react-pdf/renderer");
      const { default: RoadmapPdf } = await import("@/components/RoadmapPdf");

      const blob = await pdf(
        <RoadmapPdf
          clientName={client.name}
          posts={posts}
          events={events}
          contentFrequency={
            client.content_frequency as
              | Record<string, number | undefined>
              | undefined
          }
          contentMix={client.content_mix}
          monthNotes={client.roadmap_month_notes}
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

  async function saveMonthNote() {
    if (savingNote || !client) return;
    setSavingNote(true);
    try {
      await updateRoadmapMonthNote(id, monthKey, monthNoteDraft);
      setClient((prev) =>
        prev
          ? {
              ...prev,
              roadmap_month_notes: monthNoteDraft.trim()
                ? { ...(prev.roadmap_month_notes ?? {}), [monthKey]: monthNoteDraft }
                : (() => {
                    const next = { ...(prev.roadmap_month_notes ?? {}) };
                    delete next[monthKey];
                    return next;
                  })(),
            }
          : prev,
      );
      setMonthNoteEditing(false);
    } catch (err) {
      const e = err as Error;
      alert(`No se pudo guardar la nota:\n${e.message}`);
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Calendario · Acciones del cliente</div>
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
          {/* Frecuencia + mix, Asistente Creativo y Poblar desde
              estrategia se manejan desde /contenido — acá el calendario
              queda enfocado solo en visualizar el roadmap, agendar
              eventos manuales y descargar el PDF. */}
        </div>
      </div>

      {/* Leyenda de slots configurados (red × formato) + tipos V/O/E */}
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
            borderRadius: "var(--r-md)",
            alignItems: "center",
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
            Redes
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
                      borderRadius: 2,
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
          <span style={{ flex: 1 }} />
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
            Tipo
          </span>
          {(["valor", "oferta", "engagement"] as ContentType[]).map((t) => {
            const meta = CONTENT_TYPE_META[t];
            return (
              <span
                key={t}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  color: "var(--deep-green)",
                  fontWeight: 600,
                }}
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    background: meta.color,
                    color: "#fff",
                    fontSize: 8.5,
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 3,
                  }}
                >
                  {meta.short}
                </span>
                {meta.label}
              </span>
            );
          })}
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

        {/* Bandas de eventos multi-día arriba del calendario, agrupadas
            por tipo para ahorrar espacio. */}
        {visibleEvents.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              padding: "8px 0 12px",
              borderBottom: "1px solid rgba(10,26,12,0.06)",
              marginBottom: 8,
            }}
          >
            <div
              style={{
                fontSize: 9,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--sand-dark)",
                fontWeight: 700,
              }}
            >
              Eventos y producciones del mes
            </div>
            {visibleEvents.map((ev) => {
              const startD = Math.max(
                1,
                new Date(ev.date).getMonth() === month &&
                  new Date(ev.date).getFullYear() === year
                  ? new Date(ev.date).getDate()
                  : 1,
              );
              const endIso = ev.end_date ?? ev.date;
              const endD = Math.min(
                daysInMonth,
                new Date(endIso).getMonth() === month &&
                  new Date(endIso).getFullYear() === year
                  ? new Date(endIso).getDate()
                  : daysInMonth,
              );
              const days = endD - startD + 1;
              const color =
                EVENT_TYPE_COLOR[ev.type] ?? EVENT_TYPE_COLOR.contenido;
              return (
                <div
                  key={ev.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 11,
                    background: `${color}14`,
                    padding: "4px 8px",
                    borderLeft: `3px solid ${color}`,
                  }}
                >
                  <span
                    style={{
                      fontSize: 8.5,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color,
                      fontWeight: 700,
                      minWidth: 56,
                    }}
                  >
                    {EVENT_TYPE_LABEL[ev.type] ?? ev.type}
                  </span>
                  <span style={{ fontWeight: 600 }}>{ev.title}</span>
                  <span style={{ color: "var(--text-muted)" }}>
                    {ev.end_date
                      ? `${ev.date} → ${ev.end_date} (${days} día${days === 1 ? "" : "s"})`
                      : ev.date}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, marginBottom: 1 }}>
          {WEEKDAYS.map((d) => (
            <div key={d} style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--sand-dark)", textAlign: "center", padding: "10px 0", fontWeight: 500 }}>{d}</div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, background: "rgba(10,26,12,0.08)", border: "1px solid rgba(10,26,12,0.08)" }}>
          {Array.from({ length: startOffset }).map((_, i) => (
            <div key={`m${i}`} style={{ background: "var(--ivory)", minHeight: 90 }} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const d = i + 1;
            const key = dayKey(d);
            const dayPosts = posts.filter((p) => p.date === key);
            const isToday = isCurrentMonth && d === today.getDate();
            const commercial = commercialIdx.get(key);

            const cellDate = new Date(year, month, d);
            const weekday = weekdayLunFirst(cellDate);

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
            const typesForDay = slotTypesByDay.get(key);

            // Eventos multi-día que cubren este día — chip-banda
            // chiquito al fondo de la celda.
            const dayEvents = events.filter((ev) => {
              const evStart = ev.date;
              const evEnd = ev.end_date ?? ev.date;
              return evStart <= key && evEnd >= key;
            });

            return (
              <div
                key={d}
                onClick={() => setModalDate(key)}
                style={{
                  background: isToday ? "var(--off-white)" : "var(--white)",
                  minHeight: 90,
                  padding: "6px 8px",
                  cursor: "pointer",
                  position: "relative",
                }}
              >
                {/* Header de la celda: día + flag de fecha comercial */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 4,
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: isToday ? 700 : 500,
                      color: isToday
                        ? "var(--sand-dark)"
                        : "var(--deep-green)",
                    }}
                  >
                    {d}
                  </div>
                  {commercial && (
                    <div
                      title={commercial.label}
                      style={{
                        fontSize: 9,
                        padding: "1px 5px",
                        background:
                          commercial.importance === "alta"
                            ? "rgba(196, 168, 130, 0.25)"
                            : "rgba(196, 168, 130, 0.10)",
                        color: "var(--sand-dark)",
                        fontWeight: 600,
                        letterSpacing: "0.04em",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        maxWidth: "100%",
                        borderRadius: 2,
                      }}
                    >
                      {commercial.emoji} {commercial.label.length > 12
                        ? commercial.label.slice(0, 11) + "…"
                        : commercial.label}
                    </div>
                  )}
                </div>

                {/* Posts reales — chip sólido con info. Click abre
                    el modal de detalle de publicación con un único
                    botón "Programar" (→ Meta Business Suite). El
                    stopPropagation evita abrir también el DayModal
                    que está en la celda padre. */}
                {dayPosts.slice(0, 2).map((p) => (
                  <span
                    key={p.id}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setPostDetail(p);
                    }}
                    title="Ver y programar esta publicación"
                    style={{
                      display: "block",
                      fontSize: 10,
                      padding: "2px 6px",
                      marginTop: 4,
                      background: NETWORK_COLOR_BG[p.network],
                      color: NETWORK_COLOR_FG[p.network],
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      borderRadius: 2,
                      cursor: "pointer",
                    }}
                  >
                    {p.time} {p.brief.slice(0, 14)}
                  </span>
                ))}
                {dayPosts.length > 2 && (
                  <span style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2, display: "block" }}>
                    +{dayPosts.length - 2}
                  </span>
                )}

                {/* Días sugeridos — chips ghost por SLOT con tag V/O/E
                    superpuesto si hay mix configurado. */}
                {suggestedSlots.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      gap: 3,
                      marginTop: 4,
                      flexWrap: "wrap",
                    }}
                  >
                    {suggestedSlots.map((slot) => {
                      const type = typesForDay?.get(slot.key);
                      const typeMeta = type
                        ? CONTENT_TYPE_META[type]
                        : null;
                      return (
                        <span
                          key={slot.key}
                          title={`${slot.networkLabel} ${slot.formatLabel}${typeMeta ? ` · ${typeMeta.label}` : ""}`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 2,
                            fontSize: 8.5,
                            padding: "1px 4px",
                            background: "transparent",
                            color: slot.color,
                            border: `1px dashed ${slot.color}`,
                            fontWeight: 600,
                            letterSpacing: "0.03em",
                            borderRadius: 2,
                          }}
                        >
                          {slot.shortCode}
                          {typeMeta && (
                            <span
                              style={{
                                fontSize: 7,
                                background: typeMeta.color,
                                color: "#fff",
                                padding: "0 3px",
                                fontWeight: 700,
                                borderRadius: 2,
                              }}
                            >
                              {typeMeta.short}
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Pie de celda: bandas de eventos multi-día que la cubren */}
                {dayEvents.length > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      left: 4,
                      right: 4,
                      bottom: 4,
                      display: "flex",
                      flexDirection: "column",
                      gap: 1,
                    }}
                  >
                    {dayEvents.slice(0, 2).map((ev) => {
                      const color =
                        EVENT_TYPE_COLOR[ev.type] ?? EVENT_TYPE_COLOR.contenido;
                      const isStart = ev.date === key;
                      const isEnd = (ev.end_date ?? ev.date) === key;
                      return (
                        <div
                          key={ev.id}
                          style={{
                            height: 4,
                            background: color,
                            borderTopLeftRadius: isStart ? 2 : 0,
                            borderBottomLeftRadius: isStart ? 2 : 0,
                            borderTopRightRadius: isEnd ? 2 : 0,
                            borderBottomRightRadius: isEnd ? 2 : 0,
                          }}
                          title={`${EVENT_TYPE_LABEL[ev.type] ?? ev.type}: ${ev.title}`}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Estrategia del mes — editable por el director, sale en el PDF. */}
      <div
        style={{
          marginTop: 24,
          padding: 24,
          background: "var(--white)",
          border: "1px solid rgba(10,26,12,0.08)",
          borderRadius: "var(--r-lg)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 14,
            paddingBottom: 12,
            borderBottom: "1px solid rgba(10,26,12,0.06)",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 9,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--sand-dark)",
                fontWeight: 700,
                marginBottom: 4,
              }}
            >
              Estrategia del mes
            </div>
            <h3
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "var(--deep-green)",
              }}
            >
              {MONTHS_ES[month]} {year}
            </h3>
          </div>
          {isDirector && !monthNoteEditing && (
            <button
              onClick={() => {
                setMonthNoteDraft(monthNote);
                setMonthNoteEditing(true);
              }}
              className={ui.btnGhost}
            >
              {monthNote ? "Editar" : "+ Escribir estrategia"}
            </button>
          )}
        </div>

        {monthNoteEditing ? (
          <>
            <textarea
              value={monthNoteDraft}
              onChange={(e) => setMonthNoteDraft(e.target.value)}
              placeholder="Ej: En mayo arrancamos el batch de awareness frío con Reels. Foco en hook de los primeros 3s. Pauta inicial US$ 800/mes en IG+FB. Black Friday capturamos demanda con campaña dedicada de retargeting…"
              rows={10}
              style={{
                width: "100%",
                padding: 14,
                border: "1px solid rgba(10,26,12,0.15)",
                background: "var(--white)",
                color: "var(--deep-green)",
                fontFamily: "inherit",
                fontSize: 13,
                lineHeight: 1.6,
                resize: "vertical",
                borderRadius: "var(--r-md)",
                outline: "none",
              }}
            />
            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "flex-end",
                marginTop: 12,
              }}
            >
              <button
                onClick={() => setMonthNoteEditing(false)}
                disabled={savingNote}
                className={ui.btnGhost}
              >
                Cancelar
              </button>
              <button
                onClick={saveMonthNote}
                disabled={savingNote}
                className={ui.btnSolid}
              >
                {savingNote ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </>
        ) : monthNote ? (
          <div
            style={{
              fontSize: 14,
              color: "var(--deep-green)",
              lineHeight: 1.7,
              whiteSpace: "pre-wrap",
            }}
          >
            {monthNote}
          </div>
        ) : (
          <div
            style={{
              fontSize: 13,
              color: "var(--text-muted)",
              padding: 24,
              textAlign: "center",
              background: "var(--ivory)",
              borderRadius: "var(--r-md)",
              lineHeight: 1.6,
            }}
          >
            {isDirector
              ? "Escribí la estrategia del mes — campaña principal, prioridades, fechas clave. Va en el PDF del roadmap."
              : "El director todavía no escribió la estrategia de este mes."}
          </div>
        )}
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

      {postDetail && (
        <PostDetailModal
          post={postDetail}
          metaBusinessSuiteUrl={client?.external_links?.meta_business_suite_url ?? null}
          onClose={() => setPostDetail(null)}
        />
      )}

      <NewEventModal
        open={eventModalDate !== null}
        initialDate={eventModalDate ?? undefined}
        initialClientId={id}
        onClose={() => setEventModalDate(null)}
        onCreated={() => {
          setEventModalDate(null);
          refresh();
        }}
      />

      {/* Frecuencia + mix, Asistente Creativo y "Poblar desde
          estrategia" se manejan desde /contenido — los modales y la
          lógica de seed quedaron fuera del calendario para no duplicar
          entrypoints. */}

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
              borderRadius: "var(--r-lg)",
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
              Calendario · Descarga PDF
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
              Cada mes va a salir con un calendario A4 horizontal + una página
              con la estrategia escrita de ese mes (si está cargada). Máximo 24 meses.
            </p>

            <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={pdfLabelStyle}>Desde</label>
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
                <label style={pdfLabelStyle}>Hasta</label>
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
                borderRadius: "var(--r-md)",
              }}
            >
              {(() => {
                const from = pdfFromYear * 12 + pdfFromMonth;
                const to = pdfToYear * 12 + pdfToMonth;
                const count = to - from + 1;
                if (count <= 0) return "⚠ El rango es inválido.";
                if (count > 24) return `⚠ ${count} meses — máximo 24.`;
                return `${count} ${count === 1 ? "mes" : "meses"} (~${count * 2} páginas).`;
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
  borderRadius: "var(--r-md)",
};

const pdfLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 10,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "var(--sand-dark)",
  fontWeight: 700,
  marginBottom: 6,
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
      clientId,
      date,
      time,
      network,
      // Multi-red (mig 065): el ContentDayModal solo deja elegir UNA
      // red, pero el campo `networks` es obligatorio en el tipo, así
      // que lo poblamos con la única elegida.
      networks: [network],
      format,
      brief: brief.trim(),
      status,
      source: mode === "agent" ? "ai" : "manual",
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
      <div style={{ background: "var(--white)", maxWidth: 640, width: "100%", maxHeight: "90vh", overflowY: "auto", padding: 48, position: "relative", borderRadius: "var(--r-lg)" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 20, right: 20, fontSize: 20, width: 32, height: 32, background: "transparent", border: "none", cursor: "pointer" }}>×</button>

        <div style={{ fontSize: 10, letterSpacing: "0.25em", textTransform: "uppercase", color: "var(--sand-dark)", fontWeight: 600, marginBottom: 12 }}>
          Contenido · {date}
        </div>
        <h2 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.025em", marginBottom: 8 }}>
          {posts.length === 0 ? "Agregar contenido" : `${posts.length} post${posts.length === 1 ? "" : "s"} ese día`}
        </h2>

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
            borderRadius: "var(--r-md)",
          }}
        >
          <span>
            ¿No es contenido? Creá una <strong>producción, reunión, pauta o
            deadline</strong> (puede abarcar varios días).
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
              borderRadius: "var(--r-md)",
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
                    <span style={{ padding: "2px 8px", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", background: NETWORK_COLOR_BG[p.network], color: NETWORK_COLOR_FG[p.network], fontWeight: 600, borderRadius: "var(--r-pill)" }}>
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
              borderRadius: "var(--r-md)",
              boxShadow: "var(--shadow-sm)",
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
              borderRadius: "var(--r-md)",
              boxShadow: "var(--shadow-sm)",
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
  borderRadius: "var(--r-md)",
};

// ============================================================
// PostDetailModal — mini-modal que aparece al tocar un chip de post
// en una celda del calendario. Solo muestra info del post + un único
// botón "Programar". Si el post es IG o FB y el cliente tiene URL de
// Meta Business Suite configurada, el botón abre ese URL en una nueva
// pestaña. Para TikTok y LinkedIn el botón está deshabilitado con un
// tooltip que indica que la programación se hace manualmente en la
// plataforma correspondiente.
// ============================================================
function PostDetailModal({
  post,
  metaBusinessSuiteUrl,
  onClose,
}: {
  post: ContentPost;
  metaBusinessSuiteUrl: string | null;
  onClose: () => void;
}) {
  // Soporta IG y FB para el deeplink a Meta Business Suite.
  const isMetaNetwork = post.network === "ig" || post.network === "fb";
  // Fallback universal si el cliente no tiene URL custom seteada.
  const FALLBACK_URL = "https://business.facebook.com/latest/home";
  const programUrl = isMetaNetwork
    ? metaBusinessSuiteUrl?.trim() || FALLBACK_URL
    : null;

  const statusLabel =
    post.status === "published"
      ? "Publicado"
      : post.status === "scheduled"
        ? "Programado"
        : "Borrador";
  const statusPillClass =
    post.status === "published"
      ? ui.pillGreen
      : post.status === "scheduled"
        ? ui.pillYellow
        : ui.pillGrey;

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
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
          maxWidth: 480,
          width: "100%",
          padding: 36,
          borderRadius: "var(--r-lg)",
          position: "relative",
          boxShadow: "var(--shadow-md)",
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            fontSize: 18,
            width: 32,
            height: 32,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--text-muted)",
          }}
        >
          ×
        </button>

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
          Publicación · {post.date}
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              padding: "3px 10px",
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              background: NETWORK_COLOR_BG[post.network],
              color: NETWORK_COLOR_FG[post.network],
              fontWeight: 600,
              borderRadius: "var(--r-pill)",
            }}
          >
            {NETWORK_LABEL[post.network]} · {post.format}
          </span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {post.time}
          </span>
          <span className={`${ui.pill} ${statusPillClass}`}>
            {statusLabel}
          </span>
        </div>

        <div
          style={{
            fontSize: 13,
            color: "var(--deep-green)",
            lineHeight: 1.55,
            marginBottom: 24,
            padding: 14,
            background: "var(--off-white)",
            borderRadius: "var(--r-md)",
            whiteSpace: "pre-wrap",
            maxHeight: 220,
            overflowY: "auto",
          }}
        >
          {post.brief || (
            <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
              Sin brief cargado. La idea / copy completos viven en el menú
              <strong> Contenido</strong>.
            </span>
          )}
        </div>

        {/* Único botón disponible: Programar. IG/FB → Meta Business
            Suite. Otras redes → deshabilitado con tooltip. */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          {programUrl ? (
            <a
              href={programUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className={ui.btnSolid}
              style={{
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
              title={
                metaBusinessSuiteUrl
                  ? "Abrir el planner del cliente en Meta Business Suite"
                  : "URL de Meta Business Suite del cliente sin configurar — abriendo el home genérico. Configurala en /configuracion del cliente."
              }
            >
              Programar en Meta Business Suite ↗
            </a>
          ) : (
            <button
              disabled
              className={ui.btnGhost}
              title={`Programá manualmente desde la app de ${NETWORK_LABEL[post.network]}. El planner de Meta Business Suite solo cubre IG y FB.`}
              style={{ opacity: 0.55, cursor: "not-allowed" }}
            >
              Programar (manual en {NETWORK_LABEL[post.network]})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
