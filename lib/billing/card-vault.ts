// lib/billing/card-vault.ts — Saklanan kart jetonunun şifrelenmesi (AES-256-GCM).
// Anahtar AUTH_SECRET'ten türetilir (scrypt, sabit tuz); DB'de yalnız şifreli hâlâ durur.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const key = () => scryptSync(process.env.AUTH_SECRET ?? "", "cabukpos-card-token", 32);

/** "v1:<iv>:<tag>:<ct>" (base64url). AUTH_SECRET yoksa null (kart saklama kapalı). */
export function encryptCardToken(plain: string): string | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret || !plain) return null;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1:${iv.toString("base64url")}:${c.getAuthTag().toString("base64url")}:${ct.toString("base64url")}`;
}

/** Bozuk/anahtar değişmiş girdide null döner; asla fırlatmaz. */
export function decryptCardToken(v: string | null): string | null {
  if (!v || !process.env.AUTH_SECRET) return null;
  const [ver, iv, tag, ct] = v.split(":");
  if (ver !== "v1" || !iv || !tag || !ct) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
