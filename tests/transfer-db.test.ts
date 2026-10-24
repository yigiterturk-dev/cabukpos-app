import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { recordTransfer } = await import("@/lib/admin/transfer");
const { stockLevels } = await import("@/lib/admin/stock");
const { MAX_TRANSFER_LINES } = await import("@/lib/core/transfer");
const { eq, inArray } = await import("drizzle-orm");
const tenants: string[] = [];
after(async () => {
  if (tenants.length) await getDb().delete(schema.tenants).where(inArray(schema.tenants.id, tenants));
  await closeDb();
});
async function fixture() {
  const [tenant] = await getDb().insert(schema.tenants).values({ name: "TRANSFER-MULTI-T", vertical: "market" }).returning();
  tenants.push(tenant.id);
  return withTenant(tenant.id, async (tx) => {
    const stores = await tx.insert(schema.stores).values([{ tenantId: tenant.id, name: "Depo", kind: "depo" as const }, { tenantId: tenant.id, name: "Şube" }]).returning();
    const products = await tx.insert(schema.products).values([
      { tenantId: tenant.id, name: "Un", price: 5000, vatRate: 1, trackStock: true, kind: "tartili" as const, cost: 2000 },
      { tenantId: tenant.id, name: "Bardak", price: 1000, vatRate: 20, trackStock: true, cost: 500 },
    ]).returning();
    await tx.insert(schema.stockMovements).values(products.map((p) => ({ tenantId: tenant.id, storeId: stores[0].id, productId: p.id, kind: "sayim" as const, qtyMilli: 10000, actor: "test" })));
    return { tenant, stores, products, actor: { id: crypto.randomUUID(), role: "sahip" as const, storeId: null },
      input: { fromStoreId: stores[0].id, toStoreId: stores[1].id, note: "Haftalık takviye", lines: [{ productId: products[0].id, qty: "2,5" }, { productId: products[1].id, qty: "3" }] } };
  });
}
const records = (tenantId: string) => withTenant(tenantId, async (tx) => ({
  transfers: await tx.select().from(schema.stockTransfers),
  lines: await tx.select().from(schema.stockTransferLines),
  moves: await tx.select().from(schema.stockMovements).where(eq(schema.stockMovements.kind, "transfer")),
  audit: await tx.select().from(schema.auditLog).where(eq(schema.auditLog.action, "stock.transfer")),
}));

test("transfer: kg ve adet tek fişte iki şubenin stoğuna yansır; maliyet değişmez", async () => {
  const f = await fixture();
  const result = await withTenant(f.tenant.id, (tx) => recordTransfer(tx, f.tenant.id, f.actor, f.input));
  assert.ok("id" in result);
  const saved = await records(f.tenant.id);
  assert.equal(saved.transfers.length, 1);
  assert.equal(saved.lines.length, 2);
  assert.equal(saved.moves.length, 4);
  assert.equal(saved.audit.length, 1);
  assert.ok(saved.moves.every((m) => m.transferId === result.id));
  const levels = await withTenant(f.tenant.id, async (tx) => ({ from: await stockLevels(tx, f.stores[0].id), to: await stockLevels(tx, f.stores[1].id) }));
  assert.deepEqual(levels.from.map((p) => [p.name, p.level, p.cost]), [["Bardak", 7000, 500], ["Un", 7500, 2000]]);
  assert.deepEqual(levels.to.map((p) => [p.name, p.level]), [["Bardak", 3000], ["Un", 2500]]);
});

test("transfer: ikinci kalemde yetersiz stok ilk kalemi de yazmaz", async () => {
  const f = await fixture();
  f.input.lines[1].qty = "11";
  const result = await withTenant(f.tenant.id, (tx) => recordTransfer(tx, f.tenant.id, f.actor, f.input));
  assert.ok("error" in result);
  assert.equal(result.line, 1);
  assert.equal(result.column, "qty");
  const saved = await records(f.tenant.id);
  for (const rows of Object.values(saved)) assert.equal(rows.length, 0);
  const levels = await withTenant(f.tenant.id, (tx) => stockLevels(tx, f.stores[0].id));
  assert.ok(levels.every((p) => p.level === 10000));
});

