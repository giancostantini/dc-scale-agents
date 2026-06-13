"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getClient,
  getObjectives,
  getProdCampaigns,
  getTasks,
} from "@/lib/storage";
import { listRequestsForClient } from "@/lib/requests";
import { getCurrentProfile } from "@/lib/supabase/auth";
import { getDownloadUrl } from "@/lib/upload";
import type {
  Client,
  ClientObjectives,
  ClientRequest,
  OnboardingFile,
  ProductionCampaign,
  DevTask,
} from "@/lib/types";
import WelcomeBanner from "@/components/WelcomeBanner";
import ui from "@/components/ClientUI.module.css";

export default function ClienteDashboard({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [client, setClient] = useState<Client | null | undefined>(undefined);
  const [objectives, setObjectives] = useState<ClientObjectives | undefined>();
  const [campaigns, setCampaigns] = useState<ProductionCampaign[]>([]);
  const [tasks, setTasks] = useState<DevTask[]>([]);
  const [pendingRequests, setPendingRequests] = useState<ClientRequest[]>([]);
  const [isDirector, setIsDirector] = useState(false);

  useEffect(() => {
    Promise.all([
      getClient(id),
      getObjectives(id),
      getProdCampaigns(id),
      getTasks(id),
      getCurrentProfile(),
      listRequestsForClient(id),
    ]).then(([c, o, p, t, profile, reqs]) => {
      setClient(c ?? null);
      setObjectives(o);
      setCampaigns(p);
      setTasks(t);
      setIsDirector(profile?.role === "director");
      // Solo solicitudes pendientes o en revisión — el equipo necesita
      // verlas; las que ya están done/rejected no aportan ruido.
      setPendingRequests(
        reqs.filter(
          (r) => r.status === "pending" || r.status === "reviewing",
        ),
      );
    });
  }, [id]);

  if (client === undefined) return null;
  if (client === null) return null;

  return client.type === "gp" ? (
    <GPDashboard
      client={client}
      objectives={objectives}
      campaigns={campaigns}
      tasks={tasks}
      isDirector={isDirector}
      pendingRequests={pendingRequests}
    />
  ) : (
    <DevDashboard
      client={client}
      tasks={tasks}
      pendingRequests={pendingRequests}
    />
  );
}

// ==================== GROWTH PARTNER DASHBOARD ====================

function GPDashboard({
  client,
  objectives,
  campaigns,
  tasks,
  isDirector,
  pendingRequests,
}: {
  client: Client;
  objectives?: ClientObjectives;
  campaigns: ProductionCampaign[];
  tasks: DevTask[];
  isDirector: boolean;
  pendingRequests: ClientRequest[];
}) {
  const router = useRouter();
  // Tareas pendientes del cliente (no done). Vencidas se calculan
  // contra hoy.  Las usamos para la card "Tareas pendientes" abajo.
  const today = new Date().toISOString().slice(0, 10);
  const pendingTasks = tasks.filter((t) => t.status !== "done");
  const overdueTasks = pendingTasks.filter(
    (t) => t.dueDate && t.dueDate < today,
  );
  // Las métricas de paid media y el presupuesto se sacaron del dashboard:
  // el primero vive ahora en Espor.ai + Looker Studio (Analítica),
  // el segundo en /campanas. Acá quedan: header, briefing,
  // solicitudes y objetivos.
  // campaigns sigue llegando como prop por compat (lo usa el resto del page).
  void campaigns;

  return (
    <>
      <WelcomeBanner
        greet={false}
        eyebrow={`Growth Partner · ${client.method}`}
        title={client.name}
        subtitle={client.sector}
        logoUrl={client.logo_url}
        logoFallback={client.initials}
      >
        <span
          className={`${ui.phaseBadge} ${
            client.status === "active" ? ui.phaseBadgeExec : ""
          }`}
        >
          {client.phase}
        </span>
      </WelcomeBanner>

      {/* Datos fiscales — sutiles, solo aparecen si están cargados.
          Importantes para que el equipo tenga la razón social/RUT a
          mano sin entrar a Configuración. */}
      <BillingInfoBar client={client} />

      {/* El morning briefing dejó de ser un panel por-cliente. Ahora vive
          en el widget global del consultor (bottom-right): es por user,
          personalizado por rol (director/team) y se entrega como mensaje
          is_briefing=true en la conversación pinned. */}

      {/* Solicitudes del cliente pendientes — visibles directamente
          en el dashboard para que el equipo no se las pierda. */}
      <PendingRequestsPanel
        clientId={client.id}
        requests={pendingRequests}
      />

      {/* Card "Tareas pendientes" — solo aparece si hay tareas no done.
          Linkea al módulo Tareas del cliente. Las vencidas se destacan
          en rojo para que el equipo las priorice. */}
      {pendingTasks.length > 0 && (
        <button
          type="button"
          onClick={() => router.push(`/cliente/${client.id}/tareas`)}
          className={ui.panel}
          style={{
            width: "100%",
            textAlign: "left",
            cursor: "pointer",
            marginBottom: 20,
            borderLeft: overdueTasks.length > 0
              ? "3px solid var(--red-warn)"
              : "3px solid var(--sand)",
            fontFamily: "inherit",
            background: "var(--white)",
            border: "1px solid rgba(10,26,12,0.08)",
            padding: 18,
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              fontSize: 28,
              color: overdueTasks.length > 0 ? "var(--red-warn)" : "var(--sand-dark)",
              flexShrink: 0,
              lineHeight: 1,
            }}
          >
            {overdueTasks.length > 0 ? "🚨" : "✓"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 9,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: overdueTasks.length > 0 ? "var(--red-warn)" : "var(--sand-dark)",
                fontWeight: 700,
                marginBottom: 6,
              }}
            >
              {overdueTasks.length > 0
                ? "Atención requerida"
                : "Tareas en curso"}
            </div>
            <div style={{ fontSize: 14, color: "var(--deep-green)", lineHeight: 1.5 }}>
              <strong style={{ fontSize: 17, fontWeight: 700 }}>
                {pendingTasks.length}
              </strong>{" "}
              tarea{pendingTasks.length === 1 ? "" : "s"} pendiente
              {pendingTasks.length === 1 ? "" : "s"}
              {overdueTasks.length > 0 && (
                <>
                  {" "}·{" "}
                  <span style={{ color: "var(--red-warn)", fontWeight: 700 }}>
                    {overdueTasks.length} vencida
                    {overdueTasks.length === 1 ? "" : "s"}
                  </span>
                </>
              )}
            </div>
          </div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--deep-green)",
              letterSpacing: "0.04em",
              flexShrink: 0,
            }}
          >
            Ver tareas →
          </div>
        </button>
      )}

      {/* Card "Solicitudes del cliente" — entrypoint al inbox de
          recomendaciones / ofertas / acciones que el cliente carga
          desde su portal. Antes vivía como botón en el Topbar global,
          pero quedaba lejos del contexto del cliente. Acá aparece
          siempre (incluso si no hay solicitudes), porque la card sirve
          también como recordatorio de que el módulo existe. */}
      <button
        type="button"
        onClick={() => router.push(`/cliente/${client.id}/solicitudes`)}
        className={ui.panel}
        style={{
          width: "100%",
          textAlign: "left",
          cursor: "pointer",
          marginBottom: 20,
          borderLeft:
            pendingRequests.length > 0
              ? "3px solid var(--sand-dark)"
              : "3px solid var(--sand)",
          fontFamily: "inherit",
          background: "var(--white)",
          border: "1px solid rgba(10,26,12,0.08)",
          padding: 18,
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div
          style={{
            fontSize: 26,
            color: "var(--sand-dark)",
            flexShrink: 0,
            lineHeight: 1,
          }}
        >
          ✉
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 9,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--sand-dark)",
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            Solicitudes del cliente
          </div>
          <div
            style={{
              fontSize: 14,
              color: "var(--deep-green)",
              lineHeight: 1.5,
            }}
          >
            {pendingRequests.length === 0 ? (
              <span style={{ color: "var(--text-muted)" }}>
                Sin solicitudes abiertas. Las recomendaciones, ofertas y
                pedidos del cliente aparecen acá.
              </span>
            ) : (
              <>
                <strong style={{ fontSize: 17, fontWeight: 700 }}>
                  {pendingRequests.length}
                </strong>{" "}
                solicitud{pendingRequests.length === 1 ? "" : "es"}{" "}
                abierta{pendingRequests.length === 1 ? "" : "s"}{" "}
                — recomendaciones, ofertas y acciones cargadas desde el
                portal.
              </>
            )}
          </div>
        </div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--deep-green)",
            letterSpacing: "0.04em",
            flexShrink: 0,
          }}
        >
          Ver solicitudes →
        </div>
      </button>

      {/* Presupuestos del mes — producciones + ads.
          Solo aparece para clientes GP. Director puede editar; team
          solo ve los números y la barra de saldo. */}
      <ClientBudgetsPanel
        clientId={client.id}
        clientName={client.name}
        isDirector={isDirector}
      />

      <div>
        <div className={ui.panel}>
          <div className={ui.panelHead}>
            <div>
              <div className={ui.panelTitle}>
                Objetivos del{" "}
                {objectives?.periodType === "quarterly"
                  ? "trimestre"
                  : objectives?.periodType === "annual"
                  ? "año"
                  : "mes"}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                {objectives?.period || "Sin período definido"}
              </div>
            </div>
            {isDirector && (
              <button
                className={ui.panelAction}
                onClick={() => router.push(`/cliente/${client.id}/objetivos`)}
              >
                Editar →
              </button>
            )}
          </div>

          {!objectives || objectives.items.length === 0 ? (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                fontSize: 13,
                color: "var(--text-muted)",
              }}
            >
              Sin objetivos definidos.{" "}
              {isDirector ? (
                <strong
                  style={{ color: "var(--sand-dark)", cursor: "pointer" }}
                  onClick={() =>
                    router.push(`/cliente/${client.id}/objetivos`)
                  }
                >
                  Setearlos →
                </strong>
              ) : (
                "Pedile al director que los defina."
              )}
            </div>
          ) : (
            objectives.items.map((o) => (
              <div
                key={o.id}
                style={{
                  padding: "14px 0",
                  borderBottom: "1px solid rgba(10,26,12,0.05)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 8,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{o.name}</div>
                  <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                    <strong
                      style={{
                        fontSize: 15,
                        color: "var(--deep-green)",
                        fontWeight: 700,
                      }}
                    >
                      {o.now}
                      {o.unit}
                    </strong>
                    <span style={{ margin: "0 6px", fontSize: 11 }}>/</span>
                    {o.target}
                    {o.unit}
                  </div>
                </div>
                <div className={ui.progressBar}>
                  <div
                    className={ui.progressFill}
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
                <div className={ui.progressLabels}>
                  <div>
                    {o.pct >= 85
                      ? "On track"
                      : o.pct >= 60
                      ? "En progreso"
                      : "Atención"}
                  </div>
                  <div className={ui.progressPct}>{o.pct}%</div>
                </div>
              </div>
            ))
          )}
        </div>

      </div>

      <div style={{ marginTop: 40, display: "flex", gap: 10 }}>
        <button className={ui.btnGhost} onClick={() => router.push("/hub")}>
          ← Volver al hub
        </button>
      </div>
    </>
  );
}

