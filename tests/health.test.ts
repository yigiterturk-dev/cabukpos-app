import { test } from "node:test";
import assert from "node:assert/strict";
import { GET } from "@/app/api/health/route";

test("health: veritabanına ihtiyaç duymadan liveness döner", async () => {
  const response = await GET();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: "cabukpos" });
  assert.equal(response.headers.get("cache-control"), "no-store");
});
