"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import Lockup from "@/components/Lockup";
import NotificationBell from "@/components/NotificationBell";
import PaymentCTA from "@/components/PaymentCTA";
import { signOut, type Profile } from "@/lib/supabase/auth";
import type { Client } from "@/lib/types";
import styles from "./PortalHeader.module.css";

export interface PortalHeaderProps {
  client: Client | null;
  profile: Profile;
  logoUrl?: string | null;
  /** Texto pequeño arriba del lockup. Ej. "Portal · Wiztrip", "D&C Advisor". */
  eyebrow?: string;
  /** Si true, muestra "← Portal" en lugar de los botones de navegación. */
  showBack?: boolean;
}

/**
 * Header unificado del portal del cliente. Muestra:
 *   - Logo del cliente (si existe) + Lockup D&C
 *   - Eyebrow contextual centrado
 *   - PaymentCTA (semáforo del pago mensual) · Alertas · Perfil · Salir
 *
 * El botón "Conexiones" se eliminó: las integraciones las gestiona el
 * equipo directamente con los programadores del cliente (no es una
 * acción autoservicio).
 *
 * Todos los botones del lado derecho mantienen la misma altura/padding
 * para sentirse uniformes (el styling del NotificationBell se sobreescribe
 * con :global en PortalHeader.module.css).
 */
export default function PortalHeader({
  client,
  profile,
  logoUrl,
  eyebrow,
  showBack = false,
}: PortalHeaderProps) {
  const router = useRouter();

  return (
    <header className={styles.header}>
      <div className={styles.headerLeft}>
        {logoUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={logoUrl}
            alt={`Logo de ${client?.name ?? "cliente"}`}
            className={styles.clientLogo}
          />
        )}
        <Lockup size="md" />
      </div>

      <div className={styles.headerCenter}>
        {eyebrow && <div className={styles.eyebrow}>{eyebrow}</div>}
      </div>

      <div className={styles.headerRight}>
        {showBack ? (
          <Link href="/portal" className={styles.headerBtn}>
            ← Portal
          </Link>
        ) : (
          <PaymentCTA />
        )}

        <NotificationBell />

        <button
          type="button"
          className={`${styles.headerBtn} ${styles.userBtn}`}
          onClick={() => router.push("/perfil")}
          title="Mi perfil"
        >
          <span className={styles.avatar}>{profile.initials}</span>
          <span className={styles.userName}>{profile.name}</span>
        </button>

        <button
          type="button"
          className={styles.headerBtn}
          onClick={() => signOut().then(() => router.replace("/"))}
        >
          Salir
        </button>
      </div>
    </header>
  );
}
