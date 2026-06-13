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

import {
  createContext,
  use,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  getClient,
  getContent,
  updateContent,
  deleteContent,
  addContent,
} from "@/lib/storage";
import { listProfiles } from "@/lib/team";
import { getSupabase } from "@/lib/supabase/client";
import { getCurrentProfile, type Profile } from "@/lib/supabase/auth";
import { uploadContentPreview } from "@/lib/upload";
import { NETWORK_COLORS } from "@/lib/content-frequency";
import type {
  Client,
  ClientContentClassification,
  ClientSocialLinks,
  ContentClassification,
  ContentFormat,
  ContentNetwork,
  ContentPost,
  ContentStatus,
} from "@/lib/types";
import {
  DEFAULT_CONTENT_CLASSIFICATIONS,
  classificationsFor,
  classificationMetaById,
  extractHandleFromUrl,
} from "@/lib/types";

/**
 * Context con el catálogo de clasificaciones editoriales del cliente
 * actual. Lo seteamos arriba (en ContenidoPage) y todos los
 * sub-componentes lo leen vía useClassifications(). Evita prop-drillear
 * la lista a cada FeedTile / RowEditor / PostDetailModal.
 *
 * Default = DEFAULTS para que cualquier consumidor que renderice
 * fuera del Provider no rompa.
 */
const ClassificationsContext = createContext<ClientContentClassification[]>(
  DEFAULT_CONTENT_CLASSIFICATIONS,
);
function useClassifications(): ClientContentClassification[] {
  return useContext(ClassificationsContext);
}
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

/** Formato del código visual: C-XXXX padded a 4 dígitos. */
function formatCode(n: number): string {
  return `C-${String(n).padStart(4, "0")}`;
}

/**
 * Devuelve el código visual de una pieza.
 *
 * Preferencia: `post.code` viene de DB (migración 050). El trigger en
 * Postgres asigna max(code)+1 por cliente al insertar y nunca lo
 * reusa cuando se borra una pieza → es 100% persistente.
 *
 * Fallback (post.code = null/undefined): para entornos donde la
 * migración todavía no corrió, derivamos por orden de creación dentro
 * del array recibido. NO es persistente — pero al menos la UI no
 * muestra "—".
 */
function codeOf(
  post: ContentPost,
  fallback: Map<string, string>,
): string {
  if (typeof post.code === "number") return formatCode(post.code);
  return fallback.get(post.id) ?? "—";
}

/**
 * Mapa fallback id → "C-XXXX" basado en orden de createdAt dentro del
 * array recibido. Solo se usa para posts que vinieron sin code (es
 * decir, antes de que la migración 050 corra en la DB).
 */
function buildCodeFallbackMap(posts: ContentPost[]): Map<string, string> {
  const ordered = [...posts].sort((a, b) =>
    (a.createdAt ?? "").localeCompare(b.createdAt ?? ""),
  );
  const m = new Map<string, string>();
  ordered.forEach((p, i) => m.set(p.id, formatCode(i + 1)));
  return m;
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
 * Versión cortita de la fecha para chips/pills donde no entra el año
 * y el mes va abreviado. Ej: "12 jun". Si el año NO es el actual,
 * agregamos el year corto al final ("12 jun '25").
 */
function formatShortDate(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7)) - 1;
  const d = Number(iso.slice(8, 10));
  if (Number.isNaN(m) || Number.isNaN(d)) return iso;
  const mLabel = (MONTHS_ES[m] ?? "?").slice(0, 3).toLowerCase();
  const now = new Date().getFullYear();
  return y === now ? `${d} ${mLabel}` : `${d} ${mLabel} '${String(y).slice(-2)}`;
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
 * Genera y descarga un archivo .xlsx (Excel nativo) con los contenidos
 * filtrados. Usamos SheetJS (xlsx package, ~600KB lazy-loaded) para
 * producir un workbook real que Excel abre sin advertencias y con
 * los anchos de columna ajustados.
 *
 * El bundle de xlsx se importa dinámicamente para no inflar el bundle
 * inicial de la página — solo se carga cuando el director clickea
 * Descargar Excel.
 */
