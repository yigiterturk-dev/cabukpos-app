import { and, eq } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { audit } from "@/lib/audit";
import { newDeviceToken } from "@/lib/auth/tokens";
import { CONNECTABLE_PLATFORMS } from "./index";

/** Caller authorizes the administrator and resolves their permitted store first. */
export async function provisionConnection(tenantId: string, storeId: string, platform: string, actor: string) {
  if (!CONNECTABLE_PLATFORMS.includes(platform)) throw new Error("Bu platform henüz desteklenmiyor.");
  return withTenant(tenantId, async (tx) => {
    const S = schema.stores, P = schema.platformConnections;
    const [store] = await tx.select({ id: S.id }).from(S).where(and(eq(S.id, storeId), eq(S.tenantId, tenantId)));
    if (!store) throw new Error("Şube bulunamadı.");
    const [connection] = await tx.insert(P).values({
      tenantId, storeId, platform, webhookSecret: newDeviceToken(), autoAccept: true,
    }).onConflictDoNothing({ target: [P.storeId, P.platform] }).returning();
    if (!connection) return null;
    await audit(tx, tenantId, actor, "platform.connect", { platform, storeId, autoAccept: true });
    return connection;
  });
}
