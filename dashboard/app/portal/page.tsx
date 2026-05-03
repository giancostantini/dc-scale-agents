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
import NotificationBell from "@/components/NotificationBell";
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
      // Solo clientes acceden al portal. Director/team van al hub.
      if (p.role !== "client") {
        router.replace("/hub");
        return;
      }
      // El cliente DEBE tener client_id seteado
      if (!p.client_id) {
        setProfile(p);
        setLoading(false);
        return;
      }

      setProfile(p);

      // Mostrar tour solo la primera vez (permissions.tour_seen no seteado)
      if (p.permissions?.tour_seen !== true) {
        setShowTour(true);
      }

      // Cargamos todo en paralelo. RLS filtra automáticamente.
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
      setReports(rs.filter((r) => r.status === "approved"));
      setContent(ct);
      setLoading(false);
    });
  }, [router]);

  if (loading) return null;

  // Estado degradado: cliente sin client_id (config error del director)
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
            className={styles.btnGhost}
            onClick={() => signOut().then(() => router.replace("/"))}
          >
            Cerrar sesión
          </button>
        </div>
      </main>
    );
  }

  if (!client) return null;

  const k = client.kpis;
  const monthIso = new Date().toISOString().slice(0, 7);
  const thisMonthPayment = payments.find((p) => p.month === monthIso);
  const upcomingEvents = events
    .filter((e) => new Date(e.date + "T" + (e.time || "00:00")) >= new Date())
    .slice(0, 5);

  return (
    <>
      {showTour && profile && (
        <PortalOnboardingTour
          profile={profile}
          onClose={() => setShowTour(false)}
        />
      )}

      {/* Header propio del portal */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          {logoUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={logoUrl}
              alt={`Logo de ${client.name}`}
              style={{
                height: 32,
                width: "auto",
                objectFit: "contain",
                background: "rgba(232,228,220,0.06)",
                padding: "4px 8px",
                borderRadius: 2,
              }}
            />
          )}
          <Lockup size="sm" />
        </div>
        <div className={styles.headerCenter}>
          <div className={styles.eyebrow}>Portal · {client.name}</div>
        </div>
        <div className={styles.headerRight}>
          {/* Bell de notificaciones del cliente. La RLS filtra solo las
              suyas (to_role='client' AND auth_client_id() = client). */}
          <NotificationBell />
          {profile && (
            <button
              className={styles.userBtn}
              onClick={() => router.push("/perfil")}
              title="Mi perfil"
            >
              <div className={styles.avatar}>{profile.initials}</div>
              <div>
                <div className={styles.userName}>{profile.name}</div>
                <div className={styles.userRole}>Cliente</div>
              </div>
            </button>
          )}
          <button
            className={styles.btnGhost}
            onClick={() => signOut().then(() => router.replace("/"))}
          >
            Salir
          </button>
        </div>
      </header>

      <main className={styles.wrap}>
        {/* Saludo + nombre cliente */}
        <section className={styles.heroBlock}>
          <div className={styles.heroEyebrow}>Tu cuenta · {monthIso}</div>
          <h1 className={styles.heroTitle}>{client.name}</h1>
          <div className={styles.heroSub}>
            {client.sector} · {client.method}
          </div>
        </section>

        {/* KPIs */}
        {client.type === "gp" && k && (
          <section className={styles.section}>
            <div className={styles.sectionLabel}>KPIs del mes</div>
            <div className={styles.kpiGrid}>
              <KPI label="ROAS" value={k.roas || "—"} />
              <KPI label="Leads" value={String(k.leads ?? "—")} />
              <KPI label="CAC" value={k.cac || "—"} />
              <KPI label="Inversión" value={k.invested || "—"} />
              <KPI label="Revenue" value={k.revenue || "—"} />
              <KPI label="Conversión" value={k.conv || "—"} />
            </div>
          </section>
        )}

        {/* Objetivos */}
        {objectives && objectives.items.length > 0 && (
          <section className={styles.section}>
            <div className={styles.sectionLabel}>
              Objetivos · {objectives.period}
            </div>
            <div className={styles.panel}>
              {objectives.items.map((o) => (
                <div key={o.id} className={styles.objRow}>
                  <div className={styles.objHead}>
                    <div className={styles.objName}>{o.name}</div>
                    <div className={styles.objNum}>
                      <strong>
                        {o.now}
                        {o.unit}
                      </strong>{" "}
                      / {o.target}
                      {o.unit}
                    </div>
                  </div>
                  <div className={styles.progressBar}>
                    <div
                      className={styles.progressFill}
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
                  <div className={styles.objLabels}>
                    <span>
                      {o.pct >= 85
                        ? "On track"
                        : o.pct >= 60
                        ? "En progreso"
                        : "Atención"}
                    </span>
                    <span className={styles.objPct}>{o.pct}%</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Reportes aprobados (solo Resumen ejecutivo) */}
        {reports.length > 0 && (
          <section className={styles.section}>
            <div className={styles.sectionLabel}>
              Reportes aprobados · resumen
            </div>
            <div className={styles.panel}>
              {reports.map((r) => {
                const summary = extractExecutiveSummary(r.content_md);
                return (
                  <div key={r.id} className={styles.reportRow}>
                    <div className={styles.reportHead}>
                      <div className={styles.reportTitle}>
                        {PHASE_LABELS[r.phase] ?? r.phase}
                      </div>
                      <div className={styles.reportDate}>
                        {r.approved_at &&
                          new Date(r.approved_at).toLocaleDateString("es-AR", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                      </div>
                    </div>
                    {summary ? (
                      <MarkdownRenderer content={summary} shiftHeadings />
                    ) : (
                      <div className={styles.muted}>Sin resumen disponible.</div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Próximas reuniones */}
        {upcomingEvents.length > 0 && (
          <section className={styles.section}>
            <div className={styles.sectionLabel}>Próximas reuniones</div>
            <div className={styles.panel}>
              {upcomingEvents.map((e) => (
                <div key={e.id} className={styles.eventRow}>
                  <div className={styles.eventDate}>
                    {new Date(e.date).toLocaleDateString("es-AR", {
                      day: "2-digit",
                      month: "short",
                    })}
                    <div className={styles.eventTime}>{e.time}</div>
                  </div>
                  <div className={styles.eventInfo}>
                    <div className={styles.eventTitle}>{e.title}</div>
                    {e.participants && (
                      <div className={styles.eventParticipants}>
                        {e.participants}
                      </div>
                    )}
                  </div>
                  {e.meetLink && (
                    <a
                      href={
                        e.meetLink.startsWith("http")
                          ? e.meetLink
                          : `https://${e.meetLink}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.btnGhost}
                    >
                      Meet ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Contenido publicado este mes */}
        {content.length > 0 && (
          <section className={styles.section}>
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

        {/* Pagos */}
        <section className={styles.section}>
          <div className={styles.sectionLabel}>Estado de pagos</div>
          <div className={styles.panel}>
            <div className={styles.paymentRow}>
              <div>
                <div className={styles.paymentMonth}>
                  {monthIso} · este mes
                </div>
                <div className={styles.paymentMeta}>
                  Fee mensual: US$ {client.fee.toLocaleString()}
                </div>
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
        </section>

        {/* CTAs · Consultor + Solicitudes (placeholders por ahora) */}
        <section className={styles.section}>
          <div className={styles.ctaGrid}>
            <Link href="/portal/consultor" className={styles.ctaCard}>
              <div className={styles.ctaIcon}>✨</div>
              <div className={styles.ctaTitle}>Consultor IA</div>
              <div className={styles.ctaDesc}>
                Preguntale al consultor cómo va la cuenta, qué resultados
                estamos viendo o pedile un reporte específico.
              </div>
              <div className={styles.ctaArrow}>Abrir →</div>
            </Link>
            <Link href="/portal/solicitudes" className={styles.ctaCard}>
              <div className={styles.ctaIcon}>◎</div>
              <div className={styles.ctaTitle}>Solicitudes</div>
              <div className={styles.ctaDesc}>
                Cargá ofertas comerciales (promos, descuentos) o acciones
                que querés que ejecutemos.
              </div>
              <div className={styles.ctaArrow}>Abrir →</div>
            </Link>
          </div>
        </section>

        <footer className={styles.footer}>
          <div className={styles.footerLeft}>
            <Lockup size="sm" />
            <div className={styles.footerNote}>
              Business Growth Partners · LATAM
            </div>
          </div>
          <div className={styles.footerRight}>
            ¿Necesitás algo? Hablá con tu account lead o usá el consultor IA.
          </div>
        </footer>
      </main>
    </>
  );
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.kpiCell}>
      <div className={styles.kpiLabel}>{label}</div>
      <div className={styles.kpiValue}>{value}</div>
    </div>
  );
}
