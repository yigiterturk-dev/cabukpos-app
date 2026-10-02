// Yönetici (işletme sahibi/müdür) oturumu: cz_session, 14 gün. Sürüm (tokenVersion) DB'de kontrol edilir.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { signJwt, verifyJwt } from "./jwt";
import { assertCsrf } from "./csrf";
import { billingInfo } from "@/lib/core/billing";

export { ADMIN_COOKIE } from "./session-cookie";
import { ADMIN_COOKIE } from "./session-cookie";
const MAX_AGE = 60 * 60 * 24 * 14;

export async function setAdminSession(userId: string, tenantId: string, v: number) {
  (await cookies()).set(ADMIN_COOKIE, await signJwt("admin", { userId, tenantId, v }, MAX_AGE), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE,
  });
}

export async function clearAdminSession() {
  (await cookies()).delete(ADMIN_COOKIE);
}

export async function getAdmin() {
  const p = await verifyJwt("admin", (await cookies()).get(ADMIN_COOKIE)?.value);
  if (!p || typeof p.userId !== "string") return null;
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
