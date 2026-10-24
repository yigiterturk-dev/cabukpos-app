import { test } from "node:test";
import assert from "node:assert/strict";
import { courierSummary, deliveryDay, deliveryTimes, dispatchCsv, dispatchFilter, readyDispatchEvents } from "@/lib/core/dispatch";
import { parseCourierPosition, positionFresh, positionMapUrl } from "@/lib/core/courier-location";
import { foldTabs, type TabEv, type TabEvent } from "@/lib/core/tab";
import { dispatchPrintHtml } from "@/lib/ui/print-dispatch";
const now = Date.parse("2026-10-24T12:00:00+03:00");
function tab(id: string, tail: TabEv[] = []) {
  const evs: TabEv[] = [{ type: "open", guests: 0, kind: "paket" }, { type: "order", customerId: null, name: "Çağrı Işık", phone: "05321234567", address: "İstasyon Caddesi", directions: null, zoneId: null, note: null, payIntent: "nakit", promisedAt: null, source: null }, { type: "add", lineId: "food", productId: null, name: "Köfte", unitPrice: 30000, vatRate: 10, qtyMilli: 1000, options: [], note: null, stationId: null }, ...tail];
  return foldTabs(evs.map((ev, seq): TabEvent => ({ id: `${id}-${seq}`, tabId: id, tableId: null, at: new Date(now - 3600000 + seq * 60000).toISOString(), staffId: null, approvedBy: null, seq, ev }))).get(id)!;
}
test("dispatch: filters Turkish text, status, courier, day and excludes table/merged tabs", () => {
  const a = tab("a"), b = tab("b", [{ type: "courier", staffId: "c" }, { type: "out" }]);
  assert.equal(dispatchFilter([a, b], { query: "cagri isik" }).length, 2);
  assert.equal(dispatchFilter([a, b], { query: "kofte", status: "yolda", courierId: "c", day: "2026-10-24" })[0].id, "b");
  assert.deepEqual(dispatchFilter([a, b], { courierId: "unassigned" }).map(t => t.id), ["a"]);
  assert.equal(dispatchFilter([{ ...a, kind: "masa" }, { ...b, mergedAway: true }], {}).length, 0);
});
test("dispatch: per-day completed amounts use actual delivery method, not payment intent; active load is current", () => {
  const cash = tab("cash", [{ type: "courier", staffId: "c" }, { type: "out" }, { type: "delivered", method: "nakit" }]);
  const card = tab("card", [{ type: "courier", staffId: "c" }, { type: "out" }, { type: "delivered", method: "kart" }]);
  const cancelled = tab("cancel", [{ type: "courier", staffId: "c" }, { type: "cancel", reason: "x" }]);
  const active = tab("active", [{ type: "courier", staffId: "c" }, { type: "out" }]);
  const all = [cash, card, cancelled, active];
  const c = courierSummary(all, [{ id: "c", name: "Kurye" }], "2026-10-24", now)[0];
  assert.deepEqual([c.delivered, c.cash, c.card, c.total, c.active, c.onRoad], [2, 30000, 30000, 60000, 1, 1]);
  assert.equal(c.averageJourney, 1);
  assert.equal(courierSummary(all, [], "2026-10-23", now)[0].total, 0);
  assert.equal(deliveryDay({ ...cash, delivery: { ...cash.delivery, deliveredAt: "2026-10-24T22:30:00Z" } }), "2026-10-25");
});
test("dispatch: Ready opt-in assigns least-loaded active courier, preserves explicit assignment and doesn't assign platform", () => {
  const busy = tab("busy", [{ type: "courier", staffId: "a" }, { type: "out" }]);
  const target = tab("target");
  const staff = [{ id: "a", name: "Ali" }, { id: "b", name: "Bora" }];
  assert.deepEqual(readyDispatchEvents(target, [busy], staff, true, () => "ticket", now).at(-1), { type: "courier", staffId: "b" });
  assert.equal(readyDispatchEvents(target, [busy], staff, false, () => "ticket", now).some(e => e.type === "courier"), false);
  assert.equal(readyDispatchEvents({ ...target, kind: "platform" }, [busy], staff, true, () => "ticket", now).length, 0);
  const assigned = tab("assigned", [{ type: "courier", staffId: "a" }]);
  assert.equal(readyDispatchEvents(assigned, [busy], staff, true, () => "ticket", now).some(e => e.type === "courier"), false);
});
test("dispatch: timings don't invent ready timestamps; CSV prevents spreadsheet formula injection", () => {
  const t = tab("a", [{ type: "accept", prepMin: 10 }]);
  assert.equal(deliveryTimes(t, now).late, true);
  assert.equal(deliveryTimes(t, now).journey, null);
  t.order!.name = '=HYPERLINK("evil")';
  assert.match(dispatchCsv([t], []), /'=HYPERLINK/);
  t.order!.name = '<script>alert("x")</script>';
  const html = dispatchPrintHtml([t], [], "2026-10-24");
  assert.equal(html.includes('<script>'), false);
  assert.match(html, /&lt;script&gt;/);
  assert.equal(deliveryTimes({ ...t, kind: "platform", delivery: { ...t.delivery, acceptedAt: null } }, now).preparing, null);
});
test("courier location: validates coordinates/time, distinguishes stale data, safely bounds map viewport", () => {
  assert.ok(parseCourierPosition({ latitude: 41, longitude: 29, accuracy: 8.1, timestamp: now }, now));
  for (const v of [NaN, Infinity, 91]) assert.equal(parseCourierPosition({ latitude: v, longitude: 29, accuracy: 5, timestamp: now }, now), null);
  assert.equal(parseCourierPosition({ latitude: 41, longitude: 29, accuracy: -1, timestamp: now }, now), null);
  assert.equal(parseCourierPosition({ latitude: 41, longitude: 29, accuracy: 1, timestamp: now - 121000 }, now), null);
  const p = { staffId: "c", latitude: 41, longitude: 29, accuracy: 5, observedAt: new Date(now).toISOString() };
  assert.equal(positionFresh(p, now + 91000), false);
  assert.equal(positionFresh(p, now + 20000), true);
  assert.match(positionMapUrl(p), /^https:\/\/www.openstreetmap.org\/export\/embed.html\?/);
});
