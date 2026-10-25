import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { schema, getDb, withTenant, closeDb } from "@/db";
const tenantId = "caa8f1f4-b280-4d99-a265-e0a3e6b93859";
const url = new URL(process.env.DATABASE_URL!);
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
assert.equal(url.pathname, "/cabukpos_preview_1792855963497");
try {
  const [tenant] = await getDb().select({ name: schema.tenants.name }).from(schema.tenants).where(eq(schema.tenants.id, tenantId));
  assert.equal(tenant?.name, "Yerel Demo");
  await withTenant(tenantId, async tx => {
    await tx.insert(schema.stores).values({ id: "d38e0001-1111-4111-a111-111111111111", tenantId, name: "Demo Özellik Deposu", kind: "depo" }).onConflictDoNothing();
    await tx.insert(schema.products).values({ id: "d38e0002-1111-4111-a111-111111111111", tenantId, name: "Demo Pirinç · hammadde", kind: "tartili", unit: "kg", sellable: false, price: 0, vatRate: 10, cost: 2500, minStock: 5000, trackStock: true }).onConflictDoNothing();
    await tx.insert(schema.suppliers).values({ id: "d38e0003-1111-4111-a111-111111111111", tenantId, name: "Demo Gıda Tedarikçisi" }).onConflictDoNothing();
    await tx.insert(schema.stockMovements).values({ id: "d38e0004-1111-4111-a111-111111111111", tenantId, storeId: "d38e0001-1111-4111-a111-111111111111", productId: "d38e0002-1111-4111-a111-111111111111", kind: "sayim", qtyMilli: 20000, actor: "demo:feature-completion", note: "Örnek başlangıç stoku", at: new Date("2026-10-24T00:00:00+03:00") }).onConflictDoNothing();
  });
  console.log("Yerel örnek depo, hammadde ve tedarikçi hazır. Kullanıcı PIN'i ve aktif vardiya değişmedi.");
} finally { await closeDb(); }
