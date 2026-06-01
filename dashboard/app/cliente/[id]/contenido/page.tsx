"use client";

/**
 * Contenido — Ideas de contenido del cliente.
 *
 * Layout NUEVO:
 *   · Arriba: TABLA de ideas (1 fila = 1 ContentPost).
 *     Columnas: Código · Red · Formato · Idea · Fecha · Asignado a
 *     · Estado · Acciones.
 *     Click sobre la fila → expande detalle con campos editables
 *     (Idea full · Copy · CTA si anuncio · Influencer si UGC · Brief).
 *   · Abajo (panel horizontal): Asistente Creativo (chat + propose).
 *
 * Estados:
 *   draft     → idea propuesta, todavía no aprobada.
 *   scheduled → APROBADA — aparece en el Calendario (ex-roadmap).
 *   published → ya publicada.
 *
 * "Aprobar" cambia status=draft → scheduled. Eso es lo que la
 * deposita en el Calendario.
 */

import { use, useCallback, useEffect, useMemo, useState } from "react";
import {
  getClient,
  getContent,
  updateContent,
  deleteContent,
} from "@/lib/storage";
import { listProfiles } from "@/lib/team";
import { getSupabase } from "@/lib/supabase/client";
import { getCurrentProfile, type Profile } from "@/lib/supabase/auth";
import { NETWORK_COLORS } from "@/lib/content-frequency";
import type {
  Client,
  ContentFormat,
  ContentNetwork,
  ContentPost,
  ContentStatus,
} from "@/lib/types";
import ui from "@/components/ClientUI.module.css";

const NETWORK_LABEL: Record<ContentNetwork, string> = {
  ig: "Instagram",
  tt: "TikTok",
  in: "LinkedIn",
  fb: "Facebook",
};

const FORMAT_LABEL: Record<ContentFormat, string> = {
  reel: "Reel",
  post: "Post",
  carrusel: "Carrusel",
  story: "Story",
  ugc: "UGC",
  anuncio: "Anuncio",
};

const STATUS_LABEL: Record<ContentStatus, string> = {
  draft: "Borrador",
  scheduled: "Aprobada",
  published: "Publicada",
};

const STATUS_COLOR: Record<ContentStatus, string> = {
  draft: "#9B8259",
  scheduled: "#2f7d4f",
  published: "#0A1A0C",
};

