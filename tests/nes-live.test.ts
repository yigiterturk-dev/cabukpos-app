// tests/nes-live.test.ts — NES canlı/BYOK: bağlantı seçimi, sandbox/canlı XML farkı, şifreli anahtar
import { test } from "node:test";
import assert from "node:assert/strict";
import { getProvider, type IssueInput } from "@/lib/fiscal/provider";
import { nesConnFrom, nesInvoiceXml, type NesConn } from "@/lib/fiscal/nes";
import { encryptCardToken } from "@/lib/billing/card-vault";

const input: IssueInput = {
  seller: { taxId: "1234567890", name: "Acme", taxOffice: "Kadıköy", address: "İstanbul" },
  buyer: { taxId: "10000000146", name: "Ali Veli" },
  lines: [{ name: "Çay", qty: 1, unitPrice: 2000, vatRate: 10, total: 2000 }],
  vat: [{ rate: 10, gross: 2000, net: 1818, vat: 182 }], discount: 0, total: 2000,
  soldAt: new Date("2026-11-08T10:00:00Z"), number: "CBP2026000000001",
};

const conn: NesConn = { apiKey: "test-key", base: "https://apitest.nes.com.tr", senderAlias: "urn:mail:defaultgb@nes.com.tr", sandbox: true };

test("getProvider: NES bağlantısı yoksa fail-closed, varsa sürücü döner", () => {
  assert.throws(() => getProvider("nes", { fakeFail: false }), /NES bağlantısı yapılandırılmamış/);
  assert.equal(typeof getProvider("nes", { fakeFail: false, nes: conn }).issue, "function");
});

test("nesInvoiceXml: sandbox notu yalnız sandbox'ta; satıcı VKN canlıda kiracıdan", () => {
  const uuid = "11111111-1111-4111-8111-111111111111";
  const sandboxXml = nesInvoiceXml(input, { uuid, number: input.number, profile: "EARSIVFATURA", sellerVkn: "1234567890", sandbox: true });
  assert.match(sandboxXml, /NES sandbox/);
  assert.match(sandboxXml, /<cbc:ID schemeID="VKN">1234567890<\/cbc:ID>/);
  const liveXml = nesInvoiceXml(input, { uuid, number: input.number, profile: "EARSIVFATURA", sellerVkn: "9876543210", sandbox: false });
  assert.doesNotMatch(liveXml, /NES sandbox/);
  assert.match(liveXml, /<cbc:ID schemeID="VKN">9876543210<\/cbc:ID>/);
});

test("nesInvoiceXml: GİB dışı numara reddedilir", () => {
  assert.throws(() => nesInvoiceXml(input, { uuid: "x", number: "CBP-1", profile: "EARSIVFATURA", sellerVkn: "1234567890" }), /GİB biçiminde/);
});

test("nesConnFrom: şifreli anahtarı çözer, ortamı adresten anlar", () => {
  const oldSecret = process.env.AUTH_SECRET;
  const oldKey = process.env.NES_API_KEY;
  process.env.AUTH_SECRET = "test-secret";
  delete process.env.NES_API_KEY;
  try {
    const enc = encryptCardToken("plain-key");
    assert.ok(enc);
    const sandbox = nesConnFrom({ nesApiKey: enc, nesApiUrl: "https://apitest.nes.com.tr", nesSenderAlias: "urn:mail:x@nes.com.tr" });
    assert.equal(sandbox?.apiKey, "plain-key");
    assert.equal(sandbox?.sandbox, true);
    const live = nesConnFrom({ nesApiKey: enc, nesApiUrl: "https://api.nes.com.tr" });
    assert.equal(live?.sandbox, false);
    assert.equal(nesConnFrom({ nesApiKey: null }), null);
  } finally {
    if (oldSecret === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = oldSecret;
    if (oldKey === undefined) delete process.env.NES_API_KEY; else process.env.NES_API_KEY = oldKey;
  }
});
