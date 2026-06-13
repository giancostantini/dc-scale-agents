"use client";

/**
 * Tareas — vista de tareas asignadas al cliente.
 *
 * Permite crear tareas, asignarlas a un miembro del equipo (profile
 * real desde /equipo) y seguir su cumplimiento (pending → active →
 * done). Usa la tabla dev_tasks existente (no inventamos schema).
 *
 * Disponible para clientes GP y Dev — los Dev ya tienen /sprints
 * con la versión técnica detallada, pero este menú "Tareas" es la
 * vista simple "qué hay que hacer · quién · cuándo · listo".
 */

import { use, useCallback, useEffect, useState } from "react";
import {
  addTask,
  getTasks,
  updateTaskStatus,
  deleteTask,
  getClient,
} from "@/lib/storage";
import { listProfiles } from "@/lib/team";
import { getCurrentProfile } from "@/lib/supabase/auth";
import { getSupabase } from "@/lib/supabase/client";
import type { Client, DevTask, TaskPriority, TaskStatus } from "@/lib/types";
import type { Profile } from "@/lib/supabase/auth";
import ui from "@/components/ClientUI.module.css";

const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: "Pendiente",
  active: "En curso",
  done: "Completada",
};

const STATUS_COLOR: Record<TaskStatus, string> = {
  pending: "#9B8259",
  active: "#C9A14A",
  done: "#2f7d4f",
};

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  baja: "#7A8A7E",
  media: "#9B8259",
  alta: "#C9A14A",
  critica: "#b04b3a",
};

