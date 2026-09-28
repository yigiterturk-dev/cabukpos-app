// tests/tab.test.ts — adisyon katlama, seçenekler, bölme, mutfak fişi. Saf.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deliveryStatus, foldTabs, openDeliveries, openTabsByTable, tabLabel, tableStatus, type TabEv, type TabEvent } from "@/lib/core/tab";
import { validateOptions } from "@/lib/core/options";
import { equalPart, paidLinesOf, payableLines, pickPart } from "@/lib/core/split";
import { pendingPrints, renderKitchenTicket } from "@/lib/core/kitchen";
import { lineTotal, totals } from "@/lib/core/cart";

let n = 0;
const T0 = Date.parse("2026-09-28T12:00:00Z");
const ev = (e: TabEv, o: Partial<TabEvent> = {}): TabEvent => {
  n++;
  return { id: `e${n}`, tabId: "t1", tableId: "M1", at: new Date(T0 + n * 1000).toISOString(), staffId: "g", approvedBy: null, seq: n, ev: e, ...o };
};
const add = (lineId: string, unitPrice: number, qtyMilli = 1000, stationId: string | null = "izgara"): TabEv =>
  ({ type: "add", lineId, productId: `p-${lineId}`, name: `Ürün ${lineId}`, unitPrice, vatRate: 10, qtyMilli, options: [], note: null, stationId });
const one = (events: TabEvent[]) => foldTabs(events).get("t1")!;

test("ekle, gönder, iptal, ikram → toplam", () => {
  const t = one([ev({ type: "open", guests: 2 }), ev(add("a", 10000, 2000)), ev(add("b", 5000)), ev(add("c", 3000)),
    ev({ type: "send", ticketId: "k1", lineIds: ["a", "b"], stationId: "izgara" }), ev({ type: "void", lineId: "c", reason: "yanlış" }), ev({ type: "comp", lineId: "b", reason: "müdür" })]);
  assert.equal(t.guests, 2);
  assert.equal(t.gross, 20000);
  assert.equal(t.total, 20000);
  assert.deepEqual(t.tickets.map((k) => [k.id, k.lineIds, k.status]), [["k1", ["a", "b"], "yeni"]]);
  assert.equal(t.lines.find((l) => l.lineId === "a")!.sent, true);
  assert.equal(t.closed, false);
});

test("aynı kimlik iki kez (yerel + sunucu yankısı) tek sayılır; yerel bekleyen sona", () => {
  const a = ev(add("a", 1000));
  const local = { ...ev(add("b", 2000)), seq: null };
  const echo = { ...local, seq: 99 };
  const t = one([local, a, echo]);
  assert.equal(t.lines.length, 2);
  const t2 = one([ev(add("x", 1000)), { ...ev(add("y", 1000)), seq: null, at: "2026-01-01T00:00:00Z" }]);
  assert.deepEqual(t2.lines.map((l) => l.lineId), ["x", "y"]);
});

test("bilinmeyen satıra olay yok sayılır; ödenmiş satır iptal edilemez; gönderilmiş satır ikinci bilete girmez", () => {
  const t = one([ev(add("a", 1000)), ev({ type: "void", lineId: "zz", reason: "?" }), ev({ type: "send", ticketId: "k1", lineIds: ["a"], stationId: null }),
    ev({ type: "send", ticketId: "k2", lineIds: ["a"], stationId: null }), ev({ type: "paid", saleId: "s", lines: [{ lineId: "a", qtyMilli: 500, discount: 0 }], amount: 500 }),
    ev({ type: "void", lineId: "a", reason: "geç" })]);
  assert.equal(t.tickets.length, 1);
  assert.equal(t.lines[0].voided, false);
  assert.equal(t.remaining, 500);
});

