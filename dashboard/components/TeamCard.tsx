"use client";

/**
 * TeamCard — Card del sidebar del portal que muestra el equipo de D&C
 * asignado al cliente, con contacto directo (WhatsApp o email).
 *
 * Fetch a /api/portal/team (service role) al montar. Si no hay equipo
 * asignado, muestra un estado "se está asignando". Si falla, no renderiza.
 */

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import styles from "./TeamCard.module.css";

interface TeamMember {
  name: string;
  initials: string;
  roleInClient: string;
  phone: string | null;
  email: string | null;
}

/** Normaliza un teléfono a dígitos para el link wa.me (saca +, espacios, guiones). */
function waNumber(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

function contactHref(m: TeamMember): string | null {
  if (m.phone && waNumber(m.phone).length >= 8) {
    return `https://wa.me/${waNumber(m.phone)}`;
  }
  if (m.email) return `mailto:${m.email}`;
  return null;
}

export default function TeamCard() {
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = getSupabase();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          setLoading(false);
          return;
        }
        const res = await fetch("/api/portal/team", {
          headers: { authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) {
          if (!cancelled) setErrored(true);
          return;
        }
        const data = (await res.json()) as { team: TeamMember[] };
        if (!cancelled) setTeam(data.team ?? []);
      } catch {
        if (!cancelled) setErrored(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Error → no renderizar (no ensuciamos el sidebar con un error técnico)
  if (errored) return null;

  if (loading) {
    return (
      <div className={styles.card}>
        <div className={styles.label}>Tu equipo</div>
        <div className={styles.skeletonRow} />
        <div className={styles.skeletonRow} />
      </div>
    );
  }

  if (!team || team.length === 0) {
    return (
      <div className={styles.card}>
        <div className={styles.label}>Tu equipo</div>
        <div className={styles.empty}>
          Tu equipo de D&amp;C se está asignando. Mientras tanto, escribile
          a tu account lead o usá el chat del Advisor.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.label}>Tu equipo D&amp;C</div>
      <div className={styles.members}>
        {team.map((m, i) => {
          const href = contactHref(m);
          const isWhatsapp = href?.startsWith("https://wa.me/");
          return (
            <div key={`${m.name}-${i}`} className={styles.member}>
              <div className={styles.avatar} aria-hidden="true">
                {m.initials}
              </div>
              <div className={styles.info}>
                <div className={styles.name}>{m.name}</div>
                <div className={styles.role}>{m.roleInClient}</div>
              </div>
              {href && (
                <a
                  href={href}
                  target={isWhatsapp ? "_blank" : undefined}
                  rel={isWhatsapp ? "noopener noreferrer" : undefined}
                  className={styles.contactBtn}
                  title={isWhatsapp ? "Escribir por WhatsApp" : "Enviar email"}
                  aria-label={`Contactar a ${m.name}`}
                >
                  {isWhatsapp ? <WhatsappIcon /> : <MailIcon />}
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function WhatsappIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.22 3.08.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35zM12.04 2.5c-5.25 0-9.5 4.25-9.5 9.5 0 1.67.44 3.3 1.27 4.74L2.5 21.5l4.9-1.28a9.46 9.46 0 0 0 4.64 1.18h.01c5.24 0 9.5-4.25 9.5-9.5s-4.26-9.6-9.51-9.6z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M22 7l-10 6L2 7" />
    </svg>
  );
}
