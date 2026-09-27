// tests/pin.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPin, pinProblem, verifyPin } from "@/lib/auth/pin";
import { newDeviceToken, newPairingCode, sha256 } from "@/lib/auth/tokens";

test("PIN kuralı", () => {
  assert.equal(pinProblem("4826"), null);
  assert.equal(pinProblem("482619"), null);
  assert.match(pinProblem("123")!, /4-6 hane/);
  assert.match(pinProblem("12a4")!, /4-6 hane/);
  assert.match(pinProblem("1111")!, /tahmin/);
  assert.match(pinProblem("1234")!, /tahmin/);
  assert.match(pinProblem("987654")!, /tahmin/);
});

test("PIN hash: doğrula, yanlış PIN, bozuk kayıt, tuz farklı", async () => {
  const h = await hashPin("4826", 1000);
  assert.match(h, /^pbkdf2\$1000\$[\w-]+\$[\w-]+$/);
  assert.equal(await verifyPin("4826", h), true);
  assert.equal(await verifyPin("4827", h), false);
  assert.equal(await verifyPin("4826", "bozuk"), false);
  assert.notEqual(await hashPin("4826", 1000), h);
});

test("eşleme kodu, cihaz jetonu, sha256", async () => {
  const c = newPairingCode();
  assert.match(c, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  assert.notEqual(newPairingCode(), c);
  assert.match(newDeviceToken(), /^[\w-]{43}$/);
  assert.equal(await sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});
