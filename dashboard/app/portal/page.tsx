"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  getCurrentProfile,
  hasSession,
  signOut,
  type Profile,
} from "@/lib/supabase/auth";
import { getClient, getObjectives, getEvents } from "@/lib/storage";
import { listPhaseReports } from "@/lib/phases";
import { getSupabase } from "@/lib/supabase/client";
import { getDownloadUrl } from "@/lib/upload";
import Lockup from "@/components/Lockup";
import PortalOnboardingTour from "@/components/PortalOnboardingTour";
import PortalHeader from "@/components/PortalHeader";
import ConsultorChatPanel from "@/components/ConsultorChatPanel";
import ConsultorHistoryPanel from "@/components/ConsultorHistoryPanel";
import PhaseRoadmap from "@/components/PhaseRoadmap";
import ReportCommentsDrawer from "@/components/ReportCommentsDrawer";
import LookerStudioCard from "@/components/LookerStudioCard";
import TeamCard from "@/components/TeamCard";
import SectorTrendsCard from "@/components/SectorTrendsCard";
import type {
  CalEvent,
  Client,
  ClientObjectives,
  ContentPost,
  OnboardingFile,
  PhaseReport,
} from "@/lib/types";
import styles from "./portal.module.css";

const IMAGE_EXTS = ["png", "jpg", "jpeg", "svg", "webp", "avif"];

function pickLogoFile(client: Client): OnboardingFile | string | null {
  const branding = client.onboarding?.brandingFiles ?? [];
  for (const f of branding) {
    const name = typeof f === "string" ? f : f.name;
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    if (IMAGE_EXTS.includes(ext)) return f;
  }
  return null;
}

function getPathFromFile(f: OnboardingFile | string): string {
  return typeof f === "string" ? f : f.path;
}

