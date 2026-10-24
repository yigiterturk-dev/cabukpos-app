import { test } from "node:test";
import assert from "node:assert/strict";
import { transferCsv, transferDate, transferQuantity, type TransferDocument } from "@/lib/core/transfer-document";

const doc: TransferDocument = {
  id: "11111111-1111-4111-8111-111111111111", createdAt: new Date("2026-10-24T22:30:00Z"),
  fromStoreId: "from", fromName: "Merkez; depo", toStoreId: "to", toName: "Şube", note: 'İki "koli"\nkontrol edin',
  lines: [{ productId: "p1", name: "=1+1", qtyMilli: 2500, unit: "kg" }, { productId: "p2", name: "Bardak", qtyMilli: 3000, unit: "adet" }],
};

test("transfer dökümü: İstanbul tarihi ve kg/adet miktarı bir kez birim içerir", () => {
  assert.match(transferDate(doc.createdAt), /25\.10\.2026.*01:30/);
  assert.equal(transferQuantity(2500, "kg"), "2,500 kg");
  assert.equal(transferQuantity(3000, "adet"), "3 adet");
});

test("transfer CSV: BOM, TR ondalık, ayrı birim, formül ve ayraç/tırnak/satır sonu koruması", () => {
  const csv = transferCsv(doc);
  assert.ok(csv.startsWith("\ufeffTransfer kimliği;"));
  assert.ok(csv.endsWith("\r\n"));
  assert.ok(csv.includes('"Merkez; depo";Şube;\'=1+1;2,5;kg;'));
  assert.ok(csv.includes('"İki ""koli""\nkontrol edin"'));
  assert.ok(csv.includes(";Bardak;3;adet;"));
  for (const name of ["+1+1", "-1+1", "@SUM(A1)", "\t=1+1"]) {
    assert.ok(transferCsv({ ...doc, lines: [{ ...doc.lines[0], name }] }).includes(`;'${name};`));
  }
});
