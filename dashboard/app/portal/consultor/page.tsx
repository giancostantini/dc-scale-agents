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
        eyebrow="Consultor IA"
        showBack
      />

      <main className={styles.wrap}>
        <section className={styles.intro}>
          <div className={portalStyles.heroEyebrow}>Asistente</div>
          <h1 className={portalStyles.heroTitle}>Tu consultor IA</h1>
          <p className={portalStyles.heroSub}>
            Preguntale lo que quieras sobre tu cuenta. Tiene acceso en
            tiempo real a tus KPIs, reportes aprobados, campañas activas
            y reuniones próximas.
          </p>
        </section>

        <ConsultorChatPanel clientName={client.name} variant="fullscreen" />

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
