"use client";

/**
 * Hub — home del sistema (director + team).
 *
 * Layout nuevo (mockup contable):
 *   Hero: saludo + fecha + 2 stat cards (clientes / actividades pendientes).
 *         Lateral derecho: Actividad reciente.
 *
 *   Cliente Principal: card destacada con el cliente más activo (logo,
 *   nombre, CTA "Ver perfil completo").
 *
 *   Resumen General: 4 KPIs (Prospectos, Conversión, Valor estimado,
 *   Ciclo promedio) — solo si el viewer tiene acceso al pipeline.
 *
 *   Tareas Pendientes (sidebar derecha): top 3 + CTA "Nueva tarea".
 *
 *   Pipeline de Ventas: kanban compacto — solo si tiene acceso.
 *
 *   Tu Desempeño: gauge circular % basado en cumplimiento de tareas
 *   completadas a tiempo en el mes corriente.
 *
 * El cliente del portal (role='client') se redirige a /portal.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import {
  getClients,
  getAllTasks,
} from "@/lib/storage";
import { listAllAssignments } from "@/lib/team";
import {
  getCurrentProfile,
  hasSession,
  hasPipelineAccess,
  type Profile,
} from "@/lib/supabase/auth";
import { getSupabase } from "@/lib/supabase/client";
import type { Client, ClientRequest, DevTask, Lead, PipelineStage } from "@/lib/types";

const STAGE_LABEL: Record<PipelineStage, string> = {
  prospecto: "Nuevo Prospecto",
  contacto: "Contactado",
  propuesta: "Propuesta Enviada",
  negociacion: "Negociación",
  cerrado: "Ganado",
};
const STAGE_ORDER: PipelineStage[] = [
  "prospecto",
  "contacto",
  "propuesta",
  "negociacion",
  "cerrado",
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

function spanishDate(): string {
  return new Date().toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

interface Activity {
  id: string;
  kind: "task_done" | "request" | "client_created" | "lead_new";
  title: string;
  subtitle: string;
  when: string;
  iconBg: string;
  initials: string;
}

export default function HubPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [requests, setRequests] = useState<ClientRequest[]>([]);
  const [tasks, setTasks] = useState<DevTask[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);

  const refresh = useCallback(async (p: Profile) => {
    const supabase = getSupabase();
    const [cls, allTasks, asg] = await Promise.all([
      getClients(),
      getAllTasks(),
      listAllAssignments(),
    ]);
    setClients(cls);
    // Si es team, filtramos tareas y solicitudes a los clientes que tiene asignados
    const isDir = p.role === "director";
    const mineClientIds = isDir
      ? new Set(cls.map((c) => c.id))
      : new Set(asg.filter((a) => a.user_id === p.id).map((a) => a.client_id));
    setTasks(allTasks.filter((t) => mineClientIds.has(t.clientId)));
    // Solicitudes activas
    const { data: reqs } = await supabase
      .from("client_requests")
      .select("*")
      .in("status", ["pending", "reviewing", "in_progress"])
      .order("submitted_at", { ascending: false })
      .limit(30);
    setRequests(
      ((reqs ?? []) as ClientRequest[]).filter((r) =>
        mineClientIds.has(r.client_id),
      ),
    );
    // Pipeline (solo si tiene acceso)
    if (hasPipelineAccess(p)) {
      const { data: ls } = await supabase
        .from("leads")
        .select("*")
        .is("lost_at", null)
        .order("created_at", { ascending: false });
      setLeads(((ls ?? []) as unknown as Lead[]) ?? []);
    }
  }, []);

  useEffect(() => {
    hasSession().then(async (has) => {
      if (!has) {
        router.replace("/");
        return;
      }
      const p = await getCurrentProfile();
      if (p?.role === "client") {
        router.replace("/portal");
        return;
      }
      setProfile(p);
      setAuthChecked(true);
      if (p) refresh(p);
    });
  }, [router, refresh]);

  // ============ Derived ============
  const activeClients = useMemo(
    () => clients.filter((c) => c.status === "active"),
    [clients],
  );

  // Pending activities = solicitudes pending del viewer + tareas pending/active del viewer
  const pendingActivities = useMemo(() => {
    const pendingReqs = requests.length;
    const pendingTasks = tasks.filter(
      (t) => t.status !== "done",
    ).length;
    return pendingReqs + pendingTasks;
  }, [requests, tasks]);

  // Recent activity (mix de eventos): últimos 5
  const recentActivity: Activity[] = useMemo(() => {
    const acts: Activity[] = [];
    // Solicitudes recientes
    for (const r of requests.slice(0, 5)) {
      const c = clients.find((cl) => cl.id === r.client_id);
      acts.push({
        id: `req-${r.id}`,
        kind: "request",
        title: `${c?.name ?? r.client_id}`,
        subtitle: r.title,
        when: timeAgo(r.submitted_at),
        iconBg: "#1E3A8A",
        initials: c?.initials ?? "??",
      });
    }
    // Clientes recientes
    const recentClients = [...clients]
      .filter((c) => c.created_at)
      .sort((a, b) =>
        (b.created_at ?? "").localeCompare(a.created_at ?? ""),
      )
      .slice(0, 3);
    for (const c of recentClients) {
      acts.push({
        id: `cli-${c.id}`,
        kind: "client_created",
        title: c.name,
        subtitle: "Cliente activo",
        when: timeAgo(c.created_at ?? new Date().toISOString()),
        iconBg: "#3B82F6",
        initials: c.initials,
      });
    }
    // Tareas done recientes
    const doneTasks = tasks
      .filter((t) => t.status === "done")
      .slice(0, 3);
    for (const t of doneTasks) {
      const c = clients.find((cl) => cl.id === t.clientId);
      acts.push({
        id: `task-${t.id}`,
        kind: "task_done",
        title: c?.name ?? t.clientId,
        subtitle: `✓ ${t.title}`,
        when: timeAgo(t.createdAt),
        iconBg: "#10B981",
        initials: c?.initials ?? "??",
      });
    }
    return acts.slice(0, 6);
  }, [requests, clients, tasks]);

  // Performance % — basado en tareas completadas EN TÉRMINO durante el mes
  const performance = useMemo(() => {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthlyDone = tasks.filter(
      (t) =>
        t.status === "done" &&
        new Date(t.createdAt) >= monthStart,
    );
    if (monthlyDone.length === 0) {
      return { score: null as number | null, total: 0, onTime: 0 };
    }
    // "En término" = done y (no dueDate O createdAt + estimated <= now O dueDate >= now)
    // Sin info de when-was-it-done, usamos: si tiene dueDate, comparamos contra hoy.
    const onTime = monthlyDone.filter((t) => {
      if (!t.dueDate) return true; // sin fecha límite → contamos como ok
      return new Date(t.dueDate).getTime() >= new Date(t.createdAt).getTime();
    }).length;
    const score = Math.round((onTime / monthlyDone.length) * 100);
    return { score, total: monthlyDone.length, onTime };
  }, [tasks]);

  const pendingTasksList = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return tasks
      .filter((t) => t.status !== "done")
      .sort((a, b) => {
        const aOverdue = (a.dueDate ?? "9999") < today;
        const bOverdue = (b.dueDate ?? "9999") < today;
        if (aOverdue && !bOverdue) return -1;
        if (bOverdue && !aOverdue) return 1;
        return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
      })
      .slice(0, 4);
  }, [tasks]);

  if (!authChecked || !profile) return null;
  const userFirstName = profile.name.split(" ")[0];

  return (
    <>
      <Topbar showPrimary={false} />
      <main
        style={{
          padding: "32px 40px 80px",
          maxWidth: 1700,
          margin: "0 auto",
          background: "var(--ivory)",
          minHeight: "calc(100vh - 64px)",
        }}
      >
        {/* ============ HERO + ACTIVIDAD RECIENTE ============ */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 340px",
            gap: 20,
            marginBottom: 24,
          }}
        >
          {/* Hero */}
          <div
            style={{
              background: "var(--deep-green)",
              color: "var(--off-white)",
              padding: "32px 36px",
              borderRadius: "var(--r-lg)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--sand)",
                fontWeight: 700,
                marginBottom: 12,
              }}
            >
              {spanishDate()}
            </div>
            <h1
              style={{
                fontSize: 38,
                fontWeight: 800,
                letterSpacing: "-0.025em",
                margin: 0,
                color: "var(--white)",
                marginBottom: 10,
              }}
            >
              ¡{greeting()}, {userFirstName}!
            </h1>
            <p
              style={{
                fontSize: 14,
                color: "rgba(232,228,220,0.7)",
                margin: 0,
                marginBottom: 24,
                maxWidth: 480,
              }}
            >
              Este es el resumen de tu actividad y el estado de tus
              clientes.
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <HeroStat
                value={activeClients.length}
                label={
                  activeClients.length === 1
                    ? "Cliente activo"
                    : "Clientes activos"
                }
              />
              <HeroStat
                value={pendingActivities}
                label={
                  pendingActivities === 1
                    ? "Actividad pendiente"
                    : "Actividades pendientes"
                }
              />
            </div>
          </div>

          {/* Actividad reciente */}
          <div
            style={{
              background: "var(--white)",
              border: "1px solid var(--hairline)",
              borderRadius: "var(--r-lg)",
              padding: "20px 22px",
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--sand-dark)",
                fontWeight: 700,
                marginBottom: 14,
              }}
            >
              Actividad reciente
            </div>
            {recentActivity.length === 0 ? (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  fontStyle: "italic",
                  padding: "20px 0",
                }}
              >
                Sin actividad reciente.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {recentActivity.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      paddingBottom: 10,
                      borderBottom: "1px solid var(--hairline)",
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: a.iconBg,
                        color: "white",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 10,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {a.initials}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--deep-green)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {a.title}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text-muted)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {a.subtitle}
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--text-muted)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {a.when}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ============ MIS CLIENTES (grid con logos) ============ */}
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 14,
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--sand-dark)",
                fontWeight: 700,
              }}
            >
              {profile.role === "director"
                ? `Todos los clientes (${clients.length})`
                : `Mis clientes (${clients.length})`}
            </div>
          </div>
          {clients.length === 0 ? (
            <div
              style={{
                background: "var(--white)",
                border: "1px dashed var(--hairline)",
                borderRadius: "var(--r-lg)",
                padding: 40,
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: 13,
              }}
            >
              {profile.role === "director"
                ? "Todavía no hay clientes. Creá el primero desde Finanzas → Clientes Activos."
                : "Todavía no tenés clientes asignados. Cuando el director te asigne uno, va a aparecer acá."}
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fill, minmax(190px, 1fr))",
                gap: 14,
              }}
            >
              {clients.map((c) => (
                <Link
                  key={c.id}
                  href={`/cliente/${c.id}`}
                  style={{
                    background: "var(--white)",
                    border: "1px solid var(--hairline)",
                    borderRadius: "var(--r-md)",
                    padding: 18,
                    textDecoration: "none",
                    color: "inherit",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    textAlign: "center",
                    transition: "transform 0.15s, box-shadow 0.15s",
                  }}
                >
                  <ClientLogo client={c} size={70} />
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--deep-green)",
                      marginTop: 12,
                      marginBottom: 4,
                    }}
                  >
                    {c.name}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                    }}
                  >
                    {c.sector}
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      padding: "2px 8px",
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      borderRadius: 999,
                      background:
                        c.status === "active"
                          ? "var(--green-tint)"
                          : c.status === "onboarding"
                            ? "rgba(196,168,130,0.18)"
                            : "rgba(10,26,12,0.06)",
                      color:
                        c.status === "active"
                          ? "var(--green-ok)"
                          : c.status === "onboarding"
                            ? "var(--sand-dark)"
                            : "var(--text-muted)",
                    }}
                  >
                    {c.status === "active"
                      ? "● Activo"
                      : c.status === "onboarding"
                        ? "Onboarding"
                        : "Dev"}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* ============ TAREAS PENDIENTES + DESEMPEÑO ============ */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 340px",
            gap: 20,
            marginBottom: 24,
          }}
        >
          {/* Tareas pendientes */}
          <div
            style={{
              background: "var(--white)",
              border: "1px solid var(--hairline)",
              borderRadius: "var(--r-lg)",
              padding: "20px 24px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "var(--sand-dark)",
                  fontWeight: 700,
                }}
              >
                Tareas pendientes
              </div>
              <Link
                href="/tareas"
                style={{
                  fontSize: 11,
                  color: "var(--deep-green)",
                  textDecoration: "none",
                  borderBottom: "1px solid var(--sand)",
                  paddingBottom: 1,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                }}
              >
                Ver todas
              </Link>
            </div>
            {pendingTasksList.length === 0 ? (
              <div
                style={{
                  padding: "32px 0",
                  textAlign: "center",
                  color: "var(--text-muted)",
                  fontSize: 12,
                  fontStyle: "italic",
                }}
              >
                Todo al día. Sin tareas pendientes.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {pendingTasksList.map((t) => {
                  const c = clients.find((cl) => cl.id === t.clientId);
                  const today = new Date().toISOString().slice(0, 10);
                  const overdue = t.dueDate ? t.dueDate < today : false;
                  return (
                    <Link
                      key={t.id}
                      href={`/cliente/${t.clientId}/tareas`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 4px",
                        borderBottom: "1px solid var(--hairline)",
                        textDecoration: "none",
                        color: "inherit",
                      }}
                    >
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "50%",
                          background: "var(--ivory)",
                          color: "var(--deep-green)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 10,
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {c?.initials ?? "??"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "var(--deep-green)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {t.title}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--text-muted)",
                            marginTop: 2,
                          }}
                        >
                          {c?.name ?? t.clientId}
                          {t.assignee ? ` · ${t.assignee}` : ""}
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: overdue ? "#B91C1C" : "var(--text-muted)",
                          fontWeight: overdue ? 700 : 500,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {t.dueDate
                          ? new Date(t.dueDate).toLocaleDateString("es-AR", {
                              day: "2-digit",
                              month: "short",
                            })
                          : "Sin fecha"}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
            <div
              style={{
                marginTop: 14,
                paddingTop: 14,
                borderTop: "1px solid var(--hairline)",
                textAlign: "center",
              }}
            >
              <Link
                href="/tareas?new=true"
                style={{
                  fontSize: 12,
                  color: "var(--sand-dark)",
                  textDecoration: "none",
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                }}
              >
                + Nueva tarea
              </Link>
            </div>
          </div>

          {/* Tu desempeño */}
          <div
            style={{
              background: "var(--white)",
              border: "1px solid var(--hairline)",
              borderRadius: "var(--r-lg)",
              padding: "20px 22px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "var(--sand-dark)",
                  fontWeight: 700,
                }}
              >
                Tu desempeño
              </div>
              <span
                style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                  padding: "2px 8px",
                  background: "var(--ivory)",
                  borderRadius: 999,
                }}
              >
                Este mes
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                marginBottom: 16,
              }}
            >
              <CircularGauge value={performance.score ?? 0} />
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--deep-green)",
                  }}
                >
                  {performance.score == null
                    ? "Sin tareas completadas"
                    : performance.score >= 90
                      ? "¡Excelente trabajo!"
                      : performance.score >= 75
                        ? "Vas muy bien"
                        : performance.score >= 50
                          ? "Buen ritmo"
                          : "Hay margen para mejorar"}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    marginTop: 4,
                    lineHeight: 1.5,
                  }}
                >
                  {performance.score == null
                    ? "Completá tareas para empezar a medir tu desempeño del mes."
                    : `${performance.onTime} de ${performance.total} tareas completadas en término.`}
                </div>
              </div>
            </div>
            <div
              style={{
                fontSize: 10,
                color: "var(--text-muted)",
                letterSpacing: "0.04em",
              }}
            >
              Tareas del mes:{" "}
              <strong style={{ color: "var(--deep-green)" }}>
                {performance.onTime}
              </strong>
              /{performance.total} en término
            </div>
          </div>
        </div>

        {/* ============ PIPELINE DE VENTAS (solo con acceso) ============ */}
        {hasPipelineAccess(profile) && leads.length > 0 && (
          <div
            style={{
              background: "var(--white)",
              border: "1px solid var(--hairline)",
              borderRadius: "var(--r-lg)",
              padding: "20px 24px",
              marginBottom: 24,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "var(--sand-dark)",
                  fontWeight: 700,
                }}
              >
                Pipeline de ventas
              </div>
              <Link
                href="/pipeline"
                style={{
                  fontSize: 11,
                  color: "var(--deep-green)",
                  textDecoration: "none",
                  borderBottom: "1px solid var(--sand)",
                  paddingBottom: 1,
                  fontWeight: 600,
                }}
              >
                Abrir pipeline →
              </Link>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: 10,
              }}
            >
              {STAGE_ORDER.map((stage) => {
                const stageLeads = leads.filter((l) => l.stage === stage);
                const totalValue = stageLeads.reduce(
                  (s, l) => s + (l.value || 0),
                  0,
                );
                return (
                  <div
                    key={stage}
                    style={{
                      background: "var(--ivory)",
                      borderRadius: 8,
                      padding: 14,
                      borderTop:
                        stage === "cerrado"
                          ? "3px solid var(--green-ok)"
                          : "3px solid var(--sand)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 9,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        color: "var(--sand-dark)",
                        fontWeight: 700,
                        marginBottom: 6,
                      }}
                    >
                      {STAGE_LABEL[stage]}
                    </div>
                    <div
                      style={{
                        fontSize: 22,
                        fontWeight: 700,
                        color: "var(--deep-green)",
                        marginBottom: 4,
                      }}
                    >
                      {stageLeads.length}
                    </div>
                    {totalValue > 0 && (
                      <div
                        style={{ fontSize: 11, color: "var(--text-muted)" }}
                      >
                        {formatMoney(totalValue)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </main>
    </>
  );
}

// ============ ClientLogo ============
// Resuelve el logo del cliente con esta cascada:
//   1. client.logo_url (subido manual)
//   2. Clearbit logo API derivado del dominio de contact_email
//   3. Iniciales como fallback visual
// El <img> tiene onError → si la imagen no carga (404 de Clearbit,
// dominio inválido, CORS), se cae graceful a las iniciales sin
// romper el card.
function ClientLogo({
  client,
  size = 70,
}: {
  client: Client;
  size?: number;
}) {
  const [errored, setErrored] = useState(false);
  // Derivar dominio del contact_email (si no hay logo_url manual)
  const domain = (() => {
    if (client.logo_url) return null;
    const email = client.contact_email ?? "";
    const at = email.indexOf("@");
    if (at < 0) return null;
    const d = email.slice(at + 1).trim().toLowerCase();
    // Filtrar dominios genéricos (no tienen logo significativo)
    if (
      !d ||
      d.includes("gmail.com") ||
      d.includes("hotmail.com") ||
      d.includes("outlook.com") ||
      d.includes("yahoo.com")
    ) {
      return null;
    }
    return d;
  })();
  const src =
    client.logo_url ??
    (domain ? `https://logo.clearbit.com/${domain}` : null);
  const showImg = src && !errored;
  return (
    <div
      style={{
        width: size,
        height: size,
        background: "var(--ivory)",
        borderRadius: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--deep-green)",
        fontSize: Math.floor(size * 0.3),
        fontWeight: 800,
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={`Logo ${client.name}`}
          onError={() => setErrored(true)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            background: "var(--white)",
          }}
        />
      ) : (
        client.initials
      )}
    </div>
  );
}

// ============ Subcomponentes ============

function HeroStat({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  return (
    <div
      style={{
        background: "rgba(196,168,130,0.12)",
        padding: "14px 18px",
        borderRadius: 10,
        minWidth: 140,
      }}
    >
      <div
        style={{
          fontSize: 28,
          fontWeight: 800,
          color: "var(--white)",
          lineHeight: 1,
          marginBottom: 4,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--sand)",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function CircularGauge({ value }: { value: number }) {
  const size = 90;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const dash = (pct / 100) * c;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--ivory)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${c}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 20,
          fontWeight: 800,
          color: "var(--deep-green)",
          letterSpacing: "-0.04em",
        }}
      >
        {pct}%
      </div>
    </div>
  );
}

// ============ Helpers ============

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return mins <= 1 ? "Recién" : `Hace ${mins} min`;
  const hs = Math.floor(mins / 60);
  if (hs < 24) return `Hoy, ${new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`;
  const days = Math.floor(hs / 24);
  if (days === 1) return "Ayer";
  if (days < 7) return `Hace ${days} días`;
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$ ${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$ ${(n / 1_000).toFixed(0)}K`;
  return `$ ${Math.round(n).toLocaleString("es-AR")}`;
}
