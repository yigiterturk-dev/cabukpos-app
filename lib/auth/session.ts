// Yönetici (işletme sahibi/müdür) oturumu: cz_session, 14 gün. Sürüm (tokenVersion) DB'de kontrol edilir.
// #9: her oturum sessions tablosunda hash'le izlenir → listeleme + cihaz bazlı düşme (lib/auth/sessions.ts).
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { signJwt, verifyJwt } from "./jwt";
import { assertCsrf } from "./csrf";
import { sha256 } from "./tokens";
import { touchSessionByHash, type SessionRow } from "./sessions";
import { billingInfo } from "@/lib/core/billing";

export { ADMIN_COOKIE } from "./session-cookie";
import { ADMIN_COOKIE, ADMIN_SESSION_MAX_AGE } from "./session-cookie";
export { uaLabel, sonGorulme, listSessions } from "./sessions";
import { listSessions, recordSession, revokeSessionByHash, revokeSessionsExcept, revokeAllSessions } from "./sessions";
const MAX_AGE = ADMIN_SESSION_MAX_AGE;

const cookieToken = async () => (await cookies()).get(ADMIN_COOKIE)?.value;
const tokenHashOf = (token: string) => sha256(token);
const currentHash = async (): Promise<string> => {
  const t = await cookieToken();
  return t ? await tokenHashOf(t) : "";
};

/** İzlenebilir oturum: JWT imzala + çereze yaz + hash'ini kaydet (ua/ip ile). */
export async function setAdminSession(userId: string, tenantId: string, v: number) {
  const token = await signJwt("admin", { userId, tenantId, v }, MAX_AGE);
  (await cookies()).set(ADMIN_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE,
  });
  const h = await headers();
  await recordSession(userId, tenantId, await tokenHashOf(token), (h.get("user-agent") ?? "").slice(0, 200), (h.get("x-forwarded-for") ?? "").split(",")[0].trim().slice(0, 45));
}

export async function clearAdminSession() {
  (await cookies()).delete(ADMIN_COOKIE);
}

/** Çıkışta geçerli oturumu iptal et: çerez çalınsa bile artık geçmez. */
export async function revokeCurrentSession() {
  const token = await cookieToken();
  if (!token) return;
  await revokeSessionByHash(await tokenHashOf(token));
}

/** #9: bu isteğin açısından aktif oturumlar. */
export const activeSessions = (userId: string): Promise<SessionRow[]> => currentHash().then((h) => listSessions(userId, h));

/** Diğer cihazların oturumlarını düşürür (bu cihaz kalır). */
export const revokeOtherSessions = (userId: string): Promise<number> => currentHash().then((h) => revokeSessionsExcept(userId, h));

/** Tüm cihazlar (bu cihaz dahil). */
export const revokeEverything = (userId: string): Promise<number> => revokeAllSessions(userId);

export async function getAdmin() {
  const token = await cookieToken();
  const p = await verifyJwt("admin", token);
  if (!p || typeof p.userId !== "string" || typeof p.tenantId !== "string" || !token) return null;
  if (!(await touchSessionByHash(await tokenHashOf(token)))) return null; // #9: iptal edilmiş/olmayan oturum geçersiz
  const u = schema.users, t = schema.tenants;
  const [row] = await getDb()
    .select({ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active, v: u.tokenVersion, tenantId: u.tenantId, tenantName: t.name, vertical: t.vertical, trialEndsAt: t.trialEndsAt, paidUntil: t.paidUntil, emailVerifiedAt: u.emailVerifiedAt })
    .from(u).innerJoin(t, eq(t.id, u.tenantId)).where(eq(u.id, p.userId));
  if (!row || !row.active || row.v !== p.v || row.tenantId !== p.tenantId) return null;
  return { id: row.id, name: row.name, email: row.email, role: row.role, tenantId: row.tenantId, tenantName: row.tenantName, vertical: row.vertical, emailVerified: Boolean(row.emailVerifiedAt), billing: billingInfo({ trialEndsAt: row.trialEndsAt, paidUntil: row.paidUntil }) };
}

export async function requireAdmin() {
  const a = await getAdmin();
  if (!a) redirect("/giris");
  return a;
}

/** Yönetim yazması (server action): abonelik kilitliyse Abonelik sayfasına. Okuma serbest; kasa hiç etkilenmez. */
export async function requireWriter() {
  await assertCsrf();
  const a = await requireAdmin();
  if (a.billing.locked) redirect("/yonetim/abonelik?kilit=1");
  return a;
}
