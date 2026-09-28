// tests/agent-server.test.ts — ajan HTTP API'si: sahte TCP yazıcı + sahte TCP terazi ile.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { createHub } from "../agent/src/server";
import { signTicket } from "@/lib/agent/ticket";
import { toBase64 } from "@/lib/core/escpos";
import type { AgentConfig } from "@/lib/agent/config";

const ORIGIN = "https://kasa.example";
const listen = (s: net.Server) => new Promise<number>((r) => s.listen(0, "127.0.0.1", () => r((s.address() as net.AddressInfo).port)));

// Sahte yazıcı: gelen baytları biriktirir; `down` iken bağlantıyı reddeder (sunucu kapalı).
function fakePrinter() {
  const got: Buffer[] = [];
  let server = net.createServer((c) => { const parts: Buffer[] = []; c.on("data", (d) => parts.push(d)); c.on("end", () => got.push(Buffer.concat(parts))); });
  let port = 0;
  return {
    got,
    start: async () => { port = await listen(server); return port; },
    down: () => new Promise<void>((r) => server.close(() => r())),
    up: async () => { server = net.createServer((c) => { const parts: Buffer[] = []; c.on("data", (d) => parts.push(d)); c.on("end", () => got.push(Buffer.concat(parts))); }); await new Promise<void>((r) => server.listen(port, "127.0.0.1", () => r())); },
    close: () => server.close(),
  };
}

test("ajan: bilet, yazdırma, kuyruk, çekmece, terazi", async () => {
  const printer = fakePrinter();
  const pport = await printer.start();
  const scale = net.createServer((c) => c.on("data", (d) => { if (d[0] === 0x05) c.write("ST,GS,+  0.750kg\r\n"); }));
  const sport = await listen(scale);
  const config: AgentConfig = {
    printers: [{ id: "p1", name: "Kasa", role: "fis", transport: "ag", address: `127.0.0.1:${pport}`, width: 80, codepage: "pc857", drawer: true }],
    scale: { kind: "tcp", host: "127.0.0.1", port: sport, request: "enq" },
    autoPrint: true,
  };
  const revoked: string[] = [];
  const hub = createHub({ hubKey: "hk", tenantId: "T", origin: ORIGIN, config: () => config, revoked: () => revoked });
  const srv = await hub.listenLocal(0);
  after(() => { srv.close(); printer.close(); scale.close(); });
  const base = `http://127.0.0.1:${(srv.address() as net.AddressInfo).port}`;
  const ticket = await signTicket("hk", { d: "D1", t: "T", exp: Math.floor(Date.now() / 1000) + 60 });
  const call = (path: string, body?: unknown, tk = ticket, origin = ORIGIN) =>
    fetch(base + path, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${tk}`, Origin: origin, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

  // Ön uçuş: özel ağ izni
  const pre = await fetch(base + "/print", { method: "OPTIONS", headers: { Origin: ORIGIN, "Access-Control-Request-Private-Network": "true" } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("access-control-allow-private-network"), "true");
  assert.equal((await call("/status", undefined, ticket, "https://kotu.example")).status, 403);
  assert.equal((await call("/status", undefined, "bozuk")).status, 401);
  assert.equal((await call("/status", undefined, await signTicket("hk", { d: "D1", t: "BASKA", exp: 9e9 }))).status, 401);

  const st = await (await call("/status")).json();
  assert.equal(st.printers[0].id, "p1");
  assert.equal(st.scale, true);

  const r = await (await call("/print", { data: toBase64(Uint8Array.of(0x1b, 0x40, 0x41)), drawer: true })).json();
  assert.equal(r.ok, true);
  assert.deepEqual([...printer.got.at(-1)!], [0x1b, 0x70, 0x00, 0x19, 0xfa, 0x1b, 0x40, 0x41]);

  assert.deepEqual(await (await call("/scale")).json(), { grams: 750, stable: true });

  // Yazıcı kapalı: iş failed'e düşer (3 deneme ~4 sn), satış akışı bundan etkilenmez; açılınca retry.
  await printer.down();
  const bad = await (await call("/print", { data: toBase64(Uint8Array.of(0x42)) })).json();
  assert.equal(bad.ok, false);
  assert.match(bad.error, /ECONNREFUSED/);
  const st2 = await (await call("/status")).json();
  assert.equal(st2.printers[0].ok, false);
  assert.equal(st2.failed.length, 1);
  await printer.up();
  const again = await (await call("/print/retry", { jobId: bad.jobId })).json();
  assert.equal(again.ok, true);
  assert.deepEqual([...printer.got.at(-1)!], [0x42]);
  assert.equal((await (await call("/status")).json()).failed.length, 0);

  assert.equal((await (await call("/drawer", {})).json()).ok, true);
  assert.deepEqual([...printer.got.at(-1)!], [0x1b, 0x70, 0x00, 0x19, 0xfa]);

  revoked.push("D1");
  assert.equal((await call("/status")).status, 401);
});
