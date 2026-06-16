/**
 * PATCH  /api/vault/agency/credentials/[credId] → edita una credencial de la
 *   agencia. Metadata directa; cambiar secreto/notas re-arma el sobre con la
 *   pública del equipo (sin passphrase). Solo director.
 * DELETE /api/vault/agency/credentials/[credId] → borra. Solo director.
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth-guard";
import { getTeamPublicKey } from "@/lib/vault-server";
import { sealSecret } from "@/lib/vault-crypto";
import { logAction } from "@/lib/audit";

export const dynamic = "force-dynamic";

const CATEGORIES = [
  "banco",
  "fiscal",
  "infra",
  "herramientas",
  "dominio",
  "email",
  "social",
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
  const access = await requireRole(req, ["director"]);
  if (!access.ok) return access.response;

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
    .from("agency_credentials")
    .select("id")
    .eq("id", credId)
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
    const teamPub = await getTeamPublicKey();
    if (!teamPub) {
      return Response.json(
        { error: "La bóveda del equipo no está configurada todavía." },
        { status: 409 },
      );
    }
    if (body.secret !== undefined) {
      if (!body.secret) {
        return Response.json({ error: "secret vacío" }, { status: 400 });
      }
      const sealed = sealSecret(body.secret, [teamPub]);
      patch.secret_ct = sealed.ct;
      patch.secret_dek_team = sealed.deks[0];
    }
    if (body.notes !== undefined) {
      if (body.notes) {
        const sealed = sealSecret(body.notes, [teamPub]);
        patch.notes_ct = sealed.ct;
        patch.notes_dek_team = sealed.deks[0];
      } else {
        patch.notes_ct = null;
        patch.notes_dek_team = null;
      }
    }
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ ok: true, noop: true });
  }

  const { error } = await admin
    .from("agency_credentials")
    .update(patch)
    .eq("id", credId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await logAction({
    actorId: access.userId,
    actorEmail: access.email,
    action: "credential.update",
    targetType: "agency_credential",
    targetId: credId,
    metadata: { scope: "agency" },
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
  const access = await requireRole(req, ["director"]);
  if (!access.ok) return access.response;

  const admin = getSupabaseAdmin();
  const { data: existing } = await admin
    .from("agency_credentials")
    .select("id")
    .eq("id", credId)
    .maybeSingle();
  if (!existing) {
    return Response.json({ error: "Credencial no encontrada" }, { status: 404 });
  }

  const { error } = await admin
    .from("agency_credentials")
    .delete()
    .eq("id", credId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await logAction({
    actorId: access.userId,
    actorEmail: access.email,
    action: "credential.delete",
    targetType: "agency_credential",
    targetId: credId,
    metadata: { scope: "agency" },
  });

  return Response.json({ ok: true });
}
