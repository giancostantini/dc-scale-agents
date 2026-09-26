"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  getCurrentProfile,
  hasSession,
  type Profile,
} from "@/lib/supabase/auth";
import { getClient } from "@/lib/storage";
import PortalHeader from "@/components/PortalHeader";
import ConsultorChatPanel from "@/components/ConsultorChatPanel";
import type { Client } from "@/lib/types";
import portalStyles from "../portal.module.css";
import styles from "./consultor.module.css";

export default function PortalConsultorPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  // ?pregunta=… (desde "Preguntale al asesor" de una oportunidad) deja la
  // pregunta escrita en el chat, sin enviarla.
  const [prefill, setPrefill] = useState<string | undefined>(undefined);

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
      if (!p.client_id) {
        setProfile(p);
        setLoading(false);
        return;
      }
      setProfile(p);
      const c = await getClient(p.client_id);
      if (active) {
        const q = new URLSearchParams(window.location.search).get("pregunta");
        if (q) setPrefill(q.slice(0, 500));
        setClient(c ?? null);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [router]);

  if (loading || !profile || !client) return null;

  return (
    <>
      <PortalHeader
        client={client}
        profile={profile}
        eyebrow="D&C Advisor"
        showBack
      />

      <main className={styles.wrap}>
        <section className={styles.intro}>
          <div className={portalStyles.heroEyebrow}>Asistente</div>
          <h1 className={portalStyles.heroTitle}>Tu D&C Advisor</h1>
          <p className={portalStyles.heroSub}>
            Preguntale lo que quieras sobre tu cuenta. Tiene acceso en
            tiempo real a tus KPIs, reportes aprobados, campañas activas
            y reuniones próximas.
          </p>
        </section>

        <ConsultorChatPanel
          key={prefill ?? "chat"}
          clientName={client.name}
          variant="fullscreen"
          initialInput={prefill}
        />

        <div className={styles.disclaimer}>
          Para cambios sobre lo que ya está aprobado, hablá con tu
          account lead. Para nuevas iniciativas (promos, ideas) cargá una{" "}
          <Link href="/portal/solicitudes" className={styles.link}>
            solicitud
          </Link>
          .
        </div>
      </main>
    </>
  );
}
