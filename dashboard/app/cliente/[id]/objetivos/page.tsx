"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getObjectives, saveObjectives } from "@/lib/storage";
import { getCurrentProfile } from "@/lib/supabase/auth";
import type { ClientObjectives, ObjectiveItem } from "@/lib/types";
import ui from "@/components/ClientUI.module.css";

const PERIOD_TYPES = [
  { value: "monthly" as const, label: "Mensual", sub: "30 días" },
  { value: "quarterly" as const, label: "Trimestral", sub: "3 meses" },
  { value: "semester" as const, label: "Semestral", sub: "6 meses" },
  { value: "annual" as const, label: "Anual", sub: "12 meses" },
];

export default function ObjetivosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [isDirector, setIsDirector] = useState<boolean | null>(null);
  const [currentUserName, setCurrentUserName] = useState("");

  const [period, setPeriod] = useState("");
  const [periodType, setPeriodType] = useState<ClientObjectives["periodType"]>("monthly");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [items, setItems] = useState<ObjectiveItem[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getCurrentProfile().then((profile) => {
      if (!profile) {
        router.replace("/");
        return;
      }
      setIsDirector(profile.role === "director");
      setCurrentUserName(profile.name);

      getObjectives(id).then((existing) => {
        if (existing) {
          setPeriod(existing.period);
          setPeriodType(existing.periodType);
          setStartDate(existing.startDate);
          setEndDate(existing.endDate);
          setItems(existing.items);
        } else {
          const now = new Date();
          const monthLabel = now.toLocaleDateString("es-UY", { month: "long", year: "numeric" });
          setPeriod(monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1));
          setStartDate(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10));
          setEndDate(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10));
        }
      });
    });
  }, [id, router]);

  if (isDirector === null) return null;

  if (!isDirector) {
    return (
      <>
        <div className={ui.head}>
          <div>
            <div className={ui.eyebrow}>Acceso restringido</div>
            <h1>Solo directores</h1>
          </div>
        </div>
        <div className={ui.empty}>
          <div className={ui.emptyIcon}>⬟</div>
          <div className={ui.emptyTitle}>Esta sección es privada</div>
          <div className={ui.emptyDesc}>
            Solo el director de la cuenta puede setear y modificar los objetivos
            del cliente. Contactate con Federico o Gianluca si necesitás ajustarlos.
          </div>
        </div>
      </>
    );
  }

  function addRow() {
    setItems([
      ...items,
      { id: `obj_${Date.now()}`, name: "", now: "", target: "", unit: "", pct: 0 },
    ]);
  }

  function updateItem(idx: number, patch: Partial<ObjectiveItem>) {
    const next = [...items];
    next[idx] = { ...next[idx], ...patch };
    // auto-calc pct si now/target son numéricos
    if (patch.now !== undefined || patch.target !== undefined) {
      const now = parseFloat(String(next[idx].now).replace(/[^\d.-]/g, ""));
      const target = parseFloat(String(next[idx].target).replace(/[^\d.-]/g, ""));
      if (!isNaN(now) && !isNaN(target) && target !== 0) {
        next[idx].pct = Math.max(0, Math.min(100, Math.round((now / target) * 100)));
      }
    }
    setItems(next);
  }

  function removeItem(idx: number) {
    setItems(items.filter((_, i) => i !== idx));
  }

  async function save() {
    const obj: ClientObjectives = {
      clientId: id,
      period,
      periodType,
      startDate,
      endDate,
      items: items.filter((i) => i.name.trim()),
      updatedAt: new Date().toISOString(),
      updatedBy: currentUserName,
    };
    await saveObjectives(obj);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Director · Configuración privada</div>
          <h1>Setear objetivos</h1>
        </div>
        <div
          style={{
            padding: "8px 14px",
            background: "var(--deep-green)",
            color: "var(--sand)",
            fontSize: 10,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          ◆ Solo director
        </div>
      </div>

      <p style={{ maxWidth: 720, color: "var(--text-muted)", marginBottom: 28, fontSize: 14, lineHeight: 1.6 }}>
        Definí los objetivos del cliente para el período que elijas. Se reflejan
        automáticamente en el dashboard principal. El resto del equipo los ve pero
        no puede modificarlos.
      </p>

      {/* Período */}
      <div className={ui.panel} style={{ marginBottom: 24 }}>
        <div className={ui.panelHead}>
          <div className={ui.panelTitle}>Período</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          {PERIOD_TYPES.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriodType(p.value)}
              style={{
                padding: 18,
                border: `2px solid ${periodType === p.value ? "var(--sand)" : "rgba(10,26,12,0.08)"}`,
                background: periodType === p.value ? "var(--off-white)" : "var(--white)",
                textAlign: "center",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>{p.label}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{p.sub}</div>
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
          <Field label="Fecha inicio">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="Fecha fin">
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
          <Field label="Etiqueta del período">
            <input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="Ej: Abril 2026" />
          </Field>
        </div>
      </div>

      {/* Objetivos */}
      <div className={ui.panel}>
        <div className={ui.panelHead}>
          <div className={ui.panelTitle}>Objetivos · {items.length}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Se muestran en el dashboard del cliente
          </div>
        </div>

        {items.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            Todavía no agregaste objetivos.
          </div>
        ) : (
          items.map((it, idx) => (
            <div
              key={it.id}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1fr 1fr 32px",
                gap: 12,
                padding: "14px 0",
                borderBottom: "1px solid rgba(10,26,12,0.05)",
                alignItems: "center",
              }}
            >
              <input
                value={it.name}
                onChange={(e) => updateItem(idx, { name: e.target.value })}
                placeholder="Nombre del objetivo"
                style={rowInput}
              />
              <input
                value={it.now}
                onChange={(e) => updateItem(idx, { now: e.target.value })}
                placeholder="Actual"
                style={{ ...rowInput, fontWeight: 600 }}
              />
              <input
                value={it.target}
                onChange={(e) => updateItem(idx, { target: e.target.value })}
                placeholder="Target"
                style={{ ...rowInput, fontWeight: 600 }}
              />
              <input
                value={it.unit}
                onChange={(e) => updateItem(idx, { unit: e.target.value })}
                placeholder="Unidad (%, x, $)"
                style={rowInput}
              />
              <button onClick={() => removeItem(idx)} style={{ color: "var(--red-warn)", fontSize: 18, background: "transparent", border: "none", cursor: "pointer" }}>
                ×
              </button>
            </div>
          ))
        )}

        <button
          onClick={addRow}
          style={{
            marginTop: 14,
            padding: "10px 16px",
            fontSize: 11,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "var(--sand-dark)",
            fontWeight: 600,
            border: "1px dashed rgba(196,168,130,0.4)",
            background: "transparent",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          + Agregar objetivo
        </button>
      </div>

      <div style={{ marginTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {saved && <span style={{ color: "var(--green-ok)" }}>✓ Guardado</span>}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className={ui.btnGhost} onClick={() => router.push(`/cliente/${id}`)}>
            Cancelar
          </button>
          <button className={ui.btnSolid} onClick={save}>
            Guardar objetivos →
          </button>
        </div>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: 9,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--sand-dark)",
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const rowInput: React.CSSProperties = {
  width: "100%",
  padding: "8px 0",
  border: "none",
  borderBottom: "1px solid rgba(10,26,12,0.1)",
  background: "transparent",
  color: "var(--deep-green)",
  fontFamily: "inherit",
  fontSize: 13,
  outline: "none",
};
