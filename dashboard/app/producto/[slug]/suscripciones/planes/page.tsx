"use client";

/**
 * /producto/[slug]/suscripciones/planes — Administrar planes.
 * Grid de planes comerciales con clientes por plan y un modal de edición
 * (demo: no persiste). Datos DEMO deterministas.
 */

import { use, useState } from "react";
import { PRODUCT_BY_SLUG } from "@/lib/productos";
import { appMeta, getCompanies, money, type DemoPlan } from "@/lib/backoffice-demo";
import { BoHead, Card, ghostBtn, solidBtn, selectStyle } from "@/components/backoffice/BackofficeUI";

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 16,
};
const planCard: React.CSSProperties = {
  background: "var(--white)",
  border: "1px solid rgba(10,26,12,0.08)",
  borderRadius: "var(--r-lg)",
  padding: 20,
  boxShadow: "var(--shadow-sm)",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};
const rowLine: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  fontSize: 13,
  color: "var(--text-muted)",
};
const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(10,26,12,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  zIndex: 50,
};
const modal: React.CSSProperties = {
  background: "var(--white)",
  borderRadius: "var(--r-lg)",
  padding: 24,
  width: "100%",
  maxWidth: 420,
  boxShadow: "0 20px 60px rgba(10,26,12,0.25)",
  display: "flex",
  flexDirection: "column",
  gap: 14,
};
const fieldLabel: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--sand-dark)",
  fontWeight: 700,
  marginBottom: 5,
  display: "block",
};

export default function PlanesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const p = PRODUCT_BY_SLUG[slug];
  const [editing, setEditing] = useState<DemoPlan | null>(null);
  const [creating, setCreating] = useState(false);

  const meta = appMeta(slug);
  const companies = getCompanies(slug);

  if (!p) return null;

  const porPlan = (planId: string) => companies.filter((c) => c.plan === planId).length;
  const open = editing ?? (creating ? { id: "", nombre: "", precioMensual: 0, precioAnual: 0, usuarios: 1, limiteUso: 100, soporte: "Email" } : null);

  return (
    <>
      <BoHead
        eyebrow={`${meta.name} · backoffice`}
        title="Planes"
        accent={p.accent}
        right={<button style={solidBtn(p.accent)} onClick={() => { setEditing(null); setCreating(true); }}>+ Nuevo plan</button>}
      />

      <Card title="Planes comerciales" hint="Precios, límites y clientes activos por plan.">
        <div style={grid}>
          {meta.plans.map((pl) => (
            <div key={pl.id} style={planCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: "var(--deep-green)" }}>{pl.nombre}</div>
                <span style={{ fontSize: 12, fontWeight: 700, color: p.accent, background: p.soft, padding: "3px 10px", borderRadius: 999 }}>
                  {porPlan(pl.id)} clientes
                </span>
              </div>
              <div>
                <div style={{ fontSize: 26, fontWeight: 800, color: "var(--deep-green)", lineHeight: 1.1 }}>
                  {money(pl.precioMensual, meta.moneda)}<span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}> /mes</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{money(pl.precioAnual, meta.moneda)} /año</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7, paddingTop: 6, borderTop: "1px solid rgba(10,26,12,0.06)" }}>
                <div style={rowLine}><span>Usuarios incluidos</span><strong style={{ color: "var(--deep-green)" }}>{pl.usuarios}</strong></div>
                <div style={rowLine}><span>Límite de uso</span><strong style={{ color: "var(--deep-green)" }}>{pl.limiteUso.toLocaleString("es-UY")} {meta.unit.toLowerCase()}</strong></div>
                <div style={rowLine}><span>Soporte</span><strong style={{ color: "var(--deep-green)" }}>{pl.soporte}</strong></div>
              </div>
              <button style={ghostBtn} onClick={() => { setCreating(false); setEditing(pl); }}>Editar</button>
            </div>
          ))}
        </div>
      </Card>

      {open && (
        <div style={overlay} onClick={() => { setEditing(null); setCreating(false); }}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 800, color: "var(--deep-green)" }}>
              {creating ? "Nuevo plan" : `Editar · ${open.nombre}`}
            </div>
            <div>
              <label style={fieldLabel}>Nombre</label>
              <input style={{ ...selectStyle, width: "100%" }} defaultValue={open.nombre} placeholder="Nombre del plan" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={fieldLabel}>Precio mensual</label>
                <input type="number" style={{ ...selectStyle, width: "100%" }} defaultValue={open.precioMensual} />
              </div>
              <div>
                <label style={fieldLabel}>Precio anual</label>
                <input type="number" style={{ ...selectStyle, width: "100%" }} defaultValue={open.precioAnual} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={fieldLabel}>Usuarios</label>
                <input type="number" style={{ ...selectStyle, width: "100%" }} defaultValue={open.usuarios} />
              </div>
              <div>
                <label style={fieldLabel}>Límite ({meta.unit.toLowerCase()})</label>
                <input type="number" style={{ ...selectStyle, width: "100%" }} defaultValue={open.limiteUso} />
              </div>
            </div>
            <div>
              <label style={fieldLabel}>Soporte</label>
              <input style={{ ...selectStyle, width: "100%" }} defaultValue={open.soporte} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              <button style={ghostBtn} onClick={() => { setEditing(null); setCreating(false); }}>Cancelar</button>
              <button style={solidBtn(p.accent)} onClick={() => { setEditing(null); setCreating(false); }}>Guardar</button>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
              Edición de demostración — no persiste cambios.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
