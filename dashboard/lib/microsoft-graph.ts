/**
 * Microsoft Graph — OAuth delegated flow + helpers para sync de calendario.
 *
 * Cada usuario conecta su propio Outlook vía OAuth (consent screen
 * personal). Persistimos refresh_token cifrado en outlook_connections.
 * Cuando hace falta llamar Graph, intercambiamos el refresh_token por
 * un access_token fresco si el cacheado expiró.
 *
 * Env vars:
 *   MS_TENANT_ID                 — GUID del tenant (puede ser "common"
 *                                  para multi-tenant; usamos el GUID)
 *   MS_CLIENT_ID                 — application (client) id
 *   MS_CLIENT_SECRET             — client secret
 *   MS_REDIRECT_URI              — https://.../api/auth/outlook/callback
 *   MS_WEBHOOK_URL               — URL pública del webhook
 *   MS_WEBHOOK_CLIENT_STATE      — secreto que rebotamos en notifs
 *   OUTLOOK_TOKEN_ENCRYPTION_KEY — clave AES-256 hex (32 bytes)
 *
 * Scopes que pedimos:
 *   - User.Read       → necesario para obtener email del user
 *   - Calendars.Read  → leer eventos
 *   - offline_access  → emitir refresh_token
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken, encryptToken } from "@/lib/token-crypto";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const TOKEN_TTL_BUFFER_MS = 5 * 60 * 1000; // refresh 5min antes de expirar

// Graph devuelve start/end en UTC por defecto. Pedimos que los convierta a la
// timezone de la agencia (UY) con el header `Prefer: outlook.timezone`, así el
// webhook guarda fecha+hora LOCALES. Sin esto, un evento de las 21:00 UY se
// guardaba como el día siguiente 00:00 UTC y "desaparecía" del día correcto.
const CALENDAR_TIMEZONE =
  process.env.APP_TIMEZONE?.trim() || "America/Montevideo";

export const OAUTH_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "User.Read",
  "Calendars.Read",
].join(" ");

// ---------------------------------------------------------------------------
// OAuth: building URL + code exchange
// ---------------------------------------------------------------------------

function authBaseUrl(): string {
  const tenant = requireEnv("MS_TENANT_ID");
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0`;
}

/**
 * URL para mandar al user al consent screen de Microsoft. `state` es
 * opaque (CSRF + returnTo): lo emite el endpoint /start, lo valida el
 * callback.
 */
export function buildAuthorizationUrl(state: string): string {
  const clientId = requireEnv("MS_CLIENT_ID");
  const redirectUri = requireEnv("MS_REDIRECT_URI");
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: OAUTH_SCOPES,
    state,
    prompt: "select_account", // permitir al user elegir si tiene varias cuentas
  });
  return `${authBaseUrl()}/authorize?${params.toString()}`;
}

export interface TokenSet {
  access_token: string;
  refresh_token: string;
  expires_in: number; // segundos
  scope: string;
  token_type: string;
  id_token?: string;
}

export async function exchangeCodeForTokens(code: string): Promise<TokenSet> {
  const clientId = requireEnv("MS_CLIENT_ID");
  const clientSecret = requireEnv("MS_CLIENT_SECRET");
  const redirectUri = requireEnv("MS_REDIRECT_URI");

  const res = await fetch(`${authBaseUrl()}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      scope: OAUTH_SCOPES,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OAuth code exchange failed (${res.status}): ${body}`);
  }
  return (await res.json()) as TokenSet;
}

async function refreshAccessToken(refreshToken: string): Promise<TokenSet> {
  const clientId = requireEnv("MS_CLIENT_ID");
  const clientSecret = requireEnv("MS_CLIENT_SECRET");

  const res = await fetch(`${authBaseUrl()}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: OAUTH_SCOPES,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OAuth refresh failed (${res.status}): ${body}`);
  }
  return (await res.json()) as TokenSet;
}

// ---------------------------------------------------------------------------
// Per-user access token (con auto-refresh)
// ---------------------------------------------------------------------------

/**
 * Devuelve un access_token válido para el user, refrescando si está
 * por expirar. Persiste el nuevo token cifrado en outlook_connections.
 * Lanza si el user no tiene conexión.
 *
 * NOTA: requiere el admin Supabase client (service role).
 */
