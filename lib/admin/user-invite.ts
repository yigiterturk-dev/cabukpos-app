import { and, eq } from "drizzle-orm";
import { schema, type Tx } from "@/db";
import { audit } from "@/lib/audit";
import { canManageUser, canManageUsers } from "@/lib/core/access";
import { inviteLink } from "@/lib/auth/invite";
import { lockManagementActor } from "./user-manager";

/** Yalnız bağlantı üretir; e-posta transaction tamamlandıktan sonra gönderilir. */
export async function issueUserInvite(tx: Tx, tenantId: string, requestActor: { id: string }, userId: string) {
  const actor = await lockManagementActor(tx, tenantId, requestActor.id);
  if (!actor) return { error: "Erişiminiz değişti; yeniden giriş yapın." };
  if (!canManageUsers(actor)) return { error: "Davet gönderme yetkiniz yok." };
  const U = schema.users;
  const [user] = await tx.select({ id: U.id, email: U.email, name: U.name, role: U.role, storeId: U.storeId, active: U.active, passwordHash: U.passwordHash, tokenVersion: U.tokenVersion })
    .from(U).where(and(eq(U.id, userId), eq(U.tenantId, tenantId)));
  if (!user?.active) return { error: "Kullanıcı bulunamadı." };
  if (!canManageUser(actor, user)) return { error: "Bu hesaba davet gönderme yetkiniz yok." };
  const link = await inviteLink(user);
  await audit(tx, tenantId, `user:${actor.id}`, "user.invite", { userId, stage: "issued" });
  return { invite: { email: user.email, name: user.name, link } };
}