test("transfer: tekrarlı ürün, boş/aşırı kalem, hatalı miktar ve aynı şube reddedilir", async () => {
  const f = await fixture();
  const variants = [
    { ...f.input, lines: [] },
    { ...f.input, lines: Array.from({ length: MAX_TRANSFER_LINES + 1 }, () => f.input.lines[0]) },
    { ...f.input, lines: [f.input.lines[0], f.input.lines[0]] },
    { ...f.input, lines: [{ ...f.input.lines[0], qty: "0" }] },
    { ...f.input, lines: [{ ...f.input.lines[1], qty: "1,5" }] },
    { ...f.input, lines: [{ productId: "invalid", qty: "1" }] },
    { ...f.input, toStoreId: f.input.fromStoreId },
  ];
  for (const input of variants) assert.ok("error" in await withTenant(f.tenant.id, (tx) => recordTransfer(tx, f.tenant.id, f.actor, input)));
  for (const rows of Object.values(await records(f.tenant.id))) assert.equal(rows.length, 0);
});

test("transfer: şube müdürü kaynak kapsamını, başka kiracı ürün ve şube sınırını aşamaz", async () => {
  const f = await fixture(), other = await fixture();
  const branch = { ...f.actor, role: "mudur" as const, storeId: f.stores[1].id };
  assert.ok("error" in await withTenant(f.tenant.id, (tx) => recordTransfer(tx, f.tenant.id, branch, f.input)));
  assert.ok("error" in await withTenant(f.tenant.id, (tx) => recordTransfer(tx, f.tenant.id, f.actor, { ...f.input, toStoreId: other.stores[1].id })));
  assert.ok("error" in await withTenant(f.tenant.id, (tx) => recordTransfer(tx, f.tenant.id, f.actor, { ...f.input, lines: [{ productId: other.products[0].id, qty: "1" }] })));
  for (const rows of Object.values(await records(f.tenant.id))) assert.equal(rows.length, 0);
});

test("transfer: ters kalem sıralı eşzamanlı fişler kaynak stoğu aşamaz", { timeout: 10000 }, async () => {
  const f = await fixture();
  const results = await Promise.all([0, 1, 2].map((i) => withTenant(f.tenant.id, (tx) => recordTransfer(tx, f.tenant.id, f.actor, {
    ...f.input, lines: (i % 2 ? [...f.input.lines].reverse() : f.input.lines).map((l) => ({ ...l, qty: "6" })),
  }))));
  assert.equal(results.filter((r) => "id" in r).length, 1);
  assert.equal(results.filter((r) => "error" in r).length, 2);
  const levels = await withTenant(f.tenant.id, (tx) => stockLevels(tx, f.stores[0].id));
  assert.ok(levels.every((p) => p.level === 4000));
  const saved = await records(f.tenant.id);
  assert.equal(saved.transfers.length, 1);
  assert.equal(saved.moves.length, 4);
});

test("transfer: transaction geri alınırsa tüm kalem ve stok hareketleri geri alınır", async () => {
  const f = await fixture();
  await assert.rejects(withTenant(f.tenant.id, async (tx) => {
    assert.ok("id" in await recordTransfer(tx, f.tenant.id, f.actor, f.input));
    throw new Error("transfer-rollback-test");
  }), /transfer-rollback-test/);
  for (const rows of Object.values(await records(f.tenant.id))) assert.equal(rows.length, 0);
});

test("transfer: sınırdaki 20 farklı ürün tek fişte aktarılabilir", async () => {
  const f = await fixture();
  const extra = await withTenant(f.tenant.id, async (tx) => {
    const products = await tx.insert(schema.products).values(Array.from({ length: MAX_TRANSFER_LINES - 2 }, (_, i) => ({ tenantId: f.tenant.id, name: `Ürün ${i}`, price: 100, vatRate: 10, trackStock: true }))).returning();
    await tx.insert(schema.stockMovements).values(products.map((p) => ({ tenantId: f.tenant.id, storeId: f.stores[0].id, productId: p.id, kind: "sayim" as const, qtyMilli: 2000, actor: "test" })));
    return products;
  });
  const result = await withTenant(f.tenant.id, (tx) => recordTransfer(tx, f.tenant.id, f.actor, {
    ...f.input, lines: [...f.products, ...extra].map((p) => ({ productId: p.id, qty: "1" })),
  }));
  assert.ok("id" in result);
  const saved = await records(f.tenant.id);
  assert.equal(saved.transfers.length, 1);
  assert.equal(saved.lines.length, 20);
  assert.equal(saved.moves.length, 40);
});
