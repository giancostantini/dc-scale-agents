"use client";

import { useEffect, useState } from "react";
import { getCurrentProfile } from "@/lib/supabase/auth";
import styles from "./WelcomeBanner.module.css";

interface Stat {
  label: string;
  value: string | number;
}

interface WelcomeBannerProps {
  /** Línea pequeña en mayúscula sobre el título. Default: fecha de hoy. */
  eyebrow?: string;
  /** Reemplaza el saludo automático "¡Buenos días, {nombre}!". */
  title?: string;
  /** Texto secundario bajo el título. */
  subtitle?: string;
  /** Chips de stats rápidos a la derecha. */
  stats?: Stat[];
  /** Contenido extra a la derecha (badges, acciones). */
  children?: React.ReactNode;
  /** Si false, no saluda por nombre (útil con title propio). */
  greet?: boolean;
  /** URL del logo a mostrar a la izquierda del título. Útil para
   *  el dashboard del cliente. Si está vacío y `logoFallback` está
   *  seteado, se muestra el fallback (típicamente las iniciales). */
  logoUrl?: string | null;
  /** Texto que se muestra en lugar del logo cuando logoUrl es null.
   *  Típicamente las iniciales del cliente. */
  logoFallback?: string;
}

function greetingForHour(h: number): string {
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

const todayLong = () =>
  new Date().toLocaleDateString("es-UY", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

export default function WelcomeBanner({
  eyebrow,
  title,
  subtitle,
  stats,
  children,
  greet = true,
  logoUrl,
  logoFallback,
}: WelcomeBannerProps) {
  const [firstName, setFirstName] = useState<string | null>(null);

  useEffect(() => {
    if (!greet) return;
    getCurrentProfile().then((p) => {
      if (p?.name) setFirstName(p.name.split(" ")[0]);
    });
  }, [greet]);

  const autoTitle = greet
    ? `¡${greetingForHour(new Date().getHours())}${firstName ? `, ${firstName}` : ""}!`
    : "";

  // Cuando hay logoUrl o logoFallback, los renderizamos pegados al
  // texto del banner. Si no hay nada, el banner queda como siempre.
  const showLogo = !!(logoUrl || logoFallback);

  return (
    <div className={styles.banner}>
      <div
        className={styles.left}
        style={
          showLogo
            ? {
                display: "flex",
                alignItems: "center",
                gap: 22,
              }
            : undefined
        }
      >
        {showLogo && (
          <div
            style={{
              width: 86,
              height: 86,
              flexShrink: 0,
              background: "var(--ivory)",
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              fontWeight: 800,
              fontSize: 28,
              color: "var(--deep-green)",
              border: "1px solid rgba(10,26,12,0.08)",
              position: "relative",
              zIndex: 1,
              boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
            }}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt="Logo cliente"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  background: "white",
                }}
              />
            ) : (
              logoFallback
            )}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div className={styles.eyebrow}>{eyebrow ?? todayLong()}</div>
          <div className={styles.title}>{title ?? autoTitle}</div>
          {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
        </div>
      </div>

      {(stats?.length || children) && (
        <div className={styles.right}>
          {stats?.length ? (
            <div className={styles.stats}>
              {stats.map((s) => (
                <div key={s.label} className={styles.stat}>
                  <div className={styles.statValue}>{s.value}</div>
                  <div className={styles.statLabel}>{s.label}</div>
                </div>
              ))}
            </div>
          ) : null}
          {children}
        </div>
      )}
    </div>
  );
}
