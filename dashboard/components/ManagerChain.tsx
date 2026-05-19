"use client";

/**
 * ManagerChain — muestra la cadena de mando arriba del usuario.
 *
 * Ej: si Juan le reporta a María, que le reporta a Federico,
 * y Federico no tiene jefe (Director), muestra:
 *
 *   Juan → María → Federico (Director)
 *
 * Útil en /equipo/[id] para que cualquier miembro (o director
 * viendo a otro miembro) sepa de un vistazo cómo está la cadena.
 */

import Link from "next/link";
import type { Profile } from "@/lib/supabase/auth";

interface Props {
  user: Profile;
  /** Lista de TODOS los profiles (necesaria para resolver la cadena). */
  allProfiles: Profile[];
}

export default function ManagerChain({ user, allProfiles }: Props) {
  const chain = buildChain(user, allProfiles);

  if (chain.length === 1) {
    // El usuario no tiene manager (es root / director sin jefe)
    return (
      <div
        style={{
          padding: "10px 14px",
          background: "var(--off-white)",
          borderLeft: "2px solid var(--sand)",
          fontSize: 12,
          color: "var(--text-muted)",
          marginBottom: 24,
        }}
      >
        <strong style={{ color: "var(--deep-green)" }}>Reporta a:</strong>{" "}
        Sin jefe directo asignado.
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "12px 16px",
        background: "var(--off-white)",
        borderLeft: "2px solid var(--sand)",
        marginBottom: 24,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "var(--sand-dark)",
          fontWeight: 700,
          marginBottom: 8,
        }}
      >
        Cadena de reporte
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          fontSize: 12,
        }}
      >
        {chain.map((p, idx) => (
          <span
            key={p.id}
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            {idx > 0 && (
              <span style={{ color: "var(--sand-dark)", fontWeight: 700 }}>
                →
              </span>
            )}
            <Link
              href={`/equipo/${p.id}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                background: idx === 0 ? "var(--deep-green)" : "var(--white)",
                color: idx === 0 ? "var(--off-white)" : "var(--deep-green)",
                border: "1px solid rgba(10,26,12,0.08)",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  background: idx === 0 ? "var(--sand)" : "var(--deep-green)",
                  color: idx === 0 ? "var(--deep-green)" : "var(--off-white)",
                  fontSize: 9,
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {p.initials}
              </span>
              {p.name}
              {p.role === "director" && (
                <span
                  style={{
                    fontSize: 8,
                    letterSpacing: "0.12em",
                    color: idx === 0 ? "var(--sand)" : "var(--sand-dark)",
                  }}
                >
                  · DIRECTOR
                </span>
              )}
            </Link>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Construye la cadena del usuario hacia arriba siguiendo reports_to_id.
 * Devuelve array [user, manager, manager_del_manager, …].
 * Detecta loops (no debería haber pero por seguridad).
 */
function buildChain(user: Profile, all: Profile[]): Profile[] {
  const byId = new Map(all.map((p) => [p.id, p]));
  const chain: Profile[] = [user];
  const seen = new Set<string>([user.id]);

  let current = user;
  while (current.reports_to_id) {
    const next = byId.get(current.reports_to_id);
    if (!next) break;
    if (seen.has(next.id)) break; // loop guard
    seen.add(next.id);
    chain.push(next);
    current = next;
  }

  return chain;
}
