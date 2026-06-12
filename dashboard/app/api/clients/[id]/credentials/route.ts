/**
 * GET  /api/clients/[id]/credentials  → lista las credenciales del cliente,
 *   ENMASCARADAS (sin el secreto). Solo director / team asignado.
 * POST /api/clients/[id]/credentials  → crea una credencial. Requiere la
 *   passphrase (deriva la llave, cifra el secreto). Solo director / team.
 *
 * Los secretos nunca se devuelven acá; se obtienen vía .../[credId]/reveal.
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireClientAccess } from "@/lib/auth-guard";
import { unlockKey } from "@/lib/vault-server";
import { encryptWithKey } from "@/lib/vault-crypto";

export const dynamic = "force-dynamic";

const CATEGORIES = [
  "cms",
  "hosting",
  "email",
  "social",
  "analytics",
  "dominio",
  "otro",
];

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await context.params;
  if (!clientId || !/^[a-z0-9-]+$/.test(clientId)) {
    return Response.json({ error: "Invalid client id" }, { status: 400 });
  }
  const access = await requireClientAccess(req, clientId);
  if (!access.ok) return access.response;
  if (access.role === "client") {
    return Response.json({ error: "No autorizado" }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("client_credentials")
    .select("id, label, category, username, url, notes_encrypted, created_at, updated_at")
    .eq("client_id", clientId)
    .order("category", { ascending: true })
    .order("label", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const credentials = (data ?? []).map((r) => ({
    id: r.id,
    label: r.label,
    category: r.category,
    username: r.username,
    url: r.url,
    hasNotes: !!r.notes_encrypted,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
  return Response.json({ credentials });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await context.params;
  if (!clientId || !/^[a-z0-9-]+$/.test(clientId)) {
    return Response.json({ error: "Invalid client id" }, { status: 400 });
  }
  const access = await requireClientAccess(req, clientId);
  if (!access.ok) return access.response;
  if (access.role === "client") {
    return Response.json({ error: "No autorizado" }, { status: 403 });
  }

  let body: {
    label?: string;
    category?: string;
    username?: string;
    url?: string;
    secret?: string;
    notes?: string;
    passphrase?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }

  const label = body.label?.trim();
  const secret = body.secret;
  const passphrase = body.passphrase?.trim();
  if (!label) return Response.json({ error: "Falta label" }, { status: 400 });
  if (!secret) return Response.json({ error: "Falta secret" }, { status: 400 });
  if (!passphrase)
    return Response.json({ error: "Falta passphrase" }, { status: 400 });
  const category = CATEGORIES.includes(body.category ?? "")
    ? (body.category as string)
    : "otro";

  const key = await unlockKey(passphrase);
  if (!key) {
    return Response.json(
      { error: "Passphrase incorrecta o bóveda sin configurar" },
      { status: 401 },
    );
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("client_credentials")
    .insert({
      client_id: clientId,
      label,
      category,
      username: body.username?.trim() || null,
      url: body.url?.trim() || null,
      secret_encrypted: encryptWithKey(secret, key),
      notes_encrypted: body.notes ? encryptWithKey(body.notes, key) : null,
      created_by: access.userId,
    })
    .select("id")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true, id: data.id });
}
