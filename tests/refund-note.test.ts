import { test } from "node:test";
import assert from "node:assert/strict";
const { buyerKindOf, isPartialRefund, refundNote } = await import("@/lib/core/refundNote");

const F = { number: "CBP2026000000001", ettn: "11111111-2222-3333-4444-555555555555", invoiceAt: "2026-09-29T10:00:00.000Z", buyerKind: "tckn" as const, partial: true, sellerTaxId: "1234567890" };

test("buyerKindOf: VKN 10 hane → vkn, TCKN/nihai/boş → tckn", () => {
  assert.equal(buyerKindOf("1234567890"), "vkn");
  assert.equal(buyerKindOf("11111111111"), "tckn");
  assert.equal(buyerKindOf(null), "tckn");
});

test("isPartialRefund: hepsi seçili ve önceki iade yok → tam; eksik ya da önceki iade → kısmi", () => {
  const rem = [{ productId: "a", qtyMilli: 2000 }, { productId: "b", qtyMilli: 1000 }];
  assert.equal(isPartialRefund(rem, rem, false), false);
  assert.equal(isPartialRefund(rem, [{ productId: "a", qtyMilli: 2000 }], false), true);
  assert.equal(isPartialRefund(rem, [{ productId: "a", qtyMilli: 1000 }, { productId: "b", qtyMilli: 1000 }], false), true);
  assert.equal(isPartialRefund(rem, rem, true), true);
});

test("refundNote: tam iadede yok; TCKN → tutanak (no = iade fiş no, fatura bilgisi, imza alanları); VKN → not", () => {
  assert.equal(refundNote({ ...F, partial: false }, "Kebapçı", "K1-000002"), null);
  const t = refundNote(F, "Kebapçı", "K1-000002");
  assert.ok(t && t.kind === "tutanak");
  assert.deepEqual(t.rows[0], ["Tutanak no", "K1-000002"]);
  assert.ok(t.rows.some(([k, v]) => k === "Asıl fatura" && v === F.number));
  assert.ok(t.rows.some(([k, v]) => k === "ETTN" && v === F.ettn));
  assert.ok(t.rows.some(([k, v]) => k === "Satıcı VKN" && v === "1234567890"));
  assert.deepEqual(t.sign, ["Müşteri ad soyad", "Müşteri TCKN", "Müşteri imza", "Satıcı imza"]);
  const n = refundNote({ ...F, buyerKind: "vkn" }, "Kebapçı", "K1-000002");
  assert.deepEqual(n, { kind: "note", text: `Alıcı iade faturası düzenleyecektir. Fatura: ${F.number}` });
});