// ==================== DEV DASHBOARD ====================

function DevDashboard({
  client,
  tasks,
  pendingRequests,
}: {
  client: Client;
  tasks: DevTask[];
  pendingRequests: ClientRequest[];
}) {
  const router = useRouter();
  const done = tasks.filter((t) => t.status === "done").length;
  const active = tasks.filter((t) => t.status === "active").length;
  const pending = tasks.filter((t) => t.status === "pending").length;
  const progress =
    tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;

  const projectFile = client.onboarding?.devProjectFile;
  const deliveryDate = client.onboarding?.devDeliveryDate;

  return (
    <>
      <WelcomeBanner
        greet={false}
        eyebrow={`Desarrollo · ${client.method}`}
        title={client.name}
        subtitle={client.sector}
        logoUrl={client.logo_url}
        logoFallback={client.initials}
      >
        <span className={ui.phaseBadge}>{client.phase}</span>
      </WelcomeBanner>

      <BillingInfoBar client={client} />

      <PendingRequestsPanel
        clientId={client.id}
        requests={pendingRequests}
      />

      <div className={ui.panel} style={{ marginBottom: 24 }}>
        <div className={ui.panelHead}>
          <div className={ui.panelTitle}>Progreso general</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {done} done · {active} en curso · {pending} pendientes
          </div>
        </div>
        <div className={ui.progressBar} style={{ height: 12 }}>
          <div
            className={ui.progressFill}
            style={{
              width: `${progress}%`,
              background: progress === 100 ? "var(--green-ok)" : "var(--sand)",
            }}
          />
        </div>
        <div
          style={{
            marginTop: 12,
            display: "flex",
            justifyContent: "space-between",
            fontSize: 13,
          }}
        >
          <span style={{ color: "var(--text-muted)" }}>Progreso total</span>
          <strong>{progress}%</strong>
        </div>
      </div>

      <div className={ui.panelGrid}>
        <div className={ui.panel}>
          <div className={ui.panelHead}>
            <div className={ui.panelTitle}>Tareas</div>
            <button
              className={ui.panelAction}
              onClick={() => router.push(`/cliente/${client.id}/nueva-tarea`)}
            >
              + Nueva tarea →
            </button>
          </div>
          {tasks.length === 0 ? (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: 13,
              }}
            >
              Sin tareas todavía. Creá la primera.
            </div>
          ) : (
            tasks.slice(0, 6).map((t) => (
              <div
                key={t.id}
                style={{
                  padding: "10px 0",
                  borderBottom: "1px solid rgba(10,26,12,0.05)",
                  display: "flex",
                  gap: 14,
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    width: 14,
                    height: 14,
                    border: "1.5px solid var(--sand-dark)",
                    background:
                      t.status === "done"
                        ? "var(--green-ok)"
                        : t.status === "active"
                        ? "var(--sand)"
                        : "transparent",
                    borderColor:
                      t.status === "done"
                        ? "var(--green-ok)"
                        : t.status === "active"
                        ? "var(--sand)"
                        : "var(--sand-dark)",
                  }}
                />
                <div
                  style={{
                    flex: 1,
                    fontSize: 13,
                    textDecoration: t.status === "done" ? "line-through" : "none",
                    color:
                      t.status === "done" ? "var(--text-muted)" : "var(--deep-green)",
                  }}
                >
                  {t.title}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {t.assignee}
                </div>
              </div>
            ))
          )}
        </div>

        <div className={ui.panel}>
          <div className={ui.panelHead}>
            <div className={ui.panelTitle}>Definición</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Temporizador hacia la fecha de entrega */}
            {deliveryDate ? (
              <div>
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    color: "var(--sand-dark)",
                    fontWeight: 600,
                    marginBottom: 8,
                  }}
                >
                  Entrega del proyecto
                </div>
                <DeliveryCountdown deliveryDate={deliveryDate} />
              </div>
            ) : (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  fontStyle: "italic",
                  padding: "8px 0",
                }}
              >
                Sin fecha de entrega definida en el onboarding.
              </div>
            )}

            {/* Botón Proyecto — link al PDF del onboarding */}
            {projectFile ? (
              <div>
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    color: "var(--sand-dark)",
                    fontWeight: 600,
                    marginBottom: 8,
                  }}
                >
                  Documento del proyecto
                </div>
                <ProyectoButton file={projectFile} />
              </div>
            ) : (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  fontStyle: "italic",
                }}
              >
                Sin documento de proyecto cargado.
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 40, display: "flex", gap: 10 }}>
        <button className={ui.btnGhost} onClick={() => router.push("/hub")}>
          ← Volver al hub
        </button>
      </div>
    </>
  );
}


