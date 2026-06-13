"use client";

/**
 * GP · Solicitudes del cliente — vista global de todas las
 * client_requests (ofertas + acciones + recomendaciones) que el
 * cliente carga desde su portal. Inbox unificado para el director:
 *
 *   - Recomendaciones (mig 070): comentarios sobre piezas específicas
 *     del menú Contenido. Link directo al post C-XXXX para verlo.
 *   - Ofertas: campañas / promos con descuento + fecha.
 *   - Acciones: pedidos libres (ads, contenido, seo, dev, otro).
 *
 * Filtros:
 *   - Tipo (chips arriba)
 *   - Estado (chips abajo)
 *   - Cliente (dropdown)
 *
 * Click en una fila → expande detalle:
 *   - Descripción completa
 *   - Si es recomendacion: link al post + excerpt de la idea
 *   - Campo "respuesta" editable
 *   - Botones cambiar estado: Recibida → En revisión → En curso → Completada / Rechazada
 *
 * Acceso: director y team (no cliente — el cliente las ve en su
 * portal /portal/solicitudes pero solo las propias).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import {
  getCurrentProfile,
  hasSession,
  type Profile,
} from "@/lib/supabase/auth";
import { getClients } from "@/lib/storage";
import {
  listAllRequests,
  updateRequest,
  requestStatusLabel,
} from "@/lib/requests";
import type {
  Client,
  ClientRequest,
  ClientRequestStatus,
  ClientRequestType,
} from "@/lib/types";

const TYPE_LABEL: Record<ClientRequestType, string> = {
  oferta: "Oferta",
  accion: "Acción",
  recomendacion: "Recomendación",
};

const TYPE_COLOR: Record<ClientRequestType, string> = {
  oferta: "#b04b3a",
  accion: "#9b8259",
  recomendacion: "#2f7d4f",
};

const STATUS_BG: Record<ClientRequestStatus, string> = {
  pending: "rgba(155,130,89,0.15)",
  reviewing: "rgba(196,168,130,0.18)",
  in_progress: "rgba(196,168,130,0.30)",
  done: "rgba(47,125,79,0.15)",
  rejected: "rgba(176,75,58,0.15)",
};

const STATUS_FG: Record<ClientRequestStatus, string> = {
  pending: "var(--sand-dark)",
  reviewing: "var(--sand-dark)",
  in_progress: "var(--sand-dark)",
  done: "var(--green-ok)",
  rejected: "var(--red-warn)",
};

const URGENCY_LABEL = { baja: "Baja", media: "Media", alta: "Alta" } as const;
const URGENCY_COLOR = {
  baja: "var(--text-muted)",
  media: "var(--sand-dark)",
  alta: "var(--red-warn)",
} as const;

const MONTHS_ES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];
function formatHumanDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.getDate();
  const m = d.getMonth();
  const y = d.getFullYear();
  const now = new Date().getFullYear();
  return y === now
    ? `${day} ${MONTHS_ES[m]}`
    : `${day} ${MONTHS_ES[m]} ${y}`;
}

export default function SolicitudesGlobalPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [requests, setRequests] = useState<ClientRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [filterType, setFilterType] = useState<ClientRequestType | "all">(
    "all",
  );
  const [filterStatus, setFilterStatus] = useState<
    ClientRequestStatus | "all" | "open"
  >("open");
  const [filterClient, setFilterClient] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    hasSession().then(async (has) => {
      if (!has) {
        router.replace("/");
        return;
      }
      const p = await getCurrentProfile();
      if (!active) return;
      if (!p || p.role === "client") {
        router.replace("/");
        return;
      }
      setProfile(p);
      const [reqs, cs] = await Promise.all([
        listAllRequests(),
        getClients(),
      ]);
      if (active) {
        setRequests(reqs);
        setClients(cs);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [router]);

  const refresh = useCallback(async () => {
    const r = await listAllRequests();
    setRequests(r);
  }, []);

  const clientById = useMemo(() => {
    const m = new Map<string, Client>();
    for (const c of clients) m.set(c.id, c);
    return m;
  }, [clients]);

  // Aplicar filtros.
  const filtered = useMemo(() => {
    return requests.filter((r) => {
      if (filterType !== "all" && r.type !== filterType) return false;
      if (filterClient !== "all" && r.client_id !== filterClient)
        return false;
      if (filterStatus === "all") return true;
      if (filterStatus === "open") {
        // "Abiertas" = pending / reviewing / in_progress. Excluye done/rejected.
        return ["pending", "reviewing", "in_progress"].includes(r.status);
      }
      return r.status === filterStatus;
    });
  }, [requests, filterType, filterClient, filterStatus]);

  // Stats agregados por tipo (sobre TODOS, no sobre filtered — el
  // contador refleja el inbox total).
  const counts = useMemo(() => {
    const total = requests.length;
    const open = requests.filter((r) =>
      ["pending", "reviewing", "in_progress"].includes(r.status),
    ).length;
    const recomendaciones = requests.filter(
      (r) => r.type === "recomendacion",
    ).length;
    const ofertas = requests.filter((r) => r.type === "oferta").length;
    const acciones = requests.filter((r) => r.type === "accion").length;
    return { total, open, recomendaciones, ofertas, acciones };
  }, [requests]);

  if (loading || !profile) return null;

  return (
    <>
      <Topbar showPrimary={false} />
      <main
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "32px 28px",
        }}
      >
        <div style={{ marginBottom: 24 }}>
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
            Inbox del director
          </div>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: "var(--deep-green)",
              letterSpacing: "-0.02em",
              margin: 0,
            }}
          >
            Solicitudes del cliente
          </h1>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-muted)",
              marginTop: 6,
              lineHeight: 1.5,
            }}
          >
            Todo lo que los clientes cargan desde su portal aterriza acá:
            recomendaciones sobre piezas de contenido, ofertas comerciales
            y pedidos libres. Click en una solicitud para responder y
            cambiar su estado.
          </p>
        </div>

        {/* KPIs */}
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 18,
            flexWrap: "wrap",
          }}
        >
          <Kpi label="Total" value={counts.total} />
          <Kpi label="Abiertas" value={counts.open} accent="#b04b3a" />
          <Kpi label="Recomendaciones" value={counts.recomendaciones} accent={TYPE_COLOR.recomendacion} />
          <Kpi label="Ofertas" value={counts.ofertas} accent={TYPE_COLOR.oferta} />
          <Kpi label="Acciones" value={counts.acciones} accent={TYPE_COLOR.accion} />
        </div>

        {/* Filtros */}
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontSize: 10,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "var(--sand-dark)",
              fontWeight: 700,
              marginRight: 4,
            }}
          >
            Tipo
          </span>
          {(["all", "recomendacion", "oferta", "accion"] as const).map(
            (t) => {
              const active = filterType === t;
              const label = t === "all" ? "Todas" : TYPE_LABEL[t];
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setFilterType(t)}
                  style={{
                    padding: "5px 12px",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    background: active
                      ? "var(--deep-green)"
                      : "transparent",
                    color: active ? "var(--off-white)" : "var(--deep-green)",
                    border: "1px solid rgba(10,26,12,0.15)",
                    borderRadius: 4,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {label}
                </button>
              );
            },
          )}
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontSize: 10,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "var(--sand-dark)",
              fontWeight: 700,
              marginRight: 4,
            }}
          >
            Estado
          </span>
          {(
            [
              "open",
              "all",
              "pending",
              "reviewing",
              "in_progress",
              "done",
              "rejected",
            ] as const
          ).map((s) => {
            const active = filterStatus === s;
            const label =
              s === "open"
                ? "Abiertas"
                : s === "all"
                  ? "Todas"
                  : requestStatusLabel(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => setFilterStatus(s)}
                style={{
                  padding: "5px 12px",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  background: active
                    ? "var(--deep-green)"
                    : "transparent",
                  color: active ? "var(--off-white)" : "var(--deep-green)",
                  border: "1px solid rgba(10,26,12,0.15)",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 18,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontSize: 10,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "var(--sand-dark)",
              fontWeight: 700,
              marginRight: 4,
            }}
          >
            Cliente
          </span>
          <select
            value={filterClient}
            onChange={(e) => setFilterClient(e.target.value)}
            style={{
              padding: "6px 10px",
              fontSize: 12,
              border: "1px solid rgba(10,26,12,0.15)",
              borderRadius: 4,
              fontFamily: "inherit",
              background: "var(--white)",
              color: "var(--deep-green)",
              outline: "none",
            }}
          >
            <option value="all">Todos los clientes</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Tabla */}
        <div
          style={{
            background: "var(--white)",
            border: "1px solid rgba(10,26,12,0.08)",
            borderRadius: "var(--r-lg)",
            overflow: "hidden",
          }}
        >
          {filtered.length === 0 ? (
            <div
              style={{
                padding: 48,
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: 13,
                fontStyle: "italic",
              }}
            >
              {requests.length === 0
                ? "Sin solicitudes cargadas todavía."
                : "Ninguna solicitud matchea estos filtros."}
            </div>
          ) : (
            <table
              style={{
                width: "100%",
                fontSize: 13,
                borderCollapse: "collapse",
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "var(--off-white)",
                    borderBottom: "1px solid rgba(10,26,12,0.1)",
                  }}
                >
                  <th style={th}>Cliente</th>
                  <th style={th}>Tipo</th>
                  <th style={{ ...th, minWidth: 240 }}>Título</th>
                  <th style={th}>Recibida</th>
                  <th style={th}>Urgencia</th>
                  <th style={th}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <RequestRow
                    key={r.id}
                    request={r}
                    client={clientById.get(r.client_id)}
                    expanded={expandedId === r.id}
                    onToggle={() =>
                      setExpandedId(expandedId === r.id ? null : r.id)
                    }
                    onRefresh={refresh}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </>
  );
}

function Kpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div
      style={{
        padding: "10px 16px",
        background: "var(--white)",
        border: "1px solid rgba(10,26,12,0.08)",
        borderRadius: 6,
        minWidth: 120,
      }}
    >
      <div
        style={{
          fontSize: 9,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: accent ?? "var(--deep-green)",
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function RequestRow({
  request: req,
  client,
  expanded,
  onToggle,
  onRefresh,
}: {
  request: ClientRequest;
  client: Client | undefined;
  expanded: boolean;
  onToggle: () => void;
  onRefresh: () => Promise<void>;
}) {
  const meta = (req.metadata ?? {}) as {
    post_id?: string;
    post_code?: string;
    post_idea_excerpt?: string;
    discountPct?: number;
    product?: string;
    area?: string;
    desiredDate?: string;
  };
  const [response, setResponse] = useState(req.response ?? "");
  const [updating, setUpdating] = useState(false);

  async function changeStatus(newStatus: ClientRequestStatus) {
    setUpdating(true);
    try {
      await updateRequest(req.id, {
        status: newStatus,
        response: response.trim() || null,
      });
      await onRefresh();
    } catch (e) {
      alert(`No se pudo actualizar:\n${(e as Error).message}`);
    } finally {
      setUpdating(false);
    }
  }

  async function saveResponse() {
    if (response.trim() === (req.response ?? "")) return;
    setUpdating(true);
    try {
      await updateRequest(req.id, { response: response.trim() || null });
      await onRefresh();
    } catch (e) {
      alert(`No se pudo guardar la respuesta:\n${(e as Error).message}`);
    } finally {
      setUpdating(false);
    }
  }

  return (
    <>
      <tr
        style={{
          borderBottom: "1px solid rgba(10,26,12,0.05)",
          background: expanded ? "rgba(196,168,130,0.06)" : undefined,
          cursor: "pointer",
        }}
        onClick={onToggle}
      >
        <td style={td}>
          {client?.name ?? (
            <span style={{ color: "var(--text-muted)" }}>
              (cliente eliminado)
            </span>
          )}
        </td>
        <td style={td}>
          <span
            style={{
              display: "inline-block",
              padding: "2px 8px",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              background: TYPE_COLOR[req.type],
              color: "#fff",
              borderRadius: "var(--r-pill)",
            }}
          >
            {TYPE_LABEL[req.type]}
          </span>
        </td>
        <td style={td}>
          <div style={{ fontWeight: 600 }}>
            {expanded ? "▼ " : "▶ "}
            {req.title}
          </div>
          {req.type === "recomendacion" && meta.post_code && (
            <div
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                marginTop: 2,
              }}
            >
              Sobre {meta.post_code}
            </div>
          )}
        </td>
        <td style={{ ...td, whiteSpace: "nowrap" }}>
          {formatHumanDate(req.submitted_at)}
        </td>
        <td
          style={{
            ...td,
            color: URGENCY_COLOR[req.urgency],
            fontWeight: 600,
          }}
        >
          {URGENCY_LABEL[req.urgency]}
        </td>
        <td style={td}>
          <span
            style={{
              display: "inline-block",
              padding: "2px 8px",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              background: STATUS_BG[req.status],
              color: STATUS_FG[req.status],
              borderRadius: "var(--r-pill)",
            }}
          >
            {requestStatusLabel(req.status)}
          </span>
        </td>
      </tr>
      {expanded && (
        <tr style={{ background: "var(--off-white)" }}>
          <td colSpan={6} style={{ padding: "16px 22px" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 24,
              }}
            >
              <div>
                <FieldLabel>Descripción del cliente</FieldLabel>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--deep-green)",
                    lineHeight: 1.55,
                    padding: 12,
                    background: "var(--white)",
                    borderRadius: 4,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {req.description || (
                    <span style={{ color: "var(--text-muted)" }}>
                      Sin descripción
                    </span>
                  )}
                </div>

                {/* Contexto extra según tipo */}
                {req.type === "recomendacion" && meta.post_id && client && (
                  <div style={{ marginTop: 12 }}>
                    <FieldLabel>Pieza referenciada</FieldLabel>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--deep-green)",
                        padding: 12,
                        background: "var(--white)",
                        borderRadius: 4,
                        lineHeight: 1.5,
                      }}
                    >
                      <div style={{ fontFamily: "monospace", fontWeight: 700, marginBottom: 4 }}>
                        {meta.post_code ?? "—"}
                      </div>
                      {meta.post_idea_excerpt && (
                        <div
                          style={{
                            color: "var(--text-muted)",
                            fontStyle: "italic",
                            marginBottom: 8,
                          }}
                        >
                          {meta.post_idea_excerpt}
                          {meta.post_idea_excerpt.length >= 120 ? "…" : ""}
                        </div>
                      )}
                      <Link
                        href={`/cliente/${client.id}/contenido`}
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--deep-green)",
                          textDecoration: "underline",
                          textDecorationStyle: "dotted",
                        }}
                      >
                        Abrir en Contenido →
                      </Link>
                    </div>
                  </div>
                )}

                {req.type === "oferta" && (
                  <div style={{ marginTop: 12 }}>
                    <FieldLabel>Metadata oferta</FieldLabel>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--deep-green)",
                        padding: 12,
                        background: "var(--white)",
                        borderRadius: 4,
                        lineHeight: 1.5,
                      }}
                    >
                      {meta.product && (
                        <div>
                          <strong>Producto:</strong> {meta.product}
                        </div>
                      )}
                      {meta.discountPct != null && (
                        <div>
                          <strong>Descuento:</strong> {meta.discountPct}%
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {req.type === "accion" && meta.area && (
                  <div style={{ marginTop: 12 }}>
                    <FieldLabel>Área</FieldLabel>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--deep-green)",
                        padding: 12,
                        background: "var(--white)",
                        borderRadius: 4,
                      }}
                    >
                      {meta.area}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <FieldLabel>Respuesta del equipo</FieldLabel>
                <textarea
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  onBlur={saveResponse}
                  rows={6}
                  placeholder="Lo que le respondés al cliente (lo va a ver en su portal)…"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: 13,
                    border: "1px solid rgba(10,26,12,0.15)",
                    borderRadius: 4,
                    fontFamily: "inherit",
                    background: "var(--white)",
                    color: "var(--deep-green)",
                    outline: "none",
                    resize: "vertical",
                    marginBottom: 14,
                  }}
                />

                <FieldLabel>Cambiar estado</FieldLabel>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {(
                    [
                      "pending",
                      "reviewing",
                      "in_progress",
                      "done",
                      "rejected",
                    ] as ClientRequestStatus[]
                  ).map((s) => {
                    const active = req.status === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        disabled={updating || active}
                        onClick={() => changeStatus(s)}
                        style={{
                          padding: "5px 10px",
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          background: active
                            ? STATUS_BG[s]
                            : "transparent",
                          color: STATUS_FG[s],
                          border: `1px solid ${STATUS_FG[s]}`,
                          borderRadius: 4,
                          cursor:
                            updating || active ? "default" : "pointer",
                          fontFamily: "inherit",
                          opacity: updating ? 0.5 : 1,
                        }}
                      >
                        {active && "✓ "}
                        {requestStatusLabel(s)}
                      </button>
                    );
                  })}
                </div>

                <div
                  style={{
                    marginTop: 14,
                    fontSize: 11,
                    color: "var(--text-muted)",
                    fontStyle: "italic",
                  }}
                >
                  La respuesta se guarda automáticamente al salir del
                  campo. Cambiar el estado también guarda lo que tengas
                  escrito.
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: "var(--sand-dark)",
        fontWeight: 700,
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: "10px 14px",
  textAlign: "left",
  fontSize: 10,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  fontWeight: 700,
};

const td: React.CSSProperties = {
  padding: "12px 14px",
  fontSize: 13,
  color: "var(--deep-green)",
  verticalAlign: "top",
};
