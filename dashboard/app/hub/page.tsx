"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Topbar from "@/components/Topbar";
import ClientCard from "@/components/ClientCard";
import NewClientModal from "@/components/NewClientModal";
import { getClients } from "@/lib/storage";
import { getCurrentProfile, hasSession, isDirector, isTeam, type Profile } from "@/lib/supabase/auth";
import type { Client } from "@/lib/types";
import styles from "./hub.module.css";

export default function HubPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  const refresh = useCallback(() => {
    getClients().then(setClients);
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
      refresh();
    });
  }, [router, refresh]);

  if (!authChecked) return null;

  const teamWithoutAssignments = isTeam(profile) && clients.length === 0;

  return (
    <>
      <Topbar onPrimaryClick={() => setModalOpen(true)} />

      <main className={styles.wrap}>
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
        onCreated={refresh}
      />
    </>
  );
}
