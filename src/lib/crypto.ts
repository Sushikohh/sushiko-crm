import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";

/**
 * 32-Byte-Schlüssel aus APP_ENCRYPTION_KEY: entweder direkt (base64, 32 Byte) oder – bei anderen
 * Formaten mit mindestens 32 Zeichen, z. B. von Hosting-Plattformen generiert – per SHA-256 abgeleitet.
 */
export function encryptionKeyFrom(raw: string): Buffer | null {
  const v = raw.trim();
  const b64 = Buffer.from(v, "base64");
  if (b64.length === 32 && /^[A-Za-z0-9+/=_-]+$/.test(v)) return b64;
  if (v.length >= 32) return createHash("sha256").update(v, "utf8").digest();
  return null;
}

function key(): Buffer {
  const k = encryptionKeyFrom(env.APP_ENCRYPTION_KEY || "");
  if (!k) throw new Error("APP_ENCRYPTION_KEY fehlt oder ist zu kurz (mind. 32 Zeichen). Erzeugen mit: openssl rand -base64 32");
  return k;
}

/** AES-256-GCM. Format: v1:<iv>:<tag>:<ciphertext> (base64). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), enc.toString("base64")].join(":");
}

export function decryptSecret(payload: string | null | undefined): string | null {
  if (!payload) return null;
  const [v, iv, tag, data] = payload.split(":");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Unbekanntes Format für verschlüsselte Daten");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

export function randomToken(bytes = 24) {
  return randomBytes(bytes).toString("base64url");
}

export function hmac(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
