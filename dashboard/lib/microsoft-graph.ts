/**
 * Microsoft Graph — helpers minimal para sync de calendario.
 *
 * Auth: client_credentials grant (app-only). Requiere registrar una app en
 * Azure AD con permiso `Calendars.Read` (Application). El director da
 * admin consent una vez; después la app accede al mailbox del director
 * vía app token sin interacción de user.
 *
 * Env vars:
 *   MS_TENANT_ID         — GUID del tenant Azure AD
 *   MS_CLIENT_ID         — application (client) id de la app registrada
 *   MS_CLIENT_SECRET     — client secret de la app
 *   MS_DIRECTOR_USER_ID  — ObjectId del director en Azure AD
 *                          (usuario cuyo calendario se sincroniza)
 *   MS_WEBHOOK_URL       — URL pública del endpoint webhook
 *                          (ej. https://sistemadearmascostantini.com/api/calendar/outlook/webhook)
 *   MS_WEBHOOK_CLIENT_STATE — string secreto que Microsoft rebota en cada
 *                          notificación; validamos para descartar requests falsas.
 *
 * Setup manual (una sola vez):
 *   1. portal.azure.com → App registrations → New
 *   2. API permissions → Microsoft Graph → Application → Calendars.Read
 *   3. Grant admin consent (con cuenta director)
 *   4. Certificates & secrets → New client secret → guardar valor
 *   5. Setear las 5 env vars de arriba en Vercel
 *   6. Llamar POST /api/calendar/outlook/subscribe (una vez) para arrancar
 */

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const TOKEN_TTL_BUFFER_MS = 5 * 60 * 1000; // 5min antes de expirar, renovamos

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

/**
 * Obtiene un app-only access token via client_credentials. Cachea hasta
 * 5min antes de expirar. Tokens dura típicamente 1h.
 */
export async function getAppToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + TOKEN_TTL_BUFFER_MS) {
    return cachedToken.token;
  }

  const tenant = requireEnv("MS_TENANT_ID");
  const clientId = requireEnv("MS_CLIENT_ID");
  const clientSecret = requireEnv("MS_CLIENT_SECRET");

  const res = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Microsoft auth failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number; // seconds
  };

  cachedToken = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };

  return data.access_token;
}

export interface OutlookAttendee {
  emailAddress: { address: string; name?: string };
  status?: { response?: string };
  type?: "required" | "optional" | "resource";
}

export interface OutlookEvent {
  id: string;
  subject: string;
  bodyPreview?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  isCancelled: boolean;
  attendees?: OutlookAttendee[];
  organizer?: { emailAddress: { address: string; name?: string } };
  onlineMeeting?: { joinUrl?: string };
  webLink?: string;
}

/**
 * GET /users/{userId}/events/{eventId} — recupera el detalle de un evento
 * a partir del `resourceData.id` que viene en el webhook.
 */
export async function fetchEvent(
  userId: string,
  eventId: string,
): Promise<OutlookEvent | null> {
  const token = await getAppToken();
  const res = await fetch(
    `${GRAPH_BASE}/users/${encodeURIComponent(userId)}/events/${encodeURIComponent(eventId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Graph fetchEvent failed (${res.status}): ${body}`);
  }
  return (await res.json()) as OutlookEvent;
}

export interface SubscriptionInput {
  resource: string;
  changeType: "created,updated,deleted" | "created" | "updated" | "deleted";
  notificationUrl: string;
  clientState: string;
  expirationMinutesFromNow?: number; // default: 4230 (~2.94 días)
}

export interface SubscriptionResponse {
  id: string;
  resource: string;
  expirationDateTime: string; // ISO
  clientState?: string;
}

/**
 * POST /subscriptions — crea una nueva subscription. Para eventos de
 * calendario, el TTL máximo es ~3 días (4230 minutos). Devolvemos el
 * subscription_id y expires_at para persistir.
 */
export async function createSubscription(
  input: SubscriptionInput,
): Promise<SubscriptionResponse> {
  const token = await getAppToken();
  const minutes = input.expirationMinutesFromNow ?? 4230;
  const expires = new Date(Date.now() + minutes * 60 * 1000).toISOString();

  const res = await fetch(`${GRAPH_BASE}/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      changeType: input.changeType,
      notificationUrl: input.notificationUrl,
      resource: input.resource,
      expirationDateTime: expires,
      clientState: input.clientState,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Graph createSubscription failed (${res.status}): ${body}`);
  }
  return (await res.json()) as SubscriptionResponse;
}

/**
 * PATCH /subscriptions/{id} — renueva el expirationDateTime. Si la
 * subscription ya expiró (404), el caller la recrea.
 */
export async function renewSubscription(
  subscriptionId: string,
  expirationMinutesFromNow: number = 4230,
): Promise<SubscriptionResponse | null> {
  const token = await getAppToken();
  const expires = new Date(
    Date.now() + expirationMinutesFromNow * 60 * 1000,
  ).toISOString();

  const res = await fetch(
    `${GRAPH_BASE}/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expirationDateTime: expires }),
    },
  );

  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Graph renewSubscription failed (${res.status}): ${body}`);
  }
  return (await res.json()) as SubscriptionResponse;
}

/**
 * DELETE /subscriptions/{id} — cierra la subscription. Útil si queremos
 * desactivar el sync (ej. cambio de tenant) o cleanup.
 */
export async function deleteSubscription(
  subscriptionId: string,
): Promise<boolean> {
  const token = await getAppToken();
  const res = await fetch(
    `${GRAPH_BASE}/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  return res.ok || res.status === 404;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim().length === 0) {
    throw new Error(`Env var ${name} no configurada para Microsoft Graph`);
  }
  return v.trim();
}
