"use client";

/**
 * EstadoEmpresa — cards con el estado de las 6 gerencias (tabla `digests`,
 * mig 096, level='area'). El mismo dato que recibe inyectado el Gerente
 * General, mostrado a humanos.
 *
 * - Lee con el browser client → la RLS filtra sola: director ve las 6,
 *   team ve 4 (sin finanzas/ventas).
 * - variant='hub': grid ancho en /hub. variant='rail': columna angosta
 *   en /gerente.
 * - Cada card linkea a /gerente?gerencia=<slug> (abre el chat con la
 *   persona correspondiente).
 * - Empty state honesto: si el cron nunca corrió, lo dice — no inventa.
 */

import { useEffect, useState } from "react";
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

export default function EstadoEmpresa({ variant }: { variant: "hub" | "rail" }) {
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

  const isRail = variant === "rail";

  return (
    <div style={{ marginBottom: isRail ? 0 : 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 10,
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--sand-dark)",
            fontWeight: 700,
          }}
        >
          Estado de la empresa
        </div>
        {!isRail && (
          <Link
            href="/gerente"
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--deep-green)",
              textDecoration: "none",
            }}
          >
            Hablar con el Gerente General →
          </Link>
        )}
      </div>

      {visibles.length === 0 ? (
        <div
          style={{
            background: "var(--white)",
            border: "1px dashed var(--hairline)",
            borderRadius: "var(--r-lg)",
            padding: isRail ? 16 : 24,
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
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isRail
              ? "1fr"
              : "repeat(auto-fit, minmax(240px, 1fr))",
            gap: isRail ? 10 : 14,
          }}
        >
          {visibles.map((g) => {
            const d = byKey.get(g.slug)!;
            const sev = d.data?.severity ?? "ok";
            const signals = signalLines(d.content_md, isRail ? 2 : 3);
            return (
              <Link
                key={g.slug}
                href={`/gerente?gerencia=${g.slug as GerenciaSlug}`}
                style={{
                  display: "block",
                  background: "var(--white)",
                  border: "1px solid var(--hairline)",
                  borderRadius: "var(--r-lg)",
                  padding: isRail ? "12px 14px" : "16px 18px",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  <span style={{ fontSize: isRail ? 14 : 16 }}>{g.emoji}</span>
                  <span
                    style={{
                      fontSize: isRail ? 12 : 13,
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
                    WebkitLineClamp: isRail ? 2 : 3,
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
                  {relativeTime(d.updated_at)}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
