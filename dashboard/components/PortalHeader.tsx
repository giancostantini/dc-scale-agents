"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Lockup from "@/components/Lockup";
import NotificationBell from "@/components/NotificationBell";
import PaymentCTA from "@/components/PaymentCTA";
import { signOut, type Profile } from "@/lib/supabase/auth";
import type { Client } from "@/lib/types";
import styles from "./PortalHeader.module.css";

/**
 * Items de navegación visibles arriba en el header del portal. El
 * orden importa visualmente. Cada uno linkea a una página dentro
 * de /portal/*. Si la página actual matchea el href, el botón sale
 * con el estado "activo".
 *
 * Cuándo agregar uno acá: cuando el cliente necesite acceder a
 * algo recurrente (no son CTAs de una vez). El home tiene las
 * tarjetas-CTA para descubrir contenido nuevo; el header está para
 * navegación.
 */
const NAV_ITEMS: { href: string; label: string }[] = [
  { href: "/portal/documentos", label: "Documentos" },
  { href: "/portal/calendario", label: "Calendario" },
  { href: "/portal/tendencias", label: "Tendencias" },
];

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
  const pathname = usePathname() ?? "";

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
        {/* Lockup de D&C es link al home del portal — el cliente
            espera ese comportamiento cuando está navegando dentro
            de /portal/agenda, /portal/documentos, etc. */}
        <Link
          href="/portal"
          aria-label="Volver al portal"
          style={{
            display: "inline-flex",
            alignItems: "center",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <Lockup size="md" />
        </Link>

        {/* Nav del portal — botones principales que el cliente usa
            recurrente. Los CTAs descubribles (Solicitudes, Agenda,
            etc.) viven como cards en el home; acá ponemos los menús
            navegables. */}
        {!showBack && (
          <nav
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginLeft: 20,
              paddingLeft: 20,
              borderLeft: "1px solid rgba(232,228,220,0.18)",
            }}
          >
            {NAV_ITEMS.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    padding: "8px 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                    color: active
                      ? "var(--off-white)"
                      : "rgba(232,228,220,0.65)",
                    background: active
                      ? "rgba(196,168,130,0.18)"
                      : "transparent",
                    border: active
                      ? "1px solid rgba(196,168,130,0.5)"
                      : "1px solid transparent",
                    borderRadius: 4,
                    textDecoration: "none",
                    transition: "all 0.12s",
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        )}
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
