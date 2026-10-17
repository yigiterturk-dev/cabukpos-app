import { test } from "node:test";
import assert from "node:assert/strict";
import { timeToAt } from "@/lib/core/reservation";

test("rezervasyon saati sadece geçerli takvim gününe bağlanır", () => {
  assert.equal(timeToAt("2026-02-30", "19:30"), null);
  assert.equal(timeToAt("2025-02-29", "19:30"), null);
  assert.equal(timeToAt("2024-02-29", "19:30")?.toISOString(), "2024-02-29T16:30:00.000Z");
});
