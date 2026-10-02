"use client";

/** Producciones del producto (growth) — piezas creativas con presupuesto
 *  y estado, scopeadas por producto, sin cliente. */

import { use, useCallback, useEffect, useState } from "react";
import { PRODUCT_BY_SLUG } from "@/lib/productos";
import {
  getProductoProducciones,
  addProductoProduccion,
  updateProductoProduccion,
  deleteProductoProduccion,
  type ProductoProduccion,
  type NewProduccion,
  type ProduccionTipo,
  type ProduccionEstado,
} from "@/lib/producto-growth";
import {
  PageHead,
  KpiCards,
  Panel,
  EmptyState,
  Overlay,
  ModalBox,
  Pill,
  fieldStyle,
  ghostBtnStyle,
  solidBtnStyle,
} from "@/components/producto/ProductUI";

const TIPO_LABEL: Record<ProduccionTipo, string> = {
  video: "Video", foto: "Foto", diseno: "Diseño", copy: "Copy", campana: "Campaña", otra: "Otra",
};
const ESTADO_LABEL: Record<ProduccionEstado, string> = {
  idea: "Idea", en_curso: "En curso", revision: "Revisión", entregada: "Entregada",
};
const ESTADO_COLOR: Record<ProduccionEstado, string> = {
  idea: "#9B8259", en_curso: "#2F7D6B", revision: "#C98A1A", entregada: "#1F9D55",
};

function money(n: number, moneda: string) {
  return `${moneda} ${n.toLocaleString("es-UY", { maximumFractionDigits: 0 })}`;
}

export default function ProduccionesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const p = PRODUCT_BY_SLUG[slug];
  const [rows, setRows] = useState<ProductoProduccion[]>([]);
  const [modal, setModal] = useState<ProductoProduccion | "new" | null>(null);

  const refresh = useCallback(() => {
    getProductoProducciones(slug).then(setRows);
  }, [slug]);
  useEffect(() => { refresh(); }, [refresh]);

  if (!p) return null;

  const enCurso = rows.filter((r) => r.estado !== "entregada");
  const entregadas = rows.filter((r) => r.estado === "entregada");
  const presupuesto = rows.reduce((s, r) => s + r.presupuesto, 0);
  const ejecutado = rows.reduce((s, r) => s + r.ejecutado, 0);
  const moneda = rows[0]?.moneda ?? "UYU";

  return (
    <>
      <BackLink slug={slug} />
      <div style={head}>
        <PageHead eyebrow={`${p.name} · growth`} title="Producciones" accent={p.accent} />
        <button onClick={() => setModal("new")} style={solidBtnStyle(p.accent)}>+ Nueva producción</button>
      </div>

      <KpiCards
        items={[
          { label: "En curso", value: String(enCurso.length) },
          { label: "Entregadas", value: String(entregadas.length) },
          { label: "Presupuesto", value: money(presupuesto, moneda) },
          { label: "Ejecutado", value: money(ejecutado, moneda) },
        ]}
      />

      <Panel title="En curso" hint="Producciones sin entregar.">
        <List rows={enCurso} onOpen={setModal} emptyMsg="No hay producciones en curso." />
      </Panel>
      <Panel title="Entregadas" hint="Historial de producciones completadas.">
        <List rows={entregadas} onOpen={setModal} emptyMsg="Todavía no hay producciones entregadas." />
      </Panel>

      {modal && (
        <ProduccionModal
          producto={slug}
          accent={p.accent}
          row={modal === "new" ? null : modal}
          onClose={() => setModal(null)}
          onChanged={refresh}
        />
      )}
    </>
  );
}

function List({
  rows, onOpen, emptyMsg,
}: {
  rows: ProductoProduccion[]; onOpen: (r: ProductoProduccion) => void; emptyMsg: string;
}) {
  if (rows.length === 0) return <EmptyState>{emptyMsg}</EmptyState>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((r) => (
        <button key={r.id} onClick={() => onOpen(r)} style={rowBtn}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <span style={{ fontWeight: 700, color: "var(--deep-green)" }}>{r.titulo}</span>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {TIPO_LABEL[r.tipo]}{r.fechaEntrega ? ` · entrega ${r.fechaEntrega}` : ""}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {r.presupuesto > 0 && (
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {money(r.ejecutado, r.moneda)} / {money(r.presupuesto, r.moneda)}
              </span>
            )}
            <Pill label={ESTADO_LABEL[r.estado]} color={ESTADO_COLOR[r.estado]} />
          </div>
        </button>
      ))}
    </div>
  );
}

