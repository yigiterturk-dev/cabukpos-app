// tests/tab-merge.test.ts — #49 masa birleştirme: fold birleştirme + kaynak kapanışı + adaylar.
import { test } from "node:test";
import assert from "node:assert/strict";
const { foldTabs, mergeableLines, mergeCandidates } = await import("@/lib/core/tab");
import type { TabEvent, TabEv } from "@/lib/core/tab";

let n = 0;
const ev = (tabId: string, e: TabEv, over: Partial<TabEvent> = {}): TabEvent =>
  ({ id: `e${++n}`, tabId, tableId: over.tableId ?? "t1", at: over.at ?? new Date(Date.UTC(2026, 9, 3, 12, n)).toISOString(), staffId: "s1", approvedBy: null, seq: null, ev: e });

const add = (tabId: string, name: string, price: number): TabEv => ({ type: "add", lineId: `l-${tabId}-${name}`, productId: null, name, unitPrice: price, vatRate: 10, qtyMilli: 1000, options: [], note: null, stationId: null });

test("merge: satırlar hedefe kopyalanır, kaynak merge_away ile boşalıp kapanır", () => {
  const a = foldTabs([ev("a", { type: "open", guests: 2 }), ev("a", add("a", "Çay", 5000))]).get("a")!;
  const b = foldTabs([ev("b", { type: "open", guests: 4 }), ev("b", add("b", "Kahve", 8000)), ev("b", { type: "merge", fromTabId: "a", lines: mergeableLines(a) }), ev("a", { type: "merge_away", toTabId: "b" })]);
  const tb = b.get("b")!;
  const ta = b.get("a")!;
  assert.equal(tb.lines.length, 2);
  assert.equal(tb.total, 13_000);
  assert.equal(tb.closed, false);
  assert.equal(ta.closed, true); // live boşaldı
  assert.equal(ta.total, 0);
});

test("merge: aynı satır iki kez gelmez (yerel + sunucu yankısı idempotent)", () => {
  const a = foldTabs([ev("a", { type: "open", guests: 2 }), ev("a", add("a", "Çay", 5000))]).get("a")!;
  const lines = mergeableLines(a);
  const b = foldTabs([ev("b", { type: "open", guests: 1 }), ev("b", { type: "merge", fromTabId: "a", lines }), ev("b", { type: "merge", fromTabId: "a", lines })]);
  assert.equal(b.get("b")!.lines.length, 1);
});

test("merge adayları: açık, ödemesiz masa adisyonları; kendisi ve ödenmiş hariç", () => {
  const mk = (id: string, es: TabEv[]) => foldTabs([ev(id, { type: "open", guests: 1 }), ...es.map((e) => ev(id, e))]);
  const open = mk("open", [add("open", "Çay", 1000)]);
  const paidTab = mk("paid", [add("paid", "Kahve", 2000), { type: "paid", saleId: "s1", lines: [{ lineId: "l-paid-Kahve", qtyMilli: 1000, discount: 0 }], amount: 2000 }]);
  const self = mk("self", [add("self", "Su", 500)]);
  const all = new Map([...open, ...paidTab, ...self]);
  const cands = mergeCandidates(all, "self").map((t) => t.id);
  assert.deepEqual(cands, ["open"]);
  assert.equal(mergeableLines(paidTab.get("paid")!).length, 0); // ödenen satır taşınmaz
});