test("indirim yüzde/tutar, kaldırma", () => {
  const base = [ev(add("a", 10000)), ev(add("b", 5000))];
  assert.equal(one([...base, ev({ type: "discount", percent: 10, amount: null, reason: "" })]).total, 13500);
  assert.equal(one([...base, ev({ type: "discount", percent: null, amount: 99999, reason: "" })]).total, 0);
  assert.equal(one([...base, ev({ type: "discount", percent: 10, amount: null, reason: "" }), ev({ type: "discount", percent: null, amount: null, reason: "" })]).total, 15000);
});

test("masa taşı, durum, çift adisyon", () => {
  const evs = [ev(add("a", 1000)), ev({ type: "move", toTableId: "M2" }), ev({ type: "send", ticketId: "k", lineIds: ["a"], stationId: null }),
    ev(add("z", 1000), { tabId: "t2", tableId: "M2" })];
  const tabs = foldTabs(evs);
  const byTable = openTabsByTable(tabs);
  assert.equal(byTable.get("M1"), undefined);
  assert.equal(byTable.get("M2")!.length, 2);
  assert.equal(tableStatus(byTable.get("M2")!, T0 + 60_000), "dolu");
  assert.equal(tableStatus(byTable.get("M2")!, T0 + 91 * 60_000), "uzun");
  const ready = foldTabs([...evs, ev({ type: "kitchen", ticketId: "k", status: "hazir" })]);
  assert.equal(tableStatus(openTabsByTable(ready).get("M2")!, T0), "hazir");
  assert.equal(tableStatus([], T0), "bos");
});

test("seçenek doğrulama ve fiyat", () => {
  const groups = [
    { id: "g1", name: "Pişirme", min: 1, max: 1, options: [{ id: "az", name: "Az pişmiş", delta: 0 }, { id: "iyi", name: "İyi pişmiş", delta: 0 }] },
    { id: "g2", name: "Ekstra", min: 0, max: 2, options: [{ id: "pey", name: "Peynir", delta: 1500 }, { id: "yarim", name: "Yarım", delta: -9000 }] },
  ];
  assert.deepEqual(validateOptions(18000, groups, []), { ok: false, error: "Pişirme: en az 1 seçim." });
  assert.deepEqual(validateOptions(18000, groups, ["az", "iyi"]), { ok: false, error: "Pişirme: en çok 1 seçim." });
  assert.equal(validateOptions(18000, groups, ["x"]).ok, false);
  const r = validateOptions(18000, groups, ["pey", "az"]);
  assert.ok(r.ok);
  assert.equal(r.unitPrice, 19500);
  assert.deepEqual(r.options.map((o) => o.name), ["Az pişmiş", "Peynir"]);
  const cheap = validateOptions(5000, groups, ["az", "yarim"]);
  assert.ok(cheap.ok && cheap.unitPrice === 0);
});

test("eşit bölme: 3 parça toplamı tutar, masa kapanır", () => {
  let evs = [ev(add("a", 10000)), ev(add("b", 2500, 3000)), ev({ type: "discount", percent: null, amount: 1000, reason: "" })];
  const total = one(evs).total;
  assert.equal(total, 16500);
  const parts: number[] = [];
  for (let left = 3; left >= 1; left--) {
    const part = equalPart(payableLines(one(evs)), left);
    const amount = totals(part).total;
    parts.push(amount);
    evs = [...evs, ev({ type: "paid", saleId: `s${left}`, lines: paidLinesOf(part), amount })];
  }
  assert.equal(parts.reduce((a, b) => a + b, 0), total);
  for (const p of parts) assert.ok(Math.abs(p - total / 3) < 100, `parça ${p}`);
  const t = one(evs);
  assert.equal(t.closed, true);
  assert.equal(t.remaining, 0);
});

