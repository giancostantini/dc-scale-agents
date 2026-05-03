"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Topbar from "@/components/Topbar";
import {
  getCurrentProfile,
  hasSession,
  isDirector,
  isTeam,
  type Profile,
} from "@/lib/supabase/auth";
import { getSupabase } from "@/lib/supabase/client";
import { getClients } from "@/lib/storage";
import type { ClientRequest, Client } from "@/lib/types";

type StatusFilter = "all" | "pending" | "reviewing" | "in_progress" | "done" | "rejected";
type UrgencyFilter = "all" | "alta" | "media" | "baja";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  reviewing: "En revisión",
  in_progress: "En curso",
  done: "Completada",
  rejected: "Rechazada",
};

const URGENCY_COLORS: Record<string, string> = {
  alta: "var(--red-warn)",
  media: "var(--yellow-warn)",
  baja: "var(--text-muted)",
};

export default function TareasPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialFilter = searchParams.get("filter") as StatusFilter | null;

  const [authChecked, setAuthChecked] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [requests, setRequests] = useState<ClientRequest[]>([]);
  const [clients, setClients] = useState<Map<string, Client>>(new Map());
  const [loading, setLoading] = useState(true);

  // Filtros
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    initialFilter ?? "all",
  );
  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyFilter>("all");
  const [clientFilter, setClientFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<"all" | "oferta" | "accion">(
    "all",
  );

  useEffect(() => {
    hasSession().then(async (has) => {
      if (!has) {
        router.replace("/");
        return;
      }
      const p = await getCurrentProfile();
      if (!p) {
        router.replace("/");
        return;
      }
      if (p.role === "client") {
        // Los clients no tienen vista de tareas; los redirigimos al portal
        router.replace("/portal");
        return;
      }
      setProfile(p);
      setAuthChecked(true);

      const [{ data }, clientList] = await Promise.all([
        getSupabase()
          .from("client_requests")
          .select("*")
          .order("submitted_at", { ascending: false }),
        getClients(),
      ]);

      setRequests((data ?? []) as ClientRequest[]);
      setClients(new Map(clientList.map((c) => [c.id, c])));
      setLoading(false);
    });
  }, [router]);

  const filtered = useMemo(() => {
    if (!profile) return [];
    return requests.filter((r) => {
      // Para team: solo las que tiene asignadas
      if (isTeam(profile) && r.assigned_to !== profile.id) return false;
      // Para director: ve todas (las pending sin asignar también)
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (urgencyFilter !== "all" && r.urgency !== urgencyFilter) return false;
      if (clientFilter && r.client_id !== clientFilter) return false;
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      return true;
    });
  }, [requests, profile, statusFilter, urgencyFilter, clientFilter, typeFilter]);

  // Para director: contar solicitudes pendientes de asignar (banner arriba)
  const pendingUnassigned = useMemo(() => {
    if (!isDirector(profile)) return 0;
    return requests.filter(
      (r) => r.status === "pending" && !r.assigned_to,
    ).length;
  }, [requests, profile]);

  if (!authChecked) return null;

  return (
    <>
      <Topbar showPrimary={false} />
      <main
        style={{
          padding: "60px 40px 80px",
          maxWidth: 1400,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            marginBottom: 32,
            paddingBottom: 24,
            borderBottom: "1px solid rgba(10,26,12,0.1)",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.25em",
                textTransform: "uppercase",
                color: "var(--sand-dark)",
                fontWeight: 500,
                marginBottom: 14,
              }}
            >
              Tu lista de tareas
            </div>
            <h1
              style={{
                fontSize: 40,
                fontWeight: 700,
                letterSpacing: "-0.03em",
                lineHeight: 1,
                color: "var(--deep-green)",
              }}
            >
              Mis tareas
            </h1>
            <p
              style={{
                marginTop: 14,
                fontSize: 13,
                color: "var(--text-muted)",
              }}
            >
              {isDirector(profile)
                ? "Todas las solicitudes del sistema. Asigná las pendientes a tu equipo."
                : "Solicitudes que tenés asignadas. Click en cualquiera para abrirla."}
            </p>
          </div>
        </div>

        {/* Banner de pending sin asignar (director) */}
        {pendingUnassigned > 0 && isDirector(profile) && (
          <div
            style={{
              padding: 16,
              background: "rgba(201, 161, 74, 0.12)",
              borderLeft: "3px solid var(--yellow-warn)",
              fontSize: 13,
              marginBottom: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <div>
              <strong style={{ color: "var(--yellow-warn)" }}>
                {pendingUnassigned} solicitud{pendingUnassigned === 1 ? "" : "es"}
              </strong>{" "}
              pendiente{pendingUnassigned === 1 ? "" : "s"} de asignar.
            </div>
            <button
              onClick={() => {
                setStatusFilter("pending");
              }}
              style={{
                padding: "8px 14px",
                background: "var(--yellow-warn)",
                color: "var(--white)",
                border: "none",
                fontSize: 11,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Filtrar pendientes →
            </button>
          </div>
        )}

        {/* Filtros */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr 1fr auto",
            gap: 12,
            marginBottom: 24,
          }}
        >
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            style={selectStyle}
          >
            <option value="all">Todos los estados</option>
            <option value="pending">Pendiente</option>
            <option value="reviewing">En revisión</option>
            <option value="in_progress">En curso</option>
            <option value="done">Completada</option>
            <option value="rejected">Rechazada</option>
          </select>
          <select
            value={urgencyFilter}
            onChange={(e) => setUrgencyFilter(e.target.value as UrgencyFilter)}
            style={selectStyle}
          >
            <option value="all">Toda urgencia</option>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </select>
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            style={selectStyle}
          >
            <option value="">Todos los clientes</option>
            {Array.from(clients.values()).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(e) =>
              setTypeFilter(e.target.value as "all" | "oferta" | "accion")
            }
            style={selectStyle}
          >
            <option value="all">Todos los tipos</option>
            <option value="oferta">Ofertas</option>
            <option value="accion">Acciones</option>
          </select>
          <button
            onClick={() => {
              setStatusFilter("all");
              setUrgencyFilter("all");
              setClientFilter("");
              setTypeFilter("all");
            }}
            style={{
              padding: "10px 16px",
              background: "transparent",
              border: "1px solid rgba(10,26,12,0.15)",
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              fontWeight: 600,
              color: "var(--text-muted)",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Limpiar
          </button>
        </div>

        {/* Listado */}
        {loading ? (
          <div
            style={{
              padding: 40,
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: 13,
            }}
          >
            Cargando…
          </div>
        ) : filtered.length === 0 ? (
          <div
            style={{
              border: "1px dashed rgba(10,26,12,0.15)",
              padding: 48,
              textAlign: "center",
              background: "var(--white)",
            }}
          >
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: "var(--deep-green)",
                marginBottom: 6,
              }}
            >
              Sin tareas que mostrar
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
              {requests.length === 0
                ? isTeam(profile)
                  ? "El director no te asignó solicitudes todavía."
                  : "Todavía no hay solicitudes en el sistema."
                : "Ningún registro coincide con los filtros activos."}
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: 12,
            }}
          >
            {filtered.map((r) => {
              const client = clients.get(r.client_id);
              return (
                <Link
                  key={r.id}
                  href={`/cliente/${r.client_id}/solicitudes`}
                  style={{
                    display: "block",
                    padding: 20,
                    background: "var(--white)",
                    border: "1px solid rgba(10,26,12,0.08)",
                    textDecoration: "none",
                    color: "inherit",
                    transition: "border-color 0.15s",
                  }}
                  className="hover-card"
                >
                  <div
                    style={{
                      display: "flex",
                      gap: 16,
                      alignItems: "flex-start",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          gap: 10,
                          alignItems: "center",
                          marginBottom: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 10,
                            letterSpacing: "0.15em",
                            textTransform: "uppercase",
                            fontWeight: 600,
                            color: "var(--sand-dark)",
                          }}
                        >
                          {client?.name ?? r.client_id}
                        </span>
                        <span
                          style={{
                            fontSize: 9,
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            fontWeight: 700,
                            padding: "2px 8px",
                            background: URGENCY_COLORS[r.urgency] ?? "var(--text-muted)",
                            color: "var(--white)",
                          }}
                        >
                          {r.urgency}
                        </span>
                        <span
                          style={{
                            fontSize: 10,
                            letterSpacing: "0.08em",
                            color: "var(--text-muted)",
                          }}
                        >
                          {r.type === "oferta" ? "💼 Oferta" : "💡 Acción"}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: 16,
                          fontWeight: 600,
                          color: "var(--deep-green)",
                          marginBottom: 6,
                        }}
                      >
                        {r.title}
                      </div>
                      {r.description && (
                        <div
                          style={{
                            fontSize: 13,
                            color: "var(--text-muted)",
                            lineHeight: 1.5,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {r.description}
                        </div>
                      )}
                    </div>
                    <div
                      style={{
                        flexShrink: 0,
                        textAlign: "right",
                      }}
                    >
                      <div
                        style={{
                          padding: "4px 10px",
                          background: statusBgColor(r.status),
                          color: statusFgColor(r.status),
                          fontSize: 10,
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                          fontWeight: 700,
                          display: "inline-block",
                        }}
                      >
                        {STATUS_LABELS[r.status] ?? r.status}
                      </div>
                      <div
                        style={{
                          marginTop: 8,
                          fontSize: 11,
                          color: "var(--text-muted)",
                        }}
                      >
                        {new Date(r.submitted_at).toLocaleDateString("es-UY", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <div
          style={{
            marginTop: 32,
            fontSize: 11,
            color: "var(--text-muted)",
            letterSpacing: "0.05em",
          }}
        >
          Total visible: {filtered.length} de {requests.length}
        </div>
      </main>
    </>
  );
}

const selectStyle: React.CSSProperties = {
  padding: "10px 14px",
  border: "1px solid rgba(10,26,12,0.15)",
  background: "var(--white)",
  fontSize: 13,
  fontFamily: "inherit",
};

function statusBgColor(status: string): string {
  switch (status) {
    case "pending":
      return "rgba(201,161,74,0.15)";
    case "reviewing":
      return "rgba(196,168,130,0.15)";
    case "in_progress":
      return "rgba(74,124,89,0.15)";
    case "done":
      return "rgba(58,139,92,0.18)";
    case "rejected":
      return "rgba(176,75,58,0.15)";
    default:
      return "var(--off-white)";
  }
}

function statusFgColor(status: string): string {
  switch (status) {
    case "pending":
      return "var(--yellow-warn)";
    case "reviewing":
      return "var(--sand-dark)";
    case "in_progress":
      return "var(--green-ok)";
    case "done":
      return "var(--green-ok)";
    case "rejected":
      return "var(--red-warn)";
    default:
      return "var(--text-muted)";
  }
}
