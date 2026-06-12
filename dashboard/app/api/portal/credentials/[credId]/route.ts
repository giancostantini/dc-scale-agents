/**
 * PATCH  /api/portal/credentials/[credId] → el cliente edita SU credencial.
 *   Metadata directa; cambiar secreto/notas re-arma el sobre (equipo + cliente).
 * DELETE /api/portal/credentials/[credId] → el cliente borra SU credencial.
 *
 * Ownership: la fila tiene que ser del client_id del perfil (no de la URL).
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requirePortalClient } from "@/lib/portal-auth";
import { getTeamPublicKey, getClientPublicKey } from "@/lib/vault-server";
import { sealSecret } from "@/lib/vault-crypto";
import { logAction } from "@/lib/audit";

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
  context: { params: Promise<{ credId: string }> },
) {
  const { credId } = await context.params;
  if (!UUID_RE.test(credId)) {
    return Response.json({ error: "Invalid credential id" }, { status: 400 });
  }
  const auth = await requirePortalClient(req);
  if (!auth.ok) return auth.response;

  let body: {
    label?: string;
    category?: string;
    username?: string;
    url?: string;
    secret?: string;
    notes?: string;
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
    .eq("client_id", auth.clientId)
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

  if (body.secret !== undefined || body.notes !== undefined) {
    const clientPub = await getClientPublicKey(auth.clientId);
    const teamPub = await getTeamPublicKey();
    if (!clientPub || !teamPub) {
      return Response.json(
        { error: "La bóveda compartida no está disponible en este momento." },
        { status: 409 },
      );
    }
    const pubs = [teamPub, clientPub];

    if (body.secret !== undefined) {
      if (!body.secret) {
        return Response.json({ error: "secret vacío" }, { status: 400 });
      }
      const sealed = sealSecret(body.secret, pubs);
      patch.secret_ct = sealed.ct;
      patch.secret_dek_team = sealed.deks[0];
      patch.secret_dek_client = sealed.deks[1];
    }
    if (body.notes !== undefined) {
      if (body.notes) {
        const sealed = sealSecret(body.notes, pubs);
        patch.notes_ct = sealed.ct;
        patch.notes_dek_team = sealed.deks[0];
        patch.notes_dek_client = sealed.deks[1];
      } else {
        patch.notes_ct = null;
        patch.notes_dek_team = null;
        patch.notes_dek_client = null;
      }
    }
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ ok: true, noop: true });
  }

  const { error } = await admin
    .from("client_credentials")
    .update(patch)
    .eq("id", credId)
    .eq("client_id", auth.clientId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await logAction({
    actorId: auth.userId,
    actorEmail: auth.email,
    action: "credential.update",
    targetType: "client_credential",
    targetId: credId,
    metadata: { client_id: auth.clientId },
  });

  return Response.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ credId: string }> },
) {
  const { credId } = await context.params;
  if (!UUID_RE.test(credId)) {
    return Response.json({ error: "Invalid credential id" }, { status: 400 });
  }
  const auth = await requirePortalClient(req);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  const { data: existing } = await admin
    .from("client_credentials")
    .select("id")
    .eq("id", credId)
    .eq("client_id", auth.clientId)
    .maybeSingle();
  if (!existing) {
    return Response.json({ error: "Credencial no encontrada" }, { status: 404 });
  }

  const { error } = await admin
    .from("client_credentials")
    .delete()
    .eq("id", credId)
    .eq("client_id", auth.clientId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await logAction({
    actorId: auth.userId,
    actorEmail: auth.email,
    action: "credential.delete",
    targetType: "client_credential",
    targetId: credId,
    metadata: { client_id: auth.clientId },
  });

  return Response.json({ ok: true });
}
