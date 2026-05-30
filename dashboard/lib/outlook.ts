/**
 * Microsoft Graph / Outlook integration helpers.
 *
 * Cada miembro del equipo puede conectar su cuenta de Outlook personal
 * para que el sistema le pueda:
 *   · Sincronizar eventos al calendario (tareas, reuniones, deadlines).
 *   · Enviar invites por email (futuro).
 *
 * OAuth flow:
 *   1. GET /api/integrations/outlook/connect (devuelve auth_url)
 *   2. User da consent en login.microsoftonline.com
 *   3. Microsoft redirige a /api/integrations/outlook/callback
 *   4. Callback exchanges code → tokens, persiste en profiles.
 *   5. Token refresh on demand cuando expiró.
 *
 * Env vars necesarias:
 *   - MICROSOFT_CLIENT_ID        (Azure AD App registration)
 *   - MICROSOFT_CLIENT_SECRET    (secret de esa app)
 *   - MICROSOFT_REDIRECT_URI     (https://.../api/integrations/outlook/callback)
 *   - MICROSOFT_TENANT_ID        (usar 'common' para multi-tenant + personal)
 *
 * Scopes que pedimos:
 *   - offline_access  (necesario para refresh_token)
 *   - openid email profile  (datos básicos del user)
 *   - Calendars.ReadWrite  (crear/leer eventos del calendario)
 *   - Mail.Send  (futuro — enviar invites)
 */

import { getSupabaseAdmin } from "./supabase/server";

const AUTH_BASE = "https://login.microsoftonline.com";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

const SCOPES = [
  "offline_access",
  "openid",
  "email",
  "profile",
  "Calendars.ReadWrite",
  "Mail.Send",
];

function getCfg() {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI;
  const tenantId = process.env.MICROSOFT_TENANT_ID ?? "common";
  return { clientId, clientSecret, redirectUri, tenantId };
}

export function outlookConfigured(): boolean {
  const cfg = getCfg();
  return Boolean(cfg.clientId && cfg.clientSecret && cfg.redirectUri);
}

/**
 * Construye la URL de OAuth para que el user dé consent.
 * `state` debe incluir el user_id del que está conectando para que el
 * callback sepa a qué profile guardarle los tokens.
 */
