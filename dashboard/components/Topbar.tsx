"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  getCurrentProfile,
  hasPipelineAccess,
  hasFinanzasAccess,
  homeForRole,
} from "@/lib/supabase/auth";
import type { Profile } from "@/lib/supabase/auth";
import NotificationBell from "./NotificationBell";
import Lockup from "./Lockup";
import styles from "./Topbar.module.css";

interface TopbarProps {
  showPrimary?: boolean;
  onPrimaryClick?: () => void;
  searchPlaceholder?: string;
}

export default function Topbar({
  showPrimary = true,
  onPrimaryClick,
  searchPlaceholder = "Buscar clientes, archivos, tareas, prospectos…",
}: TopbarProps) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    getCurrentProfile().then(setProfile);
  }, []);

  const isClient = profile?.role === "client";
  const isDirector = profile?.role === "director";
  const showPipeline = hasPipelineAccess(profile);
  const showFinanzas = hasFinanzasAccess(profile);
  const homePath = profile ? homeForRole(profile) : "/hub";

  return (
    <header className={styles.topbar}>
      <button className={styles.brand} onClick={() => router.push(homePath)}>
        <span className={styles.dot} />
        <Lockup size="md" />
      </button>

      {/* Cliente no tiene buscador (no busca clientes ni leads) */}
      {!isClient && (
        <div className={styles.search}>
          <input placeholder={searchPlaceholder} />
        </div>
      )}
      {isClient && <div style={{ flex: 1 }} />}

      <div className={styles.actions}>
        {/* + Nuevo cliente: solo director */}
        {showPrimary && isDirector && (
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={onPrimaryClick}
          >
            + Nuevo cliente
          </button>
        )}

        {/* Pipeline: director siempre, team con pipeline_access, cliente nunca */}
        {showPipeline && (
          <button
            className={styles.btn}
            onClick={() => router.push("/pipeline")}
          >
            Pipeline
          </button>
        )}

        {/* Calendario: director y team. Cliente lo ve dentro de su portal. */}
        {!isClient && (
          <button
            className={styles.btn}
            onClick={() => router.push("/calendario")}
          >
            Calendario
          </button>
        )}

        {/* Finanzas: solo director */}
        {showFinanzas && (
          <button
            className={styles.btn}
            onClick={() => router.push("/finanzas")}
          >
            Finanzas
          </button>
        )}

        {/* Equipo: director y team (no cliente) */}
        {!isClient && (
          <button
            className={styles.btn}
            onClick={() => router.push("/equipo")}
          >
            Equipo
          </button>
        )}

        {/* Notificaciones: para todos */}
        <NotificationBell />

        {profile && (
          <button
            className={styles.user}
            title="Ir a mi perfil"
            onClick={() => router.push("/perfil")}
            style={{ cursor: "pointer" }}
          >
            <div className={styles.avatar}>{profile.initials}</div>
            <div>
              <div className={styles.userName}>{profile.name}</div>
              <div className={styles.userRole}>
                {profile.role === "director"
                  ? "Director"
                  : profile.role === "client"
                  ? "Cliente"
                  : profile.position || "Equipo"}
              </div>
            </div>
          </button>
        )}
      </div>
    </header>
  );
}
