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
import {
  getClient,
  getObjectives,
  getEvents,
  getPayments,
} from "@/lib/storage";
import { listPhaseReports, extractExecutiveSummary } from "@/lib/phases";
import { getSupabase } from "@/lib/supabase/client";
import { getDownloadUrl } from "@/lib/upload";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import Lockup from "@/components/Lockup";
import PortalOnboardingTour from "@/components/PortalOnboardingTour";
import PortalHeader from "@/components/PortalHeader";
import ConsultorChatPanel from "@/components/ConsultorChatPanel";
import PhaseRoadmap from "@/components/PhaseRoadmap";
import ReportCommentsDrawer from "@/components/ReportCommentsDrawer";
import MonthSummaryBlock from "@/components/MonthSummaryBlock";
import KpiTrendChart from "@/components/KpiTrendChart";
import type {
  CalEvent,
  Client,
  ClientObjectives,
  ContentPost,
  InvoicePayment,
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

const PHASE_LABELS: Record<string, string> = {
  diagnostico: "Diagnóstico",
  estrategia: "Estrategia",
  setup: "Setup",
  lanzamiento: "Lanzamiento",
};

export default function PortalPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [objectives, setObjectives] = useState<ClientObjectives | null>(null);
  const [reports, setReports] = useState<PhaseReport[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [content, setContent] = useState<ContentPost[]>([]);
  const [payments, setPayments] = useState<InvoicePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [showTour, setShowTour] = useState(false);
  const [commentsDrawer, setCommentsDrawer] = useState<{
    open: boolean;
    reportId: string | null;
    reportLabel: string;
  }>({ open: false, reportId: null, reportLabel: "" });

  useEffect(() => {
    if (!client) return;
    const file = pickLogoFile(client);
    if (!file) return;
    getDownloadUrl(getPathFromFile(file)).then((u) => {
      if (u) setLogoUrl(u);
    });
  }, [client]);

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
      const [c, o, ev, pay, rs, ct] = await Promise.all([
        getClient(p.client_id),
        getObjectives(p.client_id),
        getEvents(),
        getPayments(),
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
      setPayments(pay.filter((pp) => pp.clientId === p.client_id));
      // Reportes: TODOS los estados — el PhaseRoadmap necesita ver
      // approved/draft/review/pending para pintar la barra de fases.
      // Para la sección "Reportes aprobados" más abajo filtramos a approved.
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
            Avisale a tu account lead en Dearmas Costantini para que
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

  const k = client.kpis;
  const monthIso = new Date().toISOString().slice(0, 7);
  const thisMonthPayment = payments.find((p) => p.month === monthIso);
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
          <div className={styles.heroEyebrow}>Tu cuenta · {monthIso}</div>
          <h1 className={styles.heroTitle}>Hola, {profile.name.split(" ")[0]}</h1>
          <div className={styles.heroSub}>
            {client.name} · {client.sector}
          </div>
        </section>

        {/* ROADMAP DE FASES — visible siempre, da contexto del progreso */}
        <PhaseRoadmap client={client} reports={reports} />

        {/* "Qué hicimos este mes" — agregación del trabajo del equipo */}
        <MonthSummaryBlock />

        {/* CHAT-FIRST LAYOUT */}
        <section className={styles.chatLayout}>
          <div className={styles.chatColumn}>
            <ConsultorChatPanel
              clientName={client.name}
              showExpandButton
              variant="embedded"
            />
          </div>

          <aside className={styles.sidebar}>
            {/* KPIs compactos */}
            {client.type === "gp" && k && (
              <div className={styles.sidebarBlock}>
                <div className={styles.sidebarLabel}>KPIs del mes</div>
                <div className={styles.compactKpiGrid}>
                  <CompactKPI label="ROAS" value={k.roas || "—"} />
                  <CompactKPI label="Leads" value={String(k.leads ?? "—")} />
                  <CompactKPI label="CAC" value={k.cac || "—"} />
                  <CompactKPI label="Conv" value={k.conv || "—"} />
                </div>
              </div>
            )}

            {/* Evolución histórica de KPIs (últimos 12 meses) */}
            {client.type === "gp" && <KpiTrendChart />}

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

            {/* Próximas reuniones */}
            {upcomingEvents.length > 0 && (
              <div className={styles.sidebarBlock}>
                <div className={styles.sidebarLabel}>Próximas reuniones</div>
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
              </div>
            )}

            {/* Estado de pagos compacto */}
            <div className={styles.sidebarBlock}>
              <div className={styles.sidebarLabel}>Tu pago de {monthIso}</div>
              <div className={styles.paymentCompact}>
                <div className={styles.paymentFee}>
                  US$ {client.fee.toLocaleString()}
                </div>
                <div
                  className={styles.paymentStatus}
                  style={{
                    color:
                      thisMonthPayment?.status === "paid"
                        ? "var(--green-ok)"
                        : thisMonthPayment?.status === "late"
                          ? "var(--red-warn)"
                          : "var(--sand-dark)",
                  }}
                >
                  {thisMonthPayment?.status === "paid"
                    ? "✓ Pagado"
                    : thisMonthPayment?.status === "late"
                      ? "⚠ Atrasado"
                      : "○ Pendiente"}
                </div>
              </div>
            </div>

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
          </aside>
        </section>

        {/* DETALLE SCROLLEABLE */}

        {reports.filter((r) => r.status === "approved").length > 0 && (
          <section className={styles.detailSection}>
            <div className={styles.sectionLabel}>Reportes aprobados</div>
            <div className={styles.panel}>
              {reports
                .filter((r) => r.status === "approved")
                .map((r) => {
                  const summary = extractExecutiveSummary(r.content_md);
                  const phaseLabel = PHASE_LABELS[r.phase] ?? r.phase;
                  return (
                    <div key={r.id} className={styles.reportRow}>
                      <div className={styles.reportHead}>
                        <div className={styles.reportTitle}>{phaseLabel}</div>
                        <div className={styles.reportHeadActions}>
                          <span className={styles.reportDate}>
                            {r.approved_at &&
                              new Date(r.approved_at).toLocaleDateString(
                                "es-AR",
                                {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                },
                              )}
                          </span>
                          <button
                            type="button"
                            className={styles.reportCommentBtn}
                            onClick={() =>
                              setCommentsDrawer({
                                open: true,
                                reportId: r.id,
                                reportLabel: phaseLabel,
                              })
                            }
                          >
                            Comentar
                          </button>
                        </div>
                      </div>
                      {summary ? (
                        <MarkdownRenderer content={summary} shiftHeadings />
                      ) : (
                        <div className={styles.muted}>
                          Sin resumen disponible.
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </section>
        )}

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
            <div className={styles.footerLinks}>
              <Link href="/portal/calendario" className={styles.footerLink}>
                Calendario →
              </Link>
              <Link href="/portal/faq" className={styles.footerLink}>
                ¿Cómo funciona el portal? →
              </Link>
            </div>
          </div>
        </footer>
      </main>
    </>
  );
}

function CompactKPI({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.compactKpiCell}>
      <div className={styles.compactKpiLabel}>{label}</div>
      <div className={styles.compactKpiValue}>{value}</div>
    </div>
  );
}
