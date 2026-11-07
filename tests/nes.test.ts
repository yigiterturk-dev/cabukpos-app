import { test } from "node:test";
import assert from "node:assert/strict";
import { nesInvoiceXml, nesLines } from "@/lib/fiscal/nes";

const input = {
  seller: { taxId: "1111111111", name: "Kebapçı Test", taxOffice: "İlkadım", address: "Deneme Mah." },
  buyer: { taxId: "11111111111", name: "Nihai Tüketici" },
  lines: [{ name: "Adana", qty: 2, unitPrice: 25000, vatRate: 10, total: 50000 }, { name: "Ayran", qty: 1, unitPrice: 3000, vatRate: 20, total: 3000 }],
  vat: [], discount: 1000, total: 52000, soldAt: new Date("2026-11-07T12:00:00Z"), number: "CBP2026000000001",
};

test("indirimi satırlara dağıtır, KDV dahil toplam korunur", () => {
    const l = nesLines(input);
    assert.equal(l.reduce((s, x) => s + x.gross, 0), 52000);
    assert.ok(l.every((x) => x.net + x.vat === x.gross));
  });
test("e-Arşiv XML: satıcı sandbox VKN, nihai tüketici TCKN, ödenecek tutar", () => {
    const x = nesInvoiceXml(input, { uuid: "u-1", number: "CBP2026123456789", profile: "EARSIVFATURA", sellerVkn: "1234567801" });
    assert.ok(x.includes('<cbc:ID schemeID="VKN">1234567801</cbc:ID>'));
    assert.ok(x.includes('<cbc:ID schemeID="TCKN">11111111111</cbc:ID>'));
    assert.ok(x.includes('<cbc:PayableAmount currencyID="TRY">520.00</cbc:PayableAmount>'));
    assert.ok(x.includes("SEND_TYPE"));
  });
test("GİB biçimsiz numarayı reddeder", () => {
    assert.throws(() => nesInvoiceXml(input, { uuid: "u", number: "X1", profile: "EARSIVFATURA", sellerVkn: "1234567801" }));
  });
