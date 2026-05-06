"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Topbar from "@/components/Topbar";
import { getCurrentProfile, hasSession } from "@/lib/supabase/auth";
import { getSupabase } from "@/lib/supabase/client";

interface AuditLogRow {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const ACTIONS = [
  "team.invite",
  "team.update",
  "team.assign",
  "team.unassign",
  "client.create",
  "client.delete",
  "client.update",
  "phase.generate",
  "phase.approve",
  "phase.request_changes",
  "request.update",
  "agent.dispatch",
  "kpis.update",
  "payroll.generate",
];

export default function AuditLogPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState<string>("");
  const [filterActor, setFilterActor] = useState("");

  useEffect(() => {
    hasSession().then(async (has) => {
      if (!has) {
        router.replace("/");
        return;
      }
      const profile = await getCurrentProfile();
      if (!profile || profile.role !== "director") {
        router.replace(profile?.role === "client" ? "/portal" : "/hub");
        return;
      }
      setAuthChecked(true);

      const supabase = getSupabase();
      const { data } = await supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      setLogs((data ?? []) as AuditLogRow[]);
      setLoading(false);
    });
  }, [router]);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (filterAction && l.action !== filterAction) return false;
      if (
        filterActor &&
        !(l.actor_email ?? "").toLowerCase().includes(filterActor.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [logs, filterAction, filterActor]);

  if (!authChecked) return null;

  return (
    <>
      <Topbar />
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
              Configuración · Audit log
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
              Historial de acciones
            </h1>
            <p
              style={{
                marginTop: 14,
                fontSize: 13,
                color: "var(--text-muted)",
              }}
            >
              Últimas 200 acciones sensibles del sistema. Solo el director ve
              esta vista.
            </p>
          </div>
        </div>

        {/* Filtros */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr auto",
            gap: 12,
            marginBottom: 24,
          }}
        >
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            style={{
              padding: "10px 14px",
              border: "1px solid rgba(10,26,12,0.15)",
              background: "var(--white)",
              fontSize: 13,
              fontFamily: "inherit",
            }}
          >
            <option value="">Todas las acciones</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={filterActor}
            onChange={(e) => setFilterActor(e.target.value)}
            placeholder="Filtrar por email del actor"
            style={{
              padding: "10px 14px",
              border: "1px solid rgba(10,26,12,0.15)",
              background: "var(--white)",
              fontSize: 13,
              fontFamily: "inherit",
            }}
          />
          <button
            onClick={() => {
              setFilterAction("");
              setFilterActor("");
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

        {/* Tabla */}
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
              Sin registros
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
              {logs.length === 0
                ? "Todavía no hay acciones registradas."
                : "Ningún registro coincide con los filtros."}
            </div>
          </div>
        ) : (
          <div
            style={{
              border: "1px solid rgba(10,26,12,0.08)",
              background: "var(--white)",
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr
                  style={{
                    background: "var(--off-white)",
                    fontSize: 10,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "var(--sand-dark)",
                    fontWeight: 600,
                    textAlign: "left",
                  }}
                >
                  <th style={{ padding: "12px 16px" }}>Cuándo</th>
                  <th style={{ padding: "12px 16px" }}>Actor</th>
                  <th style={{ padding: "12px 16px" }}>Acción</th>
                  <th style={{ padding: "12px 16px" }}>Target</th>
                  <th style={{ padding: "12px 16px" }}>Detalles</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <tr
                    key={l.id}
                    style={{
                      borderTop: "1px solid rgba(10,26,12,0.06)",
                      fontSize: 13,
                    }}
                  >
                    <td
                      style={{
                        padding: "12px 16px",
                        color: "var(--text-muted)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {new Date(l.created_at).toLocaleString("es-UY", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      {l.actor_email ?? (
                        <em style={{ color: "var(--text-muted)" }}>sistema</em>
                      )}
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        fontFamily: "monospace",
                        fontSize: 12,
                      }}
                    >
                      {l.action}
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        fontFamily: "monospace",
                        fontSize: 12,
                        color: "var(--text-muted)",
                      }}
                    >
                      {l.target_type
                        ? `${l.target_type}:${l.target_id ?? "—"}`
                        : "—"}
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        fontFamily: "monospace",
                        fontSize: 11,
                        color: "var(--text-muted)",
                        maxWidth: 360,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={JSON.stringify(l.metadata ?? {})}
                    >
                      {l.metadata && Object.keys(l.metadata).length > 0
                        ? JSON.stringify(l.metadata)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
          Para ver registros más antiguos, consultá la tabla{" "}
          <code>audit_log</code> directamente en Supabase.
        </div>
      </main>
    </>
  );
}
