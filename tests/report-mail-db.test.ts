// tests/report-mail-db.test.ts — #41 DB: ayar satırı, vakit gelme sorgusu, gönderim damgası.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { eq } = await import("drizzle-orm");
const { dueReportTenants, sendReportMail, digestRange } = await import("@/lib/admin/report-mail");

const made: string[] = [];
after(async () => {
  for (const id of made) await getDb().delete(schema.tenants).where(eq(schema.tenants.id, id));
  await closeDb();
});

test("rapor posta: posta yoksa 'mail' der; ayar satırı ve damga sorgusu durumu doğru taşır", async () => {
  const [t] = await getDb().insert(schema.tenants).values({ name: "RPR", vertical: "restoran" }).returning();
  made.push(t.id);
  // Posta yapılandırılmamış (RESEND_API_KEY yok) → ayar ne olursa olsun 'mail' kapısı
  assert.deepEqual(await sendReportMail(t.id, "gunluk"), { ok: false, skipped: "mail" });
  await withTenant(t.id, (tx) => tx.insert(schema.reportSettings).values({ tenantId: t.id }));
  assert.deepEqual(await sendReportMail(t.id, "gunluk"), { ok: false, skipped: "mail" });
  await withTenant(t.id, (tx) => tx.update(schema.reportSettings).set({ daily: true }).where(eq(schema.reportSettings.tenantId, t.id)));
  assert.deepEqual(await sendReportMail(t.id, "gunluk"), { ok: false, skipped: "mail" });
  // Ayar açık, damga yok → cron sorgusu kiracıyı verir
  const ids = await dueReportTenants("gunluk");
  assert.ok(ids.includes(t.id));
  const [st] = await withTenant(t.id, (tx) => tx.select().from(schema.reportSettings));
  assert.equal(st.lastDailyAt, null); // gönderilemedi → damga yok → yarın yeniden denenir
  assert.ok(ids.length <= 100);
});

test("digestRange: dün tek gün; haftalık pazartesi başlar", () => {
  const r = digestRange("gunluk", Date.parse("2026-10-03T12:00:00+03:00"));
  assert.equal(r.bas, "2026-10-02");
  const w = digestRange("haftalik", Date.parse("2026-10-03T12:00:00+03:00"));
  assert.equal(w.bas, "2026-09-21");
  assert.equal(w.bit, "2026-09-27");
});
