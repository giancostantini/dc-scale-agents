"use client";

/**
 * Wrapper que decide si renderizar el ConsultantWidget según la ruta actual.
 *
 * Se monta a nivel root layout. Lee `usePathname()` para excluir:
 *   - `/`               → login
 *   - `/auth/*`         → reset password, forgot, etc.
 *   - `/portal/*`       → portal del cliente final (usan otro consultor)
 *
 * El widget en sí también filtra por profile.role !== 'client' como
 * defensa en profundidad.
 */

import { usePathname } from "next/navigation";
import ConsultantWidget from "./ConsultantWidget";

function shouldMount(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname === "/") return false;
  if (pathname.startsWith("/auth")) return false;
  if (pathname.startsWith("/portal")) return false;
  if (pathname.startsWith("/api")) return false;
  return true;
}

export default function ConsultantWidgetMount() {
  const pathname = usePathname();
  if (!shouldMount(pathname)) return null;
  return <ConsultantWidget />;
}
