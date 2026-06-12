/**
 * PATCH  /api/clients/[id]/credentials/[credId]  → edita una credencial.
 *   Metadata (label/category/username/url) sin passphrase. Para cambiar el
 *   secreto/notas hay que mandar la passphrase (re-cifra). Solo director/team.
 * DELETE /api/clients/[id]/credentials/[credId]  → borra. Solo director/team.
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string; credId: string }> },
) {
  const { id: clientId, credId } = await context.params;
  if (!clientId || !/^[a-z0-9-]+$/.test(clientId)) {
    return Response.json({ error: "Invalid client id" }, { status: 400 });
  }
  if (!UUID_RE.test(credId)) {
    return Response.json({ error: "Invalid credential id" }, { status: 400 });
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

  const admin = getSupabaseAdmin();
  const { data: existing } = await admin
    .from("client_credentials")
    .select("id")
    .eq("id", credId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (!existing) {
    return Response.json({ error: "Credencial no encontrada" }, { status: 404 });
  }

  const patch: Record<string, unknown> = {};
  if (body.label !== undefined) patch.label = body.label.trim();
  if (body.category !== undefined) {
    patch.category = CATEGORIES.includes(body.category) ? body.category : "otro";
  }
  if (body.username !== undefined) patch.username = body.username?.trim() || null;
  if (body.url !== undefined) patch.url = body.url?.trim() || null;

  // Cambiar secreto/notas requiere la passphrase (re-cifrado).
  if (body.secret !== undefined || body.notes !== undefined) {
    const passphrase = body.passphrase?.trim();
    if (!passphrase) {
      return Response.json(
        { error: "Falta passphrase para cambiar el secreto/notas" },
        { status: 400 },
      );
    }
    const key = await unlockKey(passphrase);
    if (!key) {
      return Response.json({ error: "Passphrase incorrecta" }, { status: 401 });
    }
    if (body.secret !== undefined) {
      if (!body.secret) {
        return Response.json({ error: "secret vacío" }, { status: 400 });
      }
      patch.secret_encrypted = encryptWithKey(body.secret, key);
    }
    if (body.notes !== undefined) {
      patch.notes_encrypted = body.notes ? encryptWithKey(body.notes, key) : null;
    }
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ ok: true, noop: true });
  }

  const { error } = await admin
    .from("client_credentials")
    .update(patch)
    .eq("id", credId)
    .eq("client_id", clientId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string; credId: string }> },
) {
  const { id: clientId, credId } = await context.params;
  if (!clientId || !/^[a-z0-9-]+$/.test(clientId)) {
    return Response.json({ error: "Invalid client id" }, { status: 400 });
  }
  if (!UUID_RE.test(credId)) {
    return Response.json({ error: "Invalid credential id" }, { status: 400 });
  }
  const access = await requireClientAccess(req, clientId);
  if (!access.ok) return access.response;
  if (access.role === "client") {
    return Response.json({ error: "No autorizado" }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("client_credentials")
    .delete()
    .eq("id", credId)
    .eq("client_id", clientId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
