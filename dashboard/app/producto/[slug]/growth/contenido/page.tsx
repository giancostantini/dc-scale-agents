"use client";

/**
 * Calendario de contenido del PRODUCTO (growth). Duplicado funcional del
 * de cliente pero scopeado por producto (producto_content_posts), sin
 * cliente. Reusa ContentMonthGrid + la lógica pura de content-plan.
 */

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { PRODUCT_BY_SLUG } from "@/lib/productos";
import {
  getProductoContent,
  addProductoContent,
  addProductoContentBatch,
  updateProductoContent,
  deleteProductoContent,
  deleteProductoPlannedBetween,
  getProductoSettings,
  updateProductoSettings,
  type NewProductoPiece,
} from "@/lib/producto-growth";
import ContentMonthGrid from "@/components/content/ContentMonthGrid";
import {
  planMonth,
  plannableSlots,
  monthSummary,
  pieceState,
  isOverdue,
  pieceTitle,
} from "@/lib/content-plan";
import { CONTENT_SLOTS } from "@/lib/content-frequency";
import { isoLocalDate } from "@/lib/content-labels";
import type {
  ContentPost,
  ContentNetwork,
  ContentFormat,
  ContentPieceType,
  ContentStatus,
} from "@/lib/types";
import { PageHead } from "@/components/producto/ProductUI";

