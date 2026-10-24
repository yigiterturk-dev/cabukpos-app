import { test } from "node:test";
import assert from "node:assert/strict";
import { equalPart, lineShare, paidLinesOf, payableLines } from "@/lib/core/split";
import { foldTabs, type TabEv, type TabEvent } from "@/lib/core/tab";
import { totals } from "@/lib/core/cart";

function fixture(price: number, quantity: number, discount: number) {
  const rows: TabEvent[] = [];
  const append = (ev: TabEv) => rows.push({ id: `event-${rows.length}`, tabId: "tab", tableId: "table", staffId: "staff", approvedBy: null, seq: rows.length + 1, at: new Date(1700000000000 + rows.length).toISOString(), ev });
  append({ type: "open", kind: "masa", guests: 3 });
  append({ type: "add", lineId: "food", productId: "product", name: "Paylaşılan ürün", unitPrice: price, vatRate: 10, qtyMilli: quantity, options: [], note: null, stationId: null });
  if (discount) append({ type: "discount", amount: discount, percent: null, reason: "Test indirimi" });
  return { append, state: () => foldTabs(rows).get("tab")! };
}
test("split rounding regression: 1 TL in three shares conserves 100 cents and all quantity", () => {
  const f = fixture(100, 1000, 0);
  const amounts: number[] = [];
  for (let left = 3; left > 0; left--) {
    const part = equalPart(payableLines(f.state()), left);
    const amount = totals(part).total; amounts.push(amount);
    f.append({ type: "paid", saleId: `sale-${left}`, amount, lines: paidLinesOf(part) });
  }
  assert.equal(amounts.reduce((a, b) => a + b, 0), 100);
  assert.equal(f.state().remaining, 0); assert.equal(f.state().closed, true);
  assert.equal(f.state().lines[0].paidMilli, 1000);
});
test("single-line shares preserve quantity, discount and total for varied prices, divisions and weighed quantities", () => {
  for (const price of [1, 3, 99, 100, 101, 333, 999, 25000, 99999]) for (const qty of [1000, 1257, 3000]) for (const parts of [2, 3, 7, 20]) {
    const f = fixture(price, qty, Math.floor(price / 7));
    const initial = f.state().total;
    let total = 0;
    for (let left = parts; left > 0; left--) {
      const lines = payableLines(f.state());
      if (!lines.length) break;
      const share = lineShare(lines[0], left);
      if (!share) continue;
      assert.ok(share.qtyMilli > 0 && share.qtyMilli <= lines[0].qtyMilli);
      const amount = totals([share]).total; total += amount;
      f.append({ type: "paid", saleId: `s-${left}`, amount, lines: paidLinesOf([share]) });
    }
    assert.equal(total, initial, `price=${price}, qty=${qty}, parts=${parts}`);
    assert.equal(f.state().remaining, 0);
    assert.equal(f.state().lines[0].paidMilli, qty);
  }
});
test("single-line shares reject invalid divisions; final share takes exact remainder", () => {
  const f = fixture(12345, 1000, 123);
  const line = payableLines(f.state())[0];
  for (const n of [0, -1, 1.5, NaN, 21]) assert.equal(lineShare(line, n), null);
  assert.deepEqual(lineShare(line, 1), line);
});
