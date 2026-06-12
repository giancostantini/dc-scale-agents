/**
 * POST /api/clients/[id]/credentials/[credId]/reveal
 *
 * Descifra UNA credencial para el equipo y devuelve { secret, notes }. Requiere
 * la passphrase de equipo (→ privada del equipo → desenvuelve el DEK del equipo
 * → descifra). Solo director / team asignado. CADA reveal queda registrado en
 * audit_log (quién vio qué credencial, cuándo) ANTES de devolver el secreto.
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireClientAccess } from "@/lib/auth-guard";
import { unlockTeamKey } from "@/lib/vault-server";
import { openSecret } from "@/lib/vault-crypto";
import { logAction } from "@/lib/audit";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
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
    .from("client_credentials")
    .select("label, secret_ct, secret_dek_team, notes_ct, notes_dek_team")
    .eq("id", credId)
    .eq("client_id", clientId)
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

  // Auditar el acceso ANTES de devolver (queda registrado aunque cierren la
  // pestaña). El director lo ve en /configuracion/audit.
  await logAction({
    actorId: access.userId,
    actorEmail: access.email,
    action: "credential.reveal",
    targetType: "client_credential",
    targetId: credId,
    metadata: { client_id: clientId, label: data.label },
  });

  return Response.json({ secret, notes });
}
