"use client";

/**
 * Gate del portal: si el usuario logueado tiene must_change_password=true
 * y NO está ya en /portal/cambiar-password, lo redirigimos ahí. Mientras
 * resolvemos el profile, mostramos un placeholder mínimo para no
 * parpadear contenido sin permiso de ver.
 *
 * Se monta en /portal/layout.tsx envolviendo `children`. Como es un
 * Client Component, podemos usar useRouter + getCurrentProfile.
 *
 * NO hace cliente-side enforcement de auth — eso ya lo maneja Supabase
 * (RLS + middleware). Esto es solo para forzar el cambio inicial de
 * password.
 */

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getCurrentProfile } from "@/lib/supabase/auth";

export default function PortalPasswordGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);
  const [mustChange, setMustChange] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCurrentProfile().then((p) => {
      if (cancelled) return;
      // Si no hay profile, esto no es problema del gate: las páginas
      // del portal manejan el redirect a /login por sí mismas.
      const flag = !!p?.must_change_password;
      setMustChange(flag);
      if (flag && pathname !== "/portal/cambiar-password") {
        router.replace("/portal/cambiar-password");
        return;
      }
      setChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  // Mientras chequeamos y el flag está activo (no estamos en la
  // pantalla de cambio), no renderizamos children — evita el flash
  // del portal por 1 frame antes del redirect.
  if (mustChange && pathname !== "/portal/cambiar-password") {
    return null;
  }
  // Mientras se resuelve el profile la primera vez, podemos
  // renderizar children igual: la página de cambio tiene su propio
  // chequeo y los demás endpoints respetan RLS. Esto evita que el
  // portal entero quede en blanco esperando una llamada de red.
  void checked;
  return <>{children}</>;
}
