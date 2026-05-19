"use client";

/**
 * RequestBox — caja de pedidos del miembro del equipo al director.
 *
 * Cuatro tipos: ausencia, licencia, proyecto de innovación, otro.
 * El miembro carga el pedido; el director lo aprueba/rechaza/responde.
 *
 * Modos:
 *   - "self": el miembro ve sus propios pedidos y puede crear nuevos.
 *   - "review": el director ve los pedidos de OTRO miembro y puede
 *     resolverlos.
 *
 * Lectura RLS: cada uno ve los propios; director ve todos.
 */

import { useEffect, useState } from "react";
import {
  createMyRequest,
  deleteRequest,
  listMyRequests,
  resolveRequest,
  TEAM_REQUEST_LABELS,
  TEAM_REQUEST_STATUS_LABELS,
  type TeamRequest,
  type TeamRequestKind,
  type TeamRequestStatus,
} from "@/lib/team-requests";
import { getSupabase } from "@/lib/supabase/client";

interface Props {
  /** ID del miembro cuyas requests miramos. Si === user actual,
   *  modo "self" (puede crear). Si != user actual y soy director,
   *  modo "review" (puedo resolver). */
  userId: string;
  isSelf: boolean;
  isDirector: boolean;
}

export default function RequestBox({ userId, isSelf, isDirector }: Props) {
  const [requests, setRequests] = useState<TeamRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      // Si soy self: listMyRequests filtra por user_id=auth.uid().
      // Si soy director viendo a otro: usamos fetch directo
      // (listAllRequests + filter) o listMyRequests no sirve.
      if (isSelf) {
        setRequests(await listMyRequests());
      } else {
        // Fetch los del user específico
        const supabase = getSupabase();
        const { data, error } = await supabase
          .from("team_requests")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });
        if (error) {
          console.error("requests fetch:", error);
          setRequests([]);
        } else {
          setRequests((data ?? []) as TeamRequest[]);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isSelf]);

  return (
    <div
      style={{
        marginTop: 24,
        background: "var(--white)",
        border: "1px solid rgba(10,26,12,0.08)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 20px",
          borderBottom: "1px solid rgba(10,26,12,0.06)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
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
            {isSelf ? "Tus pedidos" : "Pedidos del miembro"}
          </div>
          <div
            style={{
              fontSize: 13,
              color: "var(--text-muted)",
              marginTop: 4,
            }}
          >
            {requests.length} en total
          </div>
        </div>
        {isSelf && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            style={{
              background: "var(--deep-green)",
              color: "var(--off-white)",
              border: "none",
              padding: "8px 14px",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              letterSpacing: "0.05em",
            }}
          >
            + Nuevo pedido
          </button>
        )}
      </div>

      <div style={{ padding: 20 }}>
        {isSelf && showForm && (
          <NewRequestForm
            onCreated={() => {
              setShowForm(false);
              refresh();
            }}
            onCancel={() => setShowForm(false)}
          />
        )}

        {loading && (
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Cargando…
          </div>
        )}

        {!loading && requests.length === 0 && !showForm && (
          <div
            style={{
              padding: 20,
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: 13,
              fontStyle: "italic",
            }}
          >
            {isSelf
              ? "Sin pedidos cargados todavía. Usá el botón de arriba."
              : "Este miembro no cargó ningún pedido."}
          </div>
        )}

        {!loading && requests.length > 0 && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: 10 }}
          >
            {requests.map((r) => (
              <RequestItem
                key={r.id}
                req={r}
                isSelf={isSelf}
                isDirector={isDirector}
                onChange={refresh}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// NewRequestForm
// ============================================================
function NewRequestForm({
  onCreated,
  onCancel,
}: {
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<TeamRequestKind>("ausencia");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [saving, setSaving] = useState(false);

  // Para ausencia/licencia mostramos fechas. Para innovación/otro no.
  const needsDates = kind === "ausencia" || kind === "licencia";

  async function submit() {
    if (!title.trim()) {
      alert("El título es obligatorio.");
      return;
    }
    if (needsDates && (!start || !end)) {
      alert("Para ausencia/licencia tenés que indicar desde y hasta.");
      return;
    }
    setSaving(true);
    try {
      await createMyRequest({
        kind,
        title: title.trim(),
        description: description.trim() || null,
        start_date: needsDates ? start : null,
        end_date: needsDates ? end : null,
      });
      onCreated();
    } catch (err) {
      const e = err as Error;
      alert(`No se pudo crear el pedido:\n${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        padding: 16,
        background: "var(--ivory)",
        marginBottom: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--sand-dark)",
          fontWeight: 700,
        }}
      >
        Nuevo pedido
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as TeamRequestKind)}
          style={{ ...inputStyle, flex: 1 }}
        >
          {(Object.keys(TEAM_REQUEST_LABELS) as TeamRequestKind[]).map((k) => (
            <option key={k} value={k}>
              {TEAM_REQUEST_LABELS[k]}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Título corto"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ ...inputStyle, flex: 2 }}
        />
      </div>

      {needsDates && (
        <div style={{ display: "flex", gap: 10 }}>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
          />
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
          />
        </div>
      )}

      <textarea
        placeholder={
          kind === "innovacion"
            ? "Contá tu idea con detalle: qué problema resuelve, qué necesitás del equipo, timeline tentativo."
            : "Detalles del pedido"
        }
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
      />

      <div
        style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
      >
        <button
          onClick={onCancel}
          disabled={saving}
          style={ghostBtn}
        >
          Cancelar
        </button>
        <button
          onClick={submit}
          disabled={saving}
          style={solidBtn}
        >
          {saving ? "Enviando…" : "Enviar pedido"}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// RequestItem — fila individual con acciones contextuales
// ============================================================
function RequestItem({
  req,
  isSelf,
  isDirector,
  onChange,
}: {
  req: TeamRequest;
  isSelf: boolean;
  isDirector: boolean;
  onChange: () => void;
}) {
  const [resolving, setResolving] = useState(false);
  const [response, setResponse] = useState("");

  const statusColor: Record<TeamRequestStatus, string> = {
    pending: "var(--red-warn)",
    in_review: "var(--sand-dark)",
    approved: "var(--green-ok)",
    rejected: "var(--text-muted)",
  };

  async function resolve(status: TeamRequestStatus) {
    if (!confirm(`¿Marcar como "${TEAM_REQUEST_STATUS_LABELS[status]}"?`)) return;
    setResolving(true);
    try {
      await resolveRequest(req.id, {
        status,
        director_response: response.trim() || null,
      });
      setResponse("");
      onChange();
    } catch (err) {
      const e = err as Error;
      alert(`Error: ${e.message}`);
    } finally {
      setResolving(false);
    }
  }

  async function cancel() {
    if (!confirm("¿Cancelar este pedido?")) return;
    try {
      await deleteRequest(req.id);
      onChange();
    } catch (err) {
      const e = err as Error;
      alert(`Error: ${e.message}`);
    }
  }

  return (
    <div
      style={{
        padding: 14,
        background: "var(--off-white)",
        borderLeft: `3px solid ${statusColor[req.status]}`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 4,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: 9,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: "var(--sand-dark)",
                fontWeight: 700,
              }}
            >
              {TEAM_REQUEST_LABELS[req.kind]}
            </span>
            <span
              style={{
                fontSize: 9,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: statusColor[req.status],
                fontWeight: 700,
              }}
            >
              · {TEAM_REQUEST_STATUS_LABELS[req.status]}
            </span>
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--deep-green)",
              marginBottom: 4,
            }}
          >
            {req.title}
          </div>
          {(req.start_date || req.end_date) && (
            <div
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                marginBottom: 6,
              }}
            >
              {req.start_date} → {req.end_date}
            </div>
          )}
          {req.description && (
            <div
              style={{
                fontSize: 12.5,
                color: "var(--text-soft, #5a6a5e)",
                lineHeight: 1.5,
                marginTop: 4,
                whiteSpace: "pre-wrap",
              }}
            >
              {req.description}
            </div>
          )}
          {req.director_response && (
            <div
              style={{
                marginTop: 10,
                padding: "8px 12px",
                background: "var(--white)",
                borderLeft: "2px solid var(--sand)",
                fontSize: 12,
                color: "var(--deep-green)",
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
              }}
            >
              <strong
                style={{
                  fontSize: 9,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  color: "var(--sand-dark)",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Respuesta del director
              </strong>
              {req.director_response}
            </div>
          )}
        </div>

        <div
          style={{
            fontSize: 10,
            color: "var(--text-muted)",
            whiteSpace: "nowrap",
          }}
        >
          {new Date(req.created_at).toLocaleDateString("es-AR", {
            day: "numeric",
            month: "short",
          })}
        </div>
      </div>

      {/* Acciones */}
      {isSelf && req.status === "pending" && (
        <div style={{ marginTop: 10 }}>
          <button onClick={cancel} style={ghostBtn}>
            Cancelar pedido
          </button>
        </div>
      )}

      {isDirector &&
        !isSelf &&
        (req.status === "pending" || req.status === "in_review") && (
          <div
            style={{
              marginTop: 12,
              padding: 10,
              background: "var(--white)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <textarea
              placeholder="Respuesta opcional para el miembro"
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              style={{ ...inputStyle, minHeight: 50, resize: "vertical" }}
              disabled={resolving}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => resolve("rejected")}
                disabled={resolving}
                style={{
                  ...ghostBtn,
                  color: "var(--red-warn)",
                  borderColor: "rgba(176,75,58,0.3)",
                }}
              >
                Rechazar
              </button>
              <button
                onClick={() => resolve("in_review")}
                disabled={resolving}
                style={ghostBtn}
              >
                En revisión
              </button>
              <button
                onClick={() => resolve("approved")}
                disabled={resolving}
                style={{
                  ...solidBtn,
                  background: "var(--green-ok)",
                }}
              >
                Aprobar
              </button>
            </div>
          </div>
        )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid rgba(10,26,12,0.15)",
  background: "var(--white)",
  color: "var(--deep-green)",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
};

const solidBtn: React.CSSProperties = {
  background: "var(--deep-green)",
  color: "var(--off-white)",
  border: "none",
  padding: "8px 14px",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
  letterSpacing: "0.05em",
};

const ghostBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid rgba(10,26,12,0.15)",
  color: "var(--deep-green)",
  padding: "8px 14px",
  fontSize: 11,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "inherit",
};
