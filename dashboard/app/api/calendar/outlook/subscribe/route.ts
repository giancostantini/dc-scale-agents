/**
 * POST /api/calendar/outlook/subscribe
 *
 * Renueva las subscriptions activas a Microsoft Graph. Modos:
 *
 *   - Cron (header `x-cron-secret`): itera TODAS las conexiones,
 *     renueva las que vencen en <2 días, recrea las que ya
 *     expiraron o no tienen subscription.
 *
 *   - User (Bearer): renueva/crea la subscription del user actual
 *     (útil para retry manual desde el frontend si quedó en error).
 *
 * Idempotente. Si Microsoft devuelve 404 al renovar (la subscription
 * caducó del lado MS), creamos una nueva.
 */

import { NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { safeEqual } from "@/lib/auth-guard";
import {
  createMeSubscription,
  getUserAccessToken,
  renewSubscription,
} from "@/lib/microsoft-graph";

export const dynamic = "force-dynamic";

// Renovar si la subscription expira en menos de este tiempo
const RENEW_THRESHOLD_MS = 36 * 60 * 60 * 1000; // 36h

interface ConnRow {
  user_id: string;
  subscription_id: string | null;
  subscription_expires_at: string | null;
}

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!url || !anonKey || !serviceKey) {
    return Response.json({ error: "Servidor no configurado" }, { status: 500 });
  }

  const providedCronSecret = req.headers.get("x-cron-secret");
  const isCron =
    !!cronSecret && !!providedCronSecret && safeEqual(providedCronSecret, cronSecret);

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ===== Modo cron: itera todas las conexiones =====
  if (isCron) {
    const { data: conns, error } = await admin
      .from("outlook_connections")
      .select("user_id, subscription_id, subscription_expires_at");
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    const results: Array<{ user_id: string; mode: string; ok: boolean; error?: string }> = [];
    for (const conn of (conns ?? []) as ConnRow[]) {
      try {
        const mode = await processOne(admin, conn);
        results.push({ user_id: conn.user_id, mode, ok: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown";
        await admin
          .from("outlook_connections")
          .update({ last_error: msg, last_error_at: new Date().toISOString() })
          .eq("user_id", conn.user_id);
        results.push({ user_id: conn.user_id, mode: "error", ok: false, error: msg });
      }
    }

    return Response.json({ processed: results.length, results });
  }

  // ===== Modo user: una sola conexión, la del Bearer =====
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

  const { data: conn } = await admin
    .from("outlook_connections")
    .select("user_id, subscription_id, subscription_expires_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!conn) {
    return Response.json(
      { error: "No tenés Outlook conectado. Conectalo primero." },
      { status: 404 },
    );
  }

  try {
    const mode = await processOne(admin, conn as ConnRow);
    return Response.json({ mode, ok: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "subscribe failed" },
      { status: 502 },
    );
  }
}

// ---------------------------------------------------------------------------
// Per-connection logic: renew si está cerca de expirar; create si no hay sub.
// ---------------------------------------------------------------------------

type Mode = "skipped" | "renewed" | "created";

async function processOne(
  admin: SupabaseClient,
  conn: ConnRow,
): Promise<Mode> {
  const now = Date.now();
  const expiresAt = conn.subscription_expires_at
    ? new Date(conn.subscription_expires_at).getTime()
    : 0;
  const timeLeft = expiresAt - now;

  // Si la sub vive >36h, no la tocamos
  if (conn.subscription_id && timeLeft > RENEW_THRESHOLD_MS) {
    return "skipped";
  }

  const accessToken = await getUserAccessToken(admin, conn.user_id);

  // Intentar renovar primero (si tenía subscription)
  if (conn.subscription_id && timeLeft > 0) {
    const renewed = await renewSubscription(accessToken, conn.subscription_id);
    if (renewed) {
      await admin
        .from("outlook_connections")
        .update({
          subscription_expires_at: renewed.expirationDateTime,
          last_error: null,
          last_error_at: null,
        })
        .eq("user_id", conn.user_id);
      return "renewed";
    }
    // renewed === null → 404, recrear abajo
  }

  // Crear nueva
  const created = await createMeSubscription(accessToken);
  await admin
    .from("outlook_connections")
    .update({
      subscription_id: created.id,
      subscription_expires_at: created.expirationDateTime,
      last_error: null,
      last_error_at: null,
    })
    .eq("user_id", conn.user_id);
  return "created";
}
