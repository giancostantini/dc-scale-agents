/**
 * POST /api/vault/setup
 *
 * Configura por única vez la passphrase de equipo de la bóveda. Solo director.
 * Genera salt + verifier (no guarda la passphrase). Si ya está configurada,
 * responde 409 (re-setup cambiaría el salt y dejaría las credenciales viejas
 * ilegibles — eso requeriría un flujo de reset aparte).
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth-guard";
import { generateSalt, deriveKey, computeVerifier } from "@/lib/vault-crypto";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const access = await requireRole(req, ["director"]);
  if (!access.ok) return access.response;

  let body: { passphrase?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }
  const passphrase = body.passphrase?.trim();
  if (!passphrase || passphrase.length < 8) {
    return Response.json(
      { error: "La passphrase debe tener al menos 8 caracteres." },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdmin();
  const { data: existing } = await admin
    .from("vault_meta")
    .select("id")
    .eq("id", 1)
    .maybeSingle();
  if (existing) {
    return Response.json(
      { error: "La bóveda ya está configurada." },
      { status: 409 },
    );
  }

  const salt = generateSalt();
  const key = deriveKey(passphrase, salt);
  const verifier = computeVerifier(key);

  const { error } = await admin
    .from("vault_meta")
    .insert({ id: 1, salt, verifier });
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
