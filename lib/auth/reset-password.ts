import { and, eq, inArray, sql } from "drizzle-orm";
import { schema, type Tx } from "@/db";
import { audit } from "@/lib/audit";
import { failKey } from "./lockout";
import { checkReset } from "./reset";

/** Kimlik işlemi: kiracı jetondan doğrulanan kullanıcıdan alınır. */
export async function applyPasswordReset(tx: Tx, token: string, passwordHash: string) {
  const U = schema.users;
  const snapshot: { user?: { passwordHash: string; active: boolean; tokenVersion: number } } = {};
  const userId = await checkReset(token, async (id) => {
    const [user] = await tx.select({ passwordHash: U.passwordHash, active: U.active, tokenVersion: U.tokenVersion }).from(U).where(eq(U.id, id));
    snapshot.user = user;
    return user ?? null;
  });
  if (!userId || !snapshot.user) return null;
  const [user] = await tx.update(U).set({ passwordHash, tokenVersion: sql`${U.tokenVersion} + 1` })
    .where(and(eq(U.id, userId), eq(U.passwordHash, snapshot.user.passwordHash), eq(U.tokenVersion, snapshot.user.tokenVersion), eq(U.active, true)))
    .returning({ id: U.id, tenantId: U.tenantId, tokenVersion: U.tokenVersion, email: U.email });
  if (!user) return null;
  await tx.execute(sql`select set_config('app.tenant_id', ${user.tenantId}, true)`);
  await audit(tx, user.tenantId, `user:${user.id}`, "user.password_reset");
  await tx.delete(schema.loginAttempts).where(inArray(schema.loginAttempts.key, [`e:${user.email}`, failKey(user.email)]));
  return user;
}
