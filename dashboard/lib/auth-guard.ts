/**
 * requireClientAccess — guard de autenticación + autorización por cliente.
 *
 * SEGURIDAD: usar en TODO endpoint que opere sobre datos de un cliente con
 * service-role (que bypassa RLS). No alcanza con validar `getUser()`: hay que
 * verificar que el caller tenga acceso al cliente ESPECÍFICO, si no cualquier
 * usuario logueado puede leer/escribir datos de otro cliente (IDOR).
 *
 * Reglas:
 *   - director → acceso global
 *   - team     → solo clientes con asignación en `client_assignments`
 *   - client   → solo su propio `client_id`
 *
 * Uso:
 *   const access = await requireClientAccess(req, clientId);
 *   if (!access.ok) return access.response;   // 401 / 403 / 500 ya formado
 *   // ... access.userId / access.role disponibles
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export type ClientRole = "director" | "team" | "client";

export type ClientAccess =
  | { ok: true; userId: string; email: string | null; role: ClientRole }
  | { ok: false; response: Response };

export async function requireClientAccess(
  req: NextRequest,
  clientId: string,
): Promise<ClientAccess> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return {
      ok: false,
      response: Response.json(
        { error: "Servidor no configurado (Supabase)." },
        { status: 500 },
      ),
    };
  }

  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) {
    return {
      ok: false,
      response: Response.json({ error: "Sin sesión" }, { status: 401 }),
    };
  }

  // Validamos el JWT del caller con el cliente anon (no service-role).
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user },
  } = await caller.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: Response.json({ error: "No autenticado" }, { status: 401 }),
    };
  }

  const admin = getSupabaseAdmin();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, client_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    return {
      ok: false,
      response: Response.json({ error: "Perfil no encontrado" }, { status: 403 }),
    };
  }

  const role = profile.role as ClientRole;
  const granted = { ok: true as const, userId: user.id, email: user.email ?? null, role };

  if (role === "director") return granted;

  if (role === "client") {
    if (profile.client_id === clientId) return granted;
    return {
      ok: false,
      response: Response.json({ error: "Sin acceso a este cliente" }, { status: 403 }),
    };
  }

  if (role === "team") {
    const { data: assignment } = await admin
      .from("client_assignments")
      .select("user_id")
      .eq("client_id", clientId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (assignment) return granted;
    return {
      ok: false,
      response: Response.json({ error: "Sin acceso a este cliente" }, { status: 403 }),
    };
  }

  return {
    ok: false,
    response: Response.json({ error: "Rol no autorizado" }, { status: 403 }),
  };
}
