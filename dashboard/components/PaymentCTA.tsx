"use client";

/**
 * PaymentCTA — Semáforo de pago en el PortalHeader.
 *
 * Reemplaza el botón "Conexiones" (que se eliminó porque las integraciones
 * las gestiona el equipo). Muestra el estado del pago del mes corriente
 * con color según la fecha relativa al rango 4–9 del mes:
 *   - verde:   pagado
 *   - neutral: antes del 4 (próximo)
 *   - amber:   día 4–9 (vence)
 *   - red:     después del 9 (vencido)
 *
 * Click → /portal/solicitudes?type=pago para que el cliente cargue
 * una solicitud si necesita info (factura, comprobante, etc.).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase/client";
import styles from "./PaymentCTA.module.css";

interface PaymentStatus {
  status: "paid" | "pending";
  color: "green" | "neutral" | "amber" | "red";
  label: string;
  daysToDue: number;
  month: string;
  monthLabel: string;
  fee: number | null;
}

export default function PaymentCTA() {
  const [data, setData] = useState<PaymentStatus | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchStatus() {
      try {
        const supabase = getSupabase();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch("/api/portal/payment-status", {
          headers: { authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) {
          if (!cancelled) setErrored(true);
          return;
        }
        const payload = (await res.json()) as PaymentStatus;
        if (!cancelled) {
          setData(payload);
          setErrored(false);
        }
      } catch {
        if (!cancelled) setErrored(true);
      }
    }

    fetchStatus();
    // Refrescar cada 5 min — el estado puede cambiar al cruzar medianoche
    // (rango 4–9) o cuando el director marca paid en el dashboard.
    const interval = setInterval(fetchStatus, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (errored || !data) {
    return null;
  }

  const formattedFee =
    data.fee !== null
      ? `US$ ${data.fee.toLocaleString("es-AR")}`
      : null;

  const iconByColor: Record<PaymentStatus["color"], React.ReactNode> = {
    green: <CheckIcon />,
    neutral: <CalendarIcon />,
    amber: <ClockIcon />,
    red: <AlertIcon />,
  };

  return (
    <Link
      href="/portal/solicitudes?type=pago"
      className={`${styles.cta} ${styles[`color_${data.color}`]}`}
      title="Ver detalle del pago"
    >
      <span className={styles.dot} aria-hidden="true">
        {iconByColor[data.color]}
      </span>
      <span className={styles.text}>
        <span className={styles.label}>{data.label}</span>
        {formattedFee && (
          <span className={styles.fee}>{formattedFee}/mes</span>
        )}
      </span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Inline SVG icons — evita extra deps
// ---------------------------------------------------------------------------

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
