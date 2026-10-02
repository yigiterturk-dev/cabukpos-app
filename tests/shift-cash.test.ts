// tests/shift-cash.test.ts — #48: para kırılımı sayımı + safe drop saf mantığı.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BANKNOTES, COINS, countCash, summarizeShift } from "@/lib/core/shift";
import { syncDoc } from "@/lib/sync/docs";
import { EVENT_LABEL, registerEventRow, staffRows, type StaffEvent } from "@/lib/core/report";

import { splitVat } from "@/lib/core/money";

const sat = (total: number, change = 0) => ({ total, change, payments: [{ method: "nakit" as const, amount: total + change }], vat: [{ rate: 10 as const, gross: total, ...splitVat(total, 10) }] });

test("kırılım: banknot ve bozuk değerleri kuruş toplamına iner", () => {
  assert.deepEqual(BANKNOTES, [20000, 10000, 5000, 2000, 1000, 500]);
  assert.deepEqual(COINS, [100, 50, 25, 10, 5]);
  assert.equal(countCash({ 10000: 2, 500: 1, 25: 4 }), 20600); // 2×100 + 5 + 4×0,25 = 206 TL
  assert.equal(countCash({}), 0);
  assert.equal(countCash({ 100: -3, 5000: 1 }), 5000); // negatif adet zararsız
});

test("vardiya özeti: safe drop beklenen kasadan düşer, nakit kolonu değişmez", () => {
  const s = summarizeShift(10000, [sat(30000, 5000)], [20000, 5000]);
  assert.equal(s.netCash, 30000); // 35000 alındı, 5000 para üstü verildi
  assert.equal(s.dropped, 25000);
  assert.equal(s.expectedCash, 10000 + 30000 - 25000);
  const yok = summarizeShift(10000, [sat(30000)]);
  assert.equal(yok.dropped, 0);
  assert.equal(yok.expectedCash, 40000);
});

test("safe_drop olayı: etiketi ve metni; personel performansına sayılmaz", () => {
  assert.equal(EVENT_LABEL.safe_drop, "Seifeye para");
  const e = registerEventRow({ at: new Date(), staffId: "s1", type: "safe_drop", lines: [], total: 20000 });
  assert.equal(e.kind, "safe_drop");
  assert.match(e.text, /200,00/);
  const rows = staffRows([], [], [e, { ...e, staffId: "s1", kind: "silme", text: "x" } as StaffEvent], new Map([["s1", "Ali"]]));
  assert.equal(rows[0].removed, 1); // yalnız silme sayılır
  assert.equal(rows[0].removedTotal, 20000);
});

test("safe_drop belge şeması: pozitif tutar zorunlu, sıfır reddedilir", () => {
  const ok = syncDoc.safeParse({ kind: "safe_drop", id: crypto.randomUUID(), shiftId: crypto.randomUUID(), staffId: crypto.randomUUID(), at: new Date().toISOString(), amount: 1 });
  assert.equal(ok.success, true);
  const sifir = syncDoc.safeParse({ kind: "safe_drop", id: crypto.randomUUID(), shiftId: crypto.randomUUID(), staffId: crypto.randomUUID(), at: new Date().toISOString(), amount: 0 });
  assert.equal(sifir.success, false);
});
