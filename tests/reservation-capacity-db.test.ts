import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { eq } = await import("drizzle-orm");
const { bookReservation, availableBookingSlots, changeBookingStatus, reservationContext } = await import("@/lib/reservations");
const { timeToAt, freeReservationTables } = await import("@/lib/core/reservation");
const { istToday } = await import("@/lib/core/report");
const [tenant] = await getDb().insert(schema.tenants).values({ name: "Booking test", vertical: "restoran" }).returning();
const [other] = await getDb().insert(schema.tenants).values({ name: "Booking other", vertical: "restoran" }).returning();
after(async () => { await getDb().delete(schema.tenants).where(eq(schema.tenants.id, tenant.id)); await getDb().delete(schema.tenants).where(eq(schema.tenants.id, other.id)); await closeDb(); });
const f = await withTenant(tenant.id, async tx => {
  const stores = await tx.insert(schema.stores).values([{ tenantId: tenant.id, name: "Merkez" }, { tenantId: tenant.id, name: "Diğer" }]).returning();
  const areas = [];
  for (const s of stores) areas.push((await tx.insert(schema.areas).values({ tenantId: tenant.id, storeId: s.id, name: "Salon" }).returning())[0]);
  const tables = await tx.insert(schema.tables).values([{ tenantId: tenant.id, areaId: areas[0].id, name: "İki", seats: 2 }, { tenantId: tenant.id, areaId: areas[0].id, name: "Dört", seats: 4 }, { tenantId: tenant.id, areaId: areas[1].id, name: "Başka şube", seats: 8 }]).returning();
  const [config] = await tx.insert(schema.reservationSettings).values({ tenantId: tenant.id, storeId: stores[0].id, enabled: true }).returning();
  return { stores, tables, config };
});
const ctx = { tenantId: tenant.id, storeId: f.stores[0].id };
const input = (offset: number, guests = 2, time = "19:00") => ({ id: crypto.randomUUID(), name: "Demo müşteri", phone: "905550001234", guests, note: "", at: timeToAt(istToday(Date.now(), offset), time)! });

test("kapasiteye göre masa atanır; çakışma reddedilir, bitişik rezervasyon kabul edilir", async () => {
  const a = input(1); const first = await bookReservation(ctx, a, "test");
  assert.equal(first.tableId, f.tables[0].id);
  assert.equal((await bookReservation(ctx, a, "test")).id, first.id);
  assert.equal((await bookReservation(ctx, input(1, 4), "test")).tableId, f.tables[1].id);
  await assert.rejects(bookReservation(ctx, input(1), "test"), /uygun masa yok/);
  await assert.rejects(bookReservation(ctx, input(2, 5), "test"), /uygun masa yok/);
  const adjacent = await bookReservation(ctx, input(1, 2, "20:30"), "test");
  assert.equal(adjacent.tableId, f.tables[0].id);
  await assert.rejects(bookReservation(ctx, { ...input(2), tableId: f.tables[2].id }, "test"), /uygun masa yok/);
});
test("eşzamanlı son masa isteklerinden biri alınır", async () => {
  const results = await Promise.allSettled([bookReservation(ctx, input(3, 4), "test"), bookReservation(ctx, input(3, 4), "test")]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
});
test("iptal kapasiteyi açar; dolmuş masada eski rezervasyon geri açılamaz", async () => {
  const a = await bookReservation(ctx, input(4, 4), "test");
  await changeBookingStatus(ctx, a.id, "iptal", "test");
  await bookReservation(ctx, input(4, 4), "test");
  await assert.rejects(changeBookingStatus(ctx, a.id, "onaylandi", "test"), /masa dolu/);
});
test("uygun saatler mevcut rezervasyonları çıkarır ve müşteri verisi döndürmez", async () => {
  await bookReservation(ctx, input(5, 4, "17:00"), "test", true);
  const slots = await availableBookingSlots(ctx, istToday(Date.now(), 5), 4);
  assert.equal(slots.includes("17:00"), false);
  assert.equal(slots.includes("18:00"), false);
  assert.equal(slots.includes("18:30"), true);
  assert.ok(slots.every(s => /^\d{2}:\d{2}$/.test(s)));
  assert.equal((await availableBookingSlots(ctx, "2026-02-31", 2)).length, 0);
});
test("masasız eski rezervasyon da kapasite tüketir", async () => {
  const a = input(6, 4);
  await withTenant(tenant.id, tx => tx.insert(schema.reservations).values({ tenantId: tenant.id, storeId: ctx.storeId, ...a, tableId: null }));
  await assert.rejects(bookReservation(ctx, input(6, 4), "test"), /uygun masa yok/);
  assert.equal((await bookReservation(ctx, input(6, 2), "test")).tableId, f.tables[0].id);
  assert.deepEqual(freeReservationTables([{ id: "two", seats: 2 }], [{ tableId: "removed", guests: 4 }]), []);
});
test("public saat aralığı ve kapatma korunur; kiracılar müşteri kayıtlarını göremez", async () => {
  await assert.rejects(bookReservation(ctx, input(7, 2, "09:00"), "public", true), /çevrimiçi/);
  await assert.rejects(bookReservation(ctx, input(7, 2, "19:07"), "public", true), /çevrimiçi/);
  assert.ok(await reservationContext(f.config.token));
  await getDb().update(schema.reservationSettings).set({ enabled: false }).where(eq(schema.reservationSettings.storeId, ctx.storeId));
  assert.equal(await reservationContext(f.config.token), null);
  await assert.rejects(bookReservation(ctx, input(7), "public", true), /çevrimiçi/);
  const rows = await withTenant(other.id, tx => tx.select().from(schema.reservations));
  assert.equal(rows.length, 0);
});
