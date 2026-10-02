// lib/auth/api.ts — API rotaları için merkezi kimlik kapıları.
// Sayfa hattındaki requireAdmin/requireWriter'ın JSON karşılığı: redirect atmaz,
// Response döner. Çerezle gelen MUTASYON isteklerinde fetch-metadata CSRF denetimi
// de burada tek noktadan (assertCsrf; bearer'lı makine istekleri GET yerine token
// taşır ve çerezsizdir, CSRF tehdit modeli dışıdır).
import type { getAdmin } from "./session";
import { assertCsrf } from "./csrf";

export type Admin = NonNullable<Awaited<ReturnType<typeof getAdmin>>>;
export type ApiGate = { ok: true; admin: Admin } | { ok: false; res: Response };

async function gate(writer: boolean, req?: Request): Promise<ApiGate> {
  if (req && req.method !== "GET" && req.method !== "HEAD") {
    try {
      await assertCsrf();
    } catch {
      return { ok: false, res: new Response("CSRF reddi.", { status: 403 }) };
    }
  }
  const { getAdmin } = await import("./session");
  const a = await getAdmin();
  if (!a) return { ok: false, res: new Response("Oturum gerekli.", { status: 401 }) };
  if (writer && a.billing.locked) return { ok: false, res: new Response("Abonelik kilitli.", { status: 402 }) };
  return { ok: true, admin: a };
}

/** Okuma: geçerli yönetici oturumu. */
export function requireApiAdmin(req?: Request): Promise<ApiGate> {
  return gate(false, req);
}

/** Yazma: yönetici + abonelik kilidi açık. */
export function requireApiWriter(req?: Request): Promise<ApiGate> {
  return gate(true, req);
}

/** Rol kısıtı: izinli değilse 403 Response, aksi null. */
export function apiRole(a: Admin, roles: Array<Admin["role"]>): Response | null {
  return roles.includes(a.role) ? null : new Response("Yetkisiz.", { status: 403 });
}
