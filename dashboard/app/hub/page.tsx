"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import ClientCard from "@/components/ClientCard";
import NewClientModal from "@/components/NewClientModal";
import { getClients } from "@/lib/storage";
import { getCurrentProfile, hasSession, isDirector, isTeam, type Profile } from "@/lib/supabase/auth";
import { getSupabase } from "@/lib/supabase/client";
import type { Client, ClientRequest } from "@/lib/types";
import styles from "./hub.module.css";

export default function HubPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [myTasks, setMyTasks] = useState<ClientRequest[]>([]);
  const [pendingUnassigned, setPendingUnassigned] = useState<number>(0);
  const [modalOpen, setModalOpen] = useState(false);

  const refresh = useCallback(async (currentProfile: Profile | null) => {
    const list = await getClients();
    setClients(list);

    // Cargar "Mis tareas" (solicitudes asignadas en estado activo).
    // Solo para director y team — no para client (que va a /portal).
    if (currentProfile && currentProfile.role !== "client") {
      const supabase = getSupabase();
      const { data } = await supabase
        .from("client_requests")
        .select("*")
        .eq("assigned_to", currentProfile.id)
        .in("status", ["reviewing", "in_progress"])
        .order("submitted_at", { ascending: false })
        .limit(3);
      setMyTasks((data ?? []) as ClientRequest[]);

      // Para director: contar solicitudes pendientes de asignar
      if (currentProfile.role === "director") {
        const { count } = await supabase
          .from("client_requests")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending")
          .is("assigned_to", null);
        setPendingUnassigned(count ?? 0);
      }
    }
  }, []);

  useEffect(() => {
    hasSession().then(async (has) => {
      if (!has) {
        router.replace("/");
        return;
      }
      const p = await getCurrentProfile();
      if (p?.role === "client") {
        router.replace("/portal");
        return;
      }
      setProfile(p);
      setAuthChecked(true);
      refresh(p);
    });
  }, [router, refresh]);

  if (!authChecked) return null;

  const teamWithoutAssignments = isTeam(profile) && clients.length === 0;
  const clientById = new Map(clients.map((c) => [c.id, c]));

  return (
    <>
      <Topbar onPrimaryClick={() => setModalOpen(true)} />

      <main className={styles.wrap}>
        {/* Banner de pending sin asignar (director) */}
        {pendingUnassigned > 0 && (
          <div
            style={{
              padding: 14,
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
                {pendingUnassigned} solicitud
                {pendingUnassigned === 1 ? "" : "es"}
              </strong>{" "}
              pendiente{pendingUnassigned === 1 ? "" : "s"} de asignar a un
              miembro del equipo.
            </div>
            <Link
              href="/tareas?filter=pending"
              style={{
                padding: "8px 14px",
                background: "var(--yellow-warn)",
                color: "var(--white)",
                fontSize: 11,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Asignar →
            </Link>
          </div>
        )}

        {/* Widget Mis tareas — visible si tiene al menos 1 asignada */}
        {myTasks.length > 0 && (
          <section
            style={{
              marginBottom: 40,
              padding: "20px 24px",
              background: "var(--white)",
              border: "1px solid rgba(10,26,12,0.08)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: 16,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.25em",
                    textTransform: "uppercase",
                    color: "var(--sand-dark)",
                    fontWeight: 600,
                    marginBottom: 4,
                  }}
                >
                  Mis tareas
                </div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    color: "var(--deep-green)",
                  }}
                >
                  {myTasks.length} solicitud{myTasks.length === 1 ? "" : "es"}{" "}
                  asignada{myTasks.length === 1 ? "" : "s"}
                </div>
              </div>
              <Link
                href="/tareas"
                style={{
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                  color: "var(--sand-dark)",
                  textDecoration: "none",
                  borderBottom: "1px solid var(--sand-dark)",
                  paddingBottom: 2,
                }}
              >
                Ver todas →
              </Link>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {myTasks.map((t) => {
                const c = clientById.get(t.client_id);
                return (
                  <Link
                    key={t.id}
                    href={`/cliente/${t.client_id}/solicitudes`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 16,
                      padding: 12,
                      background: "var(--off-white)",
                      borderLeft: `3px solid ${
                        t.urgency === "alta"
                          ? "var(--red-warn)"
                          : t.urgency === "media"
                            ? "var(--yellow-warn)"
                            : "var(--sand)"
                      }`,
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 10,
                          letterSpacing: "0.15em",
                          textTransform: "uppercase",
                          fontWeight: 600,
                          color: "var(--sand-dark)",
                          marginBottom: 4,
                        }}
                      >
                        {c?.name ?? t.client_id} ·{" "}
                        {t.type === "oferta" ? "oferta" : "acción"}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: "var(--deep-green)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {t.title}
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        fontWeight: 700,
                        color:
                          t.status === "in_progress"
                            ? "var(--green-ok)"
                            : "var(--sand-dark)",
                      }}
                    >
                      {t.status === "in_progress" ? "En curso" : "En revisión"}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <div className={styles.sectionHead}>
          <div>
            <div className={styles.eyebrow}>
              Hub ·{" "}
              {new Date().toLocaleDateString("es-UY", {
                month: "long",
                year: "numeric",
              })}
            </div>
            <h1>Clientes</h1>
          </div>
        </div>

        {clients.length === 0 ? (
          teamWithoutAssignments ? (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>◌</div>
              <div className={styles.emptyTitle}>
                Todavía no tenés clientes asignados
              </div>
              <p className={styles.emptyDesc}>
                Cuando el director te asigne a un cliente, va a aparecer acá.
                Mientras tanto, podés ver tu perfil y el equipo desde el
                Topbar.
              </p>
            </div>
          ) : (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>◌</div>
              <div className={styles.emptyTitle}>Todavía no hay clientes</div>
              <p className={styles.emptyDesc}>
                Empezá creando tu primer cliente. El kickoff, la estrategia y
                los reportes se arman a partir de ahí.
              </p>
              {isDirector(profile) && (
                <button
                  className={styles.emptyBtn}
                  onClick={() => setModalOpen(true)}
                >
                  + Crear primer cliente
                </button>
              )}
            </div>
          )
        ) : (
          <div className={styles.grid}>
            {clients.map((client) => (
              <ClientCard key={client.id} client={client} />
            ))}
          </div>
        )}
      </main>

      <NewClientModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => refresh(profile)}
      />
    </>
  );
}
