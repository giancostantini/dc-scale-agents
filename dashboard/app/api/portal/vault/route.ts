/**
 * GET  /api/portal/vault  → estado de la bóveda del cliente { setup, teamReady }.
 * POST /api/portal/vault  → el cliente configura SU frase clave por única vez.
 *   Genera salt + verifier + su par de llaves RSA (privada cifrada con la frase
 *   clave; nunca se guarda la frase). Si ya está configurada, 409.
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requirePortalClient } from "@/lib/portal-auth";
import { clientVaultIsSetup, getTeamPublicKey } from "@/lib/vault-server";
import {
  generateSalt,
  deriveKey,
  computeVerifier,
  generateKeypair,
  protectPrivateKey,
} from "@/lib/vault-crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePortalClient(req);
  if (!auth.ok) return auth.response;
  return Response.json({
    setup: await clientVaultIsSetup(auth.clientId),
    teamReady: !!(await getTeamPublicKey()),
  });
}

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
  if (!passphrase || passphrase.length < 8) {
    return Response.json(
      { error: "La frase clave debe tener al menos 8 caracteres." },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdmin();
  const { data: existing } = await admin
    .from("client_vaults")
    .select("client_id")
    .eq("client_id", auth.clientId)
    .maybeSingle();
  if (existing) {
    return Response.json({ error: "Tu bóveda ya está configurada." }, {
      status: 409,
    });
  }

  const salt = generateSalt();
  const key = deriveKey(passphrase, salt);
  const verifier = computeVerifier(key);
  const { publicKeyPem, privateKeyPem } = generateKeypair();

  const { error } = await admin.from("client_vaults").insert({
    client_id: auth.clientId,
    salt,
    verifier,
    public_key: publicKeyPem,
    private_key_encrypted: protectPrivateKey(privateKeyPem, key),
  });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
