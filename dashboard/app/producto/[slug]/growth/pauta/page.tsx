"use client";

/** Pauta publicitaria del producto (growth) — carga manual de campañas,
 *  scopeada por producto, sin cliente. */

import { use, useCallback, useEffect, useState } from "react";
import { PRODUCT_BY_SLUG } from "@/lib/productos";
import {
  getProductoCampaigns,
  addProductoCampaign,
  updateProductoCampaign,
  deleteProductoCampaign,
  type ProductoCampaign,
  type NewCampaign,
  type CampaignPlatform,
  type CampaignStatus,
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

const PLATAFORMAS: Record<CampaignPlatform, string> = {
  meta: "Meta", google: "Google", tiktok: "TikTok", linkedin: "LinkedIn", otra: "Otra",
};
const ESTADO_COLOR: Record<CampaignStatus, string> = {
  activa: "#1F9D55", pausada: "#9B8259", finalizada: "#5A6A5E",
};
const ESTADO_LABEL: Record<CampaignStatus, string> = {
  activa: "Activa", pausada: "Pausada", finalizada: "Finalizada",
};

function money(n: number, moneda: string) {
  return `${moneda} ${n.toLocaleString("es-UY", { maximumFractionDigits: 0 })}`;
}

export default function PautaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const p = PRODUCT_BY_SLUG[slug];
  const [rows, setRows] = useState<ProductoCampaign[]>([]);
  const [modal, setModal] = useState<ProductoCampaign | "new" | null>(null);

  const refresh = useCallback(() => {
    getProductoCampaigns(slug).then(setRows);
  }, [slug]);
  useEffect(() => { refresh(); }, [refresh]);

  if (!p) return null;

  const activas = rows.filter((r) => r.estado === "activa");
  const inversion = rows.reduce((s, r) => s + r.inversion, 0);
  const leads = rows.reduce((s, r) => s + r.leads, 0);
  const cpl = leads > 0 ? inversion / leads : 0;
  const moneda = rows[0]?.moneda ?? "UYU";

  return (
    <>
      <BackLink slug={slug} />
      <div style={head}>
        <PageHead eyebrow={`${p.name} · growth`} title="Pauta publicitaria" accent={p.accent} />
        <button onClick={() => setModal("new")} style={solidBtnStyle(p.accent)}>+ Nueva campaña</button>
      </div>

      <KpiCards
        items={[
          { label: "Campañas activas", value: String(activas.length) },
          { label: "Inversión total", value: money(inversion, moneda) },
          { label: "Leads", value: String(leads) },
          { label: "CPL", value: leads > 0 ? money(cpl, moneda) : "—" },
        ]}
      />

      <Panel title="Campañas" hint="Carga manual de inversión y resultados.">
        {rows.length === 0 ? (
          <EmptyState>Todavía no cargaste campañas. Sumá la primera con “+ Nueva campaña”.</EmptyState>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rows.map((r) => (
              <button key={r.id} onClick={() => setModal(r)} style={rowBtn}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <span style={{ fontWeight: 700, color: "var(--deep-green)" }}>{r.nombre}</span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {PLATAFORMAS[r.plataforma]}{r.fechaInicio ? ` · desde ${r.fechaInicio}` : ""}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{r.leads} leads</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--deep-green)" }}>{money(r.inversion, r.moneda)}</span>
                  <Pill label={ESTADO_LABEL[r.estado]} color={ESTADO_COLOR[r.estado]} />
                </div>
              </button>
            ))}
          </div>
        )}
      </Panel>

      {modal && (
        <CampaignModal
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

function CampaignModal({
  producto, accent, row, onClose, onChanged,
}: {
  producto: string; accent: string; row: ProductoCampaign | null;
  onClose: () => void; onChanged: () => void;
}) {
  const [f, setF] = useState<NewCampaign>({
    producto,
    nombre: row?.nombre ?? "",
    plataforma: row?.plataforma ?? "meta",
    estado: row?.estado ?? "activa",
    inversion: row?.inversion ?? 0,
    moneda: row?.moneda ?? "UYU",
    alcance: row?.alcance ?? 0,
    leads: row?.leads ?? 0,
    fechaInicio: row?.fechaInicio ?? null,
    fechaFin: row?.fechaFin ?? null,
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
          {row ? "Editar campaña" : "Nueva campaña"}
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Nombre">
            <input style={fieldStyle} value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Ej: Leads octubre" />
          </Field>
          <div style={grid3}>
            <Field label="Plataforma">
              <select style={fieldStyle} value={f.plataforma} onChange={(e) => setF({ ...f, plataforma: e.target.value as CampaignPlatform })}>
                {Object.entries(PLATAFORMAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Estado">
              <select style={fieldStyle} value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value as CampaignStatus })}>
                {Object.entries(ESTADO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Moneda">
              <select style={fieldStyle} value={f.moneda} onChange={(e) => setF({ ...f, moneda: e.target.value })}>
                <option value="UYU">UYU</option><option value="USD">USD</option>
              </select>
            </Field>
          </div>
          <div style={grid3}>
            <Field label="Inversión">
              <input type="number" min={0} style={fieldStyle} value={f.inversion} onChange={(e) => setF({ ...f, inversion: Number(e.target.value) })} />
            </Field>
            <Field label="Alcance">
              <input type="number" min={0} style={fieldStyle} value={f.alcance} onChange={(e) => setF({ ...f, alcance: Number(e.target.value) })} />
            </Field>
            <Field label="Leads">
              <input type="number" min={0} style={fieldStyle} value={f.leads} onChange={(e) => setF({ ...f, leads: Number(e.target.value) })} />
            </Field>
          </div>
          <div style={grid2}>
            <Field label="Desde">
              <input type="date" style={fieldStyle} value={f.fechaInicio ?? ""} onChange={(e) => setF({ ...f, fechaInicio: e.target.value || null })} />
            </Field>
            <Field label="Hasta">
              <input type="date" style={fieldStyle} value={f.fechaFin ?? ""} onChange={(e) => setF({ ...f, fechaFin: e.target.value || null })} />
            </Field>
          </div>
          <Field label="Notas">
            <textarea rows={2} style={{ ...fieldStyle, resize: "vertical" }} value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} />
          </Field>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18 }}>
          {row ? (
            <button onClick={() => run(() => deleteProductoCampaign(row.id))} disabled={busy} style={{ ...ghostBtnStyle, color: "#b04b3a" }}>Eliminar</button>
          ) : <span />}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={ghostBtnStyle}>Cancelar</button>
            <button
              onClick={() => row ? run(() => updateProductoCampaign(row.id, f)) : run(() => addProductoCampaign(f))}
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
const rowBtn: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 14px", background: "var(--off-white)", border: "none", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", textAlign: "left", width: "100%" };
const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };
const grid3: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 };
