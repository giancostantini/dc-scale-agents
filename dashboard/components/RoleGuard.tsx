"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getCurrentProfile,
  hasSession,
  hasPipelineAccess,
  hasFinanzasAccess,
  type UserRole,
  type Profile,
} from "@/lib/supabase/auth";

type Permission = "pipeline" | "finanzas";

interface RoleGuardProps {
  /** Roles permitidos. Si el usuario no está en la lista, redirect. */
  roles?: UserRole[];
  /** Permisos granulares requeridos (además del rol). */
  permissions?: Permission[];
  /** A dónde redirigir si no cumple. Default: /hub o /portal según rol. */
  redirectTo?: string;
  /** Children solo se renderizan si pasa el check. */
  children: (profile: Profile) => React.ReactNode;
}

/**
 * Wrapper que valida sesión + rol + permisos antes de renderizar.
 * Pendant client-side de las RLS — la DB sigue siendo la autoridad.
 */
export default function RoleGuard({
  roles,
  permissions,
  redirectTo,
  children,
}: RoleGuardProps) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);

  useEffect(() => {
    hasSession().then(async (has) => {
      if (!has) {
        router.replace("/");
        return;
      }
      const p = await getCurrentProfile();
      if (!p) {
        router.replace("/");
        return;
      }

      // Check de role
      if (roles && !roles.includes(p.role)) {
        const fallback =
          redirectTo ?? (p.role === "client" ? "/portal" : "/hub");
        router.replace(fallback);
        return;
      }

      // Check de permisos
      if (permissions) {
        for (const perm of permissions) {
          if (perm === "pipeline" && !hasPipelineAccess(p)) {
            router.replace(redirectTo ?? "/hub");
            return;
          }
          if (perm === "finanzas" && !hasFinanzasAccess(p)) {
            router.replace(redirectTo ?? "/hub");
            return;
          }
        }
      }

      setProfile(p);
    });
  }, [router, roles?.join(","), permissions?.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  if (profile === undefined) return null;
  if (profile === null) return null;

  return <>{children(profile)}</>;
}
