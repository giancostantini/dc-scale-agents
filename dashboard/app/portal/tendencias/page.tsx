"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getCurrentProfile,
  hasSession,
  type Profile,
} from "@/lib/supabase/auth";
import { getClient } from "@/lib/storage";
import { getSupabase } from "@/lib/supabase/client";
import PortalHeader from "@/components/PortalHeader";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import type { Client } from "@/lib/types";
import portalStyles from "../portal.module.css";

export default function PortalTendenciasPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [bodyMd, setBodyMd] = useState<string | null>(null);
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
      try {
        const supabase = getSupabase();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session) {
          const res = await fetch("/api/portal/trends", {
            headers: { authorization: `Bearer ${session.access_token}` },
          });
          if (res.ok) {
            const data = (await res.json()) as {
              generatedAt: string | null;
              bodyMd: string | null;
            };
            if (active) {
              setGeneratedAt(data.generatedAt ?? null);
              setBodyMd(data.bodyMd ?? null);
            }
          }
        }
      } catch {
        // silencioso — la vista muestra el estado vacío
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
      <PortalHeader client={client} profile={profile} eyebrow="Tendencias" showBack />

      <main className={portalStyles.wrap}>
        <section className={portalStyles.heroBlock}>
          <div className={portalStyles.heroLeft}>
            <div className={portalStyles.heroEyebrow}>Tu nicho</div>
            <h1 className={portalStyles.heroTitle}>Tendencias del sector</h1>
            <p className={portalStyles.heroSub}>
              Lo que está funcionando ahora en tu nicho — contenido que se
              vuelve viral, qué trae tráfico y qué convierte — con la fuente de
              cada dato.
              {generatedAt ? ` Última actualización: ${generatedAt}.` : ""}
            </p>
          </div>
        </section>

        {bodyMd ? (
          <MarkdownRenderer content={bodyMd} />
        ) : (
          <p
            style={{
              fontSize: 13.5,
              color: "var(--text-muted)",
              fontStyle: "italic",
            }}
          >
            Todavía no hay tendencias cargadas. El agente las actualiza cada
            semana.
          </p>
        )}
      </main>
    </>
  );
}
