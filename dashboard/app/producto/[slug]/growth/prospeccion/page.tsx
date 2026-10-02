"use client";

/** Prospección del producto (growth) — pipeline comercial por etapa,
 *  scopeado por producto, sin cliente. */

import { use, useCallback, useEffect, useState } from "react";
import { PRODUCT_BY_SLUG } from "@/lib/productos";
import {
  getProductoProspectos,
  addProductoProspecto,
  updateProductoProspecto,
  deleteProductoProspecto,
  type ProductoProspecto,
  type NewProspecto,
  type ProspectoEtapa,
} from "@/lib/producto-growth";
import {
  PageHead,
  KpiCards,
  Overlay,
  ModalBox,
  fieldStyle,
  ghostBtnStyle,
  solidBtnStyle,
} from "@/components/producto/ProductUI";

const ETAPAS: ProspectoEtapa[] = ["nuevo", "contactado", "propuesta", "ganado", "perdido"];
const ETAPA_LABEL: Record<ProspectoEtapa, string> = {
  nuevo: "Nuevo", contactado: "Contactado", propuesta: "Propuesta", ganado: "Ganado", perdido: "Perdido",
};
const ETAPA_COLOR: Record<ProspectoEtapa, string> = {
  nuevo: "#5A6A5E", contactado: "#2F7D6B", propuesta: "#C98A1A", ganado: "#1F9D55", perdido: "#b04b3a",
};

function money(n: number, moneda: string) {
  return `${moneda} ${n.toLocaleString("es-UY", { maximumFractionDigits: 0 })}`;
}

export default function ProspeccionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const p = PRODUCT_BY_SLUG[slug];
  const [rows, setRows] = useState<ProductoProspecto[]>([]);
  const [modal, setModal] = useState<ProductoProspecto | "new" | null>(null);

  const refresh = useCallback(() => {
    getProductoProspectos(slug).then(setRows);
  }, [slug]);
  useEffect(() => { refresh(); }, [refresh]);

  if (!p) return null;

  const abiertos = rows.filter((r) => r.etapa !== "ganado" && r.etapa !== "perdido");
  const enPropuesta = rows.filter((r) => r.etapa === "propuesta");
  const ganados = rows.filter((r) => r.etapa === "ganado");
  const pipeline = abiertos.reduce((s, r) => s + r.valor, 0);
  const moneda = rows[0]?.moneda ?? "UYU";

  return (
    <>
      <BackLink slug={slug} />
      <div style={head}>
        <PageHead eyebrow={`${p.name} · growth`} title="Prospección" accent={p.accent} />
        <button onClick={() => setModal("new")} style={solidBtnStyle(p.accent)}>+ Nuevo prospecto</button>
      </div>

      <KpiCards
        items={[
          { label: "Prospectos activos", value: String(abiertos.length) },
          { label: "En propuesta", value: String(enPropuesta.length) },
          { label: "Ganados", value: String(ganados.length), accent: "#1F9D55" },
          { label: "Valor pipeline", value: money(pipeline, moneda) },
        ]}
      />

      {/* Pipeline por etapa */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, alignItems: "start" }}>
        {ETAPAS.map((etapa) => {
          const col = rows.filter((r) => r.etapa === etapa);
          const total = col.reduce((s, r) => s + r.valor, 0);
          return (
            <div key={etapa} style={{ background: "var(--off-white)", borderRadius: "var(--r-lg)", padding: 12, borderTop: `3px solid ${ETAPA_COLOR[etapa]}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--deep-green)" }}>{ETAPA_LABEL[etapa]}</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{col.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {col.map((r) => (
                  <button key={r.id} onClick={() => setModal(r)} style={cardBtn}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "var(--deep-green)" }}>{r.nombre}</div>
                    {r.empresa && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{r.empresa}</div>}
                    {r.valor > 0 && <div style={{ fontSize: 12, fontWeight: 600, color: ETAPA_COLOR[etapa], marginTop: 4 }}>{money(r.valor, r.moneda)}</div>}
                  </button>
                ))}
                {col.length === 0 && <div style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic", padding: "6px 2px" }}>—</div>}
              </div>
              {total > 0 && (
                <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-muted)", textAlign: "right" }}>{money(total, moneda)}</div>
              )}
            </div>
          );
        })}
      </div>

      {modal && (
        <ProspectoModal
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

function ProspectoModal({
  producto, accent, row, onClose, onChanged,
}: {
  producto: string; accent: string; row: ProductoProspecto | null;
  onClose: () => void; onChanged: () => void;
}) {
  const [f, setF] = useState<NewProspecto>({
    producto,
    nombre: row?.nombre ?? "",
    empresa: row?.empresa ?? "",
    contacto: row?.contacto ?? "",
    etapa: row?.etapa ?? "nuevo",
    valor: row?.valor ?? 0,
    moneda: row?.moneda ?? "UYU",
    notas: row?.notas ?? "",
  });
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try { await fn(); onChanged(); onClose(); } finally { setBusy(false); }
  }

  return (
    <Overlay onClose={onClose}>
      <ModalBox width={520}>
        <h3 style={{ margin: 0, marginBottom: 16, color: "var(--deep-green)" }}>
          {row ? "Editar prospecto" : "Nuevo prospecto"}
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Nombre">
            <input style={fieldStyle} value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Nombre del contacto" />
          </Field>
          <div style={grid2}>
            <Field label="Empresa">
              <input style={fieldStyle} value={f.empresa} onChange={(e) => setF({ ...f, empresa: e.target.value })} />
            </Field>
            <Field label="Contacto (tel / mail)">
              <input style={fieldStyle} value={f.contacto} onChange={(e) => setF({ ...f, contacto: e.target.value })} />
            </Field>
          </div>
          <div style={grid3}>
            <Field label="Etapa">
              <select style={fieldStyle} value={f.etapa} onChange={(e) => setF({ ...f, etapa: e.target.value as ProspectoEtapa })}>
                {ETAPAS.map((k) => <option key={k} value={k}>{ETAPA_LABEL[k]}</option>)}
              </select>
            </Field>
            <Field label="Valor">
              <input type="number" min={0} style={fieldStyle} value={f.valor} onChange={(e) => setF({ ...f, valor: Number(e.target.value) })} />
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
            <button onClick={() => run(() => deleteProductoProspecto(row.id))} disabled={busy} style={{ ...ghostBtnStyle, color: "#b04b3a" }}>Eliminar</button>
          ) : <span />}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={ghostBtnStyle}>Cancelar</button>
            <button
              onClick={() => row ? run(() => updateProductoProspecto(row.id, f)) : run(() => addProductoProspecto(f))}
              disabled={busy || !f.nombre.trim()}
              style={{ ...solidBtnStyle(accent), opacity: !f.nombre.trim() ? 0.5 : 1 }}
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
const cardBtn: React.CSSProperties = { display: "block", width: "100%", textAlign: "left", background: "var(--white)", border: "1px solid rgba(10,26,12,0.08)", borderRadius: 8, padding: "10px 12px", cursor: "pointer", fontFamily: "inherit" };
const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };
const grid3: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 };
