"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getClient,
  getObjectives,
  getProdCampaigns,
  getTasks,
} from "@/lib/storage";
import { getCurrentProfile } from "@/lib/supabase/auth";
import type {
  Client,
  ClientObjectives,
  ProductionCampaign,
  DevTask,
} from "@/lib/types";
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
  const [isDirector, setIsDirector] = useState(false);

  useEffect(() => {
    Promise.all([
      getClient(id),
      getObjectives(id),
      getProdCampaigns(id),
      getTasks(id),
      getCurrentProfile(),
    ]).then(([c, o, p, t, profile]) => {
      setClient(c ?? null);
      setObjectives(o);
      setCampaigns(p);
      setTasks(t);
      setIsDirector(profile?.role === "director");
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
    />
  ) : (
    <DevDashboard client={client} tasks={tasks} />
  );
}

// ==================== GROWTH PARTNER DASHBOARD ====================

function GPDashboard({
  client,
  objectives,
  campaigns,
  isDirector,
}: {
  client: Client;
  objectives?: ClientObjectives;
  campaigns: ProductionCampaign[];
  isDirector: boolean;
}) {
  const router = useRouter();
  const k = client.kpis;
  const prodSpent = campaigns.reduce((s, c) => s + c.spent, 0);

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Growth Partner · {client.method}</div>
          <h1>{client.name}</h1>
        </div>
        <div
          className={`${ui.phaseBadge} ${
            client.status === "active" ? ui.phaseBadgeExec : ""
          }`}
        >
          {client.phase}
        </div>
      </div>

      <div className={ui.kpiGrid}>
        <div className={ui.kpiCell}>
          <div className={ui.kLabel}>ROAS</div>
          <div className={ui.kValue}>{k?.roas || "—"}</div>
          <div className={ui.kDelta}>Mes actual</div>
        </div>
        <div className={ui.kpiCell}>
          <div className={ui.kLabel}>Leads</div>
          <div className={ui.kValue}>{k?.leads ?? "—"}</div>
        </div>
        <div className={ui.kpiCell}>
          <div className={ui.kLabel}>CAC</div>
          <div className={ui.kValue}>{k?.cac || "—"}</div>
        </div>
        <div className={ui.kpiCell}>
          <div className={ui.kLabel}>Inversión</div>
          <div className={ui.kValue}>{k?.invested || "—"}</div>
        </div>
        <div className={ui.kpiCell}>
          <div className={ui.kLabel}>Revenue</div>
          <div className={ui.kValue}>{k?.revenue || "—"}</div>
        </div>
        <div className={ui.kpiCell}>
          <div className={ui.kLabel}>Conversión</div>
          <div className={ui.kValue}>{k?.conv || "—"}</div>
        </div>
      </div>

      <div className={ui.panelGrid}>
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

        <div className={ui.panel}>
          <div className={ui.panelHead}>
            <div className={ui.panelTitle}>Presupuesto</div>
          </div>
          <div>
            <div
              style={{
                fontSize: 11,
                letterSpacing: "0.15em",
                color: "var(--sand-dark)",
                textTransform: "uppercase",
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              Fee mensual
            </div>
            <div
              style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em" }}
            >
              US$ {client.fee.toLocaleString()}
            </div>
          </div>
          <div
            style={{
              marginTop: 20,
              paddingTop: 20,
              borderTop: "1px solid rgba(10,26,12,0.08)",
            }}
          >
            <div
              style={{
                fontSize: 11,
                letterSpacing: "0.15em",
                color: "var(--sand-dark)",
                textTransform: "uppercase",
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              Campañas producción
            </div>
            <div
              style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}
            >
              US$ {prodSpent.toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
              {campaigns.length} campaña{campaigns.length === 1 ? "" : "s"}
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

// ==================== DEV DASHBOARD ====================

function DevDashboard({
  client,
  tasks,
}: {
  client: Client;
  tasks: DevTask[];
}) {
  const router = useRouter();
  const done = tasks.filter((t) => t.status === "done").length;
  const active = tasks.filter((t) => t.status === "active").length;
  const pending = tasks.filter((t) => t.status === "pending").length;
  const progress =
    tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Desarrollo · {client.method}</div>
          <h1>{client.name}</h1>
        </div>
        <div className={ui.phaseBadge}>{client.phase}</div>
      </div>

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
