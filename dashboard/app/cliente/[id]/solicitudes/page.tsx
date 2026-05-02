"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getClient } from "@/lib/storage";
import { getCurrentProfile, type Profile } from "@/lib/supabase/auth";
import {
  listRequestsForClient,
  updateRequest,
  requestStatusLabel,
  requestStatusColor,
} from "@/lib/requests";
import { listProfiles } from "@/lib/team";
import type {
  Client,
  ClientRequest,
  ClientRequestStatus,
} from "@/lib/types";
import ui from "@/components/ClientUI.module.css";

const STATUS_OPTIONS: { value: ClientRequestStatus; label: string }[] = [
  { value: "pending", label: "Recibida" },
  { value: "reviewing", label: "En revisión" },
  { value: "in_progress", label: "En curso" },
  { value: "done", label: "Completada" },
  { value: "rejected", label: "Rechazada" },
];

export default function ClientSolicitudesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [me, setMe] = useState<Profile | null>(null);
  const [team, setTeam] = useState<Profile[]>([]);
  const [requests, setRequests] = useState<ClientRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function refresh() {
    const list = await listRequestsForClient(id);
    setRequests(list);
  }

  useEffect(() => {
    Promise.all([
      getClient(id),
      getCurrentProfile(),
      listProfiles(),
    ]).then(async ([c, p, ts]) => {
      setClient(c ?? null);
      setMe(p);
      // Solo team y director del equipo (no clients)
      setTeam(ts.filter((t) => t.role !== "client"));
      await refresh();
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading || !client || !me) return null;

  const isDirector = me.role === "director";
  const canManage = isDirector || me.role === "team";

  async function changeStatus(req: ClientRequest, status: ClientRequestStatus) {
    setBusy(req.id);
    try {
      await updateRequest(req.id, { status });
      await refresh();
    } catch (err) {
      const e = err as { message?: string };
      alert(`No se pudo cambiar el status: ${e.message ?? "error"}`);
    } finally {
      setBusy(null);
    }
  }

  async function changeAssigned(req: ClientRequest, userId: string | null) {
    setBusy(req.id);
    try {
      await updateRequest(req.id, { assigned_to: userId });
      await refresh();
    } catch (err) {
      const e = err as { message?: string };
      alert(`No se pudo asignar: ${e.message ?? "error"}`);
    } finally {
      setBusy(null);
    }
  }

  async function saveResponse(req: ClientRequest, response: string) {
    setBusy(req.id);
    try {
      await updateRequest(req.id, { response: response.trim() || null });
      await refresh();
    } catch (err) {
      const e = err as { message?: string };
      alert(`No se pudo guardar la respuesta: ${e.message ?? "error"}`);
    } finally {
      setBusy(null);
    }
  }

  const ofertas = requests.filter((r) => r.type === "oferta");
  const acciones = requests.filter((r) => r.type === "accion");
  const pending = requests.filter(
    (r) => r.status === "pending" || r.status === "reviewing",
  );

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Solicitudes del cliente</div>
          <h1>Inbox</h1>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>
            {requests.length} totales · {pending.length} pendientes de revisión
          </div>
        </div>
        <button
          className={ui.btnGhost}
          onClick={() => router.push(`/cliente/${id}`)}
        >
          ← Volver
        </button>
      </div>

      <Section
        title={`Ofertas comerciales (${ofertas.length})`}
        empty="El cliente no cargó ofertas todavía."
      >
        {ofertas.map((r) => (
          <RequestRow
            key={r.id}
            req={r}
            team={team}
            canManage={canManage}
            busy={busy === r.id}
            onChangeStatus={(s) => changeStatus(r, s)}
            onChangeAssigned={(u) => changeAssigned(r, u)}
            onSaveResponse={(t) => saveResponse(r, t)}
          />
        ))}
      </Section>

      <Section
        title={`Acciones (${acciones.length})`}
        empty="El cliente no cargó acciones todavía."
      >
        {acciones.map((r) => (
          <RequestRow
            key={r.id}
            req={r}
            team={team}
            canManage={canManage}
            busy={busy === r.id}
            onChangeStatus={(s) => changeStatus(r, s)}
            onChangeAssigned={(u) => changeAssigned(r, u)}
            onSaveResponse={(t) => saveResponse(r, t)}
          />
        ))}
      </Section>
    </>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div className={ui.panel} style={{ marginBottom: 24 }}>
      <div className={ui.panelHead}>
        <div className={ui.panelTitle}>{title}</div>
      </div>
      {hasChildren ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {children}
        </div>
      ) : (
        <div
          style={{
            padding: 24,
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: 13,
            background: "var(--off-white)",
            borderLeft: "3px solid var(--sand)",
            fontStyle: "italic",
          }}
        >
          {empty}
        </div>
      )}
    </div>
  );
}

