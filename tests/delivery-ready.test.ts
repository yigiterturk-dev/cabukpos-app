import { test } from "node:test";
import assert from "node:assert/strict";
import { readyDeliveryEvents } from "@/lib/core/delivery";
import { foldTabs, deliveryStatus, type TabEv, type TabEvent } from "@/lib/core/tab";

const event = (ev: TabEv, index: number): TabEvent => ({ id: `e${index}`, tabId: "tab", tableId: null, at: new Date(1700000000000 + index).toISOString(), staffId: "staff", approvedBy: null, seq: index, ev });
function order(kind: "paket" | "platform" | "masa" = "paket", tail: TabEv[] = []) {
  const events: TabEv[] = [{ type: "open", kind, guests: 0 },
    ...["a", "b"].map((lineId, index) => ({ type: "add" as const, lineId, productId: lineId, name: lineId, unitPrice: 1000, vatRate: 10 as const, qtyMilli: 1000, options: [], note: null, stationId: index ? "bar" : "kitchen" })), ...tail];
  const rows = events.map(event);
  return { rows, tab: foldTabs(rows).get("tab")! };
}
test("delivery ready: unsent lines go through station tickets and become ready", () => {
  const f = order(); let id = 0;
  const plan = readyDeliveryEvents(f.tab, () => `ticket${++id}`);
  assert.equal(plan.filter(e => e.type === "send").length, 2);
  const tab = foldTabs([...f.rows, ...plan.map((e, i) => event(e, f.rows.length + i))]).get("tab")!;
  assert.equal(deliveryStatus(tab), "hazir");
  assert.deepEqual(readyDeliveryEvents(tab, () => "unused"), []);
});
test("delivery ready: existing ready/delivered tickets are not regressed or resent", () => {
  const f = order("paket", [{ type: "send", ticketId: "one", lineIds: ["a"], stationId: "kitchen" }, { type: "kitchen", ticketId: "one", status: "teslim" }]);
  const plan = readyDeliveryEvents(f.tab, () => "two");
  assert.equal(plan.filter(e => e.type === "send").length, 1);
  assert.ok(!plan.some(e => e.type === "kitchen" && e.ticketId === "one"));
});
test("delivery ready: unpaid platform acceptance, table, cancelled and dispatched orders are blocked", () => {
  for (const f of [order("platform"), order("masa"), order("paket", [{ type: "cancel", reason: "iptal" }]), order("paket", [{ type: "out" }]), order("paket", [{ type: "delivered", method: "online" }])]) {
    assert.deepEqual(readyDeliveryEvents(f.tab, () => "unused"), []);
  }
  assert.ok(readyDeliveryEvents(order("platform", [{ type: "accept", prepMin: 20 }]).tab, () => "ticket").length > 0);
});
