"use client";

/**
 * Monta el DailyBriefModal solo en las rutas internas del equipo/dirección.
 * Excluye login, auth, portal del cliente y API. El modal en sí:
 *   · sale temprano si el rol es "client",
 *   · se muestra una sola vez por día (localStorage por usuario+fecha).
 */

import { usePathname } from "next/navigation";
import DailyBriefModal from "./DailyBriefModal";

function shouldMount(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname === "/") return false;
  if (pathname.startsWith("/auth")) return false;
  if (pathname.startsWith("/portal")) return false;
  if (pathname.startsWith("/api")) return false;
  return true;
}

export default function DailyBriefMount() {
  const pathname = usePathname();
  if (!shouldMount(pathname)) return null;
  return <DailyBriefModal />;
}
