/**
 * Helpers server-side de la bóveda: leen vault_meta (service-role) y derivan/
 * validan la llave desde la passphrase. La passphrase llega por request (TLS),
 * se usa en memoria y se descarta — nunca se persiste.
 */

import { getSupabaseAdmin } from "@/lib/supabase/server";
import { deriveKey, checkVerifier } from "@/lib/vault-crypto";

/** ¿La bóveda ya tiene passphrase configurada? */
export async function vaultIsSetup(): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("vault_meta")
    .select("id")
    .eq("id", 1)
    .maybeSingle();
  return !!data;
}

/**
 * Deriva la llave desde la passphrase y la valida contra el verifier.
 * Devuelve la llave (Buffer) si la passphrase es correcta, o null si es
 * incorrecta o la bóveda no está configurada.
 */
export async function unlockKey(passphrase: string): Promise<Buffer | null> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("vault_meta")
    .select("salt, verifier")
    .eq("id", 1)
    .maybeSingle();
  if (!data) return null;
  const key = deriveKey(passphrase, data.salt as string);
  return checkVerifier(data.verifier as string, key) ? key : null;
}
