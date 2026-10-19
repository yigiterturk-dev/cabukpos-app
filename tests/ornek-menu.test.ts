import { test } from "node:test";
import assert from "node:assert/strict";
import { ORNEK_MENULER } from "@/lib/core/ornek-menu";

test("örnek menü: her iki dikeyde kategori ve ürün var", () => {
  for (const vertical of ["restoran", "market"] as const) {
    const menu = ORNEK_MENULER[vertical];
    assert.ok(menu.kategoriler.length >= 3, `${vertical}: en az 3 kategori`);
    for (const k of menu.kategoriler) {
      assert.ok(k.name.length >= 2, `${vertical}: kategori adı`);
      assert.ok(k.urunler.length >= 2, `${vertical}/${k.name}: en az 2 ürün`);
      for (const u of k.urunler) assert.ok(u.name.length >= 2 && u.price > 0, `${vertical}/${k.name}/${u.name}: ad + fiyat`);
    }
  }
});

test("örnek menü: fiyatlar kuruş, KDV Türkiye oranları, tartılı tekil", () => {
  for (const menu of Object.values(ORNEK_MENULER)) {
    for (const k of menu.kategoriler) {
      for (const u of k.urunler) {
        assert.ok(Number.isInteger(u.price) && u.price >= 100 && u.price <= 100000, `${u.name}: kuruş fiyat 1–1000 ₺ arası`);
        assert.ok([1, 10, 20].includes(u.vatRate), `${u.name}: KDV 1/10/20`);
        if (u.kind === "tartili") assert.ok(!u.quick, `${u.name}: tartılı ürün hızlı tuş olmaz (kg fiyat kafa karıştırır)`);
      }
    }
  }
});
