// tests/currency-db.test.ts — #16: tenants.currency varsayılanı + tenantCurrency okuması + biçim.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
const { getDb, closeDb, schema } = await import("@/db");
const { eq } = await import("drizzle-orm");
const { tenantCurrency, moneyFormatter } = await import("@/lib/admin/currency");
const { formatMoney, isCurrency, CURRENCIES } = await import("@/lib/core/money");

const made: string[] = [];
after(async () => {
  for (const id of made) await getDb().delete(schema.tenants).where(eq(schema.tenants.id, id));
  await closeDb();
});

test("para birimi: varsayılan TRY, güncelleme okunur, biçimleyici birimi kullanır", async () => {
  assert.ok(isCurrency("USD") && !isCurrency("BTC"));
  assert.equal(Object.keys(CURRENCIES).length, 4);
  const [t] = await getDb().insert(schema.tenants).values({ name: "CUR", vertical: "market" }).returning();
  made.push(t.id);
  assert.equal(await tenantCurrency(t.id), "TRY"); // varsayılan
  await getDb().update(schema.tenants).set({ currency: "USD" }).where(eq(schema.tenants.id, t.id));
  assert.equal(await tenantCurrency(t.id), "USD");
  const f = await moneyFormatter(t.id);
  assert.equal(typeof f(1250), "string");
  assert.ok(f(1250).includes("12,50")); // tr-TR ondalık
  assert.equal(formatMoney(1250, "TRY"), formatMoney(1250)); // varsayılan TRY
});
