/**
 * GET /api/integrations/outlook/callback
 *
 * Microsoft redirige acá después del consent. Le pasamos:
 *   ?code=...&state=...     (success)
 *   ?error=...&error_description=...  (failure)
 *
 * Intercambia el code por tokens, guarda en profile, redirige al user
 * de vuelta a /perfil con un flag de éxito/error.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForTokens,
  saveTokensToProfile,
  fetchOutlookProfile,
  outlookConfigured,
} from "@/lib/outlook";

export const dynamic = "force-dynamic";

function redirectToPerfil(req: NextRequest, params: Record<string, string>) {
  const origin = new URL(req.url).origin;
  const url = new URL(`${origin}/perfil`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  if (!outlookConfigured()) {
    return redirectToPerfil(req, {
      outlook: "error",
      msg: "Outlook no configurado en el servidor.",
    });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDesc = url.searchParams.get("error_description");

  if (error) {
    return redirectToPerfil(req, {
      outlook: "error",
      msg: errorDesc ?? error,
    });
  }
  if (!code || !state) {
    return redirectToPerfil(req, { outlook: "error", msg: "Faltan params." });
  }

  // state = userId.timestamp
  const userId = state.split(".")[0];
  if (!userId) {
    return redirectToPerfil(req, { outlook: "error", msg: "State inválido." });
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    // Obtenemos el email principal del user desde Graph
    let email: string | undefined;
    try {
      const prof = await fetchOutlookProfile(tokens.access_token);
      email = prof.mail ?? prof.userPrincipalName ?? undefined;
    } catch (err) {
      console.warn("[outlook callback] no se pudo leer email:", err);
    }
    await saveTokensToProfile(userId, tokens, email);
    return redirectToPerfil(req, {
      outlook: "connected",
      ...(email ? { email } : {}),
    });
  } catch (err) {
    const e = err as Error;
    console.error("[outlook callback]", e);
    return redirectToPerfil(req, {
      outlook: "error",
      msg: e.message ?? "Falló el exchange.",
    });
  }
}
