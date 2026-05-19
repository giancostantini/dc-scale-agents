/**
 * POST /api/calendar/outlook/webhook
 *
 * Endpoint receptor de notificaciones de Microsoft Graph para eventos del
 * calendario del director. Por cada notificación:
 *   1. Valida clientState (anti-falsificación).
 *   2. Si changeType=deleted, borra de cal_events por external_id.
 *   3. Si changeType=created|updated, fetcha el evento via Graph API,
 *      busca un attendee cuyo email matchee con clients.contact_email,
 *      y upsertea a cal_events (PK external_id).
 *
 * Validation handshake:
 *   Microsoft envía un GET (en realidad un POST con query) con `validationToken`
 *   al crear la subscription — hay que devolverlo text/plain en <10s.
 *
 * No requiere auth (Microsoft no envía bearer). La autenticidad se valida
 * con `clientState` que solo el director conoce.
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchEvent } from "@/lib/microsoft-graph";

export const dynamic = "force-dynamic";

interface ChangeNotification {
  subscriptionId: string;
  clientState?: string;
  changeType: "created" | "updated" | "deleted";
  resource: string;
  resourceData: {
    "@odata.type"?: string;
    id: string; // event id
  };
  subscriptionExpirationDateTime?: string;
  tenantId?: string;
}

interface NotificationBody {
  value: ChangeNotification[];
}

export async function POST(req: NextRequest) {
  // ===== 1. Validation handshake =====
  // Microsoft envía validationToken como query param en la primera POST
  // del subscription handshake. Hay que devolver el token text/plain.
  const validationToken = req.nextUrl.searchParams.get("validationToken");
  if (validationToken) {
    return new Response(validationToken, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // ===== 2. Parse + clientState check =====
  let body: NotificationBody;
  try {
    body = (await req.json()) as NotificationBody;
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }
  if (!Array.isArray(body.value)) {
    return Response.json({ error: "value[] missing" }, { status: 400 });
  }

  const expectedClientState = process.env.MS_WEBHOOK_CLIENT_STATE?.trim();
  const directorUserId = process.env.MS_DIRECTOR_USER_ID?.trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!expectedClientState || !directorUserId || !url || !serviceKey) {
    console.error("[outlook/webhook] env vars faltantes");
    return Response.json({ error: "Servidor no configurado" }, { status: 500 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ===== 3. Procesar cada notificación =====
  // Microsoft espera 200 dentro de ~30s; si las notifs son varias y el
  // procesamiento se demora, idealmente respondemos 200 rápido y procesamos
  // async. Para empezar lo hacemos sincrónico — el matching por email es
  // rápido y Microsoft re-envía si tardamos.
  const results: Array<{ id: string; ok: boolean; reason?: string }> = [];

  for (const notif of body.value) {
    if (notif.clientState !== expectedClientState) {
      results.push({
        id: notif.resourceData.id,
        ok: false,
        reason: "clientState mismatch",
      });
      continue;
    }

    try {
      if (notif.changeType === "deleted") {
        await admin
          .from("cal_events")
          .delete()
          .eq("external_id", notif.resourceData.id);
        results.push({ id: notif.resourceData.id, ok: true });
        continue;
      }

      // created or updated → fetch event + upsert
      const event = await fetchEvent(directorUserId, notif.resourceData.id);
      if (!event || event.isCancelled) {
        // El evento desapareció o se canceló — limpiamos por las dudas
        await admin
          .from("cal_events")
          .delete()
          .eq("external_id", notif.resourceData.id);
        results.push({
          id: notif.resourceData.id,
          ok: true,
          reason: "deleted/cancelled",
        });
        continue;
      }

      const attendeeEmails = (event.attendees ?? [])
        .map((a) => a.emailAddress.address?.toLowerCase())
        .filter((e): e is string => Boolean(e));

      if (attendeeEmails.length === 0) {
        results.push({
          id: notif.resourceData.id,
          ok: false,
          reason: "no attendees",
        });
        continue;
      }

      // Match con un cliente por contact_email
      const { data: matchedClients } = await admin
        .from("clients")
        .select("id, contact_email, name")
        .in(
          "contact_email",
          attendeeEmails.map((e) => e),
        );

      const client = matchedClients?.[0];
      if (!client) {
        results.push({
          id: notif.resourceData.id,
          ok: false,
          reason: "no client matched",
        });
        continue;
      }

      // Build cal_events row
      const startDate = event.start.dateTime.slice(0, 10);
      const startTime = event.start.dateTime.slice(11, 16);

      await admin.from("cal_events").upsert(
        {
          client_id: client.id,
          title: event.subject || "(sin título)",
          date: startDate,
          time: startTime,
          type: "reunion",
          meet_link: event.onlineMeeting?.joinUrl ?? event.webLink ?? null,
          synced: true,
          external_id: event.id,
          source: "outlook",
        },
        { onConflict: "external_id" },
      );

      results.push({ id: event.id, ok: true });
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
