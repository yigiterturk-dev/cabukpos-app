// tests/migros-contract.test.ts — Migros kimlik modu ve şartname kapısı.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { encodeConnectionCredentials, readConnectionCredentials } from "@/lib/platform/credentials";
import { createMigrosSource } from "@/lib/platform/migros";
import type { Conn } from "@/lib/platform/types";

process.env.AUTH_SECRET = "test-secret";

const conn = (): Conn => ({
  id: "migros-1",
  tenantId: "t1",
  storeId: "s1",
  platform: "migros",
  credentials: encodeConnectionCredentials({ mode: "migros", base: "https://migros.test", chainId: "4730", restaurantId: "23000000212248", apiKey: "key" }),
  webhookSecret: "hook",
  webhookToken: "webhook-token-0123456789abcd",
  autoAccept: true,
  active: true,
});

test("Migros üçlü kimliği çözülür", () => {
  const c = readConnectionCredentials(conn());
  assert.equal(c?.mode, "migros");
  if (c?.mode === "migros") {
    assert.equal(c.chainId, "4730");
    assert.equal(c.restaurantId, "23000000212248");
  }
});

test("Migros şartnamesi gelmeden canlı istek atmaz", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (() => { calls++; throw new Error("ağ çağrısı olmamalıydı"); }) as typeof fetch;
  try {
    await assert.rejects(createMigrosSource(true).accept(conn(), "o1", 5), /şartnamesi bekliyor/);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
  }
});

after(() => { delete process.env.AUTH_SECRET; });
