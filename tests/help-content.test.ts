import { test } from "node:test";
import assert from "node:assert/strict";
import { HELP_BY_ID } from "@/lib/help";

test("yardım merkezi mali belge ile bilgi fişini karıştırmaz", () => {
  const fiscal = HELP_BY_ID.mali;
  const kasa = HELP_BY_ID.kasa;
  const all = [...fiscal.steps, fiscal.tip ?? "", ...kasa.steps].join(" ");
  assert.match(all, /bilgi fişi.*mali belge değildir/i);
  assert.match(all, /gerçek entegratör/i);
  assert.match(all, /production.*kapalı/i);
});
