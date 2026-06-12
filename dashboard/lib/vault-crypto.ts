/**
 * Cripto de la bóveda de credenciales (Opción C: la passphrase deriva la llave).
 *
 * La llave AES NO se guarda en ningún lado: se deriva en el momento desde la
 * passphrase de equipo + un salt (guardado en vault_meta). Sin la passphrase,
 * el ciphertext es irrecuperable aunque se filtre la DB y el servidor.
 *
 * Derivación: scrypt (memory-hard, en node stdlib).
 * Cifrado: AES-256-GCM, formato `iv:authTag:ciphertext` (hex).
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
// Parámetros scrypt. N=2^15 ≈ buen costo server-side (~100ms) sin exceder maxmem.
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

const VERIFIER_SENTINEL = "VAULT_OK_v1";

export function generateSalt(): string {
  return randomBytes(16).toString("hex");
}

/** Deriva la llave AES-256 desde la passphrase + salt (hex). */
export function deriveKey(passphrase: string, saltHex: string): Buffer {
  const salt = Buffer.from(saltHex, "hex");
  return scryptSync(passphrase, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
}

export function encryptWithKey(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decryptWithKey(encoded: string, key: Buffer): string {
  const parts = encoded.split(":");
  if (parts.length !== 3) throw new Error("formato de ciphertext inválido");
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

/** Genera el verifier que se guarda en vault_meta al hacer setup. */
export function computeVerifier(key: Buffer): string {
  return encryptWithKey(VERIFIER_SENTINEL, key);
}

/** True si la passphrase (→ key) es la correcta (descifra el verifier). */
export function checkVerifier(verifier: string, key: Buffer): boolean {
  try {
    return decryptWithKey(verifier, key) === VERIFIER_SENTINEL;
  } catch {
    return false;
  }
}
