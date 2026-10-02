"use client";

/**
 * /producto/[slug]/seguridad/roles — SEGURIDAD: matriz de roles y permisos
 * por módulo del backoffice. Visual/demo (el estado no persiste).
 */

import { use, useState } from "react";
import { PRODUCT_BY_SLUG } from "@/lib/productos";
import { appMeta } from "@/lib/backoffice-demo";
import { BoHead, Card } from "@/components/backoffice/BackofficeUI";

const ROLES = ["Super Admin", "Administrador", "Finanzas", "Comercial", "Customer Success", "Soporte", "Técnico"] as const;
const MODULOS = ["Clientes", "Suscripciones", "Producto", "Finanzas", "Atención", "Tecnología", "Seguridad", "Config"] as const;

type Role = (typeof ROLES)[number];
type Modulo = (typeof MODULOS)[number];
type Matrix = Record<Role, Record<Modulo, boolean>>;

const PRESET: Record<Role, Modulo[]> = {
  "Super Admin": [...MODULOS],
  "Administrador": ["Clientes", "Suscripciones", "Producto", "Finanzas", "Atención", "Tecnología", "Config"],
  "Finanzas": ["Clientes", "Finanzas"],
  "Comercial": ["Clientes", "Suscripciones"],
  "Customer Success": ["Clientes", "Suscripciones", "Atención"],
  "Soporte": ["Clientes", "Atención"],
  "Técnico": ["Producto", "Tecnología", "Seguridad"],
};

function buildMatrix(): Matrix {
  const m = {} as Matrix;
  for (const role of ROLES) {
    m[role] = {} as Record<Modulo, boolean>;
    for (const mod of MODULOS) m[role][mod] = PRESET[role].includes(mod);
  }
  return m;
}

const cellStyle: React.CSSProperties = { padding: "10px 12px", textAlign: "center", borderTop: "1px solid rgba(10,26,12,0.06)" };
const headStyle: React.CSSProperties = {
  padding: "10px 12px", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase",
  color: "var(--sand-dark)", fontWeight: 700, whiteSpace: "nowrap", textAlign: "center",
};
const roleCellStyle: React.CSSProperties = { padding: "10px 12px", textAlign: "left", fontWeight: 700, color: "var(--deep-green)", whiteSpace: "nowrap", borderTop: "1px solid rgba(10,26,12,0.06)" };

export default function RolesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const p = PRODUCT_BY_SLUG[slug];
  const [matrix, setMatrix] = useState<Matrix>(buildMatrix);

  if (!p) return null;
  const meta = appMeta(slug);

  const toggle = (role: Role, mod: Modulo) =>
    setMatrix((prev) => ({ ...prev, [role]: { ...prev[role], [mod]: !prev[role][mod] } }));

  return (
    <>
      <BoHead eyebrow={`${meta.name} · backoffice`} title="Roles y permisos" accent={p.accent} />

      <Card title="Matriz de permisos" hint="Definí qué puede ver y hacer cada rol en cada módulo del backoffice.">
        <div style={{ overflowX: "auto", borderRadius: "var(--r-md)", border: "1px solid rgba(10,26,12,0.06)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--off-white)" }}>
                <th style={{ ...headStyle, textAlign: "left" }}>Rol</th>
                {MODULOS.map((mod) => <th key={mod} style={headStyle}>{mod}</th>)}
              </tr>
            </thead>
            <tbody>
              {ROLES.map((role) => (
                <tr key={role}>
                  <td style={roleCellStyle}>{role}</td>
                  {MODULOS.map((mod) => (
                    <td key={mod} style={cellStyle}>
                      <input
                        type="checkbox"
                        checked={matrix[role][mod]}
                        onChange={() => toggle(role, mod)}
                        style={{ width: 16, height: 16, cursor: "pointer", accentColor: p.accent }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
