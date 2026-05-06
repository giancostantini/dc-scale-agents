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
          <div className={portalStyles.heroEyebrow}>Tu mes</div>
          <h1 className={portalStyles.heroTitle}>Calendario</h1>
          <p className={portalStyles.heroSub}>
            Reuniones, lanzamientos de campañas y publicaciones programadas.
            Click en un día para ver el detalle.
          </p>
        </section>

        <MonthlyCalendar />
      </main>
    </>
  );
}
