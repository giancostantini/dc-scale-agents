"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Topbar from "@/components/Topbar";
import NewEventModal from "@/components/NewEventModal";
import { getEvents, deleteEvent } from "@/lib/storage";
import { hasSession } from "@/lib/supabase/auth";
import type { CalEvent, EventType } from "@/lib/types";
import styles from "./calendario.module.css";

const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const TYPE_STYLE: Record<
  EventType,
  { className: string; label: string; color: string }
> = {
  reunion:   { className: "calEventReunion",   label: "Reuniones",  color: "var(--forest)" },
  cobro:     { className: "calEventCobro",     label: "Cobros",     color: "var(--green-ok)" },
  reporte:   { className: "calEventReporte",   label: "Reportes",   color: "var(--sand)" },
  dev:       { className: "calEventDev",       label: "Dev",        color: "var(--sand-dark)" },
  contenido: { className: "calEventContenido", label: "Contenido",  color: "var(--forest-2)" },
};

export default function CalendarioPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [events, setEvents] = useState<CalEvent[]>([]);

  // Mes actual
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const [modal, setModal] = useState<{ open: boolean; date?: string }>({ open: false });
  const [googleConnected, setGoogleConnected] = useState(true);
  const [filter, setFilter] = useState<EventType | "all">("all");

  const refresh = useCallback(() => {
    getEvents().then(setEvents);
  }, []);

  useEffect(() => {
    hasSession().then((has) => {
      if (!has) {
        router.replace("/");
        return;
      }
      setAuthChecked(true);
      refresh();
    });
  }, [router, refresh]);

  if (!authChecked) return null;

  // Helpers de fecha
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (firstOfMonth.getDay() + 6) % 7; // lunes = 0
  const todayKey = today.toISOString().slice(0, 10);
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();

  function dayKey(d: number) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  const visibleEvents = filter === "all" ? events : events.filter((e) => e.type === filter);

  const upcoming = [...events]
    .filter((e) => e.date >= todayKey)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
    .slice(0, 8);

  function prevMonth() {
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else setMonth(month - 1);
  }

  function nextMonth() {
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else setMonth(month + 1);
  }

  async function removeEvent(id: string) {
    if (!confirm("¿Eliminar este evento?")) return;
    await deleteEvent(id);
    refresh();
  }

  function formatUpcomingDate(date: string) {
    const d = new Date(date + "T00:00:00");
    return { day: d.getDate(), month: MONTHS_ES[d.getMonth()].slice(0, 3) };
  }

  return (
    <>
      <Topbar showPrimary={false} searchPlaceholder="Buscar eventos…" />

      <main className={styles.wrap}>
        <div className={styles.sectionHead}>
          <div>
            <div className={styles.eyebrow}>Calendario · Todos los clientes</div>
            <h1>
              {MONTHS_ES[month]} {year}
            </h1>
          </div>
          <div className={styles.actions}>
            <button
              className={styles.btn}
              onClick={() => setGoogleConnected(!googleConnected)}
            >
              {googleConnected ? "Desconectar Google" : "Conectar Google"}
            </button>
            <button
              className={styles.btnSolid}
              onClick={() =>
                setModal({ open: true, date: new Date().toISOString().slice(0, 10) })
              }
            >
              + Nuevo evento
            </button>
          </div>
        </div>

        {/* Google Calendar banner */}
        <div
          className={`${styles.googleBanner} ${
            !googleConnected ? styles.googleBannerOff : ""
          }`}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div className={styles.gLogo}>G</div>
            <div>
              <div className={styles.gLabel}>
                {googleConnected
                  ? "● Google Calendar conectado"
                  : "◌ Google Calendar desconectado"}
              </div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                {googleConnected
                  ? "Sincronización bidireccional activa · Los eventos aparecen en ambos lados"
                  : "Conectá tu cuenta para sincronizar eventos automáticamente"}
              </div>
            </div>
          </div>
          {googleConnected && (
            <div style={{ fontSize: 12, color: "rgba(232,228,220,0.6)" }}>
              {events.filter((e) => e.synced).length} / {events.length} eventos
              sincronizados
            </div>
          )}
        </div>

        {/* Filtros */}
        {events.length > 0 && (
          <div className={styles.filters}>
            <button
              className={`${styles.filterBtn} ${filter === "all" ? styles.active : ""}`}
              onClick={() => setFilter("all")}
            >
              Todos · {events.length}
            </button>
            {(Object.keys(TYPE_STYLE) as EventType[]).map((t) => {
              const count = events.filter((e) => e.type === t).length;
              if (count === 0) return null;
              return (
                <button
                  key={t}
                  className={`${styles.filterBtn} ${
                    filter === t ? styles.active : ""
                  }`}
                  onClick={() => setFilter(t)}
                >
                  <span
                    className={styles.filterDot}
                    style={{ background: TYPE_STYLE[t].color }}
                  />
                  {TYPE_STYLE[t].label} · {count}
                </button>
              );
            })}
          </div>
        )}

        <div className={styles.grid}>
          {/* Calendar */}
          <div className={styles.calendar}>
            <div className={styles.calHead}>
              <div className={styles.calMonth}>
                {MONTHS_ES[month]} {year}
              </div>
              <div className={styles.calNav}>
                <button className={styles.calNavBtn} onClick={prevMonth}>
                  ‹
                </button>
                <button
                  className={styles.calNavBtn}
                  onClick={() => {
                    setMonth(today.getMonth());
                    setYear(today.getFullYear());
                  }}
                  style={{ width: "auto", padding: "0 12px", fontSize: 11 }}
                >
                  Hoy
                </button>
                <button className={styles.calNavBtn} onClick={nextMonth}>
                  ›
                </button>
              </div>
            </div>

            <div className={styles.calDaysHead}>
              {WEEKDAYS.map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>

            <div className={styles.calDays}>
              {Array.from({ length: startOffset }).map((_, i) => (
                <div key={`m${i}`} className={`${styles.calDay} ${styles.calDayMuted}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const d = i + 1;
                const key = dayKey(d);
                const dayEvents = visibleEvents.filter((e) => e.date === key);
                const isToday = isCurrentMonth && d === today.getDate();
                return (
                  <div
                    key={d}
                    className={`${styles.calDay} ${
                      isToday ? styles.calDayToday : ""
                    }`}
                    onClick={() => setModal({ open: true, date: key })}
                  >
                    <div className={styles.dNum}>{d}</div>
                    {dayEvents.slice(0, 3).map((e) => (
                      <span
                        key={e.id}
                        className={`${styles.calEvent} ${
                          styles[TYPE_STYLE[e.type].className]
                        }`}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          if (
                            confirm(
                              `${e.title}\n${e.time} · ${e.clientLabel}\n\n¿Eliminar?`,
                            )
                          )
                            removeEvent(e.id);
                        }}
                      >
                        {e.time} {e.title}
                      </span>
                    ))}
                    {dayEvents.length > 3 && (
                      <span
                        style={{
                          fontSize: 9,
                          color: "var(--text-muted)",
                          marginTop: 2,
                          display: "block",
                        }}
                      >
                        +{dayEvents.length - 3} más
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Upcoming */}
          <div className={styles.upcoming}>
            <h4>Próximos eventos</h4>
            {upcoming.length === 0 ? (
              <div className={styles.emptyUpcoming}>
                No hay eventos agendados. Hacé click en un día del calendario
                para crear uno.
              </div>
            ) : (
              upcoming.map((e) => {
                const fd = formatUpcomingDate(e.date);
                return (
                  <div key={e.id} className={styles.eventItem}>
                    <div className={styles.eventDate}>
                      <div className="d">{fd.day}</div>
                      <div className="m">{fd.month}</div>
                    </div>
                    <div className={styles.eventInfo}>
                      <div className="eName">
                        {e.title}
                        {e.synced && (
                          <span
                            style={{
                              fontSize: 9,
                              color: "var(--green-ok)",
                              letterSpacing: "0.1em",
                              textTransform: "uppercase",
                              marginLeft: 6,
                            }}
                          >
                            G✓
                          </span>
                        )}
                      </div>
                      <div className="eClient">
                        {e.clientLabel} · {e.time}
                      </div>
                      {e.meetLink && (
                        <div
                          style={{
                            fontSize: 10,
                            color: "var(--sand-dark)",
                            marginTop: 4,
                          }}
                        >
                          ▦ {e.meetLink}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>

      <NewEventModal
        open={modal.open}
        initialDate={modal.date}
        googleConnected={googleConnected}
        onClose={() => setModal({ open: false })}
        onCreated={refresh}
      />
    </>
  );
}
