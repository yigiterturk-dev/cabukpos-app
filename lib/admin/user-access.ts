import { and, eq, sql } from "drizzle-orm";
import { schema, type Tx } from "@/db";
import { audit } from "@/lib/audit";
import { accessChangeProblem } from "@/lib/core/access";
import { lockManagementActor } from "./user-manager";

type AccessInput = { userId: string; role: string; storeId: string | null; active: boolean };
export type AccessResult = { error?: string; field?: string; ok?: string };
const UUID = /^[0-9a-f-]{36}$/i;

/** withTenant içinde çağrılır; erişim değişikliği ve denetim kaydı birlikte yazılır. */
export async function changeUserAccess(tx: Tx, tenantId: string, actorId: string, input: AccessInput): Promise<AccessResult> {
  const actor = await lockManagementActor(tx, tenantId, actorId);
  if (!actor) return { error: "Erişiminiz değişti; yeniden giriş yapın." };
  const U = schema.users;
  const [target] = await tx.select({ id: U.id, role: U.role, storeId: U.storeId, active: U.active }).from(U)
    .where(and(eq(U.id, input.userId), eq(U.tenantId, tenantId)));
  if (!target) return { error: "Kullanıcı bulunamadı; listeyi yenileyin." };
  const problem = accessChangeProblem(actor, target, input);
  if (problem === "self") return { error: "Kendi erişiminizi bu ekrandan değiştiremezsiniz.", field: "role" };
  if (problem === "role") return { error: "Rol geçersiz.", field: "role" };
  if (problem === "store") return { error: "İşletme sahibi belirli bir şubeye bağlanamaz.", field: "storeId" };
  if (problem === "forbidden") return { error: "Bu hesabı düzenleme yetkiniz yok.", field: "role" };
  const storeId = input.role === "mudur" ? input.storeId : null;
  if (storeId) {
    if (!UUID.test(storeId)) return { error: "Şube bulunamadı; listeyi yenileyip tekrar deneyin.", field: "storeId" };
    const [store] = await tx.select({ id: schema.stores.id }).from(schema.stores)
      .where(and(eq(schema.stores.id, storeId), eq(schema.stores.tenantId, tenantId)));
    if (!store) return { error: "Şube bulunamadı; listeyi yenileyip tekrar deneyin.", field: "storeId" };
  }
  if (target.active && target.role === "sahip" && (input.role !== "sahip" || !input.active)) {
    const [owners] = await tx.select({ n: sql<number>`count(*)::int` }).from(U)
      .where(and(eq(U.tenantId, tenantId), eq(U.role, "sahip"), eq(U.active, true)));
    if (owners.n <= 1) return { error: "Son aktif işletme sahibinin yetkisi kaldırılamaz.", field: "active" };
  }
  const changed = target.role !== input.role || target.storeId !== storeId || target.active !== input.active;
  await tx.update(U).set({ role: input.role as "sahip" | "mudur", storeId, active: input.active,
    ...(changed ? { tokenVersion: sql`${U.tokenVersion} + 1` } : {}) })
    .where(and(eq(U.id, input.userId), eq(U.tenantId, tenantId)));
  await audit(tx, tenantId, `user:${actor.id}`, "user.access", { userId: input.userId, role: input.role, storeId, active: input.active });
  return { ok: "Erişim güncellendi." };
}
