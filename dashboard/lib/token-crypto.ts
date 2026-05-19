/**
 * AES-256-GCM helpers para cifrar refresh/access tokens antes de
 * persistirlos en outlook_connections.
 *
 * Formato del ciphertext:
 *   `${iv_hex}:${authTag_hex}:${ciphertext_hex}`
 *
 * Env var requerida:
 *   OUTLOOK_TOKEN_ENCRYPTION_KEY — 32-byte key en hex (64 chars).
 *   Generar con: `openssl rand -hex 32`
 *
 * Por qué AES-256-GCM:
 *   - Authenticated encryption (detecta manipulación)
 *   - IV único por cifrado → mismo plaintext distinto ciphertext
 *   - Auth tag de 128 bits incluido
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM recommended IV length
const KEY_LENGTH = 32; // 256 bits

function getKey(): Buffer {
  const hex = process.env.OUTLOOK_TOKEN_ENCRYPTION_KEY?.trim();
  if (!hex || hex.length !== KEY_LENGTH * 2) {
    throw new Error(
      `OUTLOOK_TOKEN_ENCRYPTION_KEY missing or wrong length (need ${KEY_LENGTH * 2} hex chars = 32 bytes). Generate: openssl rand -hex 32`,
    );
  }
  return Buffer.from(hex, "hex");
}

export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decryptToken(encoded: string): string {
  const parts = encoded.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted token format");
  }
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const key = getKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, "hex")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
