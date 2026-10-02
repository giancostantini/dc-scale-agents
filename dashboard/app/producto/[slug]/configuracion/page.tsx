"use client";

/**
 * /producto/[slug]/configuracion — CONFIGURACIÓN: ajustes de la aplicación,
 * equipo interno, reglas de notificación y parámetros del sistema.
 * Todo visual/demo (no persiste).
 */

import { use, useState } from "react";
import { PRODUCT_BY_SLUG } from "@/lib/productos";
import { appMeta } from "@/lib/backoffice-demo";
import { BoHead, Card, DataTable, solidBtn, ghostBtn, selectStyle, type Column } from "@/components/backoffice/BackofficeUI";

type Tab = "app" | "equipo" | "notificaciones" | "parametros";

const TABS: { key: Tab; label: string }[] = [
  { key: "app", label: "Aplicación" },
  { key: "equipo", label: "Equipo" },
  { key: "notificaciones", label: "Notificaciones" },
  { key: "parametros", label: "Parámetros" },
];

interface Miembro { id: string; nombre: string; rol: string; email: string; }
const TEAM: Miembro[] = [
  { id: "m1", nombre: "Federico D.", rol: "Super Admin", email: "federico@dc.studio" },
  { id: "m2", nombre: "Gianluca C.", rol: "Administrador", email: "gianluca@dc.studio" },
  { id: "m3", nombre: "Equipo CS", rol: "Customer Success", email: "cs@dc.studio" },
  { id: "m4", nombre: "Soporte", rol: "Soporte", email: "soporte@dc.studio" },
];

const NOTIF_RULES: { key: string; label: string }[] = [
  { key: "uso80", label: "Avisar cuando un cliente supera el 80% del plan" },
  { key: "uso90", label: "Avisar cuando un cliente supera el 90% del plan" },
  { key: "inactivo", label: "Avisar cuando un cliente lleva X días inactivo" },
  { key: "pagoVence", label: "Avisar cuando un pago está por vencer" },
  { key: "pagoFalla", label: "Avisar cuando un pago falla" },
  { key: "integracionFalla", label: "Avisar cuando una integración falla" },
  { key: "errorCritico", label: "Avisar ante un error crítico de la aplicación" },
  { key: "churnRisk", label: "Avisar cuando un cliente entra en riesgo de churn" },
];

const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "var(--sand-dark)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, display: "block" };
const inputStyle: React.CSSProperties = { ...selectStyle, width: "100%", boxSizing: "border-box" };
const fieldStyle: React.CSSProperties = { marginBottom: 16 };
const gridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18 };

function tabBtn(active: boolean): React.CSSProperties {
  return {
    padding: "8px 14px", fontSize: 13, fontWeight: 600, border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
    background: active ? "var(--white)" : "transparent",
    color: active ? "var(--deep-green)" : "var(--text-muted)",
    boxShadow: active ? "var(--shadow-sm)" : "none",
  };
}

function Toggle({ on, onClick, accent }: { on: boolean; onClick: () => void; accent: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      style={{
        width: 42, height: 24, borderRadius: 999, border: "none", cursor: "pointer", padding: 2, flexShrink: 0,
        background: on ? accent : "rgba(10,26,12,0.18)", transition: "background 0.15s ease",
      }}
    >
      <span style={{ display: "block", width: 20, height: 20, borderRadius: 999, background: "#fff", transform: on ? "translateX(18px)" : "translateX(0)", transition: "transform 0.15s ease", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
    </button>
  );
}

export default function ConfiguracionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const p = PRODUCT_BY_SLUG[slug];
  const [tab, setTab] = useState<Tab>("app");
  const [notif, setNotif] = useState<Record<string, boolean>>({
    uso80: true, uso90: true, inactivo: false, pagoVence: true,
    pagoFalla: true, integracionFalla: true, errorCritico: true, churnRisk: false,
  });

  if (!p) return null;
  const meta = appMeta(slug);

  const guardar = () => window.alert("Configuración guardada (demo). Los cambios no persisten.");

  const teamColumns: Column<Miembro>[] = [
    { key: "nombre", header: "Nombre", render: (m) => <strong>{m.nombre}</strong> },
    { key: "rol", header: "Rol", render: (m) => m.rol },
    { key: "email", header: "Email", render: (m) => <span style={{ color: "var(--text-muted)" }}>{m.email}</span> },
  ];

  return (
    <>
      <BoHead
        eyebrow={`${meta.name} · backoffice`}
        title="Configuración"
        accent={p.accent}
        right={<button onClick={guardar} style={solidBtn(p.accent)}>Guardar</button>}
      />

      <div style={{ display: "inline-flex", gap: 4, background: "var(--off-white)", borderRadius: 10, padding: 4, marginBottom: 18 }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={tabBtn(tab === t.key)}>{t.label}</button>
        ))}
      </div>

      {tab === "app" && (
        <Card title="Aplicación" hint="Datos generales de la aplicación.">
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
            <img src={p.logo} alt={meta.name} style={{ width: 48, height: 48, objectFit: "contain", borderRadius: 10, border: "1px solid rgba(10,26,12,0.08)", background: "var(--white)" }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--deep-green)" }}>{meta.name}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Logo de la aplicación</div>
            </div>
          </div>
          <div style={gridStyle}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Nombre</label>
              <input style={inputStyle} defaultValue={meta.name} />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Dominio</label>
              <input style={inputStyle} defaultValue={`${slug}.app`} />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Moneda</label>
              <input style={inputStyle} defaultValue={meta.moneda} />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Zona horaria</label>
              <input style={inputStyle} defaultValue="America/Montevideo (GMT-3)" />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Impuestos</label>
              <input style={inputStyle} defaultValue="22% IVA" />
            </div>
          </div>
        </Card>
      )}

      {tab === "equipo" && (
        <Card
          title="Equipo interno"
          hint="Miembros con acceso al backoffice."
          right={<button onClick={() => window.alert("Invitación enviada (demo).")} style={solidBtn(p.accent)}>Invitar</button>}
        >
          <DataTable columns={teamColumns} rows={TEAM} empty="Sin miembros." />
        </Card>
      )}

      {tab === "notificaciones" && (
        <Card title="Reglas de notificación" hint="Activá los avisos automáticos del backoffice.">
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {NOTIF_RULES.map((r) => (
              <div key={r.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 14px", background: "var(--off-white)", borderRadius: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: "var(--deep-green)", fontWeight: 600 }}>{r.label}</span>
                <Toggle on={!!notif[r.key]} accent={p.accent} onClick={() => setNotif((prev) => ({ ...prev, [r.key]: !prev[r.key] }))} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === "parametros" && (
        <Card title="Parámetros del sistema" hint="Configuración técnica y endpoints.">
          <div style={gridStyle}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Email de sistema (remitente)</label>
              <input style={inputStyle} defaultValue={`no-reply@${slug}.app`} />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Email de soporte</label>
              <input style={inputStyle} defaultValue={`soporte@${slug}.app`} />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Webhook de eventos (URL)</label>
              <input style={inputStyle} defaultValue={`https://api.${slug}.app/webhooks`} placeholder="https://…" />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Webhook de facturación (URL)</label>
              <input style={inputStyle} defaultValue="" placeholder="https://…" />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Reintentos ante fallo</label>
              <input style={inputStyle} defaultValue="3" />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Retención de logs (días)</label>
              <input style={inputStyle} defaultValue="90" />
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <button onClick={() => window.alert("Conexión de prueba enviada (demo).")} style={ghostBtn}>Probar webhook</button>
          </div>
        </Card>
      )}
    </>
  );
}
