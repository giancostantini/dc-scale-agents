/**
 * GET /api/auth/outlook/callback
 *
 * Recibe el code de Microsoft + state que firmamos en /start.
 * Valida HMAC, intercambia code por tokens, persiste cifrados,
 * crea subscription, y redirige al user a returnTo con flag.
 *
 * Query params (vienen de Microsoft):
 *   code, state, [error, error_description]
 *
 * No requiere Bearer — el state firmado contiene el userId.
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  exchangeCodeForTokens,
  fetchMeProfile,
  createMeSubscription,
} from "@/lib/microsoft-graph";
import { encryptToken } from "@/lib/token-crypto";

export const dynamic = "force-dynamic";

const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 min

export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const stateSecret = process.env.OAUTH_STATE_SECRET?.trim();
  if (!url || !serviceKey || !stateSecret) {
    return Response.json(
      { error: "Servidor no configurado" },
      { status: 500 },
    );
  }

  const sp = req.nextUrl.searchParams;

  // Microsoft propagó un error del consent screen
  const error = sp.get("error");
  if (error) {
    const desc = sp.get("error_description") ?? "";
    return errorRedirect(req, "/perfil", `${error}: ${desc}`);
  }

  const code = sp.get("code");
  const state = sp.get("state");
  if (!code || !state) {
    return errorRedirect(req, "/perfil", "Missing code or state");
  }

  // Validar state firmado
  const verified = verifyState(state, stateSecret);
  if (!verified.ok) {
    return errorRedirect(req, "/perfil", `Invalid state: ${verified.reason}`);
  }
  const { userId, returnTo } = verified;

  // Intercambiar code por tokens
  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code);
  } catch (err) {
    return errorRedirect(
      req,
      returnTo,
      err instanceof Error ? err.message : "Token exchange failed",
    );
  }

  // Obtener identidad del user en Microsoft (email + ObjectId)
  let profile;
  try {
    profile = await fetchMeProfile(tokens.access_token);
  } catch (err) {
    return errorRedirect(
      req,
      returnTo,
      err instanceof Error ? err.message : "Fetching MS profile failed",
    );
  }

  const msEmail = profile.mail ?? profile.userPrincipalName ?? "";

  // Persistir conexión (con tokens cifrados)
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const accessExpiresAt = new Date(
    Date.now() + tokens.expires_in * 1000,
  ).toISOString();

  const { error: upsertError } = await admin
    .from("outlook_connections")
    .upsert(
      {
        user_id: userId,
        ms_user_id: profile.id,
        ms_email: msEmail,
        refresh_token_encrypted: encryptToken(tokens.refresh_token),
        access_token_encrypted: encryptToken(tokens.access_token),
        access_token_expires_at: accessExpiresAt,
        scope: tokens.scope,
        connected_at: new Date().toISOString(),
        last_error: null,
        last_error_at: null,
        // subscription_id se setea más abajo si la creación tiene éxito
      },
      { onConflict: "user_id" },
    );

  if (upsertError) {
    return errorRedirect(
      req,
      returnTo,
      `Persist failed: ${upsertError.message}`,
    );
  }

  // Crear subscription a /me/events (notifs por webhook). Si falla, no
  // rompemos el OAuth — el user queda conectado pero sin auto-sync;
  // el cron diario va a intentar de nuevo.
  try {
    const sub = await createMeSubscription(tokens.access_token);
    await admin
      .from("outlook_connections")
      .update({
        subscription_id: sub.id,
        subscription_expires_at: sub.expirationDateTime,
      })
      .eq("user_id", userId);
  } catch (err) {
    console.warn(
      "[outlook/callback] subscription create falló (se reintenta en cron):",
      err,
    );
    await admin
      .from("outlook_connections")
      .update({
        last_error: err instanceof Error ? err.message : "subscription create failed",
        last_error_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
  }

  return Response.redirect(
    appendQuery(new URL(returnTo, req.url), { outlook: "connected" }),
    302,
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type VerifyResult =
  | { ok: true; userId: string; returnTo: string }
  | { ok: false; reason: string };

function verifyState(state: string, secret: string): VerifyResult {
  const dotIdx = state.indexOf(".");
  if (dotIdx === -1) return { ok: false, reason: "malformed" };
  const payloadB64 = state.slice(0, dotIdx);
  const providedSig = state.slice(dotIdx + 1);

  const expectedSig = createHmac("sha256", secret)
    .update(payloadB64)
    .digest("base64url");

  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad signature" };
  }

  let payload: { userId?: string; returnTo?: string; ts?: number };
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "bad payload" };
  }

  if (!payload.userId || typeof payload.userId !== "string") {
    return { ok: false, reason: "no userId" };
  }
  if (!payload.ts || Date.now() - payload.ts > STATE_MAX_AGE_MS) {
    return { ok: false, reason: "expired" };
  }

  const returnTo =
    typeof payload.returnTo === "string" && payload.returnTo.startsWith("/")
      ? payload.returnTo
      : "/perfil";

  return { ok: true, userId: payload.userId, returnTo };
}

function appendQuery(url: URL, params: Record<string, string>): URL {
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return url;
}

function errorRedirect(
  req: NextRequest,
  returnTo: string,
  message: string,
): Response {
  const url = new URL(returnTo, req.url);
  url.searchParams.set("outlook_error", message);
  return Response.redirect(url, 302);
}