interface ProposedPiece {
  date: string;
  time: string;
  network: string;
  format: string;
  type?: string;
  idea: string;
  copy: string;
  /** Solo cuando format=anuncio. */
  cta?: string;
  brief: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Genera el código visual de la pieza basado en su posición. */
function codeFor(idx: number): string {
  return `C-${String(idx + 1).padStart(4, "0")}`;
}

const MONTHS_ES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

/**
 * Formatea YYYY-MM-DD a "12 mar 2026" — más legible que el ISO
 * crudo y todavía cabe en una sola línea de la tabla.
 */
function formatHumanDate(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  const y = iso.slice(0, 4);
  const m = Number(iso.slice(5, 7)) - 1;
  const d = Number(iso.slice(8, 10));
  if (Number.isNaN(m) || Number.isNaN(d)) return iso;
  return `${d} ${MONTHS_ES[m] ?? "?"} ${y}`;
}

/**
 * Extrae la cantidad de piezas del mensaje del director.
 *   "dame 40 publicaciones" → 40
 *   "armá 12 piezas para abril" → 12
 *   "ideas de contenido para mayo" → undefined (default del agente)
 *
 * Toma el PRIMER número entre 1 y 200 que aparece en el mensaje.
 * Filtra años (≥2000) y números chicos típicos no relacionados al
 * count (como "Reels 9:16" o "60 segundos").
 */
function extractCountFromMessage(msg: string): number | undefined {
  const matches = msg.match(/\b(\d{1,3})\b/g);
  if (!matches) return undefined;
  for (const m of matches) {
    const n = Number(m);
    if (n >= 1 && n <= 200) {
      // Saltar años / formatos típicos
      if (n === 4 || n === 9 || n === 16 || n === 24 || n === 60) continue;
      return n;
    }
  }
  return undefined;
}

/**
 * Genera y descarga un CSV (UTF-8 con BOM) con los contenidos
 * filtrados. Excel/Numbers lo abre directamente como hoja de cálculo
 * sin requerir conversión. Usamos CSV en vez de XLSX nativo para
 * evitar sumar una dep pesada (sheetjs ~600KB) al bundle.
 */
function downloadContenidoCSV(
  posts: ContentPost[],
  clientName: string,
  teamMembers: Profile[],
): void {
  if (posts.length === 0) return;
  const memberById = new Map(teamMembers.map((m) => [m.id, m.name]));
  const header = [
    "Código",
    "Fecha",
    "Hora",
    "Red",
    "Formato",
    "Idea",
    "Copy",
    "CTA",
    "Influencer",
    "Asignado a",
    "Estado",
    "Brief",
  ];
  // Escape CSV: si tiene coma, salto de línea o comilla, envolver en
  // comillas dobles y duplicar comillas internas.
  const esc = (v: string | null | undefined): string => {
    const s = (v ?? "").toString();
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [header.map(esc).join(",")];
  posts.forEach((p, idx) => {
    lines.push(
      [
        codeFor(idx),
        p.date,
        p.time ?? "",
        NETWORK_LABEL[p.network] ?? p.network,
        FORMAT_LABEL[p.format] ?? p.format,
        p.idea ?? "",
        p.copy ?? "",
        p.cta ?? "",
        p.influencer ?? "",
        (p.assignedTo && memberById.get(p.assignedTo)) ?? "",
        STATUS_LABEL[p.status],
        p.brief ?? "",
      ]
        .map(esc)
        .join(","),
    );
  });
  // BOM ﻿ para que Excel detecte UTF-8 (acentos, ñ).
  const csv = "﻿" + lines.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeName = clientName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const today = new Date().toISOString().slice(0, 10);
  a.download = `contenido-${safeName}-${today}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Parser defensivo del JSON de propose: tolera code fences, preámbulos
 * tipo "Acá tenés las piezas:" y texto extra después del JSON. Busca
 * el primer { y trata de extraer un objeto balanceado.
 */
function parseProposedFromText(raw: string): unknown {
  if (!raw) return null;
  // 1) Probar el path directo
  try {
    return JSON.parse(raw.trim());
  } catch {
    // continuar
  }
  // 2) Limpiar code fences ```json o ```
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // continuar
  }
  // 3) Buscar primer { y extraer hasta el } balanceado
  const start = raw.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let end = -1;
  let inString = false;
  let escape = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

export default function ContenidoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [client, setClient] = useState<Client | null>(null);
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [isDirector, setIsDirector] = useState(false);
  const [teamMembers, setTeamMembers] = useState<Profile[]>([]);
  const [filter, setFilter] = useState<"all" | ContentStatus>("all");
  const [periodMode, setPeriodMode] = useState<
    "all" | "this_month" | "last_month" | "next_month" | "last_30" | "next_30" | "custom"
  >("all");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Asistente Creativo
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [proposed, setProposed] = useState<{
    intro: string;
    pieces: ProposedPiece[];
  } | null>(null);
  const [savingBatch, setSavingBatch] = useState(false);

  const refresh = useCallback(() => {
    getContent(id).then(setPosts);
  }, [id]);

  useEffect(() => {
    refresh();
    getClient(id).then((c) => setClient(c ?? null));
    getCurrentProfile().then((p) => setIsDirector(p?.role === "director"));
    listProfiles().then((profs) =>
      setTeamMembers(profs.filter((p) => p.role !== "client")),
    );
  }, [id, refresh]);

  const sortedFiltered = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    // Aplicar filtro de período sobre post.date
    const inPeriod = (dateStr: string): boolean => {
      if (periodMode === "all") return true;
      const now = new Date();
      const d = new Date(dateStr);
      if (periodMode === "this_month") {
        return (
          d.getFullYear() === now.getFullYear() &&
          d.getMonth() === now.getMonth()
        );
      }
      if (periodMode === "last_month") {
        const ref = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        return (
          d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth()
        );
      }
      if (periodMode === "next_month") {
        const ref = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        return (
          d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth()
        );
      }
      if (periodMode === "custom") {
        // Si solo está from o solo está to, filtra contra ese límite.
        // Si no hay nada, no filtra. Comparación por string YYYY-MM-DD.
        if (customFrom && dateStr < customFrom) return false;
        if (customTo && dateStr > customTo) return false;
        return true;
      }
      const days =
        periodMode === "last_30" ? -30 : periodMode === "next_30" ? 30 : 0;
      const ref = new Date();
      ref.setDate(ref.getDate() + days);
      if (days < 0) return d >= ref && d <= now;
      return d >= now && d <= ref;
    };
    const filtered = posts
      .filter((p) => filter === "all" || p.status === filter)
      .filter((p) => inPeriod(p.date));
    return [...filtered].sort((a, b) => {
      const aOverdue = a.status !== "published" && a.date < today;
      const bOverdue = b.status !== "published" && b.date < today;
      if (aOverdue && !bOverdue) return -1;
      if (bOverdue && !aOverdue) return 1;
      return a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "");
    });
  }, [posts, filter, periodMode, customFrom, customTo]);

  const stats = {
    total: posts.length,
    draft: posts.filter((p) => p.status === "draft").length,
    scheduled: posts.filter((p) => p.status === "scheduled").length,
    published: posts.filter((p) => p.status === "published").length,
  };

  // ============ Mutations ============
  async function patchPost(post: ContentPost, patch: Partial<ContentPost>) {
    await updateContent(post.id, {
      date: patch.date,
      time: patch.time === undefined ? undefined : patch.time,
      network: patch.network,
      format: patch.format,
      brief: patch.brief,
      idea: patch.idea,
      copy: patch.copy,
      cta: patch.cta,
      influencer: patch.influencer,
      assignedTo: patch.assignedTo,
      status: patch.status,
    });
    refresh();
  }

  async function approve(post: ContentPost) {
    await patchPost(post, { status: "scheduled" });
  }

  async function unapprove(post: ContentPost) {
    await patchPost(post, { status: "draft" });
  }

  async function markPublished(post: ContentPost) {
    await patchPost(post, { status: "published" });
  }

  async function deleteOne(post: ContentPost) {
    if (!confirm("¿Eliminar esta idea?")) return;
    await deleteContent(post.id);
    refresh();
  }

  // ============ Asistente ============
  async function sendChat(mode: "chat" | "propose") {
    if (!input.trim() || thinking) return;
    const userMsg: ChatMessage = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setThinking(true);
    setProposed(null);

    try {
      const supabase = getSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Sin sesión");

      const res = await fetch(`/api/clients/${id}/creative-assistant`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          mode,
          messages: [...messages, userMsg],
          constraints: mode === "propose"
            ? { count: extractCountFromMessage(userMsg.content) }
            : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error([data?.error, data?.detail].filter(Boolean).join(" — "));
      }

      const reply = data.reply ?? "";
      if (mode === "propose") {
        // Path preferido (nuevo): el backend devuelve `proposed` ya
        // parseado desde el tool_use de Anthropic.
        let parsed = data.proposed ?? null;
        // Fallback: si por algún motivo no vino estructurado, intentamos
        // parsear el texto del reply de forma defensiva (buscando el
        // primer {...} para tolerar preámbulos).
        if (!parsed && reply) {
          parsed = parseProposedFromText(reply);
        }
        if (
          parsed &&
          typeof parsed === "object" &&
          Array.isArray((parsed as { pieces?: unknown[] }).pieces)
        ) {
          const typed = parsed as { intro?: string; pieces: ProposedPiece[] };
          setProposed({ intro: typed.intro ?? "", pieces: typed.pieces });
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content:
                typed.intro ??
                `Te propongo ${typed.pieces.length} piezas. Revisalas abajo y aprobalas o ajustá lo que quieras.`,
            },
          ]);
          return;
        }
        // Si llegamos acá, el modelo no devolvió el batch.  Lo mostramos
        // como chat para que el director vea qué dijo el modelo y pueda
        // pedirlo de nuevo.
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              (reply || "El asistente no devolvió un batch estructurado.") +
              "\n\n⚠ No se pudo armar el listado de piezas — probá apretar ✨ Generar batch otra vez.",
          },
        ]);
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      const e = err as Error;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `⚠ Error: ${e.message}` },
      ]);
    } finally {
      setThinking(false);
    }
  }

  async function approveBatch() {
    if (!proposed) return;
    setSavingBatch(true);
    try {
      const supabase = getSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Sin sesión");

      const res = await fetch(`/api/clients/${id}/creative-bulk-save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          // Cada campo en su columna — antes se concatenaba todo en
          // brief y la tabla mostraba "(sin idea)" porque idea quedaba
          // null. Ahora idea/copy/cta/brief van separados al insert.
          pieces: proposed.pieces.map((p) => ({
            date: p.date,
            time: p.time,
            network: p.network,
            format: p.format,
            idea: p.idea,
            copy: p.copy,
            // CTA solo si format=anuncio (el asistente puede mandarlo
            // igual; lo dejamos pasar y el backend lo guarda).
            cta: p.cta,
            brief: p.brief,
            status: "draft",
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error([data?.error, data?.detail].filter(Boolean).join(" — "));
      }
      alert(
        `✓ ${data.created} ideas agregadas.${data.skipped > 0 ? ` (${data.skipped} descartadas)` : ""}`,
      );
      setProposed(null);
      refresh();
    } catch (err) {
      const e = err as Error;
      alert(`No se pudieron guardar:\n${e.message}`);
    } finally {
      setSavingBatch(false);
    }
  }

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Cliente · Contenido</div>
          <h1>Ideas de contenido</h1>
          {client && (
            <div
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                marginTop: 6,
              }}
            >
              {client.name} · cuando aprobás una idea, pasa al{" "}
              <strong>Calendario</strong>.
            </div>
          )}
        </div>
      </div>

