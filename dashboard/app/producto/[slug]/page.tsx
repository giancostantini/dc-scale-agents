"use client";

/**
 * /producto/[slug] — dashboard de gestión de un producto propio de D&C
 * (Tilde, Encargue, Vuelta). Lee las tablas que las apps de cada producto
 * escriben en esta base (mig 107): tilde_invoices, encargue_orders,
 * vuelta_deliveries. Calcula KPIs + secciones de gestión.
 */

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import { getCurrentProfile, hasSession } from "@/lib/supabase/auth";
import { getSupabase } from "@/lib/supabase/client";
import { IArrowLeft } from "@/components/icons/BrandIcons";

interface Kpi {
  label: string;
  value: string;
}
interface Row {
  label: string;
  value: string;
  sub?: string;
}
interface SectionData {
  title: string;
  hint: string;
  rows: Row[];
  /** Nota estática cuando no hay lista de datos (ej. integraciones). */
  note?: string;
}
interface ProductData {
  kpis: Kpi[];
  sections: SectionData[];
}

const META: Record<string, { name: string; emoji: string; tagline: string; table: string }> = {
  tilde: { name: "Tilde", emoji: "🧾", tagline: "Carga y control de facturas de compra", table: "tilde_invoices" },
  encargue: { name: "Encargue", emoji: "💬", tagline: "Pedidos B2B por WhatsApp al ERP", table: "encargue_orders" },
  vuelta: { name: "Vuelta", emoji: "🚚", tagline: "Ruteo y reparto de camiones", table: "vuelta_deliveries" },
};

const money = (n: number) => `$ ${Math.round(n).toLocaleString("es-AR")}`;
const todayIso = () => new Date().toISOString().slice(0, 10);

/** Agrupa por un campo, suma o cuenta, y devuelve top N como filas. */
function groupTop(
  rows: Record<string, unknown>[],
  field: string,
  mode: "sum" | "count",
  sumField = "monto",
  n = 6,
): Row[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const key = (r[field] as string) || "—";
    const add = mode === "sum" ? Number(r[sumField] ?? 0) : 1;
    m.set(key, (m.get(key) ?? 0) + add);
  }
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([label, v]) => ({
      label,
      value: mode === "sum" ? money(v) : String(v),
    }));
}

function buildTilde(
  rows: Record<string, unknown>[],
  from: string,
  plabel: string,
): ProductData {
  const month = rows.filter((r) => String(r.fecha ?? "") >= from);
  const pendientes = rows.filter((r) => r.estado === "pendiente");
  const montoMes = month.reduce((s, r) => s + Number(r.monto ?? 0), 0);
  const proveedores = new Set(month.map((r) => r.proveedor).filter(Boolean));
  const in7 = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const today = todayIso();
  const alertas = rows.filter(
    (r) =>
      r.estado !== "pagada" &&
      r.vencimiento &&
      String(r.vencimiento) >= today &&
      String(r.vencimiento) <= in7,
  );
  return {
    kpis: [
      { label: `Facturas (${plabel})`, value: String(month.length) },
      { label: `Monto cargado (${plabel})`, value: money(montoMes) },
      { label: "Proveedores", value: String(proveedores.size) },
      { label: "Pendientes de control", value: String(pendientes.length) },
    ],
    sections: [
      {
        title: "Facturas recientes",
        hint: "Últimas facturas cargadas.",
        rows: rows.slice(0, 8).map((r) => ({
          label: `${r.proveedor ?? "—"} · ${r.empresa ?? ""}`,
          value: money(Number(r.monto ?? 0)),
          sub: `${r.fecha ?? ""} · ${r.estado ?? ""}`,
        })),
      },
      {
        title: `Por proveedor (${plabel})`,
        hint: "Cuánto se cargó por proveedor en el período.",
        rows: groupTop(month, "proveedor", "sum"),
      },
      {
        title: "Alertas · vencimientos (7 días)",
        hint: "Facturas sin pagar que vencen en la próxima semana.",
        rows: alertas.slice(0, 8).map((r) => ({
          label: `${r.proveedor ?? "—"} · ${r.empresa ?? ""}`,
          value: money(Number(r.monto ?? 0)),
          sub: `vence ${r.vencimiento}`,
        })),
      },
      {
        title: "Empresas usando Tilde",
        hint: "Cuentas activas y su volumen de facturas.",
        rows: groupTop(rows, "empresa", "count"),
      },
    ],
  };
}