test("ürün seçerek bölme; ikram satırı 0 TL girer, kapanışı beklemez", () => {
  let evs = [ev(add("a", 10000)), ev(add("b", 2500, 2000)), ev(add("c", 4000)), ev({ type: "comp", lineId: "c", reason: "" })];
  const lines = payableLines(one(evs));
  assert.equal(lineTotal(lines.find((l) => l.lineId === "c")!), 0);
  const part = pickPart(lines, { b: 1000 });
  assert.equal(totals(part).total, 2500);
  evs = [...evs, ev({ type: "paid", saleId: "s1", lines: paidLinesOf(part), amount: 2500 })];
  const rest = payableLines(one(evs)).filter((l) => l.lineId !== "c");
  assert.equal(totals(rest).total, 12500);
  evs = [...evs, ev({ type: "paid", saleId: "s2", lines: paidLinesOf(rest), amount: 12500 })];
  assert.equal(one(evs).closed, true);
});

test("tümü iptal → kapalı", () => {
  assert.equal(one([ev(add("a", 1000)), ev({ type: "void", lineId: "a", reason: "" })]).closed, true);
});

test("mutfak fişi baytları ve bekleyen baskılar", () => {
  const b = renderKitchenTicket({ tableName: "M1", stationName: "Izgara", staffName: "Ayşe", at: "2026-09-28T12:00:00Z", lines: [{ qtyMilli: 2000, name: "Köfte", options: [{ id: "az", name: "Az pişmiş", delta: 0 }], note: "soğansız" }] }, { width: 58, codepage: "ascii" });
  assert.deepEqual([...b.slice(0, 2)], [0x1b, 0x40]);
  assert.deepEqual([...b.slice(-4)], [0x1d, 0x56, 0x42, 0x03]);
  const txt = Buffer.from(b).toString("latin1");
  for (const s of ["M1", "2 x Kofte", "+ Az pismis", "! sogansiz"]) assert.ok(txt.includes(s), s);
  const tabs = foldTabs([ev(add("a", 1000)), ev({ type: "send", ticketId: "k1", lineIds: ["a"], stationId: "izgara" }),
    ev(add("b", 1000, 1000, "bar")), ev({ type: "send", ticketId: "k2", lineIds: ["b"], stationId: "bar" }), ev(add("c", 1000)), ev({ type: "send", ticketId: "k3", lineIds: ["c"], stationId: "izgara" }), ev({ type: "printed", ticketId: "k3" })]);
  const printerOf = (s: string | null) => (s === "izgara" ? "mutfak1" : null);
  assert.deepEqual(pendingPrints(tabs.values(), printerOf, T0 + 60_000).map((p) => [p.ticket.id, p.printer]), [["k1", "mutfak1"]]);
  assert.equal(pendingPrints(tabs.values(), printerOf, T0 + 31 * 60_000).length, 0);
});

test("yönetim: masa adı aralığı, seçenek satırları", async () => {
  const { expandTableNames, parseOptionLines } = await import("@/lib/admin/salon");
  assert.deepEqual(expandTableNames("M1-M3"), ["M1", "M2", "M3"]);
  assert.deepEqual(expandTableNames("Bahçe 1-2, Bar"), ["Bahçe 1", "Bahçe 2", "Bar"]);
  assert.equal(expandTableNames("M5-M1"), null);
  assert.equal(expandTableNames(""), null);
  assert.deepEqual(parseOptionLines("Az pişmiş\nPeynir +15\nYarım - 90,50 TL"), [{ name: "Az pişmiş", delta: 0 }, { name: "Peynir", delta: 1500 }, { name: "Yarım", delta: -9050 }]);
  assert.equal(typeof parseOptionLines("A\nA"), "string");
  assert.equal(typeof parseOptionLines(""), "string");
});

test("tamamı ikram: kendiliğinden kapanmaz, 'close' ile kapanır", () => {
  const evs = [ev(add("a", 1000)), ev({ type: "comp", lineId: "a", reason: "" })];
  assert.equal(one(evs).closed, false);
  assert.equal(one([...evs, ev({ type: "close", reason: "" })]).closed, true);
  assert.equal(one([ev(add("b", 1000)), ev({ type: "close", reason: "" })]).closed, false);
});

