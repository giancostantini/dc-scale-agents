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
  isDirector,
  pendingRequests,
}: {
  client: Client;
  objectives?: ClientObjectives;
  campaigns: ProductionCampaign[];
  isDirector: boolean;
  pendingRequests: ClientRequest[];
}) {
  const router = useRouter();
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
      >
        <span
          className={`${ui.phaseBadge} ${
            client.status === "active" ? ui.phaseBadgeExec : ""
          }`}
        >
          {client.phase}
        </span>
      </WelcomeBanner>

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
      >
        <span className={ui.phaseBadge}>{client.phase}</span>
      </WelcomeBanner>

      {/* Accesos directos del proyecto: PDF + entrega */}
      {(projectFile || deliveryDate) && (
        <div
          style={{
            display: "flex",
            gap: 10,
            marginBottom: 18,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {projectFile && <ProyectoButton file={projectFile} />}
        </div>
      )}

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
          <div style={{ fontSize: 13, lineHeight: 1.8 }}>
            {deliveryDate && (
              <div style={{ marginBottom: 18 }}>
                <strong
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    color: "var(--sand-dark)",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  Entrega del proyecto
                </strong>
                <DeliveryCountdown deliveryDate={deliveryDate} />
              </div>
            )}
            <div style={{ marginBottom: 14 }}>
              <strong
                style={{
                  fontSize: 10,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: "var(--sand-dark)",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Método
              </strong>
              {client.method}
            </div>
            <div style={{ marginBottom: 14 }}>
              <strong
                style={{
                  fontSize: 10,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: "var(--sand-dark)",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Fee mensual
              </strong>
              US$ {client.fee.toLocaleString()}
            </div>
            <div>
              <strong
                style={{
                  fontSize: 10,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: "var(--sand-dark)",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Sector
              </strong>
              {client.sector}
            </div>
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
