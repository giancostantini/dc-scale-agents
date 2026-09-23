"use client";

/**
 * Aviso del dashboard del cliente growth: qué contenido hay que subir.
 *
 * Reemplazó al desglose de solicitudes (que sigue en su menú). Muestra
 * lo atrasado, lo de hoy y lo de los próximos días, en las palabras del
 * calendario ("Posteo de oferta en Instagram"). Cada ítem abre la pieza
 * en el Calendario (?pieza=<id>), donde se carga la descripción, la
 * foto y se marca como subida.
 */

import Link from "next/link";
import type { ContentPost } from "@/lib/types";
import { NETWORK_COLORS } from "@/lib/content-frequency";
import { isoLocalDate, networksOf } from "@/lib/content-labels";
import {
  PIECE_STATE_META,
  addDaysIso,
  isOverdue,
  pieceState,
  pieceTitle,
} from "@/lib/content-plan";
import ui from "./ClientUI.module.css";

/** Hasta cuántos días para atrás se avisa de lo atrasado. Más viejo que
 *  esto ya no es accionable (y las piezas IA viejas no inundan). */
const OVERDUE_WINDOW_DAYS = 14;
/** Ventana de "próximos días". */
const UPCOMING_DAYS = 7;
const MAX_ROWS = 6;
const OVERDUE_COLOR = "var(--red-warn)";
const WEEKDAYS_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

function shortDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${WEEKDAYS_SHORT[new Date(y, m - 1, d).getDay()]} ${d}/${m}`;
}

function byDate(a: ContentPost, b: ContentPost): number {
  return a.date.localeCompare(b.date);
}

export default function UpcomingContentPanel({
  clientId,
  posts,
  hasFrequency,
  isDirector,
}: {
  clientId: string;
  posts: ContentPost[];
  /** El cliente tiene frecuencia configurada (el asistente puede cargar). */
  hasFrequency: boolean;
  isDirector: boolean;
}) {
  const today = isoLocalDate(new Date());
  const calendarHref = `/cliente/${clientId}/planificador`;

  const overdue = posts
    .filter(
      (p) => isOverdue(p, today) && p.date >= addDaysIso(today, -OVERDUE_WINDOW_DAYS),
    )
    .sort(byDate);
  const todays = posts.filter((p) => p.date === today);
  const todaysPending = todays.filter((p) => p.status !== "published");
  const upcoming = posts
    .filter(
      (p) =>
        p.status !== "published" &&
        p.date > today &&
        p.date <= addDaysIso(today, UPCOMING_DAYS),
    )
    .sort(byDate);

  const nothingLoaded = overdue.length === 0 && todays.length === 0 && upcoming.length === 0;

  const headline =
    todaysPending.length > 0
      ? `Hoy toca subir ${todaysPending.length} contenido${todaysPending.length === 1 ? "" : "s"}`
      : todays.length > 0
        ? "Lo de hoy ya está subido ✓"
        : "Hoy no toca contenido";

  return (
    <div
      className={ui.panel}
      style={{
        marginBottom: 20,
        borderLeft: `3px solid ${
          overdue.length > 0
            ? OVERDUE_COLOR
            : todaysPending.length > 0
              ? "var(--sand-dark)"
              : "var(--sand)"
        }`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: nothingLoaded ? 8 : 14,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 9,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: overdue.length > 0 ? OVERDUE_COLOR : "var(--sand-dark)",
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            {overdue.length > 0
              ? `Contenido · ${overdue.length} atrasado${overdue.length === 1 ? "" : "s"}`
              : "Contenido para subir"}
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "var(--deep-green)" }}>
            {headline}
          </div>
        </div>
        <Link
          href={calendarHref}
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--deep-green)",
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
            textDecoration: "none",
          }}
        >
          Ir al calendario →
        </Link>
      </div>

      {nothingLoaded ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
          {hasFrequency
            ? "No hay contenidos cargados para estos días. Cargá el mes desde el Calendario con el asistente creativo."
            : isDirector
              ? "Configurá la frecuencia de publicación en el Calendario y el asistente carga qué toca cada día."
              : "Todavía no hay frecuencia de publicación configurada para este cliente."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {overdue.length > 0 && (
            <Group title="Atrasados" color={OVERDUE_COLOR}>
              {overdue.slice(0, MAX_ROWS).map((p) => (
                <Row key={p.id} post={p} clientId={clientId} today={today} when={shortDay(p.date)} />
              ))}
              <More count={overdue.length - MAX_ROWS} href={calendarHref} />
            </Group>
          )}
          {todays.length > 0 && (
            <Group title="Hoy">
              {todays.map((p) => (
                <Row key={p.id} post={p} clientId={clientId} today={today} />
              ))}
            </Group>
          )}
          {upcoming.length > 0 && (
            <Group title={`Próximos ${UPCOMING_DAYS} días`}>
              {upcoming.slice(0, MAX_ROWS).map((p) => (
                <Row key={p.id} post={p} clientId={clientId} today={today} when={shortDay(p.date)} />
              ))}
              <More count={upcoming.length - MAX_ROWS} href={calendarHref} />
            </Group>
          )}
        </div>
      )}
    </div>
  );
}

function Group({
  title,
  color,
  children,
}: {
  title: string;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: color ?? "var(--text-muted)",
          fontWeight: 700,
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{children}</div>
    </div>
  );
}

function Row({
  post,
  clientId,
  today,
  when,
}: {
  post: ContentPost;
  clientId: string;
  today: string;
  /** Día corto ("jue 24/9") para los grupos que no son "Hoy". */
  when?: string;
}) {
  const state = pieceState(post);
  const overdue = isOverdue(post, today);
  const net = networksOf(post)[0] ?? post.network;
  const stateColor = overdue ? OVERDUE_COLOR : PIECE_STATE_META[state].color;
  return (
    <Link
      href={`/cliente/${clientId}/planificador?pieza=${post.id}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        background: "var(--off-white)",
        borderLeft: `3px solid ${NETWORK_COLORS[net].solid}`,
        borderRadius: "var(--r-sm)",
        textDecoration: "none",
        color: "var(--deep-green)",
        fontSize: 13,
      }}
    >
      {when && (
        <span style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 58, flexShrink: 0 }}>
          {when}
        </span>
      )}
      <span style={{ flex: 1, minWidth: 0, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {pieceTitle(post)}
      </span>
      <span
        style={{
          flexShrink: 0,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: stateColor,
        }}
      >
        {state === "subido" ? "✓ " : ""}
        {PIECE_STATE_META[state].label}
      </span>
    </Link>
  );
}

function More({ count, href }: { count: number; href: string }) {
  if (count <= 0) return null;
  return (
    <Link href={href} style={{ fontSize: 11, color: "var(--text-muted)", paddingLeft: 10 }}>
      +{count} más en el calendario
    </Link>
  );
}
