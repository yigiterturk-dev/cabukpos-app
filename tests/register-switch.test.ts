import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { kasaDb } from "@/lib/offline/db";
import { emptyMeta } from "@/lib/offline/state";
import { inspectRegisterSwitch } from "@/lib/offline/register-switch";

const db = kasaDb();
beforeEach(async () => {
  await db.transaction("rw", [db.meta, db.sales, db.outbox, db.rejected, db.tabEvents], async () => {
    await Promise.all([db.meta.clear(), db.sales.clear(), db.outbox.clear(), db.rejected.clear(), db.tabEvents.clear()]);
  });
});
const doc = { kind: "shift_open" as const, id: "pending", staffId: "staff", at: new Date().toISOString(), openingCash: 0 };

test("register switch: pending/rejected documents block switching and remain untouched", async () => {
  await db.outbox.add({ id: doc.id, doc });
  assert.match((await inspectRegisterSwitch())!, /bekleyen/);
  assert.equal(await db.outbox.count(), 1);
  await db.outbox.clear();
  await db.rejected.put({ id: doc.id, doc, error: "test", at: doc.at });
  assert.match((await inspectRegisterSwitch())!, /incelenecek/);
  assert.equal(await db.rejected.count(), 1);
});
test("register switch: open shift blocks switching without mutating meta", async () => {
  const meta = { ...emptyMeta(), shift: { id: "shift", openedBy: "staff", openedAt: doc.at, openingCash: 500 } };
  await db.meta.put(meta);
  assert.match((await inspectRegisterSwitch())!, /vardiyası açık/);
  assert.deepEqual(await db.meta.get("state"), meta);
});
test("register switch: clean browser is allowed and all cached records are preserved", async () => {
  const meta = emptyMeta();
  await db.meta.put(meta);
  await db.tabEvents.put({ id: "event", tabId: "tab", tableId: null, at: doc.at, staffId: "staff", approvedBy: null, seq: 1, ev: { type: "open", guests: 1 } });
  assert.equal(await inspectRegisterSwitch(), null);
  assert.deepEqual(await db.meta.get("state"), meta);
  assert.equal(await db.tabEvents.count(), 1);
});
test("register switch: same-device PIN setup is allowed, different device cannot bypass pending guard", async () => {
  await db.meta.put({ ...emptyMeta(), device: { id: "old", name: "Kasa", receiptPrefix: "K1", tenantName: "T", vertical: "market", storeName: "S", storeAddress: null, nextReceiptNo: 1 } });
  await db.outbox.add({ id: doc.id, doc });
  assert.equal(await inspectRegisterSwitch("old"), null);
  assert.match((await inspectRegisterSwitch("new"))!, /bekleyen/);
  assert.equal(await db.outbox.count(), 1);
});
