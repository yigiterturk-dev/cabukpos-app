// tests/escpos.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { cols, encodeText, EscPos, wrap, DRAWER_PULSE, toBase64, fromBase64, packBits, BRANDS } from "@/lib/core/escpos";
import { renderReceipt, renderShiftReport, receiptSmsText } from "@/lib/core/receipt";
import { summarizeShift } from "@/lib/core/shift";
import { totals } from "@/lib/core/cart";
import { formatReceipt, formatTL } from "@/lib/core/money";

const ascii = (u: Uint8Array) => String.fromCharCode(...u);

test("escpos: Türkçe kod sayfası ve ASCII çevirisi", () => {
  assert.deepEqual(encodeText("ş", "pc857"), [0x9f]);
  assert.deepEqual(encodeText("İĞÜ", "pc857"), [0x98, 0xa6, 0x9a]);
  assert.deepEqual(encodeText("şçı", "ascii"), [...Buffer.from("sci")]);
  assert.equal(String.fromCharCode(...encodeText("12,50 ₺", "ascii")), "12,50 TL");
  assert.deepEqual(encodeText("€", "pc857"), [0x3f]);
});

test("escpos: sütun ve satır bölme", () => {
  const s = cols("Ekmek", "12,50 ₺", 32);
  assert.equal(s.length, 32);
  assert.ok(s.endsWith("12,50 TL"));
  assert.equal(cols("Çok uzun bir ürün adı ki sığmaz asla", "1.234,50 ₺", 32).length, 32);
  assert.ok(wrap("Organik tam buğday ekmeği dilimli 500 gr paket", 16).every((l) => l.length <= 16));
  assert.deepEqual(DRAWER_PULSE, [0x1b, 0x70, 0x00, 0x19, 0xfa]);
  assert.deepEqual(new EscPos("ascii").drawer().bytes().slice(2), Uint8Array.from(DRAWER_PULSE));
  const b = Uint8Array.from([0, 255, 27, 64]);
  assert.deepEqual(fromBase64(toBase64(b)), b);
});

const lines = [
  { productId: "a", name: "Ekmek", unitPrice: 1250, vatRate: 1 as const, qtyMilli: 2000 },
  { productId: "b", name: "Domates (kg)", unitPrice: 4990, vatRate: 1 as const, qtyMilli: 750 },
  { productId: "c", name: "Deterjan Süper Beyazlık Ekonomik Paket 4 kg", unitPrice: 29990, vatRate: 20 as const, qtyMilli: 1000 },
];
const t = totals(lines);
const sale = { receiptNo: "K1-000042", at: "2026-09-28T10:05:00Z", staffName: "Ayşe", lines, payments: [{ method: "nakit" as const, amount: 40000 }], total: t.total, change: 40000 - t.total, vat: t.vat };
const head = { tenantName: "Çınar Market", storeName: "Merkez", storeAddress: "Atatürk Cd. 1" };

test("fiş: başlar, keser, toplam ve fiş no içerir; 58 mm'de satır taşmaz", () => {
  for (const width of [58, 80] as const) {
    const u = renderReceipt(sale, head, { width, codepage: "pc857" }, (id) => id === "b");
    assert.deepEqual([...u.slice(0, 2)], [0x1b, 0x40]);
    assert.deepEqual([...u.slice(-4)], [0x1d, 0x56, 0x42, 0x03]);
    const s = ascii(u);
    assert.ok(s.includes("TOPLAM") && s.includes("K1-000042") && s.includes("0,750 kg"));
    // Komut baytları dışındaki düz metin satırları
    const text = ascii(renderReceipt(sale, head, { width, codepage: "ascii" })).split("\n").map((l) => l.replace(/\x1b@|\x1b[aEtd][\s\S]|\x1d![\s\S]|\x1dV[\s\S]{2}/g, ""));
    const w = width === 58 ? 32 : 48;
    assert.ok(text.every((l) => l.length <= w), `${width}: ${text.find((l) => l.length > w)}`);
  }
  const withDrawer = ascii(renderReceipt(sale, head, { width: 80, codepage: "pc857", drawer: true }));
  assert.ok(withDrawer.includes(String.fromCharCode(...DRAWER_PULSE)));
});

