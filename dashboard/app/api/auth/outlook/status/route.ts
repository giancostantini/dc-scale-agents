/**
 * GET /api/auth/outlook/status
 *
 * Devuelve el estado de conexión Outlook del user actual.
 *
 * Auth: Bearer del user.
 *
 * Response:
 *   {
 *     connected: boolean,
 *     msEmail?: string,
 *     connectedAt?: string,
 *     lastSyncedAt?: string | null,
 *     subscriptionExpiresAt?: string | null,
 *     lastError?: string | null
 *   }
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
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

  // No exponemos tokens ni subscription_id — solo metadata visible al user.
  const { data } = await admin
    .from("outlook_connections")
    .select(
      "ms_email, connected_at, last_synced_at, subscription_expires_at, last_error",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) {
    return Response.json({ connected: false });
  }

  return Response.json({
    connected: true,
    msEmail: data.ms_email,
    connectedAt: data.connected_at,
    lastSyncedAt: data.last_synced_at,
    subscriptionExpiresAt: data.subscription_expires_at,
    lastError: data.last_error,
  });
}
