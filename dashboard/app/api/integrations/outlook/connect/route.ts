/**
 * GET /api/integrations/outlook/connect
 *
 * Devuelve la URL para que el user inicie el OAuth flow con Microsoft.
 * El frontend hace fetch a este endpoint y después navega a `auth_url`.
 *
 * Auth: requiere session válida.
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildAuthUrl, outlookConfigured } from "@/lib/outlook";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!outlookConfigured()) {
    return Response.json(
      {
        error: "Outlook no configurado.",
        detail:
          "Faltan env vars: MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_REDIRECT_URI. Configuralas en Vercel.",
      },
      { status: 500 },
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return Response.json({ error: "Servidor no configurado." }, { status: 500 });
  }

  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) {
    return Response.json({ error: "Sin sesión" }, { status: 401 });
  }
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return Response.json({ error: "No autenticado" }, { status: 401 });

  // state = user_id firmado simple. En prod podría firmarse con HMAC.
  // Aquí lo dejamos plano + verificamos en el callback con la cookie de sesión.
  const state = `${user.id}.${Date.now()}`;
  const authUrl = buildAuthUrl(state);

  return Response.json({ auth_url: authUrl });
}