const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export default function ProductoContenidoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const p = PRODUCT_BY_SLUG[slug];
  const today = new Date();
  const todayIso = isoLocalDate(today);

  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [freq, setFreq] = useState<Record<string, number>>({});
  const [mix, setMix] = useState<Record<string, { valor?: number; oferta?: number; engagement?: number }>>({});
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [planning, setPlanning] = useState(false);
  const [freqModal, setFreqModal] = useState(false);
  const [dayModal, setDayModal] = useState<string | null>(null);
  const [pieceId, setPieceId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    getProductoContent(slug).then(setPosts);
  }, [slug]);

  useEffect(() => {
    refresh();
    getProductoSettings(slug).then((s) => {
      setFreq((s.content_frequency ?? {}) as Record<string, number>);
      setMix(
        (s.content_mix ?? {}) as Record<
          string,
          { valor?: number; oferta?: number; engagement?: number }
        >,
      );
    });
  }, [slug, refresh]);

  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lastDayIso = `${monthKey}-${String(daysInMonth).padStart(2, "0")}`;
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
  const isPastMonth =
    year < today.getFullYear() ||
    (year === today.getFullYear() && month < today.getMonth());
  const planFrom = isCurrentMonth ? todayIso : `${monthKey}-01`;

  const monthPosts = useMemo(
    () => posts.filter((pp) => pp.date.startsWith(`${monthKey}-`)),
    [posts, monthKey],
  );
  const summary = monthSummary(monthPosts, todayIso);
  const hasFrequency = plannableSlots(freq).length > 0;

  const missing = useMemo(
    () =>
      isPastMonth
        ? []
        : planMonth({
            frequency: freq,
            mix,
            year,
            month0: month,
            fromDate: planFrom,
            existing: posts,
          }),
    [freq, mix, year, month, planFrom, posts, isPastMonth],
  );

  if (!p) return null;

  async function loadMonth(redo = false) {
    if (planning || isPastMonth) return;
    setPlanning(true);
    try {
      let existing = posts;
      if (redo) {
        await deleteProductoPlannedBetween(slug, planFrom, lastDayIso);
        existing = posts.filter(
          (pp) => !(pp.status === "planned" && pp.date >= planFrom && pp.date <= lastDayIso),
        );
      }
      const plan = planMonth({
        frequency: freq,
        mix,
        year,
        month0: month,
        fromDate: planFrom,
        existing,
      });
      if (plan.length > 0) {
        const pieces: NewProductoPiece[] = plan.map((pp) => ({
          producto: slug,
          date: pp.date,
          network: pp.network,
          networks: [pp.network],
          format: pp.format,
          brief: "",
          contentType: pp.contentType,
          status: "planned",
        }));
        await addProductoContentBatch(pieces);
      }
      refresh();
    } catch (err) {
      alert(`No se pudo cargar: ${(err as Error).message}`);
    } finally {
      setPlanning(false);
    }
  }

  async function cleanMonth() {
    const programadas = monthPosts.filter((pp) => pp.status !== "published");
    if (programadas.length === 0) {
      alert("No hay contenido programado para limpiar este mes.");
      return;
    }
    if (!confirm(`¿Limpiar ${MONTHS_ES[month]}? Se borran ${programadas.length} piezas no publicadas.`)) return;
    setPlanning(true);
    try {
      await getSupabaseDeleteProgrammed(slug, `${monthKey}-01`, lastDayIso);
      refresh();
    } finally {
      setPlanning(false);
    }
  }

  const openPiece = pieceId ? posts.find((pp) => pp.id === pieceId) ?? null : null;

  return (
    <>
      <div style={{ marginBottom: 4 }}>
        <a href={`/producto/${slug}/growth`} style={{ color: "var(--sand-dark)", fontSize: 12, textDecoration: "none" }}>
          ← Growth
        </a>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <PageHead eyebrow={`${p.name} · growth`} title="Calendario de contenido" accent={p.accent} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => setFreqModal(true)} style={ghostBtn}>⚙ Frecuencia</button>
          {hasFrequency && !isPastMonth && missing.length > 0 && (
            <button onClick={() => loadMonth(false)} disabled={planning} style={{ ...solidBtn(p.accent), opacity: planning ? 0.6 : 1 }}>
              {planning ? "Cargando…" : `✨ Cargar (${missing.length})`}
            </button>
          )}
          {!isPastMonth && (
            <button onClick={cleanMonth} disabled={planning} style={{ ...ghostBtn, color: "#b04b3a", borderColor: "rgba(176,75,58,0.35)" }}>
              Limpiar mes
            </button>
          )}
        </div>
      </div>

      {/* Resumen compacto */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, marginBottom: 16 }}>
        <span style={{ color: "var(--text-muted)" }}>
          <strong style={{ color: "var(--deep-green)", fontSize: 15 }}>{summary.total}</strong> contenidos
        </span>
        <span style={{ color: "#0A1A0C" }}>✓ <strong>{summary.subidos}</strong> subidos</span>
        <span style={{ color: "#2f7d4f" }}>● <strong>{summary.preparados}</strong> preparados</span>
        <span style={{ color: "#9B8259" }}>○ <strong>{summary.pendientes}</strong> pendientes</span>
        {summary.atrasados > 0 && (
          <span style={{ color: "#b04b3a", fontWeight: 700 }}>⚠ {summary.atrasados} atrasados</span>
        )}
      </div>

      {/* Calendario */}
      <div style={{ background: "var(--white)", border: "1px solid rgba(10,26,12,0.08)", borderRadius: "var(--r-lg)", padding: 16, boxShadow: "var(--shadow-sm)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontWeight: 700, color: "var(--deep-green)" }}>{MONTHS_ES[month]} {year}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1); }} style={navBtn}>‹</button>
            <button onClick={() => { setMonth(today.getMonth()); setYear(today.getFullYear()); }} style={navBtn}>Hoy</button>
            <button onClick={() => { if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1); }} style={navBtn}>›</button>
          </div>
        </div>
        <ContentMonthGrid
          year={year}
          month={month}
          posts={monthPosts}
          events={[]}
          todayIso={todayIso}
          onOpenPiece={(pp) => setPieceId(pp.id)}
          onOpenDay={(iso) => setDayModal(iso)}
        />
      </div>

      {dayModal && (
        <DayModal
          producto={slug}
          date={dayModal}
          pieces={posts.filter((pp) => pp.date === dayModal)}
          todayIso={todayIso}
          onClose={() => setDayModal(null)}
          onOpenPiece={(id) => { setDayModal(null); setPieceId(id); }}
          onChanged={refresh}
        />
      )}

      {openPiece && (
        <PieceModal
          post={openPiece}
          onClose={() => setPieceId(null)}
          onChanged={refresh}
        />
      )}

      {freqModal && (
        <FreqModal
          freq={freq}
          mix={mix}
          accent={p.accent}
          onClose={() => setFreqModal(false)}
          onSaved={async (f, m) => {
            await updateProductoSettings(slug, { content_frequency: f, content_mix: m });
            setFreq(f);
            setMix(m);
            setFreqModal(false);
          }}
        />
      )}
    </>
  );
}

