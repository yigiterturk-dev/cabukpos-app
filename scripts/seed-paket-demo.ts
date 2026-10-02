// scripts/seed-paket-demo.ts — demo kiracısına örnek paket/platform siparişleri basar.
// Kullanım: node --import ./tests/ts-resolve.mjs --env-file=.env.local scripts/seed-paket-demo.ts [e-posta]
import { and, eq } from "drizzle-orm";
import { getDb, schema, withTenant, closeDb } from "@/db";
import { applyDoc } from "@/lib/sync/apply";
import type { TabDoc } from "@/lib/sync/docs";

const EMAIL = process.argv[2] ?? "m9a-1790938963765@ornek.com";
const uuid = () => crypto.randomUUID();
const iso = (d: Date) => d.toISOString();
const dk = (d: Date, n: number) => iso(new Date(d.getTime() + n * 60_000));

const db = getDb();
const [u] = await db.select({ tenantId: schema.users.tenantId }).from(schema.users).where(eq(schema.users.email, EMAIL));
if (!u) throw new Error(`kiracı bulunamadı: ${EMAIL}`);
const tenantId = u.tenantId;
const [store] = await withTenant(tenantId, (tx) => tx.select({ id: schema.stores.id }).from(schema.stores).limit(1));
const [device] = await db.select({ id: schema.devices.id, receiptPrefix: schema.devices.receiptPrefix }).from(schema.devices)
  .where(and(eq(schema.devices.tenantId, tenantId), eq(schema.devices.name, "Kasa 1")));
if (!store || !device) throw new Error("store/Kasa 1 yok");
const ctx = { tenantId, storeId: store.id, deviceId: device.id, receiptPrefix: device.receiptPrefix };

const staff = await withTenant(tenantId, (tx) => tx.select({ id: schema.staff.id, role: schema.staff.role }).from(schema.staff));
const garson = staff.find((s) => s.role === "garson") ?? staff[0]!;
let kurye = staff.find((s) => s.role === "kurye");
if (!kurye) {
  kurye = await withTenant(tenantId, async (tx) =>
    (await tx.insert(schema.staff).values({ tenantId, name: "Emre Kurye", role: "kurye", pinHash: "x" }).returning({ id: schema.staff.id, role: schema.staff.role }))[0]!);
}
const menu = await withTenant(tenantId, (tx) => tx.select({ id: schema.products.id, name: schema.products.name, price: schema.products.price }).from(schema.products).where(eq(schema.products.tenantId, tenantId)));
const bul = (n: string) => menu.find((m) => m.name === n)!;

const shiftDoc = { kind: "shift_open" as const, id: uuid(), staffId: garson.id, at: iso(new Date(Date.now() - 120 * 60_000)), openingCash: 50000 };
const rs = await applyDoc(ctx, shiftDoc as never);
if (!rs.ok) throw new Error(`shift_open: ${rs.error}`);

const tab = (tabId: string, kind: "paket" | "platform", at: string): TabDoc =>
  ({ kind: "tab", id: uuid(), tabId, tableId: null, at, staffId: garson.id, approvedBy: null, ev: { type: "open", guests: 0, kind } });
const siparis = (at: string, o: {
  name: string; phone: string; address: string; note?: string; payIntent: "nakit" | "kart" | "yemek_karti" | "online";
  source: { platform: string; externalId: string } | null;
}): TabDoc["ev"] => ({
  type: "order", customerId: null, name: o.name, phone: o.phone, address: o.address, directions: null, zoneId: null,
  note: o.note ?? null, payIntent: o.payIntent, promisedAt: null,
  source: o.source ? { ...o.source, deadline: null } : null,
});
const ekle = (tabId: string, at: string, urun: { id: string; name: string; price: number }, qtyMilli = 1000): TabDoc =>
  ({ kind: "tab", id: uuid(), tabId, tableId: null, at, staffId: garson.id, approvedBy: null,
    ev: { type: "add", lineId: uuid(), productId: urun.id, name: urun.name, unitPrice: urun.price, vatRate: 10, qtyMilli, options: [], note: null, stationId: null } });
const olay = (tabId: string, at: string, ev: TabDoc["ev"]): TabDoc =>
  ({ kind: "tab", id: uuid(), tabId, tableId: null, at, staffId: garson.id, approvedBy: null, ev });

const simdi = new Date();
const isler: Array<[string, TabDoc[]]> = [
  ["Yemeksepeti — onay bekliyor", (() => {
    const id = uuid();
    return [
      tab(id, "platform", dk(simdi, -4)),
      olay(id, dk(simdi, -4), siparis(dk(simdi, -4), {
        name: "Zeynep Kaya", phone: "5321234567", address: "Bağdat Caddesi No:112 D:3, Kadıköy", note: "Kapı zili çalışmıyor, arayın",
        payIntent: "online", source: { platform: "Yemeksepeti", externalId: "YS-88123456" },
      })),
      ekle(id, dk(simdi, -3), bul("Adana"), 2000),
      ekle(id, dk(simdi, -3), bul("Adana")),
      ekle(id, dk(simdi, -3), bul("Ayran"), 2000),
    ];
  })()],
  ["Trendyol Go — hazırlanıyor", (() => {
    const id = uuid();
    return [
      tab(id, "platform", dk(simdi, -18)),
      olay(id, dk(simdi, -18), siparis(dk(simdi, -18), {
        name: "Mert Demir", phone: "5339876543", address: "Fenerbahçe Mah. İskele Sokak No:7/2, Kadıköy",
        payIntent: "online", source: { platform: "Trendyol Go", externalId: "TY-55219031" },
      })),
      ekle(id, dk(simdi, -17), bul("Lahmacun"), 2000),
      ekle(id, dk(simdi, -17), bul("Çay"), 3000),
      olay(id, dk(simdi, -15), { type: "accept", prepMin: 25 }),
    ];
  })()],
  ["GetirYemek — kuryede yolda", (() => {
    const id = uuid();
    return [
      tab(id, "platform", dk(simdi, -40)),
      olay(id, dk(simdi, -40), siparis(dk(simdi, -40), {
        name: "Aylin Yıldız", phone: "5311112222", address: "Caferağa Mah. Moda Caddesi 45/2, Kadıköy",
        payIntent: "online", source: { platform: "GetirYemek", externalId: "GY-778120" },
      })),
      ekle(id, dk(simdi, -39), bul("Pide"), 2000),
      ekle(id, dk(simdi, -39), bul("Künefe")),
      olay(id, dk(simdi, -36), { type: "accept", prepMin: 20 }),
      olay(id, dk(simdi, -16), { type: "courier", staffId: kurye.id }),
      olay(id, dk(simdi, -12), { type: "out" }),
    ];
  })()],
  ["Telefon — paket siparişi (nakit)", (() => {
    const id = uuid();
    return [
      tab(id, "paket", dk(simdi, -2)),
      olay(id, dk(simdi, -2), siparis(dk(simdi, -2), {
        name: "Kerem Soylu", phone: "5345556677", address: "Göztepe Mah. Mihribey Sokak No:13 D:5", note: "50 TL'lik para üstü olsun",
        payIntent: "nakit", source: null,
      })),
      ekle(id, dk(simdi, -1), bul("Adana")),
      ekle(id, dk(simdi, -1), bul("Ayran")),
    ];
  })()],
];

for (const [ad, docs] of isler) {
  for (const d of docs) {
    const r = await applyDoc(ctx, d);
    if (!r.ok) throw new Error(`${ad}: ${d.ev.type} → ${r.error}`);
  }
  console.log("•", ad);
}
console.log("Paket demo hazır — kasada Paket sekmesine bak.");
await closeDb();
