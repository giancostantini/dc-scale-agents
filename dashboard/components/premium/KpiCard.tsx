"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ArrowDown, ArrowUp } from "lucide-react";

/**
 * KpiCard premium estilo Mercury/Ramp:
 * - Label compacto uppercase (eyebrow) chiquito
 * - Valor grande con tabular-nums
 * - Delta % con flecha y color semántico
 * - Sub-line opcional para context
 * - Icono opcional en esquina sup-der
 */

export interface KpiCardProps {
  label: string;
  value: string | number;
  delta?: number | null;
  /** Si true, positive delta es verde. Si false, negative es verde (ej: egresos). */
  positiveIsGood?: boolean;
  /** Texto debajo del valor. */
  sub?: string;
  /** Icono lucide-react en esquina sup-der. */
  icon?: ReactNode;
  /** Click opcional para drill-down. */
  onClick?: () => void;
  className?: string;
  /** Loading skeleton. */
  loading?: boolean;
}

export function KpiCard({
  label,
  value,
  delta,
  positiveIsGood = true,
  sub,
  icon,
  onClick,
  className,
  loading,
}: KpiCardProps) {
  const isGoodDelta =
    delta == null
      ? null
      : positiveIsGood
        ? delta >= 0
        : delta <= 0;
  const deltaColor =
    isGoodDelta === null
      ? "text-ink-300"
      : isGoodDelta
        ? "text-success"
        : "text-danger";
  const deltaBg =
    isGoodDelta === null
      ? "bg-ink-50"
      : isGoodDelta
        ? "bg-success/10"
        : "bg-danger/10";

  return (
    <div
      onClick={onClick}
      className={cn(
        "group bg-paper border border-rule rounded-premium p-5 transition-all duration-150",
        onClick && "cursor-pointer hover:border-rule-strong hover:shadow-premium",
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <div className="eyebrow">{label}</div>
        {icon && (
          <div className="text-ink-300 group-hover:text-ink transition-colors">
            {icon}
          </div>
        )}
      </div>
      {loading ? (
        <>
          <div className="skeleton h-9 w-32 mt-3" />
          {sub && <div className="skeleton h-3 w-24 mt-2" />}
        </>
      ) : (
        <>
          <div className="stat-num mt-3">{value}</div>
          <div className="flex items-center gap-2 mt-2">
            {delta != null && (
              <span
                className={cn(
                  "pill-premium",
                  deltaBg,
                  deltaColor,
                )}
              >
                {delta >= 0 ? (
                  <ArrowUp className="w-2.5 h-2.5" />
                ) : (
                  <ArrowDown className="w-2.5 h-2.5" />
                )}
                {Math.abs(delta).toFixed(1)}%
              </span>
            )}
            {sub && <span className="text-xs text-ink-300">{sub}</span>}
          </div>
        </>
      )}
    </div>
  );
}