test("fiş: iade ve gün sonu", () => {
  const r = ascii(renderReceipt({ ...sale, refund: true, refundOfNo: "K1-000040", change: 0 }, head, { width: 80, codepage: "ascii" }));
  assert.ok(r.includes("IADE FISI") && r.includes("K1-000040"));
  const rf = { number: "CBP2026000000001", ettn: "11111111-2222-3333-4444-555555555555", invoiceAt: "2026-09-29T09:00:00.000Z", buyerKind: "tckn" as const, partial: true, sellerTaxId: "1234567890" };
  const tt = ascii(renderReceipt({ ...sale, refund: true, refundOfNo: "K1-000040", change: 0, refundFiscal: rf }, head, { width: 80, codepage: "ascii" }));
  assert.ok(ascii(renderReceipt({ ...sale, refund: true, refundOfNo: "K1-000040", change: 0, refundFiscal: rf }, head, { width: 58, codepage: "ascii" })).includes("IADE TUTANAGI"));
  assert.ok(tt.includes("IADE TUTANAGI") && tt.includes("Musteri imza") && tt.includes("ETTN:") && tt.includes("11111111-2222-3333-4444-555555555555") && tt.includes("CBP2026000000001"));
  const nt = ascii(renderReceipt({ ...sale, refund: true, refundOfNo: "K1-000040", change: 0, refundFiscal: { ...rf, buyerKind: "vkn" } }, head, { width: 80, codepage: "ascii" }));
  assert.ok(nt.includes("iade faturasi duzenleyecektir") && !nt.includes("IADE TUTANAGI"));
  assert.ok(!ascii(renderReceipt({ ...sale, refund: true, refundOfNo: "K1-000040", change: 0, refundFiscal: { ...rf, partial: false } }, head, { width: 80, codepage: "ascii" })).includes("TUTANAG"));
  const summary = summarizeShift(10000, [sale]);
  const z = ascii(renderShiftReport({ deviceName: "Kasa 1", openedByName: "Ayşe", closedByName: "Ayşe", openingCash: 10000, openedAt: new Date(), closedAt: new Date(), countedCash: 10000 + t.total, expectedCash: null, summary }, head, { width: 58, codepage: "ascii" }));
  assert.ok(z.includes("GUN SONU") && z.includes("Beklenen kasa") && z.includes("Fark"));
});

test("fiş: para birimi (#16) — USD fişte ISO kodu, TRY'de ₺/TL; kod sayfasından bağımsız", () => {
  // formatReceipt: TRY → "12,50 ₺" (formatTL ile aynı), diğerleri ISO kodu
  assert.equal(formatReceipt(1250), formatTL(1250));
  assert.equal(formatReceipt(1250, "USD"), "12,50 USD");
  assert.equal(formatReceipt(1250, "EUR"), "12,50 EUR");
  const u = ascii(renderReceipt(sale, head, { width: 80, codepage: "ascii", currency: "USD" }));
  assert.ok(u.includes(formatReceipt(t.total, "USD")));
  assert.ok(!u.includes("TL") && !u.includes("₺"));
  // pc857'de de aynı (kod ASCII güvenli)
  const g = ascii(renderReceipt(sale, head, { width: 80, codepage: "pc857", currency: "GBP" }));
  assert.ok(g.includes(formatReceipt(t.total, "GBP")) && !g.includes("USD"));
  // gün sonu raporu
  const summary = summarizeShift(10000, [sale]);
  const z = ascii(renderShiftReport({ deviceName: "Kasa 1", openedByName: "Ayşe", closedByName: "Ayşe", openingCash: 10000, openedAt: new Date(), closedAt: new Date(), countedCash: null, expectedCash: null, summary }, head, { width: 58, codepage: "ascii", currency: "USD" }));
  assert.ok(z.includes("Ciro") && z.includes("USD") && !z.includes("TL"));
  // SMS fişi
  assert.ok(receiptSmsText({ storeName: "Çınar Market", receiptNo: "K1-000042", at: sale.at, total: t.total, lines: [{ name: "Ekmek", qtyMilli: 2000 }], currency: "USD" }).includes(`TOPLAM: ${formatReceipt(t.total, "USD")}`));
  assert.ok(receiptSmsText({ storeName: "Çınar Market", receiptNo: "K1-000042", at: sale.at, total: t.total, lines: [] }).includes(`TOPLAM: ${formatReceipt(t.total)}`));
});

test("escpos: QR (GS ( k model 2, boyut, hata M, sakla, bas)", () => {
  const b = [...new EscPos("ascii").qr("AB", 5).bytes().slice(2)];
  assert.deepEqual(b, [
    0x1d, 0x28, 0x6b, 4, 0, 49, 65, 50, 0,
    0x1d, 0x28, 0x6b, 3, 0, 49, 67, 5,
    0x1d, 0x28, 0x6b, 3, 0, 49, 69, 49,
    0x1d, 0x28, 0x6b, 5, 0, 49, 80, 48, 65, 66,
    0x1d, 0x28, 0x6b, 3, 0, 49, 81, 48,
  ]);
  const long = new EscPos("ascii").qr("x".repeat(300)).bytes();
  assert.ok(ascii(long).includes("\x1d(k" + String.fromCharCode(303 & 0xff, 303 >> 8) + "1P0"));
});

