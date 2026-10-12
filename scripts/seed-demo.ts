// scripts/seed-demo.ts — demo kiracısına geriye dönük örnek satış tarihi basar.
// Kullanım: node --import ./tests/ts-resolve.mjs --env-file=.env.local scripts/seed-demo.ts [e-posta]
// Gerçek akış (applyDoc) ile yazar; baska bir amacla calistirmayin.
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema, withTenant, closeDb } from "@/db";
import { applyDoc } from "@/lib/sync/apply";
import type { SaleDoc, TabDoc } from "@/lib/sync/docs";

const EMAIL = process.argv[2] ?? "m9a-1790938395311@ornek.com";
const DAYS = Number(process.env.DAYS ?? 30);
const uuid = () => crypto.randomUUID();
const rnd = (n: number) => Math.floor(Math.random() * n);
const iso = (d: Date) => d.toISOString();

const db = getDb();
const [u] = await db.select({ tenantId: schema.users.tenantId }).from(schema.users).where(eq(schema.users.email, EMAIL));
if (!u) throw new Error(`kiracı bulunamadı: ${EMAIL}`);
const tenantId = u.tenantId;

const mevcut = await db.select({ id: schema.sales.id }).from(schema.sales).where(eq(schema.sales.tenantId, tenantId)).limit(20);
if (mevcut.length > 3 && process.env.FORCE !== "1") {
  console.log(`Bu kiracıda zaten ${mevcut.length}+ satış var. FORCE=1 ile zorla.`);
  process.exit(1);
}

const [store] = await withTenant(tenantId, (tx) => tx.select({ id: schema.stores.id }).from(schema.stores).orderBy(schema.stores.createdAt).limit(1));
if (!store) throw new Error("store yok");
const [device] = await db.select({ id: schema.devices.id, receiptPrefix: schema.devices.receiptPrefix }).from(schema.devices)
  .where(and(eq(schema.devices.tenantId, tenantId), eq(schema.devices.name, "Kasa 1")));
if (!device) throw new Error("Kasa 1 cihazı yok");
const ctx = { tenantId, storeId: store.id, deviceId: device.id, receiptPrefix: device.receiptPrefix };

const staff = await withTenant(tenantId, (tx) => tx.select({ id: schema.staff.id, role: schema.staff.role }).from(schema.staff));
const kasiyer = staff.find((s) => s.role === "kasiyer") ?? staff[0]!;
const mudur = staff.find((s) => s.role === "mudur");
if (!mudur) throw new Error("müdür yok");

const ekstra: Array<[string, number]> = [["Lahmacun", 18000], ["Pide", 16000], ["Künefe", 22000], ["Çay", 2000]];
await withTenant(tenantId, async (tx) => {
  for (const [name, price] of ekstra) {
    const had = await tx.select({ id: schema.products.id }).from(schema.products).where(and(eq(schema.products.tenantId, tenantId), eq(schema.products.name, name)));
    if (!had.length) await tx.insert(schema.products).values({ tenantId, name, price, vatRate: 10 });
  }
});
const menu = await withTenant(tenantId, (tx) =>
  tx.select({ id: schema.products.id, name: schema.products.name, price: schema.products.price }).from(schema.products)
    .where(eq(schema.products.tenantId, tenantId)));
if (menu.length < 3) throw new Error("menü çok boş");
const AGIRLIK: Array<[string, number]> = [["Adana", 5], ["Lahmacun", 4], ["Pide", 2], ["Künefe", 2], ["Ayran", 3], ["Çay", 4]];
const havuz = menu.map((m) => ({ m, w: AGIRLIK.find(([n]) => n === m.name)?.[1] ?? 1 }));
const urunSec = () => {
  const toplam = havuz.reduce((a, h) => a + h.w, 0);
  let r = Math.random() * toplam;
  for (const h of havuz) { r -= h.w; if (r <= 0) return h.m; }
  return havuz[0]!.m;
};
const masalar = await withTenant(tenantId, (tx) => tx.select({ id: schema.tables.id }).from(schema.tables)
  .where(and(eq(schema.tables.tenantId, tenantId), eq(schema.tables.active, true))));
if (!masalar.length) throw new Error("masa yok");
const masaSec = () => masalar[rnd(masalar.length)]!;

let receiptSeq = 0;
const [son] = await db.select({ receiptNo: schema.sales.receiptNo }).from(schema.sales)
  .where(and(eq(schema.sales.tenantId, tenantId), eq(schema.sales.deviceId, device.id)))
  .orderBy(desc(schema.sales.receiptNo)).limit(1);
if (son) receiptSeq = Number((/-0*(\d+)$/.exec(son.receiptNo))?.[1] ?? 0);
const no = () => ++receiptSeq;

type Satir = { lineId: string; productId: string; name: string; unitPrice: number; vatRate: 10; qtyMilli: number };
const satirlar = (): Satir[] =>
  Array.from({ length: 1 + rnd(4) }, () => {
    const m = urunSec();
    return { lineId: uuid(), productId: m.id, name: m.name, unitPrice: m.price, vatRate: 10 as const, qtyMilli: Math.random() < 0.25 ? 2000 : 1000 };
  });
