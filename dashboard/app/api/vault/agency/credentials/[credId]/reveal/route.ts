/**
 * POST /api/vault/agency/credentials/[credId]/reveal
 *
 * Descifra UNA credencial de la agencia y devuelve { secret, notes }. Requiere
 * la passphrase de equipo (→ privada del equipo → desenvuelve el DEK del equipo
 * → descifra). Solo director. Cada reveal queda registrado en audit_log ANTES
 * de devolver el secreto.
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth-guard";
import { unlockTeamKey } from "@/lib/vault-server";
import { openSecret } from "@/lib/vault-crypto";
import { logAction } from "@/lib/audit";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ credId: string }> },
) {
  const { credId } = await context.params;
  if (!UUID_RE.test(credId)) {
    return Response.json({ error: "Invalid credential id" }, { status: 400 });
  }
  const access = await requireRole(req, ["director"]);
  if (!access.ok) return access.response;

  let body: { passphrase?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }
  const passphrase = body.passphrase?.trim();
  if (!passphrase)
    return Response.json({ error: "Falta passphrase" }, { status: 400 });

  const priv = await unlockTeamKey(passphrase);
  if (!priv)
    return Response.json({ error: "Passphrase incorrecta" }, { status: 401 });

  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("agency_credentials")
    .select("label, secret_ct, secret_dek_team, notes_ct, notes_dek_team")
    .eq("id", credId)
    .maybeSingle();
  if (!data) {
    return Response.json({ error: "Credencial no encontrada" }, { status: 404 });
  }

  let secret: string;
  let notes: string | null = null;
  try {
    secret = openSecret(
      data.secret_ct as string,
      data.secret_dek_team as string,
      priv,
    );
    notes =
      data.notes_ct && data.notes_dek_team
        ? openSecret(
            data.notes_ct as string,
            data.notes_dek_team as string,
            priv,
          )
        : null;
  } catch {
    return Response.json(
      { error: "No se pudo descifrar la credencial." },
      { status: 500 },
    );
  }

  await logAction({
    actorId: access.userId,
    actorEmail: access.email,
    action: "credential.reveal",
    targetType: "agency_credential",
    targetId: credId,
    metadata: { label: data.label, scope: "agency" },
  });

  return Response.json({ secret, notes });
}