export default function PortalPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [objectives, setObjectives] = useState<ClientObjectives | null>(null);
  const [reports, setReports] = useState<PhaseReport[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [content, setContent] = useState<ContentPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [showTour, setShowTour] = useState(false);
  const [commentsDrawer, setCommentsDrawer] = useState<{
    open: boolean;
    reportId: string | null;
    reportLabel: string;
  }>({ open: false, reportId: null, reportLabel: "" });
  // null = todavía no hay conversación (se crea lazy al primer mensaje del user).
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  // Tick que se incrementa después de cada actividad → fuerza al HistoryPanel a refetch.
  const [historyTick, setHistoryTick] = useState(0);

  useEffect(() => {
    if (!client) return;
    const file = pickLogoFile(client);
    if (!file) return;
    getDownloadUrl(getPathFromFile(file)).then((u) => {
      if (u) setLogoUrl(u);
    });
  }, [client]);

  // Cargar la conversación más reciente del cliente al entrar al portal.
  // Si no tiene ninguna, queda null → la conversación se crea lazy al primer mensaje.
  useEffect(() => {
    if (!profile?.client_id) return;
    let active = true;
    (async () => {
      try {
        const supabase = getSupabase();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch("/api/portal/consultant/conversations", {
          method: "GET",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = (await res.json().catch(() => ({}))) as {
          conversations?: Array<{ id: string }>;
        };
        if (!active) return;
        const latest = data.conversations?.[0];
        if (latest?.id) setCurrentConversationId(latest.id);
      } catch (err) {
        console.warn("portal: latest conversation load falló:", err);
      }
    })();
    return () => {
      active = false;
    };
  }, [profile?.client_id]);

  async function handleNewConversation() {
    try {
      const supabase = getSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/portal/consultant/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string };
      if (data.id) {
        setCurrentConversationId(data.id);
        setHistoryTick((t) => t + 1);
      }
    } catch (err) {
      console.error("nueva conversación falló:", err);
    }
  }

  useEffect(() => {
    hasSession().then(async (has) => {
      if (!has) {
        router.replace("/");
        return;
      }
      const p = await getCurrentProfile();
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

      if (p.permissions?.tour_seen !== true) {
        setShowTour(true);
      }

      const supabase = getSupabase();
      const [c, o, ev, rs, ct] = await Promise.all([
        getClient(p.client_id),
        getObjectives(p.client_id),
        getEvents(),
        listPhaseReports(p.client_id),
        supabase
          .from("content_posts")
          .select("*")
          .eq("client_id", p.client_id)
          .eq("status", "published")
          .order("date", { ascending: false })
          .limit(8)
          .then(({ data }) => (data ?? []) as ContentPost[]),
      ]);

      setClient(c ?? null);
      setObjectives(o ?? null);
      setEvents(
        ev.filter((e) => e.clientId === p.client_id || e.clientLabel === c?.name),
      );
      // Reportes: TODOS los estados — el PhaseRoadmap necesita ver
      // approved/draft/review/pending para pintar la barra de fases.
      // El detalle (incluido botón "Ver PDF") vive ahora dentro del modal
      // del PhaseRoadmap, no en una sección suelta debajo.
      setReports(rs);
      setContent(ct);
      setLoading(false);
    });
  }, [router]);

  if (loading) return null;

  // Estado degradado: cliente sin client_id
  if (profile && !profile.client_id) {
    return (
      <main className={styles.errorWrap}>
        <div className={styles.errorBox}>
          <Lockup size="md" />
          <h2 className={styles.errorTitle}>Tu cuenta no está conectada a una empresa</h2>
          <p className={styles.errorBody}>
            Avisale a tu account lead en Dearmas & Costantini para que
            configure tu acceso. Tu cuenta existe pero falta vincularla
            a tu empresa.
          </p>
          <button
            className={styles.errorBtn}
            onClick={() => signOut().then(() => router.replace("/"))}
          >
            Cerrar sesión
          </button>
        </div>
      </main>
    );
  }

  if (!client || !profile) return null;

  const monthIso = new Date().toISOString().slice(0, 7);
  const upcomingEvents = events
    .filter((e) => new Date(e.date + "T" + (e.time || "00:00")) >= new Date())
    .slice(0, 3);

  return (
    <>
      {showTour && (
        <PortalOnboardingTour
          profile={profile}
          onClose={() => setShowTour(false)}
        />
      )}

      <PortalHeader
        client={client}
        profile={profile}
        logoUrl={logoUrl}
        eyebrow={`Portal · ${client.name}`}
      />

      <main className={styles.main}>
        {/* HERO: condensado para dejar espacio al chat */}
        <section className={styles.heroBlock}>
          <div className={styles.heroLeft}>
            <div className={styles.heroEyebrow}>Tu cuenta · {monthIso}</div>
            <h1 className={styles.heroTitle}>Hola, {profile.name.split(" ")[0]}</h1>
            <div className={styles.heroSub}>
              {client.name} · {client.sector}
            </div>
          </div>
          <nav className={styles.heroLinks} aria-label="Navegación principal del portal">
            <Link href="/portal/faq" className={styles.heroLink}>
              ¿Cómo funciona el portal? →
            </Link>
          </nav>
        </section>

        {/* ROADMAP DE FASES — visible siempre, da contexto del progreso */}
        <PhaseRoadmap
          client={client}
          reports={reports}
          onCommentReport={(reportId, reportLabel) =>
            setCommentsDrawer({ open: true, reportId, reportLabel })
          }
        />

        {/* CHAT-FIRST LAYOUT */}
        <section className={styles.chatLayout}>
          <div className={styles.chatColumn}>
            <ConsultorChatPanel
              clientName={client.name}
              showExpandButton
              variant="embedded"
              conversationId={currentConversationId}
              onConversationCreated={(id) => {
                setCurrentConversationId(id);
                setHistoryTick((t) => t + 1);
              }}
              onActivity={() => setHistoryTick((t) => t + 1)}
            />
            <ConsultorHistoryPanel
              currentConversationId={currentConversationId}
              refreshTick={historyTick}
              onSelect={(id) => setCurrentConversationId(id)}
              onNewConversation={handleNewConversation}
            />
          </div>

          <aside className={styles.sidebar}>
            {/* Dashboard de métricas externo — Looker Studio. Los KPIs en
                vivo y la evolución viven allá; el portal solo redirige. */}
            <LookerStudioCard url={client.looker_studio_url ?? null} />

            {/* Objetivos compactos */}
            {objectives && objectives.items.length > 0 && (
              <div className={styles.sidebarBlock}>
                <div className={styles.sidebarLabel}>
                  Objetivos · {objectives.period}
                </div>
                <div className={styles.objectives}>
                  {objectives.items.slice(0, 4).map((o) => (
                    <div key={o.id} className={styles.objCompact}>
                      <div className={styles.objCompactHead}>
                        <span className={styles.objCompactName}>{o.name}</span>
                        <span className={styles.objCompactPct}>{o.pct}%</span>
                      </div>
                      <div className={styles.objCompactBar}>
                        <div
                          className={styles.objCompactFill}
                          style={{
                            width: `${Math.max(0, Math.min(o.pct, 100))}%`,
                            background:
                              o.pct >= 85
                                ? "var(--green-ok)"
                                : o.pct >= 60
                                  ? "var(--sand)"
                                  : "var(--yellow-warn)",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Próximas reuniones — toda la card linkea al calendario */}
            <Link
              href="/portal/calendario"
              className={`${styles.sidebarBlock} ${styles.sidebarLink}`}
            >
              <div className={styles.sidebarLinkHead}>
                <span className={styles.sidebarLabel}>Próximas reuniones</span>
                <span className={styles.sidebarLinkArrow}>Ver calendario →</span>
              </div>
              {upcomingEvents.length > 0 ? (
                <div className={styles.eventList}>
                  {upcomingEvents.map((e) => (
                    <div key={e.id} className={styles.eventCompact}>
                      <div className={styles.eventDate}>
                        {new Date(e.date).toLocaleDateString("es-AR", {
                          day: "2-digit",
                          month: "short",
                        })}
                        {e.time && (
                          <span className={styles.eventTime}> · {e.time}</span>
                        )}
                      </div>
                      <div className={styles.eventTitle}>{e.title}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.eventEmpty}>
                  Sin reuniones próximas. Conectá tu Outlook desde el
                  calendario para verlas acá.
                </div>
              )}
            </Link>

            {/* Tu equipo D&C — account leads asignados + contacto directo */}
            <TeamCard />

            {/* Tendencias del sector — teaser que linkea a /portal/tendencias */}
            <SectorTrendsCard />

            {/* Estado de pago: ahora vive en el PortalHeader como CTA con
                semáforo (verde / ámbar / rojo según fecha del mes). */}

            {/* CTA Solicitudes — generar nueva oferta o acción */}
            <Link href="/portal/solicitudes" className={styles.requestCta}>
              <div className={styles.requestCtaEyebrow}>Cargar solicitud</div>
              <div className={styles.requestCtaTitle}>
                ¿Tenés una promo o idea para ejecutar?
              </div>
              <div className={styles.requestCtaBody}>
                Cargá ofertas comerciales (descuentos, promos) o pedidos
                libres y el equipo los toma desde acá.
              </div>
              <div className={styles.requestCtaArrow}>+ Nueva solicitud →</div>
            </Link>

            {/* CTA Bóveda — el cliente guarda sus credenciales cifradas */}
            <Link href="/portal/credenciales" className={styles.requestCta}>
              <div className={styles.requestCtaEyebrow}>
                Bóveda de credenciales
              </div>
              <div className={styles.requestCtaTitle}>
                Guardá tus contraseñas de forma segura
              </div>
              <div className={styles.requestCtaBody}>
                Accesos a tu web, redes, hosting y más. Quedan cifrados con tu
                frase clave — el equipo los usa sin que viajen por WhatsApp.
              </div>
              <div className={styles.requestCtaArrow}>Abrir bóveda →</div>
            </Link>
          </aside>
        </section>

        {/* La sección "Reportes aprobados" se eliminó del home: el resumen
            ejecutivo + botón "Ver PDF" + "Comentar" viven ahora dentro del
            modal de cada fase en el PhaseRoadmap (más arriba). */}

        <ReportCommentsDrawer
          open={commentsDrawer.open}
          reportId={commentsDrawer.reportId}
          reportLabel={commentsDrawer.reportLabel}
          onClose={() =>
            setCommentsDrawer({ open: false, reportId: null, reportLabel: "" })
          }
        />


        {content.length > 0 && (
          <section className={styles.detailSection}>
            <div className={styles.sectionLabel}>Contenido publicado</div>
            <div className={styles.contentGrid}>
              {content.map((c) => (
                <div key={c.id} className={styles.contentCard}>
                  <div className={styles.contentHead}>
                    <div className={styles.contentNet}>
                      {c.network.toUpperCase()}
                    </div>
                    <div className={styles.contentDate}>
                      {new Date(c.date).toLocaleDateString("es-AR", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </div>
                  </div>
                  <div className={styles.contentFormat}>{c.format}</div>
                  <div className={styles.contentBrief}>{c.brief}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className={styles.footer}>
          <div className={styles.footerLeft}>
            <Lockup size="sm" />
            <div className={styles.footerNote}>
              Business Growth Partners · LATAM
            </div>
          </div>
          <div className={styles.footerRight}>
            ¿Necesitás algo? Hablá con tu account lead o pediselo a D&C Advisor.
          </div>
        </footer>
      </main>
    </>
  );
}
