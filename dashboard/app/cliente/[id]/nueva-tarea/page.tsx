"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { addTask } from "@/lib/storage";
import type { TaskPriority, TaskStatus } from "@/lib/types";
import ui from "@/components/ClientUI.module.css";

export default function NuevaTareaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sprint, setSprint] = useState("Sprint 1 · Discovery");
  const [assignee, setAssignee] = useState("Gianluca · Líder proyecto");
  const [priority, setPriority] = useState<TaskPriority>("media");
  const [type, setType] = useState("");
  const [hours, setHours] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");

  async function save(status: TaskStatus = "pending") {
    if (!title.trim()) return;
    await addTask({
      clientId: id,
      title: title.trim(),
      description: description.trim() || undefined,
      sprint,
      assignee,
      priority,
      status,
      type: type.trim() || undefined,
      estimatedHours: hours ? Number(hours) : undefined,
      startDate: startDate || undefined,
      dueDate: dueDate || undefined,
    });
    router.push(`/cliente/${id}/sprints`);
  }

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Desarrollo · Crear nueva tarea</div>
          <h1>Nueva tarea</h1>
        </div>
        <button className={ui.btnGhost} onClick={() => router.push(`/cliente/${id}/sprints`)}>
          ← Volver a sprints
        </button>
      </div>

      <div className={ui.panel} style={{ marginBottom: 20 }}>
        <div className={ui.panelHead}>
          <div className={ui.panelTitle}>Información de la tarea</div>
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={labelS}>Título</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej: Integración WhatsApp Business API"
            style={inputS}
            autoFocus
          />
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={labelS}>Descripción</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Detalles técnicos, criterios de aceptación, dependencias…"
            style={{ ...inputS, resize: "vertical" }}
          />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
          <div>
            <label style={labelS}>Sprint</label>
            <select value={sprint} onChange={(e) => setSprint(e.target.value)} style={inputS}>
              <option>Sprint 1 · Discovery</option>
              <option>Sprint 2 · Arquitectura</option>
              <option>Sprint 3 · Desarrollo core</option>
              <option>Sprint 4 · Integración</option>
              <option>Sprint 5 · QA + Deploy</option>
              <option>Backlog</option>
            </select>
          </div>
          <div>
            <label style={labelS}>Responsable</label>
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)} style={inputS}>
              <option>Gianluca · Líder proyecto</option>
              <option>Diego · Dev</option>
              <option>Camila · Ops</option>
              <option>Federico · Director</option>
            </select>
          </div>
          <div>
            <label style={labelS}>Prioridad</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} style={inputS}>
              <option value="baja">Baja</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
              <option value="critica">Crítica</option>
            </select>
          </div>
        </div>
      </div>

      <div className={ui.panel} style={{ marginBottom: 20 }}>
        <div className={ui.panelHead}>
          <div className={ui.panelTitle}>Estimación y fechas</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
          <div>
            <label style={labelS}>Horas estimadas</label>
            <input type="number" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="8" style={inputS} />
          </div>
          <div>
            <label style={labelS}>Inicio</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputS} />
          </div>
          <div>
            <label style={labelS}>Deadline</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputS} />
          </div>
        </div>
        <div style={{ marginTop: 18 }}>
          <label style={labelS}>Tipo / stack</label>
          <input value={type} onChange={(e) => setType(e.target.value)} placeholder="Backend · Frontend · IA · DevOps · QA…" style={inputS} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button className={ui.btnGhost} onClick={() => router.push(`/cliente/${id}/sprints`)}>
          Cancelar
        </button>
        <button className={ui.btnGhost} onClick={() => save("pending")} disabled={!title.trim()}>
          Guardar pendiente
        </button>
        <button className={ui.btnSolid} onClick={() => save("active")} disabled={!title.trim()}>
          Crear y arrancar →
        </button>
      </div>
    </>
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
