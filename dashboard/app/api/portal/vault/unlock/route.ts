/**
 * POST /api/portal/vault/unlock → valida la frase clave del cliente. No devuelve
 *   la privada; el portal guarda la frase en memoria de sesión y la reenvía al
 *   revelar.
 */

import { NextRequest } from "next/server";
import { requirePortalClient } from "@/lib/portal-auth";
import { clientVaultIsSetup, unlockClientKey } from "@/lib/vault-server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
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

  if (!(await clientVaultIsSetup(auth.clientId))) {
    return Response.json(
      { error: "Todavía no configuraste tu bóveda.", setup: false },
      { status: 400 },
    );
  }
  const priv = await unlockClientKey(auth.clientId, passphrase);
  if (!priv)
    return Response.json({ error: "Frase clave incorrecta" }, { status: 401 });

  return Response.json({ ok: true });
}
