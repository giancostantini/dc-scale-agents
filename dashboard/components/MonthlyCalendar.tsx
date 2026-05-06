"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import styles from "./MonthlyCalendar.module.css";

export interface CalendarEvent {
  id: string;
  date: string;
  time?: string | null;
  type: "meeting" | "campaign-start" | "campaign-end" | "content";
  title: string;
  meta?: string;
  meetLink?: string | null;
  network?: string;
}

const MONTH_LABEL_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export default function MonthlyCalendar() {
  const [month, setMonth] = useState<string>(() =>
    new Date().toISOString().slice(0, 7),
  );
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);

  // Derived state durante el render (React 19 pattern):
  // cuando cambia month, reseteamos openDay/error/loading/events.
  const [lastMonth, setLastMonth] = useState(month);
  if (lastMonth !== month) {
    setLastMonth(month);
    setOpenDay(null);
    setEvents([]);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const supabase = getSupabase();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          if (active) {
            setError("Sin sesión.");
            setLoading(false);
          }
          return;
        }
        const res = await fetch(`/api/portal/calendar?month=${month}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = (await res.json().catch(() => ({}))) as {
          month?: string;
          events?: CalendarEvent[];
          error?: string;
        };
        if (!active) return;
        if (!res.ok) {
          setError(data.error ?? `Error ${res.status}`);
          setLoading(false);
          return;
        }
        setEvents(data.events ?? []);
        setLoading(false);
      } catch (err) {
        console.error("calendar fetch error:", err);
        if (active) {
          setError("Error de red.");
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [month]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const arr = map.get(e.date) ?? [];
      arr.push(e);
      map.set(e.date, arr);
    }
    return map;
  }, [events]);

  const grid = useMemo(() => buildMonthGrid(month), [month]);
  const monthLabel = formatMonthLabel(month);

  const openDayEvents = openDay ? eventsByDay.get(openDay) ?? [] : [];

  function shiftMonth(delta: number): void {
    const [yStr, mStr] = month.split("-");
    const y = parseInt(yStr, 10);
    let m = parseInt(mStr, 10) + delta;
    let yNew = y;
    while (m > 12) {
      m -= 12;
      yNew += 1;
    }
    while (m < 1) {
      m += 12;
      yNew -= 1;
    }
    setMonth(`${yNew}-${String(m).padStart(2, "0")}`);
  }

  return (
    <section className={styles.wrapper} aria-label="Calendario del mes">
      <div className={styles.header}>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => shiftMonth(-1)}
          aria-label="Mes anterior"
        >
          ←
        </button>
        <h2 className={styles.title}>{monthLabel}</h2>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => shiftMonth(1)}
          aria-label="Mes siguiente"
        >
          →
        </button>
      </div>

      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={`${styles.dot} ${styles.dotMeeting}`} />
          Reunión
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.dot} ${styles.dotCampaign}`} />
          Campaña
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.dot} ${styles.dotContent}`} />
          Publicación
        </span>
      </div>

      <div className={styles.weekHeader}>
        {DAY_LABELS.map((d) => (
          <div key={d} className={styles.weekHeaderCell}>
            {d}
          </div>
        ))}
      </div>

      <div className={styles.grid}>
        {grid.map((cell) => {
          const dayEvents = cell.date ? eventsByDay.get(cell.date) ?? [] : [];
          const today = new Date().toISOString().slice(0, 10);
          const isToday = cell.date === today;
          return (
            <button
              key={cell.key}
              type="button"
              className={`${styles.cell} ${
                !cell.inMonth ? styles.cellOutMonth : ""
              } ${isToday ? styles.cellToday : ""} ${
                dayEvents.length > 0 ? styles.cellHasEvents : ""
              }`}
              disabled={dayEvents.length === 0}
              onClick={() => cell.date && setOpenDay(cell.date)}
            >
              <span className={styles.cellDayNum}>{cell.dayNum}</span>
              {dayEvents.length > 0 && (
                <span className={styles.cellDots}>
                  {dayEvents.slice(0, 4).map((e) => (
                    <span
                      key={e.id}
                      className={`${styles.dot} ${dotClass(e.type)}`}
                    />
                  ))}
                  {dayEvents.length > 4 && (
                    <span className={styles.cellMore}>
                      +{dayEvents.length - 4}
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loading && <div className={styles.loading}>Cargando…</div>}
      {error && <div className={styles.error}>{error}</div>}
      {!loading && !error && events.length === 0 && (
        <div className={styles.empty}>
          No hay eventos este mes. Las próximas reuniones, lanzamientos de
          campaña y publicaciones programadas van a aparecer acá.
        </div>
      )}

      {openDay && (
        <div
          className={styles.drawerBackdrop}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpenDay(null);
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className={styles.drawer}>
            <header className={styles.drawerHeader}>
              <div>
                <div className={styles.drawerEyebrow}>Día</div>
                <h3 className={styles.drawerTitle}>
                  {new Date(openDay + "T00:00:00").toLocaleDateString("es-AR", {
                    weekday: "long",
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                </h3>
              </div>
              <button
                type="button"
                className={styles.drawerClose}
                onClick={() => setOpenDay(null)}
                aria-label="Cerrar"
              >
                ×
              </button>
            </header>
            <div className={styles.drawerBody}>
              {openDayEvents.map((e) => (
                <div key={e.id} className={styles.eventRow}>
                  <span className={`${styles.dot} ${dotClass(e.type)}`} />
                  <div className={styles.eventInfo}>
                    <div className={styles.eventTitle}>{e.title}</div>
                    <div className={styles.eventMeta}>
                      {typeLabel(e.type)}
                      {e.network ? ` · ${e.network.toUpperCase()}` : ""}
                      {e.time ? ` · ${e.time}` : ""}
                      {e.meta && e.meta !== e.network ? ` · ${e.meta}` : ""}
                    </div>
                  </div>
                  {e.meetLink && (
                    <a
                      href={
                        e.meetLink.startsWith("http")
                          ? e.meetLink
                          : `https://${e.meetLink}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.eventBtn}
                    >
                      Meet ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

