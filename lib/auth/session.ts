// JWT tabanlı oturum (session) — jose ile imzalı, httpOnly cookie.
//
// Cookie payload: { userId, businessId, role }. AUTH_SECRET ile HMAC (HS256) imzalanır.
// Cookie özellikleri: httpOnly (JS okuyamaz), secure (prod'da yalnız https),
// sameSite=lax (CSRF azaltma), ~30 gün ömür.
//
// Bu modül server-only'dir (cookies() + AUTH_SECRET). Client'tan import etmeyin.
// db/index.ts ile aynı desen: window guard ile yanlışlıkla client'a sızması engellenir.

import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

if (typeof window !== "undefined") {
  throw new Error(
    "lib/auth/session.ts yalnızca sunucuda kullanılabilir; client'tan import etmeyin."
  );
}

export const SESSION_COOKIE = "rezzy_session";
const MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 gün

export type SessionPayload = {
  userId: string;
  businessId: string;
  role: string;
  /** JWT iat (saniye). Oturum iptali kontrolü için gerekir. */
  issuedAt: number;
};

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET tanımlı değil veya çok kısa (.env.local).");
  }
  return new TextEncoder().encode(secret);
}

/** Payload'ı imzalayıp httpOnly session cookie olarak set eder. */
export async function createSession(
  payload: Omit<SessionPayload, "issuedAt">
): Promise<void> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SEC}s`)
    .sign(getSecret());

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

/** Cookie'deki JWT'yi doğrular → SessionPayload | null. */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const { userId, businessId, role, iat } = payload as Record<string, unknown>;
    if (
      typeof userId === "string" &&
      typeof businessId === "string" &&
      typeof role === "string" &&
      typeof iat === "number"
    ) {
      return { userId, businessId, role, issuedAt: iat };
    }
    return null;
  } catch {
    // imza/expiry hatası → oturum yok say
    return null;
  }
}

/** Session cookie'sini temizler. */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/**
 * Oturum HÂLÂ geçerli mi — kullanıcı duruyor ve erişimi iptal edilmemiş mi?
 *
 * NEDEN GEREKLİ: JWT durumsuzdur. İmza geçerli olduğu sürece kullanıcı silinse de,
 * şifresi değişse de, personel işten çıkarılsa da çerez 30 gün çalışır. Bu kontrol
 * db/session-epoch.sql'deki auth_session_live()'a sorar.
 *
 * FAIL-CLOSED: veritabanına ulaşılamazsa `false` döner. "Emin olamadım, içeri al"
 * demek bir yetkilendirme kontrolünü anlamsız kılar.
 */
export async function isSessionLive(session: SessionPayload): Promise<boolean> {
  try {
    const { db } = await import("@/db");
    const { sql } = await import("drizzle-orm");
    const res = (await db.execute(
      sql`SELECT auth_session_live(${session.userId}::uuid, ${session.issuedAt}) AS live`
    )) as unknown as { rows: Array<{ live: boolean }> };
    return res.rows?.[0]?.live === true;
  } catch (e) {
    console.error("[auth] oturum canlılık kontrolü başarısız, fail-closed:", e);
    return false;
  }
}

/** Geçerli VE iptal edilmemiş oturum; aksi halde null. */
export async function getLiveSession(): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session) return null;
  return (await isSessionLive(session)) ? session : null;
}
