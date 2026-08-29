"use client";

/**
 * EstadoEmpresa — rail con el estado de las 6 gerencias (tabla `digests`,
 * mig 096, level='area'). El mismo dato que recibe inyectado el Gerente
 * General, mostrado a humanos. Vive SOLO en /gerente (el hub no lo
 * muestra — decisión de producto).
 *
 * - Lee con el browser client → la RLS filtra sola: director ve las 6,
 *   team ve 4 (sin finanzas/ventas).
 * - `onSelectGerencia` (lo pasa /gerente): las cards son BOTONES que
 *   cambian el gerente del chat al instante — sin depender de la URL,
 *   así el click funciona SIEMPRE (antes navegaba a ?gerencia=X y si el
 *   param no cambiaba, no pasaba nada). Sin callback, fallback a Link.
 * - Empty state honesto: si el cron nunca corrió, lo dice — no inventa.
 */

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase/client";
import { GERENCIAS, type GerenciaSlug } from "@/lib/gerencias";

interface DigestRow {
  key: string;
  title: string;
  content_md: string;
  data: { severity?: "ok" | "warn" | "crit" } & Record<string, unknown>;
  updated_at: string;
}

const SEV_COLOR: Record<string, string> = {
  ok: "#3e7c4f",
  warn: "#b8860b",
  crit: "#b0413e",
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} días`;
}

/** Primeras señales del digest: líneas del markdown sin el header. */
function signalLines(md: string, max: number): string[] {
  return md
    .split("\n")
    .slice(1)
    .map((l) => l.replace(/^- /, "").replace(/\*\*/g, "").trim())
    .filter(Boolean)
    .slice(0, max);
}

export default function EstadoEmpresa({
  onSelectGerencia,
}: {
  /** Si viene, las cards cambian el gerente del chat en vez de navegar. */
  onSelectGerencia?: (slug: GerenciaSlug) => void;
}) {
  const [rows, setRows] = useState<DigestRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = getSupabase();
      const { data } = await supabase
        .from("digests")
        .select("key, title, content_md, data, updated_at")
        .eq("level", "area");
      if (!cancelled) setRows((data as DigestRow[] | null) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Cargando: no renderizamos nada (evita layout shift con skeletons).
  if (rows === null) return null;

  const byKey = new Map(rows.map((r) => [r.key, r]));
  // Orden canónico del organigrama; solo las gerencias que la RLS devolvió.
  const visibles = GERENCIAS.filter((g) => byKey.has(g.slug));

  return (
    <div>
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--sand-dark)",
          fontWeight: 700,
          marginBottom: 6,
        }}
      >
        Estado por gerencia
      </div>

      {/* Leyenda del semáforo (mismos colores que los puntos de las cards) */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          columnGap: 12,
          rowGap: 2,
          fontSize: 10,
          color: "var(--text-muted)",
          marginBottom: 10,
          lineHeight: 1.5,
        }}
      >
        <LegendDot color={SEV_COLOR.ok} label="en orden" />
        <LegendDot color={SEV_COLOR.warn} label="esperando un humano" />
        <LegendDot color={SEV_COLOR.crit} label="errores o pagos atrasados" />
      </div>

      {visibles.length === 0 ? (
        <div
          style={{
            background: "var(--white)",
            border: "1px dashed var(--hairline)",
            borderRadius: "var(--r-lg)",
            padding: 16,
            fontSize: 12,
            color: "var(--text-muted)",
            lineHeight: 1.6,
          }}
        >
          El estado por gerencia todavía no se generó. Corre a diario con el
          workflow Process Sync; también podés pedirle al Gerente General que
          lo refresque.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
          {visibles.map((g) => {
            const d = byKey.get(g.slug)!;
            const sev = d.data?.severity ?? "ok";
            const signals = signalLines(d.content_md, 2);
            const inner = (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  <span style={{ fontSize: 14 }}>{g.emoji}</span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--deep-green)",
                      flex: 1,
                      minWidth: 0,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {g.label}
                  </span>
                  <span
                    title={sev === "crit" ? "Hay errores o pagos atrasados" : sev === "warn" ? "Gates o solicitudes esperando" : "En orden"}
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: "50%",
                      background: SEV_COLOR[sev] ?? SEV_COLOR.ok,
                      flexShrink: 0,
                    }}
                  />
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    lineHeight: 1.55,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {signals.map((s, i) => (
                    <div key={i}>{s}</div>
                  ))}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--text-muted)",
                    opacity: 0.7,
                    marginTop: 8,
                  }}
                >
                  {relativeTime(d.updated_at)} · click = hablar con este gerente
                </div>
              </>
            );
            return (
              <GerenciaCard
                key={g.slug}
                slug={g.slug}
                onSelectGerencia={onSelectGerencia}
              >
                {inner}
              </GerenciaCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}

const cardStyle: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  background: "var(--white)",
  border: "1px solid var(--hairline)",
  borderRadius: "var(--r-lg)",
  padding: "12px 14px",
  textDecoration: "none",
  color: "inherit",
  fontFamily: "inherit",
  cursor: "pointer",
};

function GerenciaCard({
  slug,
  onSelectGerencia,
  children,
}: {
  slug: GerenciaSlug;
  onSelectGerencia?: (slug: GerenciaSlug) => void;
  children: ReactNode;
}) {
  if (onSelectGerencia) {
    return (
      <button type="button" style={cardStyle} onClick={() => onSelectGerencia(slug)}>
        {children}
      </button>
    );
  }
  return (
    <Link href={`/gerente?gerencia=${slug}`} style={cardStyle}>
      {children}
    </Link>
  );
}