// ============================================================
// PendingRequestsPanel
// ============================================================
// Lista compacta de las solicitudes que el cliente mandó y que el
// equipo todavía no resolvió (status = pending | reviewing). Se
// muestra en el dashboard de cada cliente para que el equipo no
// se las pierda.
function PendingRequestsPanel({
  clientId,
  requests,
}: {
  clientId: string;
  requests: ClientRequest[];
}) {
  const router = useRouter();
  if (requests.length === 0) return null;

  const urgencyColor: Record<string, string> = {
    alta: "var(--red-warn)",
    media: "var(--sand-dark)",
    baja: "var(--text-muted)",
  };

  return (
    <div
      className={ui.panel}
      style={{
        marginBottom: 20,
        borderLeft: "3px solid var(--red-warn)",
      }}
    >
      <div className={ui.panelHead}>
        <div>
          <div className={ui.panelTitle}>
            Solicitudes del cliente · pendientes
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              marginTop: 4,
            }}
          >
            {requests.length}{" "}
            {requests.length === 1 ? "pendiente" : "pendientes"} de revisar
          </div>
        </div>
        <button
          className={ui.panelAction}
          onClick={() => router.push(`/cliente/${clientId}/solicitudes`)}
        >
          Ver todas →
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {requests.slice(0, 5).map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => router.push(`/cliente/${clientId}/solicitudes`)}
            style={{
              textAlign: "left",
              padding: "14px 4px",
              borderBottom: "1px solid rgba(10,26,12,0.05)",
              background: "transparent",
              border: "none",
              borderTop: "none",
              borderLeft: "none",
              borderRight: "none",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--deep-green)",
                    marginBottom: 4,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.title}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      fontWeight: 600,
                      color: "var(--sand-dark)",
                    }}
                  >
                    {r.type}
                  </span>
                  <span>·</span>
                  <span
                    style={{
                      color: urgencyColor[r.urgency] ?? "var(--text-muted)",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    {r.urgency}
                  </span>
                  <span>·</span>
                  <span>
                    {new Date(r.submitted_at).toLocaleDateString("es-UY", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                </div>
              </div>
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  color:
                    r.status === "pending"
                      ? "var(--red-warn)"
                      : "var(--sand-dark)",
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  alignSelf: "center",
                }}
              >
                {r.status === "pending" ? "Pendiente" : "En revisión"}
              </div>
            </div>
          </button>
        ))}
      </div>

      {requests.length > 5 && (
        <div
          style={{
            padding: "12px 4px 4px",
            fontSize: 11,
            color: "var(--text-muted)",
            fontStyle: "italic",
          }}
        >
          + {requests.length - 5} más. Click "Ver todas" para gestionarlas.
        </div>
      )}
    </div>
  );
}

