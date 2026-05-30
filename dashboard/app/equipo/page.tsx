"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import InviteUserModal from "@/components/InviteUserModal";
import {
  getCurrentProfile,
  hasSession,
  type Profile,
  type ClientAssignment,
} from "@/lib/supabase/auth";
import { listProfiles, listAllAssignments, updateProfile } from "@/lib/team";
import { getSupabase } from "@/lib/supabase/client";
import styles from "./equipo.module.css";

export default function EquipoPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [me, setMe] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [assignments, setAssignments] = useState<ClientAssignment[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    const [list, asg] = await Promise.all([
      listProfiles(),
      listAllAssignments(),
    ]);
    // /equipo es la vista del "equipo de la agencia" — director y team only.
    // Los clientes del portal NO se muestran acá (se gestionan desde
    // ClientSidebar de cada cliente). Esto evita confusión cuando el
    // director ve un usuario tipo "client" en el listado de equipo.
    setProfiles(list.filter((p) => p.role !== "client"));
    setAssignments(asg);
  }

  useEffect(() => {
    hasSession().then(async (has) => {
      if (!has) {
        router.replace("/");
        return;
      }
      setAuthChecked(true);
      const p = await getCurrentProfile();
      setMe(p);
      refresh();
    });
  }, [router]);

  if (!authChecked || !me) return null;

  const isDirector = me.role === "director";

  async function changeRole(
    profile: Profile,
    newRole: "director" | "team",
  ) {
    if (busyId) return;
    if (profile.role === newRole) return;
    if (newRole === "team" && profile.role === "director") {
      const remaining = profiles.filter(
        (p) => p.role === "director" && p.id !== profile.id,
      ).length;
      if (remaining === 0) {
        alert(
          "No se puede degradar al último director. Promové primero a otra persona.",
        );
        return;
      }
    }
    if (
      !confirm(
        `¿Cambiar el rol de ${profile.name} a ${
          newRole === "director" ? "Director" : "Equipo"
        }?`,
      )
    ) {
      return;
    }
    setBusyId(profile.id);
    try {
      await updateProfile(profile.id, { role: newRole });
      await refresh();
    } catch (err) {
      const e = err as { message?: string };
      alert(`No se pudo cambiar el rol.\n${e.message ?? ""}`);
    } finally {
      setBusyId(null);
    }
  }

  async function deleteMember(profile: Profile) {
    if (busyId) return;
    if (profile.id === me?.id) {
      alert("No te podés eliminar a vos mismo.");
      return;
    }
    if (profile.role === "director") {
      const remaining = profiles.filter(
        (p) => p.role === "director" && p.id !== profile.id,
      ).length;
      if (remaining === 0) {
        alert(
          "No se puede eliminar al último director. Promové a otra persona primero.",
        );
        return;
      }
    }
    if (
      !confirm(
        `¿Eliminar a ${profile.name} del equipo?\n\n` +
          `Esto borra su acceso al sistema, sus asignaciones a clientes y todo su historial. ` +
          `Esta acción NO se puede deshacer.`,
      )
    ) {
      return;
    }
    const typed = window.prompt(
      `Para confirmar, tipeá el nombre exacto:\n\n${profile.name}`,
    );
    if (typed === null) return;
    if (typed.trim() !== profile.name) {
      alert("El nombre no coincide. Eliminación cancelada.");
      return;
    }
    setBusyId(profile.id);
    try {
      const supabase = getSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        alert("Sesión expirada. Volvé a entrar.");
        return;
      }
      const res = await fetch("/api/team/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: profile.id }),
      });
      if (!res.ok) {
        const body = await res
          .json()
          .catch(() => ({} as { error?: string; detail?: string; cleanupFailures?: unknown[] }));
        const parts = [
          body.error ?? `${res.status} ${res.statusText}`,
          body.detail,
        ].filter(Boolean);
        if (body.cleanupFailures && Array.isArray(body.cleanupFailures)) {
          parts.push(
            `Tablas con problema: ${(body.cleanupFailures as Array<{ table?: string }>)
              .map((f) => f.table)
              .filter(Boolean)
              .join(", ")}`,
          );
        }
        throw new Error(parts.join(" — "));
      }
      await refresh();
    } catch (err) {
      const e = err as { message?: string };
      alert(`No se pudo eliminar al miembro.\n${e.message ?? ""}`);
    } finally {
      setBusyId(null);
    }
  }

  // count assignments per user
  const countByUser: Record<string, number> = {};
  for (const a of assignments) {
    countByUser[a.user_id] = (countByUser[a.user_id] ?? 0) + 1;
  }

  return (
    <>
      <Topbar showPrimary={false} />

      <main className={styles.wrap}>
        <div className={styles.head}>
          <div>
            <div className={styles.eyebrow}>Equipo</div>
            <h1>Miembros del equipo</h1>
            <div className={styles.sub}>
              {profiles.length} {profiles.length === 1 ? "persona" : "personas"}{" "}
              · {profiles.filter((p) => p.role === "director").length}{" "}
              director(es)
            </div>
          </div>
          <div className={styles.actions}>
            <Link href="/perfil" className={styles.btnGhost}>
              Mi perfil
            </Link>
            {isDirector && (
              <button
                className={styles.btnSolid}
                onClick={() => setInviteOpen(true)}
              >
                + Invitar persona
              </button>
            )}
          </div>
        </div>

        {!isDirector && (
          <div className={styles.banner}>
            Visualizás el equipo en modo lectura. Para modificar pagos,
            asignaciones o invitar gente, hablá con un director.
          </div>
        )}

        <div className={styles.list}>
          {profiles.map((p) => {
            const isMe = p.id === me.id;
            const linkHref = isDirector || isMe ? `/equipo/${p.id}` : `/perfil`;
            const rowBusy = busyId === p.id;
            return (
              <div
                key={p.id}
                className={styles.row}
                style={rowBusy ? { opacity: 0.5, pointerEvents: "none" } : undefined}
              >
                <Link
                  href={linkHref}
                  className={styles.avatar}
                  style={{ textDecoration: "none" }}
                >
                  {p.initials || "??"}
                </Link>
                <Link
                  href={linkHref}
                  className={styles.info}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <div className={styles.name}>
                    {p.name}
                    {isMe && <span className={styles.youTag}>Vos</span>}
                  </div>
                  <div className={styles.email}>{p.email}</div>
                </Link>
                <div className={styles.position}>{p.position || "—"}</div>
                <div className={styles.roleCol}>
                  {isDirector && !isMe ? (
                    <select
                      value={p.role}
                      onChange={(e) =>
                        changeRole(p, e.target.value as "director" | "team")
                      }
                      disabled={rowBusy}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        fontSize: 11,
                        padding: "4px 8px",
                        border: "1px solid rgba(10,26,12,0.15)",
                        borderRadius: 6,
                        cursor: "pointer",
                        background: "var(--white)",
                        fontFamily: "inherit",
                        fontWeight: 600,
                        letterSpacing: "0.04em",
                        color:
                          p.role === "director"
                            ? "var(--deep-green)"
                            : "var(--text-muted)",
                      }}
                      title="Cambiar rol"
                    >
                      <option value="director">Director</option>
                      <option value="team">Equipo</option>
                    </select>
                  ) : p.role === "director" ? (
                    <span className={styles.dirBadge}>Director</span>
                  ) : (
                    <span className={styles.teamBadge}>Equipo</span>
                  )}
                </div>
                <div className={styles.assignCount}>
                  {p.role === "director" ? (
                    <span
                      title="Los directores ven todos los clientes por su rol — no requieren asignaciones explícitas."
                      style={{
                        fontStyle: "italic",
                        color: "var(--text-muted)",
                      }}
                    >
                      Acceso global
                    </span>
                  ) : (
                    `${countByUser[p.id] ?? 0} clientes`
                  )}
                </div>
                <div className={styles.payment}>
                  {p.payment_amount != null && isDirector
                    ? (() => {
                        const base = Number(p.payment_amount);
                        const cnt = countByUser[p.id] ?? 0;
                        if (p.payment_type === "por_cliente") {
                          const total = base * cnt;
                          return (
                            <>
                              {p.payment_currency ?? "USD"}{" "}
                              {total.toLocaleString()}
                              <span
                                style={{
                                  fontSize: 10,
                                  color: "var(--text-muted)",
                                  marginLeft: 6,
                                }}
                              >
                                ({base.toLocaleString()} × {cnt})
                              </span>
                            </>
                          );
                        }
                        return `${p.payment_currency ?? "USD"} ${base.toLocaleString()}`;
                      })()
                    : isDirector
                    ? "—"
                    : ""}
                </div>
                <div
                  className={styles.arrow}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    justifyContent: "flex-end",
                    minWidth: 0,
                  }}
                >
                  {isDirector && !isMe && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        deleteMember(p);
                      }}
                      disabled={rowBusy}
                      title="Eliminar miembro"
                      style={{
                        background: "transparent",
                        border: "1px solid rgba(176,75,58,0.2)",
                        borderRadius: 6,
                        color: "var(--red-warn, #B91C1C)",
                        fontSize: 11,
                        padding: "4px 10px",
                        cursor: rowBusy ? "not-allowed" : "pointer",
                        fontFamily: "inherit",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Eliminar
                    </button>
                  )}
                  <Link
                    href={linkHref}
                    style={{
                      textDecoration: "none",
                      color: "inherit",
                      padding: "4px 8px",
                    }}
                  >
                    →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <InviteUserModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onCreated={refresh}
      />
    </>
  );
}
