import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import type { NavContext } from "../nav-data";

export async function navContext() {
  const a = await requireAdmin();
  const storeCount = await withTenant(a.tenantId, async (tx) => {
    const rows = await tx.select({ id: schema.stores.id }).from(schema.stores);
    return rows.length;
  });
  const ctx: NavContext = { vertical: a.vertical, storeCount, allStores: !a.storeId };
  return { a, ctx };
}
