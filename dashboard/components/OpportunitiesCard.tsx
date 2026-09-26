"use client";

/**
 * OpportunitiesCard — oportunidades del asesor IA (portal_opportunities,
 * mig 107; las genera /api/cron/portal-opportunities cada semana).
 *
 *  - variant "portal": las activas del cliente (RLS: el cliente solo ve
 *    status 'activa'), marcadas "Sugerencia del asesor IA", con
 *    "Preguntale al asesor" (abre el chat con la pregunta escrita) y
 *    "Descartar".
 *  - variant "team": las activas + internas del cliente, para que el
 *    equipo vea qué se le mostró y pueda descartar.
 *
 * Sin la migración o sin oportunidades, no renderiza nada.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase/client";

interface Opportunity {
  id: number;
  kind: string;
  title: string;
  body: string;
  basis: string[] | null;
  status: string;
  created_at: string;
  expires_at: string | null;
}

const KIND_LABEL: Record<string, string> = {
  paquete: "Paquete",
  campana: "Campaña",
  tendencia: "Tendencia",
  competencia: "Competencia",
  contenido: "Contenido",
};

export default function OpportunitiesCard({
  clientId,
  variant,
}: {
  clientId: string;
  variant: "portal" | "team";
}) {
  const [list, setList] = useState<Opportunity[]>([]);
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const statuses = variant === "team" ? ["activa", "interna"] : ["activa"];
    getSupabase()
      .from("portal_opportunities")
      .select("id, kind, title, body, basis, status, created_at, expires_at")
      .eq("client_id", clientId)
      .in("status", statuses)
      .order("created_at", { ascending: false })
      .limit(6)
      .then(({ data, error }) => {
        if (!active || error) return;
        const now = Date.now();
        setList(
          ((data ?? []) as Opportunity[]).filter(
            (o) => !o.expires_at || new Date(o.expires_at).getTime() > now,
          ),
        );
      });
    return () => {
      active = false;
    };
  }, [clientId, variant]);

  async function dismiss(id: number) {
    setBusy(id);
    try {
      const {
        data: { session },
      } = await getSupabase().auth.getSession();
      await fetch("/api/opportunities/dismiss", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ id }),
      });
      setList((l) => l.filter((o) => o.id !== id));
    } finally {
      setBusy(null);
    }
  }

  if (list.length === 0) return null;

  const portal = variant === "portal";

  return (
    <section
      aria-label="Oportunidades"
      style={{
        background: "var(--white)",
        border: "1px solid rgba(196,168,130,0.45)",
        borderLeft: "3px solid var(--sand)",
        borderRadius: 14,
        padding: 18,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        marginBottom: portal ? 0 : 24,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--sand-dark)",
            fontWeight: 700,
          }}
        >
          {portal ? "Oportunidades" : "Oportunidades del asesor IA"}
        </div>
        <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>
          {portal ? "Sugerencia del asesor IA" : "Lo que ve el cliente en su portal"}
        </span>
      </div>

      {list.map((o) => (
        <article
          key={o.id}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            paddingTop: 12,
            borderTop: "1px solid rgba(10,26,12,0.06)",
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--sand-dark)",
                background: "rgba(196,168,130,0.16)",
                padding: "2px 7px",
                borderRadius: 999,
              }}
            >
              {KIND_LABEL[o.kind] ?? o.kind}
            </span>
            {!portal && o.status === "interna" && (
              <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>no publicada</span>
            )}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--deep-green)", lineHeight: 1.35 }}>
            {o.title}
          </div>
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: "var(--deep-green)" }}>{o.body}</p>
          {!portal && o.basis && o.basis.length > 0 && (
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Se apoya en: {o.basis.join(" · ")}</div>
          )}
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 2 }}>
            {portal && (
              <Link
                href={`/portal/consultor?pregunta=${encodeURIComponent(`Contame más sobre esta oportunidad: ${o.title}`)}`}
                style={{ fontSize: 12, fontWeight: 700, color: "var(--deep-green)" }}
              >
                Preguntale al asesor →
              </Link>
            )}
            <button
              type="button"
              onClick={() => void dismiss(o.id)}
              disabled={busy === o.id}
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                fontSize: 12,
                color: "var(--text-muted)",
                cursor: "pointer",
                textDecoration: "underline",
                fontFamily: "inherit",
              }}
            >
              {busy === o.id ? "…" : "Descartar"}
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}
