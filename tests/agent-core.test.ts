// tests/agent-core.test.ts — terazi çözümü, bilet, yazdırma kuyruğu
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScale } from "../agent/src/scale";
import { createQueue } from "../agent/src/queue";
import { signTicket, verifyTicket } from "@/lib/agent/ticket";

test("terazi: yaygın biçimler", () => {
  assert.deepEqual(parseScale("ST,GS,+  0.750kg\r\n"), { grams: 750, stable: true });
  assert.deepEqual(parseScale("  1.234 kg"), { grams: 1234, stable: true });
  assert.deepEqual(parseScale("750 g"), { grams: 750, stable: true });
  assert.deepEqual(parseScale("US,GS,+  0.752kg"), { grams: 752, stable: false });
  assert.deepEqual(parseScale(Uint8Array.from([0x02, ...Buffer.from("0,500"), 0x03])), { grams: 500, stable: true });
  assert.equal(parseScale("ERR"), null);
  assert.equal(parseScale("-0.100kg"), null);
});

test("bilet: imza, süre, anahtar", async () => {
  const t = await signTicket("anahtar-1", { d: "dev", t: "ten", exp: 2000 });
  assert.deepEqual(await verifyTicket("anahtar-1", t, 1000), { d: "dev", t: "ten", exp: 2000 });
  assert.equal(await verifyTicket("anahtar-1", t, 2001), null);
  assert.equal(await verifyTicket("anahtar-2", t, 1000), null);
  const [b, s] = t.split(".");
  const forged = Buffer.from(JSON.stringify({ d: "x", t: "ten", exp: 9e9 })).toString("base64url");
  assert.equal(await verifyTicket("anahtar-1", `${forged}.${s}`, 1000), null);
  assert.equal(await verifyTicket("anahtar-1", `${b}`, 1000), null);
  assert.equal(await verifyTicket("anahtar-1", "çöp.çöp", 1000), null);
});

test("kuyruk: deneme, failed, retry, sıra", async () => {
  let fails = 2;
  const got: string[] = [];
  const q = createQueue(async (p, d) => { if (fails-- > 0) throw new Error("kapalı"); got.push(`${p}:${d[0]}`); }, { delays: [1, 1, 1] });
  assert.equal(await q.enqueue("fis", Uint8Array.of(1)).done, true);
  assert.equal(await q.enqueue("fis", Uint8Array.of(2)).done, true);
  assert.deepEqual(got, ["fis:1", "fis:2"]);
  fails = 5;
  const j = q.enqueue("fis", Uint8Array.of(3));
  assert.equal(await j.done, false);
  assert.equal(q.failed().length, 1);
  assert.equal(q.failed()[0].error, "kapalı");
  fails = 0;
  assert.equal(await q.retry(j.id)!.done, true);
  assert.equal(q.failed().length, 0);
  assert.deepEqual(got.at(-1), "fis:3");
});
