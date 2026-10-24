import { test } from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { kasaDb, recordSaleLocal, shiftSales } from "@/lib/offline/db";
import { emptyMeta } from "@/lib/offline/state";
import { foldTabs, type TabEvent } from "@/lib/core/tab";
import { payableLines, pickPart, paidLinesOf } from "@/lib/core/split";
import { summarizeShift } from "@/lib/core/shift";

test("ürün bazında kısmi karma ödeme: kalan masa açık, ikinci ödeme kapanır; gün sonu nakit/kart ayrılır", async () => {
  const db = kasaDb();
  await db.delete(); await db.open();
  const at = new Date().toISOString();
  await db.meta.put({ ...emptyMeta(), device: { id: "device", name: "Test", receiptPrefix: "T1", tenantName: "Test", vertical: "restoran", storeName: "Merkez", storeAddress: null, nextReceiptNo: 1 }, shift: { id: "shift", openedBy: "staff", openedAt: at, openingCash: 10000 } });
  const initial: TabEvent[] = [
    { id: "open", tabId: "tab", tableId: "table", at, staffId: "staff", approvedBy: null, seq: 1, ev: { type: "open", guests: 2 } },
    { id: "add", tabId: "tab", tableId: "table", at, staffId: "staff", approvedBy: null, seq: 2, ev: { type: "add", lineId: "food", productId: "food", name: "Yemek", unitPrice: 30000, vatRate: 10, qtyMilli: 2000, options: [], note: null, stationId: null } },
  ];
  await db.tabEvents.bulkPut(initial);
  const tab = () => db.tabEvents.toArray().then((events) => foldTabs(events).get("tab")!);
  const first = pickPart(payableLines(await tab()), { food: 1000 });
  const pay = (part: typeof first, id: string, payments: Parameters<typeof recordSaleLocal>[2]) => recordSaleLocal({ id: "staff", name: "Test" }, part, payments, id, { tabId: "tab", tableId: "table", tableName: "Masa 1", paidLines: paidLinesOf(part) });
  assert.equal((await pay(first, "sale1", [{ method: "nakit", amount: 15000 }, { method: "kart", amount: 20000 }])).ok, true);
  assert.equal((await tab()).remaining, 30000);
  assert.equal((await tab()).closed, false);
  // Aynı satış yeniden denense de yalnız bir kez kaydedilir.
  await pay(first, "sale1", [{ method: "nakit", amount: 15000 }, { method: "kart", amount: 20000 }]);
  assert.equal((await tab()).remaining, 30000);
  assert.equal((await pay(payableLines(await tab()), "sale2", [{ method: "kart", amount: 30000 }])).ok, true);
  assert.equal((await tab()).closed, true);
  assert.equal((await tab()).remaining, 0);
  const summary = summarizeShift(10000, await shiftSales("shift"));
  assert.equal(summary.saleCount, 2);
  assert.equal(summary.gross, 60000);
  assert.equal(summary.byMethod.nakit, 10000);
  assert.equal(summary.byMethod.kart, 50000);
  assert.equal(summary.expectedCash, 20000);
  assert.equal(await db.outbox.count(), 2);
  await db.delete();
});
