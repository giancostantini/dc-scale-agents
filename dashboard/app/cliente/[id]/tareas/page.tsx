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
  updateTaskProgress,
  updateTaskAttachments,
  deleteTask,
  getClient,
} from "@/lib/storage";
import { listProfiles } from "@/lib/team";
import { getCurrentProfile } from "@/lib/supabase/auth";
import { getSupabase } from "@/lib/supabase/client";
import { uploadTaskAttachment } from "@/lib/upload";
import type {
  Client,
  DevTask,
  TaskAttachment,
  TaskPriority,
  TaskStatus,
} from "@/lib/types";
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
  // Director o team pueden gestionar el estado de las tareas (marcar hecha /
  // en curso). La RLS de dev_tasks (migración 079) enforce que un team solo
  // escribe si está asignado al cliente; acá habilitamos la UI para ambos.
  const [canManage, setCanManage] = useState(false);

  // Form
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("media");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  // Adjunto solicitado en la tarea nueva.
  const [attachmentRequested, setAttachmentRequested] = useState(false);
  const [attachmentNote, setAttachmentNote] = useState("");

  // Filtro
  const [filter, setFilter] = useState<"all" | TaskStatus>("all");
  // Tarea con subida de adjunto en curso.
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  // Tarea abierta en el modal de detalle (id; el objeto se deriva fresco
  // de `tasks` para reflejar cambios tras refresh).
  const [detailId, setDetailId] = useState<string | null>(null);

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
    getCurrentProfile().then((p) => {
      setIsDirector(p?.role === "director");
      setCanManage(p?.role === "director" || p?.role === "team");
    });
  }, [refresh, id]);

  function resetForm() {
    setTitle("");
    setDescription("");
    setAssigneeId("");
    setPriority("media");
    setDueDate("");
    setAttachmentRequested(false);
    setAttachmentNote("");
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
      const createdTask = await addTask({
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
        progress: status === "done" ? 100 : 0,
        attachmentRequested,
        attachmentNote: attachmentRequested ? attachmentNote.trim() || null : null,
        attachments: [],
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

        // Además del notif del portal, disparamos email al cliente
        // vía /api/notify (kind: client_task_assigned). Fire-and-forget:
        // no bloquea la creación de la tarea si el email falla. El
        // endpoint respeta email_on_task_assigned del profile portal.
        fetch("/api/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "client_task_assigned",
            taskId: createdTask.id,
            clientId: id,
          }),
        }).catch((err) =>
          console.warn("[tareas] email al cliente falló:", err),
        );
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

  async function changeProgress(t: DevTask, value: number) {
    // Update optimista para que la barra no "salte" mientras arrastran.
    setTasks((prev) =>
      prev.map((x) => (x.id === t.id ? { ...x, progress: value } : x)),
    );
    try {
      await updateTaskProgress(t.id, value, t.status);
      refresh();
    } catch (err) {
      alert(`No se pudo actualizar el avance: ${(err as Error).message}`);
      refresh();
    }
  }

  async function onUploadAttachment(t: DevTask, file: File | null) {
    if (!file) return;
    // 10 MB tope razonable para PDF/foto de tarea.
    if (file.size > 10 * 1024 * 1024) {
      alert("El archivo supera los 10 MB.");
      return;
    }
    setUploadingId(t.id);
    try {
      const up = await uploadTaskAttachment(file, id);
      const next: TaskAttachment[] = [
        ...(t.attachments ?? []),
        {
          name: up.name,
          url: up.url ?? "",
          type: up.type,
          size: up.size,
          uploadedAt: new Date().toISOString(),
        },
      ];
      await updateTaskAttachments(t.id, next);
      refresh();
    } catch (err) {
      alert(`No se pudo subir el archivo: ${(err as Error).message}`);
    } finally {
      setUploadingId(null);
    }
  }

  async function removeAttachment(t: DevTask, index: number) {
    if (!confirm("¿Quitar este archivo de la tarea?")) return;
    const next = (t.attachments ?? []).filter((_, i) => i !== index);
    try {
      await updateTaskAttachments(t.id, next);
      refresh();
    } catch (err) {
      alert(`No se pudo quitar: ${(err as Error).message}`);
    }
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
  // Tarea abierta en el modal (derivada fresca de `tasks`).
  const detailTask = detailId
    ? tasks.find((t) => t.id === detailId) ?? null
    : null;

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

          {/* Pedir archivo adjunto: si se activa, el asignado ve el pedido
              en la tarea y sube el PDF o la foto. */}
          <div style={{ marginBottom: 14 }}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                color: "var(--deep-green)",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={attachmentRequested}
                onChange={(e) => setAttachmentRequested(e.target.checked)}
                style={{ width: 16, height: 16 }}
              />
              Pedir un archivo adjunto (PDF o foto)
            </label>
            {attachmentRequested && (
              <input
                value={attachmentNote}
                onChange={(e) => setAttachmentNote(e.target.value)}
                placeholder="¿Qué archivo? Ej: subí el PDF firmado / foto del local terminado"
                style={{ ...inputS, marginTop: 8 }}
              />
            )}
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
            .map((t) => {
              const attachCount = t.attachments?.length ?? 0;
              const overdue =
                !!t.dueDate &&
                t.dueDate < new Date().toISOString().slice(0, 10) &&
                t.status !== "done";
              return (
              <div
                key={t.id}
                onClick={() => setDetailId(t.id)}
                style={{
                  padding: "14px 0",
                  borderBottom: "1px solid rgba(10,26,12,0.06)",
                  opacity: t.status === "done" ? 0.6 : 1,
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 2fr 1.5fr 1fr 1fr 0.8fr",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  {/* Checkbox de cumplimiento — no abre el detalle. */}
                  <input
                    type="checkbox"
                    checked={t.status === "done"}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() =>
                      changeStatus(t, t.status === "done" ? "active" : "done")
                    }
                    disabled={!canManage}
                    style={{ width: 16, height: 16 }}
                    title="Marcar como completada"
                  />
                  <div style={{ minWidth: 0 }}>
                    <strong
                      style={{
                        fontSize: 14,
                        textDecoration:
                          t.status === "done" ? "line-through" : "none",
                      }}
                    >
                      {t.title}
                    </strong>
                    {/* Meta compacta: avance + adjunto. El desglose completo
                        va en el modal (click en la fila). */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginTop: 6,
                      }}
                    >
                      <div
                        style={{
                          flex: 1,
                          maxWidth: 160,
                          height: 6,
                          background: "rgba(10,26,12,0.08)",
                          borderRadius: 3,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${t.progress ?? 0}%`,
                            background: STATUS_COLOR[t.status],
                            borderRadius: 3,
                          }}
                        />
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: STATUS_COLOR[t.status],
                        }}
                      >
                        {t.progress ?? 0}%
                      </span>
                      {t.attachmentRequested && attachCount === 0 && (
                        <span style={{ fontSize: 11, color: "#b04b3a" }}>
                          📎 falta archivo
                        </span>
                      )}
                      {attachCount > 0 && (
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                          📎 {attachCount}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, minWidth: 0 }}>
                    <strong
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        display: "block",
                      }}
                    >
                      {t.assignee}
                    </strong>
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
                        {overdue && (
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
                  <div
                    style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => setDetailId(t.id)}
                      style={mini}
                      title="Ver detalle"
                    >
                      ⤢
                    </button>
                    {isDirector && (
                      <button
                        onClick={() => remove(t)}
                        style={{ ...mini, color: "var(--red-warn)" }}
                        title="Eliminar"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              </div>
              );
            })
        )}
      </div>

      {/* Modal de detalle — desglose completo de la tarea. */}
      {detailTask && (
        <div
          onClick={() => setDetailId(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(10,26,12,0.5)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--white)",
              borderRadius: "var(--r-lg)",
              padding: 28,
              width: "100%",
              maxWidth: 560,
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 24px 64px rgba(10,26,12,0.32)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
                marginBottom: 6,
              }}
            >
              <h2
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: "var(--deep-green)",
                  margin: 0,
                  letterSpacing: "-0.01em",
                  textDecoration:
                    detailTask.status === "done" ? "line-through" : "none",
                }}
              >
                {detailTask.title}
              </h2>
              <button
                onClick={() => setDetailId(null)}
                style={{ ...mini, fontSize: 18 }}
                title="Cerrar"
              >
                ×
              </button>
            </div>

            {/* Chips: estado / prioridad / responsable / deadline */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginBottom: 16,
                fontSize: 12,
              }}
            >
              <span
                style={{
                  padding: "3px 10px",
                  borderRadius: 999,
                  background: STATUS_COLOR[detailTask.status],
                  color: "#fff",
                  fontWeight: 700,
                }}
              >
                {STATUS_LABEL[detailTask.status]}
              </span>
              <span
                style={{
                  padding: "3px 10px",
                  borderRadius: 999,
                  border: `1px solid ${PRIORITY_COLOR[detailTask.priority]}`,
                  color: PRIORITY_COLOR[detailTask.priority],
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontSize: 10,
                }}
              >
                {detailTask.priority}
              </span>
              <span style={{ padding: "3px 10px", color: "var(--text-muted)" }}>
                👤 {detailTask.assignee}
              </span>
              {detailTask.dueDate && (
                <span style={{ padding: "3px 10px", color: "var(--text-muted)" }}>
                  ⏰ {detailTask.dueDate}
                </span>
              )}
            </div>

            {detailTask.description && (
              <div
                style={{
                  fontSize: 13,
                  color: "var(--deep-green)",
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                  marginBottom: 20,
                  paddingBottom: 16,
                  borderBottom: "1px solid rgba(10,26,12,0.08)",
                }}
              >
                {detailTask.description}
              </div>
            )}

            {/* Progreso */}
            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--sand-dark)",
                    fontWeight: 700,
                  }}
                >
                  Progreso
                </span>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: STATUS_COLOR[detailTask.status],
                  }}
                >
                  {detailTask.progress ?? 0}%
                </span>
              </div>
              <div
                style={{
                  height: 10,
                  background: "rgba(10,26,12,0.08)",
                  borderRadius: 5,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${detailTask.progress ?? 0}%`,
                    background: STATUS_COLOR[detailTask.status],
                    borderRadius: 5,
                    transition: "width 0.2s",
                  }}
                />
              </div>
              {canManage && (
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={detailTask.progress ?? 0}
                  onChange={(e) =>
                    changeProgress(detailTask, parseInt(e.target.value, 10))
                  }
                  style={{ width: "100%", marginTop: 8, cursor: "pointer" }}
                  title="Ajustar avance"
                />
              )}
            </div>

            {/* Adjuntos */}
            {(detailTask.attachmentRequested ||
              (detailTask.attachments && detailTask.attachments.length > 0)) && (
              <div
                style={{
                  padding: "12px 14px",
                  background: "var(--off-white)",
                  borderRadius: "var(--r-md)",
                  marginBottom: 20,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--sand-dark)",
                    fontWeight: 700,
                    marginBottom: 6,
                  }}
                >
                  📎 Archivo{" "}
                  {detailTask.attachmentRequested ? "solicitado" : "adjunto"}
                </div>
                {detailTask.attachmentRequested && detailTask.attachmentNote && (
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--deep-green)",
                      marginBottom: 10,
                    }}
                  >
                    {detailTask.attachmentNote}
                  </div>
                )}
                {detailTask.attachments && detailTask.attachments.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      marginBottom: canManage ? 10 : 0,
                    }}
                  >
                    {detailTask.attachments.map((a, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          fontSize: 13,
                        }}
                      >
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: "var(--deep-green)",
                            textDecoration: "underline",
                            flex: 1,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {(a.type ?? "").startsWith("image/") ? "🖼" : "📄"}{" "}
                          {a.name}
                        </a>
                        {canManage && (
                          <button
                            onClick={() => removeAttachment(detailTask, i)}
                            style={{ ...mini, color: "var(--red-warn)" }}
                            title="Quitar"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {canManage && (
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--deep-green)",
                      border: "1px solid rgba(10,26,12,0.15)",
                      borderRadius: "var(--r-sm)",
                      padding: "8px 14px",
                      cursor: uploadingId === detailTask.id ? "default" : "pointer",
                      background: "var(--white)",
                    }}
                  >
                    {uploadingId === detailTask.id
                      ? "Subiendo…"
                      : detailTask.attachments && detailTask.attachments.length > 0
                        ? "+ Subir otro"
                        : "+ Adjuntar PDF o foto"}
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      hidden
                      disabled={uploadingId === detailTask.id}
                      onChange={(e) => {
                        onUploadAttachment(detailTask, e.target.files?.[0] ?? null);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
              </div>
            )}

            {/* Acciones */}
            {canManage && (
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  justifyContent: "flex-end",
                }}
              >
                {detailTask.status !== "active" && detailTask.status !== "done" && (
                  <button
                    onClick={() => changeStatus(detailTask, "active")}
                    className={ui.btnGhost}
                  >
                    ▶ Marcar en curso
                  </button>
                )}
                <button
                  onClick={() =>
                    changeStatus(
                      detailTask,
                      detailTask.status === "done" ? "active" : "done",
                    )
                  }
                  className={ui.btnSolid}
                >
                  {detailTask.status === "done"
                    ? "Reabrir"
                    : "✓ Marcar completada"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
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