test("fiş: e-Arşiv kesildi / kesilmedi / uygulama adresi yok", () => {
  const f = { token: "t".repeat(24), number: "CBP2026000000001", ettn: "0b8e7f2a-1111-4222-8333-944455556666", buyer: { name: "Acme Ltd", email: "a@b.co" }, test: true };
  const o = { width: 80 as const, codepage: "ascii" as const, appUrl: "https://app.cabukpos.com/" };
  const issued = ascii(renderReceipt({ ...sale, fiscal: f }, head, o));
  for (const s of ["e-ARSIV FATURA", "CBP2026000000001", f.ettn, "Acme Ltd", "TEST", "https://app.cabukpos.com/f/" + f.token]) assert.ok(issued.includes(s), s);
  assert.ok(!issued.includes("Bilgi fisidir"));
  const late = ascii(renderReceipt({ ...sale, fiscal: { ...f, number: null, ettn: null } }, head, o));
  assert.ok(late.includes("e-postayla gonderilecek"));
  assert.ok(late.includes("Bilgi fisidir"));
  const noMail = ascii(renderReceipt({ ...sale, fiscal: { ...f, number: null, ettn: null, buyer: null } }, head, o));
  assert.ok(noMail.includes("Faturaniz:"));
  const plain = ascii(renderReceipt({ ...sale, fiscal: f }, head, { width: 80, codepage: "ascii" }));
  assert.ok(!plain.includes("CBP2026") && plain.includes("Bilgi fisidir"));
});

test("escpos: barkod (GS h, GS H 2, GS k 73/67) + doğrulama", () => {
  const u = new EscPos("ascii", 80).barcode("K1-000001").bytes();
  assert.deepEqual([...u.slice(-19)], [0x1d, 0x68, 80, 0x1d, 0x48, 2, 0x1d, 0x6b, 73, 9, ...[..."K1-000001"].map((c) => c.charCodeAt(0))]);
  const ean = new EscPos("ascii", 80).barcode("1234567890128", "EAN13").bytes();
  assert.deepEqual([...ean.slice(-23)], [0x1d, 0x68, 80, 0x1d, 0x48, 2, 0x1d, 0x6b, 67, 13, ...[..."1234567890128"].map((c) => c.charCodeAt(0))]);
  assert.throws(() => new EscPos().barcode("123", "EAN13"), /13 hane/);
  assert.throws(() => new EscPos().barcode("fiş-ğ"), /ASCII/);
  assert.throws(() => new EscPos().barcode("x".repeat(49)), /ASCII/);
});

test("escpos: raster (GS v 0) + packBits paketleme", () => {
  const img = packBits([[1, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 1]]);
  assert.deepEqual([...img.data], [0x80, 0x01]);
  const u = new EscPos("ascii", 80).raster(img).bytes();
  assert.deepEqual([...u.slice(-10)], [0x1d, 0x76, 0x30, 0, 8, 0, 2, 0, 0x80, 0x01]);
  assert.throws(() => packBits([[1, 0], [0, 1]]), /8'in katı/);
  assert.throws(() => new EscPos().raster({ width: 16, data: new Uint8Array(3) }), /tam bölünmeli/);
});

test("escpos: marka profili kesme baytını değiştirir (#36)", () => {
  assert.deepEqual(Object.keys(BRANDS), ["genel", "xprinter", "epson"]);
  const cutOf = (b: keyof typeof BRANDS) => [...new EscPos("ascii", 80, b).cut().bytes().slice(-4)];
  assert.deepEqual(cutOf("genel"), [0x1d, 0x56, 66, 3]);
  assert.deepEqual(cutOf("xprinter"), [0x1d, 0x56, 66, 3]);
  assert.deepEqual(cutOf("epson"), [0x1d, 0x56, 65, 3]);
});

test("mutfak fişi: platform siparişinde zil (ESC B), Epson'da ve masada yok", async () => {
  const { renderKitchenTicket } = await import("@/lib/core/kitchen");
  const base = { tableName: "Trendyol · #1234", packed: true, stationName: "Mutfak", staffName: null, at: "2026-11-07T18:00:00Z", lines: [{ qtyMilli: 1000, name: "Pide", options: [], note: null }] };
  const has = (b: Uint8Array) => Buffer.from(b).includes(Buffer.from([0x1b, 0x42, 3, 3]));
  assert.equal(has(renderKitchenTicket({ ...base, buzz: true }, { width: 80, codepage: "pc857", brand: "xprinter" })), true);
  assert.equal(has(renderKitchenTicket({ ...base, buzz: true }, { width: 80, codepage: "pc857" })), true);
  assert.equal(has(renderKitchenTicket({ ...base, buzz: true }, { width: 80, codepage: "pc857", brand: "epson" })), false);
  assert.equal(has(renderKitchenTicket(base, { width: 80, codepage: "pc857", brand: "xprinter" })), false);
});

test("mutfak fişi HTML (ajansız): kaçışlı, paket + seçenek + not", async () => {
  const { kitchenTicketHtml } = await import("@/lib/core/kitchen");
  const h = kitchenTicketHtml({ tableName: "Trendyol · #<1>", packed: true, stationName: "Mutfak", staffName: null, at: "2026-11-07T18:00:00Z", lines: [{ qtyMilli: 2000, name: "Pide & Ayran", options: [{ id: "o", name: "Acılı", delta: 0 }], note: "-Soğan" }] }, 80);
  assert.match(h, /@page\{size:80mm auto/);
  assert.match(h, /PAKET/);
  assert.match(h, /#&lt;1&gt;/);
  assert.match(h, /2 x Pide &amp; Ayran/);
  assert.match(h, /\+ Acılı/);
  assert.match(h, /! -Soğan/);
});