async function downloadContenidoCSV(
  posts: ContentPost[],
  clientName: string,
  teamMembers: Profile[],
  codeFallback: Map<string, string>,
): Promise<void> {
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
  const rows = posts.map((p) => [
    codeOf(p, codeFallback),
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
  ]);

  // Lazy-load del paquete xlsx — pesa pero solo se carga cuando se
  // descarga (no en cada visita a la página).
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);

  // Anchos aproximados por columna — Excel los respeta al abrir.
  ws["!cols"] = [
    { wch: 10 }, // Código
    { wch: 12 }, // Fecha
    { wch: 6 },  // Hora
    { wch: 12 }, // Red
    { wch: 10 }, // Formato
    { wch: 40 }, // Idea
    { wch: 50 }, // Copy
    { wch: 18 }, // CTA
    { wch: 15 }, // Influencer
    { wch: 18 }, // Asignado a
    { wch: 12 }, // Estado
    { wch: 50 }, // Brief
  ];

  // Wrap text en las columnas con texto largo + freeze de la
  // primera fila para que el header quede pegado al hacer scroll.
  ws["!freeze"] = { xSplit: 0, ySplit: 1 } as unknown as undefined;

  const wb = XLSX.utils.book_new();
  // El nombre de hoja en Excel no puede tener: \/:?*[]
  const sheetName = "Contenido";
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const safeName = clientName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `contenido-${safeName}-${today}.xlsx`);
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

  // Filtros por columna — combinan con el chip de estado + período.
  // "all" / "" significa sin filtro.
  const [colNetwork, setColNetwork] = useState<ContentNetwork | "all">("all");
  const [colFormat, setColFormat] = useState<ContentFormat | "all">("all");
  const [colAssignedTo, setColAssignedTo] = useState<string>("all");
  const [colCodeQuery, setColCodeQuery] = useState<string>("");
  const [colIdeaQuery, setColIdeaQuery] = useState<string>("");
  /**
   * Filtro por clasificación editorial. "all" muestra todas las piezas;
   * "_unclassified" muestra solo las que no tienen clasificación todavía;
   * o un valor concreto (valor/conversion/aspiracional) para filtrar.
   */
  const [colClassification, setColClassification] = useState<
    ContentClassification | "all" | "_unclassified"
  >("all");
  /**
   * Modo de vista: tabla (default, layout actual) o feed (preview de
   * la red social como una grilla 3-col estilo perfil). El selector
   * de red dentro de "feed" vive en feedNetwork.
   */
  const [viewMode, setViewMode] = useState<"table" | "feed">("table");
  const [feedNetwork, setFeedNetwork] = useState<ContentNetwork>("ig");
  /**
   * Tamaño del feed: compacto (max ~440px, mejor para escanear) o
   * regular (max ~720px, default — match razonable con un perfil real).
   * Persistido solo en memoria — al recargar vuelve a "regular".
   */
  const [feedSize, setFeedSize] = useState<"compact" | "regular">("regular");
  /**
   * Cuando el usuario toca un tile de la grilla en modo feed, abrimos
   * un modal con el detalle de esa pieza. null = ningún tile abierto.
   */
  const [feedPostDetail, setFeedPostDetail] = useState<ContentPost | null>(null);
  // Modal de "nueva idea manual"
  const [showNewIdea, setShowNewIdea] = useState(false);
  const [savingNewIdea, setSavingNewIdea] = useState(false);
  // Multi-select para acciones en bloque sobre la tabla. Set<post.id>.
  // El bar de acciones bulk solo aparece cuando hay al menos 1 elegido.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  // Fallback id → "C-XXXX" para posts sin `code` en DB (entornos donde
  // la migración 050 todavía no corrió). El path normal usa
  // post.code directamente.
  const codeFallback = useMemo(
    () => buildCodeFallbackMap(posts),
    [posts],
  );

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
    // Filtros por columna — todos combinables.
    const codeQ = colCodeQuery.trim().toLowerCase();
    const ideaQ = colIdeaQuery.trim().toLowerCase();
    const filtered = posts
      .filter((p) => filter === "all" || p.status === filter)
      .filter((p) => inPeriod(p.date))
      // Multi-red: el post matchea si la red filtrada está en su array
      // de networks. Si el array está vacío (legacy o pre-mig 065),
      // usamos el campo singular `network` como fallback.
      .filter(
        (p) =>
          colNetwork === "all" ||
          (p.networks && p.networks.length > 0
            ? p.networks.includes(colNetwork)
            : p.network === colNetwork),
      )
      .filter((p) => colFormat === "all" || p.format === colFormat)
      .filter(
        (p) =>
          colAssignedTo === "all" ||
          (colAssignedTo === "_unassigned"
            ? !p.assignedTo
            : p.assignedTo === colAssignedTo),
      )
      .filter((p) => {
        if (!codeQ) return true;
        const visibleCode = codeOf(p, codeFallback).toLowerCase();
        return visibleCode.includes(codeQ);
      })
      .filter((p) => {
        if (!ideaQ) return true;
        return (p.idea ?? "").toLowerCase().includes(ideaQ) ||
          (p.copy ?? "").toLowerCase().includes(ideaQ) ||
          (p.brief ?? "").toLowerCase().includes(ideaQ);
      })
      // Clasificación editorial: si está "all" no filtramos; si está
      // "_unclassified" mostramos solo las que no tienen; y si está
      // un valor concreto filtramos por igualdad.
      .filter((p) => {
        if (colClassification === "all") return true;
        if (colClassification === "_unclassified") return !p.classification;
        return p.classification === colClassification;
      });
    return [...filtered].sort((a, b) => {
      const aOverdue = a.status !== "published" && a.date < today;
      const bOverdue = b.status !== "published" && b.date < today;
      if (aOverdue && !bOverdue) return -1;
      if (bOverdue && !aOverdue) return 1;
      return a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "");
    });
  }, [
    posts,
    filter,
    periodMode,
    customFrom,
    customTo,
    colNetwork,
    colFormat,
    colAssignedTo,
    colCodeQuery,
    colIdeaQuery,
    colClassification,
    codeFallback,
  ]);

  const stats = {
    total: posts.length,
    draft: posts.filter((p) => p.status === "draft").length,
    scheduled: posts.filter((p) => p.status === "scheduled").length,
    published: posts.filter((p) => p.status === "published").length,
  };

  // ============ Mutations ============
  async function patchPost(post: ContentPost, patch: Partial<ContentPost>) {
    try {
      await updateContent(post.id, {
        date: patch.date,
        time: patch.time === undefined ? undefined : patch.time,
        network: patch.network,
        networks: patch.networks,
        format: patch.format,
        brief: patch.brief,
        idea: patch.idea,
        copy: patch.copy,
        cta: patch.cta,
        influencer: patch.influencer,
        assignedTo: patch.assignedTo,
        classification: patch.classification,
        imageUrl: patch.imageUrl,
        status: patch.status,
      });
      refresh();
    } catch (e) {
      // Antes los errores de DB caían silenciosos — el usuario veía la
      // UI optimista (chip activo) pero el cambio no se persistía. Ahora
      // surfaceamos el error con un alert para que se note si falta una
      // migración (ej. networks[] o image_url no existen en la columna).
      const msg = (e as Error).message;
      const hint = msg.toLowerCase().includes("networks")
        ? "\n\nProbablemente falta correr la migración 065 (columna networks[]). Pegá el SQL en Supabase."
        : msg.toLowerCase().includes("image_url")
          ? "\n\nProbablemente falta correr la migración 064 (columna image_url)."
          : msg.toLowerCase().includes("classification")
            ? "\n\nProbablemente falta correr la migración 063 + 066 (clasificaciones)."
            : "";
      alert(`No se pudo guardar el cambio:\n${msg}${hint}`);
    }
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
      // Leer como texto primero — si la función falla en Vercel (timeout,
      // memory, crash), devuelve HTML/texto en vez de JSON y el .json()
      // tira "Unexpected token A...".  Atajamos eso acá.
      const rawText = await res.text();
      let data: {
        error?: string;
        detail?: string;
        reply?: string;
        proposed?: unknown;
      };
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        // No fue JSON — armamos un error humano según el status.
        const status = res.status;
        if (status === 504 || status === 408) {
          throw new Error(
            "El asistente tardó demasiado y se cortó. Probá pedir menos piezas a la vez (ej 20-30) o pediendo solo un mes a la vez.",
          );
        }
        if (status >= 500) {
          throw new Error(
            `Error del servidor (${status}). Probá de nuevo en un minuto o partí el pedido en batches más chicos.\n\nDetalle: ${rawText.slice(0, 200)}…`,
          );
        }
        throw new Error(
          `Respuesta inesperada (${status}): ${rawText.slice(0, 200)}…`,
        );
      }
      if (!res.ok) {
        throw new Error([data?.error, data?.detail].filter(Boolean).join(" — "));
      }

      const reply = data.reply ?? "";
      if (mode === "propose") {
        // Path preferido (nuevo): el backend devuelve `proposed` ya
        // parseado desde el tool_use de Anthropic.
        let parsed: unknown = data.proposed ?? null;
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

  // Catálogo efectivo de clasificaciones del cliente actual. Si no
  // está cargado o el cliente no tiene catálogo custom, devuelve los
  // DEFAULTS. Lo memoizamos para no recrear identidad de array por
  // render (no rompe Provider, pero evita re-renders en cascada).
  const classifications = useMemo(
    () => classificationsFor(client),
    [client],
  );

  return (
    <ClassificationsContext.Provider value={classifications}>
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

      {/* Toggle de modo de vista: Tabla (default, todas las redes, con
          filtros y acciones) o Vista feed (preview tipo perfil de IG,
          una red por vez, grilla 3-col). El toggle vive arriba de los
          KPIs para que sea lo primero que ve el usuario. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 0,
          marginBottom: 14,
          background: "var(--off-white)",
          padding: 4,
          borderRadius: 8,
          width: "fit-content",
          border: "1px solid rgba(10,26,12,0.08)",
        }}
      >
        {(["table", "feed"] as const).map((mode) => {
          const active = viewMode === mode;
          const label =
            mode === "table" ? "▤ Tabla" : "▦ Vista feed";
          return (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              style={{
                padding: "8px 16px",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.04em",
                background: active ? "var(--white)" : "transparent",
                color: active ? "var(--deep-green)" : "var(--text-muted)",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontFamily: "inherit",
                boxShadow: active ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                transition: "all 0.12s",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* KPIs compactos sacados — los conteos ya viven en los chips
          de filtro de la fila siguiente ("Todas · 75 | Borradores · 75
          | Aprobadas · 0 | Publicadas · 0"), eran redundantes. */}

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
        {isDirector && (
          <button
            onClick={() => setShowNewIdea(true)}
            style={{
              padding: "5px 12px",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              background: "var(--deep-green)",
              color: "var(--off-white)",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
              borderRadius: 4,
            }}
            title="Agregar una idea manualmente sin pasar por el asistente"
          >
            + Nueva idea
          </button>
        )}
        <button
          onClick={() =>
            downloadContenidoCSV(
              sortedFiltered,
              client?.name ?? "cliente",
              teamMembers,
              codeFallback,
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
          title="Descarga un archivo .xlsx que se abre directo en Excel / Numbers / Sheets"
        >
          ⬇ Descargar Excel
        </button>
      </div>

      {/* BARRA DE ACCIONES BULK — solo aparece cuando hay items
          seleccionados en la tabla. Permite eliminar, aprobar,
          desaprobar o marcar publicada masivamente. Director only. */}
      {isDirector && viewMode === "table" && selectedIds.size > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 16px",
            background: "var(--deep-green)",
            color: "var(--off-white)",
            borderRadius: "var(--r-sm)",
            marginBottom: 14,
            flexWrap: "wrap",
            position: "sticky",
            top: 0,
            zIndex: 10,
            boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700 }}>
            {selectedIds.size}{" "}
            {selectedIds.size === 1
              ? "pieza seleccionada"
              : "piezas seleccionadas"}
          </span>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            style={{
              padding: "4px 10px",
              fontSize: 11,
              fontWeight: 600,
              background: "transparent",
              color: "rgba(255,255,255,0.7)",
              border: "1px solid rgba(255,255,255,0.25)",
              borderRadius: 4,
              cursor: "pointer",
              fontFamily: "inherit",
              letterSpacing: "0.04em",
            }}
          >
            Limpiar
          </button>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            disabled={bulkBusy}
            onClick={async () => {
              if (bulkBusy) return;
              setBulkBusy(true);
              try {
                const ids = [...selectedIds];
                await Promise.all(
                  ids.map((id) =>
                    updateContent(id, { status: "scheduled" }),
                  ),
                );
                setSelectedIds(new Set());
                refresh();
              } catch (e) {
                alert(`No se pudo aprobar:\n${(e as Error).message}`);
              } finally {
                setBulkBusy(false);
              }
            }}
            style={bulkBtn}
          >
            ✓ Aprobar
          </button>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={async () => {
              if (bulkBusy) return;
              setBulkBusy(true);
              try {
                const ids = [...selectedIds];
                await Promise.all(
                  ids.map((id) => updateContent(id, { status: "draft" })),
                );
                setSelectedIds(new Set());
                refresh();
              } catch (e) {
                alert(`No se pudo desaprobar:\n${(e as Error).message}`);
              } finally {
                setBulkBusy(false);
              }
            }}
            style={bulkBtn}
          >
            ↶ Desaprobar
          </button>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={async () => {
              if (bulkBusy) return;
              setBulkBusy(true);
              try {
                const ids = [...selectedIds];
                await Promise.all(
                  ids.map((id) =>
                    updateContent(id, { status: "published" }),
                  ),
                );
                setSelectedIds(new Set());
                refresh();
              } catch (e) {
                alert(`No se pudo marcar publicadas:\n${(e as Error).message}`);
              } finally {
                setBulkBusy(false);
              }
            }}
            style={bulkBtn}
          >
            📤 Publicadas
          </button>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={async () => {
              if (bulkBusy) return;
              if (
                !confirm(
                  `¿Eliminar ${selectedIds.size} pieza${selectedIds.size === 1 ? "" : "s"}? No se puede deshacer.`,
                )
              )
                return;
              setBulkBusy(true);
              try {
                const ids = [...selectedIds];
                await Promise.all(ids.map((id) => deleteContent(id)));
                setSelectedIds(new Set());
                refresh();
              } catch (e) {
                alert(`No se pudieron borrar:\n${(e as Error).message}`);
              } finally {
                setBulkBusy(false);
              }
            }}
            style={{
              ...bulkBtn,
              background: "var(--red-warn)",
              border: "1px solid var(--red-warn)",
            }}
          >
            🗑 Eliminar
          </button>
        </div>
      )}

      {/* TABLA de ideas — solo visible en modo "table". El modo "feed"
          renderiza el preview IG/FB en su propio bloque más abajo. */}
      {viewMode === "table" && (
      <div className={ui.panel} style={{ marginBottom: 24, padding: 0, overflow: "hidden" }}>
        {posts.length === 0 ? (
          // Sin posts cargados en absoluto — la fila de filtros no
          // tiene sentido todavía. Mensaje único.
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
          // Hay posts: SIEMPRE renderizamos la tabla con headers +
          // fila de filtros. Si los filtros excluyeron todo, el tbody
          // muestra un empty state dedicado con botón "Limpiar
          // filtros" — antes se ocultaba todo y el usuario no podía
          // deshacer el filtro.
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--off-white)", borderBottom: "1px solid rgba(10,26,12,0.1)" }}>
                  {/* Master checkbox: marca/desmarca TODAS las filas filtradas
                      actualmente visibles. El estado indeterminado (-)
                      aparece cuando hay algunas seleccionadas pero no
                      todas. Solo para director — el team no edita ni borra. */}
                  <th style={{ ...thStyle, width: 36, paddingLeft: 14 }}>
                    {isDirector && sortedFiltered.length > 0 && (() => {
                      const visibleIds = sortedFiltered.map((p) => p.id);
                      const allSelected = visibleIds.every((id) =>
                        selectedIds.has(id),
                      );
                      const someSelected = visibleIds.some((id) =>
                        selectedIds.has(id),
                      );
                      return (
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={(el) => {
                            if (el)
                              el.indeterminate =
                                !allSelected && someSelected;
                          }}
                          onChange={(e) => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) {
                                for (const id of visibleIds) next.add(id);
                              } else {
                                for (const id of visibleIds) next.delete(id);
                              }
                              return next;
                            });
                          }}
                          style={{ cursor: "pointer" }}
                          title={
                            allSelected
                              ? "Deseleccionar todo"
                              : "Seleccionar todo lo visible"
                          }
                        />
                      );
                    })()}
                  </th>
                  <th style={thStyle}>Código</th>
                  <th style={thStyle}>Red</th>
                  <th style={thStyle}>Formato</th>
                  <th style={thStyle}>Clase</th>
                  <th style={{ ...thStyle, minWidth: 260 }}>Idea</th>
                  <th style={thStyle}>Fecha</th>
                  <th style={thStyle}>Asignado a</th>
                  <th style={thStyle}>Estado</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Acciones</th>
                </tr>
                {/* Fila de filtros por columna — combinables con el chip de estado y el período */}
                <tr style={{ background: "var(--white)", borderBottom: "1px solid rgba(10,26,12,0.08)" }}>
                  {/* Celda vacía debajo del master checkbox para
                      mantener el alineado de columnas. */}
                  <th style={thFilterCell} />
                  <th style={thFilterCell}>
                    <input
                      type="text"
                      value={colCodeQuery}
                      onChange={(e) => setColCodeQuery(e.target.value)}
                      placeholder="Buscar…"
                      style={filterInputStyle}
                    />
                  </th>
                  <th style={thFilterCell}>
                    <select
                      value={colNetwork}
                      onChange={(e) =>
                        setColNetwork(e.target.value as ContentNetwork | "all")
                      }
                      style={filterInputStyle}
                    >
                      <option value="all">Todas</option>
                      {(Object.keys(NETWORK_LABEL) as ContentNetwork[]).map((n) => (
                        <option key={n} value={n}>
                          {NETWORK_LABEL[n]}
                        </option>
                      ))}
                    </select>
                  </th>
                  <th style={thFilterCell}>
                    <select
                      value={colFormat}
                      onChange={(e) =>
                        setColFormat(e.target.value as ContentFormat | "all")
                      }
                      style={filterInputStyle}
                    >
                      <option value="all">Todos</option>
                      {(Object.keys(FORMAT_LABEL) as ContentFormat[]).map((f) => (
                        <option key={f} value={f}>
                          {FORMAT_LABEL[f]}
                        </option>
                      ))}
                    </select>
                  </th>
                  <th style={thFilterCell}>
                    <select
                      value={colClassification}
                      onChange={(e) =>
                        setColClassification(
                          e.target.value as
                            | ContentClassification
                            | "all"
                            | "_unclassified",
                        )
                      }
                      style={filterInputStyle}
                    >
                      <option value="all">Todas</option>
                      <option value="_unclassified">Sin clasificar</option>
                      {classifications.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </th>
                  <th style={thFilterCell}>
                    <input
                      type="text"
                      value={colIdeaQuery}
                      onChange={(e) => setColIdeaQuery(e.target.value)}
                      placeholder="Buscar en idea/copy/brief…"
                      style={filterInputStyle}
                    />
                  </th>
                  <th style={thFilterCell}>{/* Fecha — filtro vive arriba (período) */}</th>
                  <th style={thFilterCell}>
                    <select
                      value={colAssignedTo}
                      onChange={(e) => setColAssignedTo(e.target.value)}
                      style={filterInputStyle}
                    >
                      <option value="all">Todos</option>
                      <option value="_unassigned">Sin asignar</option>
                      {teamMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </th>
                  <th style={thFilterCell}>{/* Estado — chips arriba */}</th>
                  <th style={{ ...thFilterCell, textAlign: "right" }}>
                    {(colNetwork !== "all" ||
                      colFormat !== "all" ||
                      colClassification !== "all" ||
                      colAssignedTo !== "all" ||
                      colCodeQuery ||
                      colIdeaQuery) && (
                      <button
                        type="button"
                        onClick={() => {
                          setColNetwork("all");
                          setColFormat("all");
                          setColClassification("all");
                          setColAssignedTo("all");
                          setColCodeQuery("");
                          setColIdeaQuery("");
                        }}
                        style={{
                          padding: "3px 8px",
                          fontSize: 10,
                          fontWeight: 600,
                          background: "transparent",
                          border: "1px solid rgba(10,26,12,0.15)",
                          color: "var(--text-muted)",
                          borderRadius: 4,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          letterSpacing: "0.04em",
                        }}
                        title="Limpiar filtros de columna"
                      >
                        ✕ limpiar
                      </button>
                    )}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedFiltered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
                      style={{
                        padding: "32px 20px",
                        textAlign: "center",
                        color: "var(--text-muted)",
                        fontSize: 13,
                      }}
                    >
                      <div style={{ fontStyle: "italic", marginBottom: 12 }}>
                        Ningún contenido coincide con estos filtros.
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setFilter("all");
                          setPeriodMode("all");
                          setCustomFrom("");
                          setCustomTo("");
                          setColNetwork("all");
                          setColFormat("all");
                          setColAssignedTo("all");
                          setColCodeQuery("");
                          setColIdeaQuery("");
                        }}
                        style={{
                          padding: "6px 14px",
                          fontSize: 11,
                          fontWeight: 600,
                          background: "var(--deep-green)",
                          color: "var(--off-white)",
                          border: "none",
                          borderRadius: 4,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                        }}
                      >
                        ✕ Limpiar todos los filtros
                      </button>
                    </td>
                  </tr>
                ) : (
                  sortedFiltered.map((p) => {
                    const today = new Date().toISOString().slice(0, 10);
                    const overdue = p.status !== "published" && p.date < today;
                    const isExpanded = expandedId === p.id;
                    const netColor =
                      (NETWORK_COLORS as Record<string, { solid: string }>)[p.network]?.solid ?? "#0A1A0C";
                    return (
                      <RowEditor
                        key={p.id}
                        post={p}
                        code={codeOf(p, codeFallback)}
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
                        selected={selectedIds.has(p.id)}
                        onToggleSelect={() =>
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(p.id)) next.delete(p.id);
                            else next.add(p.id);
                            return next;
                          })
                        }
                      />
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* ============== VISTA FEED (preview tipo perfil IG) ============
          Cuando viewMode === "feed", renderizamos una grilla 3-col que
          imita el perfil de la red elegida (por ahora IG; FB usa el
          mismo layout). Cada tile es 1:1 con el snippet del brief,
          formato + clasificación. Click en tile → modal con detalle. */}
      {viewMode === "feed" && (
        <FeedPreview
          posts={sortedFiltered}
          network={feedNetwork}
          onNetworkChange={setFeedNetwork}
          size={feedSize}
          onSizeChange={setFeedSize}
          clientName={client?.name ?? ""}
          clientLogoUrl={client?.logo_url ?? null}
          socialLinks={client?.social_links ?? null}
          /* socialProfiles ya no se usa — el feed no muestra bio/seguidores. */
          codeFallback={codeFallback}
          onTileClick={(p) => setFeedPostDetail(p)}
        />
      )}

      {/* Modal con detalle del post cuando se toca un tile del feed. */}
      {feedPostDetail && (
        <FeedPostDetailModal
          post={feedPostDetail}
          code={codeOf(feedPostDetail, codeFallback)}
          onClose={() => setFeedPostDetail(null)}
        />
      )}

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
                ? 'Ej: "Armame 12 piezas para junio enfocadas en lanzamiento" · "8 anuncios para promo de invierno con CTA" · (máx ~40 piezas por batch — partilo por mes si es más)'
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

      {/* ============== MODAL NUEVA IDEA MANUAL ============== */}
      {showNewIdea && (
        <NewIdeaModal
          saving={savingNewIdea}
          onCancel={() => setShowNewIdea(false)}
          onSubmit={async (draft) => {
            setSavingNewIdea(true);
            try {
              // UNA SOLA pieza con N redes (multi-red). Antes creábamos
              // N posts con códigos C-XXXX distintos; ahora una idea =
              // un código, y `networks` lleva todas las redes donde
              // se publica. La columna singular `network` se mantiene
              // sincronizada con el primer item del array para
              // back-compat con consumidores legacy.
              const primary = draft.networks[0];
              await addContent({
                clientId: id,
                date: draft.date,
                time: draft.time || null,
                network: primary,
                networks: draft.networks,
                format: draft.format,
                brief: draft.brief,
                idea: draft.idea || null,
                copy: draft.copy || null,
                cta: draft.cta || null,
                influencer: null,
                assignedTo: null,
                classification: draft.classification,
                status: "draft",
                source: "manual",
              });
              setShowNewIdea(false);
              refresh();
            } catch (err) {
              alert(
                "No se pudo guardar la idea:\n" + (err as Error).message,
              );
            } finally {
              setSavingNewIdea(false);
            }
          }}
        />
      )}
    </ClassificationsContext.Provider>
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
  selected,
  onToggleSelect,
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
  /** Si el post está incluido en la selección bulk actual. */
  selected: boolean;
  /** Toggle del checkbox de selección. Solo se renderea para director. */
  onToggleSelect: () => void;
}) {
  // Catálogo de clasificaciones del cliente actual — leemos del
  // ClassificationsContext seteado por ContenidoPage.
  const classifications = useClassifications();
  const classMeta = classificationMetaById(classifications, post.classification);
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
          background: selected
            ? "rgba(47,125,79,0.06)"
            : isExpanded
              ? "rgba(196,168,130,0.06)"
              : undefined,
          cursor: "pointer",
        }}
        onClick={onExpand}
      >
        {/* Checkbox de selección. Solo el director puede usarlo. Click
            sobre el checkbox NO debe disparar onExpand (toggle visual). */}
        <td
          style={{ ...tdStyle, width: 36, paddingLeft: 14 }}
          onClick={(e) => e.stopPropagation()}
        >
          {isDirector && (
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              style={{ cursor: "pointer" }}
              title={selected ? "Quitar de la selección" : "Agregar a la selección"}
            />
          )}
        </td>
        <td style={{ ...tdStyle, fontFamily: "monospace", fontWeight: 600, whiteSpace: "nowrap" }}>
          {isExpanded ? "▼ " : "▶ "}
          {code}
        </td>
        <td style={tdStyle}>
          {/* Multi-red: mostramos un chip por cada red en la que se
              publica la pieza. Si una sola red, queda como antes. */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {(post.networks && post.networks.length > 0
              ? post.networks
              : [post.network]
            ).map((n) => (
              <span
                key={n}
                style={{
                  display: "inline-block",
                  padding: "3px 8px",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  background: NETWORK_COLORS[n]?.solid ?? netColor,
                  color: "#fff",
                  borderRadius: "var(--r-pill)",
                }}
              >
                {NETWORK_LABEL[n] ?? n}
              </span>
            ))}
          </div>
        </td>
        <td style={{ ...tdStyle, textTransform: "capitalize" }}>
          {FORMAT_LABEL[post.format] ?? post.format}
        </td>
        <td style={tdStyle}>
          {/* Chip de clasificación editorial. Si no hay, mostramos un
              guión en gris claro para que la columna no quede vacía
              y se mantenga la alineación. */}
          {classMeta ? (
            <span
              title={classMeta.label}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 22,
                height: 22,
                fontSize: 11,
                fontWeight: 800,
                background: classMeta.color,
                color: "var(--off-white)",
                borderRadius: "50%",
                letterSpacing: 0,
              }}
            >
              {classMeta.short}
            </span>
          ) : (
            <span style={{ color: "var(--text-muted)", fontSize: 14 }}>—</span>
          )}
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
          <td colSpan={10} style={{ padding: "16px 20px" }}>
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

                {/* Redes — multi-select de pills. Una idea = una pieza,
                    pero puede vivir en N redes a la vez (mismo C-XXXX).
                    Re-tocar una activa la apaga; al apagar la última,
                    la mantenemos seleccionada para no quedar en vacío. */}
                <FieldLabel>Redes (multi-select)</FieldLabel>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    marginBottom: 10,
                  }}
                >
                  {(Object.keys(NETWORK_LABEL) as ContentNetwork[]).map((n) => {
                    const current =
                      post.networks && post.networks.length > 0
                        ? post.networks
                        : [post.network];
                    const checked = current.includes(n);
                    return (
                      <button
                        type="button"
                        key={n}
                        disabled={!isDirector}
                        onClick={() => {
                          if (!isDirector) return;
                          let next: ContentNetwork[];
                          if (checked) {
                            next = current.filter((x) => x !== n);
                            // No dejamos quedar en vacío: si era la
                            // única seleccionada, ignoramos el click.
                            if (next.length === 0) return;
                          } else {
                            next = [...current, n];
                          }
                          onPatch({ networks: next });
                        }}
                        style={{
                          padding: "6px 12px",
                          fontSize: 11,
                          fontWeight: 600,
                          letterSpacing: "0.04em",
                          background: checked
                            ? (NETWORK_COLORS[n]?.solid ?? "var(--deep-green)")
                            : "var(--white)",
                          color: checked
                            ? "var(--off-white)"
                            : "var(--deep-green)",
                          border: `1px solid ${
                            checked
                              ? NETWORK_COLORS[n]?.solid ?? "var(--deep-green)"
                              : "rgba(10,26,12,0.15)"
                          }`,
                          borderRadius: 6,
                          cursor: isDirector ? "pointer" : "default",
                          fontFamily: "inherit",
                          opacity: isDirector ? 1 : 0.6,
                        }}
                      >
                        {checked && "✓ "}
                        {NETWORK_LABEL[n]}
                      </button>
                    );
                  })}
                </div>
                <div>
                  <FieldLabel>Formato</FieldLabel>
                  <select
                    value={post.format}
                    onChange={(e) =>
                      onPatch({ format: e.target.value as ContentFormat })
                    }
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

                <FieldLabel>Clasificación editorial</FieldLabel>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {classifications.map((c) => {
                    const meta = classificationMetaById(classifications, c.id)!;
                    const checked = post.classification === c.id;
                    return (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() =>
                          isDirector &&
                          onPatch({
                            classification: checked ? null : c.id,
                          })
                        }
                        disabled={!isDirector}
                        style={{
                          padding: "5px 11px",
                          fontSize: 11,
                          fontWeight: 600,
                          background: checked ? meta.color : meta.bg,
                          color: checked ? "var(--off-white)" : meta.color,
                          border: `1px solid ${meta.color}`,
                          borderRadius: 999,
                          cursor: isDirector ? "pointer" : "default",
                          fontFamily: "inherit",
                          opacity: isDirector ? 1 : 0.6,
                          transition: "all 0.15s",
                        }}
                      >
                        {checked && "✓ "}
                        {meta.label}
                      </button>
                    );
                  })}
                  {classifications.length === 0 && (
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--text-muted)",
                        fontStyle: "italic",
                      }}
                    >
                      No hay clasificaciones cargadas. Configurálas en
                      /configuracion del cliente.
                    </span>
                  )}
                </div>

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

                {/* Imagen de preview — opcional. Subila para ver cómo
                    queda en la grilla del feed (vista perfil). No
                    reemplaza el creative final, solo es preview. */}
                <FieldLabel>Imagen de preview</FieldLabel>
                <PostImageEditor
                  post={post}
                  isDirector={isDirector}
                  onSaved={(url) => onPatch({ imageUrl: url })}
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

