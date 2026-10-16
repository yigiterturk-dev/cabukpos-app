// tests/renewal-db.test.ts — #11: kart kasası + otomatik yenileme (fake sağlayıcı) + kart silme.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, randomBytes, scryptSync } from "node:crypto";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
process.env.BILLING_PROVIDER = "fake";
process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-secret-renewal";
process.env.PLAN_PRICE_AYLIK = process.env.PLAN_PRICE_AYLIK || "29900";
const { getDb, closeDb, schema } = await import("@/db");
const { eq } = await import("drizzle-orm");
const { encryptCardToken, decryptCardToken, cardTokenNeedsUpgrade } = await import("@/lib/billing/card-vault");
const { renewDue, removeStoredCard, saveCardToken } = await import("@/lib/billing/renewal");

const made: string[] = [];
after(async () => {
  for (const id of made) await getDb().delete(schema.tenants).where(eq(schema.tenants.id, id));
  await closeDb();
});

async function tenantWith(name: string, paidUntilDays: number, card: string | null) {
  const [t] = await getDb().insert(schema.tenants).values({
    name, vertical: "market",
    paidUntil: new Date(Date.now() + paidUntilDays * 86_400_000),
    cardToken: card ? encryptCardToken(card) : null,
    cardMark: card ? "Visa •••• 4242" : null,
  }).returning();
  made.push(t.id);
  return t;
}

test("card-vault: roundtrip + bozuk girdi null", () => {
  const enc = encryptCardToken("tok_abc123")!;
  assert.ok(enc.startsWith("v2:"));
  assert.equal(decryptCardToken(enc), "tok_abc123");
  assert.equal(decryptCardToken("v1:kirpik:tag:ct"), null);
  assert.equal(decryptCardToken(null), null);
  assert.equal(cardTokenNeedsUpgrade(enc), false);
  assert.equal(cardTokenNeedsUpgrade("v1:x:y:z"), true);
  assert.equal(cardTokenNeedsUpgrade(null), false);
});

test("card-vault: v1 satırı yalnız AUTH_SECRET_PREVIOUS ile çözülür", () => {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", scryptSync("eski-secret", "cabukpos-card-token", 32), iv);
  const ct = Buffer.concat([c.update("tok_eski", "utf8"), c.final()]);
  const v1 = `v1:${iv.toString("base64url")}:${c.getAuthTag().toString("base64url")}:${ct.toString("base64url")}`;
  assert.equal(decryptCardToken(v1), null);
  process.env.AUTH_SECRET_PREVIOUS = "eski-secret";
  try {
    assert.equal(decryptCardToken(v1), "tok_eski");
  } finally {
    delete process.env.AUTH_SECRET_PREVIOUS;
  }
});

test("renewDue: vadesi yakın kiracının aboneliği uzar, ikinci koşu dokunmaz", async () => {
  const t = await tenantWith("RENEW-OK", 2, "tok_ok");
  const before = t.paidUntil!.getTime();
  const r1 = await renewDue();
  assert.equal(r1.ok, 1);
  const [after1] = await getDb().select({ paidUntil: schema.tenants.paidUntil }).from(schema.tenants).where(eq(schema.tenants.id, t.id));
  assert.ok(after1.paidUntil!.getTime() > before);
  const r2 = await renewDue(); // vade artık 3 günden uzak → yeniden denemez
  assert.equal(r2.attempted, 0);
});

test("renewDue: bozuk kart jetonu atlanır; kart silme temizler", async () => {
  const t = await tenantWith("RENEW-BAD", 1, null);
  await getDb().update(schema.tenants).set({ cardToken: "v1:bozuk:bozuk:bozuk" }).where(eq(schema.tenants.id, t.id));
  const r = await renewDue();
  assert.equal(r.skipped >= 1, true);
  await removeStoredCard(t.id);
  const [row] = await getDb().select({ cardToken: schema.tenants.cardToken, cardMark: schema.tenants.cardMark }).from(schema.tenants).where(eq(schema.tenants.id, t.id));
  assert.equal(row.cardToken, null);
  assert.equal(row.cardMark, null);
});

test("saveCardToken: şifreli kaydeder", async () => {
  const t = await tenantWith("RENEW-SAVE", 10, null);
  assert.equal(await saveCardToken(t.id, "tok_yeni", "Mastercard •••• 1111"), true);
  const [row] = await getDb().select({ cardToken: schema.tenants.cardToken, cardMark: schema.tenants.cardMark }).from(schema.tenants).where(eq(schema.tenants.id, t.id));
  assert.equal(decryptCardToken(row.cardToken), "tok_yeni");
  assert.equal(row.cardMark, "Mastercard •••• 1111");
});

test("renewDue: v1 kart satırı okumada v2'ye yükseltilir", async () => {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", scryptSync("eski-secret", "cabukpos-card-token", 32), iv);
  const ct = Buffer.concat([c.update("tok_v1_migrate", "utf8"), c.final()]);
  const v1 = `v1:${iv.toString("base64url")}:${c.getAuthTag().toString("base64url")}:${ct.toString("base64url")}`;
  const t = await tenantWith("RENEW-V1MIG", 1, null);
  await getDb().update(schema.tenants).set({ cardToken: v1 }).where(eq(schema.tenants.id, t.id));
  process.env.AUTH_SECRET_PREVIOUS = "eski-secret";
  try {
    const r = await renewDue();
    assert.equal(r.ok, 1);
    const [row] = await getDb().select({ cardToken: schema.tenants.cardToken }).from(schema.tenants).where(eq(schema.tenants.id, t.id));
    assert.ok(row.cardToken!.startsWith("v2:"));
    assert.equal(decryptCardToken(row.cardToken), "tok_v1_migrate"); // PREVIOUS olmadan da çözülür
    const r2 = await renewDue(); // artık v2 — ikinci koşu denemez
    assert.equal(r2.attempted, 0);
  } finally {
    delete process.env.AUTH_SECRET_PREVIOUS;
  }
});
