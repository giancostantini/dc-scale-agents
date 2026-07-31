"use client";

/**
 * Apartado "Talles faltantes" del cliente.
 *
 * Muestra el último snapshot que produce el agente `stock-web` (cron diario a
 * las 8:00 UY): la lista de productos de la tienda que tienen ALGÚN talle
 * faltante (agotado). Solo consume /api/clients/[id]/stock-web/latest; el
 * relevamiento en sí lo hace el agente por fuera.
 */

import { use, useEffect, useState, type CSSProperties } from "react";
import ui from "@/components/ClientUI.module.css";

interface StockWebProduct {
  code: string;
  name: string;
  category: string;
  faltantes: string;
  disponibles: string;
  url: string;
}

interface StockWebSnapshot {
  title: string | null;
  created_at: string;
  structured: {
    fecha?: string;
    origin?: string;
    resumen?: {
      totalScrapeados?: number;
      fallidos?: number;
      conFaltantes?: number;
      topTalles?: Record<string, number>;
    };
    productos?: StockWebProduct[];
  };
}

export default function TallesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [snapshot, setSnapshot] = useState<StockWebSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/clients/${id}/stock-web/latest`)
      .then((r) => (r.ok ? r.json() : { snapshot: null }))
      .then((data: { snapshot: StockWebSnapshot | null }) => {
        if (!cancelled) setSnapshot(data.snapshot);
      })
      .catch(() => {
        if (!cancelled) setSnapshot(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const productos = snapshot?.structured?.productos ?? [];
  const resumen = snapshot?.structured?.resumen;

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Ecommerce · Stock de la web</div>
          <h1>Talles faltantes</h1>
        </div>
      </div>

      {loading ? (
        <div
          className={ui.panel}
          style={{ color: "var(--text-muted)", fontSize: 13 }}
        >
          Cargando…
        </div>
      ) : !snapshot || productos.length === 0 ? (
        <div className={ui.panel}>
          <div
            style={{
              padding: 28,
              textAlign: "center",
              background: "var(--off-white)",
              borderLeft: "3px solid var(--sand)",
              color: "var(--text-muted)",
              fontSize: 13,
              fontStyle: "italic",
              borderRadius: "var(--r-md)",
            }}
          >
            {snapshot
              ? "El último relevamiento no encontró productos con talles faltantes."
              : "Sin datos todavía. El agente releva la tienda automáticamente cada día a las 8:00 UY y el resultado aparece acá."}
          </div>
        </div>
      ) : (
        <>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              marginBottom: 16,
            }}
          >
            Último relevamiento:{" "}
            <strong style={{ color: "var(--deep-green)" }}>
              {formatDate(snapshot.created_at)}
            </strong>
            {" · "}
            {resumen?.conFaltantes ?? productos.length} productos con talles
            faltantes
            {resumen?.totalScrapeados
              ? ` de ${resumen.totalScrapeados} relevados`
              : ""}
            {snapshot.structured?.origin
              ? ` · ${snapshot.structured.origin}`
              : ""}
          </div>

          <div className={ui.panel} style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
              }}
            >
              <thead>
                <tr
                  style={{
                    textAlign: "left",
                    borderBottom: "2px solid rgba(10,26,12,0.1)",
                  }}
                >
                  <th style={thStyle}>Código</th>
                  <th style={thStyle}>Producto</th>
                  <th style={thStyle}>Categoría</th>
                  <th style={thStyle}>Talles faltantes</th>
                  <th style={thStyle}>Disponibles (con stock)</th>
                  <th style={thStyle} />
                </tr>
              </thead>
              <tbody>
                {productos.map((p, i) => (
                  <tr
                    key={`${p.code}-${i}`}
                    style={{ borderBottom: "1px solid rgba(10,26,12,0.06)" }}
                  >
                    <td style={tdStyle}>{p.code}</td>
                    <td
                      style={{
                        ...tdStyle,
                        fontWeight: 600,
                        color: "var(--deep-green)",
                      }}
                    >
                      {p.name}
                    </td>
                    <td style={tdStyle}>{p.category}</td>
                    <td
                      style={{ ...tdStyle, fontWeight: 700, color: "#9A3412" }}
                    >
                      {p.faltantes}
                    </td>
                    <td style={{ ...tdStyle, color: "var(--text-muted)" }}>
                      {p.disponibles}
                    </td>
                    <td style={tdStyle}>
                      {p.url && (
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: "var(--sand-dark)",
                            textDecoration: "none",
                            fontSize: 12,
                          }}
                        >
                          ver ↗
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

const thStyle: CSSProperties = {
  padding: "10px 12px",
  fontSize: 11,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  fontWeight: 700,
};

const tdStyle: CSSProperties = {
  padding: "10px 12px",
  verticalAlign: "top",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const fecha = d.toLocaleDateString("es-UY", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const hora = d.toLocaleTimeString("es-UY", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${fecha} · ${hora}`;
}
