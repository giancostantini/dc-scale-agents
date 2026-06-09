"use client";

/**
 * SectorTrendsCard — card teaser del sidebar del portal. Muestra las últimas
 * 2-3 tendencias del nicho y linkea a /portal/tendencias (versión completa con
 * fuentes). Mismo patrón de fetch que TeamCard (Bearer → /api/portal/trends).
 *
 * Si no hay tendencias todavía o falla, no renderiza (no ensucia el sidebar).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase/client";
import styles from "./SectorTrendsCard.module.css";

interface TrendItem {
  title: string;
  category?: string;
}

export default function SectorTrendsCard() {
  const [items, setItems] = useState<TrendItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = getSupabase();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          setLoading(false);
          return;
        }
        const res = await fetch("/api/portal/trends", {
          headers: { authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) {
          if (!cancelled) setErrored(true);
          return;
        }
        const data = (await res.json()) as { items: TrendItem[] };
        if (!cancelled) setItems(data.items ?? []);
      } catch {
        if (!cancelled) setErrored(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (errored) return null;

  if (loading) {
    return (
      <div className={styles.card}>
        <div className={styles.label}>Tendencias del sector</div>
        <div className={styles.skeleton} />
        <div className={styles.skeleton} />
      </div>
    );
  }

  // Sin tendencias todavía → no mostramos la card (evita ruido).
  if (!items || items.length === 0) return null;

  const top = items.slice(0, 3);

  return (
    <Link href="/portal/tendencias" className={`${styles.card} ${styles.cardLink}`}>
      <div className={styles.head}>
        <span className={styles.label}>Tendencias del sector</span>
        <span className={styles.arrow}>Ver todas →</span>
      </div>
      <ul className={styles.list}>
        {top.map((it, i) => (
          <li key={i} className={styles.item}>
            <span className={styles.dot} aria-hidden="true" />
            <span className={styles.itemTitle}>{it.title}</span>
          </li>
        ))}
      </ul>
    </Link>
  );
}