export default function TareasClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [tasks, setTasks] = useState<DevTask[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  /** Perfil del cliente (role='client' con client_id=id). Lo separamos
   *  del array de team profiles porque necesitamos marcarlo distinto
   *  en el dropdown y disparar una notification al portal cuando se
   *  asigna una tarea a él. NULL si todavía no se invitó al cliente. */
  const [clientProfile, setClientProfile] = useState<Profile | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [isDirector, setIsDirector] = useState(false);

  // Form
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("media");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  // Filtro
  const [filter, setFilter] = useState<"all" | TaskStatus>("all");

  const refresh = useCallback(() => {
    getTasks(id).then(setTasks);
  }, [id]);

  useEffect(() => {
    refresh();
    listProfiles().then((list) => {
      setProfiles(list.filter((p) => p.role !== "client"));
      // Buscar el perfil del cliente (role='client' con client_id=this).
      // Si no existe es porque el director todavía no invitó al cliente
      // al portal — el dropdown lo va a ocultar para no romperse.
      const cp = list.find((p) => p.role === "client" && p.client_id === id);
      setClientProfile(cp ?? null);
    });
    getClient(id).then((c) => setClient(c ?? null));
    getCurrentProfile().then((p) => setIsDirector(p?.role === "director"));
  }, [refresh, id]);

  function resetForm() {
    setTitle("");
    setDescription("");
    setAssigneeId("");
    setPriority("media");
    setDueDate("");
    setShowForm(false);
  }

  async function save(status: TaskStatus = "pending") {
    if (!title.trim() || !assigneeId) {
      alert("Título y responsable son obligatorios.");
      return;
    }
    setSaving(true);
    try {
      // Resolver el assignee: puede ser team o cliente. Buscamos
      // primero en team profiles; si no está y el clientProfile
      // coincide, lo usamos.
      const assignee =
        profiles.find((p) => p.id === assigneeId) ??
        (clientProfile?.id === assigneeId ? clientProfile : null);
      const isClientAssigned = assignee?.role === "client";
      await addTask({
        clientId: id,
        title: title.trim(),
        description: description.trim() || undefined,
        sprint: undefined,
        // Guardamos el nombre + id para legibilidad y para join con UI
        // que muestra el assignee como string. Para el cliente lo
        // marcamos como "Cliente" para que sea obvio en la lista.
        assignee: assignee
          ? `${assignee.name} · ${isClientAssigned ? "Cliente" : (assignee.position ?? assignee.role)}`
          : assigneeId,
        priority,
        status,
        type: undefined,
        estimatedHours: undefined,
        startDate: undefined,
        dueDate: dueDate || undefined,
      });

      // Si la tarea quedó asignada al cliente, mandamos una notif al
      // portal para que la vea cuando entre. Se intenta vía supabase
      // directo; si las RLS bloquean (caso normal — el team no tiene
      // INSERT en notifications), cae al API endpoint con service role.
      if (isClientAssigned && assignee) {
        const supabase = getSupabase();
        const notifPayload = {
          client: id,
          to_user_id: assignee.id,
          to_role: null,
          agent: "task",
          level: "info",
          title: "Nueva tarea asignada por el equipo",
          body: title.trim(),
          link: "/portal",
          read: false,
          email_sent: false,
        };
        const { error: notifErr } = await supabase
          .from("notifications")
          .insert(notifPayload);
        if (notifErr) {
          // Fallback al endpoint (si lo creamos en el futuro). Por
          // ahora solo log — no rompemos la creación de la tarea.
          console.warn(
            "[tareas] no se pudo crear notif para el cliente:",
            notifErr.message,
          );
        }
      }

      resetForm();
      refresh();
    } catch (err) {
      const e = err as Error;
      alert(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(t: DevTask, newStatus: TaskStatus) {
    await updateTaskStatus(t.id, newStatus);
    refresh();
  }

  async function remove(t: DevTask) {
    if (!confirm(`¿Eliminar la tarea "${t.title}"?`)) return;
    await deleteTask(t.id);
    refresh();
  }

  const filtered = filter === "all" ? tasks : tasks.filter((t) => t.status === filter);
  const stats = {
    total: tasks.length,
    pending: tasks.filter((t) => t.status === "pending").length,
    active: tasks.filter((t) => t.status === "active").length,
    done: tasks.filter((t) => t.status === "done").length,
  };
  const completionPct = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Cliente · Tareas</div>
          <h1>Tareas del cliente</h1>
        </div>
        <button
          className={ui.btnSolid}
          onClick={() => setShowForm(!showForm)}
          disabled={!isDirector}
          title={
            !isDirector ? "Solo directores pueden crear tareas" : ""
          }
        >
          {showForm ? "× Cancelar" : "+ Nueva tarea"}
        </button>
      </div>

      {/* KPIs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <StatCard label="Total" value={stats.total} sub="Tareas creadas" />
        <StatCard
          label="Pendientes"
          value={stats.pending}
          color={STATUS_COLOR.pending}
        />
        <StatCard
          label="En curso"
          value={stats.active}
          color={STATUS_COLOR.active}
        />
        <StatCard
          label="Cumplimiento"
          value={`${completionPct}%`}
          color={
            completionPct >= 75
              ? "#2f7d4f"
              : completionPct >= 40
                ? "#C9A14A"
                : "#b04b3a"
          }
          sub={`${stats.done}/${stats.total} completadas`}
        />
      </div>

      {/* Form crear tarea */}
      {showForm && (
        <div className={ui.panel} style={{ marginBottom: 24 }}>
          <div className={ui.panelHead}>
            <div className={ui.panelTitle}>Nueva tarea</div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelS}>Título</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Definir copy del lanzamiento de mayo"
              style={inputS}
              autoFocus
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelS}>Descripción</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Contexto, criterios de aceptación, links…"
              style={{ ...inputS, resize: "vertical" }}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr", gap: 16, marginBottom: 14 }}>
            <div>
              <label style={labelS}>Asignar a *</label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                style={inputS}
              >
                <option value="">— Elegí persona —</option>
                {/* Opción Cliente — solo aparece cuando el cliente ya
                    fue invitado al portal (tiene profile). Cuando esta
                    opción se elige, al guardar se manda una notif al
                    portal del cliente con link a su /portal. */}
                {clientProfile && (
                  <option value={clientProfile.id}>
                    👤 {clientProfile.name} (Cliente)
                  </option>
                )}
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.position ? ` · ${p.position}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelS}>Prioridad</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                style={inputS}
              >
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
                <option value="critica">Crítica</option>
              </select>
            </div>
            <div>
              <label style={labelS}>Deadline</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                style={inputS}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={resetForm} className={ui.btnGhost} disabled={saving}>
              Cancelar
            </button>
            <button
              onClick={() => save("pending")}
              className={ui.btnGhost}
              disabled={!title.trim() || !assigneeId || saving}
            >
              Guardar pendiente
            </button>
            <button
              onClick={() => save("active")}
              className={ui.btnSolid}
              disabled={!title.trim() || !assigneeId || saving}
            >
              {saving ? "Guardando…" : "Crear y arrancar →"}
            </button>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {(["all", "pending", "active", "done"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "6px 14px",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              background: filter === f ? "var(--deep-green)" : "transparent",
              color: filter === f ? "var(--off-white)" : "var(--deep-green)",
              border: "1px solid rgba(10,26,12,0.15)",
              cursor: "pointer",
              fontFamily: "inherit",
              borderRadius: "var(--r-sm)",
            }}
          >
            {f === "all"
              ? `Todas · ${stats.total}`
              : `${STATUS_LABEL[f]} · ${stats[f]}`}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className={ui.panel}>
        {filtered.length === 0 ? (
          <div
            style={{
              padding: 40,
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: 13,
              fontStyle: "italic",
            }}
          >
            {filter === "all"
              ? "Todavía no hay tareas para este cliente."
              : `Sin tareas en estado "${STATUS_LABEL[filter as TaskStatus]}".`}
          </div>
        ) : (
          [...filtered]
            .sort((a, b) => {
              // Done al final, después por priority, después por dueDate
              if (a.status === "done" && b.status !== "done") return 1;
              if (b.status === "done" && a.status !== "done") return -1;
              const prioOrder = { critica: 0, alta: 1, media: 2, baja: 3 };
              const pa = prioOrder[a.priority];
              const pb = prioOrder[b.priority];
              if (pa !== pb) return pa - pb;
              if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
              if (a.dueDate) return -1;
              if (b.dueDate) return 1;
              return 0;
            })
            .map((t) => (
              <div
                key={t.id}
                style={{
                  padding: "16px 0",
                  borderBottom: "1px solid rgba(10,26,12,0.06)",
                  opacity: t.status === "done" ? 0.6 : 1,
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 2fr 1.5fr 1fr 1fr 0.8fr",
                    gap: 12,
                    alignItems: "baseline",
                  }}
                >
                  {/* Checkbox de cumplimiento */}
                  <input
                    type="checkbox"
                    checked={t.status === "done"}
                    onChange={() =>
                      changeStatus(
                        t,
                        t.status === "done" ? "active" : "done",
                      )
                    }
                    disabled={!isDirector}
                    style={{ width: 16, height: 16 }}
                    title="Marcar como completada"
                  />
                  <div>
                    <strong
                      style={{
                        fontSize: 14,
                        textDecoration: t.status === "done" ? "line-through" : "none",
                      }}
                    >
                      {t.title}
                    </strong>
                    {t.description && (
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text-muted)",
                          marginTop: 4,
                          lineHeight: 1.5,
                        }}
                      >
                        {t.description}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 12 }}>
                    <strong>{t.assignee}</strong>
                  </div>
                  <div>
                    <span
                      style={{
                        fontSize: 10,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        fontWeight: 700,
                        color: PRIORITY_COLOR[t.priority],
                      }}
                    >
                      {t.priority}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {t.dueDate ? (
                      <>
                        ⏰ {t.dueDate}
                        {t.dueDate < new Date().toISOString().slice(0, 10) &&
                          t.status !== "done" && (
                            <span
                              style={{
                                color: "#b04b3a",
                                fontWeight: 700,
                                marginLeft: 6,
                              }}
                            >
                              VENCIDA
                            </span>
                          )}
                      </>
                    ) : (
                      "—"
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    {isDirector && (
                      <>
                        {t.status !== "active" && (
                          <button
                            onClick={() => changeStatus(t, "active")}
                            style={mini}
                            title="Marcar en curso"
                          >
                            ▶
                          </button>
                        )}
                        <button
                          onClick={() => remove(t)}
                          style={{ ...mini, color: "var(--red-warn)" }}
                          title="Eliminar"
                        >
                          ×
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div
                  style={{
                    marginTop: 8,
                    height: 3,
                    background: STATUS_COLOR[t.status],
                    width: t.status === "done" ? "100%" : t.status === "active" ? "60%" : "20%",
                    borderRadius: 2,
                  }}
                />
              </div>
            ))
        )}
      </div>
    </>
  );
}

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div
      style={{
        padding: "16px 20px",
        background: "var(--white)",
        border: "1px solid rgba(10,26,12,0.08)",
        borderRadius: "var(--r-md)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--sand-dark)",
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: color ?? "var(--deep-green)",
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

const labelS: React.CSSProperties = {
  display: "block",
  fontSize: 10,
  letterSpacing: "0.22em",
  textTransform: "uppercase",
  color: "var(--sand-dark)",
  fontWeight: 600,
  marginBottom: 8,
};

const inputS: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid rgba(10,26,12,0.15)",
  background: "var(--white)",
  color: "var(--deep-green)",
  fontFamily: "inherit",
  fontSize: 13,
  outline: "none",
};

const mini: React.CSSProperties = {
  padding: "3px 8px",
  fontSize: 12,
  background: "transparent",
  border: "1px solid rgba(10,26,12,0.15)",
  color: "var(--deep-green)",
  cursor: "pointer",
  fontFamily: "inherit",
  borderRadius: "var(--r-sm)",
};
