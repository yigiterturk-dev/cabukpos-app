// tests/dexie-close.test.ts — kapanış işlemi kapsam hatasının tekrarı: closeShiftLocal "rejected"
// tablosuna yazarken kapsam dışı bırakıyordu (#26) → tarayıcıda sessiz NotFoundError, kapanış görünmez düşüyordu.
import { test } from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
const { kasaDb, openShiftLocal, recordSaleLocal, closeShiftLocal, loadMeta } = await import("@/lib/offline/db");

const staff = { id: "s1", name: "K" };
const cart = [{ lineId: "l1", productId: null, name: "Çay", unitPrice: 3000, vatRate: 10 as const, qtyMilli: 1000, options: [], note: null, stationId: null, discount: 0, weigh: false }];

const withTimeout = <T,>(p: Promise<T>, ms: number, what: string): Promise<T> =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`ASKIDA/HATA: ${what}`)), ms))]);

test("kapanış: vardiya aç + 2 satış + reddedilmiş kopya + kapanış tamamlanır", async () => {
  const d = kasaDb();
  // Cihaz meta'da yoksa recordSaleLocal "Açık vardiya yok" der; eşlenmiş kasa gibi hazırla.
  await d.transaction("rw", d.meta, async () => {
    const m = await loadMeta();
    await d.meta.put({ ...m, catalog:{...m.catalog,staff:[{...staff,role:"kasiyer"}]}, device: { id: "d1", name: "Kasa 1", receiptPrefix: "K1", tenantName: "T", vertical: "market", role: "kasa", stations: [], storeName: "S", storeAddress: null, nextReceiptNo: 1 } });
  });
  await withTimeout(openShiftLocal("s1", 500), 3000, "vardiya açma");
  const sale = (id: string) => withTimeout(recordSaleLocal(staff, cart, [{ method: "nakit" as const, amount: 3000 }], id, undefined, null, 0), 3000, `satış ${id}`);
  assert.equal((await sale("sale-1")).ok, true);
  assert.equal((await sale("sale-2")).ok, true);
  // Reddedilmiş kopya ekle (#26 budama yolu bundan geçer)
  await d.rejected.put({ id: "eski-doc", doc: { kind: "sale", id: "eski-doc" } as never, error: "test", at: new Date(Date.now() - 30 * 86_400_000).toISOString() });

  const m = await withTimeout(closeShiftLocal("s1", 690), 4000, "kapanış");
  assert.equal(m.shift, null);
  assert.equal(m.lastClosed?.countedCash, 690);
  assert.ok((await d.rejected.get("eski-doc")) === undefined); // 14 günden eski budandı
  assert.equal((await d.outbox.count()) >= 1, true); // shift_close giden kutusunda
});