function buildEncargue(
  rows: Record<string, unknown>[],
  from: string,
  plabel: string,
): ProductData {
  const month = rows.filter((r) => String(r.fecha ?? "") >= from);
  const vendido = month.reduce((s, r) => s + Number(r.monto ?? 0), 0);
  const clientes = new Set(month.map((r) => r.cliente).filter(Boolean));
  const ticket = month.length > 0 ? vendido / month.length : 0;
  return {
    kpis: [
      { label: `Pedidos (${plabel})`, value: String(month.length) },
      { label: `Vendido (${plabel})`, value: money(vendido) },
      { label: "Clientes B2B activos", value: String(clientes.size) },
      { label: "Ticket promedio", value: money(ticket) },
    ],
    sections: [
      {
        title: "Pedidos recientes",
        hint: "Últimos pedidos tomados por el agente.",
        rows: rows.slice(0, 8).map((r) => ({
          label: `${r.cliente ?? "—"} · ${r.empresa ?? ""}`,
          value: money(Number(r.monto ?? 0)),
          sub: `${r.fecha ?? ""} · ${r.estado ?? ""}`,
        })),
      },
      {
        title: `Top clientes (${plabel})`,
        hint: "Clientes que más compraron en el período.",
        rows: groupTop(month, "cliente", "sum"),
      },
      {
        title: `Pedidos por empresa (${plabel})`,
        hint: "Volumen de pedidos por cuenta que usa Encargue.",
        rows: groupTop(month, "empresa", "count"),
      },
      {
        title: "Integraciones",
        hint: "Conexión con el ERP y con WhatsApp.",
        rows: [],
        note: "Estado de integraciones: lo reporta la app de Encargue (pendiente de conectar).",
      },
    ],
  };
}

function buildVuelta(
  rows: Record<string, unknown>[],
  from: string,
  plabel: string,
): ProductData {
  const today = todayIso();
  const month = rows.filter((r) => String(r.fecha ?? "") >= from);
  const entregadasMes = month.filter((r) => r.estado === "entregada");
  const aTiempo = entregadasMes.filter((r) => r.a_tiempo === true).length;
  const pctATiempo =
    entregadasMes.length > 0
      ? Math.round((aTiempo / entregadasMes.length) * 100)
      : null;
  const hoy = rows.filter((r) => String(r.fecha ?? "") === today);
  const camiones = new Set(month.map((r) => r.camion).filter(Boolean));
  const rutasActivas = new Set(
    rows
      .filter((r) => r.estado === "en_ruta" || String(r.fecha ?? "") === today)
      .map((r) => r.ruta)
      .filter(Boolean),
  );
  const pendientes = rows.filter(
    (r) => r.estado === "pendiente" || r.estado === "atrasada" || r.estado === "en_ruta",
  );
  return {
    kpis: [
      { label: `Entregas (${plabel})`, value: String(entregadasMes.length) },
      { label: "Rutas activas", value: String(rutasActivas.size) },
      { label: "Camiones", value: String(camiones.size) },
      { label: "Entregas a tiempo", value: pctATiempo == null ? "—" : `${pctATiempo}%` },
    ],
    sections: [
      {
        title: "Rutas de hoy",
        hint: "Rutas planificadas para hoy, con chofer y camión.",
        rows: hoy.slice(0, 8).map((r) => ({
          label: `${r.ruta ?? "—"} · ${r.zona ?? ""}`,
          value: String(r.camion ?? "—"),
          sub: `${r.chofer ?? ""} · ${r.estado ?? ""}`,
        })),
      },
      {
        title: `Camiones y choferes (${plabel})`,
        hint: "Flota y su volumen de entregas.",
        rows: groupTop(month, "camion", "count"),
      },
      {
        title: "Entregas pendientes / atrasadas",
        hint: "Lo que falta entregar o se pasó de horario.",
        rows: pendientes.slice(0, 8).map((r) => ({
          label: `${r.ruta ?? "—"} · ${r.empresa ?? ""}`,
          value: String(r.estado ?? ""),
          sub: `${r.fecha ?? ""} · ${r.chofer ?? ""}`,
        })),
      },
      {
        title: `Zonas de reparto (${plabel})`,
        hint: "Densidad de entregas por zona.",
        rows: groupTop(month, "zona", "count"),
      },
    ],
  };
}

type Period = "mes" | "3m" | "anio";

const PERIOD_LABEL: Record<Period, string> = {
  mes: "este mes",
  "3m": "últimos 3 meses",
  anio: "este año",
};

/** Fecha de inicio (YYYY-MM-DD) del período elegido. */
function periodStart(period: Period): string {
  const d = new Date();
  if (period === "mes") return `${d.toISOString().slice(0, 7)}-01`;
  if (period === "anio") return `${d.getFullYear()}-01-01`;
  // últimos 3 meses (desde el 1° de hace 2 meses)
  const from = new Date(d.getFullYear(), d.getMonth() - 2, 1);
  return from.toISOString().slice(0, 10);
}

function build(
  slug: string,
  rows: Record<string, unknown>[],
  period: Period,
): ProductData {
  const from = periodStart(period);
  const plabel = PERIOD_LABEL[period];
  if (slug === "tilde") return buildTilde(rows, from, plabel);
  if (slug === "encargue") return buildEncargue(rows, from, plabel);
  return buildVuelta(rows, from, plabel);
}

