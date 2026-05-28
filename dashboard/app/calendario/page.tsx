"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Topbar from "@/components/Topbar";
import NewEventModal from "@/components/NewEventModal";
import OutlookConnectionCard from "@/components/OutlookConnectionCard";
import { getEvents, deleteEvent, getAllTasks, getClients } from "@/lib/storage";
import { hasSession } from "@/lib/supabase/auth";
import type { CalEvent, Client, DevTask, EventType } from "@/lib/types";
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
  pauta:     { className: "calEventPauta",     label: "Pauta",      color: "#b04b3a" },
};

export default function CalendarioPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [tasks, setTasks] = useState<DevTask[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [showTasks, setShowTasks] = useState(true);

  // Mes actual
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const [modal, setModal] = useState<{ open: boolean; date?: string }>({ open: false });
  const [filter, setFilter] = useState<EventType | "all">("all");

  const refresh = useCallback(() => {
    getEvents().then(setEvents);
    getAllTasks().then(setTasks);
    getClients().then(setClients);
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
              className={styles.btnSolid}
              onClick={() =>
                setModal({ open: true, date: new Date().toISOString().slice(0, 10) })
              }
            >
              + Nuevo evento
            </button>
          </div>
        </div>

        {/* Outlook sync — cada user conecta su propia cuenta */}
        <OutlookConnectionCard returnTo="/calendario" />

        {/* Filtros */}
        {(events.length > 0 || tasks.length > 0) && (
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
            {/* Toggle de tareas: overlay sobre el calendario con las
                dev_tasks que tienen dueDate y no están "done". */}
            {tasks.filter((t) => t.dueDate && t.status !== "done").length > 0 && (
              <button
                className={`${styles.filterBtn} ${showTasks ? styles.active : ""}`}
                onClick={() => setShowTasks(!showTasks)}
                style={{ marginLeft: 12, borderLeft: "1px solid rgba(10,26,12,0.1)", paddingLeft: 16 }}
              >
                <span style={{ marginRight: 4 }}>⊡</span>
                Tareas ·{" "}
                {tasks.filter((t) => t.dueDate && t.status !== "done").length}
              </button>
            )}
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
                const dayTasks = showTasks
                  ? tasks.filter(
                      (t) =>
                        t.dueDate === key && t.status !== "done",
                    )
                  : [];
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
                    {dayTasks.slice(0, 2).map((t) => {
                      const cli = clients.find((c) => c.id === t.clientId);
                      const prioColor =
                        t.priority === "critica"
                          ? "#b04b3a"
                          : t.priority === "alta"
                            ? "#C9A14A"
                            : t.priority === "media"
                              ? "#9B8259"
                              : "#7A8A7E";
                      return (
                        <span
                          key={t.id}
                          onClick={(ev) => ev.stopPropagation()}
                          title={`Tarea: ${t.title} · ${cli?.name ?? t.clientId} · ${t.assignee}`}
                          style={{
                            display: "block",
                            fontSize: 10,
                            padding: "2px 6px",
                            marginTop: 3,
                            background: `${prioColor}1A`,
                            color: prioColor,
                            border: `1px dashed ${prioColor}`,
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            cursor: "default",
                            borderRadius: 2,
                          }}
                        >
                          ⊡ {t.title.slice(0, 22)}
                        </span>
                      );
                    })}
                    {dayTasks.length > 2 && (
                      <span
                        style={{
                          fontSize: 9,
                          color: "var(--text-muted)",
                          marginTop: 2,
                          display: "block",
                        }}
                      >
                        +{dayTasks.length - 2} tarea
                        {dayTasks.length - 2 === 1 ? "" : "s"}
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
            {/* Mostramos también tareas que vencen pronto */}
            {showTasks &&
              tasks
                .filter((t) => t.dueDate && t.status !== "done" && t.dueDate >= todayKey)
                .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
                .slice(0, 5)
                .map((t) => {
                  const cli = clients.find((c) => c.id === t.clientId);
                  const fd = formatUpcomingDate(t.dueDate as string);
                  const prioColor =
                    t.priority === "critica"
                      ? "#b04b3a"
                      : t.priority === "alta"
                        ? "#C9A14A"
                        : "#9B8259";
                  return (
                    <div
                      key={`task-${t.id}`}
                      className={styles.eventItem}
                      style={{ borderLeft: `3px solid ${prioColor}` }}
                    >
                      <div className={styles.eventDate}>
                        <div className="d">{fd.day}</div>
                        <div className="m">{fd.month}</div>
                      </div>
                      <div className={styles.eventInfo}>
                        <div className="eName">
                          ⊡ {t.title}
                          <span
                            style={{
                              fontSize: 9,
                              color: prioColor,
                              letterSpacing: "0.1em",
                              textTransform: "uppercase",
                              marginLeft: 6,
                              fontWeight: 700,
                            }}
                          >
                            {t.priority}
                          </span>
                        </div>
                        <div className="eClient">
                          {cli?.name ?? t.clientId} · {t.assignee}
                        </div>
                      </div>
                    </div>
                  );
                })}
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
        onClose={() => setModal({ open: false })}
        onCreated={refresh}
      />
    </>
  );
}
