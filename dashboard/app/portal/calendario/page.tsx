"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getCurrentProfile,
  hasSession,
  type Profile,
} from "@/lib/supabase/auth";
import { getClient } from "@/lib/storage";
import PortalHeader from "@/components/PortalHeader";
import MonthlyCalendar from "@/components/MonthlyCalendar";
import type { Client } from "@/lib/types";
import portalStyles from "../portal.module.css";
import styles from "./calendario.module.css";

/**
 * CTA "Agendar reunión con D&C" — abre Outlook Web con compose pre-cargado
 * al email del director. NEXT_PUBLIC_DIRECTOR_EMAIL es la única env var
 * pública que necesita; si no está, el botón no aparece.
 */
function ScheduleCTA() {
  const directorEmail = process.env.NEXT_PUBLIC_DIRECTOR_EMAIL;
  if (!directorEmail) return null;

  const subject = encodeURIComponent("Reunión con D&C");
  const url = `https://outlook.office.com/calendar/0/deeplink/compose?subject=${subject}&to=${encodeURIComponent(directorEmail)}`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.scheduleCta}
    >
      <span className={styles.scheduleCtaIcon} aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <line x1="12" y1="14" x2="12" y2="18" />
          <line x1="10" y1="16" x2="14" y2="16" />
        </svg>
      </span>
      <span className={styles.scheduleCtaText}>
        <span className={styles.scheduleCtaLabel}>Agendar con D&amp;C</span>
        <span className={styles.scheduleCtaHint}>Se abre en Outlook</span>
      </span>
    </a>
  );
}

export default function PortalCalendarioPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    hasSession().then(async (has) => {
      if (!has) {
        router.replace("/");
        return;
      }
      const p = await getCurrentProfile();
      if (!active) return;
      if (!p) {
        router.replace("/");
        return;
      }
      if (p.role !== "client") {
        router.replace("/hub");
        return;
      }
      setProfile(p);
      if (p.client_id) {
        const c = await getClient(p.client_id);
        if (active) setClient(c ?? null);
      }
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [router]);

  if (loading || !profile) return null;

  return (
    <>
      <PortalHeader
        client={client}
        profile={profile}
        eyebrow="Calendario"
        showBack
      />

      <main className={portalStyles.wrap}>
        <section className={portalStyles.heroBlock}>
          <div className={portalStyles.heroLeft}>
            <div className={portalStyles.heroEyebrow}>Tu mes</div>
            <h1 className={portalStyles.heroTitle}>Calendario</h1>
            <p className={portalStyles.heroSub}>
              Reuniones que el equipo agenda en Outlook se sincronizan
              automáticamente. Click en un día para ver el detalle.
            </p>
          </div>
          <ScheduleCTA />
        </section>

        <MonthlyCalendar />
      </main>
    </>
  );
}