export default function ProductoDashboard({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("mes");

  const meta = META[slug];
  // Recalcula KPIs/secciones al cambiar de período sin volver a pedir datos.
  const data: ProductData | null = meta ? build(slug, rawRows, period) : null;

  useEffect(() => {
    hasSession().then(async (has) => {
      if (!has) {
        router.replace("/");
        return;
      }
      const p = await getCurrentProfile();
      if (!p || p.role === "client") {
        router.replace("/portal");
        return;
      }
      setAuthChecked(true);
    });
  }, [router]);

  useEffect(() => {
    if (!authChecked || !meta) return;
    let active = true;
    (async () => {
      try {
        const { data: rows } = await getSupabase()
          .from(meta.table)
          .select("*")
          .order("fecha", { ascending: false })
          .limit(1000);
        if (active) setRawRows((rows ?? []) as Record<string, unknown>[]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [authChecked, meta, slug]);

  if (!meta) {
    return (
      <>
        <Topbar showPrimary={false} />
        <main style={{ padding: 40, maxWidth: 1200, margin: "0 auto" }}>
          <Link href="/hub" style={{ color: "var(--sand-dark)", fontSize: 13 }}>
            <IArrowLeft size={14} /> Volver al hub
          </Link>
          <p style={{ marginTop: 20, color: "var(--text-muted)" }}>
            Producto no encontrado.
          </p>
        </main>
      </>
    );
  }

  return (
    <>
      <Topbar showPrimary={false} />
      <main style={{ padding: "28px 40px", maxWidth: 1200, margin: "0 auto" }}>
        <Link
          href="/hub"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: "var(--sand-dark)",
            fontSize: 13,
            textDecoration: "none",
            marginBottom: 18,
          }}
        >
          <IArrowLeft size={14} /> Nuestros productos
        </Link>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 24,
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: 40, lineHeight: 1 }}>{meta.emoji}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1
              style={{
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "var(--deep-green)",
                margin: 0,
              }}
            >
              {meta.name}
            </h1>
            <div style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 2 }}>
              {meta.tagline}
            </div>
          </div>
          {/* Selector de período: scopea KPIs y agrupaciones. */}
          <div
            style={{
              display: "inline-flex",
              border: "1px solid rgba(10,26,12,0.15)",
              borderRadius: "var(--r-pill)",
              overflow: "hidden",
            }}
          >
            {(["mes", "3m", "anio"] as Period[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                style={{
                  padding: "7px 14px",
                  fontSize: 12,
                  fontWeight: 600,
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  background:
                    period === p ? "var(--deep-green)" : "transparent",
                  color: period === p ? "var(--off-white)" : "var(--deep-green)",
                }}
              >
                {p === "mes" ? "Este mes" : p === "3m" ? "3 meses" : "Año"}
              </button>
            ))}
          </div>
        </div>

        {/* KPIs */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 14,
            marginBottom: 28,
          }}
        >
          {(data?.kpis ?? [{ label: "—", value: "—" }, { label: "—", value: "—" }, { label: "—", value: "—" }, { label: "—", value: "—" }]).map(
            (k, i) => (
              <div
                key={i}
                style={{
                  background: "var(--white)",
                  border: "1px solid rgba(10,26,12,0.08)",
                  borderRadius: "var(--r-md)",
                  padding: 18,
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--sand-dark)",
                    fontWeight: 700,
                    marginBottom: 8,
                  }}
                >
                  {k.label}
                </div>
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 700,
                    color: "var(--deep-green)",
                    letterSpacing: "-0.02em",
                  }}
                >
                  {loading ? "…" : k.value}
                </div>
              </div>
            ),
          )}
        </div>

        {/* Secciones */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 16,
          }}
        >
          {(data?.sections ?? []).map((s) => (
            <section
              key={s.title}
              style={{
                background: "var(--white)",
                border: "1px solid rgba(10,26,12,0.08)",
                borderRadius: "var(--r-lg)",
                padding: 20,
                boxShadow: "var(--shadow-sm)",
                minHeight: 160,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--deep-green)" }}>
                {s.title}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, marginBottom: 12 }}>
                {s.hint}
              </div>
              {s.rows.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {s.rows.map((r, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "8px 0",
                        borderTop: i === 0 ? "none" : "1px solid rgba(10,26,12,0.06)",
                        fontSize: 13,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            color: "var(--deep-green)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {r.label}
                        </div>
                        {r.sub && (
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                            {r.sub}
                          </div>
                        )}
                      </div>
                      <div
                        style={{
                          fontWeight: 600,
                          color: "var(--deep-green)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.value}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--text-muted)",
                    fontSize: 12,
                    fontStyle: "italic",
                    opacity: 0.75,
                    textAlign: "center",
                    padding: 12,
                    border: "1px dashed rgba(10,26,12,0.12)",
                    borderRadius: "var(--r-md)",
                    marginTop: 4,
                  }}
                >
                  {s.note ?? (loading ? "Cargando…" : "Sin datos todavía")}
                </div>
              )}
            </section>
          ))}
        </div>
      </main>
    </>
  );
}
