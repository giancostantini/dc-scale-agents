"use client";

/**
 * /producto/[slug] — dashboard de gestión de un producto propio de D&C
 * (Tilde, Encargue, Vuelta). Estructura inicial: KPIs + secciones clave
 * por producto. Los datos se conectan en una segunda etapa (los productos
 * viven en apps aparte; hay que decidir la fuente: carga manual acá,
 * ingestión desde cada app, o API).
 */

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import { getCurrentProfile, hasSession } from "@/lib/supabase/auth";
import { IArrowLeft } from "@/components/icons/BrandIcons";

interface ProductConfig {
  name: string;
  emoji: string;
  tagline: string;
  /** KPIs de cabecera (label; el valor se conecta después). */
  kpis: string[];
  /** Secciones de gestión (title + una línea de qué va adentro). */
  sections: { title: string; hint: string }[];
}

const PRODUCTS: Record<string, ProductConfig> = {
  tilde: {
    name: "Tilde",
    emoji: "🧾",
    tagline: "Carga y control de facturas de compra",
    kpis: [
      "Facturas del mes",
      "Monto cargado (mes)",
      "Proveedores",
      "Pendientes de control",
    ],
    sections: [
      { title: "Facturas recientes", hint: "Últimas facturas cargadas, con proveedor, monto y estado." },
      { title: "Por proveedor", hint: "Cuánto se cargó por cada proveedor en el período." },
      { title: "Alertas", hint: "Vencimientos próximos y posibles duplicados." },
      { title: "Empresas usando Tilde", hint: "Clientes/empresas activas en la app y su volumen." },
    ],
  },
  encargue: {
    name: "Encargue",
    emoji: "💬",
    tagline: "Pedidos B2B por WhatsApp al ERP",
    kpis: [
      "Pedidos del mes",
      "Vendido (mes)",
      "Clientes B2B activos",
      "Ticket promedio",
    ],
    sections: [
      { title: "Pedidos recientes", hint: "Últimos pedidos tomados por el agente, con cliente y monto." },
      { title: "Top clientes", hint: "Clientes que más compran en el período." },
      { title: "Productos más pedidos", hint: "Ranking de productos por cantidad / facturación." },
      { title: "Integraciones", hint: "Estado de la conexión con el ERP y con WhatsApp." },
    ],
  },
  vuelta: {
    name: "Vuelta",
    emoji: "🚚",
    tagline: "Ruteo y reparto de camiones",
    kpis: [
      "Entregas del mes",
      "Rutas activas",
      "Camiones",
      "Entregas a tiempo",
    ],
    sections: [
      { title: "Rutas de hoy", hint: "Rutas planificadas, con chofer, camión y paradas." },
      { title: "Camiones y choferes", hint: "Flota disponible y su asignación." },
      { title: "Entregas pendientes / atrasadas", hint: "Lo que falta entregar y lo que se pasó de horario." },
      { title: "Zonas de reparto", hint: "Cobertura por zona y densidad de entregas." },
    ],
  },
};

export default function ProductoDashboard({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);

  const config = PRODUCTS[slug];

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

  if (!config) {
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

  if (!authChecked) {
    return (
      <>
        <Topbar showPrimary={false} />
        <main style={{ padding: 40 }} />
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

        {/* Header del producto */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
          <div style={{ fontSize: 40, lineHeight: 1 }}>{config.emoji}</div>
          <div>
            <h1
              style={{
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "var(--deep-green)",
                margin: 0,
              }}
            >
              {config.name}
            </h1>
            <div style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 2 }}>
              {config.tagline}
            </div>
          </div>
        </div>

        {/* Aviso: estructura inicial, faltan conectar datos */}
        <div
          style={{
            margin: "20px 0",
            padding: "12px 16px",
            background: "rgba(196,168,130,0.1)",
            borderLeft: "3px solid var(--sand-dark)",
            borderRadius: "var(--r-md)",
            fontSize: 13,
            color: "var(--deep-green)",
            lineHeight: 1.5,
          }}
        >
          Estructura inicial del dashboard de {config.name}. Falta conectar la
          fuente de datos (carga manual acá, ingestión desde la app de{" "}
          {config.name}, o API) para poblar los KPIs y las secciones.
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
          {config.kpis.map((label) => (
            <div
              key={label}
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
                {label}
              </div>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 700,
                  color: "var(--deep-green)",
                  letterSpacing: "-0.02em",
                }}
              >
                —
              </div>
            </div>
          ))}
        </div>

        {/* Secciones de gestión */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 16,
          }}
        >
          {config.sections.map((s) => (
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
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: "var(--deep-green)",
                  marginBottom: 6,
                }}
              >
                {s.title}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.5 }}>
                {s.hint}
              </div>
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--text-muted)",
                  fontSize: 12,
                  fontStyle: "italic",
                  opacity: 0.7,
                  marginTop: 12,
                  border: "1px dashed rgba(10,26,12,0.12)",
                  borderRadius: "var(--r-md)",
                  padding: 16,
                }}
              >
                Sin datos todavía
              </div>
            </section>
          ))}
        </div>
      </main>
    </>
  );
}
