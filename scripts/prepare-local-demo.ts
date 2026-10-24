// Only the isolated local preview and its explicit demo account are allowed.
import { writeFile } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { getDb, schema, withTenant, closeDb } from "@/db";
import { ORNEK_MENULER } from "@/lib/core/ornek-menu";

const target = new URL(process.env.DATABASE_URL!);
if (!["localhost", "127.0.0.1"].includes(target.hostname) || !/^\/cabukpos_preview_\d+$/.test(target.pathname)) throw new Error("Yalnız izole yerel demo DB'si desteklenir.");
const db = getDb();
try {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, "demo@cabukpos.local"));
  if (!user) throw new Error("Yerel demo hesabı bulunamadı.");
  const summary = await withTenant(user.tenantId, async tx => {
    const [store] = await tx.select().from(schema.stores).where(eq(schema.stores.kind, "sube")).limit(1);
    if (!store) throw new Error("Demo şubesi bulunamadı.");
    const categories = await tx.select().from(schema.categories);
    const products = await tx.select().from(schema.products);
    const present = new Set(products.map(p => p.name));
    for (const [i, category] of ORNEK_MENULER.restoran.kategoriler.entries()) {
      let saved = categories.find(c => c.name === category.name);
      if (!saved) [saved] = await tx.insert(schema.categories).values({ tenantId: user.tenantId, name: category.name, sort: i }).returning();
      for (const [j, product] of category.urunler.entries()) {
        if (present.has(product.name)) continue;
        await tx.insert(schema.products).values({ tenantId: user.tenantId, categoryId: saved.id, ...product,
          sort: j, unit: "adet", cost: Math.round(product.price * 0.38), quick: product.quick ?? false,
          trackStock: product.name === "Ayran" || product.name === "Su 0,5 L", minStock: 15000 });
      }
    }
    for (const item of [{ name: "Un (demo hammadde)", cost: 3200, qty: 50000 }, { name: "Kıyma (demo hammadde)", cost: 48000, qty: 25000 }, { name: "Süt (demo hammadde)", cost: 3500, qty: 10000 }]) {
      if (present.has(item.name)) continue;
      const [raw] = await tx.insert(schema.products).values({ tenantId: user.tenantId, name: item.name, sellable: false, unit: item.name.startsWith("Süt") ? "lt" : "kg", price: 0, vatRate: 10, trackStock: true, cost: item.cost, minStock: 5000 }).returning();
      await tx.insert(schema.stockMovements).values({ tenantId: user.tenantId, storeId: store.id, productId: raw.id, kind: "alis", qtyMilli: item.qty, actor: "local-demo", note: "Örnek başlangıç stoğu" });
    }
    const staff = await tx.select().from(schema.staff);
    for (const person of [{ name: "Demo Kasiyer", role: "kasiyer" as const }, { name: "Demo Garson", role: "garson" as const }, { name: "Demo Müdür", role: "mudur" as const }]) {
      if (!staff.some(s => s.name === person.name)) await tx.insert(schema.staff).values({ tenantId: user.tenantId, ...person, pinHash: "demo-pin-not-set" });
    }
    const areas = await tx.select().from(schema.areas).where(eq(schema.areas.storeId, store.id));
    const tables = await tx.select().from(schema.tables);
    for (const [i, name] of ["İç Salon", "Bahçe"].entries()) {
      let area = areas.find(a => a.name === name);
      if (!area) [area] = await tx.insert(schema.areas).values({ tenantId: user.tenantId, storeId: store.id, name, sort: i }).returning();
      for (let n = 1; n <= 4; n++) {
        const tableName = `${i ? "Bahçe" : "Masa"} ${n}`;
        if (!tables.some(t => t.areaId === area.id && t.name === tableName)) await tx.insert(schema.tables).values({ tenantId: user.tenantId, areaId: area.id, name: tableName, sort: n });
      }
    }
    const suppliers = await tx.select().from(schema.suppliers);
    for (const name of ["Demo Gıda Toptancısı", "Demo Manav"]) if (!suppliers.some(s => s.name === name)) await tx.insert(schema.suppliers).values({ tenantId: user.tenantId, name, note: "Yerel örnek kayıt; gerçek tedarikçi değildir." });
    const customers = await tx.select().from(schema.customers);
    for (let i = 1; i <= 3; i++) {
      const phone = `000000000${i}`;
      if (!customers.some(c => c.phone === phone)) await tx.insert(schema.customers).values({ tenantId: user.tenantId, name: `Demo Müşteri ${i}`, phone, note: "Gerçek iletişim bilgisi değildir.", marketingConsent: false });
    }
    const [device] = await tx.select().from(schema.devices).where(and(eq(schema.devices.tenantId, user.tenantId), eq(schema.devices.name, "Demo geçmiş kasa")));
    if (!device) await tx.insert(schema.devices).values({ tenantId: user.tenantId, storeId: store.id, name: "Demo geçmiş kasa", receiptPrefix: "DH01" });
    const demoProducts = await tx.select().from(schema.products).where(eq(schema.products.trackStock, true));
    const moves = await tx.select({ id: schema.stockMovements.productId }).from(schema.stockMovements).where(eq(schema.stockMovements.actor, "local-demo"));
    for (const p of demoProducts) {
      if (moves.some(m => m.id === p.id)) continue;
      await tx.insert(schema.stockMovements).values({ tenantId: user.tenantId, storeId: store.id, productId: p.id, kind: "alis", qtyMilli: p.name === "Ayran" ? 7000 : 120000, actor: "local-demo", note: "Örnek başlangıç stoğu" });
    }
    return { tenant: user.tenantId, products: (await tx.select({ id: schema.products.id }).from(schema.products)).length,
      staff: (await tx.select({ id: schema.staff.id }).from(schema.staff)).length, tables: (await tx.select({ id: schema.tables.id }).from(schema.tables)).length,
      existingSales: (await tx.select({ id: schema.sales.id }).from(schema.sales)).length };
  });
  await writeFile("/private/tmp/cabukpos-demo-bootstrap.json", JSON.stringify(summary), { mode: 0o600 });
  console.log(JSON.stringify(summary));
} finally { await closeDb(); }
