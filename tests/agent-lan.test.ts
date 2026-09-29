// tests/agent-lan.test.ts — ajan LAN yolları: bilet (Bearer / yalnız akışta ?ticket=), olay kabulü, SSE yayını.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHub } from "../agent/src/server";
import { signTicket } from "@/lib/agent/ticket";
import type { TabEvent } from "@/lib/core/tab";

const ORIGIN = "https://kasa.example";
const ev = (): TabEvent => ({ id: crypto.randomUUID(), tabId: crypto.randomUUID(), tableId: null, at: new Date().toISOString(), staffId: null, approvedBy: null, seq: null, ev: { type: "open" } as TabEvent["ev"] });

/** SSE'den ilk `n` veri partisini okur. */
async function readBatches(res: Response, n: number): Promise<{ id: string; data: TabEvent[] }[]> {
  const out: { id: string; data: TabEvent[] }[] = [];
  const reader = res.body!.getReader();
  let buf = "";
  while (out.length < n) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += new TextDecoder().decode(value);
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, i); buf = buf.slice(i + 2);
      const id = /^id: (.*)$/m.exec(block)?.[1], data = /^data: (.*)$/m.exec(block)?.[1];
      if (id && data) out.push({ id, data: JSON.parse(data) });
    }
  }
  await reader.cancel();
  return out;
}

test("LAN: bilet, olay kabulü, akış (geçmiş + canlı), Last-Event-ID", async () => {
  const hub = createHub({ hubKey: "hk", tenantId: "T", origin: ORIGIN, config: () => null, revoked: () => [], tabsFile: null });
  const srv = await hub.listenLocal(0);
  after(() => srv.close());
  const base = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;
  const ticket = await signTicket("hk", { t: "T", d: "dev-1", exp: Math.floor(Date.now() / 1000) + 60 });
  const post = (events: unknown, auth = `Bearer ${ticket}`) => fetch(`${base}/tabs/events`, { method: "POST", headers: { Authorization: auth, "Content-Type": "application/json" }, body: JSON.stringify({ events }) });

  assert.equal((await post([ev()], "")).status, 401);
  assert.equal((await fetch(`${base}/status?ticket=${ticket}`)).status, 401); // ?ticket= yalnız akışta
  assert.equal((await fetch(`${base}/tabs/stream`)).status, 401);
  assert.equal((await post([{ id: "x" }])).status, 400);
  assert.equal((await post(Array.from({ length: 201 }, ev))).status, 400);

  const [a, b] = [ev(), ev()];
  assert.deepEqual(await (await post([a, a])).json(), { accepted: 1 });
  const s1 = await fetch(`${base}/tabs/stream?ticket=${encodeURIComponent(ticket)}`);
  assert.equal(s1.headers.get("content-type"), "text/event-stream");
  const pending = readBatches(s1, 2);
  await new Promise((r) => setTimeout(r, 50));
  await post([b]);
  const got = await pending;
  assert.deepEqual(got.map((x) => [x.id, x.data.map((e) => e.id)]), [["1", [a.id]], ["2", [b.id]]]);

  const s2 = await fetch(`${base}/tabs/stream?ticket=${encodeURIComponent(ticket)}`, { headers: { "Last-Event-ID": "1" } });
  assert.deepEqual((await readBatches(s2, 1))[0].data.map((e) => e.id), [b.id]);
  const s3 = await fetch(`${base}/tabs/stream?after=99&ticket=${encodeURIComponent(ticket)}`); // ajan sıfırlanmış → baştan
  assert.equal((await readBatches(s3, 1))[0].id, "2");

  const st = await (await fetch(`${base}/status`, { headers: { Authorization: `Bearer ${ticket}` } })).json();
  assert.equal(st.tabs.buffered, 2);
});
