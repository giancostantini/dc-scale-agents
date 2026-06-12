/**
 * Guards de autenticación + autorización para route handlers que usan
 * service-role (que bypassa RLS).
 *
 * SEGURIDAD: un endpoint service-role que no valida al caller deja a cualquiera
 * leer/escribir datos. `getUser()` solo no alcanza para endpoints por-cliente:
 * hay que verificar acceso al cliente ESPECÍFICO (si no, IDOR cross-tenant).
 *
 * Resolución de identidad (sin tocar los callers):
 *   1. Sesión por COOKIE (@supabase/ssr) — mecanismo por defecto del dashboard;
 *      la cookie viaja sola en cada fetch same-origin.
 *   2. Fallback: header `Authorization: Bearer <access_token>`.
 *
 * Reglas de acceso por cliente:
 *   - director → global
 *   - team     → solo clientes con asignación en `client_assignments`
 *   - client   → solo su propio `client_id`
 */

import { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export type ClientRole = "director" | "team" | "client";

interface ResolvedUser {
  id: string;
  email: string | null;
}

function resp(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

/** Resuelve el user del caller por cookie (primario) o Bearer (fallback). */
async function resolveUser(
  req: NextRequest,
): Promise<{ user: ResolvedUser | null; serverError: boolean }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { user: null, serverError: true };

  // 1. Sesión por cookie (@supabase/ssr).
  try {
    const supa = createServerClient(url, anonKey, {
      cookies: {
        getAll: () =>
          req.cookies.getAll().map((c) => ({ name: c.name, value: c.value })),
        setAll: () => {
          /* route handler read-only: no seteamos cookies acá */
        },
      },
    });
    const { data } = await supa.auth.getUser();
    if (data.user) {
      return {
        user: { id: data.user.id, email: data.user.email ?? null },
        serverError: false,
      };
    }
  } catch {
    /* probamos Bearer */
  }

  // 2. Fallback: Authorization: Bearer <token>.
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (token) {
    try {
      const c = createClient(url, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data } = await c.auth.getUser();
      if (data.user) {
        return {
          user: { id: data.user.id, email: data.user.email ?? null },
          serverError: false,
        };
      }
    } catch {
      /* cae a no autenticado */
    }
  }

  return { user: null, serverError: false };
}

export type ClientAccess =
  | { ok: true; userId: string; email: string | null; role: ClientRole }
  | { ok: false; response: Response };

/** Exige que el caller esté autenticado Y tenga acceso al cliente `clientId`. */
export async function requireClientAccess(
  req: NextRequest,
  clientId: string,
): Promise<ClientAccess> {
  const { user, serverError } = await resolveUser(req);
  if (serverError)
    return { ok: false, response: resp(500, "Servidor no configurado (Supabase).") };
  if (!user) return { ok: false, response: resp(401, "No autenticado") };

  const admin = getSupabaseAdmin();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, client_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return { ok: false, response: resp(403, "Perfil no encontrado") };

  const role = profile.role as ClientRole;
  const granted = {
    ok: true as const,
    userId: user.id,
    email: user.email,
    role,
  };

  if (role === "director") return granted;

  if (role === "client") {
    if (profile.client_id === clientId) return granted;
    return { ok: false, response: resp(403, "Sin acceso a este cliente") };
  }

  if (role === "team") {
    const { data: assignment } = await admin
      .from("client_assignments")
      .select("user_id")
      .eq("client_id", clientId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (assignment) return granted;
    return { ok: false, response: resp(403, "Sin acceso a este cliente") };
  }

  return { ok: false, response: resp(403, "Rol no autorizado") };
}

export type RoleAccess =
  | { ok: true; userId: string; email: string | null; role: ClientRole }
  | { ok: false; response: Response };

/**
 * Exige que el caller esté autenticado y tenga uno de los roles permitidos.
 * Para endpoints NO atados a un cliente (diag, bootstrap, dispatch global…).
 */
export async function requireRole(
  req: NextRequest,
  allowed: ClientRole[],
): Promise<RoleAccess> {
  const { user, serverError } = await resolveUser(req);
  if (serverError)
    return { ok: false, response: resp(500, "Servidor no configurado (Supabase).") };
  if (!user) return { ok: false, response: resp(401, "No autenticado") };

  const admin = getSupabaseAdmin();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return { ok: false, response: resp(403, "Perfil no encontrado") };

  const role = profile.role as ClientRole;
  if (allowed.includes(role))
    return { ok: true, userId: user.id, email: user.email, role };
  return { ok: false, response: resp(403, "Sin permisos suficientes") };
}

/** Comparación de strings en tiempo constante (evita timing attacks). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Guard para endpoints INTERNOS (server-to-server / cron). Valida el header
 * `x-internal-secret` contra CRON_SECRET con comparación timing-safe. No es
 * auth de usuario: lo usan rutas que se llaman entre sí (ej. dispatch-email).
 */
export function requireInternalSecret(
  req: NextRequest,
): { ok: true } | { ok: false; response: Response } {
  const secret = process.env.CRON_SECRET?.trim();
  const provided = req.headers.get("x-internal-secret")?.trim();
  if (!secret || !provided || !safeEqual(secret, provided)) {
    return { ok: false, response: resp(401, "No autorizado") };
  }
  return { ok: true };
}