// ============================================================
// PostImageEditor — preview + upload de la imagen del post.
// Sube al bucket client-onboarding en folder content-posts/<clientId>/.
// Si ya hay imagen muestra el preview con botones Reemplazar / Quitar;
// si no, muestra un input de archivo grande.
// ============================================================
function PostImageEditor({
  post,
  isDirector,
  onSaved,
}: {
  post: ContentPost;
  isDirector: boolean;
  onSaved: (url: string | null) => Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");

  async function handleFile(file: File) {
    if (!isDirector) return;
    setUploading(true);
    setErr("");
    try {
      // Bucket público "content-post-previews" — URL cargable directo
      // en <img src> sin auth. Antes usábamos el bucket privado y la
      // imagen no aparecía en el feed (403). Ver migración 069.
      const uploaded = await uploadContentPreview(file, post.clientId);
      if (!uploaded.url) {
        throw new Error("El upload no devolvió una URL pública.");
      }
      await onSaved(uploaded.url);
    } catch (e) {
      const msg = (e as Error).message;
      setErr(
        msg.includes("Bucket not found")
          ? "El bucket de previews no existe todavía. Corré la migración 069 en Supabase."
          : msg,
      );
    } finally {
      setUploading(false);
    }
  }

  async function clearImage() {
    if (!isDirector) return;
    if (!confirm("¿Quitar la imagen del preview?")) return;
    setUploading(true);
    setErr("");
    try {
      await onSaved(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {post.imageUrl ? (
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
            padding: 10,
            background: "var(--white)",
            border: "1px solid rgba(10,26,12,0.1)",
            borderRadius: "var(--r-sm)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.imageUrl}
            alt="Preview"
            style={{
              width: 90,
              height: 90,
              objectFit: "cover",
              borderRadius: 4,
              background: "var(--off-white)",
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                marginBottom: 8,
                lineHeight: 1.4,
              }}
            >
              Imagen subida. Aparece como fondo del tile en la vista feed
              y en el modal de detalle.
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <label
                style={{
                  padding: "5px 10px",
                  fontSize: 11,
                  fontWeight: 600,
                  background: "var(--deep-green)",
                  color: "var(--off-white)",
                  borderRadius: 4,
                  cursor: isDirector && !uploading ? "pointer" : "default",
                  fontFamily: "inherit",
                  opacity: isDirector && !uploading ? 1 : 0.5,
                  display: "inline-block",
                }}
              >
                {uploading ? "Subiendo…" : "↻ Reemplazar"}
                <input
                  type="file"
                  accept="image/*"
                  disabled={!isDirector || uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                    e.target.value = "";
                  }}
                  style={{ display: "none" }}
                />
              </label>
              <button
                type="button"
                onClick={clearImage}
                disabled={!isDirector || uploading}
                style={{
                  padding: "5px 10px",
                  fontSize: 11,
                  fontWeight: 600,
                  background: "transparent",
                  color: "var(--red-warn)",
                  border: "1px solid var(--red-warn)",
                  borderRadius: 4,
                  cursor: isDirector && !uploading ? "pointer" : "default",
                  fontFamily: "inherit",
                  opacity: isDirector && !uploading ? 1 : 0.5,
                }}
              >
                Quitar
              </button>
            </div>
          </div>
        </div>
      ) : (
        <label
          style={{
            padding: "16px 12px",
            border: "1px dashed rgba(10,26,12,0.2)",
            borderRadius: "var(--r-sm)",
            background: "var(--white)",
            cursor: isDirector && !uploading ? "pointer" : "default",
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: 12,
            display: "block",
            opacity: isDirector && !uploading ? 1 : 0.5,
          }}
        >
          {uploading ? "Subiendo…" : "+ Subir imagen de preview"}
          <input
            type="file"
            accept="image/*"
            disabled={!isDirector || uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
            style={{ display: "none" }}
          />
        </label>
      )}
      {err && (
        <div style={{ fontSize: 11, color: "var(--red-warn)" }}>
          ⚠ {err}
        </div>
      )}
    </div>
  );
}

/** Celda del thead que aloja un filtro por columna. */
const thFilterCell: React.CSSProperties = {
  padding: "6px 10px",
  textAlign: "left",
  verticalAlign: "middle",
  fontWeight: 400,
};

/** Input/select compacto para los filtros de columna. */
const filterInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "4px 6px",
  fontSize: 11,
  border: "1px solid rgba(10,26,12,0.12)",
  borderRadius: 3,
  background: "var(--white)",
  color: "var(--deep-green)",
  fontFamily: "inherit",
  outline: "none",
};

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

/** Botones de la barra de acciones bulk (sticky encima de la tabla). */
const bulkBtn: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.04em",
  background: "rgba(255,255,255,0.08)",
  color: "var(--off-white)",
  border: "1px solid rgba(255,255,255,0.25)",
  borderRadius: 4,
  cursor: "pointer",
  fontFamily: "inherit",
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

// ============================================================
// NewIdeaModal — modal para crear una pieza manual desde cero.
// El código de la pieza no se elige acá: se genera automáticamente
// (siguiente número disponible) cuando se guarda, basado en orden
// de creación.
// ============================================================
interface NewIdeaDraft {
  date: string;
  time: string;
  /** Una o varias redes — al guardar se crea una pieza por cada red
   *  seleccionada (todas con el mismo idea/copy/brief, codes distintos). */
  networks: ContentNetwork[];
  format: ContentFormat;
  idea: string;
  copy: string;
  cta: string;
  brief: string;
  /** Clasificación editorial — valor, conversion o aspiracional.
   *  Null = sin clasificar todavía. Persiste en content_posts.classification. */
  classification: ContentClassification | null;
}

function NewIdeaModal({
  saving,
  onCancel,
  onSubmit,
}: {
  saving: boolean;
  onCancel: () => void;
  onSubmit: (draft: NewIdeaDraft) => Promise<void>;
}) {
  // Default: hoy, sin hora, IG post.
  const todayISO = new Date().toISOString().slice(0, 10);
  const [draft, setDraft] = useState<NewIdeaDraft>({
    date: todayISO,
    time: "",
    networks: ["ig"],
    format: "post",
    idea: "",
    copy: "",
    cta: "",
    brief: "",
    classification: null,
  });

  // Catálogo de clasificaciones del cliente — leemos del context para
  // que el modal use el mismo set custom que ya configuró el director.
  const classifications = useClassifications();

  const isAnuncio = draft.format === "anuncio";
  const canSave =
    draft.date && draft.idea.trim().length > 0 && draft.networks.length > 0;

  function toggleNetwork(n: ContentNetwork) {
    setDraft((prev) => {
      const has = prev.networks.includes(n);
      const next = has
        ? prev.networks.filter((x) => x !== n)
        : [...prev.networks, n];
      return { ...prev, networks: next };
    });
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,26,12,0.45)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onCancel();
      }}
    >
      <div
        style={{
          background: "var(--white)",
          borderRadius: "var(--r-lg)",
          padding: 28,
          width: "100%",
          maxWidth: 640,
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--sand-dark)",
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          Contenido · Manual
        </div>
        <h2
          style={{
            fontSize: 22,
            fontWeight: 700,
            margin: 0,
            marginBottom: 4,
            color: "var(--deep-green)",
            letterSpacing: "-0.02em",
          }}
        >
          Nueva idea
        </h2>
        <div
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            marginBottom: 20,
          }}
        >
          El código C-XXXX se asigna automáticamente al guardar — no se
          pisa con los existentes.
        </div>

        {/* Fila: fecha + hora */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <ModalLabel>Fecha *</ModalLabel>
            <input
              type="date"
              value={draft.date}
              onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              style={modalInput}
            />
          </div>
          <div>
            <ModalLabel>Hora</ModalLabel>
            <input
              type="time"
              value={draft.time}
              onChange={(e) => setDraft({ ...draft, time: e.target.value })}
              style={modalInput}
            />
          </div>
        </div>

        {/* Fila: redes (multi-select) + formato.
            Si seleccionás más de una red, al guardar se crea una pieza
            independiente por cada red (mismo idea/copy/brief, código
            propio cada una). Ideal para postear el mismo contenido en
            IG + FB el mismo día. */}
        <ModalLabel>Redes * (podés elegir más de una)</ModalLabel>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 12,
          }}
        >
          {(Object.keys(NETWORK_LABEL) as ContentNetwork[]).map((n) => {
            const checked = draft.networks.includes(n);
            return (
              <button
                type="button"
                key={n}
                onClick={() => toggleNetwork(n)}
                style={{
                  padding: "8px 14px",
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  background: checked ? "var(--deep-green)" : "var(--white)",
                  color: checked ? "var(--off-white)" : "var(--deep-green)",
                  border: `1px solid ${
                    checked ? "var(--deep-green)" : "rgba(10,26,12,0.15)"
                  }`,
                  borderRadius: 6,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "all 0.15s",
                }}
              >
                {checked && "✓ "}
                {NETWORK_LABEL[n]}
              </button>
            );
          })}
        </div>
        {draft.networks.length > 1 && (
          <div
            style={{
              fontSize: 11,
              color: "var(--sand-dark)",
              fontStyle: "italic",
              marginBottom: 12,
              padding: "8px 10px",
              background: "rgba(196,168,130,0.08)",
              borderLeft: "2px solid var(--sand-dark)",
              borderRadius: 4,
            }}
          >
            Se va a crear <strong>1 sola pieza</strong> que aparece en las{" "}
            {draft.networks.length} redes seleccionadas. Mismo código C-XXXX
            en todas — si la editás, se actualiza en todos los feeds.
          </div>
        )}

        <ModalLabel>Formato *</ModalLabel>
        <select
          value={draft.format}
          onChange={(e) =>
            setDraft({ ...draft, format: e.target.value as ContentFormat })
          }
          style={modalInput}
        >
          {(Object.keys(FORMAT_LABEL) as ContentFormat[]).map((f) => (
            <option key={f} value={f}>
              {FORMAT_LABEL[f]}
            </option>
          ))}
        </select>

        {/* Clasificación editorial — botones pill por categoría.
            Es opcional (se puede dejar sin clasificar y completarla
            después desde la tabla). Cuando hay una elegida, el resto
            queda en outline. Re-tocar la misma opción la limpia. */}
        <ModalLabel>Clasificación</ModalLabel>
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 4,
          }}
        >
          {classifications.map((c) => {
            const meta = classificationMetaById(classifications, c.id)!;
            const checked = draft.classification === c.id;
            return (
              <button
                type="button"
                key={c.id}
                onClick={() =>
                  setDraft({
                    ...draft,
                    classification: checked ? null : c.id,
                  })
                }
                style={{
                  padding: "8px 14px",
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  background: checked ? meta.color : meta.bg,
                  color: checked ? "var(--off-white)" : meta.color,
                  border: `1px solid ${meta.color}`,
                  borderRadius: 999,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "all 0.15s",
                }}
              >
                {checked && "✓ "}
                {meta.label}
              </button>
            );
          })}
          {classifications.length === 0 && (
            <span
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                fontStyle: "italic",
              }}
            >
              No hay clasificaciones cargadas para este cliente. Configurálas
              en /configuracion → "Clasificaciones editoriales".
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            fontStyle: "italic",
            marginBottom: 4,
          }}
        >
          Opcional. Te ayuda a balancear el feed cuando ves el preview de Instagram.
        </div>

        <ModalLabel>Idea *</ModalLabel>
        <textarea
          value={draft.idea}
          onChange={(e) => setDraft({ ...draft, idea: e.target.value })}
          rows={2}
          placeholder="Concepto creativo de la pieza"
          style={modalInput}
        />

        <ModalLabel>Copy</ModalLabel>
        <textarea
          value={draft.copy}
          onChange={(e) => setDraft({ ...draft, copy: e.target.value })}
          rows={4}
          placeholder="Texto listo para publicar (opcional)"
          style={modalInput}
        />

        {isAnuncio && (
          <>
            <ModalLabel>CTA (call to action)</ModalLabel>
            <input
              type="text"
              value={draft.cta}
              onChange={(e) => setDraft({ ...draft, cta: e.target.value })}
              placeholder='Ej: "Reservá tu lugar", "Comprá ahora"'
              style={modalInput}
            />
          </>
        )}

        <ModalLabel>Brief de producción</ModalLabel>
        <textarea
          value={draft.brief}
          onChange={(e) => setDraft({ ...draft, brief: e.target.value })}
          rows={3}
          placeholder="Shots, tono, formato visual, referencias (opcional)"
          style={modalInput}
        />

        {/* Acciones */}
        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
            marginTop: 22,
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            style={{
              padding: "10px 18px",
              fontSize: 12,
              fontWeight: 600,
              background: "transparent",
              color: "var(--deep-green)",
              border: "1px solid rgba(10,26,12,0.15)",
              borderRadius: "var(--r-sm)",
              cursor: saving ? "default" : "pointer",
              fontFamily: "inherit",
              opacity: saving ? 0.5 : 1,
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => canSave && !saving && onSubmit(draft)}
            disabled={!canSave || saving}
            style={{
              padding: "10px 22px",
              fontSize: 12,
              fontWeight: 700,
              background: "var(--deep-green)",
              color: "var(--off-white)",
              border: "none",
              borderRadius: "var(--r-sm)",
              cursor: !canSave || saving ? "default" : "pointer",
              fontFamily: "inherit",
              opacity: !canSave || saving ? 0.5 : 1,
            }}
          >
            {saving ? "Guardando…" : "Guardar idea"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        fontWeight: 600,
        color: "var(--sand-dark)",
        marginTop: 12,
        marginBottom: 5,
      }}
    >
      {children}
    </div>
  );
}

