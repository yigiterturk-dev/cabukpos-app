// lib/auth/verify-email.ts — E-posta doğrulama bağlantısı: 24 saatlik JWT (aud "dogrula").
// E-posta değişirse bağlantı geçersiz; DB tablosu gerekmez (reset akışıyla aynı aile).
import { signJwt, verifyJwt } from "./jwt";

export const DOGRULA_SECONDS = 60 * 60 * 24;

export const dogrulaToken = (u: { id: string; email: string }) => signJwt("dogrula", { sub: u.id, em: u.email }, DOGRULA_SECONDS);

export type DogrulaDurum = { durum: "ok" | "zaten" | "bozuk"; userId: string | null };

export async function checkDogrula(
  token: string,
  current: (userId: string) => Promise<{ email: string; active: boolean; emailVerifiedAt: Date | null } | null>,
): Promise<DogrulaDurum> {
  const p = await verifyJwt("dogrula", token);
  if (!p?.sub || typeof p.em !== "string") return { durum: "bozuk", userId: null };
  const u = await current(p.sub);
  if (!u || !u.active || u.email !== p.em) return { durum: "bozuk", userId: null };
  return { durum: u.emailVerifiedAt ? "zaten" : "ok", userId: p.sub };
}
