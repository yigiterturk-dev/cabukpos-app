// lib/billing/card-vault.ts — Saklanan kart jetonunun şifrelenmesi (AES-256-GCM).
// v2 güncel anahtar (AUTH_SECRET); v1 yalnız çözümleme: AUTH_SECRET_PREVIOUS rotasyon
// öncesi secret'ıysa eski satırlar okunur, değilse AUTH_SECRET ile denenir (döndürmemiş dağıtımlar).
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const derive = (secret: string, ver: "v1" | "v2") => scryptSync(secret, ver === "v1" ? "cabukpos-card-token" : "cabukpos-card-token-v2", 32);

/** "v2:<iv>:<tag>:<ct>" (base64url). AUTH_SECRET yoksa null (kart saklama kapalı). */
export function encryptCardToken(plain: string): string | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret || !plain) return null;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", derive(secret, "v2"), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v2:${iv.toString("base64url")}:${c.getAuthTag().toString("base64url")}:${ct.toString("base64url")}`;
}

/** Bozuk/anahtar değişmiş girdide null döner; asla fırlatmaz. */
export function decryptCardToken(v: string | null): string | null {
  const secret = process.env.AUTH_SECRET;
  if (!v || !secret) return null;
  const [ver, iv, tag, ct] = v.split(":");
  if ((ver !== "v1" && ver !== "v2") || !iv || !tag || !ct) return null;
  const key =
    ver === "v2"
      ? derive(secret, "v2")
      : process.env.AUTH_SECRET_PREVIOUS
        ? derive(process.env.AUTH_SECRET_PREVIOUS, "v1")
        : derive(secret, "v1");
  try {
    const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
