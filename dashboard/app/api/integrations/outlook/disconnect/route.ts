/**
 * POST /api/integrations/outlook/disconnect
 *
 * Limpia los tokens de Outlook del profile del caller. No revoca el
 * grant en Microsoft — el user puede hacerlo en
 * https://myaccount.microsoft.com/Permissions
 *
 * Auth: requiere session válida.
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { disconnectOutlook } from "@/lib/outlook";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return Response.json({ error: "Servidor no configurado." }, { status: 500 });
  }

  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) {
    return Response.json({ error: "Sin sesión" }, { status: 401 });
  }
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return Response.json({ error: "No autenticado" }, { status: 401 });

  await disconnectOutlook(user.id);
  return Response.json({ ok: true });
}
