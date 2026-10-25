import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePlan, planAt, planLocal, planMinutes, planWeekStart, planDayOffset } from "@/lib/core/staff-plan";
const now = Date.parse("2026-10-25T12:00:00+03:00");
const valid = { id: "8dc431bc-1234-4123-a123-012345678901", staffId: "8dc431bc-1234-4123-a123-012345678902", revision: "", kind: "vardiya", title: "Akşam vardiyası", startsAt: "2026-10-26T22:00", endsAt: "2026-10-27T06:00", breakMinutes: "30", note: "Kapanış" };
test("gece vardiyası ve Türkiye saati doğru çözümlenir; mola çalışma süresinden düşer", () => {
  const r = parsePlan(valid, now);
  assert.ok(!("error" in r));
  assert.equal(r.startsAt.toISOString(), "2026-10-26T19:00:00.000Z");
  assert.equal(planMinutes(r.startsAt, r.endsAt, r.breakMinutes), 450);
  assert.equal(planLocal(r.endsAt), valid.endsAt);
});
test("bozuk takvim, ters/uzun aralık, geçersiz mola ve revision reddedilir", () => {
  for (const patch of [{ startsAt: "2026-02-31T10:00" }, { startsAt: "2026-10-26T24:00" }, { endsAt: valid.startsAt }, { endsAt: "2026-10-28T06:00" }, { breakMinutes: "480" }, { breakMinutes: "-1" }, { breakMinutes: "3.5" }, { revision: "NaN" }, { kind: "maas" }, { note: "x".repeat(1001) }]) assert.ok("error" in parsePlan({ ...valid, ...patch }, now), JSON.stringify(patch));
  assert.equal(planAt("2026-02-31T10:00"), null);
});
test("görev molası sıfırdır ve görev aralığı sınırlıdır", () => {
  const r = parsePlan({ ...valid, kind: "gorev", endsAt: "2026-11-01T12:00" }, now);
  assert.ok(!("error" in r)); assert.equal(r.breakMinutes, 0);
  assert.ok("error" in parsePlan({ ...valid, kind: "gorev", endsAt: "2026-12-01T12:00" }, now));
});
test("hafta pazartesiden başlar ve yıl sınırını geçebilir", () => {
  assert.equal(planWeekStart("2026-10-25"), "2026-10-19");
  assert.equal(planWeekStart("2027-01-01"), "2026-12-28");
  assert.equal(planDayOffset("2026-12-28", 7), "2027-01-04");
});