// ============================================================
// ProyectoButton
// ============================================================
// Botón "Proyecto" que abre el PDF del proyecto de desarrollo
// (devProjectFile del onboarding) en una nueva pestaña. Genera la
// signed URL al hacer click — no preloadeamos para evitar quemar
// links si el usuario no lo abre.
function ProyectoButton({ file }: { file: OnboardingFile | string }) {
  const [loading, setLoading] = useState(false);
  const path = typeof file === "string" ? file : file.path;
  const name =
    typeof file === "string"
      ? file.split("/").pop() ?? "Proyecto"
      : file.name;

  async function open() {
    setLoading(true);
    try {
      const url = await getDownloadUrl(path);
      if (!url) {
        alert("No se pudo generar el link al PDF.");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={loading}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 16px",
        background: "var(--deep-green)",
        color: "var(--off-white)",
        border: "none",
        borderRadius: "var(--r-sm)",
        fontFamily: "inherit",
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.04em",
        cursor: loading ? "default" : "pointer",
        opacity: loading ? 0.6 : 1,
      }}
      title={name}
    >
      <span style={{ fontSize: 14 }}>📄</span>
      {loading ? "Abriendo…" : "Proyecto"}
    </button>
  );
}

// ============================================================
// DeliveryCountdown
// ============================================================
// Cuenta atrás hacia la fecha de entrega del proyecto. Se refresca
// cada minuto — para días/horas/min basta con eso, sin segundos
// (no necesitamos parpadeo). Si la fecha ya pasó, muestra los días
// vencidos en rojo.
function DeliveryCountdown({ deliveryDate }: { deliveryDate: string }) {
  // Estado del tick — solo para forzar re-render cada minuto.
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const target = useMemo(() => {
    // Interpretamos YYYY-MM-DD como fin del día (23:59 local) para
    // que "faltan X días" no salte un día antes por timezone.
    const d = new Date(deliveryDate + "T23:59:59");
    return d.getTime();
  }, [deliveryDate]);

  const now = Date.now();
  const diffMs = target - now;
  const overdue = diffMs < 0;
  const absMs = Math.abs(diffMs);
  const totalHours = Math.floor(absMs / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = Math.floor((absMs % (1000 * 60 * 60)) / (1000 * 60));

  const human = new Date(deliveryDate + "T00:00:00").toLocaleDateString(
    "es-UY",
    { day: "numeric", month: "long", year: "numeric" },
  );

  return (
    <div
      style={{
        background: overdue ? "rgba(176,75,58,0.08)" : "var(--ivory)",
        border: `1px solid ${overdue ? "rgba(176,75,58,0.3)" : "rgba(196,168,130,0.35)"}`,
        borderRadius: "var(--r-md)",
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "var(--text-muted)",
          marginBottom: 8,
        }}
      >
        {overdue ? "Plazo vencido el" : "Fecha objetivo"} ·{" "}
        <strong style={{ color: "var(--deep-green)" }}>{human}</strong>
      </div>
      <div
        style={{
          display: "flex",
          gap: 14,
          alignItems: "baseline",
          color: overdue ? "#B91C1C" : "var(--deep-green)",
        }}
      >
        <CountdownUnit value={days} label={days === 1 ? "día" : "días"} big />
        <CountdownUnit value={hours} label={hours === 1 ? "hora" : "horas"} />
        <CountdownUnit
          value={minutes}
          label={minutes === 1 ? "min" : "min"}
        />
      </div>
      {overdue && (
        <div
          style={{
            marginTop: 6,
            fontSize: 11,
            fontWeight: 700,
            color: "#B91C1C",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Entrega vencida
        </div>
      )}
    </div>
  );
}

function CountdownUnit({
  value,
  label,
  big,
}: {
  value: number;
  label: string;
  big?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <span
        style={{
          fontSize: big ? 28 : 20,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
        }}
      >
        {value}
      </span>
      <span
        style={{
          fontSize: 9,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
          marginTop: 4,
        }}
      >
        {label}
      </span>
    </div>
  );
}

// ============================================================
// BillingInfoBar — chips con razón social + RUT del cliente.
// Solo aparece si alguno está cargado. Si no, no mete ruido visual.
// Las facturas se auto-rellenan con estos datos.
// ============================================================
// ============================================================
// ClientBudgetsPanel — dos líneas de presupuesto mensual del cliente:
// Producciones y Ads. Cada una muestra: monto seteado, gastado a la
// fecha (sumado de expenses) y saldo disponible. Director puede
// editar el monto inline.
// ============================================================
function ClientBudgetsPanel({
  clientId,
  clientName,
  isDirector,
}: {
  clientId: string;
  clientName: string;
  isDirector: boolean;
}) {
  const [budgets, setBudgets] = useState<{
    producciones: number;
    ads: number;
  }>({ producciones: 0, ads: 0 });
  const [spent, setSpent] = useState<{ producciones: number; ads: number }>({
    producciones: 0,
    ads: 0,
  });
  const [loading, setLoading] = useState(true);

  const currentMonth = new Date().toISOString().slice(0, 7);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      import("@/lib/storage").then((m) =>
        m.listClientMonthlyBudgets(clientId),
      ),
      import("@/lib/storage").then((m) => m.getExpenses()),
    ]).then(([bdgs, exs]) => {
      if (cancelled) return;
      const monthBudgets = bdgs.filter((b) => b.month === currentMonth);
      const prodB =
        monthBudgets.find((b) => b.kind === "producciones")?.amount ?? 0;
      const adsB = monthBudgets.find((b) => b.kind === "ads")?.amount ?? 0;
      setBudgets({ producciones: prodB, ads: adsB });

      // Spent: expenses asignados al cliente con fecha del mes en curso.
      // Producciones: category="produccion" || mkt_budget link irrelevante.
      // Ads: mkt_budget_client_id === client.id OR category="mkt_interno".
      const expensesThisMonth = exs.filter(
        (e) => (e.date ?? "").startsWith(currentMonth),
      );
      const prodSpent = expensesThisMonth
        .filter(
          (e) =>
            e.assignedTo === clientName && e.category === "produccion",
        )
        .reduce((s, e) => s + Number(e.amount), 0);
      const adsSpent = expensesThisMonth
        .filter(
          (e) =>
            e.mktBudgetClientId === clientId ||
            (e.assignedTo === clientName && e.category === "mkt_interno"),
        )
        .reduce((s, e) => s + Number(e.amount), 0);
      setSpent({ producciones: prodSpent, ads: adsSpent });
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [clientId, clientName, currentMonth]);

  if (loading) return null;

  const monthLabel = new Date(`${currentMonth}-01`).toLocaleDateString(
    "es-AR",
    { month: "long", year: "numeric" },
  );

  return (
    <div className={ui.panel} style={{ marginBottom: 20 }}>
      <div className={ui.panelHead}>
        <div>
          <div className={ui.panelTitle}>Presupuestos del mes</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
            {monthLabel} · {isDirector ? "Editá el monto haciendo click en el número" : "Solo lectura"}
          </div>
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 14,
        }}
      >
        <BudgetLine
          label="Producciones"
          budget={budgets.producciones}
          spent={spent.producciones}
          isDirector={isDirector}
          onUpdate={async (newAmount) => {
            const { upsertClientMonthlyBudget } = await import("@/lib/storage");
            await upsertClientMonthlyBudget(
              clientId,
              currentMonth,
              "producciones",
              newAmount,
            );
            setBudgets((b) => ({ ...b, producciones: newAmount }));
          }}
        />
        <BudgetLine
          label="Ads"
          budget={budgets.ads}
          spent={spent.ads}
          isDirector={isDirector}
          onUpdate={async (newAmount) => {
            const { upsertClientMonthlyBudget } = await import("@/lib/storage");
            await upsertClientMonthlyBudget(
              clientId,
              currentMonth,
              "ads",
              newAmount,
            );
            setBudgets((b) => ({ ...b, ads: newAmount }));
          }}
        />
      </div>
    </div>
  );
}