// M6: paket / platform
const pk = (e: TabEv, tabId = "p1") => ev(e, { tabId, tableId: null });
const order = (source: boolean): TabEv => ({ type: "order", customerId: null, name: "Ayşe", phone: "905321234567", address: "Adres", directions: null, zoneId: null, note: null, payIntent: source ? "online" : "nakit", promisedAt: null, source: source ? { platform: "mock", externalId: "X-1234", deadline: null } : null });

test("paket durum zinciri: hazırlanıyor → hazır → yolda → teslim + ödeme → kapalı", () => {
  const evs = [pk({ type: "open", guests: 0, kind: "paket" }), pk(order(false)), pk(add("a", 6000)), pk({ type: "send", ticketId: "k", lineIds: ["a"], stationId: null })];
  const st = () => foldTabs(evs).get("p1")!;
  assert.equal(st().kind, "paket");
  assert.equal(st().tableId, null);
  assert.equal(deliveryStatus(st()), "hazirlaniyor");
  evs.push(pk({ type: "kitchen", ticketId: "k", status: "hazir" }));
  assert.equal(deliveryStatus(st()), "hazir");
  evs.push(pk({ type: "courier", staffId: "k1" }), pk({ type: "out" }));
  assert.equal(deliveryStatus(st()), "yolda");
  assert.equal(st().delivery.courierId, "k1");
  evs.push(pk({ type: "delivered", method: "nakit" }), pk({ type: "paid", saleId: "s", lines: [{ lineId: "a", qtyMilli: 1000, discount: 0 }], amount: 6000 }));
  assert.equal(deliveryStatus(st()), "teslim");
  assert.equal(st().closed, true);
  assert.equal(openTabsByTable(foldTabs(evs)).size, 0);
  assert.equal(tabLabel(st(), []), "Paket · Ayşe");
});

test("platform: onay bekliyor → kabul; red ve iptal ödemesiz kapatır", () => {
  const evs = [pk({ type: "open", guests: 0, kind: "platform" }, "x"), pk(order(true), "x"), pk(add("a", 6000), "x")];
  assert.equal(deliveryStatus(foldTabs(evs).get("x")!), "onay_bekliyor");
  assert.equal(tabLabel(foldTabs(evs).get("x")!, [], { mock: "Deneme" }), "Deneme · #1234");
  evs.push(pk({ type: "accept", prepMin: 20 }, "x"));
  assert.equal(deliveryStatus(foldTabs(evs).get("x")!), "hazirlaniyor");
  evs.push(pk({ type: "handover" }, "x"));
  const h = foldTabs(evs).get("x")!;
  assert.deepEqual([deliveryStatus(h), h.delivery.method, h.closed], ["teslim", "online", false]);

  const r = foldTabs([pk({ type: "open", guests: 0, kind: "platform" }, "r"), pk(add("a", 100), "r"), pk({ type: "reject", reason: "kapalıyız" }, "r")]).get("r")!;
  assert.deepEqual([deliveryStatus(r), r.closed], ["reddedildi", true]);
  const c = foldTabs([pk({ type: "open", guests: 0, kind: "paket" }, "c"), pk(add("a", 100), "c"), pk({ type: "cancel", reason: "müşteri vazgeçti" }, "c")]).get("c")!;
  assert.deepEqual([deliveryStatus(c), c.closed], ["iptal", true]);
});

test("paket panosu: masa adisyonu yok, eski kapananlar düşer", () => {
  const evs = [ev({ type: "open", guests: 1 }, { tabId: "m" }), pk({ type: "open", guests: 0, kind: "paket" }, "a"), pk(add("x", 100), "a")];
  const tabs = foldTabs(evs);
  const now = Date.parse(tabs.get("a")!.openedAt);
  assert.deepEqual(openDeliveries(tabs, now).map((t) => t.id), ["a"]);
  const closed = foldTabs([...evs, pk({ type: "cancel", reason: "x" }, "a")]);
  assert.deepEqual(openDeliveries(closed, now + 13 * 3600_000).map((t) => t.id), []);
});
