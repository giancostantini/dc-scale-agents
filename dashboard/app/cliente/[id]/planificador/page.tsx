"use client";

/**
 * Calendario del cliente — el centro del contenido de los clientes
 * growth (migración 102).
 *
 * Flujo:
 *   1. El director define la frecuencia y el mix (⚙ Frecuencia).
 *   2. El asistente creativo carga el mes: en qué día hay contenido, en
 *      qué red, de qué formato y con qué intención. No escribe texto
 *      (lib/content-plan.ts — determinístico, sin IA).
 *   3. La CM / el editor abren cada pieza, cargan la descripción y la
 *      foto (→ Preparado) y la marcan como subida cuando la publican.
 *
 * El módulo Contenido (aprobación de piezas IA, feed, consultor) quedó
 * fuera del menú pero sigue vivo por link directo — ver el link al pie.
 */

import {
  Suspense,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  addContent,
  addContentBatch,
  deleteContent,
  deletePlannedBetween,
  deleteProgrammedBetween,
  getClient,
  getContent,
  getEventsByClient,
  updateContent,
  updateRoadmapMonthNote,
} from "@/lib/storage";
import {
  canEditContent,
  getCurrentProfile,
  type Profile,
} from "@/lib/supabase/auth";
import { getSupabase } from "@/lib/supabase/client";
import { uploadContentPreview } from "@/lib/upload";
import {
  CONTENT_TYPE_META,
  NETWORK_COLORS,
  type ContentType,
} from "@/lib/content-frequency";
import {
  PIECE_STATE_META,
  addDaysIso,
  isOverdue,
  monthSummary,
  pieceState,
  pieceTitle,
  planMonth,
  plannableSlots,
  type PlannedPiece,
} from "@/lib/content-plan";
import { isoLocalDate, networksOf } from "@/lib/content-labels";
import NewEventModal from "@/components/NewEventModal";
import ContentMonthGrid, {
  LegendTitle,
  NETWORK_ORDER,
  OVERDUE_COLOR,
  StatePill,
  TypeBadge,
  mainNetwork,
  sortPieces,
} from "@/components/content/ContentMonthGrid";
import ContentFrequencyModal from "@/components/ContentFrequencyModal";
import type {
  CalEvent,
  Client,
  ContentFormat,
  ContentFrequency,
  ContentMix,
  ContentNetwork,
  ContentPost,
} from "@/lib/types";
import ui from "@/components/ClientUI.module.css";

const MONTHS_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
/** Orden de getDay() (0 = domingo). */
const WEEKDAYS_LONG = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

const NETWORK_LABEL: Record<ContentNetwork, string> = {
  ig: "Instagram",
  tt: "TikTok",
  in: "LinkedIn",
  fb: "Facebook",
};
/** Formatos que se pueden agregar a mano desde el modal del día. */
const ADDABLE_FORMATS: { value: ContentFormat; label: string }[] = [
  { value: "post", label: "Posteo" },
  { value: "story", label: "Historia" },
  { value: "reel", label: "Reel / Video" },
  { value: "carrusel", label: "Carrusel" },
];

/** "Hoy", "Mañana", "Ayer" o "El jueves 24/9". */
function dayPhrase(date: string, today: string): string {
  if (date === today) return "Hoy";
  if (date === addDaysIso(today, 1)) return "Mañana";
  if (date === addDaysIso(today, -1)) return "Ayer";
  const [y, m, d] = date.split("-").map(Number);
  return `El ${WEEKDAYS_LONG[new Date(y, m - 1, d).getDay()]} ${d}/${m}`;
}

/** Baja la primera letra para seguir una frase ("Hoy toca: posteo…"),
 *  salvo siglas como UGC. */
function lowerFirst(s: string): string {
  if (s.length > 1 && s[1] !== s[1].toLowerCase()) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** "Hoy toca: posteo de oferta en Instagram". */
function tocaPhrase(post: ContentPost, today: string): string {
  const verb = post.date < today ? "tocaba" : "toca";
  return `${dayPhrase(post.date, today)} ${verb}: ${lowerFirst(pieceTitle(post))}`;
}

function errorMessage(err: unknown): string {
  const msg = (err as { message?: string } | null)?.message ?? String(err);
  // Sin la migración 102, el CHECK de status rechaza 'planned' y las
  // columnas content_type / published_at no existen.
  return /status_check|content_type|published_at/i.test(msg)
    ? `${msg}\n\n¿Está corrida la migración 102?`
    : msg;
}

export default function PlanificadorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // useSearchParams (deep link ?pieza=<id> desde el dashboard) exige un
  // Suspense boundary en páginas client de Next 16.
  return (
    <Suspense fallback={null}>
      <Planificador params={params} />
    </Suspense>
  );
}

