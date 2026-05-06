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
import MarkdownRenderer from "@/components/MarkdownRenderer";
import type { Client } from "@/lib/types";
import portalStyles from "../portal.module.css";
import styles from "./faq.module.css";

export default function FaqClient({ content }: { content: string }) {
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
        eyebrow="Preguntas frecuentes"
        showBack
      />

      <main className={portalStyles.wrap}>
        <section className={styles.intro}>
          <div className={portalStyles.heroEyebrow}>Documentación · Portal</div>
          <h1 className={portalStyles.heroTitle}>¿Cómo funciona tu portal?</h1>
          <p className={portalStyles.heroSub}>
            Lo más importante explicado en pocas líneas. Si igual te queda una
            duda, preguntale a D&C Advisor o hablá con tu account lead.
          </p>
        </section>

        <article className={styles.content}>
          <MarkdownRenderer content={content} shiftHeadings />
        </article>
      </main>
    </>
  );
}