const modalInput: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  fontSize: 13,
  border: "1px solid rgba(10,26,12,0.15)",
  borderRadius: "var(--r-sm)",
  fontFamily: "inherit",
  background: "var(--white)",
  color: "var(--deep-green)",
  resize: "vertical",
  outline: "none",
};

// ============================================================
// FeedPreview — render alternativo a la tabla. Header con avatar +
// handle + selector de red + selector de tamaño. Body dispatch según
// red:
//   - IG: 3-col grid square (perfil de Instagram).
//   - FB: vertical feed de cards (timeline de Facebook).
//   - TT: 2-col grid portrait 9:16 (Discover / perfil de TikTok).
//   - LinkedIn: vertical feed de cards estilo LI con título destacado.
//
// El selector de tamaño (compact|regular) cappea el ancho del
// contenedor: compact ~440px (mejor para escanear / sin que ocupe la
// pantalla), regular ~720px (default — match razonable con un perfil
// real en desktop). El contenedor exterior centra todo.
// ============================================================
function FeedPreview({
  posts,
  network,
  onNetworkChange,
  size,
  onSizeChange,
  clientName,
  clientLogoUrl,
  socialLinks,
  codeFallback,
  onTileClick,
}: {
  posts: ContentPost[];
  network: ContentNetwork;
  onNetworkChange: (n: ContentNetwork) => void;
  size: "compact" | "regular";
  onSizeChange: (s: "compact" | "regular") => void;
  clientName: string;
  clientLogoUrl: string | null;
  socialLinks: ClientSocialLinks | null;
  codeFallback: Map<string, string>;
  onTileClick: (p: ContentPost) => void;
}) {
  // Filtrar por red elegida + ordenar newest-first (estilo perfil IG).
  // sortedFiltered ya viene filtrado por estado/período/columnas; acá
  // solo aplicamos el filtro de red y reordenamos.
  // Multi-red: un post aparece en este feed si la red pedida está en
  // su array `networks`. Fallback a `network` singular para legacy.
  const networkPosts = posts
    .filter((p) =>
      p.networks && p.networks.length > 0
        ? p.networks.includes(network)
        : p.network === network,
    )
    .slice()
    .sort((a, b) => {
      // Newest first: comparamos por fecha desc, hora desc como tiebreaker.
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.time ?? "").localeCompare(a.time ?? "");
    });

  // URL real del perfil del cliente en la red elegida (si está cargada
  // en /configuracion). Lo usamos para que avatar+handle linkeen al
  // perfil real.
  const profileUrl = socialLinks?.[network] ?? null;
  // Handle preferido: el extraído del URL real del cliente; si no está
  // cargado, fallback a uno derivado del clientName (lowercase, sin
  // espacios) — para no dejar el header vacío.
  const handle =
    extractHandleFromUrl(profileUrl) ??
    `@${clientName.toLowerCase().replace(/[^a-z0-9.]+/g, "")}`;

  // Cap de ancho según size. El ancho compact es chico a propósito
  // para que la grilla no ocupe la pantalla — escaneo rápido. El
  // regular es el ancho razonable para "ver el perfil".
  const maxWidth = size === "compact" ? 440 : 720;

  // Empty state común a todas las redes.
  const emptyBody = (
    <div
      style={{
        padding: "48px 20px",
        textAlign: "center",
        color: "var(--text-muted)",
        fontSize: 12,
        fontStyle: "italic",
      }}
    >
      Sin contenido en {NETWORK_LABEL[network]} para los filtros
      actuales. Probá ajustar el período o el estado.
    </div>
  );

  // Layout body por red (puede ser empty si no hay posts).
  const bodyByNetwork =
    networkPosts.length === 0
      ? emptyBody
      : network === "ig"
        ? (
            <InstagramGrid
              posts={networkPosts}
              codeFallback={codeFallback}
              onTileClick={onTileClick}
            />
          )
        : network === "tt"
          ? (
              <TikTokGrid
                posts={networkPosts}
                codeFallback={codeFallback}
                onTileClick={onTileClick}
              />
            )
          : network === "fb"
            ? (
                <FacebookFeed
                  posts={networkPosts}
                  codeFallback={codeFallback}
                  clientName={clientName}
                  clientLogoUrl={clientLogoUrl}
                  onTileClick={onTileClick}
                />
              )
            : (
                <LinkedInFeed
                  posts={networkPosts}
                  codeFallback={codeFallback}
                  clientName={clientName}
                  clientLogoUrl={clientLogoUrl}
                  onTileClick={onTileClick}
                />
              );

  // Header específico por red — cada uno imita el look del perfil real.
  const headerByNetwork =
    network === "ig" ? (
      <InstagramProfileHeader
        clientName={clientName}
        clientLogoUrl={clientLogoUrl}
        handle={handle}
        profileUrl={profileUrl}
        postsCount={networkPosts.length}
      />
    ) : network === "tt" ? (
      <TikTokProfileHeader
        clientName={clientName}
        clientLogoUrl={clientLogoUrl}
        handle={handle}
        profileUrl={profileUrl}
      />
    ) : network === "fb" ? (
      <FacebookProfileHeader
        clientName={clientName}
        clientLogoUrl={clientLogoUrl}
        handle={handle}
        profileUrl={profileUrl}
      />
    ) : (
      <LinkedInProfileHeader
        clientName={clientName}
        clientLogoUrl={clientLogoUrl}
        handle={handle}
        profileUrl={profileUrl}
      />
    );

  return (
    <div
      style={{
        background: "var(--white)",
        border: "1px solid rgba(10,26,12,0.08)",
        borderRadius: "var(--r-lg)",
        marginBottom: 24,
        marginLeft: "auto",
        marginRight: "auto",
        padding: 0,
        overflow: "hidden",
        maxWidth,
        transition: "max-width 0.2s",
      }}
    >
      {/* CHROME DE NUESTRA APP — selector de red + tamaño. Va con
          nuestra paleta (deep-green/ivory) para que quede claro que NO
          es parte del perfil que estamos imitando. */}
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid rgba(10,26,12,0.06)",
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          background: "var(--off-white)",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: 9,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "var(--sand-dark)",
            fontWeight: 700,
            marginRight: 4,
          }}
        >
          Preview
        </span>
        {(Object.keys(NETWORK_LABEL) as ContentNetwork[]).map((n) => {
          const active = network === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onNetworkChange(n)}
              style={{
                padding: "5px 10px",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                background: active ? "var(--deep-green)" : "transparent",
                color: active ? "var(--off-white)" : "var(--deep-green)",
                border: "1px solid rgba(10,26,12,0.12)",
                borderRadius: 4,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {NETWORK_LABEL[n]}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <div
          style={{
            display: "flex",
            gap: 0,
            background: "var(--white)",
            padding: 3,
            borderRadius: 6,
            border: "1px solid rgba(10,26,12,0.08)",
          }}
        >
          {(["compact", "regular"] as const).map((s) => {
            const active = size === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => onSizeChange(s)}
                title={s === "compact" ? "Vista compacta" : "Vista regular"}
                style={{
                  padding: "4px 9px",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  background: active ? "var(--deep-green)" : "transparent",
                  color: active ? "var(--off-white)" : "var(--text-muted)",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  boxShadow: active ? "0 1px 2px rgba(0,0,0,0.12)" : "none",
                }}
              >
                {s === "compact" ? "S" : "M"}
              </button>
            );
          })}
        </div>
      </div>

      {/* PERFIL SIMULADO — header + body con el look de la red real.
          Acá los estilos son fieles a la app (background, tipografía,
          colores de acento). La grilla de posts abajo es la única
          parte de NUESTRO planning que se ve. */}
      {headerByNetwork}
      {bodyByNetwork}
    </div>
  );
}

