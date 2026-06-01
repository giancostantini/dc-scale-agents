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
  // Total de clientes del viewer (director ve todos; team ve los
  // asignados). Sin filtro por status — un cliente en "dev" o
  // "onboarding" también cuenta como cliente real.
  const totalClients = clients.length;

  // Tareas pendientes del equipo (todas las que están sin completar
  // en el alcance del viewer). Director ve las de todos los clientes,
  // team las de sus clientes asignados.
  const pendingTeamTasks = useMemo(
    () => tasks.filter((t) => t.status !== "done").length,
    [tasks],
  );

  // Solicitudes pendientes de clientes — sin resolver todavía.
  const pendingClientRequests = requests.length;

  // Tareas vencidas (due date pasado) — usadas en el banner de alerta.
  const overdueTasks = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return tasks.filter(
      (t) => t.status !== "done" && t.dueDate && t.dueDate < today,
    );
  }, [tasks]);

  // Nota: el listado "recent activity" (mix de solicitudes/clientes/
  // tareas done) se eliminó del UI — Actividad reciente ahora muestra
  // solo el resumen del día generado por AgentDailySummary.

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
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <HeroStat
                value={totalClients}
                label={totalClients === 1 ? "Cliente" : "Clientes"}
              />
              <HeroStat
                value={pendingTeamTasks}
                label={
                  pendingTeamTasks === 1
                    ? "Tarea pendiente del equipo"
                    : "Tareas pendientes del equipo"
                }
              />
              <HeroStat
                value={pendingClientRequests}
                label={
                  pendingClientRequests === 1
                    ? "Solicitud del cliente"
                    : "Solicitudes del cliente"
                }
              />
            </div>
          </div>

          {/* Actividad reciente — solo el mensaje del asistente.
              El listado de items (solicitudes/clientes/tareas done) se
              sacó: era ruido y no aportaba sobre el resumen del día. */}
          <div
            style={{
              background: "var(--white)",
              border: "1px solid var(--hairline)",
              borderRadius: "var(--r-lg)",
              padding: "20px 22px",
              display: "flex",
              flexDirection: "column",
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
            <AgentDailySummary
              userFirstName={userFirstName}
              clients={clients}
              tasks={tasks}
              requests={requests}
              leads={leads}
            />
          </div>
        </div>

        {/* ============ ALERTAS — banner destacado ============ */}
        {(overdueTasks.length > 0 || pendingClientRequests > 0) && (
          <HubAlertsBanner
            overdueCount={overdueTasks.length}
            pendingTasks={pendingTeamTasks}
            pendingRequests={pendingClientRequests}
          />
        )}

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
              {/* "Ver todas" eliminado — la pantalla global /tareas ya no
                  vive en el menú. Las tareas se muestran inline en este
                  dashboard. */}
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  letterSpacing: "0.04em",
                }}
              >
                {pendingTasksList.length} pendiente
                {pendingTasksList.length === 1 ? "" : "s"}
              </span>
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
                fontSize: 11,
                color: "var(--text-muted)",
                fontStyle: "italic",
              }}
            >
              Para crear o asignar tareas, entrá al cliente correspondiente
              → <strong>Tareas del cliente</strong>.
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

