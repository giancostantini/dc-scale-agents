/**
 * POST /api/auth/outlook/disconnect
 *
 * Desconecta el Outlook del user actual: borra la subscription de
 * Microsoft (si existe) y borra la row de outlook_connections.
 *
 * No borra los eventos ya sincronizados en cal_events — quedan visibles
 * (el user puede borrarlos manualmente si quiere). Esto es deliberado:
 * si el user se reconecta más tarde, sus eventos no se re-sincronizan
 * porque external_id es UNIQUE.
 *
 * Auth: Bearer del user.
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  deleteSubscription,
  getUserAccessToken,
} from "@/lib/microsoft-graph";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    return Response.json({ error: "Servidor no configurado" }, { status: 500 });
  }

  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return Response.json({ error: "Sin sesión" }, { status: 401 });

  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user },
  } = await callerClient.auth.getUser();
  if (!user) return Response.json({ error: "No autenticado" }, { status: 401 });

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: conn } = await admin
    .from("outlook_connections")
    .select("subscription_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!conn) {
    return Response.json({ disconnected: false, reason: "no connection" });
  }

  // Best-effort: borrar subscription de Microsoft. Si falla, igual
  // borramos la row local (token revoked / subscription expired).
  if (conn.subscription_id) {
    try {
      const accessToken = await getUserAccessToken(admin, user.id);
      await deleteSubscription(accessToken, conn.subscription_id);
    } catch (err) {
      console.warn(
        "[outlook/disconnect] deleteSubscription falló (igual borramos local):",
        err,
      );
    }
  }

  const { error: deleteErr } = await admin
    .from("outlook_connections")
    .delete()
    .eq("user_id", user.id);

  if (deleteErr) {
    return Response.json({ error: deleteErr.message }, { status: 500 });
  }

  return Response.json({ disconnected: true });
}
