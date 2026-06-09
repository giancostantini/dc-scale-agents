import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Helper para mergear classNames con dedup de utilidades Tailwind.
 * Patrón estándar shadcn/ui.
 *
 * Ej: cn("p-4", isActive && "bg-accent-tint", "rounded-premium")
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
