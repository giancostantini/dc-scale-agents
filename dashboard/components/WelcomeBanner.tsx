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

  return (
    <div className={styles.banner}>
      <div className={styles.left}>
        <div className={styles.eyebrow}>{eyebrow ?? todayLong()}</div>
        <div className={styles.title}>{title ?? autoTitle}</div>
        {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
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
