/**
 * POST /api/calendar/outlook/webhook
 *
 * Receptor de notificaciones de Microsoft Graph para events. Cada
 * notificación trae un `subscriptionId` — buscamos en outlook_connections
 * a qué user pertenece, obtenemos su access_token (con auto-refresh),
 * y fetcheamos el evento.
 *
 * Persistencia en cal_events (vía upsertOutlookEvent de lib/outlook-sync.ts,
 * compartido con la reconciliación periódica):
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
import { reconcileOutlookUser, upsertOutlookEvent } from "@/lib/outlook-sync";
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

  // 4. Serie recurrente: el webhook trae el seriesMaster (una sola fila con la
  //    primera fecha). Las ocurrencias las carga la reconciliación, una por día.
  if (event.type === "seriesMaster") {
    await reconcileOutlookUser(admin, userId);
    return { ok: true, reason: "serie recurrente → reconciliado" };
  }

  // 5. Guardar el evento (misma lógica que la reconciliación).
  const writeErr = await upsertOutlookEvent(admin, userId, event);
  if (writeErr) {
    await recordSyncError(admin, userId, writeErr);
    return { ok: false, reason: writeErr };
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
