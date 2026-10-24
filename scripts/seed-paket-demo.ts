// scripts/seed-paket-demo.ts — demo kiracısına örnek paket/platform siparişleri basar.
// Kullanım: node --import ./tests/ts-resolve.mjs --env-file=.env.local scripts/seed-paket-demo.ts [e-posta]
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb, schema, withTenant, closeDb } from "@/db";
import { applyDoc } from "@/lib/sync/apply";
import type { TabDoc } from "@/lib/sync/docs";

const EMAIL = process.argv[2] ?? "demo@cabukpos.local";
const target = new URL(process.env.DATABASE_URL!);
if (!["localhost", "127.0.0.1"].includes(target.hostname) || !/^\/cabukpos_preview_\d+$/.test(target.pathname) || EMAIL !== "demo@cabukpos.local") throw new Error("Yalnız temiz yerel demo hesabı desteklenir.");
let sequence = 0;
// Stable document IDs make repeats resume safely without duplicating orders.
const uuid = () => {
  const h = createHash("sha256").update(`${tenantId}:paket-demo-v1:${sequence++}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const iso = (d: Date) => d.toISOString();
const dk = (d: Date, n: number) => iso(new Date(d.getTime() + n * 60_000));

const db = getDb();
const [u] = await db.select({ tenantId: schema.users.tenantId }).from(schema.users).where(eq(schema.users.email, EMAIL));
if (!u) throw new Error(`kiracı bulunamadı: ${EMAIL}`);
const tenantId = u.tenantId;
const [store] = await withTenant(tenantId, (tx) => tx.select({ id: schema.stores.id }).from(schema.stores).limit(1));
const [device] = await db.select({ id: schema.devices.id, receiptPrefix: schema.devices.receiptPrefix }).from(schema.devices)
  .where(and(eq(schema.devices.tenantId, tenantId), eq(schema.devices.name, "Demo geçmiş kasa")));
if (!store || !device) throw new Error("Demo geçmiş kasa cihazı yok; önce prepare-local-demo.ts çalıştırın.");
const ctx = { tenantId, storeId: store.id, deviceId: device.id, receiptPrefix: device.receiptPrefix };

const staff = await withTenant(tenantId, (tx) => tx.select({ id: schema.staff.id, role: schema.staff.role }).from(schema.staff));
const garson = staff.find((s) => s.role === "garson") ?? staff[0]!;
let kurye = staff.find((s) => s.role === "kurye");
if (!kurye) {
  kurye = await withTenant(tenantId, async (tx) =>
    (await tx.insert(schema.staff).values({ tenantId, name: "Demo Kurye", role: "kurye", pinHash: "demo-pin-not-set" }).returning({ id: schema.staff.id, role: schema.staff.role }))[0]!);
}
const menu = await withTenant(tenantId, (tx) => tx.select({ id: schema.products.id, name: schema.products.name, price: schema.products.price }).from(schema.products).where(eq(schema.products.tenantId, tenantId)));
const bul = (n: string) => { const product = menu.find((m) => m.name === n) ?? menu.find((m) => m.name === ({ Adana: "Adana Kebap", Pide: "Kıymalı Pide" } as Record<string, string>)[n]); if (!product) throw new Error(`Demo menüde ürün eksik: ${n}`); return product; };

const tab = (tabId: string, kind: "paket" | "platform", at: string): TabDoc =>
  ({ kind: "tab", id: uuid(), tabId, tableId: null, at, staffId: garson.id, approvedBy: null, ev: { type: "open", guests: 0, kind } });
const siparis = (at: string, o: {
  name: string; phone: string; address: string; note?: string; payIntent: "nakit" | "kart" | "yemek_karti" | "online";
  source: { platform: string; externalId: string } | null;
}): TabDoc["ev"] => ({
  type: "order", customerId: null, name: o.name, phone: o.phone, address: o.address, directions: null, zoneId: null,
  note: `Yerel paket demo v1 — ${o.note ?? "gerçek sipariş değildir"}`, payIntent: o.payIntent, promisedAt: null,
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
        name: "Demo Zeynep", phone: "0000100001", address: "Demo Mahallesi, Örnek Sokak No:1", note: "Kapı zili çalışmıyor, arayın",
        payIntent: "online", source: { platform: "yemeksepeti", externalId: "YS-88123456" },
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
        name: "Demo Mert", phone: "0000100002", address: "Demo Mahallesi, Örnek Sokak No:2",
        payIntent: "online", source: { platform: "trendyol", externalId: "TY-55219031" },
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
        name: "Demo Aylin", phone: "0000100003", address: "Demo Mahallesi, Örnek Sokak No:3",
        payIntent: "online", source: { platform: "getir", externalId: "GY-778120" },
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
        name: "Demo Kerem", phone: "0000100004", address: "Demo Mahallesi, Örnek Sokak No:4", note: "50 TL'lik para üstü olsun",
        payIntent: "nakit", source: null,
      })),
      ekle(id, dk(simdi, -1), bul("Adana")),
      ekle(id, dk(simdi, -1), bul("Ayran")),
    ];
  })()],
  ["Telefon — hazır paket", (() => {
    const id = uuid(), ticketId = uuid();
    const line = ekle(id, dk(simdi, -20), bul("Pide"), 2000);
    if (line.ev.type !== "add") throw new Error("Demo ürün satırı geçersiz.");
    return [
      tab(id, "paket", dk(simdi, -25)),
      olay(id, dk(simdi, -25), siparis(dk(simdi, -25), { name: "Demo Elif", phone: "0000100005", address: "Demo Mahallesi, Örnek Sokak No:5", payIntent: "kart", source: null })),
      line,
      olay(id, dk(simdi, -23), { type: "accept", prepMin: 15 }),
      olay(id, dk(simdi, -19), { type: "send", ticketId, lineIds: [line.ev.lineId], stationId: null }),
      olay(id, dk(simdi, -3), { type: "kitchen", ticketId, status: "hazir" }),
    ];
  })()],
  ["Telefon — teslim edilmiş paket", (() => {
    const id = uuid();
    return [
      tab(id, "paket", dk(simdi, -65)),
      olay(id, dk(simdi, -65), siparis(dk(simdi, -65), { name: "Demo Ahmet", phone: "0000100006", address: "Demo Mahallesi, Örnek Sokak No:6", payIntent: "nakit", source: null })),
      ekle(id, dk(simdi, -64), bul("Adana")),
      olay(id, dk(simdi, -62), { type: "accept", prepMin: 20 }),
      olay(id, dk(simdi, -42), { type: "courier", staffId: kurye.id }),
      olay(id, dk(simdi, -40), { type: "out" }),
      olay(id, dk(simdi, -15), { type: "delivered", method: "nakit" }),
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
