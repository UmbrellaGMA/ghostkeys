import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { requireEnv } from "@/lib/env";

/**
 * Criptografia das keys digitais (AES-256-GCM).
 * Formato armazenado: v1:<iv base64>:<authTag base64>:<ciphertext base64>
 * A chave fica apenas na variável KEYS_ENCRYPTION_SECRET (nunca no banco).
 */

function secretKey(secret?: string): Buffer {
  const raw = Buffer.from(secret ?? requireEnv("KEYS_ENCRYPTION_SECRET"), "base64");
  if (raw.length !== 32) {
    throw new Error("KEYS_ENCRYPTION_SECRET deve ter 32 bytes codificados em base64.");
  }
  return raw;
}

export function encryptSecret(plain: string, secret?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(secret), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(payload: string, secret?: string): string {
  const [version, ivB64, tagB64, dataB64] = payload.split(":");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) throw new Error("Formato de key criptografada inválido.");
  const decipher = createDecipheriv("aes-256-gcm", secretKey(secret), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

/** Hash determinístico (HMAC) usado para garantir unicidade da key sem armazená-la em claro. */
export function hashSecret(plain: string, secret?: string): string {
  return createHmac("sha256", secretKey(secret)).update(plain.trim().toUpperCase()).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && ab.length > 0 && timingSafeEqual(ab, bb);
}

export function last4(code: string): string {
  const clean = code.replace(/[^A-Za-z0-9]/g, "");
  return clean.slice(-4);
}
