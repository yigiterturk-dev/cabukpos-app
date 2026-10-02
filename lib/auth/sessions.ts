// lib/auth/sessions.ts — #9: oturum kayıtları (sessions tablosu). next/headers'a bağımlı değil → test edilebilir.
// RLS dışı kimlik tablosu (users gibi); her sorguda userId koşulu.
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

const s = () => schema.sessions;

export type SessionRow = { id: string; ua: string | null; ip: string | null; createdAt: Date; lastSeenAt: Date; current: boolean };

/** Kullanıcının aktif oturumları; current = bu isteğin çerez hash'i (null ise hiçbiri). */
export async function listSessions(userId: string, currentHash: string | null): Promise<SessionRow[]> {
  const rows = await getDb().select({ id: s().id, ua: s().ua, ip: s().ip, createdAt: s().createdAt, lastSeenAt: s().lastSeenAt, tokenHash: s().tokenHash })
    .from(s()).where(and(eq(s().userId, userId), isNull(s().revokedAt))).orderBy(sql`${s().lastSeenAt} desc`);
  return rows.map((r) => ({ id: r.id, ua: r.ua, ip: r.ip, createdAt: r.createdAt, lastSeenAt: r.lastSeenAt, current: r.tokenHash === currentHash }));
}

/** Bu hash dışındaki aktif oturumları düşürür. Etkilenen sayı döner. */
export async function revokeSessionsExcept(userId: string, keepHash: string): Promise<number> {
  const rows = await getDb().update(s()).set({ revokedAt: sql`now()` })
    .where(and(eq(s().userId, userId), isNull(s().revokedAt), ne(s().tokenHash, keepHash))).returning({ id: s().id });
  return rows.length;
}

/** Tüm aktif oturumları düşürür. Etkilenen sayı döner. */
export async function revokeAllSessions(userId: string): Promise<number> {
  const rows = await getDb().update(s()).set({ revokedAt: sql`now()` })
    .where(and(eq(s().userId, userId), isNull(s().revokedAt))).returning({ id: s().id });
  return rows.length;
}

/** Hash'a sahip aktif oturum var mı (getAdmin kapısı); varsa lastSeenAt'i dakikada bir günceller. */
export async function touchSessionByHash(hash: string): Promise<boolean> {
  const [row] = await getDb().select({ id: s().id, seen: s().lastSeenAt }).from(s()).where(and(eq(s().tokenHash, hash), isNull(s().revokedAt)));
  if (!row) return false;
  if (Date.now() - row.seen.getTime() > 60_000) await getDb().update(s()).set({ lastSeenAt: sql`now()` }).where(eq(s().id, row.id));
  return true;
}

/** Girişte kayıt: hash + ua/ip; kullanıcının eski/iptal kayıtlarını temizler. */
export async function recordSession(userId: string, tenantId: string, tokenHash: string, ua: string | null, ip: string | null) {
  await getDb().transaction(async (tx) => {
    await tx.delete(s()).where(and(eq(s().userId, userId), sql`${s().createdAt} < now() - interval '60 days' or ${s().revokedAt} is not null`));
    await tx.insert(s()).values({ userId, tenantId, tokenHash, ua: ua || null, ip: ip || null });
  });
}

/** Hash ile oturumu iptal eder (çıkış). */
export async function revokeSessionByHash(hash: string) {
  await getDb().update(s()).set({ revokedAt: sql`now()` }).where(eq(s().tokenHash, hash));
}

/** ua metnini kısa cihaz etiketine çevirir (oturum listesi). */
export const uaLabel = (ua: string | null): string => {
  if (!ua) return "Bilinmeyen cihaz";
  const os = /Windows/i.test(ua) ? "Windows" : /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iOS" : /Mac OS|Macintosh/i.test(ua) ? "macOS" : /Linux/i.test(ua) ? "Linux" : "Cihaz";
  const br = /Edg\//i.test(ua) ? "Edge" : /OPR\//i.test(ua) ? "Opera" : /Chrome\//i.test(ua) ? "Chrome" : /Firefox\//i.test(ua) ? "Firefox" : /Safari\//i.test(ua) ? "Safari" : "Tarayıcı";
  return `${br} · ${os}`;
};

/** Kısa göreli zaman: şimdi / 5 dk önce / 3 sa önce / 2 gün önce. */
export const sonGorulme = (d: Date, now = Date.now()): string => {
  const dk = Math.floor(Math.max(0, now - d.getTime()) / 60_000);
  if (dk < 2) return "şimdi";
  if (dk < 60) return `${dk} dk önce`;
  const sa = Math.floor(dk / 60);
  if (sa < 36) return `${sa} sa önce`;
  return `${Math.floor(sa / 24)} gün önce`;
};
