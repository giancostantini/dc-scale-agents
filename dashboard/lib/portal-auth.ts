/**
 * Auth de endpoints del portal (role='client'). Mismo patrón que el resto del
 * portal: el cliente manda su token (Bearer), validamos con el cliente anon de
 * Supabase (getUser) y resolvemos su client_id desde el perfil (NUNCA de la
 * URL). Si valida, el endpoint usa service-role para tocar las tablas de la
 * bóveda (que son service-role-only).
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export type PortalClientResult =
  | { ok: true; clientId: string; userId: string; email: string | null }
  | { ok: false; response: Response };

export async function requirePortalClient(
  req: NextRequest,
): Promise<PortalClientResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return {
      ok: false,
      response: Response.json(
        { error: "Servidor no configurado." },
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

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: Response.json({ error: "No autenticado" }, { status: 401 }),
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, client_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "client" || !profile.client_id) {
    return {
      ok: false,
      response: Response.json(
        { error: "Solo clientes pueden acceder a su bóveda." },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true,
    clientId: profile.client_id as string,
    userId: user.id,
    email: user.email ?? null,
  };
}
