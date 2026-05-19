"use client";

/**
 * ScheduleMeetingCTA — Botón "Agendar con D&C" que abre un menú con las
 * 3 opciones: founder 1, founder 2, ambos. Cada opción dispara un deep
 * link a Outlook Web compose con el destinatario pre-cargado.
 *
 * Lee 4 env vars públicas:
 *   NEXT_PUBLIC_FOUNDER_1_NAME / NEXT_PUBLIC_FOUNDER_1_EMAIL
 *   NEXT_PUBLIC_FOUNDER_2_NAME / NEXT_PUBLIC_FOUNDER_2_EMAIL
 *
 * Comportamiento:
 *   - 0 founders configurados → no renderiza (return null).
 *   - 1 founder → botón directo (link) sin menú.
 *   - 2 founders → botón que abre menú dropdown con 3 opciones.
 *
 * El deep link de Outlook acepta múltiples destinatarios separados por
 * `;` o `,` en el query param `to=`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./ScheduleMeetingCTA.module.css";

interface Founder {
  name: string;
  email: string;
}

const OUTLOOK_COMPOSE_BASE =
  "https://outlook.office.com/calendar/0/deeplink/compose";

function buildOutlookUrl(emails: string[], subject: string): string {
  const to = emails.map((e) => encodeURIComponent(e)).join(";");
  return `${OUTLOOK_COMPOSE_BASE}?subject=${encodeURIComponent(subject)}&to=${to}`;
}

function getFounders(): Founder[] {
  const founders: Founder[] = [];
  const f1Name = process.env.NEXT_PUBLIC_FOUNDER_1_NAME;
  const f1Email = process.env.NEXT_PUBLIC_FOUNDER_1_EMAIL;
  if (f1Name && f1Email) {
    founders.push({ name: f1Name, email: f1Email });
  }
  const f2Name = process.env.NEXT_PUBLIC_FOUNDER_2_NAME;
  const f2Email = process.env.NEXT_PUBLIC_FOUNDER_2_EMAIL;
  if (f2Name && f2Email) {
    founders.push({ name: f2Name, email: f2Email });
  }
  return founders;
}

export default function ScheduleMeetingCTA() {
  const founders = getFounders();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Click-outside + Escape para cerrar el menú
  useEffect(() => {
    if (!open) return;

    function onClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
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

  const handleOptionClick = useCallback(() => {
    setOpen(false);
  }, []);

  // 0 founders → no aparece nada
  if (founders.length === 0) return null;

  const subject = "Reunión con D&C";

  // 1 founder → botón directo (link), sin menú
  if (founders.length === 1) {
    const f = founders[0];
    return (
      <a
        href={buildOutlookUrl([f.email], subject)}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.cta}
      >
        <CalendarIcon />
        <span className={styles.ctaText}>
          <span className={styles.ctaLabel}>Agendar con {f.name}</span>
          <span className={styles.ctaHint}>Se abre en Outlook</span>
        </span>
      </a>
    );
  }

  // 2 founders → dropdown menu con 3 opciones
  const [f1, f2] = founders;
  const bothLabel = `${f1.name} + ${f2.name}`;

  return (
    <div ref={containerRef} className={styles.wrapper}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.cta}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <CalendarIcon />
        <span className={styles.ctaText}>
          <span className={styles.ctaLabel}>Agendar con D&amp;C</span>
          <span className={styles.ctaHint}>Elegí con quién</span>
        </span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div className={styles.menu} role="menu">
          <a
            href={buildOutlookUrl([f1.email], subject)}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.option}
            role="menuitem"
            onClick={handleOptionClick}
          >
            <PersonIcon />
            <span className={styles.optionText}>
              <span className={styles.optionLabel}>Con {f1.name}</span>
              <span className={styles.optionEmail}>{f1.email}</span>
            </span>
          </a>
          <a
            href={buildOutlookUrl([f2.email], subject)}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.option}
            role="menuitem"
            onClick={handleOptionClick}
          >
            <PersonIcon />
            <span className={styles.optionText}>
              <span className={styles.optionLabel}>Con {f2.name}</span>
              <span className={styles.optionEmail}>{f2.email}</span>
            </span>
          </a>
          <div className={styles.divider} />
          <a
            href={buildOutlookUrl([f1.email, f2.email], subject)}
            target="_blank"
            rel="noopener noreferrer"
            className={`${styles.option} ${styles.optionBoth}`}
            role="menuitem"
            onClick={handleOptionClick}
          >
            <UsersIcon />
            <span className={styles.optionText}>
              <span className={styles.optionLabel}>Con los dos</span>
              <span className={styles.optionEmail}>{bothLabel}</span>
            </span>
          </a>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline icons
// ---------------------------------------------------------------------------

function CalendarIcon() {
  return (
    <span className={styles.ctaIcon} aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <line x1="12" y1="14" x2="12" y2="18" />
        <line x1="10" y1="16" x2="14" y2="16" />
      </svg>
    </span>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <span className={styles.optionIcon} aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    </span>
  );
}

function UsersIcon() {
  return (
    <span className={`${styles.optionIcon} ${styles.optionIconBoth}`} aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    </span>
  );
}
