// Şifre sıfırlama bağlantısı: 1 saatlik JWT (aud "reset"). İçindeki `ph` şifre özetinin parmak izi →
// şifre veya erişim sürümü değişince bağlantı geçersiz (tek kullanımlık, yeni tablo gerekmez).
import { createHash } from "node:crypto";
import { signJwt, verifyJwt } from "./jwt";

export const RESET_SECONDS = 60 * 60;
/** Davet bağlantısı: şifresi henüz belirlenmemiş yeni hesap için 3 gün. */
export const INVITE_SECONDS = 60 * 60 * 24 * 3;
export const hashPrint = (passwordHash: string) => createHash("sha256").update(passwordHash).digest("base64url").slice(0, 16);

export type ResetAccount = { id: string; passwordHash: string; tokenVersion: number };
export const resetToken = (u: ResetAccount, seconds = RESET_SECONDS) => signJwt("reset", { sub: u.id, ph: hashPrint(u.passwordHash), v: u.tokenVersion }, seconds);

/** Geçerliyse kullanıcı kimliği; imza/süre, şifre veya erişim sürümü değişmişse null. */
export async function checkReset(token: string, current: (userId: string) => Promise<{ passwordHash: string; active: boolean; tokenVersion: number } | null>): Promise<string | null> {
  const p = await verifyJwt("reset", token);
  if (!p?.sub || typeof p.ph !== "string" || typeof p.v !== "number" || !Number.isSafeInteger(p.v) || p.v < 0) return null;
  const u = await current(p.sub);
  return u?.active && u.tokenVersion === p.v && hashPrint(u.passwordHash) === p.ph ? p.sub : null;
}
