"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Lockup from "@/components/Lockup";
import NotificationBell from "@/components/NotificationBell";
import { signOut, type Profile } from "@/lib/supabase/auth";
import { getSupabase } from "@/lib/supabase/client";
import type { Client } from "@/lib/types";
import styles from "./PortalHeader.module.css";

export interface PortalHeaderProps {
  client: Client | null;
  profile: Profile;
  logoUrl?: string | null;
  /** Texto pequeño arriba del lockup. Ej. "Portal · Wiztrip", "Consultor IA". */
  eyebrow?: string;
  /** Si true, muestra "← Portal" en lugar de los botones de navegación. */
  showBack?: boolean;
}

/**
 * Header unificado del portal del cliente. Muestra:
 *   - Logo del cliente (si existe) + Lockup D&C
 *   - Eyebrow contextual centrado
 *   - Conexiones · Alertas · Perfil · Salir
 *
 * Antes este markup estaba duplicado en /portal, /portal/consultor y
 * /portal/solicitudes. Centralizado para mantener consistencia visual
 * y agregar el nuevo botón "Conexiones".
 */
export default function PortalHeader({
  client,
  profile,
  logoUrl,
  eyebrow,
  showBack = false,
}: PortalHeaderProps) {
  const router = useRouter();
  const [pendingConnections, setPendingConnections] = useState<number | null>(null);

  // Cuenta cuántas integraciones del cliente están sin conectar.
  // Usado para el badge dot en el botón Conexiones.
  useEffect(() => {
    if (!client?.id) return;
    const supabase = getSupabase();
    let active = true;
    supabase
      .from("integrations")
      .select("status", { count: "exact", head: true })
      .eq("client_id", client.id)
      .in("status", ["disconnected", "pending"])
      .then(({ count }) => {
        if (active) setPendingConnections(count ?? 0);
      });
    return () => {
      active = false;
    };
  }, [client?.id]);

  const showPendingDot = pendingConnections !== null && pendingConnections > 0;

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
          <Link href="/portal" className={styles.btnGhost}>
            ← Portal
          </Link>
        ) : (
          <>
            <Link
              href="/portal/conexiones"
              className={styles.btnGhost}
              title={
                showPendingDot
                  ? `${pendingConnections} herramientas sin conectar`
                  : "Tus integraciones"
              }
            >
              <span className={styles.btnLabel}>Conexiones</span>
              {showPendingDot && (
                <span className={styles.badge}>{pendingConnections}</span>
              )}
            </Link>
          </>
        )}

        <NotificationBell />

        <button
          className={styles.userBtn}
          onClick={() => router.push("/perfil")}
          title="Mi perfil"
        >
          <div className={styles.avatar}>{profile.initials}</div>
          <div className={styles.userMeta}>
            <div className={styles.userName}>{profile.name}</div>
            <div className={styles.userRole}>Cliente</div>
          </div>
        </button>

        <button
          className={styles.btnGhost}
          onClick={() => signOut().then(() => router.replace("/"))}
        >
          Salir
        </button>
      </div>
    </header>
  );
}
