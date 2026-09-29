// tests/paytr.test.ts — PayTR imzaları ve sipariş no eşlemesi (saf).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { callbackValid, oidOf, paymentIdOf, tokenFields } from "@/lib/billing/paytr";

const k = { merchantId: "123456", key: "KEY", salt: "SALT", testMode: true };
const id = "0f8e1c2a-1b2c-4d5e-8f90-a1b2c3d4e5f6";

test("merchant_oid: uuid ↔ 32 harf/rakam", () => {
  assert.equal(oidOf(id), "0f8e1c2a1b2c4d5e8f90a1b2c3d4e5f6");
  assert.equal(paymentIdOf(oidOf(id)), id);
  assert.equal(paymentIdOf("abc"), null);
  assert.equal(paymentIdOf("0f8e1c2a-1b2c-4d5e-8f90-a1b2c3d4e5f6"), null);
});

test("get-token: paytr_token = base64(hmac(alanlar + salt, key)), sepet TL", () => {
  const f = tokenFields(k, { paymentId: id, amount: 49900, period: "aylik", tenantName: "Kebapçı", email: "a@b.c", userIp: "1.2.3.4", phone: "05551112233" }, "https://x.test");
  const basket = JSON.parse(Buffer.from(f.user_basket, "base64").toString());
  assert.deepEqual(basket, [["ÇabukPOS aylık abonelik", "499.00", 1]]);
  const s = "123456" + "1.2.3.4" + oidOf(id) + "a@b.c" + "49900" + f.user_basket + "1" + "0" + "TL" + "1";
  assert.equal(f.paytr_token, createHmac("sha256", "KEY").update(s + "SALT").digest("base64"));
  assert.equal(f.merchant_ok_url, "https://x.test/yonetim/abonelik?sonuc=isleniyor");
  assert.equal(f.user_address, "Türkiye");
});

test("bildirim imzası doğrulanır, bozuk/eksik reddedilir", () => {
  const b = { merchant_oid: oidOf(id), status: "success", total_amount: "49900" };
  const hash = createHmac("sha256", "KEY").update(b.merchant_oid + "SALT" + b.status + b.total_amount).digest("base64");
  assert.equal(callbackValid(k, { ...b, hash }), true);
  assert.equal(callbackValid(k, { ...b, status: "failed", hash }), false);
  assert.equal(callbackValid(k, { ...b, hash: "" }), false);
});
