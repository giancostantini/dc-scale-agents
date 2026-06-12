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
  constants as cryptoConstants,
  createCipheriv,
  createDecipheriv,
  generateKeyPairSync,
  privateDecrypt,
  publicEncrypt,
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

// ───────────────────────────────────────────────────────────────────────────
// Cifrado de sobre (envelope) con dos destinatarios — bóveda compartida
// cliente ↔ equipo.
//
// Cada credencial se cifra con un DEK (Data Encryption Key) random AES-256.
// El DEK se "envuelve" (RSA-OAEP) con la pública de cada destinatario: el
// equipo y, si tiene bóveda activa, el cliente. Para DEPOSITAR alcanza con las
// públicas (no hace falta passphrase). Para LEER hace falta la privada de uno
// de los dos lados, que está cifrada con la passphrase de ese lado.
//
// Garantía: el servidor no puede descifrar sin una de las dos passphrases.
// ───────────────────────────────────────────────────────────────────────────

const RSA_MODULUS_BITS = 2048;
const OAEP_HASH = "sha256";

export interface Keypair {
  publicKeyPem: string;
  privateKeyPem: string;
}

/** Genera un par RSA-2048 (PEM: pública spki, privada pkcs8). */
export function generateKeypair(): Keypair {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: RSA_MODULUS_BITS,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKeyPem: publicKey, privateKeyPem: privateKey };
}

/** DEK random AES-256 (32 bytes). */
export function generateDek(): Buffer {
  return randomBytes(KEY_LENGTH);
}

/** Envuelve (cifra) un DEK con una pública RSA → hex. */
export function wrapKey(publicKeyPem: string, dek: Buffer): string {
  return publicEncrypt(
    {
      key: publicKeyPem,
      padding: cryptoConstants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: OAEP_HASH,
    },
    dek,
  ).toString("hex");
}

/** Desenvuelve (descifra) un DEK con la privada RSA correspondiente. */
export function unwrapKey(privateKeyPem: string, wrappedHex: string): Buffer {
  return privateDecrypt(
    {
      key: privateKeyPem,
      padding: cryptoConstants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: OAEP_HASH,
    },
    Buffer.from(wrappedHex, "hex"),
  );
}

/**
 * Cifra un secreto para varios destinatarios. Devuelve el ciphertext (AES-GCM
 * con un DEK random) y el DEK envuelto para cada pública, en el mismo orden
 * que `publicKeyPems`.
 */
export function sealSecret(
  plaintext: string,
  publicKeyPems: string[],
): { ct: string; deks: string[] } {
  const dek = generateDek();
  const ct = encryptWithKey(plaintext, dek);
  const deks = publicKeyPems.map((pem) => wrapKey(pem, dek));
  return { ct, deks };
}

/** Descifra un secreto con la privada de un destinatario y su DEK envuelto. */
export function openSecret(
  ct: string,
  wrappedDekHex: string,
  privateKeyPem: string,
): string {
  const dek = unwrapKey(privateKeyPem, wrappedDekHex);
  return decryptWithKey(ct, dek);
}

/** Protege la privada PEM con la llave derivada de la passphrase (AES-GCM). */
export function protectPrivateKey(
  privateKeyPem: string,
  key: Buffer,
): string {
  return encryptWithKey(privateKeyPem, key);
}

/** Recupera la privada PEM con la llave derivada de la passphrase. */
export function unprotectPrivateKey(encrypted: string, key: Buffer): string {
  return decryptWithKey(encrypted, key);
}
