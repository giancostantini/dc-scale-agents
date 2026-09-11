"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ISearch,
  IPlus,
  IPipeline,
  ICalendario,
  IFinanzas,
  IEquipo,
  IConfiguracion,
} from "./icons/BrandIcons";
import {
  getCurrentProfile,
  hasPipelineAccess,
  hasFinanzasAccess,
  homeForRole,
  signOut,
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getCurrentProfile().then(setProfile);
  }, []);

  // Cerrar el menú del usuario al click afuera.
  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  const isClient = profile?.role === "client";
  const isDirector = profile?.role === "director";
  const showPipeline = hasPipelineAccess(profile);
  const showFinanzas = hasFinanzasAccess(profile);
  const homePath = profile ? homeForRole(profile) : "/hub";

  async function handleSignOut() {
    setMenuOpen(false);
    await signOut();
    router.replace("/");
  }

  return (
    <header className={styles.topbar}>
      <button className={styles.brand} onClick={() => router.push(homePath)}>
        <span className={styles.dot} />
        <Lockup size="md" />
      </button>

      {/* Cliente no tiene buscador (no busca clientes ni leads) */}
      {!isClient && (
        <div className={styles.search}>
          <ISearch className={styles.searchIcon} size={15} strokeWidth={1.8} />
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
            <IPlus size={15} strokeWidth={1.8} /> Nuevo cliente
          </button>
        )}

        {/* Menús de texto con subrayado (sin píldora). Gerente, Calendario
            y Bóveda ya no viven acá: Gerente está en el chat flotante,
            Calendario pasó a isotipo, y Bóveda al menú del usuario. */}

        {/* Pipeline: director siempre, team con pipeline_access, cliente nunca */}
        {showPipeline && (
          <button
            className={styles.navlink}
            onClick={() => router.push("/pipeline")}
          >
            <IPipeline size={15} /> Pipeline
          </button>
        )}

        {/* Finanzas: solo director */}
        {showFinanzas && (
          <button
            className={styles.navlink}
            onClick={() => router.push("/finanzas")}
          >
            <IFinanzas size={15} /> Finanzas
          </button>
        )}

        {/* Equipo: director y team (no cliente) */}
        {!isClient && (
          <button
            className={styles.navlink}
            onClick={() => router.push("/equipo")}
          >
            <IEquipo size={15} /> Equipo
          </button>
        )}

        {/* ===== Cluster de isotipos + usuario ===== */}
        {/* Calendario ahora es solo el isotipo, al lado de Alertas.
            Director y team; el cliente lo ve dentro de su portal. */}
        {!isClient && (
          <button
            className={styles.iconBtn}
            onClick={() => router.push("/calendario")}
            title="Calendario"
            aria-label="Calendario"
          >
            <ICalendario size={19} />
          </button>
        )}

        {/* Notificaciones: campana (isotipo) para todos */}
        <NotificationBell />

        {profile && (
          <div className={styles.userWrap} ref={menuRef}>
            <button
              className={styles.user}
              title="Cuenta"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
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

            {menuOpen && (
              <div className={styles.menu} role="menu">
                <button
                  className={styles.menuItem}
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    router.push("/perfil");
                  }}
                >
                  <IConfiguracion size={15} /> Configuración
                </button>
                {/* Bóveda de empresa (credenciales de D&C): solo director */}
                {isDirector && (
                  <button
                    className={styles.menuItem}
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      router.push("/accesos");
                    }}
                  >
                    <IConfiguracion size={15} /> Bóveda
                  </button>
                )}
                <div className={styles.menuDivider} />
                <button
                  className={`${styles.menuItem} ${styles.menuItemDanger}`}
                  role="menuitem"
                  onClick={handleSignOut}
                >
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
