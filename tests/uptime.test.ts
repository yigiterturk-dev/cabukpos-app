import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTargets, runUptimeChecks } from "@/lib/observability/uptime";

test("uptime: parseTargets yalnız http(s) adresleri alır", () => {
  assert.deepEqual(parseTargets("https://a.com , http://b.com/x, ftp://c.com, , tofur"), ["https://a.com", "http://b.com/x"]);
  assert.deepEqual(parseTargets(undefined), []);
  assert.deepEqual(parseTargets(""), []);
});

test("uptime: sağlıklı self + hedefler ok=true döner", async () => {
  const fetchImpl = (async () => new Response(null, { status: 200 })) as typeof fetch;
  const summary = await runUptimeChecks({ self: async () => true, targets: ["https://a.com"], fetchImpl });
  assert.equal(summary.ok, true);
  assert.equal(summary.self, true);
  assert.equal(summary.results[0].status, 200);
});

test("uptime: self düşerse ok=false olur", async () => {
  const fetchImpl = (async () => new Response(null, { status: 200 })) as typeof fetch;
  const summary = await runUptimeChecks({ self: async () => false, targets: [], fetchImpl });
  assert.equal(summary.ok, false);
  assert.equal(summary.self, false);
});

test("uptime: self fırlatma güvenli şekilde false sayılır", async () => {
  const summary = await runUptimeChecks({ self: async () => { throw new Error("db yok"); }, targets: [], fetchImpl: (async () => new Response(null, { status: 200 })) as typeof fetch });
  assert.equal(summary.ok, false);
});

test("uptime: hedef 500 + timeout iki ayrı arıza kaydı üretir", async () => {
  let n = 0;
  const fetchImpl = (async (input: string) => {
    n += 1;
    if (input === "https://bes.yuz") return new Response(null, { status: 500 });
    throw new Error("aşım");
  }) as typeof fetch;
  const summary = await runUptimeChecks({ self: async () => true, targets: ["https://bes.yuz", "https://asim"], fetchImpl, timeoutMs: 10 });
  assert.equal(summary.ok, false);
  assert.equal(summary.results[0].ok, false);
  assert.equal(summary.results[0].status, 500);
  assert.equal(summary.results[1].ok, false);
  assert.match(String(summary.results[1].error), /aşım/);
  assert.ok(n === 2);
});
