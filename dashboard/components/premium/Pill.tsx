"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Pill / Badge para status, tags, categorías.
 * Estética premium: rounded-full, padding compacto, tipografía xs.
 */

export type PillTone =
  | "neutral"
  | "success"
  | "warn"
  | "danger"
  | "info"
  | "accent"
  | "sand";

const TONE_CLASSES: Record<PillTone, string> = {
  neutral: "bg-ink-50 text-ink-500",
  success: "bg-success/10 text-success",
  warn: "bg-warn/15 text-warn",
  danger: "bg-danger/10 text-danger",
  info: "bg-info/10 text-info",
  accent: "bg-accent-tint text-accent-dim",
  sand: "bg-sand/15 text-sand-dark",
};

export function Pill({
  tone = "neutral",
  children,
  className,
}: {
  tone?: PillTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 text-2xs font-semibold rounded-full whitespace-nowrap",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
