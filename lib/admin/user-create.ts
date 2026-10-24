import { and, eq } from "drizzle-orm";
import { schema, type Tx } from "@/db";
import { audit } from "@/lib/audit";
import { assignProblem } from "@/lib/core/access";
import { lockManagementActor } from "./user-manager";

type CreateInput = { name: string; email: string; role: string; storeId: string | null; passwordHash: string };
const UUID = /^[0-9a-f-]{36}$/i;

/** Şifre özeti önceden hazırlanır; hesap ve denetim kaydı aynı işlemde yazılır. */
export async function createManagedUser(tx: Tx, tenantId: string, requestActor: { id: string }, input: CreateInput) {
  const actor = await lockManagementActor(tx, tenantId, requestActor.id);
  if (!actor) return { error: "Erişiminiz değişti; yeniden giriş yapın." };
  const problem = assignProblem(actor, input.role, input.storeId);
  if (problem === "role") return { error: "Rol geçersiz.", field: "role" };
  if (problem === "store") return { error: "İşletme sahibi belirli bir şubeye bağlanamaz.", field: "storeId" };
  if (problem === "forbidden") return { error: "Bu rolde kullanıcı açma yetkiniz yok.", field: "role" };
  const storeId = input.role === "mudur" ? input.storeId : null;
  if (storeId) {
    if (!UUID.test(storeId)) return { error: "Şube bulunamadı; listeyi yenileyip tekrar deneyin.", field: "storeId" };
    const [store] = await tx.select({ id: schema.stores.id }).from(schema.stores)
      .where(and(eq(schema.stores.id, storeId), eq(schema.stores.tenantId, tenantId)));
    if (!store) return { error: "Şube bulunamadı; listeyi yenileyip tekrar deneyin.", field: "storeId" };
  }
  const U = schema.users;
  const [user] = await tx.insert(U).values({ tenantId, name: input.name, email: input.email, role: input.role as "sahip" | "mudur", storeId, passwordHash: input.passwordHash })
    .onConflictDoNothing({ target: U.email }).returning({ id: U.id, passwordHash: U.passwordHash, tokenVersion: U.tokenVersion });
  if (!user) return { error: "Bu e-posta zaten kayıtlı.", field: "email" };
  await audit(tx, tenantId, `user:${actor.id}`, "user.create", { userId: user.id, email: input.email, role: input.role, storeId });
  return { user };
}