      {/* KPIs compactos */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <CompactKpi label="Total" value={stats.total} />
        <CompactKpi label="Borradores" value={stats.draft} color={STATUS_COLOR.draft} />
        <CompactKpi label="Aprobadas" value={stats.scheduled} color={STATUS_COLOR.scheduled} />
        <CompactKpi label="Publicadas" value={stats.published} color={STATUS_COLOR.published} />
      </div>

      {/* Filtros: estado + período */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 14,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {(["all", "draft", "scheduled", "published"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "5px 12px",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              background: filter === f ? "var(--deep-green)" : "transparent",
              color: filter === f ? "var(--off-white)" : "var(--deep-green)",
              border: "1px solid rgba(10,26,12,0.15)",
              cursor: "pointer",
              fontFamily: "inherit",
              borderRadius: 4,
            }}
          >
            {f === "all" ? `Todas · ${stats.total}` : `${STATUS_LABEL[f]} · ${stats[f]}`}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            color: "var(--text-muted)",
            letterSpacing: "0.04em",
          }}
        >
          Período:
          <select
            value={periodMode}
            onChange={(e) => setPeriodMode(e.target.value as typeof periodMode)}
            style={{
              padding: "5px 10px",
              fontSize: 11,
              fontWeight: 600,
              border: "1px solid rgba(10,26,12,0.15)",
              borderRadius: 4,
              background: "var(--white)",
              cursor: "pointer",
              fontFamily: "inherit",
              color: "var(--deep-green)",
            }}
          >
            <option value="all">Todo el calendario</option>
            <option value="this_month">Este mes</option>
            <option value="last_month">Mes anterior</option>
            <option value="next_month">Próximo mes</option>
            <option value="last_30">Últimos 30 días</option>
            <option value="next_30">Próximos 30 días</option>
            <option value="custom">Rango personalizado…</option>
          </select>
        </label>
        {periodMode === "custom" && (
          <div
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
              fontSize: 11,
              color: "var(--text-muted)",
            }}
          >
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              style={{
                padding: "5px 8px",
                fontSize: 11,
                border: "1px solid rgba(10,26,12,0.15)",
                borderRadius: 4,
                background: "var(--white)",
                color: "var(--deep-green)",
                fontFamily: "inherit",
              }}
              title="Desde"
            />
            <span style={{ fontSize: 10 }}>→</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              style={{
                padding: "5px 8px",
                fontSize: 11,
                border: "1px solid rgba(10,26,12,0.15)",
                borderRadius: 4,
                background: "var(--white)",
                color: "var(--deep-green)",
                fontFamily: "inherit",
              }}
              title="Hasta"
            />
          </div>
        )}
        <button
          onClick={() =>
            downloadContenidoCSV(
              sortedFiltered,
              client?.name ?? "cliente",
              teamMembers,
            )
          }
          disabled={sortedFiltered.length === 0}
          style={{
            padding: "5px 12px",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            background: "transparent",
            color: "var(--deep-green)",
            border: "1px solid var(--sand-dark)",
            cursor: sortedFiltered.length === 0 ? "default" : "pointer",
            fontFamily: "inherit",
            borderRadius: 4,
            opacity: sortedFiltered.length === 0 ? 0.4 : 1,
          }}
          title="Descargar listado de contenidos visibles como Excel (CSV UTF-8 con BOM — se abre directo en Excel/Numbers)"
        >
          ⬇ Descargar Excel
        </button>
      </div>

      {/* TABLA de ideas */}
      <div className={ui.panel} style={{ marginBottom: 24, padding: 0, overflow: "hidden" }}>
        {sortedFiltered.length === 0 ? (
          <div
            style={{
              padding: 40,
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: 13,
              fontStyle: "italic",
            }}
          >
            Sin ideas todavía. Usá el Asistente Creativo abajo ↓ para empezar.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--off-white)", borderBottom: "1px solid rgba(10,26,12,0.1)" }}>
                  <th style={thStyle}>Código</th>
                  <th style={thStyle}>Red</th>
                  <th style={thStyle}>Formato</th>
                  <th style={{ ...thStyle, minWidth: 260 }}>Idea</th>
                  <th style={thStyle}>Fecha</th>
                  <th style={thStyle}>Asignado a</th>
                  <th style={thStyle}>Estado</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sortedFiltered.map((p, idx) => {
                  const today = new Date().toISOString().slice(0, 10);
                  const overdue = p.status !== "published" && p.date < today;
                  const isExpanded = expandedId === p.id;
                  const netColor =
                    (NETWORK_COLORS as Record<string, { solid: string }>)[p.network]?.solid ?? "#0A1A0C";
                  return (
                    <RowEditor
                      key={p.id}
                      post={p}
                      code={codeFor(idx)}
                      netColor={netColor}
                      overdue={overdue}
                      isExpanded={isExpanded}
                      onExpand={() => setExpandedId(isExpanded ? null : p.id)}
                      onPatch={(patch) => patchPost(p, patch)}
                      onApprove={() => approve(p)}
                      onUnapprove={() => unapprove(p)}
                      onPublish={() => markPublished(p)}
                      onDelete={() => deleteOne(p)}
                      isDirector={isDirector}
                      teamMembers={teamMembers}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ============== ASISTENTE CREATIVO HORIZONTAL ============== */}
      <div
        style={{
          background: "var(--white)",
          border: "1px solid rgba(10,26,12,0.08)",
          borderRadius: "var(--r-lg)",
          padding: 18,
          marginTop: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--sand-dark)",
                fontWeight: 700,
              }}
            >
              ✨ Asistente Creativo
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
              Pedile ideas, copies o un batch de piezas. Conoce la estrategia, frecuencia y mix del cliente.
            </div>
          </div>
        </div>

        {/* Mensajes */}
        {(messages.length > 0 || thinking || proposed) && (
          <div
            style={{
              maxHeight: 260,
              overflowY: "auto",
              padding: 4,
              marginBottom: 10,
              border: "1px solid rgba(10,26,12,0.06)",
              borderRadius: "var(--r-sm)",
            }}
          >
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  padding: 10,
                  background: m.role === "user" ? "var(--off-white)" : "var(--ivory)",
                  borderLeft: `3px solid ${m.role === "user" ? "var(--sand-dark)" : "var(--deep-green)"}`,
                  fontSize: 12,
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                  marginBottom: 6,
                  borderRadius: "0 var(--r-sm) var(--r-sm) 0",
                }}
              >
                {m.content}
              </div>
            ))}
            {thinking && (
              <div style={{ padding: 10, color: "var(--text-muted)", fontStyle: "italic", fontSize: 12 }}>
                Pensando…
              </div>
            )}
            {proposed && (
              <div
                style={{
                  padding: 12,
                  background: "rgba(196,168,130,0.08)",
                  border: "1px solid rgba(196,168,130,0.3)",
                  borderRadius: "var(--r-sm)",
                  marginTop: 8,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--sand-dark)",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    marginBottom: 8,
                  }}
                >
                  {proposed.pieces.length} piezas propuestas
                </div>
                <div style={{ maxHeight: 320, overflowY: "auto" }}>
                  {proposed.pieces.map((p, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "10px 12px",
                        background: "var(--white)",
                        marginBottom: 6,
                        fontSize: 11,
                        borderLeft: "2px solid var(--sand-dark)",
                        borderRadius: "var(--r-sm)",
                      }}
                    >
                      <div style={{ fontWeight: 700, color: "var(--deep-green)" }}>
                        {p.date} {p.time} ·{" "}
                        {NETWORK_LABEL[p.network as ContentNetwork] ?? p.network}{" "}
                        · {FORMAT_LABEL[p.format as ContentFormat] ?? p.format}
                        {p.type && (
                          <span
                            style={{
                              marginLeft: 6,
                              padding: "1px 6px",
                              fontSize: 9,
                              background: "var(--ivory)",
                              color: "var(--sand-dark)",
                              borderRadius: "var(--r-pill)",
                              textTransform: "uppercase",
                              letterSpacing: "0.08em",
                            }}
                          >
                            {p.type}
                          </span>
                        )}
                      </div>
                      <div style={{ marginTop: 4 }}>
                        <strong style={{ color: "var(--sand-dark)" }}>Idea:</strong>{" "}
                        {p.idea}
                      </div>
                      {p.copy && (
                        <div style={{ marginTop: 3, lineHeight: 1.4 }}>
                          <strong style={{ color: "var(--sand-dark)" }}>Copy:</strong>{" "}
                          {p.copy.length > 140
                            ? p.copy.slice(0, 140) + "…"
                            : p.copy}
                        </div>
                      )}
                      {p.cta && (
                        <div style={{ marginTop: 3 }}>
                          <strong style={{ color: "var(--sand-dark)" }}>CTA:</strong>{" "}
                          {p.cta}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  <button
                    onClick={approveBatch}
                    disabled={savingBatch}
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      fontSize: 11,
                      fontWeight: 600,
                      background: "var(--deep-green)",
                      color: "var(--off-white)",
                      border: "none",
                      cursor: savingBatch ? "default" : "pointer",
                      fontFamily: "inherit",
                      borderRadius: "var(--r-sm)",
                      opacity: savingBatch ? 0.5 : 1,
                    }}
                  >
                    {savingBatch ? "Guardando…" : "✓ Agregar como borradores"}
                  </button>
                  <button
                    onClick={() => setProposed(null)}
                    style={{
                      padding: "8px 12px",
                      fontSize: 11,
                      background: "transparent",
                      border: "1px solid rgba(10,26,12,0.15)",
                      color: "var(--deep-green)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      borderRadius: "var(--r-sm)",
                    }}
                  >
                    Descartar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Input + acciones */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              isDirector
                ? 'Ej: "Armame 12 piezas para junio enfocadas en lanzamiento" · "8 anuncios para promo de invierno con CTA"…'
                : "Solo director puede usar el asistente"
            }
            rows={2}
            disabled={!isDirector || thinking}
            style={{
              padding: "10px 12px",
              border: "1px solid rgba(10,26,12,0.15)",
              background: "var(--white)",
              color: "var(--deep-green)",
              fontFamily: "inherit",
              fontSize: 12,
              resize: "vertical",
              borderRadius: "var(--r-sm)",
              outline: "none",
            }}
          />

          {/* Botones — primary = generar piezas a la tabla, secondary = chat */}
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={() => sendChat("propose")}
              disabled={!isDirector || thinking || !input.trim()}
              style={{
                padding: "10px 18px",
                fontSize: 12,
                fontWeight: 700,
                background: "var(--deep-green)",
                color: "var(--off-white)",
                border: "none",
                cursor: thinking || !input.trim() ? "default" : "pointer",
                fontFamily: "inherit",
                borderRadius: "var(--r-sm)",
                opacity: thinking || !input.trim() ? 0.5 : 1,
                whiteSpace: "nowrap",
              }}
              title="Genera idea + copy + CTA (anuncios) para cada pieza y las muestra como borradores en la tabla."
            >
              ✨ Generar ideas para la tabla
            </button>
            <button
              onClick={() => sendChat("chat")}
              disabled={!isDirector || thinking || !input.trim()}
              style={{
                padding: "10px 16px",
                fontSize: 12,
                fontWeight: 600,
                background: "transparent",
                border: "1px solid var(--sand-dark)",
                color: "var(--sand-dark)",
                cursor: thinking || !input.trim() ? "default" : "pointer",
                fontFamily: "inherit",
                borderRadius: "var(--r-sm)",
                opacity: thinking || !input.trim() ? 0.5 : 1,
                whiteSpace: "nowrap",
              }}
              title="Conversación libre — ideal para brainstorm o pedir consejos sin agregar piezas a la tabla."
            >
              💬 Solo chatear
            </button>
            <div
              style={{
                fontSize: 10.5,
                color: "var(--text-muted)",
                letterSpacing: "0.04em",
                fontStyle: "italic",
                marginLeft: 4,
              }}
            >
              {input.trim()
                ? "Escribiste algo — apretá ✨ para que se vuelque a la tabla."
                : "Escribí tu pedido arriba y elegí cómo querés que responda."}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ============================================================
// RowEditor — fila editable de la tabla con expand para detalles
// ============================================================
function RowEditor({
  post,
  code,
  netColor,
  overdue,
  isExpanded,
  onExpand,
  onPatch,
  onApprove,
  onUnapprove,
  onPublish,
  onDelete,
  isDirector,
  teamMembers,
}: {
  post: ContentPost;
  code: string;
  netColor: string;
  overdue: boolean;
  isExpanded: boolean;
  onExpand: () => void;
  onPatch: (patch: Partial<ContentPost>) => Promise<void>;
  onApprove: () => Promise<void>;
  onUnapprove: () => Promise<void>;
  onPublish: () => Promise<void>;
  onDelete: () => Promise<void>;
  isDirector: boolean;
  teamMembers: Profile[];
}) {
  // Buffers locales para evitar re-render por keystroke
  const [ideaDraft, setIdeaDraft] = useState(post.idea ?? "");
  const [copyDraft, setCopyDraft] = useState(post.copy ?? "");
  const [ctaDraft, setCtaDraft] = useState(post.cta ?? "");
  const [influencerDraft, setInfluencerDraft] = useState(post.influencer ?? "");
  const [briefDraft, setBriefDraft] = useState(post.brief ?? "");

  // Sync cuando cambia el post desde afuera
  useEffect(() => {
    setIdeaDraft(post.idea ?? "");
    setCopyDraft(post.copy ?? "");
    setCtaDraft(post.cta ?? "");
    setInfluencerDraft(post.influencer ?? "");
    setBriefDraft(post.brief ?? "");
  }, [post.id, post.idea, post.copy, post.cta, post.influencer, post.brief]);

  const assignedMember = teamMembers.find((t) => t.id === post.assignedTo);

  return (
    <>
      <tr
        style={{
          borderBottom: "1px solid rgba(10,26,12,0.05)",
          background: isExpanded ? "rgba(196,168,130,0.06)" : undefined,
          cursor: "pointer",
        }}
        onClick={onExpand}
      >
        <td style={{ ...tdStyle, fontFamily: "monospace", fontWeight: 600, whiteSpace: "nowrap" }}>
          {isExpanded ? "▼ " : "▶ "}
          {code}
        </td>
        <td style={tdStyle}>
          <span
            style={{
              display: "inline-block",
              padding: "3px 8px",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              background: netColor,
              color: "#fff",
              borderRadius: "var(--r-pill)",
            }}
          >
            {NETWORK_LABEL[post.network] ?? post.network}
          </span>
        </td>
        <td style={{ ...tdStyle, textTransform: "capitalize" }}>
          {FORMAT_LABEL[post.format] ?? post.format}
        </td>
        <td style={tdStyle}>
          {/* La idea es la única columna con texto largo — la dejamos
              wrap en 2 líneas para que no se corte el resto. */}
          <div
            style={{
              maxWidth: 420,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              lineHeight: 1.4,
              color: post.idea ? "var(--deep-green)" : "var(--text-muted)",
              fontStyle: post.idea ? "normal" : "italic",
            }}
          >
            {post.idea ?? post.brief?.split("\n")[0]?.slice(0, 100) ?? "(sin idea)"}
          </div>
        </td>
        <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
          <div style={{ fontWeight: 600 }}>{formatHumanDate(post.date)}</div>
          {post.time && (
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{post.time}</div>
          )}
        </td>
        <td style={tdStyle}>
          {assignedMember ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div
                style={{
                  width: 22,
                  height: 22,
                  background: "var(--sand)",
                  color: "var(--deep-green)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 9,
                  fontWeight: 700,
                  borderRadius: "50%",
                }}
              >
                {assignedMember.initials || assignedMember.name.slice(0, 2).toUpperCase()}
              </div>
              <span style={{ fontSize: 12 }}>{assignedMember.name.split(" ")[0]}</span>
            </div>
          ) : (
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>
              Sin asignar
            </span>
          )}
        </td>
        <td style={tdStyle}>
          <span
            style={{
              display: "inline-block",
              padding: "2px 8px",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              background:
                post.status === "scheduled"
                  ? "rgba(47,125,79,0.12)"
                  : post.status === "published"
                    ? "rgba(10,26,12,0.08)"
                    : "rgba(155,130,89,0.15)",
              color: STATUS_COLOR[post.status],
              borderRadius: "var(--r-pill)",
            }}
          >
            {STATUS_LABEL[post.status]}
          </span>
          {overdue && (
            <span
              style={{
                marginLeft: 4,
                fontSize: 9,
                fontWeight: 700,
                color: "#b04b3a",
                letterSpacing: "0.1em",
              }}
            >
              VENCIDA
            </span>
          )}
        </td>
        <td style={{ ...tdStyle, textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
          {isDirector && post.status === "draft" && (
            <button onClick={onApprove} style={btnApprove}>
              ✓ Aprobar
            </button>
          )}
          {isDirector && post.status === "scheduled" && (
            <button onClick={onUnapprove} style={btnGhost}>
              ↶ Desaprobar
            </button>
          )}
          {isDirector && post.status === "scheduled" && (
            <button onClick={onPublish} style={btnPublish}>
              📤 Marcar publicada
            </button>
          )}
          {isDirector && (
            <button onClick={onDelete} style={btnDelete}>
              ×
            </button>
          )}
        </td>
      </tr>

      {/* Detalle expandido — editable */}
      {isExpanded && (
        <tr style={{ background: "var(--off-white)" }}>
          <td colSpan={8} style={{ padding: "16px 20px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* Columna izquierda: idea + copy */}
              <div>
                <FieldLabel>Idea</FieldLabel>
                <textarea
                  value={ideaDraft}
                  onChange={(e) => setIdeaDraft(e.target.value)}
                  onBlur={() => {
                    if (ideaDraft !== (post.idea ?? "")) {
                      onPatch({ idea: ideaDraft || null });
                    }
                  }}
                  rows={2}
                  disabled={!isDirector}
                  style={editorStyle}
                  placeholder="Concepto creativo de la pieza"
                />

                <FieldLabel>Copy</FieldLabel>
                <textarea
                  value={copyDraft}
                  onChange={(e) => setCopyDraft(e.target.value)}
                  onBlur={() => {
                    if (copyDraft !== (post.copy ?? "")) {
                      onPatch({ copy: copyDraft || null });
                    }
                  }}
                  rows={5}
                  disabled={!isDirector}
                  style={editorStyle}
                  placeholder="Texto listo para publicar"
                />

                {post.format === "anuncio" && (
                  <>
                    <FieldLabel>CTA (Call to Action)</FieldLabel>
                    <input
                      value={ctaDraft}
                      onChange={(e) => setCtaDraft(e.target.value)}
                      onBlur={() => {
                        if (ctaDraft !== (post.cta ?? "")) {
                          onPatch({ cta: ctaDraft || null });
                        }
                      }}
                      disabled={!isDirector}
                      style={editorStyle}
                      placeholder='Ej: "Reservá tu lugar"'
                    />
                  </>
                )}
              </div>

              {/* Columna derecha: meta + brief */}
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <FieldLabel>Fecha de publicación</FieldLabel>
                    <input
                      type="date"
                      value={post.date}
                      onChange={(e) => onPatch({ date: e.target.value })}
                      disabled={!isDirector}
                      style={editorStyle}
                    />
                  </div>
                  <div>
                    <FieldLabel>Hora</FieldLabel>
                    <input
                      type="time"
                      value={post.time ?? ""}
                      onChange={(e) => onPatch({ time: e.target.value || null })}
                      disabled={!isDirector}
                      style={editorStyle}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <FieldLabel>Red social</FieldLabel>
                    <select
                      value={post.network}
                      onChange={(e) => onPatch({ network: e.target.value as ContentNetwork })}
                      disabled={!isDirector}
                      style={editorStyle}
                    >
                      {(Object.keys(NETWORK_LABEL) as ContentNetwork[]).map((n) => (
                        <option key={n} value={n}>
                          {NETWORK_LABEL[n]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <FieldLabel>Formato</FieldLabel>
                    <select
                      value={post.format}
                      onChange={(e) => onPatch({ format: e.target.value as ContentFormat })}
                      disabled={!isDirector}
                      style={editorStyle}
                    >
                      {(Object.keys(FORMAT_LABEL) as ContentFormat[]).map((f) => (
                        <option key={f} value={f}>
                          {FORMAT_LABEL[f]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <FieldLabel>Asignado a</FieldLabel>
                <select
                  value={post.assignedTo ?? ""}
                  onChange={(e) => onPatch({ assignedTo: e.target.value || null })}
                  disabled={!isDirector}
                  style={editorStyle}
                >
                  <option value="">— Sin asignar —</option>
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} · {m.role === "director" ? "Director" : "Equipo"}
                    </option>
                  ))}
                </select>

                {post.format === "ugc" && (
                  <>
                    <FieldLabel>Influencer asignado</FieldLabel>
                    <input
                      value={influencerDraft}
                      onChange={(e) => setInfluencerDraft(e.target.value)}
                      onBlur={() => {
                        if (influencerDraft !== (post.influencer ?? "")) {
                          onPatch({ influencer: influencerDraft || null });
                        }
                      }}
                      disabled={!isDirector}
                      style={editorStyle}
                      placeholder="Nombre del influencer"
                    />
                  </>
                )}

                <FieldLabel>Brief de producción</FieldLabel>
                <textarea
                  value={briefDraft}
                  onChange={(e) => setBriefDraft(e.target.value)}
                  onBlur={() => {
                    if (briefDraft !== (post.brief ?? "")) {
                      onPatch({ brief: briefDraft });
                    }
                  }}
                  rows={4}
                  disabled={!isDirector}
                  style={editorStyle}
                  placeholder="Shots, tono, formato visual, referencias"
                />
              </div>
            </div>

            <div
              style={{
                marginTop: 12,
                fontSize: 11,
                color: "var(--text-muted)",
                fontStyle: "italic",
              }}
            >
              Los cambios se guardan automáticamente al salir del campo.
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 14px",
  fontSize: 10,
  fontWeight: 600,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};
const tdStyle: React.CSSProperties = {
  padding: "12px 14px",
  fontSize: 13,
  color: "var(--deep-green)",
  verticalAlign: "middle",
  // Default nowrap — la única celda con texto largo (Idea) sobreescribe
  // con su propia regla de wrap controlado (line-clamp).
  whiteSpace: "nowrap",
};

const editorStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  fontSize: 12,
  border: "1px solid rgba(10,26,12,0.12)",
  borderRadius: "var(--r-sm)",
  fontFamily: "inherit",
  background: "var(--white)",
  color: "var(--deep-green)",
  marginBottom: 12,
  resize: "vertical",
};

const btnBase: React.CSSProperties = {
  padding: "5px 10px",
  fontSize: 11,
  cursor: "pointer",
  fontFamily: "inherit",
  borderRadius: 4,
  marginLeft: 4,
  fontWeight: 600,
};
const btnApprove: React.CSSProperties = {
  ...btnBase,
  background: "var(--deep-green)",
  color: "var(--off-white)",
  border: "none",
};
const btnPublish: React.CSSProperties = {
  ...btnBase,
  background: "transparent",
  border: "1px solid rgba(47,125,79,0.4)",
  color: "#2f7d4f",
};
const btnGhost: React.CSSProperties = {
  ...btnBase,
  background: "transparent",
  border: "1px solid rgba(10,26,12,0.15)",
  color: "var(--deep-green)",
};
const btnDelete: React.CSSProperties = {
  ...btnBase,
  background: "transparent",
  border: "1px solid rgba(176,75,58,0.2)",
  color: "#B91C1C",
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        fontWeight: 600,
        color: "var(--sand-dark)",
        marginBottom: 5,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Pill compacto horizontal: [LABEL · VALUE]. Pensado para una fila
 * sutil arriba de la tabla — la idea es que las KPIs no se roben el
 * espacio visual del listado de creativos.
 */
function CompactKpi({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        background: "var(--white)",
        border: "1px solid rgba(10,26,12,0.08)",
        borderRadius: 6,
      }}
    >
      <span
        style={{
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontSize: 9,
          fontWeight: 700,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontWeight: 700,
          color: color ?? "var(--deep-green)",
          fontSize: 14,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
    </div>
  );
}
