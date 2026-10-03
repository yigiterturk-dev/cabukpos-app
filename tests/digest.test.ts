// tests/digest.test.ts — #41 rapor e-postası saf katmanı: içerik, aralık, sınır.
import { test } from "node:test";
import assert from "node:assert/strict";
const { digestContent, digestTitle } = await import("@/lib/core/digest");
const { digestRange } = await import("@/lib/admin/report-mail");

const data = {
  range: { bas: "2026-10-02", bit: "2026-10-02" },
  summary: { gross: 123_450, net: 100_000, count: 12, refunds: 1, refundTotal: 5_000, avg: 10_288 },
  methods: [{ method: "Kart", amount: 100_000 }, { method: "Nakit", amount: 23_450 }],
  top: [{ name: "Çay", qtyMilli: 3_400, gross: 34_000 }],
  review: 2,
};

test("digestContent: konu, satırlar, çok satanlar, HTML kaçışı", () => {
  const c = digestContent("gunluk", "Kahve Dükkânı", data, "https://x.test/r");
  assert.match(c.subject, /^Günlük özet — Kahve Dükkânı \(2026-10-02…2026-10-02\)$/);
  assert.match(c.text, /Brüt ciro: 1\.234,50/);
  assert.match(c.text, /Çok satanlar:\n1\. Çay/);
  assert.match(c.text, /İncelenecek: 2/);
  assert.match(c.html, /<td style="padding:4px 0;text-align:right"><b>1\.234,50 ₺<\/b>/);
  assert.match(digestContent("gunluk", "<b>x</b>", data, "u").html, /&lt;b&gt;x&lt;\/b&gt;/);
  assert.equal(digestTitle("haftalik"), "Haftalık özet");
});

test("digestRange: günlük = dün; haftalık = geçen pazartesi–pazar (IST)", () => {
  // 2026-10-03 Cumartesi (IST) → geçen hafta 2026-09-21 Pzt … 2026-09-27 Paz
  const sat = Date.parse("2026-10-03T09:00:00+03:00");
  assert.deepEqual(digestRange("gunluk", sat), { bas: "2026-10-02", bit: "2026-10-02" });
  assert.deepEqual(digestRange("haftalik", sat), { bas: "2026-09-21", bit: "2026-09-27" });
  // 2026-10-05 Pazartesi → geçen hafta 09-28…10-04 (bir önceki takvim haftası)
  assert.deepEqual(digestRange("haftalik", Date.parse("2026-10-05T09:00:00+03:00")), { bas: "2026-09-28", bit: "2026-10-04" });
});
