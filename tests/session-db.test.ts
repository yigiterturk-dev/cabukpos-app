// tests/session-db.test.ts — #9: oturum listesi + cihaz bazlı düşme (DB).
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
process.env.MIGRATE_DATABASE_URL = "postgres://yigiterturk@localhost:5432/cabukpos_test";
const { getDb, closeDb, schema } = await import("@/db");
const { listSessions, revokeSessionsExcept, revokeAllSessions, uaLabel, sonGorulme } = await import("@/lib/auth/sessions");
const { eq } = await import("drizzle-orm");

const [t] = await getDb().insert(schema.tenants).values({ name: "SES-T", vertical: "market" }).returning();
const [u] = await getDb().insert(schema.users).values({ tenantId: t.id, email: "ses-test@cabukpos.test", name: "Ses Test", passwordHash: "x" }).returning();
const ins = (tokenHash: string, ua: string | null = null) => getDb().insert(schema.sessions).values({ userId: u.id, tenantId: t.id, tokenHash, ua }).returning({ id: schema.sessions.id });
const s1 = (await ins("hash-1", "Mozilla/5.0 (Windows NT 10.0) Chrome/126.0"))[0];
const s2 = (await ins("hash-2", "Mozilla/5.0 (iPhone) Safari/605"))[0];
const s3 = (await ins("hash-3", null))[0];

after(async () => {
  await getDb().delete(schema.sessions).where(eq(schema.sessions.tenantId, t.id));
  await getDb().delete(schema.users).where(eq(schema.users.id, u.id));
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t.id));
  await closeDb();
});

test("aktif oturumlar listelenir; yalnız eşleşen hash 'bu cihaz'", async () => {
  const rows = await listSessions(u.id, "hash-2");
  assert.equal(rows.length, 3);
  assert.equal(rows.filter((r) => r.current).length, 1);
  const s2row = rows.find((r) => r.id === s2.id)!;
  assert.equal(s2row.current, true);
  assert.equal(rows.find((r) => r.id === s1.id)!.ua, "Mozilla/5.0 (Windows NT 10.0) Chrome/126.0");
  assert.equal(uaLabel(rows.find((r) => r.id === s3.id)!.ua), "Bilinmeyen cihaz");
  assert.ok(s2row.ip === null);
});

test("diğer cihazlar düşer; kalan hash dokunulmaz, iptal sayımı doğru", async () => {
  const n = await revokeSessionsExcept(u.id, "hash-1");
  assert.equal(n, 2);
  const kalan = await listSessions(u.id, "hash-1");
  assert.deepEqual(kalan.map((r) => r.id), [s1.id]);
  assert.equal(await revokeSessionsExcept(u.id, "hash-1"), 0); // zaten kapalılar tekrar sayılmaz
});

test("tümünden çıkış: kalan oturum da düşer", async () => {
  assert.equal(await revokeAllSessions(u.id), 1);
  assert.equal((await listSessions(u.id, "hash-1")).length, 0);
});

test("ua etiketi ve göreli zaman", () => {
  assert.equal(uaLabel("Mozilla/5.0 (Windows NT 10.0; Win64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"), "Chrome · Windows");
  assert.equal(uaLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17) Version/17.0 Mobile Safari/604.1"), "Safari · iOS");
  assert.equal(uaLabel("Mozilla/5.0 (Macintosh) Firefox/128.0"), "Firefox · macOS");
  assert.equal(uaLabel("Edg/126.0 Windows"), "Edge · Windows");
  assert.equal(uaLabel(null), "Bilinmeyen cihaz");
  const now = Date.now();
  assert.equal(sonGorulme(new Date(now - 30_000), now), "şimdi");
  assert.equal(sonGorulme(new Date(now - 5 * 60_000), now), "5 dk önce");
  assert.equal(sonGorulme(new Date(now - 3 * 3600_000), now), "3 sa önce");
  assert.equal(sonGorulme(new Date(now - 2 * 86400_000), now), "2 gün önce");
});