export function buildAuthUrl(state: string): string {
  const cfg = getCfg();
  if (!cfg.clientId || !cfg.redirectUri) {
    throw new Error("Outlook OAuth no configurado.");
  }
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    redirect_uri: cfg.redirectUri,
    response_mode: "query",
    scope: SCOPES.join(" "),
    state,
    prompt: "select_account",
  });
  return `${AUTH_BASE}/${cfg.tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type: string;
  id_token?: string;
}

/** Intercambia el authorization code por tokens. */
export async function exchangeCodeForTokens(
  code: string,
): Promise<TokenResponse> {
  const cfg = getCfg();
  if (!cfg.clientId || !cfg.clientSecret || !cfg.redirectUri) {
    throw new Error("Outlook OAuth no configurado.");
  }
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: cfg.redirectUri,
    scope: SCOPES.join(" "),
  });
  const res = await fetch(`${AUTH_BASE}/${cfg.tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Outlook token exchange falló: ${res.status} — ${text}`);
  }
  return (await res.json()) as TokenResponse;
}

/** Refresca el access_token usando el refresh_token. */
export async function refreshTokens(
  refreshToken: string,
): Promise<TokenResponse> {
  const cfg = getCfg();
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new Error("Outlook OAuth no configurado.");
  }
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: SCOPES.join(" "),
  });
  const res = await fetch(`${AUTH_BASE}/${cfg.tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Outlook refresh falló: ${res.status} — ${text}`);
  }
  return (await res.json()) as TokenResponse;
}

/** Persiste los tokens en profiles.outlook_*. */
export async function saveTokensToProfile(
  userId: string,
  tokens: TokenResponse,
  emailFallback?: string,
): Promise<void> {
  const admin = getSupabaseAdmin();
  const expiresAt = new Date(
    Date.now() + tokens.expires_in * 1000,
  ).toISOString();
  const patch: Record<string, unknown> = {
    outlook_access_token: tokens.access_token,
    outlook_token_expires_at: expiresAt,
    outlook_connected_at: new Date().toISOString(),
  };
  if (tokens.refresh_token) patch.outlook_refresh_token = tokens.refresh_token;
  if (emailFallback) patch.outlook_email = emailFallback;
  await admin.from("profiles").update(patch).eq("id", userId);
}

/**
 * Asegura un access_token válido. Lee de la DB, refresca si expiró,
 * persiste el nuevo. Devuelve null si el user no conectó Outlook o
 * si el refresh falla.
 */
export async function getValidAccessToken(
  userId: string,
): Promise<string | null> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("profiles")
    .select("outlook_access_token, outlook_refresh_token, outlook_token_expires_at")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return null;
  const profile = data as {
    outlook_access_token?: string | null;
    outlook_refresh_token?: string | null;
    outlook_token_expires_at?: string | null;
  };
  if (!profile.outlook_access_token) return null;
  const expiresAt = profile.outlook_token_expires_at
    ? new Date(profile.outlook_token_expires_at).getTime()
    : 0;
  // 1-minute buffer antes del expiry para evitar race condition
  if (Date.now() < expiresAt - 60_000) {
    return profile.outlook_access_token;
  }
  // Expirado — refrescar
  if (!profile.outlook_refresh_token) return null;
  try {
    const fresh = await refreshTokens(profile.outlook_refresh_token);
    await saveTokensToProfile(userId, fresh);
    return fresh.access_token;
  } catch (err) {
    console.error("[outlook] refresh failed:", err);
    return null;
  }
}

/** Obtiene el email principal del usuario desde Graph. */
export async function fetchOutlookProfile(
  accessToken: string,
): Promise<{ mail?: string; userPrincipalName?: string; displayName?: string }> {
  const res = await fetch(`${GRAPH_BASE}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`graph /me ${res.status}`);
  return res.json() as Promise<{
    mail?: string;
    userPrincipalName?: string;
    displayName?: string;
  }>;
}

export interface OutlookEventInput {
  subject: string;
  body?: string;
  /** ISO 8601 con timezone. */
  startISO: string;
  endISO: string;
  /** "America/Montevideo", "America/Argentina/Buenos_Aires", etc. */
  timeZone?: string;
  /** Lista de emails para invitar. */
  attendees?: string[];
  isAllDay?: boolean;
}

/**
 * Crea un evento en el calendario default del usuario via Graph.
 * Devuelve el id del evento creado en Outlook.
 */
export async function createOutlookEvent(
  userId: string,
  input: OutlookEventInput,
): Promise<string | null> {
  const token = await getValidAccessToken(userId);
  if (!token) return null;
  const tz = input.timeZone ?? "America/Montevideo";
  const payload = {
    subject: input.subject,
    body: input.body
      ? { contentType: "HTML", content: input.body }
      : undefined,
    start: { dateTime: input.startISO, timeZone: tz },
    end: { dateTime: input.endISO, timeZone: tz },
    isAllDay: input.isAllDay ?? false,
    attendees:
      input.attendees && input.attendees.length > 0
        ? input.attendees.map((email) => ({
            emailAddress: { address: email, name: email },
            type: "required",
          }))
        : undefined,
  };
  const res = await fetch(`${GRAPH_BASE}/me/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`[outlook] createEvent ${res.status}: ${text}`);
    return null;
  }
  const data = (await res.json()) as { id?: string };
  return data.id ?? null;
}

/** Desconecta Outlook: limpia tokens del profile. */
export async function disconnectOutlook(userId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  await admin
    .from("profiles")
    .update({
      outlook_access_token: null,
      outlook_refresh_token: null,
      outlook_token_expires_at: null,
      outlook_email: null,
      outlook_connected_at: null,
    })
    .eq("id", userId);
}
