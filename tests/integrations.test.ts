import test from "node:test";
import assert from "node:assert/strict";

import { parseOrder } from "../lib/integrations/parse.ts";
import { isPlatform, PLATFORMS } from "../lib/integrations/types.ts";

test("platform doğrulaması", () => {
  assert.equal(isPlatform("tgo"), true);
  assert.equal(isPlatform("yemeksepeti"), true);
  assert.equal(isPlatform("getir-eski"), false);
  assert.equal(isPlatform(""), false);
  assert.equal(PLATFORMS.length, 2);
});

test("standart payload tam parse edilir", () => {
  const order = parseOrder("tgo", {
    orderId: "TGO-99123",
    customer: { name: "Ayşe Yılmaz", phone: "0555 111 22 33" },
    paymentMethod: "online_odeme",
    note: "Soğansız olsun",
    items: [
      { name: "Margarita Pizza", quantity: 2, unitPrice: 300, barcode: "8690000000024" },
      { name: "Kutu Kola", quantity: 3, price: "50" },
    ],
    orderDate: "2026-09-16T18:30:00Z",
  });

  assert.equal(order.externalId, "TGO-99123");
  assert.equal(order.customerName, "Ayşe Yılmaz");
  assert.equal(order.customerPhone, "0555 111 22 33");
  assert.equal(order.note, "Soğansız olsun");
  assert.equal(order.paymentNote, "online_odeme");
  assert.equal(order.placedAt, "2026-09-16T18:30:00.000Z");
  assert.equal(order.items.length, 2);
  assert.equal(order.items[0].qty, 2);
  assert.equal(order.items[0].unitPrice, 300);
  assert.equal(order.items[1].unitPrice, 50); // string sayı da çözülür
  assert.equal(order.items[1].barcode, undefined);
});

test("alternatif alan adları da taranır (savunmacı parse)", () => {
  const order = parseOrder("yemeksepeti", {
    id: "YS-555",
    customerName: "Mehmet",
    customerNote: "Kapıda kartsız",
    lines: [
      { productName: "Lahmacun", count: 4 },
      { title: "Ayran", quantity: 2, unit_amount: 25 },
    ],
  });

  assert.equal(order.externalId, "YS-555");
  assert.equal(order.customerName, "Mehmet");
  assert.equal(order.items.length, 2);
  assert.equal(order.items[0].qty, 4);
  assert.equal(order.items[0].name, "Lahmacun");
  assert.equal(order.items[1].unitPrice, 25);
});

test("sipariş numarası yoksa HATA fırlatır (sessiz yazım yok)", () => {
  assert.throws(() => parseOrder("tgo", { items: [{ name: "X", quantity: 1 }] }), /Sipariş numarası/);
});

test("kalemsiz sipariş HATA fırlatır", () => {
  assert.throws(
    () => parseOrder("tgo", { orderId: "X-1", items: [] }),
    /kalemi bulunamadı/i
  );
  assert.throws(
    () => parseOrder("yemeksepeti", { orderId: "X-2" }),
    /kalemi bulunamadı/i
  );
});

test("abartılı miktarlar kırpılır (0/999 aralığı)", () => {
  const order = parseOrder("tgo", {
    orderId: "Q-1",
    items: [{ name: "Ekmek", quantity: 0 }, { name: "Su", quantity: 5000 }],
  });
  assert.equal(order.items[0].qty, 1); // 0 → 1'e toparlanır
  assert.equal(order.items[1].qty, 999);
});

test("uzun alanlar kırpılır (depolama abuse koruması)", () => {
  const order = parseOrder("tgo", {
    orderId: "K".repeat(300),
    note: "N".repeat(900),
    items: [{ name: "Ü".repeat(400), quantity: 1 }],
  });
  assert.equal(order.externalId.length, 120);
  assert.ok((order.note ?? "").length <= 500);
  assert.ok(order.items[0].name.length <= 200);
});
