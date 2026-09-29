// Şifre sıfırlama bağlantısı: 1 saatlik JWT (aud "reset"). İçindeki `ph` şifre özetinin parmak izi →
// şifre değişince bağlantı geçersiz (tek kullanımlık, DB tablosu gerekmez).
import { createHash } from "node:crypto";
import { signJwt, verifyJwt } from "./jwt";

export const RESET_SECONDS = 60 * 60;
export const hashPrint = (passwordHash: string) => createHash("sha256").update(passwordHash).digest("base64url").slice(0, 16);

export const resetToken = (u: { id: string; passwordHash: string }) => signJwt("reset", { sub: u.id, ph: hashPrint(u.passwordHash) }, RESET_SECONDS);

/** Geçerliyse kullanıcı kimliği; imza/süre bozuksa ya da şifre o bağlantıdan sonra değiştiyse null. */
export async function checkReset(token: string, current: (userId: string) => Promise<{ passwordHash: string; active: boolean } | null>): Promise<string | null> {
  const p = await verifyJwt("reset", token);
  if (!p?.sub || typeof p.ph !== "string") return null;
  const u = await current(p.sub);
  return u?.active && hashPrint(u.passwordHash) === p.ph ? p.sub : null;
}
