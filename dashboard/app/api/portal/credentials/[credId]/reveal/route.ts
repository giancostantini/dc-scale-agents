/**
 * POST /api/portal/credentials/[credId]/reveal
 *
 * El cliente descifra UNA de SUS credenciales con SU frase clave (→ su privada
 * → desenvuelve su DEK → descifra). Si la credencial la cargó el equipo antes
 * de que el cliente activara su bóveda, no tiene DEK del cliente → no puede
 * revelarla (se le explica). Cada reveal queda en audit_log.
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requirePortalClient } from "@/lib/portal-auth";
import { unlockClientKey } from "@/lib/vault-server";
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
  const auth = await requirePortalClient(req);
  if (!auth.ok) return auth.response;

  let body: { passphrase?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }
  const passphrase = body.passphrase?.trim();
  if (!passphrase)
    return Response.json({ error: "Falta la frase clave" }, { status: 400 });

  const priv = await unlockClientKey(auth.clientId, passphrase);
  if (!priv)
    return Response.json({ error: "Frase clave incorrecta" }, { status: 401 });

  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("client_credentials")
    .select("label, secret_ct, secret_dek_client, notes_ct, notes_dek_client")
    .eq("id", credId)
    .eq("client_id", auth.clientId)
    .maybeSingle();
  if (!data) {
    return Response.json({ error: "Credencial no encontrada" }, { status: 404 });
  }
  if (!data.secret_dek_client) {
    return Response.json(
      {
        error:
          "Esta credencial la cargó el equipo antes de que activaras tu bóveda. Pedile al equipo que la vuelva a guardar para poder verla acá.",
      },
      { status: 409 },
    );
  }

  let secret: string;
  let notes: string | null = null;
  try {
    secret = openSecret(
      data.secret_ct as string,
      data.secret_dek_client as string,
      priv,
    );
    notes =
      data.notes_ct && data.notes_dek_client
        ? openSecret(
            data.notes_ct as string,
            data.notes_dek_client as string,
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
    actorId: auth.userId,
    actorEmail: auth.email,
    action: "credential.reveal",
    targetType: "client_credential",
    targetId: credId,
    metadata: { client_id: auth.clientId, label: data.label, by: "client" },
  });

  return Response.json({ secret, notes });
}
