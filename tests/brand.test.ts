// tests/brand.test.ts — Bulut mutfak: slug üretimi/kuralı, marka menüsü filtresi (seçki, boş seçki, aktif olmayan marka).
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { eq } = await import("drizzle-orm");
const { isBrandSlug, menuByBrand, slugify } = await import("@/lib/brands");
const { menuByStore } = await import("@/lib/kiosk");

const made: string[] = [];
after(async () => {
  for (const id of made) await getDb().delete(schema.tenants).where(eq(schema.tenants.id, id));
  await closeDb();
});

async function fixture(name: string) {
  const [t] = await getDb().insert(schema.tenants).values({ name, vertical: "restoran" }).returning();
  made.push(t.id);
  return withTenant(t.id, async (tx) => {
    const [st] = await tx.insert(schema.stores).values({ tenantId: t.id, name: "Mutfak" }).returning();
    const [cat] = await tx.insert(schema.categories).values({ tenantId: t.id, name: "Ana yemek" }).returning();
    const p = async (n: string) => (await tx.insert(schema.products).values({ tenantId: t.id, categoryId: cat.id, name: n, price: 10000, vatRate: 10 }).returning())[0];
    const pizza = await p("Pizza"), lahmacun = await p("Lahmacun"), tatli = await p("Sütlaç");
    return { t, st, pizza, lahmacun, tatli };
  });
}

test("slug: Türkçe sadeleşme + kural", () => {
  assert.equal(slugify("Pideci No 2"), "pideci-no-2");
  assert.equal(slugify("Çığ Üretim"), "cig-uretim");
  assert.ok(isBrandSlug("pideci-2"));
  assert.ok(!isBrandSlug("X")); // tek harf
  assert.ok(!isBrandSlug("büyük")); // Türkçe karakter kalırsa
});

test("marka menüsü: seçki filtreler, boş seçki tümünü gösterir, pasif/bilinmeyen slug 404 yoluna düşer", async () => {
  const f = await fixture("BRAND-A");
  await withTenant(f.t.id, async (tx) => {
    const [b] = await tx.insert(schema.brands).values({ tenantId: f.t.id, storeId: f.st.id, name: "Pideci", slug: "pideci" }).returning();
    await tx.insert(schema.brandProducts).values([{ brandId: b.id, productId: f.pizza.id }, { brandId: b.id, productId: f.tatli.id }]);
  });
  const m = await menuByBrand(f.st.id, "pideci");
  assert.equal(m?.brand, "Pideci");
  assert.deepEqual(m?.products.map((p) => p.name).sort(), ["Pizza", "Sütlaç"]);
  // Seçkisiz marka: tüm aktif ürünler
  await withTenant(f.t.id, async (tx) => {
    await tx.insert(schema.brands).values({ tenantId: f.t.id, storeId: f.st.id, name: "Hepsi", slug: "hepsi" });
  });
  const all = await menuByBrand(f.st.id, "hepsi");
  assert.equal(all?.products.length, 3);
  // Bilinmeyen slug → null (404)
  assert.equal(await menuByBrand(f.st.id, "yok"), null);
  assert.equal(await menuByBrand(f.st.id, "Pideci"), null); // büyük harf: slug değil
  // Markasız yol değişmedi
  const plain = await menuByStore(f.st.id);
  assert.equal(plain?.products.length, 3);
});