export async function getUserAccessToken(
  admin: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data: conn, error } = await admin
    .from("outlook_connections")
    .select("access_token_encrypted, access_token_expires_at, refresh_token_encrypted")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`outlook_connections lookup failed: ${error.message}`);
  }
  if (!conn) {
    throw new Error(`No Outlook connection for user ${userId}`);
  }

  const now = Date.now();
  const expiresAt = new Date(conn.access_token_expires_at as string).getTime();

  // Si todavía está fresco, devolver el cacheado descifrado
  if (expiresAt > now + TOKEN_TTL_BUFFER_MS) {
    return decryptToken(conn.access_token_encrypted as string);
  }

  // Refresh
  const refreshToken = decryptToken(conn.refresh_token_encrypted as string);
  const fresh = await refreshAccessToken(refreshToken);
  const newExpiresAt = new Date(
    now + fresh.expires_in * 1000,
  ).toISOString();

  // Microsoft puede rotar el refresh_token; si vino uno nuevo, persistir.
  const updates: Record<string, string> = {
    access_token_encrypted: encryptToken(fresh.access_token),
    access_token_expires_at: newExpiresAt,
  };
  if (fresh.refresh_token) {
    updates.refresh_token_encrypted = encryptToken(fresh.refresh_token);
  }

  await admin
    .from("outlook_connections")
    .update(updates)
    .eq("user_id", userId);

  return fresh.access_token;
}

// ---------------------------------------------------------------------------
// Graph API calls — con token delegated del user
// ---------------------------------------------------------------------------

export interface GraphMeProfile {
  id: string;           // ObjectId
  mail?: string;
  userPrincipalName?: string;
  displayName?: string;
}

export async function fetchMeProfile(
  accessToken: string,
): Promise<GraphMeProfile> {
  const res = await fetch(`${GRAPH_BASE}/me?$select=id,mail,userPrincipalName,displayName`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Graph /me failed (${res.status}): ${body}`);
  }
  return (await res.json()) as GraphMeProfile;
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
 * GET /me/events/{id} con delegated token. Funciona porque el user que
 * conectó posee el evento (es organizer o attendee con acceso).
 */
export async function fetchEvent(
  accessToken: string,
  eventId: string,
): Promise<OutlookEvent | null> {
  const res = await fetch(
    `${GRAPH_BASE}/me/events/${encodeURIComponent(eventId)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        // Pedir start/end ya convertidos a la timezone local (no UTC).
        Prefer: `outlook.timezone="${CALENDAR_TIMEZONE}"`,
      },
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Graph fetchEvent failed (${res.status}): ${body}`);
  }
  return (await res.json()) as OutlookEvent;
}

// ---------------------------------------------------------------------------
// Subscriptions (per-user, sobre /me/events)
// ---------------------------------------------------------------------------

export interface SubscriptionResponse {
  id: string;
  resource: string;
  expirationDateTime: string;
  clientState?: string;
}

const SUBSCRIPTION_MAX_MINUTES = 4230; // ~2.94 días — máximo para events

/**
 * Crea una subscription delegada al /me/events del user. Microsoft envía
 * notifs al MS_WEBHOOK_URL cuando hay create/update/delete.
 */
export async function createMeSubscription(
  accessToken: string,
): Promise<SubscriptionResponse> {
  const notificationUrl = requireEnv("MS_WEBHOOK_URL");
  const clientState = requireEnv("MS_WEBHOOK_CLIENT_STATE");
  const expires = new Date(
    Date.now() + SUBSCRIPTION_MAX_MINUTES * 60 * 1000,
  ).toISOString();

  const res = await fetch(`${GRAPH_BASE}/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      changeType: "created,updated,deleted",
      notificationUrl,
      resource: "/me/events",
      expirationDateTime: expires,
      clientState,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Graph createSubscription failed (${res.status}): ${body}`);
  }
  return (await res.json()) as SubscriptionResponse;
}

export async function renewSubscription(
  accessToken: string,
  subscriptionId: string,
): Promise<SubscriptionResponse | null> {
  const expires = new Date(
    Date.now() + SUBSCRIPTION_MAX_MINUTES * 60 * 1000,
  ).toISOString();

  const res = await fetch(
    `${GRAPH_BASE}/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expirationDateTime: expires }),
    },
  );

  if (res.status === 404) return null; // expiró del lado MS, recrear
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Graph renewSubscription failed (${res.status}): ${body}`);
  }
  return (await res.json()) as SubscriptionResponse;
}

export async function deleteSubscription(
  accessToken: string,
  subscriptionId: string,
): Promise<boolean> {
  const res = await fetch(
    `${GRAPH_BASE}/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
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
