"use client";

/**
 * PaymentCTA — Indicador de pago en el PortalHeader.
 *
 * Un botón compacto con barra de progreso fina + popover al click.
 * NO navega: el popover muestra el detalle (estado, monto, vencimiento)
 * y recién desde ahí se puede ir a cargar una solicitud de pago.
 *
 * Semáforo según fecha (ventana de cobro 4–9 del mes):
 *   verde=pagado · neutral=antes del 4 · amber=4–9 · red=vencido.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase/client";
import styles from "./PaymentCTA.module.css";

interface PaymentStatus {
  status: "paid" | "pending";
  color: "green" | "neutral" | "amber" | "red";
  label: string;
  daysToDue: number;
  daysOverdue: number;
  dayOfMonth: number;
  dueRangeStart: number;
  dueRangeEnd: number;
  progress: number;
  month: string;
  monthLabel: string;
  fee: number | null;
  clientName: string | null;
}

// Número de WhatsApp del fundador para coordinar pagos (formato
// internacional sin '+'). Si no está seteado, el botón cae al fallback
// de solicitudes.
const PAYMENT_WHATSAPP = process.env.NEXT_PUBLIC_PAYMENT_WHATSAPP;

/** Arma el href del botón "Coordinar pago": WhatsApp si hay número, sino
 *  fallback a la pantalla de solicitudes. */
function buildPaymentHref(data: PaymentStatus): {
  href: string;
  external: boolean;
} {
  const num = PAYMENT_WHATSAPP?.trim();
  if (num) {
    const who = data.clientName ? `soy de ${data.clientName}. ` : "";
    const msg = `Hola, ${who}quiero coordinar el pago de ${data.monthLabel}.`;
    return {
      href: `https://wa.me/${num}?text=${encodeURIComponent(msg)}`,
      external: true,
    };
  }
  return { href: "/portal/solicitudes?type=pago", external: false };
}

export default function PaymentCTA() {
  const [data, setData] = useState<PaymentStatus | null>(null);
  const [errored, setErrored] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

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
    const interval = setInterval(fetchStatus, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Click-outside + Escape para cerrar el popover
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const closePopover = useCallback(() => setOpen(false), []);

  if (errored || !data) return null;

  const formattedFee =
    data.fee !== null ? `US$ ${data.fee.toLocaleString("es-AR")}` : null;

  // Label corto del botón: "Pago de mayo"
  const shortLabel = `Pago de ${data.monthLabel}`;
  const progressPct = Math.round(Math.max(0, Math.min(data.progress, 1)) * 100);

  return (
    <div ref={wrapperRef} className={styles.wrapper}>
      <button
        ref={buttonRef}
        type="button"
        className={`${styles.cta} ${styles[`color_${data.color}`]}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Ver detalle del pago"
      >
        <span className={styles.ctaTop}>
          <span className={styles.dot} aria-hidden="true">
            <StatusIcon color={data.color} />
          </span>
          <span className={styles.label}>{shortLabel}</span>
        </span>
        <span className={styles.progressTrack} aria-hidden="true">
          <span
            className={styles.progressFill}
            style={{ width: `${progressPct}%` }}
          />
        </span>
      </button>

      {open && (
        <div className={styles.popover} role="dialog" aria-label="Detalle del pago">
          <div className={styles.popHeader}>
            <span className={styles.popEyebrow}>Tu pago de {data.monthLabel}</span>
            <span className={`${styles.popStatus} ${styles[`pop_${data.color}`]}`}>
              {data.label}
            </span>
          </div>

          <div className={styles.popRow}>
            <span className={styles.popRowLabel}>Monto</span>
            <span className={styles.popRowValue}>
              {formattedFee ? `${formattedFee} / mes` : "—"}
            </span>
          </div>
          <div className={styles.popRow}>
            <span className={styles.popRowLabel}>Vencimiento</span>
            <span className={styles.popRowValue}>
              {data.dueRangeStart} al {data.dueRangeEnd} de {data.monthLabel}
            </span>
          </div>

          {data.status === "paid" ? (
            <div className={styles.popDone}>
              Tu cuenta está al día. ¡Gracias!
            </div>
          ) : (() => {
            const { href, external } = buildPaymentHref(data);
            return external ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.popAction}
                onClick={closePopover}
              >
                Coordinar pago →
              </a>
            ) : (
              <Link href={href} className={styles.popAction} onClick={closePopover}>
                Coordinar pago →
              </Link>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function StatusIcon({ color }: { color: PaymentStatus["color"] }) {
  if (color === "green") {
    return (
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  if (color === "red") {
    return (
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    );
  }
  if (color === "amber") {
    return (
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    );
  }
  // neutral
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