function ProduccionModal({
  producto, accent, row, onClose, onChanged,
}: {
  producto: string; accent: string; row: ProductoProduccion | null;
  onClose: () => void; onChanged: () => void;
}) {
  const [f, setF] = useState<NewProduccion>({
    producto,
    titulo: row?.titulo ?? "",
    tipo: row?.tipo ?? "video",
    estado: row?.estado ?? "idea",
    presupuesto: row?.presupuesto ?? 0,
    ejecutado: row?.ejecutado ?? 0,
    moneda: row?.moneda ?? "UYU",
    fechaEntrega: row?.fechaEntrega ?? null,
    notas: row?.notas ?? "",
  });
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try { await fn(); onChanged(); onClose(); } finally { setBusy(false); }
  }

  return (
    <Overlay onClose={onClose}>
      <ModalBox width={560}>
        <h3 style={{ margin: 0, marginBottom: 16, color: "var(--deep-green)" }}>
          {row ? "Editar producción" : "Nueva producción"}
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Título">
            <input style={fieldStyle} value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} placeholder="Ej: Video demo producto" />
          </Field>
          <div style={grid3}>
            <Field label="Tipo">
              <select style={fieldStyle} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as ProduccionTipo })}>
                {Object.entries(TIPO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Estado">
              <select style={fieldStyle} value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value as ProduccionEstado })}>
                {Object.entries(ESTADO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Entrega">
              <input type="date" style={fieldStyle} value={f.fechaEntrega ?? ""} onChange={(e) => setF({ ...f, fechaEntrega: e.target.value || null })} />
            </Field>
          </div>
          <div style={grid3}>
            <Field label="Presupuesto">
              <input type="number" min={0} style={fieldStyle} value={f.presupuesto} onChange={(e) => setF({ ...f, presupuesto: Number(e.target.value) })} />
            </Field>
            <Field label="Ejecutado">
              <input type="number" min={0} style={fieldStyle} value={f.ejecutado} onChange={(e) => setF({ ...f, ejecutado: Number(e.target.value) })} />
            </Field>
            <Field label="Moneda">
              <select style={fieldStyle} value={f.moneda} onChange={(e) => setF({ ...f, moneda: e.target.value })}>
                <option value="UYU">UYU</option><option value="USD">USD</option>
              </select>
            </Field>
          </div>
          <Field label="Notas">
            <textarea rows={2} style={{ ...fieldStyle, resize: "vertical" }} value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} />
          </Field>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18 }}>
          {row ? (
            <button onClick={() => run(() => deleteProductoProduccion(row.id))} disabled={busy} style={{ ...ghostBtnStyle, color: "#b04b3a" }}>Eliminar</button>
          ) : <span />}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={ghostBtnStyle}>Cancelar</button>
            <button
              onClick={() => row ? run(() => updateProductoProduccion(row.id, f)) : run(() => addProductoProduccion(f))}
              disabled={busy || !f.titulo.trim()}
              style={{ ...solidBtnStyle(accent), opacity: !f.titulo.trim() ? 0.5 : 1 }}
            >
              {busy ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </ModalBox>
    </Overlay>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--sand-dark)", fontWeight: 700 }}>{label}</span>
      {children}
    </label>
  );
}

function BackLink({ slug }: { slug: string }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <a href={`/producto/${slug}/growth`} style={{ color: "var(--sand-dark)", fontSize: 12, textDecoration: "none" }}>← Growth</a>
    </div>
  );
}

const head: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" };
const rowBtn: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 14px", background: "var(--off-white)", border: "none", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", textAlign: "left", width: "100%" };
const grid3: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 };
