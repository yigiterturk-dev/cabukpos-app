// tests/rls.test.ts — cabukpos_test üzerinde, uygulama rolüyle.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { eq, inArray } = await import("drizzle-orm");

after(async () => {
  await getDb().delete(schema.tenants).where(inArray(schema.tenants.name, ["RLS-A", "RLS-B"]));
  await closeDb();
});

test("RLS: kiracı yalnız kendini görür, başkası adına yazamaz, ayarsız hiçbir şey görmez", async () => {
  const [a, b] = await getDb().insert(schema.tenants).values([{ name: "RLS-A", vertical: "market" }, { name: "RLS-B", vertical: "restoran" }]).returning();
  await withTenant(a.id, (tx) => tx.insert(schema.products).values({ tenantId: a.id, name: "Süt", price: 3500, vatRate: 1 }));
  assert.equal((await withTenant(a.id, (tx) => tx.select().from(schema.products))).length, 1);
  assert.equal((await withTenant(b.id, (tx) => tx.select().from(schema.products))).length, 0);
  assert.equal((await getDb().select().from(schema.products).where(eq(schema.products.name, "Süt"))).length, 0);
  await assert.rejects(withTenant(b.id, (tx) => tx.insert(schema.products).values({ tenantId: a.id, name: "Sahte", price: 1, vatRate: 1 })), (e: Error) => /row-level security/.test(String((e.cause as Error | undefined)?.message ?? e.message)));
});
