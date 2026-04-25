"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getCurrentProfile, signOut } from "@/lib/supabase/auth";
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

  async function handleSignOut() {
    await signOut();
    router.replace("/");
  }

  return (
    <header className={styles.topbar}>
      <button className={styles.brand} onClick={() => router.push("/hub")}>
        <span className={styles.dot} />
        <Lockup size="md" />
      </button>

      <div className={styles.search}>
        <input placeholder={searchPlaceholder} />
      </div>

      <div className={styles.actions}>
        {showPrimary && (
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={onPrimaryClick}
          >
            + Nuevo cliente
          </button>
        )}
        <button className={styles.btn} onClick={() => router.push("/pipeline")}>
          Pipeline
        </button>
        <button className={styles.btn} onClick={() => router.push("/calendario")}>
          Calendario
        </button>
        <button className={styles.btn} onClick={() => router.push("/finanzas")}>
          Finanzas
        </button>
        <NotificationBell />

        {profile && (
          <div
            className={styles.user}
            title="Click para cerrar sesión"
            onClick={handleSignOut}
            style={{ cursor: "pointer" }}
          >
            <div className={styles.avatar}>{profile.initials}</div>
            <div>
              <div className={styles.userName}>{profile.name}</div>
              <div className={styles.userRole}>{profile.role}</div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