/** Helper para limpiar (no publicadas) — usa supabase directo vía la lib. */
async function getSupabaseDeleteProgrammed(producto: string, from: string, to: string) {
  const { getSupabase } = await import("@/lib/supabase/client");
  await getSupabase()
    .from("producto_content_posts")
    .delete()
    .eq("producto", producto)
    .neq("status", "published")
    .gte("date", from)
    .lte("date", to);
}

// ==================== MODALES ====================

function DayModal({
  producto,
  date,
  pieces,
  todayIso,
  onClose,
  onOpenPiece,
  onChanged,
}: {
  producto: string;
  date: string;
  pieces: ContentPost[];
  todayIso: string;
  onClose: () => void;
  onOpenPiece: (id: string) => void;
  onChanged: () => void;
}) {
  const [network, setNetwork] = useState<ContentNetwork>("ig");
  const [format, setFormat] = useState<ContentFormat>("post");
  const [contentType, setContentType] = useState<ContentPieceType>("valor");
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    try {
      await addProductoContent({
        producto,
        date,
        network,
        networks: [network],
        format,
        brief: "",
        contentType,
        status: "planned",
      });
      onChanged();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <div style={modalBox(520)}>
        <h3 style={{ margin: 0, marginBottom: 14, color: "var(--deep-green)" }}>Contenido · {date}</h3>
        {pieces.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
            {pieces.map((pp) => (
              <button key={pp.id} onClick={() => onOpenPiece(pp.id)} style={{ ...rowBtn, borderLeft: `3px solid ${isOverdue(pp, todayIso) ? "#b04b3a" : "var(--sand)"}` }}>
                <span>{pieceTitle(pp)}</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{pieceState(pp)}</span>
              </button>
            ))}
          </div>
        )}
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--sand-dark)", fontWeight: 700, marginBottom: 8 }}>Agregar pieza</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
          <select value={network} onChange={(e) => setNetwork(e.target.value as ContentNetwork)} style={inp}>
            <option value="ig">Instagram</option>
            <option value="tt">TikTok</option>
            <option value="in">LinkedIn</option>
            <option value="fb">Facebook</option>
          </select>
          <select value={format} onChange={(e) => setFormat(e.target.value as ContentFormat)} style={inp}>
            <option value="post">Posteo</option>
            <option value="reel">Reel / Video</option>
            <option value="story">Historia</option>
            <option value="carrusel">Carrusel</option>
          </select>
          <select value={contentType} onChange={(e) => setContentType(e.target.value as ContentPieceType)} style={inp}>
            <option value="valor">Valor</option>
            <option value="oferta">Oferta</option>
            <option value="engagement">Engagement</option>
          </select>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={ghostBtn}>Cerrar</button>
          <button onClick={add} disabled={busy} style={solidBtn("var(--deep-green)")}>{busy ? "Agregando…" : "+ Agregar"}</button>
        </div>
      </div>
    </Overlay>
  );
}

