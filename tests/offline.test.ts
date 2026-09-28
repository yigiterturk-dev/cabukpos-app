// tests/offline.test.ts — Kasa yerel durumu uzlaştırma (saf).
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyMeta, reconcile } from "@/lib/offline/state";

const device = { id: "d1", name: "Kasa 1", receiptPrefix: "K1", tenantName: "T", vertical: "market" as const, storeName: "M", storeAddress: null, nextReceiptNo: 5 };
const local = { id: "s-local", openedBy: "u", openedAt: "2026-09-28T08:00:00Z", openingCash: 0 };
const server = { id: "s-cloud", openedBy: "u", openedAt: "2026-09-28T07:00:00Z", openingCash: 100 };
const catalog = { categories: [], products: [], staff: [] };

test("fiş sırası geri gitmez; katalog yalnız geldiyse değişir", () => {
  const m = reconcile({ ...emptyMeta(), nextSeq: 9, v: "eski" }, { v: "yeni", device, openShift: null, catalog: null }, 0);
  assert.equal(m.nextSeq, 9);
  assert.equal(m.v, "eski");
  assert.equal(reconcile(emptyMeta(), { v: "yeni", device, openShift: null, catalog }, 0).nextSeq, 5);
  assert.equal(reconcile(emptyMeta(), { v: "yeni", device, openShift: null, catalog }, 0).v, "yeni");
});

test("giden kutusu doluyken yerel vardiya korunur, boşken bulut yetkili", () => {
  const m = { ...emptyMeta(), shift: local };
  assert.equal(reconcile(m, { v: "x", device, openShift: null, catalog: null }, 2).shift, local);
  assert.equal(reconcile(m, { v: "x", device, openShift: null, catalog: null }, 0).shift, null);
  assert.equal(reconcile(m, { v: "x", device, openShift: server, catalog: null }, 0).shift, server);
});

test("ajan bilgisi her çekişte güncellenir; kaldırılınca null", () => {
  const agent = { url: "http://127.0.0.1:17654", ticket: "t", autoPrint: true, drawer: true, scale: false, printers: [] };
  const m = reconcile(emptyMeta(), { v: "v", device, openShift: null, catalog: null, agent }, 0);
  assert.equal(m.agent?.url, agent.url);
  assert.equal(reconcile(m, { v: "v", device, openShift: null, catalog: null, agent: null }, 0).agent, null);
});
