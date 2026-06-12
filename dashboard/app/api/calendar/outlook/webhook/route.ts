/**
 * POST /api/calendar/outlook/webhook
 *
 * Receptor de notificaciones de Microsoft Graph para events. Cada
 * notificación trae un `subscriptionId` — buscamos en outlook_connections
 * a qué user pertenece, obtenemos su access_token (con auto-refresh),
 * y fetcheamos el evento.
 *
 * Persistencia en cal_events:
 *   - owner_user_id = el user dueño de la subscription
 *   - external_id   = eventId de Microsoft (UNIQUE → upsert idempotente)
 *   - client_id     = se setea si:
 *       (a) el user es role='client' → su propio client_id
 *       (b) el user es team/director Y algún attendee.email matchea
 *           clients.contact_email → ese cliente
 *       Si no aplica ninguna, queda NULL (evento personal del user).
 *
 * Auth: ninguna del lado HTTP — Microsoft no envía Bearer. La autenticidad
 * se valida con `clientState` que solo nosotros conocemos.
 */

import { NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fetchEvent, getUserAccessToken } from "@/lib/microsoft-graph";
import { safeEqual } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

interface ChangeNotification {
  subscriptionId: string;
  clientState?: string;
  changeType: "created" | "updated" | "deleted";
  resource: string;
  resourceData: { id: string };
  subscriptionExpirationDateTime?: string;
  tenantId?: string;
}

interface NotificationBody {
  value: ChangeNotification[];
}

export async function POST(req: NextRequest) {
  // ===== 1. Validation handshake (subscription handshake) =====
  const validationToken = req.nextUrl.searchParams.get("validationToken");
  if (validationToken) {
    return new Response(validationToken, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const expectedClientState = process.env.MS_WEBHOOK_CLIENT_STATE?.trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!expectedClientState || !url || !serviceKey) {
    console.error("[outlook/webhook] env vars faltantes");
    return Response.json({ error: "Servidor no configurado" }, { status: 500 });
  }

  let body: NotificationBody;
  try {
    body = (await req.json()) as NotificationBody;
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }
  if (!Array.isArray(body.value)) {
    return Response.json({ error: "value[] missing" }, { status: 400 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const results: Array<{ id: string; ok: boolean; reason?: string }> = [];

  for (const notif of body.value) {
    if (!notif.clientState || !safeEqual(notif.clientState, expectedClientState)) {
      results.push({
        id: notif.resourceData.id,
        ok: false,
        reason: "clientState mismatch",
      });
      continue;
    }

    try {
      const processed = await processNotification(admin, notif);
      results.push({ id: notif.resourceData.id, ...processed });
    } catch (err) {
      console.error("[outlook/webhook] error procesando notif:", err);
      results.push({
        id: notif.resourceData.id,
        ok: false,
        reason: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  return Response.json({ processed: results.length, results });
}

// ---------------------------------------------------------------------------
// Procesamiento per-notification
// ---------------------------------------------------------------------------

interface ProcessResult {
  ok: boolean;
  reason?: string;
}

async function processNotification(
  admin: SupabaseClient,
  notif: ChangeNotification,
): Promise<ProcessResult> {
  // 1. Identificar al user dueño de la subscription
  const { data: conn } = await admin
    .from("outlook_connections")
    .select("user_id")
    .eq("subscription_id", notif.subscriptionId)
    .maybeSingle();

  if (!conn) {
    return { ok: false, reason: "no connection for subscription" };
  }
  const userId = conn.user_id as string;

  // 2. Si es delete, lo aplicamos sin fetch
  if (notif.changeType === "deleted") {
    await admin
      .from("cal_events")
      .delete()
      .eq("external_id", notif.resourceData.id);
    await admin
      .from("outlook_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("user_id", userId);
    return { ok: true };
  }

  // 3. Fetch del evento con el token del user
  const accessToken = await getUserAccessToken(admin, userId);
  const event = await fetchEvent(accessToken, notif.resourceData.id);

  if (!event || event.isCancelled) {
    await admin
      .from("cal_events")
      .delete()
      .eq("external_id", notif.resourceData.id);
    return { ok: true, reason: "deleted/cancelled" };
  }

  // 4. Resolver client_id según rol del user
  const { data: profile } = await admin
    .from("profiles")
    .select("role, client_id")
    .eq("id", userId)
    .maybeSingle();

  let resolvedClientId: string | null = null;
  // client_label es NOT NULL en cal_events — sin valor el INSERT falla en
  // silencio. Resolvemos el nombre del cliente si matchea; si no, "Personal".
  let resolvedClientLabel = "Personal";
  if (profile?.role === "client" && profile.client_id) {
    resolvedClientId = profile.client_id;
    const { data: ownClient } = await admin
      .from("clients")
      .select("name")
      .eq("id", profile.client_id)
      .maybeSingle();
    resolvedClientLabel = ownClient?.name ?? profile.client_id;
  } else {
    // team/director — match por attendees
    const attendeeEmails = (event.attendees ?? [])
      .map((a) => a.emailAddress.address?.toLowerCase())
      .filter((e): e is string => Boolean(e));
    if (attendeeEmails.length > 0) {
      const { data: matched } = await admin
        .from("clients")
        .select("id, name")
        .in("contact_email", attendeeEmails)
        .limit(1);
      const m = matched?.[0];
      if (m) {
        resolvedClientId = m.id;
        resolvedClientLabel = m.name;
      }
    }
  }

  // 5. Guardar el evento.
  // El índice único de external_id es PARCIAL (WHERE external_id IS NOT NULL) y
  // Postgres NO lo matchea con `ON CONFLICT (external_id)` sin el predicado, así
  // que el upsert fallaba y NINGÚN evento se guardaba (silencioso). Resolvemos
  // el conflicto en código: buscar por external_id → update | insert.
  if (!event.start?.dateTime) {
    await recordSyncError(admin, userId, `evento sin start.dateTime (${event.id})`);
    return { ok: false, reason: "evento sin start.dateTime" };
  }
  const startDate = event.start.dateTime.slice(0, 10);
  const startTime = event.start.dateTime.slice(11, 16);

  const row = {
    owner_user_id: userId,
    client_id: resolvedClientId,
    client_label: resolvedClientLabel,
    title: event.subject || "(sin título)",
    date: startDate,
    time: startTime,
    type: "reunion",
    meet_link: event.onlineMeeting?.joinUrl ?? event.webLink ?? null,
    synced: true,
    external_id: event.id,
    source: "outlook",
  };

  const { data: existing } = await admin
    .from("cal_events")
    .select("id")
    .eq("external_id", event.id)
    .maybeSingle();

  const writeErr = existing
    ? (await admin.from("cal_events").update(row).eq("id", existing.id)).error
    : (await admin.from("cal_events").insert(row)).error;

  if (writeErr) {
    await recordSyncError(admin, userId, `guardar evento: ${writeErr.message}`);
    return { ok: false, reason: `write failed: ${writeErr.message}` };
  }

  await admin
    .from("outlook_connections")
    .update({
      last_synced_at: new Date().toISOString(),
      last_error: null,
      last_error_at: null,
    })
    .eq("user_id", userId);

  return { ok: true };
}

/** Persiste un error de sync en la conexión para que se vea en /debug. */
async function recordSyncError(
  admin: SupabaseClient,
  userId: string,
  message: string,
): Promise<void> {
  await admin
    .from("outlook_connections")
    .update({ last_error: message, last_error_at: new Date().toISOString() })
    .eq("user_id", userId);
}
