"use client";

/**
 * Topbar = sidebar vertical lateral (izquierda) + header slim arriba.
 *
 * Antes era una barra horizontal con todos los nav items. Ahora es:
 *   · Sidebar fija (230px) en la izquierda con todos los items del
 *     menú + brand arriba + user chip abajo.
 *   · Header slim (56px) arriba con search + acciones secundarias +
 *     notificaciones.
 *
 * Cada página sigue importando <Topbar /> sin cambios — el sidebar
 * se renderiza automáticamente.
 */

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Search,
  Plus,
  Target,
  CalendarDays,
  Wallet,
  Users,
  LayoutDashboard,
  ListChecks,
  User as UserIcon,
} from "lucide-react";
import {
  getCurrentProfile,
  hasPipelineAccess,
  hasFinanzasAccess,
  homeForRole,
} from "@/lib/supabase/auth";
import type { Profile } from "@/lib/supabase/auth";
import NotificationBell from "./NotificationBell";
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
  const pathname = usePathname();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    getCurrentProfile().then(setProfile);
  }, []);

  const isClient = profile?.role === "client";
  const isDirector = profile?.role === "director";
  const showPipeline = hasPipelineAccess(profile);
  const showFinanzas = hasFinanzasAccess(profile);
  const homePath = profile ? homeForRole(profile) : "/hub";

  // Items del sidebar — adaptan según role/permisos
  const navItems: {
    key: string;
    href: string;
    icon: typeof LayoutDashboard;
    label: string;
    visible: boolean;
  }[] = [
    {
      key: "dashboard",
      href: homePath,
      icon: LayoutDashboard,
      label: "Dashboard",
      visible: true,
    },
    {
      key: "pipeline",
      href: "/pipeline",
      icon: Target,
      label: "Pipeline",
      visible: showPipeline && !isClient,
    },
    {
      key: "clientes",
      href: "/finanzas?page=clientes",
      icon: Users,
      label: "Clientes",
      visible: showFinanzas && !isClient,
    },
    {
      key: "tareas",
      href: "/tareas",
      icon: ListChecks,
      label: "Tareas",
      visible: !isClient,
    },
    {
      key: "calendario",
      href: "/calendario",
      icon: CalendarDays,
      label: "Calendario",
      visible: !isClient,
    },
    {
      key: "finanzas",
      href: "/finanzas",
      icon: Wallet,
      label: "Finanzas",
      visible: showFinanzas,
    },
    {
      key: "equipo",
      href: "/equipo",
      icon: Users,
      label: "Equipo",
      visible: !isClient,
    },
  ];

  function isActive(href: string): boolean {
    // Soporta query strings: /finanzas?page=clientes vs /finanzas
    const [path] = href.split("?");
    if (path === "/hub" || path === "/portal") return pathname === path;
    return pathname === path || pathname.startsWith(path + "/");
  }

  return (
    <>
      {/* ============== SIDEBAR VERTICAL ============== */}
      <aside className={styles.sidebar} data-app-sidebar>
        <div className={styles.sidebarHeader}>
          <button className={styles.brand} onClick={() => router.push(homePath)}>
            <div className={styles.brandLogo}>DC</div>
            <div className={styles.brandText}>
              <div className={styles.brandName}>Dearmas</div>
              <div className={styles.brandSub}>Costantini</div>
            </div>
          </button>
        </div>

        <nav className={styles.nav}>
          {navItems
            .filter((it) => it.visible)
            .map((it) => {
              const Icon = it.icon;
              const active = isActive(it.href);
              return (
                <button
                  key={it.key}
                  className={`${styles.navItem} ${
                    active ? styles.navItemActive : ""
                  }`}
                  onClick={() => router.push(it.href)}
                >
                  <Icon size={17} strokeWidth={1.9} className={styles.navIcon} />
                  <span className={styles.navItemLabel}>{it.label}</span>
                </button>
              );
            })}
        </nav>

        {profile && (
          <div className={styles.sidebarFooter}>
            <button
              className={styles.userChip}
              onClick={() => router.push("/perfil")}
            >
              <div className={styles.avatar}>{profile.initials}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
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
          </div>
        )}
      </aside>

      {/* ============== TOPBAR SLIM ============== */}
      <header className={styles.topbar}>
        {!isClient && (
          <div className={styles.search}>
            <Search className={styles.searchIcon} size={15} strokeWidth={2} />
            <input placeholder={searchPlaceholder} />
          </div>
        )}
        {isClient && <div style={{ flex: 1 }} />}

        <div className={styles.actions}>
          {showPrimary && isDirector && (
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={onPrimaryClick}
            >
              <Plus size={14} strokeWidth={2.2} /> Nuevo cliente
            </button>
          )}
          <NotificationBell />
          {profile && (
            <button
              onClick={() => router.push("/perfil")}
              title="Ir a mi perfil"
              style={{
                background: "transparent",
                border: "none",
                padding: 6,
                cursor: "pointer",
                color: "var(--deep-green)",
              }}
            >
              <UserIcon size={18} strokeWidth={1.9} />
            </button>
          )}
        </div>
      </header>
    </>
  );
}