function RequestRow({
  req,
  team,
  canManage,
  busy,
  onChangeStatus,
  onChangeAssigned,
  onSaveResponse,
}: {
  req: ClientRequest;
  team: Profile[];
  canManage: boolean;
  busy: boolean;
  onChangeStatus: (s: ClientRequestStatus) => void;
  onChangeAssigned: (userId: string | null) => void;
  onSaveResponse: (text: string) => void;
}) {
  const [responseDraft, setResponseDraft] = useState(req.response ?? "");
  const [editingResponse, setEditingResponse] = useState(false);

  return (
    <div
      style={{
        padding: 18,
        background: "var(--white)",
        border: "1px solid rgba(10,26,12,0.08)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 12,
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
            {req.title}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Enviada el{" "}
            {new Date(req.submitted_at).toLocaleDateString("es-AR", {
              day: "2-digit",
              month: "long",
              hour: "2-digit",
              minute: "2-digit",
            })}
            {req.urgency === "alta" && (
              <span
                style={{
                  marginLeft: 8,
                  color: "var(--red-warn)",
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                }}
              >
                · URGENTE
              </span>
            )}
          </div>
        </div>
        <div
          style={{
            padding: "5px 12px",
            background: requestStatusColor(req.status),
            color: "var(--white)",
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            fontWeight: 700,
            flexShrink: 0,
            alignSelf: "flex-start",
          }}
        >
          {requestStatusLabel(req.status)}
        </div>
      </div>

      {req.description && (
        <div
          style={{
            fontSize: 13,
            color: "var(--deep-green)",
            lineHeight: 1.6,
            marginBottom: 12,
            whiteSpace: "pre-wrap",
          }}
        >
          {req.description}
        </div>
      )}

      {/* Metadata */}
      {Object.keys(req.metadata).length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 10,
            padding: 12,
            background: "var(--off-white)",
            marginBottom: 14,
          }}
        >
          {Object.entries(req.metadata).map(([k, v]) => {
            if (v == null || v === "") return null;
            return (
              <div key={k}>
                <div
                  style={{
                    fontSize: 9,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "var(--sand-dark)",
                    fontWeight: 600,
                    marginBottom: 2,
                  }}
                >
                  {k}
                </div>
                <div style={{ fontSize: 12, color: "var(--deep-green)" }}>
                  {String(v)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Controles del equipo/director */}
      {canManage && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            paddingTop: 14,
            borderTop: "1px solid rgba(10,26,12,0.06)",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 9,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--sand-dark)",
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              Status
            </div>
            <select
              value={req.status}
              onChange={(e) =>
                onChangeStatus(e.target.value as ClientRequestStatus)
              }
              disabled={busy}
              style={{
                width: "100%",
                background: "var(--ivory)",
                border: "1px solid rgba(10,26,12,0.12)",
                padding: "8px 10px",
                fontSize: 13,
                fontFamily: "inherit",
                color: "var(--deep-green)",
              }}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div
              style={{
                fontSize: 9,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--sand-dark)",
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              Asignado a
            </div>
            <select
              value={req.assigned_to ?? ""}
              onChange={(e) => onChangeAssigned(e.target.value || null)}
              disabled={busy}
              style={{
                width: "100%",
                background: "var(--ivory)",
                border: "1px solid rgba(10,26,12,0.12)",
                padding: "8px 10px",
                fontSize: 13,
                fontFamily: "inherit",
                color: "var(--deep-green)",
              }}
            >
              <option value="">— sin asignar —</option>
              {team.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                  {u.position ? ` · ${u.position}` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Respuesta al cliente */}
      {canManage && (
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              fontSize: 9,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--sand-dark)",
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            Respuesta para el cliente
          </div>
          {editingResponse ? (
            <>
              <textarea
                value={responseDraft}
                onChange={(e) => setResponseDraft(e.target.value)}
                rows={3}
                placeholder="Lo que el cliente va a ver en su portal."
                style={{
                  width: "100%",
                  background: "var(--ivory)",
                  border: "1px solid rgba(10,26,12,0.12)",
                  padding: 10,
                  fontSize: 13,
                  fontFamily: "inherit",
                  color: "var(--deep-green)",
                  resize: "vertical",
                  marginBottom: 8,
                }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className={ui.btnSolid}
                  onClick={() => {
                    onSaveResponse(responseDraft);
                    setEditingResponse(false);
                  }}
                  disabled={busy}
                >
                  Guardar
                </button>
                <button
                  className={ui.btnGhost}
                  onClick={() => {
                    setResponseDraft(req.response ?? "");
                    setEditingResponse(false);
                  }}
                >
                  Cancelar
                </button>
              </div>
            </>
          ) : req.response ? (
            <div
              style={{
                padding: 12,
                background: "rgba(58,139,92,0.06)",
                borderLeft: "3px solid var(--green-ok)",
                fontSize: 13,
                color: "var(--deep-green)",
                whiteSpace: "pre-wrap",
                marginBottom: 8,
              }}
            >
              {req.response}
              <div style={{ marginTop: 8 }}>
                <button
                  className={ui.btnGhost}
                  style={{ fontSize: 11 }}
                  onClick={() => setEditingResponse(true)}
                  disabled={busy}
                >
                  Editar
                </button>
              </div>
            </div>
          ) : (
            <button
              className={ui.btnGhost}
              onClick={() => setEditingResponse(true)}
              style={{ fontSize: 12 }}
            >
              + Agregar respuesta
            </button>
          )}
        </div>
      )}
    </div>
  );
}
