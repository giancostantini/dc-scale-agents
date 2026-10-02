"use client";

/**
 * /producto/[slug]/producto/actividad — Actividad "en tiempo real".
 * Feed de eventos del producto con búsqueda, filtro por módulo y botón de
 * actualización. Datos DEMO deterministas.
 */

import { use, useMemo, useState } from "react";
import { PRODUCT_BY_SLUG } from "@/lib/productos";
import { appMeta, activityLog } from "@/lib/backoffice-demo";
import { BoHead, Card, FilterBar, SearchFilter, SelectFilter, ghostBtn } from "@/components/backoffice/BackofficeUI";

const DOT_PALETTE = ["#2F7D6B", "#1F9D55", "#C98A1A", "#6D4AFF", "#E07A29", "#b04b3a"];

const feedRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "11px 12px",
  borderBottom: "1px solid rgba(10,26,12,0.06)",
  flexWrap: "wrap",
};

export default function ActividadPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const p = PRODUCT_BY_SLUG[slug];
  const [q, setQ] = useState("");
  const [modulo, setModulo] = useState("");
  const [tick, setTick] = useState(0);

  const meta = appMeta(slug);
  const log = useMemo(() => activityLog(slug, 60), [slug, tick]);

  if (!p) return null;

  const moduleColor = (label: string) => {
    const idx = Math.max(0, meta.modules.findIndex((m) => m.label === label));
    return DOT_PALETTE[idx % DOT_PALETTE.length];
  };

  const query = q.trim().toLowerCase();
  const rows = log.filter((e) => {
    if (modulo && e.modulo !== modulo) return false;
    if (!query) return true;
    return (
      e.empresa.toLowerCase().includes(query) ||
      e.usuario.toLowerCase().includes(query) ||
      e.accion.toLowerCase().includes(query)
    );
  });

  const moduloOptions = meta.modules.map((m) => ({ value: m.label, label: m.label }));

  return (
    <>
      <BoHead
        eyebrow={`${meta.name} · backoffice`}
        title="Actividad en tiempo real"
        accent={p.accent}
        right={<button style={ghostBtn} onClick={() => setTick((t) => t + 1)}>↻ Actualizar</button>}
      />

      <Card title="Feed de actividad" hint="Eventos recientes del producto across clientes.">
        <FilterBar>
          <SearchFilter value={q} onChange={setQ} placeholder="Buscar empresa, usuario o acción…" />
          <SelectFilter value={modulo} onChange={setModulo} options={moduloOptions} placeholder="Todos los módulos" />
        </FilterBar>

        {rows.length === 0 ? (
          <div style={{ padding: 28, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            Sin actividad para ese filtro.
          </div>
        ) : (
          <div style={{ maxHeight: 580, overflowY: "auto", borderRadius: "var(--r-md)", border: "1px solid rgba(10,26,12,0.06)" }}>
            {rows.map((e) => (
              <div key={e.id} style={feedRow}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: moduleColor(e.modulo), flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", width: 48, flexShrink: 0 }}>
                  {e.ts.slice(11, 16)}
                </span>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 13, color: "var(--deep-green)" }}>
                    <strong>{e.usuario}</strong> · <span style={{ color: "var(--text-muted)" }}>{e.empresa}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{e.accion}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: moduleColor(e.modulo), background: `${moduleColor(e.modulo)}1A`, padding: "3px 10px", borderRadius: 999, whiteSpace: "nowrap" }}>
                  {e.modulo}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
