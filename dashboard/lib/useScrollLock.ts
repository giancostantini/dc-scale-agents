"use client";

/**
 * useScrollLock — congela el scroll del fondo mientras hay un modal
 * abierto.
 *
 * Resuelve dos cosas que la versión inline que había en
 * components/premium/Modal.tsx no cubría:
 *
 *   1. **Modales apilados.** Con un simple `overflow = ""` en el
 *      cleanup, cerrar el modal de arriba desbloqueaba el scroll
 *      aunque quedara otro abierto. Acá se lleva un contador a nivel
 *      de módulo y recién se restaura cuando se cierra el último.
 *
 *   2. **El salto de layout.** Al ocultar el overflow desaparece la
 *      barra de scroll y el contenido se corre unos píxeles a la
 *      derecha. Se compensa con un padding del ancho exacto de la
 *      barra (0 en macOS con scrollbars overlay, ~15px en Windows).
 *
 * Además de esto, el contenedor scrolleable del modal debería llevar
 * `overscrollBehavior: "contain"` para que la rueda no encadene al
 * fondo cuando el contenido llega al final.
 */

import { useEffect } from "react";

/** Cuántos modales pidieron el lock. Solo se restaura al llegar a 0. */
let lockCount = 0;
/** Estilos originales del body, guardados al tomar el primer lock. */
let previous: { overflow: string; paddingRight: string } | null = null;

export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;

    if (lockCount === 0) {
      const body = document.body;
      previous = {
        overflow: body.style.overflow,
        paddingRight: body.style.paddingRight,
      };
      // Ancho real de la barra de scroll. En macOS con scrollbars de
      // tipo overlay da 0 y no se agrega padding.
      const scrollbar = window.innerWidth - document.documentElement.clientWidth;
      if (scrollbar > 0) {
        const current = parseFloat(getComputedStyle(body).paddingRight) || 0;
        body.style.paddingRight = `${current + scrollbar}px`;
      }
      body.style.overflow = "hidden";
    }
    lockCount += 1;

    return () => {
      lockCount -= 1;
      if (lockCount === 0 && previous) {
        document.body.style.overflow = previous.overflow;
        document.body.style.paddingRight = previous.paddingRight;
        previous = null;
      }
    };
  }, [active]);
}