interface GridCell {
  key: string;
  date: string | null; // YYYY-MM-DD si pertenece al mes, null si es padding
  dayNum: number;
  inMonth: boolean;
}

function buildMonthGrid(month: string): GridCell[] {
  const [yStr, mStr] = month.split("-");
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  // first day of month, último día
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lastDayNum = new Date(Date.UTC(y, m, 0)).getUTCDate();

  // En JS: getDay() devuelve 0=Dom, 1=Lun, ... 6=Sáb. Queremos
  // semana lunes-domingo, así que offset = (firstDay + 6) % 7
  const firstDayJs = first.getUTCDay();
  const offsetMon = (firstDayJs + 6) % 7;

  const cells: GridCell[] = [];

  // Padding del mes anterior
  const prevMonthLastDay = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
  for (let i = offsetMon - 1; i >= 0; i--) {
    cells.push({
      key: `pad-pre-${i}`,
      date: null,
      dayNum: prevMonthLastDay - i,
      inMonth: false,
    });
  }

  // Días del mes
  for (let d = 1; d <= lastDayNum; d++) {
    const dateStr = `${month}-${String(d).padStart(2, "0")}`;
    cells.push({ key: dateStr, date: dateStr, dayNum: d, inMonth: true });
  }

  // Padding del mes siguiente para completar 6 semanas (42 cells)
  const remaining = (7 - (cells.length % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    cells.push({
      key: `pad-post-${i}`,
      date: null,
      dayNum: i,
      inMonth: false,
    });
  }
  // Si quedó en 5 semanas (35 cells), agregar la sexta para layout estable
  while (cells.length < 42) {
    const i = cells.length - (lastDayNum + offsetMon) + 1;
    cells.push({
      key: `pad-tail-${i}`,
      date: null,
      dayNum: i,
      inMonth: false,
    });
  }

  return cells;
}

function formatMonthLabel(month: string): string {
  const [yStr, mStr] = month.split("-");
  const m = parseInt(mStr, 10);
  const label = MONTH_LABEL_ES[m - 1] ?? "";
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} ${yStr}`;
}

function dotClass(type: CalendarEvent["type"]): string {
  switch (type) {
    case "meeting":
      return styles.dotMeeting;
    case "campaign-start":
    case "campaign-end":
      return styles.dotCampaign;
    case "content":
      return styles.dotContent;
  }
}

function typeLabel(type: CalendarEvent["type"]): string {
  switch (type) {
    case "meeting":
      return "Reunión";
    case "campaign-start":
      return "Lanzamiento de campaña";
    case "campaign-end":
      return "Cierre de campaña";
    case "content":
      return "Publicación";
  }
}
