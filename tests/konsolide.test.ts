// tests/konsolide.test.ts — #43: aylık aralık, konsolide içerik bölümleri, due bayrağı.
import { test } from "node:test";
import assert from "node:assert/strict";
const { digestContent, digestTitle } = await import("@/lib/core/digest");

const { digestRange } = await import("@/lib/admin/report-mail");

test("digestRange aylik: geçen ayın 1'i – sonu (IST)", () => {
  const r = digestRange("aylik", Date.UTC(2026, 9, 4, 9)); // 4 Ekim 2026
  assert.equal(r.bas, "2026-09-01");
  assert.equal(r.bit, "2026-09-30");
  const yilbasi = digestRange("aylik", Date.UTC(2027, 0, 2, 9));
  assert.equal(yilbasi.bas, "2026-12-01");
  assert.equal(yilbasi.bit, "2026-12-31");
});

test("digestTitle/content aylik: başlık + konsolide bölümler", () => {
  assert.equal(digestTitle("aylik"), "Aylık konsolide rapor");
  const c = digestContent("aylik", "Kahveci", {
    range: { bas: "2026-09-01", bit: "2026-09-30" },
    month: "2026-09",
    summary: { gross: 900_000, net: 700_000, count: 90, refunds: 1, refundTotal: 10_000, avg: 10_000 },
    methods: [{ method: "Kart", amount: 600_000 }],
    channels: [{ label: "Paket", gross: 300_000 }],
    top: [{ name: "Çay", qtyMilli: 12_000, gross: 120_000 }],
    staff: [{ name: "Ali", gross: 400_000, count: 40 }],
    critical: [{ name: "Un", level: 8_750, unit: "kg" }],
    customers: { total: 42, active30: 12, new30: 5, spend30: 250_000 },
    review: 0,
  }, "https://x.test/k");
  assert.match(c.subject, /^Aylık konsolide rapor — Kahveci/);
  assert.match(c.text, /Ay: 2026-09/);
  assert.match(c.text, /Kanal: Paket: 3\.000,00/);
  assert.match(c.text, /Personel:\nAli: 4\.000,00 ₺ \(40 fiş\)/);
  assert.match(c.text, /Kritik stok:\nUn: 8,75 kg/);
  assert.match(c.text, /Müşteri: kayıtlı \/ 30g aktif \/ 30g yeni: 42 \/ 12 \/ 5/);
  assert.match(c.html, /Personel</);
  assert.match(c.html, /Kritik stok</);
});