function Planificador({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const piezaParam = searchParams.get("pieza");
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [client, setClient] = useState<Client | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const today = new Date();
  const todayIso = isoLocalDate(today);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  /** Día abierto en el modal del día (YYYY-MM-DD). */
  const [dayModal, setDayModal] = useState<string | null>(null);
  /** Pieza abierta. Guardamos el id y no un snapshot: el modal siempre
   *  muestra la versión fresca después de un refresh. */
  const [pieceId, setPieceId] = useState<string | null>(null);
  const [freqModal, setFreqModal] = useState(false);
  const [planning, setPlanning] = useState(false);
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
  // Agente creativo dentro del editor de estrategia (solo director).
  const [agentPrompt, setAgentPrompt] = useState("");
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    getContent(id).then(setPosts);
    // Eventos: solo los de ESTE cliente (getEventsByClient filtra en DB;
    // los eventos globales del topbar no tienen client_id).
    getEventsByClient(id).then(setEvents);
  }, [id]);

  useEffect(() => refresh(), [refresh]);

  // Deep link ?pieza=<id> (lo usa el aviso de contenidos del dashboard):
  // posiciona el calendario en el mes de la pieza y la abre.
  useEffect(() => {
    if (!piezaParam) return;
    let active = true;
    getContent(id).then((all) => {
      const target = all.find((p) => p.id === piezaParam);
      if (!active || !target) return;
      const [y, m] = target.date.split("-").map(Number);
      setYear(y);
      setMonth(m - 1);
      setPieceId(target.id);
    });
    return () => {
      active = false;
    };
  }, [id, piezaParam]);

  useEffect(() => {
    getClient(id).then((c) => setClient(c ?? null));
    getCurrentProfile().then((p) => setProfile(p ?? null));
  }, [id]);

  const isDirector = profile?.role === "director";
  const canEdit = canEditContent(profile, client?.type);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
  const isPastMonth =
    year < today.getFullYear() ||
    (year === today.getFullYear() && month < today.getMonth());
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthLabel = MONTHS_ES[month];
  const monthNote = client?.roadmap_month_notes?.[monthKey] ?? "";
  const lastDayIso = `${monthKey}-${String(daysInMonth).padStart(2, "0")}`;
  /** En el mes en curso el asistente carga desde hoy: no rellena días
   *  que ya pasaron. */
  const planFrom = isCurrentMonth ? todayIso : `${monthKey}-01`;

  const monthPosts = useMemo(
    () => posts.filter((p) => p.date.startsWith(`${monthKey}-`)),
    [posts, monthKey],
  );
  const summary = monthSummary(monthPosts, todayIso);

  // Frecuencia que el asistente puede cargar (YouTube no entra en
  // content_posts).
  const plannableFreq = useMemo(
    () => plannableSlots(client?.content_frequency),
    [client?.content_frequency],
  );
  const hasFrequency = plannableFreq.length > 0;

  // Lo que el asistente cargaría si se aprieta el botón ahora. Es un
  // cálculo chico (días del mes × slots), no hace falta memo.
  const missing: PlannedPiece[] =
    client && !isPastMonth
      ? planMonth({
          frequency: client.content_frequency,
          mix: client.content_mix,
          year,
          month0: month,
          fromDate: planFrom,
          existing: posts,
        })
      : [];

  const openPiece = pieceId ? posts.find((p) => p.id === pieceId) ?? null : null;

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(year - 1); }
    else setMonth(month - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(year + 1); }
    else setMonth(month + 1);
  }

  function toNewPiece(p: PlannedPiece): Omit<ContentPost, "id" | "createdAt"> {
    return {
      clientId: id,
      date: p.date,
      time: null,
      network: p.network,
      networks: [p.network],
      format: p.format,
      brief: "",
      contentType: p.contentType,
      status: "planned",
      source: "manual",
    };
  }

  /**
   * Asistente creativo: carga lo que falta del mes visible.
   *  - Normal: solo agrega (nunca borra).
   *  - redo: borra antes los PENDIENTES desde planFrom (lo preparado y
   *    lo subido no se toca) y vuelve a cargar — se usa al cambiar la
   *    frecuencia.
   */
  async function loadMonth(opts?: {
    frequency?: ContentFrequency;
    mix?: ContentMix;
    redo?: boolean;
  }) {
    if (!client || planning || isPastMonth) return;
    setPlanning(true);
    try {
      let existing = posts;
      if (opts?.redo) {
        await deletePlannedBetween(id, planFrom, lastDayIso);
        existing = posts.filter(
          (p) =>
            !(p.status === "planned" && p.date >= planFrom && p.date <= lastDayIso),
        );
      }
      const plan = planMonth({
        frequency: opts?.frequency ?? client.content_frequency,
        mix: opts?.mix ?? client.content_mix,
        year,
        month0: month,
        fromDate: planFrom,
        existing,
      });
      if (plan.length > 0) await addContentBatch(plan.map(toNewPiece));
      refresh();
      if (plan.length === 0 && !opts?.redo) {
        alert(`${monthLabel} ya está cargado: según la frecuencia no falta ningún contenido.`);
      }
    } catch (err) {
      alert(`No se pudo cargar ${monthLabel.toLowerCase()}:\n${errorMessage(err)}`);
      refresh();
    } finally {
      setPlanning(false);
    }
  }

  /**
   * "Limpiar mes" (solo director): borra el contenido PROGRAMADO del mes
   * visible — pendientes y preparados. Lo ya subido se conserva.
   */
  async function cleanMonth() {
    if (!client || planning || !isDirector) return;
    const programmed = monthPosts.filter((p) => p.status !== "published");
    if (programmed.length === 0) {
      alert(
        `No hay contenido programado en ${monthLabel.toLowerCase()} para limpiar.`,
      );
      return;
    }
    const publishedCount = monthPosts.length - programmed.length;
    const ok = confirm(
      `¿Limpiar ${monthLabel} ${year}?\n\n` +
        `Se van a borrar ${programmed.length} pieza(s) programada(s) (pendientes y preparadas).` +
        (publishedCount > 0
          ? `\nLo ya subido (${publishedCount}) se conserva.`
          : "") +
        `\n\nEsta acción no se puede deshacer.`,
    );
    if (!ok) return;
    setPlanning(true);
    try {
      await deleteProgrammedBetween(id, `${monthKey}-01`, lastDayIso);
      refresh();
    } catch (err) {
      alert(
        `No se pudo limpiar ${monthLabel.toLowerCase()}:\n${errorMessage(err)}`,
      );
      refresh();
    } finally {
      setPlanning(false);
    }
  }

  /** Al guardar la frecuencia: si el mes visible ya tenía pendientes,
   *  ofrecer rehacerlos; si estaba vacío, ofrecer cargarlo. */
  function onFrequencySaved(freq: ContentFrequency, mix: ContentMix) {
    setClient((prev) =>
      prev ? { ...prev, content_frequency: freq, content_mix: mix } : prev,
    );
    if (isPastMonth) return;
    const label = monthLabel.toLowerCase();
    const pendingAhead = monthPosts.some(
      (p) => p.status === "planned" && p.date >= planFrom,
    );
    if (pendingAhead) {
      const desde = isCurrentMonth ? " desde hoy" : "";
      if (
        confirm(
          `¿Rehacer los contenidos pendientes de ${label}${desde} con la frecuencia nueva?\n\nLos preparados y los subidos no se tocan.`,
        )
      ) {
        void loadMonth({ frequency: freq, mix, redo: true });
      }
    } else if (monthPosts.length === 0) {
      if (confirm(`¿Cargar ${label} con esta frecuencia?`)) {
        void loadMonth({ frequency: freq, mix });
      }
    }
  }

  async function addManualPiece(input: {
    date: string;
    network: ContentNetwork;
    format: ContentFormat;
    contentType: ContentType;
  }) {
    await addContent({
      clientId: id,
      date: input.date,
      time: null,
      network: input.network,
      networks: [input.network],
      format: input.format,
      brief: "",
      contentType: input.contentType,
      status: "planned",
      source: "manual",
    });
    refresh();
  }

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
      const fromIdx = pdfFromYear * 12 + pdfFromMonth;
      const toIdx = pdfToYear * 12 + pdfToMonth;
      if (toIdx < fromIdx) {
        alert("El mes 'hasta' tiene que ser igual o posterior al 'desde'.");
        setPdfBusy(false);
        return;
      }
      const months: { year: number; month0: number }[] = [];
      for (let cur = fromIdx; cur <= toIdx; cur++) {
        months.push({ year: Math.floor(cur / 12), month0: cur % 12 });
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

  /**
   * Agente creativo: redacta/mejora la estrategia del mes según el pedido
   * del director. El resultado se vuelca en el textarea (editable antes de
   * guardar). No guarda solo — el director revisa y aprieta Guardar.
   */
  async function askStrategyAgent() {
    if (agentBusy || !isDirector) return;
    const instruction = agentPrompt.trim();
    if (!instruction) {
      setAgentError("Escribí qué querés que arme el agente.");
      return;
    }
    setAgentBusy(true);
    setAgentError(null);
    try {
      const {
        data: { session },
      } = await getSupabase().auth.getSession();
      if (!session) {
        setAgentError("Tu sesión expiró. Volvé a iniciar sesión.");
        return;
      }
      const res = await fetch(`/api/clients/${id}/strategy-assistant`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          instruction,
          current: monthNoteDraft,
          month: `${monthLabel} ${year}`,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        text?: string;
        error?: string;
        detail?: string;
      };
      if (!res.ok || !data.text) {
        setAgentError(
          [data.error, data.detail].filter(Boolean).join(" — ") ||
            "El agente no pudo responder.",
        );
        return;
      }
      setMonthNoteDraft(data.text);
      setAgentPrompt("");
    } catch (err) {
      setAgentError((err as Error).message);
    } finally {
      setAgentBusy(false);
    }
  }

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Calendario · Contenido del cliente</div>
          <h1>Calendario</h1>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {isDirector && (
            <button
              className={ui.btnGhost}
              onClick={() => setFreqModal(true)}
              style={{ fontWeight: 600 }}
            >
              ⚙ Frecuencia
            </button>
          )}
          <button
            className={ui.btnGhost}
            onClick={() => setPdfModal(true)}
            style={{ fontWeight: 600 }}
          >
            ↓ PDF
          </button>
          <button
            className={ui.btnGhost}
            onClick={() => setEventModalDate(todayIso)}
            style={{ fontWeight: 600 }}
          >
            + Evento / producción
          </button>
          {/* Limpiar mes: borra lo programado (no subido) del mes visible.
              Solo director. */}
          {isDirector && (
            <button
              className={ui.btnGhost}
              onClick={cleanMonth}
              disabled={planning}
              title="Borrar el contenido programado (pendiente y preparado) de este mes"
              style={{
                fontWeight: 600,
                color: OVERDUE_COLOR,
                borderColor: "rgba(176,75,58,0.35)",
                opacity: planning ? 0.5 : 1,
              }}
            >
              Limpiar mes
            </button>
          )}
        </div>
      </div>

      {/* Asistente creativo + resumen del mes. */}
      <div
        className={ui.panel}
        style={{
          display: "flex",
          gap: 20,
          alignItems: "center",
          flexWrap: "wrap",
          borderLeft: `3px solid ${
            summary.atrasados > 0 ? OVERDUE_COLOR : "var(--sand)"
          }`,
        }}
      >
        <div style={{ flex: "1 1 320px", minWidth: 0 }}>
          <div
            style={{
              fontSize: 9,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--sand-dark)",
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            ✨ Asistente creativo
          </div>
          <div style={{ fontSize: 14, color: "var(--deep-green)", lineHeight: 1.5 }}>
            {!hasFrequency ? (
              isDirector ? (
                <>
                  Definí la frecuencia (cuántas veces por semana va cada
                  formato y de qué tipo) y el asistente carga el mes solo.
                </>
              ) : (
                <>
                  Todavía no hay frecuencia configurada. Pedile a un
                  director que la cargue para que el asistente arme el mes.
                </>
              )
            ) : isPastMonth ? (
              <>Mes cerrado — queda como registro de lo que se subió.</>
            ) : missing.length > 0 ? (
              <>
                {monthPosts.length === 0
                  ? `${monthLabel} todavía no está cargado: `
                  : "Según la frecuencia faltan "}
                <strong>
                  {missing.length} contenido{missing.length === 1 ? "" : "s"}
                </strong>
                {monthPosts.length === 0 ? " para cargar." : ` en ${monthLabel.toLowerCase()}.`}
              </>
            ) : (
              <>{monthLabel} está cargado según la frecuencia.</>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {!hasFrequency && isDirector && (
            <button className={ui.btnSolid} onClick={() => setFreqModal(true)}>
              ⚙ Configurar frecuencia
            </button>
          )}
          {hasFrequency && !isPastMonth && missing.length > 0 && canEdit && (
            <button
              className={ui.btnSolid}
              onClick={() => void loadMonth()}
              disabled={planning}
            >
              {planning ? "Cargando…" : `✨ Cargar ${monthLabel.toLowerCase()}`}
            </button>
          )}
        </div>
        {summary.total > 0 && (
          <div
            style={{
              flexBasis: "100%",
              display: "flex",
              gap: 14,
              flexWrap: "wrap",
              fontSize: 12,
              color: "var(--text-muted)",
              paddingTop: 12,
              borderTop: "1px solid rgba(10,26,12,0.06)",
            }}
          >
            <span>
              <strong style={{ color: "var(--deep-green)" }}>{summary.total}</strong>{" "}
              contenido{summary.total === 1 ? "" : "s"} en {monthLabel.toLowerCase()}
            </span>
            <span style={{ color: PIECE_STATE_META.subido.color }}>
              ✓ <strong>{summary.subidos}</strong> subido{summary.subidos === 1 ? "" : "s"}
            </span>
            <span style={{ color: PIECE_STATE_META.preparado.color }}>
              ● <strong>{summary.preparados}</strong> preparado{summary.preparados === 1 ? "" : "s"}
            </span>
            <span style={{ color: PIECE_STATE_META.pendiente.color }}>
              ○ <strong>{summary.pendientes}</strong> pendiente{summary.pendientes === 1 ? "" : "s"}
            </span>
            {summary.atrasados > 0 && (
              <span style={{ color: OVERDUE_COLOR, fontWeight: 600 }}>
                ⚠ {summary.atrasados} atrasado{summary.atrasados === 1 ? "" : "s"}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Leyenda: frecuencia configurada, tipos y estados. */}
      {hasFrequency && (
        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 16,
            padding: "10px 14px",
            background: "var(--off-white)",
            fontSize: 11,
            borderRadius: "var(--r-md)",
            alignItems: "center",
            color: "var(--deep-green)",
          }}
        >
          <LegendTitle>Frecuencia</LegendTitle>
          {plannableFreq.map(({ slot, perWeek }) => (
            <span key={slot.key} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
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
                {slot.networkLabel} {slot.formatLabel.toLowerCase()}
              </strong>
              <span style={{ color: "var(--text-muted)" }}>{perWeek}/sem</span>
            </span>
          ))}
          <span style={{ flex: 1 }} />
          <LegendTitle>Tipo</LegendTitle>
          {(["valor", "oferta", "engagement"] as ContentType[]).map((t) => (
            <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
              <TypeBadge type={t} />
              {CONTENT_TYPE_META[t].label}
            </span>
          ))}
          <LegendTitle>Estado</LegendTitle>
          <span style={{ color: "var(--text-muted)" }}>
            punteado = pendiente · lleno = preparado · ✓ = subido ·{" "}
            <span style={{ color: OVERDUE_COLOR }}>rojo = atrasado</span>
          </span>
        </div>
      )}

      {/* Calendar */}
      <div className={ui.panel}>
        <div className={ui.panelHead}>
          <div className={ui.panelTitle}>{monthLabel} {year}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={prevMonth} className={ui.btnGhost} style={{ padding: "4px 10px" }}>‹</button>
            <button onClick={() => { setMonth(today.getMonth()); setYear(today.getFullYear()); }} className={ui.btnGhost} style={{ padding: "4px 12px" }}>Hoy</button>
            <button onClick={nextMonth} className={ui.btnGhost} style={{ padding: "4px 10px" }}>›</button>
          </div>
        </div>

        <ContentMonthGrid
          year={year}
          month={month}
          posts={monthPosts}
          events={events}
          todayIso={todayIso}
          onOpenPiece={(p) => setPieceId(p.id)}
          onOpenDay={(iso) => setDayModal(iso)}
        />
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
            <LegendTitle>Estrategia del mes</LegendTitle>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--deep-green)", marginTop: 4 }}>
              {monthLabel} {year}
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
            {/* Agente creativo: ayuda a armar/mejorar el texto. Solo el
                director ve el editor, así que esto también. */}
            <div
              style={{
                background: "var(--off-white)",
                border: "1px solid rgba(10,26,12,0.08)",
                borderRadius: "var(--r-md)",
                padding: 12,
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "var(--sand-dark)",
                  fontWeight: 700,
                  marginBottom: 8,
                }}
              >
                ✨ Agente creativo
              </div>
              <textarea
                value={agentPrompt}
                onChange={(e) => setAgentPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    void askStrategyAgent();
                  }
                }}
                placeholder={
                  monthNoteDraft.trim()
                    ? "Pedile que mejore o reescriba lo de abajo. Ej: hacela más agresiva en oferta, sumá Día de la Madre…"
                    : "Contale el foco del mes y armá la estrategia. Ej: mes de lanzamiento de la línea nueva, presupuesto US$1000, prioridad Reels…"
                }
                rows={2}
                disabled={agentBusy}
                style={{ ...inputS, padding: 10, lineHeight: 1.5, resize: "vertical" }}
              />
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: 8,
                }}
              >
                <span style={{ fontSize: 11, color: agentError ? OVERDUE_COLOR : "var(--text-muted)" }}>
                  {agentError
                    ? agentError
                    : "Redacta sobre el texto actual. Revisalo y guardá vos."}
                </span>
                <button
                  onClick={() => void askStrategyAgent()}
                  disabled={agentBusy || !agentPrompt.trim()}
                  className={ui.btnGhost}
                  style={{ fontWeight: 600, whiteSpace: "nowrap", opacity: agentBusy || !agentPrompt.trim() ? 0.5 : 1 }}
                >
                  {agentBusy ? "Redactando…" : monthNoteDraft.trim() ? "Mejorar con el agente" : "Redactar con el agente"}
                </button>
              </div>
            </div>
            <textarea
              value={monthNoteDraft}
              onChange={(e) => setMonthNoteDraft(e.target.value)}
              placeholder="Ej: En mayo arrancamos el batch de awareness frío con Reels. Foco en hook de los primeros 3s. Pauta inicial US$ 800/mes en IG+FB. Black Friday capturamos demanda con campaña dedicada de retargeting…"
              rows={10}
              style={{ ...inputS, padding: 14, lineHeight: 1.6, resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
              <button
                onClick={() => setMonthNoteEditing(false)}
                disabled={savingNote}
                className={ui.btnGhost}
              >
                Cancelar
              </button>
              <button onClick={saveMonthNote} disabled={savingNote} className={ui.btnSolid}>
                {savingNote ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </>
        ) : monthNote ? (
          <div style={{ fontSize: 14, color: "var(--deep-green)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
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

      {/* La vista vieja de Contenido (aprobación de piezas IA, feed,
          consultor de ideas) salió del menú pero sigue viva. */}
      <div style={{ marginTop: 18, textAlign: "right", fontSize: 11 }}>
        <Link
          href={`/cliente/${id}/contenido`}
          style={{ color: "var(--text-muted)", textDecoration: "underline", textDecorationStyle: "dotted" }}
        >
          Herramientas anteriores (Contenido) →
        </Link>
      </div>

      {dayModal && (
        <DayModal
          date={dayModal}
          todayIso={todayIso}
          pieces={piecesOfDay(posts, dayModal)}
          canEdit={canEdit}
          onClose={() => setDayModal(null)}
          onOpenPiece={(pid) => {
            setDayModal(null);
            setPieceId(pid);
          }}
          onAdd={(input) => addManualPiece({ date: dayModal, ...input })}
          onOpenEvent={(d) => {
            setDayModal(null);
            setEventModalDate(d);
          }}
        />
      )}

      {openPiece && (
        <PieceModal
          key={openPiece.id}
          post={openPiece}
          todayIso={todayIso}
          canEdit={canEdit}
          metaBusinessSuiteUrl={client?.external_links?.meta_business_suite_url ?? null}
          onClose={() => setPieceId(null)}
          onChanged={refresh}
        />
      )}

      {client && (
        <ContentFrequencyModal
          open={freqModal}
          clientId={id}
          current={client.content_frequency}
          currentMix={client.content_mix}
          onClose={() => setFreqModal(false)}
          onSaved={onFrequencySaved}
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

      {/* Modal de descarga PDF: rango de meses */}
      {pdfModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !pdfBusy) setPdfModal(false);
          }}
          style={overlayS}
        >
          <div style={{ background: "var(--white)", maxWidth: 520, width: "100%", padding: 36, borderRadius: "var(--r-lg)" }}>
            <div style={eyebrowS}>Calendario · Descarga PDF</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 8 }}>
              Elegí el rango de meses
            </h2>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20, lineHeight: 1.5 }}>
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
                      <option key={i} value={i}>{m}</option>
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
                      <option key={i} value={i}>{m}</option>
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

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setPdfModal(false)} disabled={pdfBusy} className={ui.btnGhost}>
                Cancelar
              </button>
              <button onClick={downloadRoadmapPdf} disabled={pdfBusy} className={ui.btnSolid}>
                {pdfBusy ? "Generando…" : "↓ Descargar PDF"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Piezas de un día, ordenadas por red. */
function piecesOfDay(posts: ContentPost[], date: string): ContentPost[] {
  return posts.filter((p) => p.date === date).sort(sortPieces);
}

// ==================== PIEZAS ====================

/** Modal del día: qué toca + agregar una pieza a mano + eventos. */
function DayModal({
  date,
  todayIso,
  pieces,
  canEdit,
  onClose,
  onOpenPiece,
  onAdd,
  onOpenEvent,
}: {
  date: string;
  todayIso: string;
  pieces: ContentPost[];
  canEdit: boolean;
  onClose: () => void;
  onOpenPiece: (id: string) => void;
  onAdd: (input: {
    network: ContentNetwork;
    format: ContentFormat;
    contentType: ContentType;
  }) => Promise<void>;
  onOpenEvent: (date: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [network, setNetwork] = useState<ContentNetwork>("ig");
  const [format, setFormat] = useState<ContentFormat>("post");
  const [contentType, setContentType] = useState<ContentType>("valor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const verb = date < todayIso ? "tocaba" : "toca";

  async function add() {
    setBusy(true);
    setError(null);
    try {
      await onAdd({ network, format, contentType });
      setAdding(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={overlayS} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={modalS(560)}>
        <button onClick={onClose} style={closeBtnS} aria-label="Cerrar">×</button>
        <div style={eyebrowS}>Contenido · {date}</div>
        <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 18 }}>
          {pieces.length === 0
            ? `${dayPhrase(date, todayIso)} no hay contenido cargado`
            : `${dayPhrase(date, todayIso)} ${verb}`}
        </h2>

        {pieces.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
            {pieces.map((p) => {
              const state = pieceState(p);
              const overdue = isOverdue(p, todayIso);
              const net = mainNetwork(p);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onOpenPiece(p.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 14px",
                    background: "var(--white)",
                    border: `1px solid ${overdue ? OVERDUE_COLOR : "rgba(10,26,12,0.1)"}`,
                    borderLeft: `4px solid ${NETWORK_COLORS[net].solid}`,
                    borderRadius: "var(--r-md)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textAlign: "left",
                  }}
                >
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.imageUrl}
                      alt=""
                      style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4, flexShrink: 0 }}
                    />
                  ) : null}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--deep-green)" }}>
                      {pieceTitle(p)}
                    </div>
                    {p.brief && (
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--text-muted)",
                          marginTop: 2,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {p.brief}
                      </div>
                    )}
                  </div>
                  <StatePill state={state} overdue={overdue} />
                </button>
              );
            })}
          </div>
        )}

        {canEdit &&
          (adding ? (
            <div
              style={{
                padding: 16,
                background: "var(--off-white)",
                borderRadius: "var(--r-md)",
                marginBottom: 16,
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={labelS}>Red</label>
                  <select value={network} onChange={(e) => setNetwork(e.target.value as ContentNetwork)} style={inputS}>
                    {NETWORK_ORDER.map((n) => (
                      <option key={n} value={n}>{NETWORK_LABEL[n]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelS}>Formato</label>
                  <select value={format} onChange={(e) => setFormat(e.target.value as ContentFormat)} style={inputS}>
                    {ADDABLE_FORMATS.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelS}>Tipo</label>
                  <select value={contentType} onChange={(e) => setContentType(e.target.value as ContentType)} style={inputS}>
                    {(["valor", "oferta", "engagement"] as ContentType[]).map((t) => (
                      <option key={t} value={t}>{CONTENT_TYPE_META[t].label}</option>
                    ))}
                  </select>
                </div>
              </div>
              {error && <div style={errorS}>{error}</div>}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setAdding(false)} className={ui.btnGhost} disabled={busy}>
                  Cancelar
                </button>
                <button onClick={add} className={ui.btnSolid} disabled={busy}>
                  {busy ? "Agregando…" : "Agregar"}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className={ui.btnGhost}
              style={{ width: "100%", marginBottom: 16, fontWeight: 600 }}
            >
              + Agregar contenido este día
            </button>
          ))}

        <div
          style={{
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
            + Evento →
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Modal de una pieza: "Hoy toca: posteo de oferta en Instagram".
 * La persona que la sube carga la descripción (qué se va a subir) y la
 * foto; con descripción queda Preparado. "Marcar como subido" la cierra.
 */
function PieceModal({
  post,
  todayIso,
  canEdit,
  metaBusinessSuiteUrl,
  onClose,
  onChanged,
}: {
  post: ContentPost;
  todayIso: string;
  canEdit: boolean;
  metaBusinessSuiteUrl: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [description, setDescription] = useState(post.brief ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(post.imageUrl ?? null);
  const [moveDate, setMoveDate] = useState(post.date);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const state = pieceState(post);
  const overdue = isOverdue(post, todayIso);
  const nets = networksOf(post);
  const isMeta = nets.some((n) => n === "ig" || n === "fb");
  // Fallback universal si el cliente no tiene URL de Meta Business
  // Suite configurada (se carga en Configuración).
  const programUrl = isMeta
    ? metaBusinessSuiteUrl?.trim() || "https://business.facebook.com/latest/home"
    : null;
  const desc = description.trim();

  async function run(kind: string, fn: () => Promise<unknown>, close = true) {
    setBusy(kind);
    setError(null);
    try {
      await fn();
      onChanged();
      if (close) onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const save = () =>
    run("save", () =>
      updateContent(post.id, {
        brief: desc,
        status: post.status === "published" ? "published" : desc ? "scheduled" : "planned",
      }),
    );

  const markUploaded = () =>
    run("publish", () =>
      updateContent(post.id, {
        brief: desc,
        status: "published",
        publishedAt: new Date().toISOString(),
      }),
    );

  const undoUploaded = () =>
    run("undo", () =>
      updateContent(post.id, {
        status: desc ? "scheduled" : "planned",
        publishedAt: null,
      }),
    );

  async function handleFile(file: File) {
    setBusy("upload");
    setError(null);
    try {
      // Bucket público content-post-previews (migración 069): la URL
      // carga directo en <img src>.
      const up = await uploadContentPreview(file, post.clientId);
      if (!up.url) throw new Error("El upload no devolvió una URL pública.");
      await updateContent(post.id, { imageUrl: up.url });
      setImageUrl(up.url);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const removeImage = () =>
    run(
      "remove-image",
      async () => {
        await updateContent(post.id, { imageUrl: null });
        setImageUrl(null);
      },
      false,
    );

  const move = () => run("move", () => updateContent(post.id, { date: moveDate }));

  function remove() {
    if (!confirm("¿Quitar este contenido del calendario?")) return;
    void run("delete", () => deleteContent(post.id));
  }

  return (
    <div style={overlayS} onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div style={modalS(560)}>
        <button onClick={onClose} style={closeBtnS} aria-label="Cerrar">×</button>
        <div style={eyebrowS}>Contenido · {post.date}</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.3, marginBottom: 12 }}>
          {tocaPhrase(post, todayIso)}
        </h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 20 }}>
          <StatePill state={state} overdue={overdue} />
          {post.status === "published" && post.publishedAt && (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Subido el {new Date(post.publishedAt).toLocaleDateString("es-UY")}
            </span>
          )}
        </div>

        <label style={labelS}>¿Qué se va a subir?</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={!canEdit || !!busy}
          rows={4}
          placeholder="Ej: foto del producto nuevo con el precio de lanzamiento y la frase de la campaña."
          style={{ ...inputS, resize: "vertical", lineHeight: 1.5, marginBottom: 16 }}
        />

        <label style={labelS}>Foto</label>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt="Foto de la pieza"
              style={{ width: 96, height: 96, objectFit: "cover", borderRadius: "var(--r-md)", border: "1px solid rgba(10,26,12,0.1)" }}
            />
          ) : (
            <div
              style={{
                width: 96,
                height: 96,
                borderRadius: "var(--r-md)",
                background: "var(--off-white)",
                border: "1px dashed rgba(10,26,12,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                color: "var(--text-muted)",
              }}
            >
              Sin foto
            </div>
          )}
          {canEdit && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label className={ui.btnGhost} style={{ cursor: busy ? "default" : "pointer", textAlign: "center" }}>
                {busy === "upload" ? "Subiendo…" : imageUrl ? "Cambiar foto" : "Adjuntar foto"}
                <input
                  type="file"
                  accept="image/*"
                  disabled={!!busy}
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void handleFile(f);
                  }}
                />
              </label>
              {imageUrl && (
                <button
                  type="button"
                  onClick={removeImage}
                  disabled={!!busy}
                  style={{ background: "transparent", border: "none", color: "var(--text-muted)", fontSize: 11, cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}
                >
                  Quitar foto
                </button>
              )}
            </div>
          )}
        </div>

        {error && <div style={errorS}>{error}</div>}

        {canEdit && (
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginBottom: 16 }}>
            {programUrl && (
              <a
                href={programUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={ui.btnGhost}
                style={{ textDecoration: "none" }}
                title={
                  metaBusinessSuiteUrl
                    ? "Abrir el planner del cliente en Meta Business Suite"
                    : "URL de Meta Business Suite del cliente sin configurar — abre el home genérico. Se carga en Configuración."
                }
              >
                Meta Business Suite ↗
              </a>
            )}
            {state === "subido" ? (
              <button onClick={undoUploaded} className={ui.btnGhost} disabled={!!busy}>
                {busy === "undo" ? "…" : "Deshacer subido"}
              </button>
            ) : (
              <>
                <button onClick={save} className={ui.btnGhost} disabled={!!busy}>
                  {busy === "save" ? "Guardando…" : desc ? "Guardar · preparado" : "Guardar"}
                </button>
                <button onClick={markUploaded} className={ui.btnSolid} disabled={!!busy}>
                  {busy === "publish" ? "…" : "✓ Marcar como subido"}
                </button>
              </>
            )}
            {state === "subido" && desc !== (post.brief ?? "").trim() && (
              <button onClick={save} className={ui.btnSolid} disabled={!!busy}>
                {busy === "save" ? "Guardando…" : "Guardar descripción"}
              </button>
            )}
          </div>
        )}

        {canEdit && (
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              paddingTop: 14,
              borderTop: "1px solid rgba(10,26,12,0.08)",
              fontSize: 12,
            }}
          >
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ color: "var(--text-muted)" }}>Mover al</span>
              <input
                type="date"
                value={moveDate}
                onChange={(e) => setMoveDate(e.target.value)}
                disabled={!!busy}
                style={{ ...inputS, width: "auto", padding: "5px 8px", fontSize: 12 }}
              />
              {moveDate && moveDate !== post.date && (
                <button onClick={move} className={ui.btnGhost} disabled={!!busy} style={{ padding: "5px 10px" }}>
                  Mover
                </button>
              )}
            </div>
            <button
              onClick={remove}
              disabled={!!busy}
              style={{ background: "transparent", border: "none", color: OVERDUE_COLOR, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
            >
              Quitar este contenido
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== ESTILOS ====================

const overlayS: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(10,26,12,0.6)",
  zIndex: 100,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  backdropFilter: "blur(4px)",
};

function modalS(maxWidth: number): React.CSSProperties {
  return {
    background: "var(--white)",
    maxWidth,
    width: "100%",
    maxHeight: "90vh",
    overflowY: "auto",
    padding: 36,
    position: "relative",
    borderRadius: "var(--r-lg)",
    boxShadow: "var(--shadow-md)",
  };
}

const closeBtnS: React.CSSProperties = {
  position: "absolute",
  top: 16,
  right: 16,
  fontSize: 20,
  width: 32,
  height: 32,
  background: "transparent",
  border: "none",
  cursor: "pointer",
  color: "var(--text-muted)",
};

const eyebrowS: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: "0.25em",
  textTransform: "uppercase",
  color: "var(--sand-dark)",
  fontWeight: 600,
  marginBottom: 10,
};

const errorS: React.CSSProperties = {
  fontSize: 12,
  color: OVERDUE_COLOR,
  background: "rgba(185,28,28,0.06)",
  padding: "8px 10px",
  borderRadius: "var(--r-md)",
  marginBottom: 12,
  whiteSpace: "pre-wrap",
};

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
