/**
 * PATCH  /api/clients/[id]/credentials/[credId]  → edita una credencial.
 *   Metadata (label/category/username/url) sin más. Cambiar el secreto/notas
 *   re-arma el sobre con las llaves PÚBLICAS (equipo + cliente si tiene bóveda)
 *   → no requiere passphrase. Solo director/team.
 * DELETE /api/clients/[id]/credentials/[credId]  → borra. Solo director/team.
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireClientAccess } from "@/lib/auth-guard";
import { getTeamPublicKey, getClientPublicKey } from "@/lib/vault-server";
import { sealSecret } from "@/lib/vault-crypto";

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

  // Cambiar secreto/notas → re-armar el sobre con las públicas (sin passphrase).
  if (body.secret !== undefined || body.notes !== undefined) {
    const teamPub = await getTeamPublicKey();
    if (!teamPub) {
      return Response.json(
        { error: "La bóveda del equipo no está configurada todavía." },
        { status: 409 },
      );
    }
    const clientPub = await getClientPublicKey(clientId);
    const pubs = clientPub ? [teamPub, clientPub] : [teamPub];

    if (body.secret !== undefined) {
      if (!body.secret) {
        return Response.json({ error: "secret vacío" }, { status: 400 });
      }
      const sealed = sealSecret(body.secret, pubs);
      patch.secret_ct = sealed.ct;
      patch.secret_dek_team = sealed.deks[0];
      patch.secret_dek_client = clientPub ? sealed.deks[1] : null;
    }
    if (body.notes !== undefined) {
      if (body.notes) {
        const sealed = sealSecret(body.notes, pubs);
        patch.notes_ct = sealed.ct;
        patch.notes_dek_team = sealed.deks[0];
        patch.notes_dek_client = clientPub ? sealed.deks[1] : null;
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
