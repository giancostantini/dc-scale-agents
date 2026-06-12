/**
 * Helpers server-side de la bóveda (cifrado de sobre, doble destinatario).
 *
 * Leen vault_meta / client_vaults vía service-role y validan la passphrase
 * contra el verifier. Si valida, devuelven la privada PEM de ese lado (equipo
 * o cliente) lista para desenvolver DEKs. La passphrase llega por request
 * (TLS), se usa en memoria y se descarta — nunca se persiste.
 */

import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  deriveKey,
  checkVerifier,
  unprotectPrivateKey,
} from "@/lib/vault-crypto";

// ── Equipo ──────────────────────────────────────────────────────────────────

/** ¿La bóveda del equipo ya tiene passphrase + par de llaves? */
export async function vaultIsSetup(): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("vault_meta")
    .select("id, public_key")
    .eq("id", 1)
    .maybeSingle();
  return !!data && !!data.public_key;
}

/** Pública del equipo (para envolver al depositar). null si no hay setup. */
export async function getTeamPublicKey(): Promise<string | null> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("vault_meta")
    .select("public_key")
    .eq("id", 1)
    .maybeSingle();
  return (data?.public_key as string | undefined) ?? null;
}

/**
 * Valida la passphrase de equipo y devuelve la privada PEM del equipo.
 * null si la passphrase es incorrecta o la bóveda no está configurada.
 */
export async function unlockTeamKey(passphrase: string): Promise<string | null> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("vault_meta")
    .select("salt, verifier, private_key_encrypted")
    .eq("id", 1)
    .maybeSingle();
  if (!data || !data.private_key_encrypted) return null;
  const key = deriveKey(passphrase, data.salt as string);
  if (!checkVerifier(data.verifier as string, key)) return null;
  try {
    return unprotectPrivateKey(data.private_key_encrypted as string, key);
  } catch {
    return null;
  }
}

// ── Cliente ───────────────────────────────────────────────────────────────

/** ¿Este cliente ya activó su bóveda (tiene passphrase + par de llaves)? */
export async function clientVaultIsSetup(clientId: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("client_vaults")
    .select("client_id")
    .eq("client_id", clientId)
    .maybeSingle();
  return !!data;
}

/** Pública de un cliente (para envolver al depositar). null si no activó bóveda. */
export async function getClientPublicKey(
  clientId: string,
): Promise<string | null> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("client_vaults")
    .select("public_key")
    .eq("client_id", clientId)
    .maybeSingle();
  return (data?.public_key as string | undefined) ?? null;
}

/**
 * Valida la passphrase de un cliente y devuelve SU privada PEM.
 * null si la passphrase es incorrecta o el cliente no activó su bóveda.
 */
export async function unlockClientKey(
  clientId: string,
  passphrase: string,
): Promise<string | null> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("client_vaults")
    .select("salt, verifier, private_key_encrypted")
    .eq("client_id", clientId)
    .maybeSingle();
  if (!data) return null;
  const key = deriveKey(passphrase, data.salt as string);
  if (!checkVerifier(data.verifier as string, key)) return null;
  try {
    return unprotectPrivateKey(data.private_key_encrypted as string, key);
  } catch {
    return null;
  }
}