function PieceModal({
  post,
  onClose,
  onChanged,
}: {
  post: ContentPost;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [brief, setBrief] = useState(post.brief ?? "");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      onChanged();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const save = (status: ContentStatus) =>
    run(() =>
      updateProductoContent(post.id, {
        brief: brief.trim(),
        status,
        publishedAt: status === "published" ? new Date().toISOString() : null,
      }),
    );

  return (
    <Overlay onClose={onClose}>
      <div style={modalBox(520)}>
        <h3 style={{ margin: 0, marginBottom: 4, color: "var(--deep-green)" }}>{pieceTitle(post)}</h3>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>{post.date} · {pieceState(post)}</div>
        <label style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--sand-dark)", fontWeight: 700 }}>¿Qué se va a subir?</label>
        <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={4} style={{ ...inp, width: "100%", marginTop: 6, marginBottom: 14, resize: "vertical" }} placeholder="Descripción de la pieza…" />
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
          <button onClick={() => run(() => deleteProductoContent(post.id))} disabled={busy} style={{ ...ghostBtn, color: "#b04b3a" }}>Eliminar</button>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => save("scheduled")} disabled={busy} style={ghostBtn}>Guardar (preparado)</button>
            <button onClick={() => save("published")} disabled={busy} style={solidBtn("var(--deep-green)")}>Marcar subido</button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}

function FreqModal({
  freq,
  mix,
  accent,
  onClose,
  onSaved,
}: {
  freq: Record<string, number>;
  mix: Record<string, { valor?: number; oferta?: number; engagement?: number }>;
  accent: string;
  onClose: () => void;
  onSaved: (f: Record<string, number>, m: typeof mix) => void;
}) {
  const [f, setF] = useState<Record<string, number>>({ ...freq });
  const total = Object.values(f).reduce((s, v) => s + (v || 0), 0);

  return (
    <Overlay onClose={onClose}>
      <div style={{ ...modalBox(560), maxHeight: "85vh", overflowY: "auto" }}>
        <h3 style={{ margin: 0, marginBottom: 4, color: "var(--deep-green)" }}>Frecuencia de contenido</h3>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
          ¿Cuántas veces por semana va cada formato? El calendario lo carga solo.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {CONTENT_SLOTS.filter((s) => s.network !== "yt").map((slot) => (
            <div key={slot.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ flex: 1, fontSize: 13, color: "var(--deep-green)" }}>
                {slot.networkLabel} · {slot.formatLabel}
              </span>
              <input
                type="number"
                min={0}
                max={14}
                value={f[slot.key] ?? 0}
                onChange={(e) => setF({ ...f, [slot.key]: Math.max(0, Math.min(14, parseInt(e.target.value || "0", 10))) })}
                style={{ ...inp, width: 64, textAlign: "center" }}
              />
              <span style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 36 }}>/ sem</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>
          Total: <strong>{total}</strong> publicaciones/semana ≈ {Math.round(total * 4.33)} al mes.
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={ghostBtn}>Cancelar</button>
          <button
            onClick={() => {
              const clean: Record<string, number> = {};
              for (const k of Object.keys(f)) if (f[k] > 0) clean[k] = f[k];
              onSaved(clean, mix);
            }}
            style={solidBtn(accent)}
          >
            Guardar
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(10,26,12,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
    >
      {children}
    </div>
  );
}

// ---- estilos ----
const modalBox = (w: number): React.CSSProperties => ({
  background: "var(--white)", borderRadius: 14, padding: 24, width: "100%", maxWidth: w, boxShadow: "0 24px 64px rgba(10,26,12,0.3)",
});
const inp: React.CSSProperties = { padding: "8px 10px", border: "1px solid rgba(10,26,12,0.15)", borderRadius: 6, fontSize: 13, fontFamily: "inherit", background: "var(--white)", color: "var(--deep-green)", outline: "none" };
const ghostBtn: React.CSSProperties = { padding: "8px 14px", fontSize: 12, fontWeight: 600, background: "transparent", border: "1px solid rgba(10,26,12,0.15)", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", color: "var(--deep-green)" };
const solidBtn = (bg: string): React.CSSProperties => ({ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: bg, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" });
const navBtn: React.CSSProperties = { padding: "4px 10px", fontSize: 13, background: "transparent", border: "1px solid rgba(10,26,12,0.15)", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", color: "var(--deep-green)" };
const rowBtn: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--off-white)", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 13, color: "var(--deep-green)", textAlign: "left" };