// ============================================================
// AVATAR HELPERS — componentes auxiliares de los 4 headers nativos.
// El avatar muestra el logo del cliente (img) o sus iniciales
// (fallback). Tamaño / forma / wrapper varía por red:
//   - IG / TT: redondo, IG con story-ring degradé encima.
//   - FB: redondo, overlapping con el cover (negative margin).
//   - LinkedIn: cuadrado redondeado (corporate look).
// Si el cliente tiene URL del perfil, el avatar es link target=_blank.
// ============================================================

/** Avatar redondo simple. Para IG/TT/FB. */
function RoundAvatar({
  size,
  clientName,
  clientLogoUrl,
  border,
  background,
  fontSize,
}: {
  size: number;
  clientName: string;
  clientLogoUrl: string | null;
  border?: string;
  background?: string;
  fontSize?: number;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background:
          background ?? (clientLogoUrl ? "#fff" : "var(--sand)"),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        color: "var(--deep-green)",
        fontWeight: 800,
        fontSize: fontSize ?? Math.round(size * 0.32),
        flexShrink: 0,
        border: border ?? "1px solid rgba(10,26,12,0.08)",
      }}
    >
      {clientLogoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={clientLogoUrl}
          alt={clientName}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : (
        clientName
          .split(/\s+/)
          .map((w) => w[0])
          .filter(Boolean)
          .slice(0, 2)
          .join("")
          .toUpperCase()
      )}
    </div>
  );
}

