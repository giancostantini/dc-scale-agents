"use client";

/**
 * /producto/[slug]/clientes/usuarios — Tabla global de usuarios de todas las
 * empresas cliente. Derivada de getCompanies. Datos DEMO deterministas.
 */

import { use, useMemo, useState } from "react";
import { PRODUCT_BY_SLUG } from "@/lib/productos";
import { appMeta, getCompanies } from "@/lib/backoffice-demo";
import {
  BoHead, KpiGrid, Card, DataTable, Pill,
  FilterBar, SelectFilter, SearchFilter, ghostBtn, type Column,
} from "@/components/backoffice/BackofficeUI";

const USER_FIRST = ["Martín", "Lucía", "Diego", "Sofía", "Andrés", "Valentina", "Rodrigo", "Camila", "Pablo", "Flor"];
const USER_LAST = ["Pérez", "González", "Silva", "Méndez", "Castro", "Rossi", "Vega", "López", "Ferrari", "Núñez"];

interface GlobalUser {
  id: string; nombre: string; empresa: string; email: string;
  rol: "Admin" | "Usuario"; ultimoAcceso: string; estado: "activo" | "inactivo";
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function UsuariosPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const p = PRODUCT_BY_SLUG[slug];
  const meta = appMeta(slug);
  const cs = getCompanies(slug);

  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("");

  const users = useMemo<GlobalUser[]>(() => {
    const out: GlobalUser[] = [];
    for (const c of cs) {
      const hash = Array.from(c.id).reduce((a, ch) => a + ch.charCodeAt(0), 0);
      const count = 1 + (hash % 3); // 1-3 usuarios por empresa
      const dom = c.email.split("@")[1] ?? "empresa.com";
      for (let i = 0; i < count; i++) {
        const nombre = i === 0 ? c.contacto : `${USER_FIRST[(hash + i) % USER_FIRST.length]} ${USER_LAST[(hash + i * 3) % USER_LAST.length]}`;
        const handle = nombre.toLowerCase().split(" ")[0].replace(/[^a-z]/g, "");
        const activo = i < Math.max(1, c.usuariosActivos);
        out.push({
          id: `${c.id}-gu${i + 1}`,
          nombre,
          empresa: c.nombre,
          email: i === 0 ? c.email : `${handle}@${dom}`,
          rol: i === 0 || (hash + i) % 4 === 0 ? "Admin" : "Usuario",
          ultimoAcceso: activo ? c.ultimoAcceso : addDays(c.ultimoAcceso, -30),
          estado: activo ? "activo" : "inactivo",
        });
      }
    }
    return out;
  }, [cs]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return users.filter((u) => {
      if (term && !u.nombre.toLowerCase().includes(term) && !u.empresa.toLowerCase().includes(term) && !u.email.toLowerCase().includes(term)) return false;
      if (estado && u.estado !== estado) return false;
      return true;
    });
  }, [users, q, estado]);

  if (!p) return null;

  const total = users.length;
  const activos = users.filter((u) => u.estado === "activo").length;
  const admins = users.filter((u) => u.rol === "Admin").length;
  const inactivos = total - activos;

  const act = (label: string, u: GlobalUser) => () => {
    if (typeof window !== "undefined") window.confirm(`${label} — ${u.nombre} (${u.empresa})?`);
  };

  const columns: Column<GlobalUser>[] = [
    { key: "nombre", header: "Nombre", render: (u) => <strong>{u.nombre}</strong> },
    { key: "empresa", header: "Empresa", render: (u) => u.empresa },
    { key: "email", header: "Email", render: (u) => u.email },
    { key: "rol", header: "Rol", render: (u) => u.rol },
    { key: "ultimoAcceso", header: "Último acceso", render: (u) => u.ultimoAcceso },
    { key: "estado", header: "Estado", render: (u) => <Pill label={u.estado === "activo" ? "Activo" : "Inactivo"} color={u.estado === "activo" ? "#1F9D55" : "#8A8F8B"} /> },
    {
      key: "acciones", header: "Acciones",
      render: (u) => (
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={act("Bloquear usuario", u)} style={ghostBtn}>Bloquear</button>
          <button onClick={act("Resetear contraseña de", u)} style={ghostBtn}>Resetear contraseña</button>
          <button onClick={act("Cambiar rol de", u)} style={ghostBtn}>Cambiar rol</button>
        </div>
      ),
    },
  ];

  return (
    <>
      <BoHead eyebrow={`${meta.name} · backoffice`} title="Usuarios" accent={p.accent} />

      <KpiGrid
        items={[
          { label: "Total usuarios", value: String(total), accent: p.accent },
          { label: "Activos", value: String(activos), accent: "#1F9D55" },
          { label: "Admins", value: String(admins) },
          { label: "Inactivos", value: String(inactivos), accent: "#8A8F8B" },
        ]}
        min={180}
      />

      <Card title="Usuarios de todas las empresas" hint={`${filtered.length} de ${total} usuarios`}>
        <FilterBar>
          <SearchFilter value={q} onChange={setQ} placeholder="Buscar usuario, empresa o email…" />
          <SelectFilter value={estado} onChange={setEstado} placeholder="Todos los estados"
            options={[{ value: "activo", label: "Activo" }, { value: "inactivo", label: "Inactivo" }]} />
        </FilterBar>
        <DataTable columns={columns} rows={filtered} empty="No hay usuarios que coincidan." maxHeight={600} />
      </Card>
    </>
  );
}
