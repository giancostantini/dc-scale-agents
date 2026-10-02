"use client";

/**
 * /producto/[slug]/clientes/[companyId] — Ficha Cliente 360.
 * Vista completa de una empresa: información, suscripción, utilización,
 * usuarios, facturación, soporte y health score. Datos DEMO deterministas.
 */

import { use } from "react";
import { useRouter } from "next/navigation";
import { PRODUCT_BY_SLUG } from "@/lib/productos";
import {
  appMeta, getCompany, tickets, series, money,
  ESTADO_LABEL, ESTADO_COLOR, type DemoTicket,
} from "@/lib/backoffice-demo";
import {
  BoHead, Card, DataTable, Pill, UsageBar, LineTrend, EmptyState,
  ghostBtn, type Column,
} from "@/components/backoffice/BackofficeUI";

function healthColor(h: number): string {
  return h >= 80 ? "#1F9D55" : h >= 50 ? "#C98A1A" : "#b04b3a";
}
function addMonths(iso: string, n: number): string {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

const USER_FIRST = ["Martín", "Lucía", "Diego", "Sofía", "Andrés", "Valentina", "Rodrigo", "Camila"];
const USER_LAST = ["Pérez", "González", "Silva", "Méndez", "Castro", "Rossi", "Vega", "López"];

interface DemoUser { id: string; nombre: string; email: string; rol: string; ultimoAcceso: string; estado: "activo" | "inactivo"; }
interface FactorRow { id: string; factor: string; peso: string; valor: number; }

export default function ClienteFichaPage({ params }: { params: Promise<{ slug: string; companyId: string }> }) {
  const { slug, companyId } = use(params);
  const router = useRouter();
  const p = PRODUCT_BY_SLUG[slug];
  const meta = appMeta(slug);
  const c = getCompany(slug, companyId);

  if (!p) return null;
  const backUrl = `/producto/${slug}/clientes/empresas`;

  if (!c) {
    return (
      <>
        <BoHead eyebrow={`${meta.name} · backoffice`} title="Cliente no encontrado" accent={meta.accent} />
        <EmptyState>
          No existe el cliente solicitado.{" "}
          <button onClick={() => router.push(backUrl)} style={{ ...ghostBtn, marginTop: 10 }}>Volver a empresas</button>
        </EmptyState>
      </>
    );
  }

  const plan = meta.plans.find((pl) => pl.id === c.plan);
  const hash = Array.from(c.id).reduce((a, ch) => a + ch.charCodeAt(0), 0);

  // Usuarios ficticios derivados del contacto + variaciones deterministas.
  const usuarios: DemoUser[] = Array.from({ length: Math.max(1, c.usuarios) }).map((_, i) => {
    const nombre = i === 0 ? c.contacto : `${USER_FIRST[(hash + i) % USER_FIRST.length]} ${USER_LAST[(hash + i * 3) % USER_LAST.length]}`;
    const dom = c.email.split("@")[1] ?? "empresa.com";
    const handle = nombre.toLowerCase().split(" ")[0].replace(/[^a-z]/g, "");
    return {
      id: `${c.id}-u${i + 1}`,
      nombre,
      email: i === 0 ? c.email : `${handle}@${dom}`,
      rol: i === 0 ? "Admin" : (hash + i) % 3 === 0 ? "Admin" : "Usuario",
      ultimoAcceso: i < c.usuariosActivos ? c.ultimoAcceso : addMonths(c.ultimoAcceso, -1),
      estado: i < c.usuariosActivos ? "activo" : "inactivo",
    };
  });

  // Facturación derivada simple.
  const mesesVida = Math.max(1, Math.round((Date.now() - new Date(c.fechaAlta).getTime()) / (1000 * 60 * 60 * 24 * 30)));
  const emitidas = mesesVida;
  const vencidas = c.estado === "moroso" ? 1 + (hash % 2) : 0;
  const pendientes = c.estado === "pendiente" || c.estado === "trial" ? 0 : c.mrr > 0 ? 1 : 0;
  const pagadas = Math.max(0, emitidas - vencidas - pendientes);

  // Factores de health score (demo).
  const factores: FactorRow[] = [
    { id: "f1", factor: "Utilización", peso: "35%", valor: Math.min(100, Math.round((c.usoActual / Math.max(1, c.limite)) * 100)) },
    { id: "f2", factor: "Frecuencia de uso", peso: "20%", valor: 40 + (hash % 60) },
    { id: "f3", factor: "Tendencia", peso: "15%", valor: 35 + ((hash * 7) % 65) },
    { id: "f4", factor: "Pagos al día", peso: "10%", valor: c.estado === "moroso" ? 10 : 95 },
    { id: "f5", factor: "Soporte", peso: "10%", valor: 55 + ((hash * 3) % 45) },
    { id: "f6", factor: "Errores", peso: "10%", valor: 70 + ((hash * 5) % 30) },
  ];

  const ticketsCliente: DemoTicket[] = tickets(slug).filter((t) => t.empresa === c.nombre);

  const row = (label: string, value: React.ReactNode) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "7px 0", borderBottom: "1px solid rgba(10,26,12,0.05)" }}>
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--deep-green)", textAlign: "right" }}>{value}</span>
    </div>
  );

  const userCols: Column<DemoUser>[] = [
    { key: "nombre", header: "Nombre", render: (u) => <strong>{u.nombre}</strong> },
    { key: "email", header: "Email", render: (u) => u.email },
    { key: "rol", header: "Rol", render: (u) => u.rol },
    { key: "ultimoAcceso", header: "Último acceso", render: (u) => u.ultimoAcceso },
    { key: "estado", header: "Estado", render: (u) => <Pill label={u.estado === "activo" ? "Activo" : "Inactivo"} color={u.estado === "activo" ? "#1F9D55" : "#8A8F8B"} /> },
  ];

  const ticketCols: Column<DemoTicket>[] = [
    { key: "id", header: "Ticket", render: (t) => <strong>{t.id}</strong> },
    { key: "asunto", header: "Asunto", render: (t) => t.asunto },
    { key: "tipo", header: "Tipo", render: (t) => t.tipo },
    { key: "estado", header: "Estado", render: (t) => <Pill label={t.estado} color={t.estado === "resuelto" ? "#1F9D55" : t.estado === "abierto" ? "#b04b3a" : "#C98A1A"} /> },
    { key: "prioridad", header: "Prioridad", render: (t) => t.prioridad },
    { key: "creado", header: "Creado", render: (t) => t.creado },
  ];

  const facRow = (label: string, value: number, color: string) => (
    <div style={{ padding: 14, background: "var(--off-white)", borderRadius: 10, borderLeft: `3px solid ${color}` }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: "var(--deep-green)" }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{label}</div>
    </div>
  );

  return (
    <>
      <BoHead
        eyebrow={`${meta.name} · cliente`}
        title={c.nombre}
        accent={p.accent}
        right={<button onClick={() => router.push(backUrl)} style={ghostBtn}>← Volver a empresas</button>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18 }}>
        <Card title="Información general">
          {row("Nombre", c.nombre)}
          {row("Razón social", c.razonSocial)}
          {row("RUT", c.rut)}
          {row("País", c.pais)}
          {row("Dirección", `Av. Principal ${1000 + (hash % 900)}, ${c.pais}`)}
          {row("Industria", c.industria)}
          {row("Locales", c.locales)}
          {row("Contacto", c.contacto)}
          {row("Email", c.email)}
          {row("Teléfono", c.telefono)}
          {row("Responsable", c.responsable)}
          {row("Alta", c.fechaAlta)}
        </Card>

        <Card title="Suscripción">
          {row("Plan", plan?.nombre ?? c.plan)}
          {row("Precio", money(plan?.precioMensual ?? c.mrr, c.moneda))}
          {row("Moneda", c.moneda)}
          {row("Frecuencia", "Mensual")}
          {row("Inicio", c.fechaAlta)}
          {row("Próxima renovación", addMonths(c.fechaAlta, 1))}
          {row("Método de pago", "Tarjeta")}
          {row("Estado", <Pill label={ESTADO_LABEL[c.estado]} color={ESTADO_COLOR[c.estado]} />)}
          {row("Límite usuarios", plan?.usuarios ?? "—")}
          {row("Límite de uso", `${(plan?.limiteUso ?? c.limite).toLocaleString("es-UY")} ${meta.unit.toLowerCase()}`)}
          {row("Soporte", plan?.soporte ?? "—")}
        </Card>
      </div>

      <Card title="Utilización" hint={`${meta.unit} del período vs límite del plan`}>
        <div style={{ marginBottom: 16 }}>
          <UsageBar value={c.usoActual} max={c.limite} color={p.accent} />
        </div>
        <LineTrend data={series(slug, "uso", 12)} color={p.accent} height={200} />
      </Card>

      <Card title="Usuarios" hint={`${c.usuariosActivos} activos de ${c.usuarios}`}>
        <DataTable columns={userCols} rows={usuarios} empty="Sin usuarios." maxHeight={360} />
      </Card>

      <Card title="Facturación">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          {facRow("Emitidas", emitidas, "#2F7D6B")}
          {facRow("Pagadas", pagadas, "#1F9D55")}
          {facRow("Pendientes", pendientes, "#C98A1A")}
          {facRow("Vencidas", vencidas, "#b04b3a")}
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18 }}>
        <Card title="Soporte" hint={`${ticketsCliente.length} tickets de este cliente`}>
          <DataTable columns={ticketCols} rows={ticketsCliente} empty="Sin tickets registrados." maxHeight={320} />
        </Card>

        <Card title="Health Score">
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 48, fontWeight: 800, color: healthColor(c.health), lineHeight: 1 }}>{c.health}</span>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>/ 100</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {factores.map((f) => (
              <div key={f.id}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                  <span style={{ color: "var(--deep-green)", fontWeight: 600 }}>{f.factor} <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>({f.peso})</span></span>
                  <strong style={{ color: healthColor(f.valor) }}>{f.valor}</strong>
                </div>
                <UsageBar value={f.valor} max={100} color={p.accent} />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
