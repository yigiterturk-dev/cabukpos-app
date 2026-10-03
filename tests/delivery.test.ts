// tests/delivery.test.ts — paket servis: telefon, bölge, kurye nakdi, paket fişi, platform eşleme. Saf.
import { test } from "node:test";
import assert from "node:assert/strict";
import { courierCash, feeLine, formatPhone, normalizePhone, renderDeliverySlip, zoneCheck } from "@/lib/core/delivery";
import { sendByStation, toTabEvents, type IncomingOrder } from "@/lib/core/platform";
import { foldTabs, type TabEv, type TabEvent } from "@/lib/core/tab";

test("telefon normalize", () => {
  for (const s of ["0532 123 45 67", "+90 (532) 123-45-67", "5321234567", "905321234567"]) assert.equal(normalizePhone(s), "905321234567");
  for (const s of ["123", "05321234", "+1 415 555 0100", ""]) assert.equal(normalizePhone(s), null);
  assert.equal(formatPhone("905321234567"), "0532 123 45 67");
});

test("bölge ücreti + asgari tutar uyarısı", () => {
  const z = { id: "z", name: "Merkez", fee: 1500, minOrder: 10000 };
  assert.deepEqual(zoneCheck(z, 9999), { fee: 1500, belowMin: true });
  assert.deepEqual(zoneCheck(z, 10000), { fee: 1500, belowMin: false });
  assert.deepEqual(zoneCheck(null, 1), { fee: 0, belowMin: false });
  const f = feeLine("l", 1500);
  assert.equal(f.productId, null);
  assert.equal(f.vatRate, 10);
});

let n = 0;
const ev = (tabId: string, e: TabEv): TabEvent => { n++; return { id: `e${n}`, tabId, tableId: null, at: new Date(Date.UTC(2026, 8, 28, 12, 0, n)).toISOString(), staffId: "s", approvedBy: null, seq: n, ev: e }; };
const add = (lineId: string, unitPrice: number): TabEv => ({ type: "add", lineId, productId: "p", name: "Lahmacun", unitPrice, vatRate: 10, qtyMilli: 1000, options: [], note: null, stationId: null });

test("kurye nakdi: yalnız teslim edilmiş nakit siparişler", () => {
  const evs = [
    ev("a", { type: "open", guests: 0, kind: "paket" }), ev("a", add("1", 6000)), ev("a", { type: "courier", staffId: "k1" }), ev("a", { type: "delivered", method: "nakit" }),
    ev("b", { type: "open", guests: 0, kind: "paket" }), ev("b", add("2", 3000)), ev("b", { type: "courier", staffId: "k1" }), ev("b", { type: "delivered", method: "kart" }),
    ev("c", { type: "open", guests: 0, kind: "paket" }), ev("c", add("3", 2000)), ev("c", { type: "courier", staffId: "k1" }), ev("c", { type: "out" }),
    ev("d", { type: "open", guests: 0, kind: "paket" }), ev("d", add("4", 1000)), ev("d", { type: "courier", staffId: "k2" }), ev("d", { type: "delivered", method: "nakit" }),
  ];
  assert.equal(courierCash(foldTabs(evs).values(), "k1"), 6000);
});

test("paket fişi: PAKET başlığı, adres, toplam", () => {
  const b = renderDeliverySlip({
    title: "Paket · Ayşe", at: "2026-09-28T12:00:00Z", zoneName: "Merkez", total: 13500,
    order: { customerId: null, name: "Ayşe", phone: "905321234567", address: "Atatürk Cad. 5/3", directions: "Eczane üstü", zoneId: null, note: "Zil bozuk", payIntent: "nakit", promisedAt: null, source: null },
    lines: [{ qtyMilli: 2000, name: "Lahmacun", unitPrice: 6000, note: null, options: [] }],
  }, { width: 80, codepage: "ascii" });
  const txt = new TextDecoder("latin1").decode(b);
  assert.deepEqual([...b.slice(0, 2)], [0x1b, 0x40]);
  for (const s of ["PAKET", "Ataturk Cad. 5/3", "0532 123 45 67", "Eczane", "TOPLAM", "Nakit"]) assert.ok(txt.includes(s), s);
});

test("platform siparişi → olaylar; eşlenmeyen kod serbest satır", () => {
  const o: IncomingOrder = {
    externalId: "YS-1001", customer: { name: "Ali", phone: "905551112233" }, address: "Cumhuriyet Mah.", directions: null, note: null, payIntent: "online", deadline: null,
    lines: [{ code: "LAH", name: "Lahmacun (YS)", unitPrice: 6500, qtyMilli: 1000, note: "acılı" }, { code: "XX", name: "Ayran", unitPrice: 1500, qtyMilli: 2000, note: null }],
  };
  let i = 0;
  const { events, unmapped } = toTabEvents(o, "mock", new Map([["LAH", { id: "p1", name: "Lahmacun", vatRate: 10, stationId: "st" }]]), () => `id${++i}`);
  assert.equal(unmapped, 1);
  assert.deepEqual(events.map((e) => e.type), ["open", "order", "add", "add"]);
  const [a1, a2] = events.slice(2) as Extract<TabEv, { type: "add" }>[];
  assert.deepEqual([a1.productId, a1.name, a1.unitPrice, a1.stationId, a1.note], ["p1", "Lahmacun", 6500, "st", "acılı"]);
  assert.deepEqual([a2.productId, a2.name, a2.qtyMilli], [null, "Ayran", 2000]);
  const sends = sendByStation([{ lineId: a1.lineId, stationId: "st" }, { lineId: a2.lineId, stationId: null }], () => `t${++i}`);
  assert.deepEqual(sends.map((s) => [s.stationId, s.lineIds]), [["st", [a1.lineId]], [null, [a2.lineId]]]);
});

// #52: mesafe bazlı ücret + servis penceresi
import { zoneFee, zoneOpenAt } from "@/lib/core/delivery";

test("zoneFee: sabit; km'li bölgede fee + km×perKm", () => {
  const z = { id: "z", name: "Köy", fee: 2000, minOrder: 0 };
  assert.equal(zoneFee(z, null), 2000);
  assert.equal(zoneFee(z, 8), 2000);
  const kmli = { ...z, perKm: 500 };
  assert.equal(zoneFee(kmli, null), 2000);
  assert.equal(zoneFee(kmli, 3.5), 3750);
  assert.equal(zoneFee(kmli, 0), 2000);
});

test("zoneOpenAt: pencere yoksa hep açık; gece yarısı aşımı", () => {
  const z = { id: "z", name: "Merkez", fee: 0, minOrder: 0 };
  assert.equal(zoneOpenAt(z), true);
  const w = { ...z, startMin: 11 * 60, endMin: 23 * 60 };
  assert.equal(zoneOpenAt(w, new Date(2026, 9, 3, 12)), true);
  assert.equal(zoneOpenAt(w, new Date(2026, 9, 3, 23)), false);
  const gece = { ...z, startMin: 22 * 60, endMin: 2 * 60 };
  assert.equal(zoneOpenAt(gece, new Date(2026, 9, 3, 23)), true);
  assert.equal(zoneOpenAt(gece, new Date(2026, 9, 3, 1)), true);
  assert.equal(zoneOpenAt(gece, new Date(2026, 9, 3, 12)), false);
  assert.equal(zoneOpenAt({ ...z, startMin: 600, endMin: 600 }, new Date(2026, 9, 3, 12)), false);
});
