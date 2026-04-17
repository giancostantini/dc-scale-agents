"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteTask, getTasks, updateTaskStatus } from "@/lib/storage";
import type { DevTask, TaskStatus } from "@/lib/types";
import ui from "@/components/ClientUI.module.css";

const STATUS_CYCLE: Record<TaskStatus, TaskStatus> = {
  pending: "active",
  active: "done",
  done: "pending",
};

export default function SprintsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [tasks, setTasks] = useState<DevTask[]>([]);

  const refresh = useCallback(() => {
    getTasks(id).then(setTasks);
  }, [id]);
  useEffect(() => refresh(), [refresh]);

  const grouped = tasks.reduce((acc, t) => {
    const key = t.sprint || "Sin sprint";
    (acc[key] ??= []).push(t);
    return acc;
  }, {} as Record<string, DevTask[]>);

  const done = tasks.filter((t) => t.status === "done").length;
  const active = tasks.filter((t) => t.status === "active").length;
  const pending = tasks.filter((t) => t.status === "pending").length;

  async function cycle(t: DevTask) {
    await updateTaskStatus(t.id, STATUS_CYCLE[t.status]);
    refresh();
  }

  async function remove(tid: string) {
    if (!confirm("¿Eliminar esta tarea?")) return;
    await deleteTask(tid);
    refresh();
  }

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Desarrollo · Gestión de sprints</div>
          <h1>Sprints del proyecto</h1>
        </div>
        <button className={ui.btnSolid} onClick={() => router.push(`/cliente/${id}/nueva-tarea`)}>
          + Nueva tarea
        </button>
      </div>

      <div className={ui.kpiGrid} style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className={ui.kpiCell}>
          <div className={ui.kLabel}>Tareas totales</div>
          <div className={ui.kValue}>{tasks.length}</div>
        </div>
        <div className={ui.kpiCell}>
          <div className={ui.kLabel}>Done</div>
          <div className={ui.kValue} style={{ color: "var(--green-ok)" }}>{done}</div>
        </div>
        <div className={ui.kpiCell}>
          <div className={ui.kLabel}>En curso</div>
          <div className={ui.kValue} style={{ color: "var(--sand-dark)" }}>{active}</div>
        </div>
        <div className={ui.kpiCell}>
          <div className={ui.kLabel}>Pendientes</div>
          <div className={ui.kValue} style={{ color: "var(--text-muted)" }}>{pending}</div>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className={ui.empty}>
          <div className={ui.emptyIcon}>▣</div>
          <div className={ui.emptyTitle}>Sin tareas todavía</div>
          <div className={ui.emptyDesc}>
            Creá la primera tarea para arrancar el tracking del proyecto.
          </div>
          <button className={ui.btnSolid} onClick={() => router.push(`/cliente/${id}/nueva-tarea`)}>
            + Primera tarea
          </button>
        </div>
      ) : (
        Object.entries(grouped).map(([sprint, sprintTasks]) => {
          const sDone = sprintTasks.filter((t) => t.status === "done").length;
          const pct = sprintTasks.length ? Math.round((sDone / sprintTasks.length) * 100) : 0;
          return (
            <div
              key={sprint}
              className={ui.panel}
              style={{ marginBottom: 20, borderLeft: `3px solid ${pct === 100 ? "var(--green-ok)" : "var(--sand)"}` }}
            >
              <div className={ui.panelHead}>
                <div>
                  <div style={{ fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--sand-dark)", fontWeight: 600, marginBottom: 4 }}>
                    {sprint}
                  </div>
                  <div className={ui.panelTitle}>
                    {sDone} / {sprintTasks.length} tareas · {pct}%
                  </div>
                </div>
              </div>
              <div className={ui.progressBar}>
                <div
                  className={ui.progressFill}
                  style={{ width: `${pct}%`, background: pct === 100 ? "var(--green-ok)" : "var(--sand)" }}
                />
              </div>
              <div style={{ marginTop: 14 }}>
                {sprintTasks.map((t) => (
                  <div
                    key={t.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      padding: "10px 0",
                      borderTop: "1px solid rgba(10,26,12,0.05)",
                    }}
                  >
                    <button
                      onClick={() => cycle(t)}
                      style={{
                        width: 16,
                        height: 16,
                        border: "1.5px solid var(--sand-dark)",
                        borderRadius: 3,
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
                        cursor: "pointer",
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, textDecoration: t.status === "done" ? "line-through" : "none", color: t.status === "done" ? "var(--text-muted)" : "var(--deep-green)" }}>
                        {t.title}
                      </div>
                      {t.description && (
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                          {t.description}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{t.assignee}</div>
                    <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600, color: t.status === "done" ? "var(--green-ok)" : t.status === "active" ? "var(--sand-dark)" : "var(--text-muted)", minWidth: 80, textAlign: "right" }}>
                      {t.status === "done" ? "Done" : t.status === "active" ? "In progress" : "Pending"}
                    </div>
                    <button
                      onClick={() => remove(t.id)}
                      style={{ color: "var(--red-warn)", fontSize: 14, background: "transparent", border: "none", cursor: "pointer" }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
    </>
  );
}