const total = (ls: Satir[]) => ls.reduce((a, l) => a + Math.round((l.unitPrice * l.qtyMilli) / 1000), 0);
const yontem = (): "nakit" | "kart" | "yemek_karti" => { const r = Math.random(); return r < 0.55 ? "kart" : r < 0.9 ? "nakit" : "yemek_karti"; };

let iade = 0;

for (let d = DAYS; d >= 0; d--) {
  const gun = new Date();
  gun.setHours(0, 0, 0, 0);
  gun.setDate(gun.getDate() - d);
  const saat = (h: number, m: number) => { const t = new Date(gun); t.setHours(h, m, rnd(60)); return t; };

  const shiftId = uuid();
  const shiftDoc = { kind: "shift_open" as const, id: shiftId, staffId: kasiyer.id, at: iso(saat(10, rnd(20))), openingCash: 50000 };
  const rs = await applyDoc(ctx, shiftDoc as never);
  if (!rs.ok) throw new Error(`shift_open: ${rs.error}`);

  const adet = 8 + rnd(9);
  let nakit = 50000;
  const gununKartSatilari: Array<{ sale: SaleDoc; at: string }> = [];

  for (let i = 0; i < adet; i++) {
    const ogle = Math.random() < 0.35;
    const t = ogle ? saat(11, 30 + rnd(150)) : saat(18, rnd(210));
    const yont = yontem();
    const ls = satirlar();
    const tutar = total(ls);
    if (yont === "nakit") nakit += tutar;
    const r = Math.random();
    const kanal = r < 0.55 ? "masa" : r < 0.75 ? "paket" : "kasa";
    const staffId = Math.random() < 0.7 ? kasiyer.id : mudur.id;

    const sale: SaleDoc = {
      kind: "sale", id: uuid(), shiftId, staffId, receiptSeq: no(), at: iso(t),
      lines: ls.map((l) => ({ ...l, options: [], note: null })),
      payments: [{ method: yont, amount: tutar }],
    };

    if (kanal !== "kasa") {
      const tabId = uuid();
      const tableId = kanal === "masa" ? masaSec().id : null;
      const ac: TabDoc = { kind: "tab", id: uuid(), tabId, tableId, at: iso(new Date(t.getTime() - 6 * 60_000)), staffId, approvedBy: null,
        ev: tableId ? { type: "open", guests: 1 + rnd(4) } : { type: "open", guests: 0, kind: "paket" } };
      const r1 = await applyDoc(ctx, ac);
      if (!r1.ok) throw new Error(`tab open: ${r1.error}`);
      for (const [j, l] of ls.entries()) {
        const ev: TabDoc = { kind: "tab", id: uuid(), tabId, tableId, at: iso(new Date(t.getTime() - (5 - Math.min(j, 4)) * 60_000)), staffId, approvedBy: null,
          ev: { type: "add", lineId: l.lineId, productId: l.productId, name: l.name, unitPrice: l.unitPrice, vatRate: 10, qtyMilli: l.qtyMilli, options: [], note: null, stationId: null } };
        const r2 = await applyDoc(ctx, ev);
        if (!r2.ok) throw new Error(`tab add: ${r2.error}`);
      }
      sale.tab = { tabId, tableId, paidLines: ls.map((l) => ({ lineId: l.lineId, qtyMilli: l.qtyMilli, discount: 0 })) };
    }
    const r3 = await applyDoc(ctx, sale);
    if (!r3.ok) throw new Error(`sale: ${r3.error}`);
    if (yont === "kart" && Math.random() < 0.05) gununKartSatilari.push({ sale, at: iso(new Date(t.getTime() + 30 * 60_000)) });
  }

  if (gununKartSatilari.length) {
    const { sale, at } = gununKartSatilari[0]!;
    const refund = {
      kind: "refund" as const, id: uuid(), shiftId: sale.shiftId, staffId: kasiyer.id, approvedBy: mudur.id,
      refundOf: sale.id, receiptSeq: no(), at, lines: sale.lines, payments: [{ method: sale.payments[0]!.method, amount: sale.payments[0]!.amount }],
    };
    const r4 = await applyDoc(ctx, refund as never);
    if (!r4.ok) throw new Error(`refund: ${r4.error}`);
    iade++;
  }

  if (d > 0) {
    const r5 = await applyDoc(ctx, { kind: "shift_close", id: shiftId, staffId: kasiyer.id, at: iso(saat(23, rnd(50))), countedCash: nakit } as never);
    if (!r5.ok) throw new Error(`shift_close: ${r5.error}`);
  }
  console.log(`gün -${d}: ${adet} satış`);
}

console.log(`Bitti: ${DAYS} gün, ${iade} iade. Son fiş: ${ctx.receiptPrefix}-${String(receiptSeq).padStart(6, "0")}`);
await closeDb();