/** Avatar cuadrado redondeado — LinkedIn style. */
function SquareAvatar({
  size,
  clientName,
  clientLogoUrl,
  background,
}: {
  size: number;
  clientName: string;
  clientLogoUrl: string | null;
  background?: string;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        background: background ?? (clientLogoUrl ? "#fff" : "#0a66c2"),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        color: "#fff",
        fontWeight: 800,
        fontSize: Math.round(size * 0.34),
        flexShrink: 0,
        border: "3px solid #fff",
        boxShadow: "0 2px 4px rgba(0,0,0,0.08)",
      }}
    >
      {clientLogoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={clientLogoUrl}
          alt={clientName}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : (
        clientName
          .split(/\s+/)
          .map((w) => w[0])
          .filter(Boolean)
          .slice(0, 2)
          .join("")
          .toUpperCase()
      )}
    </div>
  );
}

/** Helper: linkea cualquier nodo a la URL del perfil real (target=_blank).
 *  Si profileUrl es null, devuelve el nodo tal cual. */
function ProfileLinkWrap({
  profileUrl,
  title,
  children,
}: {
  profileUrl: string | null;
  title: string;
  children: React.ReactNode;
}) {
  if (!profileUrl) return <>{children}</>;
  return (
    <a
      href={profileUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      style={{
        textDecoration: "none",
        color: "inherit",
        display: "contents",
      }}
    >
      {children}
    </a>
  );
}

// ============================================================
// INSTAGRAM HEADER — fondo blanco, avatar con story-ring degradé,
// nombre + verified mark + bio + stats (posts/seguidores/siguiendo)
// + botones Seguir / Mensaje / + . Fuente system-ui (cercana a IG).
// ============================================================
function InstagramProfileHeader({
  clientName,
  clientLogoUrl,
  handle,
  profileUrl,
  postsCount,
}: {
  clientName: string;
  clientLogoUrl: string | null;
  handle: string;
  profileUrl: string | null;
  postsCount: number;
}) {
  return (
    <div
      style={{
        background: "#fff",
        color: "#000",
        padding: "20px 18px 14px",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        {/* Avatar con story-ring */}
        <ProfileLinkWrap
          profileUrl={profileUrl}
          title="Abrir perfil de Instagram"
        >
          <div
            style={{
              padding: 2.5,
              background:
                "linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)",
              borderRadius: "50%",
              flexShrink: 0,
              display: "flex",
            }}
          >
            <div
              style={{
                padding: 2,
                background: "#fff",
                borderRadius: "50%",
                display: "flex",
              }}
            >
              <RoundAvatar
                size={72}
                clientName={clientName}
                clientLogoUrl={clientLogoUrl}
              />
            </div>
          </div>
        </ProfileLinkWrap>

        {/* Handle + verified + botones a la derecha del avatar */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 6,
              flexWrap: "wrap",
            }}
          >
            <ProfileLinkWrap profileUrl={profileUrl} title="Abrir perfil de Instagram">
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 400,
                  color: "#000",
                }}
              >
                {handle.replace(/^@/, "")}
              </span>
            </ProfileLinkWrap>
            <button
              type="button"
              style={{
                marginLeft: 4,
                padding: "5px 14px",
                fontSize: 13,
                fontWeight: 600,
                background: "#0095F6",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Seguir
            </button>
            <button
              type="button"
              style={{
                padding: "5px 12px",
                fontSize: 13,
                fontWeight: 600,
                background: "#EFEFEF",
                color: "#000",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Mensaje
            </button>
          </div>
          {/* Solo el conteo de publicaciones — es lo único que sí
              sabemos sin manual (lo derivamos de nuestros posts).
              Seguidores/siguiendo NO se muestran porque no tenemos
              cómo traerlos sin pedirle al director que los cargue. */}
          <div
            style={{
              fontSize: 14,
              color: "#000",
              marginTop: 2,
            }}
          >
            <strong>{postsCount}</strong> publicaciones
          </div>
        </div>
      </div>

      {/* Nombre real del cliente (sin bio porque no se carga). */}
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#000" }}>
          {clientName || "Cliente"}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// TIKTOK HEADER — fondo blanco, avatar grande redondo, @handle
// gigante, stats row (Following/Followers/Likes) y Seguir.
// Fuente sans-serif redondeada (cercana a TT).
// ============================================================
function TikTokProfileHeader({
  clientName,
  clientLogoUrl,
  handle,
  profileUrl,
}: {
  clientName: string;
  clientLogoUrl: string | null;
  handle: string;
  profileUrl: string | null;
}) {
  return (
    <div
      style={{
        background: "#fff",
        color: "#161823",
        padding: "22px 16px 16px",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        textAlign: "center",
      }}
    >
      <ProfileLinkWrap profileUrl={profileUrl} title="Abrir perfil de TikTok">
        <div style={{ display: "flex", justifyContent: "center" }}>
          <RoundAvatar
            size={96}
            clientName={clientName}
            clientLogoUrl={clientLogoUrl}
            border="3px solid rgba(0,0,0,0.04)"
          />
        </div>
      </ProfileLinkWrap>

      <ProfileLinkWrap profileUrl={profileUrl} title="Abrir perfil de TikTok">
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "#161823",
            marginTop: 10,
          }}
        >
          {handle}
        </div>
      </ProfileLinkWrap>
      <div
        style={{
          fontSize: 13,
          color: "rgba(22,24,35,0.5)",
          marginTop: 1,
        }}
      >
        {clientName || "Cliente"}
      </div>

      <button
        type="button"
        style={{
          marginTop: 12,
          padding: "8px 28px",
          fontSize: 14,
          fontWeight: 700,
          background: "#FE2C55",
          color: "#fff",
          border: "none",
          borderRadius: 4,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        Seguir
      </button>
      {/* Stats row + bio removidos: no se cargan manualmente y
          tampoco se pueden traer auto. */}
    </div>
  );
}

// ============================================================
// FACEBOOK HEADER — cover degradé azul + avatar overlapping +
// nombre + categoría + likes/followers + botones tipo Me gusta /
// Seguir / Compartir. Fuente Helvetica (clásica de FB).
// ============================================================
function FacebookProfileHeader({
  clientName,
  clientLogoUrl,
  handle,
  profileUrl,
}: {
  clientName: string;
  clientLogoUrl: string | null;
  handle: string;
  profileUrl: string | null;
}) {
  return (
    <div
      style={{
        background: "#fff",
        color: "#050505",
        fontFamily:
          "Helvetica, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* Cover degradé azul de FB */}
      <div
        style={{
          height: 120,
          background: "linear-gradient(135deg, #1877F2 0%, #166FE5 100%)",
          position: "relative",
        }}
      />
      <div style={{ padding: "0 18px 14px", position: "relative" }}>
        {/* Avatar overlap sobre el cover */}
        <div
          style={{
            position: "absolute",
            top: -42,
            left: 18,
          }}
        >
          <ProfileLinkWrap profileUrl={profileUrl} title="Abrir perfil de Facebook">
            <RoundAvatar
              size={84}
              clientName={clientName}
              clientLogoUrl={clientLogoUrl}
              border="4px solid #fff"
              fontSize={26}
            />
          </ProfileLinkWrap>
        </div>
        <div style={{ height: 50 }} />
        {/* Nombre + categoría */}
        <div style={{ marginBottom: 6 }}>
          <ProfileLinkWrap profileUrl={profileUrl} title="Abrir perfil de Facebook">
            <span style={{ fontSize: 24, fontWeight: 700, color: "#050505" }}>
              {clientName || "Cliente"}
            </span>
          </ProfileLinkWrap>
        </div>
        <div style={{ fontSize: 13, color: "#65676B", marginBottom: 12 }}>
          {handle} · Página de empresa
        </div>
        {/* Stats (seguidores/likes) + bio removidos: no se cargan
            manualmente y no se pueden traer auto. */}
        {/* Botones */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            style={{
              padding: "6px 14px",
              fontSize: 14,
              fontWeight: 600,
              background: "#1877F2",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            👍 Me gusta
          </button>
          <button
            type="button"
            style={{
              padding: "6px 14px",
              fontSize: 14,
              fontWeight: 600,
              background: "#E4E6EB",
              color: "#050505",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Seguir
          </button>
          <button
            type="button"
            style={{
              padding: "6px 14px",
              fontSize: 14,
              fontWeight: 600,
              background: "#E4E6EB",
              color: "#050505",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            ↗ Compartir
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// LINKEDIN HEADER — cover gris-azul + avatar cuadrado overlapping +
// nombre + headline (sector del cliente) + N conexiones + botones
// Conectar / Mensaje / + Seguir. Fuente system-ui (clean corporate).
// ============================================================
function LinkedInProfileHeader({
  clientName,
  clientLogoUrl,
  handle,
  profileUrl,
}: {
  clientName: string;
  clientLogoUrl: string | null;
  handle: string;
  profileUrl: string | null;
}) {
  return (
    <div
      style={{
        background: "#fff",
        color: "rgba(0,0,0,0.9)",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* Cover gris-azul corporativo */}
      <div
        style={{
          height: 110,
          background:
            "linear-gradient(135deg, #0a66c2 0%, #004182 50%, #0a66c2 100%)",
          position: "relative",
        }}
      />
      <div style={{ padding: "0 18px 14px", position: "relative" }}>
        <div
          style={{
            position: "absolute",
            top: -50,
            left: 18,
          }}
        >
          <ProfileLinkWrap profileUrl={profileUrl} title="Abrir perfil de LinkedIn">
            <SquareAvatar
              size={92}
              clientName={clientName}
              clientLogoUrl={clientLogoUrl}
            />
          </ProfileLinkWrap>
        </div>
        <div style={{ height: 56 }} />
        <ProfileLinkWrap profileUrl={profileUrl} title="Abrir perfil de LinkedIn">
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "rgba(0,0,0,0.9)",
              marginBottom: 2,
            }}
          >
            {clientName || "Cliente"}
          </div>
        </ProfileLinkWrap>
        <div
          style={{
            fontSize: 12,
            color: "rgba(0,0,0,0.55)",
            marginBottom: 12,
          }}
        >
          {handle} · Empresa
        </div>
        {/* Headline + N seguidores removidos: no se cargan
            manualmente y no se pueden traer auto. */}
        {/* Botones */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            style={{
              padding: "6px 16px",
              fontSize: 14,
              fontWeight: 700,
              background: "#0a66c2",
              color: "#fff",
              border: "none",
              borderRadius: 999,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            + Seguir
          </button>
          <button
            type="button"
            style={{
              padding: "5px 14px",
              fontSize: 14,
              fontWeight: 600,
              background: "#fff",
              color: "#0a66c2",
              border: "1px solid #0a66c2",
              borderRadius: 999,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Mensaje
          </button>
          <button
            type="button"
            style={{
              padding: "5px 14px",
              fontSize: 14,
              fontWeight: 600,
              background: "transparent",
              color: "rgba(0,0,0,0.6)",
              border: "1px solid rgba(0,0,0,0.6)",
              borderRadius: 999,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Más
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * InstagramGrid — perfil clásico de IG. Grilla 3-col cuadrada,
 * newest-first, gap mínimo entre tiles.
 */
function InstagramGrid({
  posts,
  codeFallback,
  onTileClick,
}: {
  posts: ContentPost[];
  codeFallback: Map<string, string>;
  onTileClick: (p: ContentPost) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 2,
        padding: 2,
        background: "rgba(10,26,12,0.06)",
      }}
    >
      {posts.map((p) => (
        <FeedTile
          key={p.id}
          post={p}
          code={codeOf(p, codeFallback)}
          onClick={() => onTileClick(p)}
        />
      ))}
    </div>
  );
}

/**
 * TikTokGrid — Discover/perfil de TT. Grilla 2-col, aspect-ratio
 * 9:16 (portrait), gap mínimo. Cada tile lleva un play indicator
 * porque casi todo el contenido de TT es video.
 */
function TikTokGrid({
  posts,
  codeFallback,
  onTileClick,
}: {
  posts: ContentPost[];
  codeFallback: Map<string, string>;
  onTileClick: (p: ContentPost) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: 3,
        padding: 3,
        background: "#000",
      }}
    >
      {posts.map((p) => (
        <TikTokTile
          key={p.id}
          post={p}
          code={codeOf(p, codeFallback)}
          onClick={() => onTileClick(p)}
        />
      ))}
    </div>
  );
}

/**
 * FacebookFeed — timeline de FB. Cards verticales apiladas con
 * header (avatar + nombre + fecha), copy completo arriba, imagen
 * después si existe.
 */
function FacebookFeed({
  posts,
  codeFallback,
  clientName,
  clientLogoUrl,
  onTileClick,
}: {
  posts: ContentPost[];
  codeFallback: Map<string, string>;
  clientName: string;
  clientLogoUrl: string | null;
  onTileClick: (p: ContentPost) => void;
}) {
  return (
    <div
      style={{
        background: "#f0f2f5",
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {posts.map((p) => (
        <FacebookPostCard
          key={p.id}
          post={p}
          code={codeOf(p, codeFallback)}
          clientName={clientName}
          clientLogoUrl={clientLogoUrl}
          onClick={() => onTileClick(p)}
        />
      ))}
    </div>
  );
}

/**
 * LinkedInFeed — feed de LinkedIn. Cards verticales, look más sobrio,
 * encabezado con el nombre del cliente como "marca" + título dorado.
 */
function LinkedInFeed({
  posts,
  codeFallback,
  clientName,
  clientLogoUrl,
  onTileClick,
}: {
  posts: ContentPost[];
  codeFallback: Map<string, string>;
  clientName: string;
  clientLogoUrl: string | null;
  onTileClick: (p: ContentPost) => void;
}) {
  return (
    <div
      style={{
        background: "#f3f2ef",
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {posts.map((p) => (
        <LinkedInPostCard
          key={p.id}
          post={p}
          code={codeOf(p, codeFallback)}
          clientName={clientName}
          clientLogoUrl={clientLogoUrl}
          onClick={() => onTileClick(p)}
        />
      ))}
    </div>
  );
}

/**
 * FeedTile — un tile cuadrado de la grilla del feed. Color de fondo
 * basado en la clasificación (valor=verde, conversion=rojo,
 * aspiracional=sand). Format icon arriba-derecha (reel/carrusel/story).
 * Snippet de la idea/brief en el centro. Status dot arriba-izquierda.
 */
function FeedTile({
  post,
  code,
  onClick,
}: {
  post: ContentPost;
  code: string;
  onClick: () => void;
}) {
  const classifications = useClassifications();
  const meta = classificationMetaById(classifications, post.classification);
  // Si no hay clasificación, usamos el color de red como background.
  const bg = meta?.color ?? NETWORK_COLORS[post.network]?.solid ?? "#0A1A0C";
  // Texto que aparece dentro del tile — el "concepto" del post.
  // Truncado a ~110 chars para que se lea grande sin desbordarse.
  const concept = (post.idea ?? post.brief ?? "").split("\n")[0]?.trim() || "";
  const conceptShown = concept ? concept.slice(0, 110) : "Sin concepto";
  // Icono mini que indica el tipo de pieza (mismo idioma visual que IG).
  const formatIcon =
    post.format === "reel"
      ? "▶"
      : post.format === "carrusel"
        ? "⌗"
        : post.format === "story"
          ? "○"
          : post.format === "ugc"
            ? "♻"
            : post.format === "anuncio"
              ? "$"
              : "";

  const hasImage = !!post.imageUrl;

  return (
    <button
      type="button"
      onClick={onClick}
      title={`${code} · ${FORMAT_LABEL[post.format] ?? post.format} · ${STATUS_LABEL[post.status]}`}
      style={{
        position: "relative",
        aspectRatio: "1 / 1",
        background: bg,
        color: "var(--off-white)",
        border: "none",
        cursor: "pointer",
        padding: 0,
        overflow: "hidden",
        fontFamily: "inherit",
      }}
    >
      {/* Imagen del post como background si existe — encima va el
          overlay y los chips. */}
      {hasImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.imageUrl!}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      )}

      {/* Overlay parejo para que el concepto se lea siempre. Más fuerte
          cuando hay imagen (oscurece para leer encima); más sutil
          cuando es color sólido. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: hasImage
            ? "rgba(0,0,0,0.42)"
            : "linear-gradient(180deg, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.10) 60%, rgba(0,0,0,0.22) 100%)",
        }}
      />

      {/* Status dot — arriba-izquierda */}
      <div
        style={{
          position: "absolute",
          top: 6,
          left: 6,
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: STATUS_COLOR[post.status],
          border: "1.5px solid rgba(255,255,255,0.85)",
          zIndex: 2,
        }}
        title={STATUS_LABEL[post.status]}
      />

      {/* Date pill — abajo-izquierda. Lo más útil para planificación:
          ver a primera vista cuándo se publica cada pieza. */}
      <div
        style={{
          position: "absolute",
          bottom: 6,
          left: 6,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.04em",
          padding: "2px 6px",
          background: "rgba(0,0,0,0.45)",
          color: "rgba(255,255,255,0.92)",
          borderRadius: 3,
          backdropFilter: "blur(2px)",
          zIndex: 2,
          textTransform: "uppercase",
        }}
      >
        {formatShortDate(post.date)}
      </div>

      {/* Format icon — arriba-derecha */}
      {formatIcon && (
        <div
          style={{
            position: "absolute",
            top: 4,
            right: 6,
            fontSize: 14,
            fontWeight: 800,
            color: "rgba(255,255,255,0.9)",
            textShadow: "0 1px 2px rgba(0,0,0,0.4)",
            zIndex: 2,
          }}
        >
          {formatIcon}
        </div>
      )}

      {/* Classification badge — arriba-derecha bajo el formato */}
      {meta && (
        <div
          style={{
            position: "absolute",
            top: 26,
            right: 6,
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: "0.06em",
            padding: "2px 5px",
            background: "rgba(255,255,255,0.22)",
            color: "var(--off-white)",
            borderRadius: 3,
            backdropFilter: "blur(2px)",
            zIndex: 2,
          }}
        >
          {meta.short}
        </div>
      )}

      {/* Código C-XXXX — arriba al medio, muy chiquito */}
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 50,
          right: 50,
          fontSize: 9,
          fontFamily: "monospace",
          fontWeight: 700,
          color: "rgba(255,255,255,0.75)",
          textAlign: "center",
          letterSpacing: "0.05em",
          zIndex: 2,
        }}
      >
        {code}
      </div>

      {/* CONCEPTO centrado — el bloque principal del tile. Se ve grande,
          centrado vertical y horizontal, multi-línea con clamp. Es lo
          primero que el ojo capta al escanear la grilla.
          Padding bottom 30px deja espacio para el date pill abajo. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px 12px 30px",
          zIndex: 1,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            lineHeight: 1.3,
            letterSpacing: "-0.005em",
            color: "rgba(255,255,255,0.98)",
            textAlign: "center",
            textShadow: hasImage ? "0 1px 4px rgba(0,0,0,0.6)" : "none",
            display: "-webkit-box",
            WebkitLineClamp: 5,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            fontStyle: concept ? "normal" : "italic",
            opacity: concept ? 1 : 0.7,
          }}
        >
          {conceptShown}
        </div>
      </div>
    </button>
  );
}

// ============================================================
// TikTokTile — tile portrait 9:16 estilo perfil/Discover de TikTok.
// Fondo negro por defecto (típico de TT), play indicator centro,
// stats fake al pie (views) y un thumbnail del classification/format.
// ============================================================
function TikTokTile({
  post,
  code,
  onClick,
}: {
  post: ContentPost;
  code: string;
  onClick: () => void;
}) {
  const classifications = useClassifications();
  const meta = classificationMetaById(classifications, post.classification);
  const bg = meta?.color ?? "#1a1a1a";
  const concept = (post.idea ?? post.brief ?? "").split("\n")[0]?.trim() || "";
  const conceptShown = concept ? concept.slice(0, 120) : "Sin concepto";
  const hasImage = !!post.imageUrl;

  return (
    <button
      type="button"
      onClick={onClick}
      title={`${code} · ${FORMAT_LABEL[post.format] ?? post.format} · ${STATUS_LABEL[post.status]}`}
      style={{
        position: "relative",
        aspectRatio: "9 / 16",
        background: bg,
        color: "var(--off-white)",
        border: "none",
        cursor: "pointer",
        padding: 0,
        overflow: "hidden",
        fontFamily: "inherit",
      }}
    >
      {hasImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.imageUrl!}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      )}

      {/* Overlay para que se lea el texto centrado */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: hasImage
            ? "rgba(0,0,0,0.5)"
            : "linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.15) 100%)",
        }}
      />

      {/* Code arriba-izq, classification arriba-der */}
      <div
        style={{
          position: "absolute",
          top: 6,
          left: 6,
          fontSize: 9,
          fontFamily: "monospace",
          fontWeight: 700,
          color: "rgba(255,255,255,0.85)",
          background: "rgba(0,0,0,0.4)",
          padding: "1px 5px",
          borderRadius: 3,
          zIndex: 2,
        }}
      >
        {code}
      </div>
      {meta && (
        <div
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: "0.06em",
            padding: "2px 6px",
            background: meta.color,
            color: "var(--off-white)",
            borderRadius: 3,
            zIndex: 2,
          }}
        >
          {meta.short}
        </div>
      )}

      {/* Status dot + date pill abajo-izq — mismo idioma visual que IG. */}
      <div
        style={{
          position: "absolute",
          bottom: 8,
          left: 8,
          display: "flex",
          alignItems: "center",
          gap: 6,
          zIndex: 2,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: STATUS_COLOR[post.status],
            border: "1.5px solid rgba(255,255,255,0.85)",
          }}
          title={STATUS_LABEL[post.status]}
        />
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.04em",
            padding: "2px 6px",
            background: "rgba(0,0,0,0.45)",
            color: "rgba(255,255,255,0.92)",
            borderRadius: 3,
            backdropFilter: "blur(2px)",
            textTransform: "uppercase",
          }}
        >
          {formatShortDate(post.date)}
        </div>
      </div>

      {/* Play indicator abajo-der — chiquito, no tapa el concepto */}
      <div
        style={{
          position: "absolute",
          bottom: 6,
          right: 6,
          fontSize: 11,
          color: "rgba(255,255,255,0.7)",
          zIndex: 2,
        }}
      >
        ▶
      </div>

      {/* CONCEPTO centrado — bloque principal del tile, igual que en IG. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "30px 14px 36px",
          zIndex: 1,
        }}
      >
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 700,
            lineHeight: 1.3,
            letterSpacing: "-0.005em",
            color: "rgba(255,255,255,0.98)",
            textAlign: "center",
            textShadow: hasImage ? "0 1px 4px rgba(0,0,0,0.6)" : "none",
            display: "-webkit-box",
            WebkitLineClamp: 6,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            fontStyle: concept ? "normal" : "italic",
            opacity: concept ? 1 : 0.7,
          }}
        >
          {conceptShown}
        </div>
      </div>
    </button>
  );
}

// ============================================================
// FacebookPostCard — card vertical estilo feed de FB. Header con
// avatar + nombre + fecha, copy completo, imagen abajo si existe.
// Footer con estado + clasificación.
// ============================================================
function FacebookPostCard({
  post,
  code,
  clientName,
  clientLogoUrl,
  onClick,
}: {
  post: ContentPost;
  code: string;
  clientName: string;
  clientLogoUrl: string | null;
  onClick: () => void;
}) {
  const classifications = useClassifications();
  const meta = classificationMetaById(classifications, post.classification);
  const initials = clientName
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "#fff",
        border: "none",
        borderRadius: 8,
        padding: 0,
        textAlign: "left",
        cursor: "pointer",
        boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
        overflow: "hidden",
        fontFamily: "inherit",
        color: "#050505",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: 12,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: clientLogoUrl ? "#fff" : "#1877F2",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 14,
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          {clientLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={clientLogoUrl}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            initials
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#050505" }}>
            {clientName || "Cliente"}
          </div>
          <div style={{ fontSize: 11, color: "#65676b" }}>
            {formatHumanDate(post.date)}
            {post.time ? ` · ${post.time}` : ""} · 🌐
          </div>
        </div>
        <div
          style={{
            fontSize: 9,
            fontFamily: "monospace",
            fontWeight: 700,
            color: "#65676b",
          }}
        >
          {code}
        </div>
      </div>

      {/* Copy del post */}
      {(post.copy || post.idea) && (
        <div
          style={{
            padding: "0 12px 10px",
            fontSize: 13,
            lineHeight: 1.4,
            color: "#050505",
            whiteSpace: "pre-wrap",
            display: "-webkit-box",
            WebkitLineClamp: 4,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {post.copy ?? post.idea}
        </div>
      )}

      {/* Imagen — la mostramos si la subió; si no, mostramos un panel
          coloreado por clasificación a modo de placeholder visual. */}
      {post.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.imageUrl}
          alt=""
          style={{
            width: "100%",
            maxHeight: 320,
            objectFit: "cover",
            display: "block",
            background: "#e4e6eb",
          }}
        />
      ) : meta ? (
        <div
          style={{
            background: meta.color,
            padding: "32px 14px",
            color: "var(--off-white)",
            textAlign: "center",
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {meta.label} · {FORMAT_LABEL[post.format] ?? post.format}
        </div>
      ) : null}

      {/* Footer compacto con estado + clasificación */}
      <div
        style={{
          padding: 10,
          borderTop: "1px solid #ced0d4",
          display: "flex",
          gap: 8,
          alignItems: "center",
          fontSize: 11,
          color: "#65676b",
        }}
      >
        <span
          style={{
            padding: "2px 7px",
            background:
              post.status === "published"
                ? "#1877F2"
                : post.status === "scheduled"
                  ? "rgba(24,119,242,0.15)"
                  : "rgba(0,0,0,0.05)",
            color:
              post.status === "published"
                ? "#fff"
                : post.status === "scheduled"
                  ? "#1877F2"
                  : "#65676b",
            fontWeight: 600,
            borderRadius: 4,
            fontSize: 10,
            letterSpacing: "0.04em",
          }}
        >
          {STATUS_LABEL[post.status]}
        </span>
        <span>{FORMAT_LABEL[post.format] ?? post.format}</span>
        {meta && (
          <span
            style={{
              marginLeft: "auto",
              padding: "2px 7px",
              background: meta.bg,
              color: meta.color,
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            {meta.label}
          </span>
        )}
      </div>
    </button>
  );
}

// ============================================================
// LinkedInPostCard — card vertical estilo feed de LinkedIn. Más
// sobria que FB, con título destacado, header con rol/empresa,
// menos íconos. Buena para previsualizar contenido pro.
// ============================================================
function LinkedInPostCard({
  post,
  code,
  clientName,
  clientLogoUrl,
  onClick,
}: {
  post: ContentPost;
  code: string;
  clientName: string;
  clientLogoUrl: string | null;
  onClick: () => void;
}) {
  const classifications = useClassifications();
  const meta = classificationMetaById(classifications, post.classification);
  const initials = clientName
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "#fff",
        border: "1px solid #e0dfdc",
        borderRadius: 8,
        padding: 0,
        textAlign: "left",
        cursor: "pointer",
        overflow: "hidden",
        fontFamily: "inherit",
        color: "rgba(0,0,0,0.9)",
      }}
    >
      {/* Header LinkedIn — avatar cuadrado redondeado */}
      <div
        style={{
          padding: 12,
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 6,
            background: clientLogoUrl ? "#fff" : "#0a66c2",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 15,
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          {clientLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={clientLogoUrl}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            initials
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(0,0,0,0.9)" }}>
            {clientName || "Cliente"}
          </div>
          <div style={{ fontSize: 11, color: "rgba(0,0,0,0.6)" }}>
            Empresa · contenido editorial
          </div>
          <div style={{ fontSize: 10, color: "rgba(0,0,0,0.55)", marginTop: 2 }}>
            {formatHumanDate(post.date)}
            {post.time ? ` · ${post.time}` : ""} · 🌐
          </div>
        </div>
        <div
          style={{
            fontSize: 9,
            fontFamily: "monospace",
            fontWeight: 700,
            color: "rgba(0,0,0,0.45)",
          }}
        >
          {code}
        </div>
      </div>

      {/* Headline = idea como título grande */}
      {post.idea && (
        <div
          style={{
            padding: "0 12px 8px",
            fontSize: 14,
            fontWeight: 600,
            lineHeight: 1.35,
            color: "rgba(0,0,0,0.9)",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {post.idea}
        </div>
      )}

      {/* Copy abajo del headline */}
      {post.copy && (
        <div
          style={{
            padding: "0 12px 12px",
            fontSize: 12.5,
            lineHeight: 1.5,
            color: "rgba(0,0,0,0.75)",
            whiteSpace: "pre-wrap",
            display: "-webkit-box",
            WebkitLineClamp: 4,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {post.copy}
        </div>
      )}

      {/* Imagen o placeholder editorial */}
      {post.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.imageUrl}
          alt=""
          style={{
            width: "100%",
            maxHeight: 360,
            objectFit: "cover",
            display: "block",
            borderTop: "1px solid #e0dfdc",
            borderBottom: "1px solid #e0dfdc",
          }}
        />
      ) : meta ? (
        <div
          style={{
            background: meta.bg,
            padding: "40px 16px",
            color: meta.color,
            textAlign: "center",
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            borderTop: "1px solid #e0dfdc",
            borderBottom: "1px solid #e0dfdc",
          }}
        >
          {meta.label} · {FORMAT_LABEL[post.format] ?? post.format}
        </div>
      ) : null}

      {/* Footer LinkedIn — más limpio, sin botones de like/comment
          porque no aportan al preview editorial. */}
      <div
        style={{
          padding: 10,
          display: "flex",
          gap: 8,
          alignItems: "center",
          fontSize: 11,
          color: "rgba(0,0,0,0.6)",
        }}
      >
        <span
          style={{
            padding: "2px 7px",
            background:
              post.status === "published"
                ? "#0a66c2"
                : post.status === "scheduled"
                  ? "rgba(10,102,194,0.12)"
                  : "rgba(0,0,0,0.05)",
            color:
              post.status === "published"
                ? "#fff"
                : post.status === "scheduled"
                  ? "#0a66c2"
                  : "rgba(0,0,0,0.6)",
            fontWeight: 700,
            borderRadius: 4,
            fontSize: 10,
            letterSpacing: "0.04em",
          }}
        >
          {STATUS_LABEL[post.status]}
        </span>
        <span>{FORMAT_LABEL[post.format] ?? post.format}</span>
        {meta && (
          <span
            style={{
              marginLeft: "auto",
              padding: "2px 7px",
              background: meta.color,
              color: "var(--off-white)",
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            {meta.label}
          </span>
        )}
      </div>
    </button>
  );
}

// ============================================================
// FeedPostDetailModal — modal con la info completa del post cuando
// el usuario toca un tile en la vista feed. Solo lectura — para
// editar la pieza se usa la tabla (toggle desde el header).
// ============================================================
function FeedPostDetailModal({
  post,
  code,
  onClose,
}: {
  post: ContentPost;
  code: string;
  onClose: () => void;
}) {
  const classifications = useClassifications();
  const meta = classificationMetaById(classifications, post.classification);

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,26,12,0.6)",
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 40,
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        style={{
          background: "var(--white)",
          maxWidth: 560,
          width: "100%",
          maxHeight: "88vh",
          overflowY: "auto",
          padding: 32,
          borderRadius: "var(--r-lg)",
          position: "relative",
          boxShadow: "var(--shadow-md)",
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            fontSize: 18,
            width: 32,
            height: 32,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--text-muted)",
          }}
        >
          ×
        </button>

        {/* Imagen del post, si está cargada — al tope del modal con
            aspect ratio cuadrado, igual que la vista feed IG. */}
        {post.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.imageUrl}
            alt={post.idea ?? "Imagen del post"}
            style={{
              width: "100%",
              maxHeight: 320,
              objectFit: "cover",
              borderRadius: "var(--r-sm)",
              marginBottom: 16,
              background: "var(--off-white)",
            }}
          />
        )}

        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--sand-dark)",
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          {code} · {NETWORK_LABEL[post.network]}
        </div>
        <h2
          style={{
            fontSize: 22,
            fontWeight: 700,
            marginBottom: 12,
            color: "var(--deep-green)",
            letterSpacing: "-0.02em",
          }}
        >
          {post.idea || "Sin idea"}
        </h2>

        {/* Chips: formato + estado + clasificación + fecha */}
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            marginBottom: 18,
          }}
        >
          <span
            style={{
              padding: "3px 9px",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              background: NETWORK_COLORS[post.network]?.solid ?? "#0A1A0C",
              color: "var(--off-white)",
              borderRadius: "var(--r-pill)",
            }}
          >
            {FORMAT_LABEL[post.format] ?? post.format}
          </span>
          <span
            style={{
              padding: "3px 9px",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
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
          {meta && (
            <span
              style={{
                padding: "3px 9px",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                background: meta.color,
                color: "var(--off-white)",
                borderRadius: "var(--r-pill)",
              }}
            >
              {meta.label}
            </span>
          )}
          <span
            style={{
              padding: "3px 9px",
              fontSize: 10,
              fontWeight: 600,
              color: "var(--text-muted)",
              background: "var(--off-white)",
              borderRadius: "var(--r-pill)",
            }}
          >
            {formatHumanDate(post.date)}
            {post.time ? ` · ${post.time}` : ""}
          </span>
        </div>

        {/* Copy */}
        {post.copy && (
          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                fontWeight: 600,
                color: "var(--sand-dark)",
                marginBottom: 4,
              }}
            >
              Copy
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--deep-green)",
                lineHeight: 1.55,
                whiteSpace: "pre-wrap",
                padding: 12,
                background: "var(--off-white)",
                borderRadius: "var(--r-sm)",
              }}
            >
              {post.copy}
            </div>
          </div>
        )}

        {/* CTA */}
        {post.cta && (
          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                fontWeight: 600,
                color: "var(--sand-dark)",
                marginBottom: 4,
              }}
            >
              CTA
            </div>
            <div style={{ fontSize: 13, color: "var(--deep-green)" }}>
              {post.cta}
            </div>
          </div>
        )}

        {/* Brief */}
        {post.brief && (
          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                fontWeight: 600,
                color: "var(--sand-dark)",
                marginBottom: 4,
              }}
            >
              Brief de producción
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--deep-green)",
                lineHeight: 1.55,
                whiteSpace: "pre-wrap",
                padding: 12,
                background: "var(--off-white)",
                borderRadius: "var(--r-sm)",
              }}
            >
              {post.brief}
            </div>
          </div>
        )}

        <div
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            fontStyle: "italic",
            marginTop: 18,
          }}
        >
          Para editar esta pieza, cambiá a la <strong>Tabla</strong> arriba y
          expandí la fila.
        </div>
      </div>
    </div>
  );
}
