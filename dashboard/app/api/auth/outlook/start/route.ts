/**
 * GET /api/auth/outlook/start
 *
 * Devuelve la URL del consent screen de Microsoft + un state firmado.
 * El frontend llama este endpoint con Bearer, recibe la URL, y hace
 * window.location.href = url. Microsoft redirige a /callback con el
 * mismo state que verificamos por HMAC (sin DB).
 *
 * El state es base64url( JSON({ userId, returnTo, nonce }) ) + "." +
 * HMAC-SHA256(JSON, OAUTH_STATE_SECRET). Sin DB intermedia.
 *
 * Query params:
 *   returnTo (opcional) — path al que volver post-callback.
 *                          Default: /perfil
 *
 * Auth: Bearer token del user.
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHmac, randomBytes } from "node:crypto";
import { buildAuthorizationUrl } from "@/lib/microsoft-graph";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const stateSecret = process.env.OAUTH_STATE_SECRET?.trim();
  if (!url || !anonKey || !stateSecret) {
    return Response.json(
      { error: "Servidor no configurado: faltan env vars (OAUTH_STATE_SECRET / Supabase)." },
      { status: 500 },
    );
  }

  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) {
    return Response.json({ error: "Sin sesión" }, { status: 401 });
  }
  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user },
  } = await callerClient.auth.getUser();
  if (!user) {
    return Response.json({ error: "No autenticado" }, { status: 401 });
  }

  const returnToParam = req.nextUrl.searchParams.get("returnTo");
  const returnTo = isSafeReturnTo(returnToParam) ? returnToParam! : "/perfil";

  const payload = JSON.stringify({
    userId: user.id,
    returnTo,
    nonce: randomBytes(12).toString("hex"),
    ts: Date.now(),
  });
  const payloadB64 = Buffer.from(payload).toString("base64url");
  const signature = createHmac("sha256", stateSecret)
    .update(payloadB64)
    .digest("base64url");
  const state = `${payloadB64}.${signature}`;

  try {
    const authUrl = buildAuthorizationUrl(state);
    return Response.json({ url: authUrl });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Error al armar OAuth URL" },
      { status: 500 },
    );
  }
}

/**
 * Anti-open-redirect: solo permitimos returnTo a paths relativos del
 * mismo dominio. Nada de `//evil.com/cb` ni `http://evil.com`.
 */
function isSafeReturnTo(returnTo: string | null): boolean {
  if (!returnTo) return false;
  if (!returnTo.startsWith("/")) return false;
  if (returnTo.startsWith("//")) return false;
  return true;
}
