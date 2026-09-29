// tests/agent-tabs.test.ts — ajan adisyon arabelleği: tekilleştirme, lanSeq, disk, 24 saat.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createTabBuffer, validEvent } from "../agent/src/tabs";
import type { TabEvent } from "@/lib/core/tab";

const ev = (at = new Date().toISOString(), seq: number | null = 7): TabEvent => ({ id: crypto.randomUUID(), tabId: crypto.randomUUID(), tableId: null, at, staffId: null, approvedBy: null, seq, ev: { type: "open" } as TabEvent["ev"] });

test("accept: yeni olana artan lanSeq, tekrar atlanır, seq null'a çekilir", () => {
  const b = createTabBuffer(null);
  const [a, c] = [ev(), ev()];
  assert.deepEqual(b.accept([a, c]).map((e) => e.lanSeq), [1, 2]);
  assert.equal(b.accept([a]).length, 0);
  assert.equal(b.after(0)[0].event.seq, null);
  assert.deepEqual(b.after(1).map((e) => e.event.id), [c.id]);
  assert.equal(b.lastSeq(), 2);
});

test("disk: yeni örnek aynı olayları aynı lanSeq ile yükler; 24 saatten eski atılır, sayaç geri gitmez", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tabs-")), "tabs.jsonl");
  let now = Date.now();
  const b = createTabBuffer(file, () => now);
  const old = ev(new Date(now - 25 * 3600_000).toISOString());
  const yeni = ev();
  b.accept([old, yeni]);
  const b2 = createTabBuffer(file, () => now);
  assert.deepEqual(b2.after(0).map((e) => [e.lanSeq, e.event.id]), [[2, yeni.id]]);
  assert.equal(b2.lastSeq(), 2);
  assert.equal(b2.accept([ev()])[0].lanSeq, 3);
  now += 25 * 3600_000;
  b2.compact();
  assert.equal(b2.size(), 0);
  assert.equal(fs.readFileSync(file, "utf8"), "");
});

test("validEvent", () => {
  assert.equal(validEvent(ev()), true);
  assert.equal(validEvent({ ...ev(), id: "x" }), false);
  assert.equal(validEvent({ ...ev(), at: "dün" }), false);
  assert.equal(validEvent({ ...ev(), ev: null }), false);
  assert.equal(validEvent(null), false);
});
