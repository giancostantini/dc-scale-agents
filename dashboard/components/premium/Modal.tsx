"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useScrollLock } from "@/lib/useScrollLock";

/**
 * Modal premium estilo Mercury / Linear.
 * - Backdrop blur + dim
 * - Card centrada con animación scale-in
 * - Header con close icon
 * - Esc para cerrar
 * - Click fuera para cerrar (opcional con dismissOnBackdrop)
 */

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Tamaño del modal. */
  size?: "sm" | "md" | "lg" | "xl";
  dismissOnBackdrop?: boolean;
}

const SIZE_CLASSES: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  dismissOnBackdrop = true,
}: ModalProps) {
  // El lock del scroll sale del hook compartido: contempla modales
  // apilados (antes cerrar el de arriba desbloqueaba el fondo aunque
  // quedara otro abierto) y compensa el ancho de la scrollbar para que
  // el contenido no salte al abrir.
  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={(e) =>
        dismissOnBackdrop && e.target === e.currentTarget && onClose()
      }
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm animate-fade-in"
    >
      <div
        className={cn(
          "w-full bg-paper border border-rule rounded-premium-lg shadow-premium-lg animate-scale-in flex flex-col max-h-[92vh]",
          SIZE_CLASSES[size],
        )}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-rule flex items-start justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-ink tracking-tight">
              {title}
            </h2>
            {description && (
              <p className="text-xs text-ink-300 mt-1">{description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-ink-300 hover:text-ink hover:bg-paper-200 p-1.5 rounded-premium-sm transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto flex-1">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-rule flex items-center justify-end gap-2 bg-paper-100/40">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
