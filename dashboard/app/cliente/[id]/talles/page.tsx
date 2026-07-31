"use client";

/**
 * Apartado "Talles faltantes" del cliente.
 *
 * Muestra el último snapshot que produce el agente `stock-web` (cron diario a
 * las 8:00 UY): la lista de productos de la tienda con ALGÚN talle faltante.
 * El botón "Correr ahora" dispara el agente on-demand vía /api/agents/run
 * (repository_dispatch → GitHub Actions). Como el relevamiento tarda 1–2 min,
 * la pantalla hace polling y se actualiza sola cuando llega el snapshot nuevo.
 */

import {
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import ui from "@/components/ClientUI.module.css";
import { runAgent } from "@/lib/agents";

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
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const mounted = useRef(true);

  const loadSnapshot =
    useCallback(async (): Promise<StockWebSnapshot | null> => {
      try {
        const r = await fetch(`/api/clients/${id}/stock-web/latest`);
        if (!r.ok) return null;
        const data = (await r.json()) as { snapshot: StockWebSnapshot | null };
        return data.snapshot;
      } catch {
        return null;
      }
    }, [id]);

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    loadSnapshot().then((s) => {
      if (mounted.current) {
        setSnapshot(s);
        setLoading(false);
      }
    });
    return () => {
      mounted.current = false;
    };
  }, [loadSnapshot]);

  async function handleRun() {
    if (running) return;
    setRunning(true);
    setRunMsg("Disparando el relevamiento…");
    const baseline = snapshot?.created_at ?? "";

    const res = await runAgent(id, "stock-web", {});
    if ("error" in res) {
      setRunMsg(`No se pudo disparar: ${res.error}`);
      setRunning(false);
      return;
    }

    setRunMsg(
      "Corriendo… suele tardar 1–2 minutos. Esta pantalla se actualiza sola.",
    );
    const started = Date.now();
    const MAX_MS = 4 * 60 * 1000;

    const poll = async () => {
      if (!mounted.current) return;
      const s = await loadSnapshot();
      const isNewer =
        !!s &&
        s.created_at !== baseline &&
        (!baseline || new Date(s.created_at) > new Date(baseline));
      if (isNewer) {
        if (!mounted.current) return;
        setSnapshot(s);
        setRunning(false);
        setRunMsg("Actualizado ✓");
        return;
      }
      if (Date.now() - started > MAX_MS) {
        if (!mounted.current) return;
        setRunning(false);
        setRunMsg(
          "El relevamiento sigue corriendo. Refrescá la página en un ratito.",
        );
        return;
      }
      setTimeout(poll, 12000);
    };
    setTimeout(poll, 12000);
  }

  const productos = snapshot?.structured?.productos ?? [];
  const resumen = snapshot?.structured?.resumen;

  async function handleExport() {
    if (productos.length === 0) return;
    const XLSX = await import("xlsx");

    // Hoja 1: la tabla
    const rows = productos.map((p) => ({
      "Código": p.code,
      Producto: p.name,
      "Categoría": p.category,
      "Talles faltantes": p.faltantes,
      "Disponibles (con stock)": p.disponibles,
      Link: p.url,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 10 },
      { wch: 42 },
      { wch: 16 },
      { wch: 22 },
      { wch: 40 },
      { wch: 46 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Talles faltantes");

    // Hoja 2: resumen
    const fecha =
      snapshot?.structured?.fecha ?? new Date().toISOString().split("T")[0];
    const top = Object.entries(resumen?.topTalles ?? {}).sort(
      (a, b) => Number(b[1]) - Number(a[1]),
    );
    const resumenAoa: (string | number)[][] = [
      ["Reporte", "Talles faltantes por producto (web)"],
      ["Cliente", id],
      ["Fecha del relevamiento", fecha],
      ["Fuente", snapshot?.structured?.origin ?? ""],
      ["Productos relevados", resumen?.totalScrapeados ?? ""],
      ["Con talles faltantes", resumen?.conFaltantes ?? productos.length],
      [],
      ["Talles más faltantes", "cantidad"],
      ...top.map(([t, n]) => [t, n] as (string | number)[]),
    ];
    const wsR = XLSX.utils.aoa_to_sheet(resumenAoa);
    wsR["!cols"] = [{ wch: 24 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, wsR, "Resumen");

    XLSX.writeFile(wb, `talles-faltantes-${id}-${fecha}.xlsx`);
  }

  return (
    <>
      <div
        className={ui.head}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div className={ui.eyebrow}>Ecommerce · Stock de la web</div>
          <h1>Talles faltantes</h1>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleExport}
            disabled={productos.length === 0}
            className={ui.btnGhost}
            style={{
              whiteSpace: "nowrap",
              opacity: productos.length === 0 ? 0.5 : 1,
            }}
            title="Descargar la tabla actual como Excel (.xlsx)"
          >
            ⬇ Exportar a Excel
          </button>
          <button
            type="button"
            onClick={handleRun}
            disabled={running}
            className={ui.btnGhost}
            style={{ whiteSpace: "nowrap", opacity: running ? 0.6 : 1 }}
            title="Relevar la tienda ahora sin esperar a la corrida diaria"
          >
            {running ? "Corriendo…" : "↻ Correr ahora"}
          </button>
        </div>
      </div>

      {runMsg && (
        <div
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            marginTop: -6,
            marginBottom: 12,
          }}
        >
          {runMsg}
        </div>
      )}

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
              : "Sin datos todavía. El agente releva la tienda cada día a las 8:00 UY — o tocá «Correr ahora» para relevarla ya."}
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
