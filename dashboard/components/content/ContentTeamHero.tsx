"use client";

/**
 * ContentTeamHero — encabezado personal del módulo de Contenido.
 *
 * Solo se renderiza para role='team'. Convierte "acá está todo el
 * contenido del cliente" en "esto es lo tuyo, arrancá por acá", que es
 * el problema concreto por el que el equipo no estaba usando el módulo.
 *
 * Los contadores SIEMPRE cuentan las piezas del usuario, sin importar
 * si el toggle "Mis piezas" está activo: "Hola Lucia, tenés 4 piezas"
 * no puede cambiar de número porque el usuario haya pedido ver todo el
 * cliente.
 */

import type { TeamHeroCounts } from "@/lib/content-labels";

export interface ContentTeamHeroProps {
  /** Nombre completo; se muestra solo el primero. */
  name: string;
  counts: TeamHeroCounts;
  /** Filtra a las piezas del usuario con fecha en la semana actual. */
  onShowWeek: () => void;
  /** Filtra a sus borradores. */
  onShowInProgress: () => void;
  /** Filtra a sus publicadas. */
  onShowDone: () => void;
}

export default function ContentTeamHero({
  name,
  counts,
  onShowWeek,
  onShowInProgress,
  onShowDone,
}: ContentTeamHeroProps) {
  const firstName = name.split(" ")[0] || name;

  const subtitle =
    counts.overdue > 0
      ? `Tenés ${plural(counts.week, "pieza", "piezas")} esta semana y ${plural(counts.overdue, "vencida", "vencidas")}. Arrancá por las vencidas.`
      : counts.week > 0
        ? `Tenés ${plural(counts.week, "pieza", "piezas")} esta semana. Vas bien.`
        : "No tenés piezas asignadas esta semana.";

  return (
    <div
      style={{
        background: "var(--deep-green)",
        color: "var(--off-white)",
        borderRadius: "var(--r-lg)",
        padding: "18px 22px",
        marginBottom: 14,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 20,
        flexWrap: "wrap",
      }}
    >
      <div style={{ minWidth: 220 }}>
        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            marginBottom: 4,
          }}
        >
          Hola, {firstName}
        </div>
        <div style={{ fontSize: 13, opacity: 0.75 }}>{subtitle}</div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <HeroPill
          label="Esta semana"
          value={counts.week}
          onClick={onShowWeek}
        />
        {/* Vencidas es informativo: el orden de la grilla ya las pone
            primero, y hacerlo filtrable pediría otro estado en la
            página para poco valor extra. */}
        <HeroPill
          label="Vencidas"
          value={counts.overdue}
          tone={counts.overdue > 0 ? "warn" : undefined}
        />
        <HeroPill
          label="En curso"
          value={counts.inProgress}
          onClick={onShowInProgress}
        />
        <HeroPill
          label="Hechas"
          value={counts.done}
          tone={counts.done > 0 ? "ok" : undefined}
          onClick={onShowDone}
        />
      </div>
    </div>
  );
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function HeroPill({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  tone?: "warn" | "ok";
  onClick?: () => void;
}) {
  const valueColor =
    tone === "warn" ? "#F0A090" : tone === "ok" ? "#8FD4A8" : "var(--off-white)";
  const clickable = !!onClick;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      title={clickable ? `Ver ${label.toLowerCase()}` : undefined}
      style={{
        minWidth: 92,
        padding: "10px 14px",
        // Sobre el verde profundo un borde/fondo claro translúcido lee
        // mejor que las CSS vars de superficie, que están pensadas para
        // fondo claro.
        background: "rgba(255,255,255,0.10)",
        border: "1px solid rgba(255,255,255,0.20)",
        borderRadius: "var(--r-sm)",
        color: "var(--off-white)",
        fontFamily: "inherit",
        textAlign: "left",
        cursor: clickable ? "pointer" : "default",
      }}
    >
      <div
        style={{
          fontSize: 9,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          opacity: 0.7,
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: valueColor }}>
        {value}
      </div>
    </button>
  );
}