// ============================================================
// HubAlertsBanner — banner destacado arriba del grid de clientes.
// Aparece solo si hay tareas vencidas o solicitudes pendientes;
// si no, se oculta entero (no mete ruido visual).
// ============================================================
function HubAlertsBanner({
  overdueCount,
  pendingTasks,
  pendingRequests,
}: {
  overdueCount: number;
  pendingTasks: number;
  pendingRequests: number;
}) {
  const alerts: { tone: "danger" | "warn"; text: string }[] = [];
  if (overdueCount > 0) {
    alerts.push({
      tone: "danger",
      text: `${overdueCount} tarea${overdueCount === 1 ? "" : "s"} vencida${overdueCount === 1 ? "" : "s"} — necesitan atención inmediata.`,
    });
  } else if (pendingTasks > 0) {
    alerts.push({
      tone: "warn",
      text: `${pendingTasks} tarea${pendingTasks === 1 ? "" : "s"} pendiente${pendingTasks === 1 ? "" : "s"} en el equipo.`,
    });
  }
  if (pendingRequests > 0) {
    alerts.push({
      tone: "warn",
      text: `${pendingRequests} solicitud${pendingRequests === 1 ? "" : "es"} de cliente${pendingRequests === 1 ? "" : "s"} esperando respuesta.`,
    });
  }
  if (alerts.length === 0) return null;

  const hasDanger = alerts.some((a) => a.tone === "danger");

  return (
    <div
      style={{
        marginBottom: 24,
        background: hasDanger ? "rgba(176,75,58,0.07)" : "rgba(196,168,130,0.12)",
        border: `1px solid ${hasDanger ? "rgba(176,75,58,0.3)" : "rgba(196,168,130,0.4)"}`,
        borderLeft: `4px solid ${hasDanger ? "#B91C1C" : "var(--sand-dark)"}`,
        borderRadius: "var(--r-md)",
        padding: "14px 18px",
        display: "flex",
        gap: 14,
        alignItems: "flex-start",
      }}
    >
      <div
        style={{
          fontSize: 18,
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        {hasDanger ? "🚨" : "⚠️"}
      </div>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            fontWeight: 700,
            color: hasDanger ? "#B91C1C" : "var(--sand-dark)",
            marginBottom: 6,
          }}
        >
          {hasDanger ? "Atención requerida" : "Pendientes en tu mesa"}
        </div>
        <ul
          style={{
            margin: 0,
            paddingLeft: 16,
            fontSize: 12.5,
            lineHeight: 1.6,
            color: "var(--deep-green)",
          }}
        >
          {alerts.map((a, i) => (
            <li key={i} style={{ marginBottom: 2 }}>
              {a.text}
            </li>
          ))}
        </ul>
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

// ============================================================
// AgentDailySummary — mensaje "del agente" que aparece arriba
// de Actividad reciente. Resume el día: qué se hizo, qué falta,
// qué está vencido. Se arma con datos locales (sin LLM).
// ============================================================
function AgentDailySummary({
  userFirstName,
  clients,
  tasks,
  requests,
  leads,
}: {
  userFirstName: string;
  clients: Client[];
  tasks: DevTask[];
  requests: ClientRequest[];
  leads: Lead[];
}) {
  const summary = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const pendingTasks = tasks.filter((t) => t.status !== "done");
    const overdueTasks = pendingTasks.filter(
      (t) => t.dueDate && t.dueDate < today,
    );
    const dueTodayTasks = pendingTasks.filter((t) => t.dueDate === today);
    const doneToday = tasks.filter((t) => {
      if (t.status !== "done") return false;
      // Heurística: si el createdAt es hoy, lo contamos. (No tenemos campo
      // doneAt; es una aproximación.)
      return (t.createdAt ?? "").slice(0, 10) === today;
    });
    const pendingReqs = requests.length;
    const newLeads = leads.filter((l) => {
      const created = (l.createdAt ?? "").slice(0, 10);
      return created === today;
    });
    const onboardingClients = clients.filter((c) => c.status === "onboarding");

    return {
      pending: pendingTasks.length,
      overdue: overdueTasks.length,
      dueToday: dueTodayTasks.length,
      doneToday: doneToday.length,
      pendingReqs,
      newLeads: newLeads.length,
      onboardingClients: onboardingClients.length,
    };
  }, [clients, tasks, requests, leads]);

  // Armado del párrafo — orden por urgencia.
  const lines: string[] = [];
  if (summary.overdue > 0) {
    lines.push(
      `Tenés ${summary.overdue} tarea${summary.overdue === 1 ? "" : "s"} vencida${summary.overdue === 1 ? "" : "s"} — conviene priorizarla${summary.overdue === 1 ? "" : "s"} hoy.`,
    );
  }
  if (summary.dueToday > 0) {
    lines.push(
      `${summary.dueToday} tarea${summary.dueToday === 1 ? "" : "s"} vence${summary.dueToday === 1 ? "" : "n"} hoy.`,
    );
  }
  if (summary.pendingReqs > 0) {
    lines.push(
      `${summary.pendingReqs} solicitud${summary.pendingReqs === 1 ? "" : "es"} de clientes esperando respuesta.`,
    );
  }
  if (summary.newLeads > 0) {
    lines.push(
      `Entraron ${summary.newLeads} prospecto${summary.newLeads === 1 ? "" : "s"} hoy al pipeline.`,
    );
  }
  if (summary.onboardingClients > 0) {
    lines.push(
      `${summary.onboardingClients} cliente${summary.onboardingClients === 1 ? "" : "s"} en onboarding — chequeá que el kickoff esté en marcha.`,
    );
  }
  if (summary.doneToday > 0) {
    lines.push(
      `Buen avance: ${summary.doneToday} tarea${summary.doneToday === 1 ? "" : "s"} completada${summary.doneToday === 1 ? "" : "s"} hoy.`,
    );
  }
  if (lines.length === 0) {
    lines.push(
      "Todo limpio: sin tareas vencidas, sin solicitudes nuevas. Buen momento para avanzar con contenido o estrategia.",
    );
  }

  return (
    <div
      style={{
        background: "var(--ivory)",
        border: "1px solid rgba(196,168,130,0.35)",
        borderRadius: "var(--r-md)",
        padding: "12px 14px",
        marginBottom: 16,
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          flexShrink: 0,
          borderRadius: "50%",
          background: "var(--deep-green)",
          color: "var(--off-white)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        ✦
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 9,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--sand-dark)",
            fontWeight: 700,
            marginBottom: 4,
          }}
        >
          Resumen del día · Asistente
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--deep-green)",
            lineHeight: 1.5,
          }}
        >
          {userFirstName}, esto es lo que veo hoy:
          <ul
            style={{
              margin: "6px 0 0",
              paddingLeft: 18,
              listStyle: "disc",
            }}
          >
            {lines.map((l, i) => (
              <li key={i} style={{ marginBottom: 2 }}>
                {l}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
