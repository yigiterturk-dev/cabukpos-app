import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { recordTransfer } = await import("@/lib/admin/transfer");
const { transferDocument } = await import("@/lib/admin/transfer-document");
const { eq, inArray } = await import("drizzle-orm");
const tenants: string[] = [];
after(async () => {
  if (tenants.length) await getDb().delete(schema.tenants).where(inArray(schema.tenants.id, tenants));
  await closeDb();
});
const owner = { id: crypto.randomUUID(), role: "sahip" as const, storeId: null };
const [tenant] = await getDb().insert(schema.tenants).values({ name: "TRANSFER-DOC-T", vertical: "market" }).returning();
tenants.push(tenant.id);
const fixture = await withTenant(tenant.id, async (tx) => {
  const stores = await tx.insert(schema.stores).values(["Kaynak", "Hedef", "Başka"].map((name) => ({ tenantId: tenant.id, name }))).returning();
  const products = await tx.insert(schema.products).values([
    { tenantId: tenant.id, name: "Un", price: 100, vatRate: 1, kind: "tartili" as const, trackStock: true },
    { tenantId: tenant.id, name: "Bardak", price: 100, vatRate: 20, trackStock: true },
  ]).returning();
  await tx.insert(schema.stockMovements).values(products.map((p) => ({ tenantId: tenant.id, storeId: stores[0].id, productId: p.id, kind: "sayim" as const, qtyMilli: 10000, actor: "test" })));
  const result = await recordTransfer(tx, tenant.id, owner, { fromStoreId: stores[0].id, toStoreId: stores[1].id, note: "Kontrol notu", lines: [{ productId: products[0].id, qty: "2,5" }, { productId: products[1].id, qty: "3" }] });
  assert.ok("id" in result);
  return { stores, id: result.id };
});

test("transfer dökümü: sahip/HQ ve her iki şube görebilir, ilgisiz şube göremez", async () => {
  for (const actor of [owner, { ...owner, role: "mudur" as const }, ...fixture.stores.slice(0, 2).map((s) => ({ ...owner, role: "mudur" as const, storeId: s.id }))]) {
    const doc = await withTenant(tenant.id, (tx) => transferDocument(tx, actor, fixture.id));
    assert.ok(doc);
    assert.equal(doc.fromName, "Kaynak");
    assert.equal(doc.toName, "Hedef");
    assert.equal(doc.note, "Kontrol notu");
    assert.deepEqual(doc.lines.map((l) => [l.name, l.qtyMilli, l.unit]), [["Bardak", 3000, "adet"], ["Un", 2500, "kg"]]);
  }
  assert.equal(await withTenant(tenant.id, (tx) => transferDocument(tx, { ...owner, role: "mudur", storeId: fixture.stores[2].id }, fixture.id)), null);
});

test("transfer dökümü: başka kiracı ve hatalı/bilinmeyen kimlik veri döndürmez", async () => {
  const [other] = await getDb().insert(schema.tenants).values({ name: "TRANSFER-DOC-OTHER", vertical: "market" }).returning();
  tenants.push(other.id);
  assert.equal(await withTenant(other.id, (tx) => transferDocument(tx, owner, fixture.id)), null);
  for (const id of ["invalid", "-".repeat(36), crypto.randomUUID()]) {
    assert.equal(await withTenant(tenant.id, (tx) => transferDocument(tx, owner, id)), null);
  }
  const [saved] = await withTenant(tenant.id, (tx) => tx.select().from(schema.stockTransfers).where(eq(schema.stockTransfers.id, fixture.id)));
  assert.ok(saved, "dökümü okuma transferi değiştirmemeli");
});
