/**
 * POST /api/clients/[id]/meta-token
 * DELETE /api/clients/[id]/meta-token
 *
 * Set / clear del Meta Access Token del cliente (clients.meta_access_token).
 * El token se usa server-side en /api/meta/push-campaign para pushear
 * campañas al Ad Account del cliente. Si el cliente no tiene token
 * cargado, el endpoint de push cae a META_ACCESS_TOKEN env var como
 * fallback.
 *
 * Por qué endpoint separado (en lugar de updateClientExternalLinks):
 *   · external_links es JSONB y se lee desde el frontend en getClient
 *     (esa data viaja a /cliente/[id] del browser). El token NO debe
 *     viajar al frontend nunca — por eso lo dejamos en una columna
 *     separada que solo se lee server-side con service role key.
 *   · Este endpoint requiere role='director' y solo escribe; no devuelve
 *     el token cargado.
 *
 * Body POST: { token: string }
 *   · token: el access token de Meta. Lo guardamos crudo (no se hashea
 *     porque hay que enviarlo a Meta tal cual en las llamadas).
 *
 * Response POST: { ok: true }
 *
 * DELETE no necesita body. Limpia el token. El sistema cae al fallback
 * env var después.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

async function assertDirector(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Supabase no está configurado en el servidor." },
        { status: 500 },
      ),
    };
  }
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Sin sesión" }, { status: 401 }),
    };
  }
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user },
  } = await caller.auth.getUser();
  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "No autenticado" },
        { status: 401 },
      ),
    };
  }
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "director") {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Solo el director puede tocar el Meta Access Token." },
        { status: 403 },
      ),
    };
  }
  return { ok: true as const, admin };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await assertDirector(req);
  if (!guard.ok) return guard.response;
  const { admin } = guard;
  const { id: clientId } = await params;

  let body: { token?: string };
  try {
    body = (await req.json()) as { token?: string };
  } catch {
    return NextResponse.json(
      { error: "Body inválido (esperaba JSON con campo token)" },
      { status: 400 },
    );
  }
  const tokenClean = (body.token ?? "").trim();
  if (!tokenClean) {
    return NextResponse.json(
      { error: "El token está vacío." },
      { status: 400 },
    );
  }
  // Sanity check del shape de un Meta access token: en general empiezan
  // con "EAA" + chars alfanuméricos. No es un check estricto — solo evita
  // que pegue algo claramente inválido como un Bearer interno.
  if (tokenClean.length < 50) {
    return NextResponse.json(
      {
        error:
          "El token parece muy corto. Los Meta Access Tokens válidos suelen tener 100+ caracteres. Confirmá que lo copiaste completo.",
      },
      { status: 400 },
    );
  }

  const { error } = await admin
    .from("clients")
    .update({ meta_access_token: tokenClean })
    .eq("id", clientId);
  if (error) {
    return NextResponse.json(
      { error: `No se pudo guardar: ${error.message}` },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await assertDirector(req);
  if (!guard.ok) return guard.response;
  const { admin } = guard;
  const { id: clientId } = await params;

  const { error } = await admin
    .from("clients")
    .update({ meta_access_token: null })
    .eq("id", clientId);
  if (error) {
    return NextResponse.json(
      { error: `No se pudo limpiar: ${error.message}` },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}

/**
 * GET /api/clients/[id]/meta-token
 *
 * Devuelve solo si el cliente TIENE token cargado, no el valor.
 * Lo usa la UI de Configuración para mostrar el estado.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await assertDirector(req);
  if (!guard.ok) return guard.response;
  const { admin } = guard;
  const { id: clientId } = await params;

  const { data, error } = await admin
    .from("clients")
    .select("meta_access_token")
    .eq("id", clientId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const t = (data?.meta_access_token as string | null | undefined) ?? "";
  return NextResponse.json({
    hasToken: t.trim().length > 0,
    // Preview redactado, ej. "EAA…xyz" — sirve para que el director
    // confirme visualmente cuál cargó sin exponer el token entero.
    tokenPreview:
      t.length > 12 ? `${t.slice(0, 4)}…${t.slice(-4)}` : null,
  });
}
