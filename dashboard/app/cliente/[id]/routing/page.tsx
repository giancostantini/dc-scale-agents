"use client";

import { use, useCallback, useEffect, useState } from "react";
import { addRule, deleteRule, getRouting } from "@/lib/storage";
import type { RoutingRule } from "@/lib/types";
import ui from "@/components/ClientUI.module.css";

export default function RoutingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [show, setShow] = useState(false);

  const [task, setTask] = useState("");
  const [executor, setExecutor] = useState("");
  const [condition, setCondition] = useState("Siempre");
  const [requiresAuth, setRequiresAuth] = useState(false);

  const refresh = useCallback(() => {
    getRouting(id).then(setRules);
  }, [id]);
  useEffect(() => refresh(), [refresh]);

  async function save() {
    if (!task.trim() || !executor.trim()) return;
    await addRule({
      clientId: id,
      task: task.trim(),
      executor: executor.trim(),
      condition: condition.trim() || "Siempre",
      requiresAuth,
    });
    setTask("");
    setExecutor("");
    setCondition("Siempre");
    setRequiresAuth(false);
    setShow(false);
    refresh();
  }

  async function remove(rid: string) {
    if (!confirm("¿Eliminar esta regla?")) return;
    await deleteRule(rid);
    refresh();
  }

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Operación · Routing de autorizaciones</div>
          <h1>Quién autoriza qué</h1>
        </div>
        <button className={ui.btnSolid} onClick={() => setShow(true)}>+ Nueva regla</button>
      </div>

      <p style={{ maxWidth: 720, color: "var(--text-muted)", marginBottom: 28, fontSize: 14, lineHeight: 1.6 }}>
        Definí qué tareas requieren autorización del director antes de ejecutarse.
        Las que no la requieren las ejecuta el equipo o los agentes directamente.
      </p>

      {show && (
        <div className={ui.panel} style={{ marginBottom: 20, borderLeft: "3px solid var(--sand)" }}>
          <div className={ui.panelHead}>
            <div className={ui.panelTitle}>Nueva regla</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelS}>Tarea</label>
              <input value={task} onChange={(e) => setTask(e.target.value)} placeholder="Ej: Escalar presupuesto Meta" style={inputS} autoFocus />
            </div>
            <div>
              <label style={labelS}>Ejecutor</label>
              <input value={executor} onChange={(e) => setExecutor(e.target.value)} placeholder="Ej: Martín · Media Buyer" style={inputS} />
            </div>
            <div>
              <label style={labelS}>Condición</label>
              <input value={condition} onChange={(e) => setCondition(e.target.value)} placeholder="Ej: Si +$500/mes" style={inputS} />
            </div>
            <div>
              <label style={labelS}>Autoriza</label>
              <select value={requiresAuth ? "yes" : "no"} onChange={(e) => setRequiresAuth(e.target.value === "yes")} style={inputS}>
                <option value="no">Auto</option>
                <option value="yes">Requiere director</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button className={ui.btnGhost} onClick={() => setShow(false)}>Cancelar</button>
            <button className={ui.btnSolid} onClick={save}>Crear regla →</button>
          </div>
        </div>
      )}

      {rules.length === 0 ? (
        <div className={ui.empty}>
          <div className={ui.emptyIcon}>⇄</div>
          <div className={ui.emptyTitle}>Sin reglas todavía</div>
          <div className={ui.emptyDesc}>
            Creá reglas para definir qué acciones necesitan aprobación del
            director antes de ejecutarse.
          </div>
          <button className={ui.btnSolid} onClick={() => setShow(true)}>+ Primera regla</button>
        </div>
      ) : (
        <div className={ui.panel}>
          <div className={ui.panelHead}>
            <div className={ui.panelTitle}>Reglas activas · {rules.length}</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr 0.8fr 40px", gap: 16, padding: "10px 0", borderBottom: "1px solid rgba(10,26,12,0.08)", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--sand-dark)", fontWeight: 600 }}>
            <div>Tarea</div><div>Ejecutor</div><div>Condición</div><div>Autoriza</div><div></div>
          </div>
          {rules.map((r) => (
            <div key={r.id} style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr 0.8fr 40px", gap: 16, padding: "12px 0", borderBottom: "1px solid rgba(10,26,12,0.05)", fontSize: 13, alignItems: "center" }}>
              <div style={{ fontWeight: 500 }}>{r.task}</div>
              <div style={{ color: "var(--text-muted)", fontSize: 12 }}>{r.executor}</div>
              <div style={{ color: "var(--text-muted)", fontSize: 12 }}>{r.condition}</div>
              <div>
                <span className={`${ui.pill} ${r.requiresAuth ? ui.pillYellow : ui.pillGreen}`}>
                  {r.requiresAuth ? "Requerida" : "Auto"}
                </span>
              </div>
              <div>
                <button onClick={() => remove(r.id)} style={{ color: "var(--red-warn)", fontSize: 16, background: "transparent", border: "none", cursor: "pointer" }}>×</button>
              </div>
            </div>
          ))}
        </div>
      )}
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