function BudgetLine({
  label,
  budget,
  spent,
  isDirector,
  onUpdate,
}: {
  label: string;
  budget: number;
  spent: number;
  isDirector: boolean;
  onUpdate: (amount: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(budget));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(String(budget));
  }, [budget, editing]);

  const available = budget - spent;
  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  const overBudget = budget > 0 && spent > budget;

  async function save() {
    const v = Number(draft);
    if (!Number.isFinite(v) || v < 0) {
      setEditing(false);
      setDraft(String(budget));
      return;
    }
    setSaving(true);
    try {
      await onUpdate(v);
      setEditing(false);
    } catch (e) {
      alert(`No se pudo guardar: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        padding: 16,
        background: "var(--white)",
        border: "1px solid var(--hairline)",
        borderRadius: "var(--r-md)",
        borderLeft: `3px solid ${overBudget ? "var(--red-warn)" : "var(--sand)"}`,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--sand-dark)",
          fontWeight: 700,
          marginBottom: 8,
        }}
      >
        {label}
      </div>

      {/* Presupuesto (editable) */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Presupuesto:</span>
        {editing ? (
          <div style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>US$</span>
            <input
              type="number"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") {
                  setEditing(false);
                  setDraft(String(budget));
                }
              }}
              autoFocus
              disabled={saving}
              style={{
                width: 100,
                padding: "4px 6px",
                fontSize: 14,
                fontFamily: "inherit",
                border: "1px solid var(--sand-dark)",
                borderRadius: 4,
                background: "var(--white)",
                color: "var(--deep-green)",
                outline: "none",
              }}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => isDirector && setEditing(true)}
            disabled={!isDirector}
            style={{
              padding: 0,
              background: "transparent",
              border: "none",
              fontSize: 16,
              fontWeight: 700,
              color: "var(--deep-green)",
              cursor: isDirector ? "pointer" : "default",
              fontFamily: "inherit",
              textDecoration: isDirector ? "underline dotted var(--sand)" : "none",
              textUnderlineOffset: 4,
            }}
            title={isDirector ? "Click para editar" : ""}
          >
            US$ {budget.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </button>
        )}
      </div>

      {/* Gastado + disponible */}
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>
        Gastado:{" "}
        <strong style={{ color: "var(--deep-green)" }}>
          US$ {spent.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </strong>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
        Disponible:{" "}
        <strong style={{ color: overBudget ? "var(--red-warn)" : "var(--green-ok)" }}>
          US$ {available.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </strong>
        {overBudget && (
          <span style={{ marginLeft: 6, color: "var(--red-warn)", fontWeight: 700 }}>
            ⚠ excedido
          </span>
        )}
      </div>

      {/* Barra de progreso */}
      <div
        style={{
          height: 6,
          background: "var(--off-white)",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: overBudget
              ? "var(--red-warn)"
              : pct > 80
                ? "var(--sand-dark)"
                : "var(--green-ok)",
            transition: "width 0.3s",
          }}
        />
      </div>
    </div>
  );
}

function BillingInfoBar({ client }: { client: Client }) {
  const razon = client.razon_social?.trim();
  const rut = client.rut?.trim();
  if (!razon && !rut) return null;
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        marginBottom: 20,
        padding: "10px 14px",
        background: "var(--off-white)",
        border: "1px solid var(--hairline)",
        borderRadius: "var(--r-md)",
        fontSize: 12,
        alignItems: "center",
      }}
    >
      <span
        style={{
          fontSize: 9,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--sand-dark)",
          fontWeight: 700,
        }}
      >
        Datos fiscales
      </span>
      {razon && (
        <span style={{ color: "var(--deep-green)" }}>
          <strong style={{ color: "var(--text-muted)", fontWeight: 600 }}>
            Razón social:
          </strong>{" "}
          {razon}
        </span>
      )}
      {rut && (
        <span style={{ color: "var(--deep-green)" }}>
          <strong style={{ color: "var(--text-muted)", fontWeight: 600 }}>
            RUT:
          </strong>{" "}
          <span style={{ fontFamily: "monospace" }}>{rut}</span>
        </span>
      )}
    </div>
  );
}
