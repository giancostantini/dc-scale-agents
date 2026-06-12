/**
 * GET /api/calendar/outlook/debug
 *
 * Diagnóstico de la sync de Outlook (solo director/team). Read-only. Devuelve
 * el estado de las conexiones (subscription viva?, último error, última sync) y
 * los últimos eventos source='outlook' tal como quedaron guardados (fecha/hora)
 * para detectar si el problema es de sync (no llegan) o de fecha (timezone).
 *
 * Se abre en el navegador estando logueado (auth por cookie). No expone tokens
 * ni el subscription_id completo.
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const access = await requireRole(req, ["director", "team"]);
  if (!access.ok) return access.response;

  const admin = getSupabaseAdmin();
  const nowMs = Date.now();

  const { data: conns } = await admin
    .from("outlook_connections")
    .select(
      "user_id, ms_email, connected_at, last_synced_at, subscription_id, subscription_expires_at, last_error, last_error_at",
    );

  const connections = (conns ?? []).map((c) => {
    const expMs = c.subscription_expires_at
      ? new Date(c.subscription_expires_at as string).getTime()
      : 0;
    const lastSyncMs = c.last_synced_at
      ? new Date(c.last_synced_at as string).getTime()
      : 0;
    return {
      ms_email: c.ms_email,
      connected_at: c.connected_at,
      last_synced_at: c.last_synced_at,
      last_synced_hace_min: lastSyncMs
        ? Math.round((nowMs - lastSyncMs) / 60000)
        : null,
      has_subscription: !!c.subscription_id,
      subscription_expires_at: c.subscription_expires_at,
      subscription_activa: expMs > nowMs,
      subscription_vence_en_horas: expMs
        ? Math.round((expMs - nowMs) / 3600000)
        : null,
      last_error: c.last_error,
      last_error_at: c.last_error_at,
    };
  });

  const { data: events } = await admin
    .from("cal_events")
    .select(
      "title, date, time, source, client_label, owner_user_id, external_id, created_at",
    )
    .eq("source", "outlook")
    .order("created_at", { ascending: false })
    .limit(15);

  const { count: outlookCount } = await admin
    .from("cal_events")
    .select("id", { count: "exact", head: true })
    .eq("source", "outlook");

  return Response.json({
    now: new Date(nowMs).toISOString(),
    server_tz_offset_min: new Date().getTimezoneOffset(),
    connections,
    outlook_events_count: outlookCount ?? 0,
    recent_outlook_events: (events ?? []).map((e) => ({
      title: e.title,
      date: e.date,
      time: e.time,
      client_label: e.client_label,
      created_at: e.created_at,
      external_id_tail:
        typeof e.external_id === "string" ? e.external_id.slice(-8) : null,
    })),
  });
}
