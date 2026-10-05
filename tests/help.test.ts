// tests/help.test.ts — #60: yardım merkezi içeriğinin bütünlüğü.
import { test } from "node:test";
import assert from "node:assert/strict";
import { HELP_TOPICS, HELP_BY_ID, type HelpIcon } from "@/lib/help";

const ICONS: HelpIcon[] = ["baslangic", "kasa", "cevrimdisi", "restoran", "market", "donanim", "mali", "rapor", "abonelik", "guvenlik"];

test("yardım başlıkları: kimlikler benzersiz ve ikonlar tanımlı", () => {
  const ids = HELP_TOPICS.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, "yinelenen başlık kimliği");
  for (const t of HELP_TOPICS) {
    assert.ok(ICONS.includes(t.icon), `${t.id}: bilinmeyen ikon ${t.icon}`);
    assert.ok(t.title.length > 0 && t.summary.length > 0, `${t.id}: başlık/özet boş`);
    assert.ok(t.steps.length >= 3, `${t.id}: en az 3 adım beklenir`);
    assert.ok(t.steps.every((s) => s.trim().length > 10), `${t.id}: çok kısa adım`);
  }
  assert.equal(Object.keys(HELP_BY_ID).length, ids.length);
});
