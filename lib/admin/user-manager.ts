import { and, eq } from "drizzle-orm";
import { schema, type Tx } from "@/db";

/** Hesap açma, erişim değişikliği ve davet üretimi aynı kilitle sıralanır. */
export async function lockManagementActor(tx: Tx, tenantId: string, actorId: string) {
  // FK kontrollerini engellemeden erişim değişikliklerini sıraya sokar.
  const [tenant] = await tx.select({ id: schema.tenants.id }).from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId)).for("no key update");
  if (!tenant) return null;
  const U = schema.users;
  const [actor] = await tx.select({ id: U.id, role: U.role, storeId: U.storeId, active: U.active }).from(U)
    .where(and(eq(U.id, actorId), eq(U.tenantId, tenantId)));
  return actor?.active ? actor : null;
}
