// tests/fiscal.test.ts — VKN/TCKN, kanal modu, numara, yeniden deneme, alıcı şeması, sahte sürücü
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateTaxId, docModeFor, formatNumber, nextRetryDue, buyerSchema, newFiscalToken, FISCAL_CHANNELS, DEFAULT_MODES, NIHAI_TUKETICI } from "@/lib/core/fiscal";
import { fakeEarsiv } from "@/lib/fiscal/fake";
import { getProvider, type IssueInput } from "@/lib/fiscal/provider";

test("validateTaxId: VKN, TCKN, nihai tüketici", () => {
  assert.equal(validateTaxId("1234567890"), "vkn");
  assert.equal(validateTaxId("1234567891"), null);
  assert.equal(validateTaxId("10000000146"), "tckn");
  assert.equal(validateTaxId("10000000147"), null);
  assert.equal(validateTaxId("01234567890"), null);
  assert.equal(validateTaxId(NIHAI_TUKETICI.taxId), "tckn");
  assert.equal(validateTaxId("12345"), null);
  assert.equal(validateTaxId("12345abcde"), null);
});

test("docModeFor: kanal × istek", () => {
  const modes = { ...DEFAULT_MODES, paket: "earsiv" as const };
  for (const c of FISCAL_CHANNELS) {
    assert.equal(docModeFor(c, modes, true), "earsiv");
    assert.equal(docModeFor(c, modes, false), c === "paket" ? "earsiv" : "info");
  }
  assert.equal(docModeFor("kasa", null, false), "info");
});

test("formatNumber", () => {
  assert.equal(formatNumber("CBP", 2026, 1), "CBP2026000000001");
  assert.equal(formatNumber("A1B", 2027, 999_999_999), "A1B2027999999999");
  assert.throws(() => formatNumber("cbp", 2026, 1));
  assert.throws(() => formatNumber("CBP", 2026, 0));
  assert.throws(() => formatNumber("CBP", 2026, 1_000_000_000));
});

test("nextRetryDue: 1/5/15/60 dk, 5'te durur", () => {
  const t = new Date("2026-09-29T10:00:00Z");
  const mins = (d: Date | null) => d && (d.getTime() - t.getTime()) / 60_000;
  assert.equal(mins(nextRetryDue(0, t)), 0);
  assert.equal(mins(nextRetryDue(1, t)), 1);
  assert.equal(mins(nextRetryDue(2, t)), 5);
  assert.equal(mins(nextRetryDue(3, t)), 15);
  assert.equal(mins(nextRetryDue(4, t)), 60);
  assert.equal(nextRetryDue(5, t), null);
  assert.equal(nextRetryDue(9, t), null);
});

test("buyerSchema: VKN'de adres zorunlu, boş e-posta serbest", () => {
  assert.equal(buyerSchema.safeParse({ taxId: "1234567890", name: "Acme" }).success, false);
  assert.equal(buyerSchema.safeParse({ taxId: "1234567890", name: "Acme", address: "İstanbul" }).success, true);
  assert.equal(buyerSchema.safeParse({ taxId: "10000000146", name: "Ali", email: "" }).success, true);
  assert.equal(buyerSchema.safeParse({ taxId: "10000000146", name: "Ali", email: "x" }).success, false);
  assert.equal(buyerSchema.safeParse({ taxId: "10000000147", name: "Ali" }).success, false);
  assert.equal(buyerSchema.safeParse({ taxId: "10000000146", name: "" }).success, false);
});

test("newFiscalToken: 24 karakter base64url, benzersiz", () => {
  const a = newFiscalToken(), b = newFiscalToken();
  assert.match(a, /^[A-Za-z0-9_-]{24}$/);
  assert.notEqual(a, b);
});

const input: IssueInput = {
  seller: { taxId: "1234567890", name: "Test", taxOffice: "Kadıköy", address: "İstanbul" },
  buyer: { taxId: NIHAI_TUKETICI.taxId, name: NIHAI_TUKETICI.name },
  lines: [{ name: "Çay", qty: 1, unitPrice: 2000, vatRate: 10, total: 2000 }],
  vat: [{ rate: 10, gross: 2000, net: 1818, vat: 182 }], total: 2000, soldAt: new Date(), number: "CBP2026000000001",
};

test("sahte sürücü: başarı, hata simülasyonu, 7 gün iptal", async () => {
  const ok = await fakeEarsiv({ fakeFail: false }).issue(input);
  assert.equal(ok.ok, true);
  if (ok.ok) { assert.equal(ok.number, input.number); assert.match(ok.ettn, /^[0-9a-f-]{36}$/); }
  assert.deepEqual(await fakeEarsiv({ fakeFail: true }).issue(input), { ok: false, error: "Sahte sağlayıcı: hata simülasyonu", retryable: true });
  const now = new Date("2026-09-29T12:00:00Z");
  const p = fakeEarsiv({ fakeFail: false }, () => now);
  assert.deepEqual(await p.cancel({ ettn: "x", issuedAt: new Date("2026-09-25T12:00:00Z") }), { ok: true });
  assert.deepEqual(await p.cancel({ ettn: "x", issuedAt: new Date("2026-09-21T12:00:00Z") }), { ok: false, error: "İptal süresi geçti" });
  assert.throws(() => getProvider("yok", { fakeFail: false }));
  assert.equal(typeof getProvider("fake-earsiv", { fakeFail: false }).issue, "function");
});
