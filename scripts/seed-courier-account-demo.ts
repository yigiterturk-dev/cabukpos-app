// Explicit local-only, repeatable courier account fixtures; no provider or hardware calls.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, withTenant, closeDb, schema } from "@/db";
const url = new URL(process.env.DATABASE_URL!);
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
assert.equal(url.pathname, "/cabukpos_preview_1792855963497");
const tenantId = "caa8f1f4-b280-4d99-a265-e0a3e6b93859", day = "2026-10-25";
const id = (tag: string) => {
  const h = createHash("sha256").update(`courier-account-demo:${tag}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
try {
  const [tenant] = await getDb().select({ name: schema.tenants.name }).from(schema.tenants).where(eq(schema.tenants.id, tenantId));
  assert.equal(tenant?.name, "Yerel Demo");
  const [user] = await getDb().select({ tenantId: schema.users.tenantId }).from(schema.users).where(eq(schema.users.email, "demo@cabukpos.local"));
  assert.equal(user?.tenantId, tenantId);
  await withTenant(tenantId, async tx => {
    const [store] = await tx.select({ id: schema.stores.id }).from(schema.stores).where(eq(schema.stores.tenantId, tenantId)).orderBy(schema.stores.createdAt).limit(1);
    assert.ok(store);
    for (const [index, name] of ["Deniz", "Ekin"].entries()) {
      const staffId = id(`staff:${index}`), deviceId = id(`device:${index}`), shiftId = id(`shift:${index}`);
      await tx.insert(schema.staff).values({ id: staffId, tenantId, name: `Demo ${name} · geçmiş`, role: "kurye", active: false, pinHash: "!demo-history-no-login" }).onConflictDoNothing();
      await tx.insert(schema.devices).values({ id: deviceId, tenantId, storeId: store.id, name: `Demo kurye geçmişi ${index + 1}`, role: "kurye", receiptPrefix: `HC${index + 1}`, revokedAt: new Date() }).onConflictDoNothing();
      const at = (hour: string) => new Date(`${day}T${hour}:00+03:00`);
      await tx.insert(schema.shifts).values({ id: shiftId, tenantId, storeId: store.id, deviceId, openedBy: staffId, openedAt: at("09:00"), openingCash: index ? 0 : 10000, closedBy: staffId, closedAt: at("13:00"), expectedCash: index ? 25000 : 45000, countedCash: index ? 24000 : 45000 }).onConflictDoNothing();
      const sale = async (tag: string, total: number, pays: { method: "nakit" | "kart" | "online"; amount: number }[], change = 0, refundOf: string | null = null) => {
        const saleId = id(`sale:${index}:${tag}`);
        await tx.insert(schema.sales).values({ id: saleId, tenantId, storeId: store.id, deviceId, shiftId, staffId, receiptNo: `DEMO-HC${index + 1}-${tag}`, channel: "paket", status: refundOf ? "iade" : "kapandi", total, change, vat: [], createdAt: at(refundOf ? "12:00" : "11:00"), refundOf }).onConflictDoNothing();
        await tx.insert(schema.payments).values(pays.map((p, i) => ({ id: id(`payment:${saleId}:${i}`), tenantId, saleId, ...p }))).onConflictDoNothing();
        return saleId;
      };
      if (!index) {
        await sale("KARMA", 40000, [{ method: "nakit", amount: 25000 }, { method: "kart", amount: 20000 }], 5000);
        const cashSale = await sale("NAKIT", 30000, [{ method: "nakit", amount: 30000 }]);
        await sale("IADE", 5000, [{ method: "nakit", amount: 5000 }], 0, cashSale);
        await tx.insert(schema.registerEvents).values({ id: id("drop"), tenantId, storeId: store.id, deviceId, shiftId, staffId, at: at("12:30"), type: "safe_drop", lines: [], total: 10000 }).onConflictDoNothing();
      } else {
        await sale("KART", 20000, [{ method: "kart", amount: 20000 }]);
        await sale("NAKIT", 25000, [{ method: "nakit", amount: 25000 }]);
        await sale("ONLINE", 10000, [{ method: "online", amount: 10000 }]);
      }
    }
  });
  console.log(`Yerel kurye hesap örnekleri hazır: /yonetim/kurye-hesap?day=${day}`);
} finally { await closeDb(); }
