# ÇabukPOS M9c — Ajans izinli okuma — Uygulama planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. (Yiğit kuralı: ajan yok → inline.)

**Goal:** İşletme sahibi ÇabukPOS'ta salt okunur ajans anahtarı üretir; ajans paneli (restoran-zirve) bu anahtarla günlük sipariş/ciro/iade özetini çeker.

**Architecture:** ÇabukPOS'a RLS dışı `integration_keys` tablosu + `GET /api/v1/stats/daily` (Bearer anahtar → kiracı → `withTenant` içinde M9a tarzı sorgu → saf `dailyStats`). Yönetim → Entegrasyonlar'da üret/iptal. Ajans panelinde yeni `cabukpos` PlatformClient'ı mevcut senkron + `order_stats` hattına oturur.

**Tech Stack:** Next.js 16 (app router, server actions), Drizzle + Postgres (Neon), node:test, playwright-core E2E.

Spec: `docs/superpowers/specs/2026-09-29-cabukpos-m9c-ajans-okuma-design.md`

## Global Constraints

- Dal: `m9c-ajans` (cabukpos-app, main üstünde). restoran-zirve: doğrudan `main` (tek kişilik depo, canlı değil).
- Commit yazarı r.y.erturk@gmail.com; AI footer yok (mesajda yalnız oturumun Co-Authored-By/Claude-Session satırları).
- Tutarlar DB'de kuruş tamsayı; API'de TL (`kurus / 100`).
- Gün = `Europe/Istanbul` (+03:00) takvim günü.
- Platform kanalı (`sales.channel = 'platform'`) ve onun iadeleri hariç.
- API aralığı en fazla 92 gün; anahtar başına dakikada 60 istek.
- Anahtar biçimi `cpk_` + base64url(32 bayt); DB'de yalnız sha256 hex.
- Anahtar oluşturma/iptal yalnız `role = "sahip"`; oluşturma `requireWriter`, iptal `requireAdmin`.
- Testler: `npm test` (cabukpos DB testleri yerel `cabukpos_test`; şema değişince önce `npm run db:push:test`).
- Prod komutlarını Yiğit `!` ile TEK TEK çalıştırır; sıra: şema → rls → kontrol → main → canlı E2E.

## Dosya haritası

cabukpos-app:
- Modify `lib/core/report.ts` — `DailyRow`, `DailyStat`, `dailyStats()`, `apiRange()`, `API_MAX_DAYS`
- Modify `lib/admin/report.ts` — `dailyStatsData(tx, r)`
- Modify `db/schema.ts` — `integrationKeys`
- Create `lib/integrations/keys.ts` — üret/listele/iptal/bul
- Create `app/api/v1/stats/daily/route.ts` — uç
- Create `lib/admin/integration-actions.ts` — server action'lar
- Create `components/admin/IntegrationKeyForm.tsx` — form + tek seferlik anahtar kutusu
- Create `app/yonetim/entegrasyonlar/page.tsx`
- Modify `app/yonetim/Nav.tsx`
- Create `tests/daily-stats.test.ts`, `tests/integration-db.test.ts`, `e2e/m9c.mjs`
- Modify `docs/PROGRESS.md`, `scripts/prod-push.sh` (git exclude'da)

restoran-zirve:
- Modify `lib/platforms/labels.ts`, `lib/platforms/index.ts`, `db/schema.ts`
- Create `lib/platforms/cabukpos/index.ts`, `tests/cabukpos.test.ts`

---

### Task 1: Saf günlük özet + API aralığı

**Files:**
- Modify: `lib/core/report.ts` (dosya sonuna ekle)
- Test: `tests/daily-stats.test.ts`

**Interfaces:**
- Produces:
  - `type DailyRow = { status: "kapandi" | "iade"; channel: "kasa" | "masa" | "paket" | "platform"; total: Kurus; tabId: string | null; at: Date }`
  - `type DailyStat = { day: string; orderCount: number; cancelledCount: number; grossRevenue: number; channels: { masa: number; paket: number; kasa: number } }`
  - `dailyStats(rows: DailyRow[]): DailyStat[]` — güne göre artan sıralı
  - `API_MAX_DAYS = 92`; `apiRange(from: string | null, to: string | null): Range | null`

- [ ] **Step 1: Failing test yaz** — `tests/daily-stats.test.ts`

```ts
// tests/daily-stats.test.ts — M9c saf hesap: ajans API'sinin günlük özeti ve aralık doğrulaması.
import { test } from "node:test";
import assert from "node:assert/strict";
import { apiRange, dailyStats, type DailyRow } from "@/lib/core/report";

const at = (iso: string) => new Date(iso);
const row = (p: Partial<DailyRow>): DailyRow => ({ status: "kapandi", channel: "kasa", total: 10000, tabId: null, at: at("2026-09-28T12:00:00+03:00"), ...p });

test("bölünmüş adisyon tek sipariş, tutarlar toplanır; kanal kırılımı orderCount'a eşit", () => {
  const d = dailyStats([
    row({ channel: "masa", tabId: "t1", total: 6000 }),
    row({ channel: "masa", tabId: "t1", total: 4000 }),
    row({ channel: "paket", tabId: "t2", total: 5000 }),
    row({ channel: "kasa", total: 2500 }),
  ]);
  assert.deepEqual(d, [{ day: "2026-09-28", orderCount: 3, cancelledCount: 0, grossRevenue: 175, channels: { masa: 1, paket: 1, kasa: 1 } }]);
});

test("iade ciroyu düşer, iptal sayılır, sipariş sayısına girmez", () => {
  const [d] = dailyStats([row({ total: 10000 }), row({ status: "iade", total: 2500 })]);
  assert.equal(d.orderCount, 1);
  assert.equal(d.cancelledCount, 1);
  assert.equal(d.grossRevenue, 75);
});

test("platform satışı ve iadesi hariç; yalnız platform olan gün hiç çıkmaz", () => {
  assert.deepEqual(dailyStats([row({ channel: "platform", tabId: "p1" }), row({ channel: "platform", status: "iade" })]), []);
});

test("İstanbul gün sınırı: 23:30 +03 aynı gün, 00:10 +03 ertesi gün; sıralı", () => {
  const d = dailyStats([row({ at: at("2026-09-28T21:10:00Z") }), row({ at: at("2026-09-28T20:30:00Z") })]);
  assert.deepEqual(d.map((x) => x.day), ["2026-09-28", "2026-09-29"]);
});

test("kuruş → TL", () => {
  assert.equal(dailyStats([row({ total: 1234567 })])[0].grossRevenue, 12345.67);
});

test("apiRange: geçerli, ters, 92 gün sınırı, bozuk", () => {
  assert.deepEqual(apiRange("2026-09-01", "2026-09-28"), { bas: "2026-09-01", bit: "2026-09-28" });
  assert.equal(apiRange("2026-09-28", "2026-09-01"), null);
  assert.deepEqual(apiRange("2026-07-01", "2026-09-30"), { bas: "2026-07-01", bit: "2026-09-30" }); // 92 gün
  assert.equal(apiRange("2026-06-30", "2026-09-30"), null); // 93 gün
  assert.equal(apiRange("2026-13-01", "2026-09-30"), null);
  assert.equal(apiRange(null, "2026-09-30"), null);
});
```

- [ ] **Step 2: Çalıştır, kırmızı gör**

Run: `node --import ./tests/ts-resolve.mjs --test tests/daily-stats.test.ts 2>&1 | tail -5`
Expected: FAIL — `dailyStats`/`apiRange` export yok.

- [ ] **Step 3: Uygula** — `lib/core/report.ts` sonuna:

```ts
// — M9c: ajans API'si günlük özeti. Platform satışı (ve iadesi) hariç: ajans onu platform bağlantısından alıyor. —
export const API_MAX_DAYS = 92;
/** Katı doğrulama (parseRange gibi düzeltmez): bozuk, ters ya da 92 günden uzun → null. */
export function apiRange(from: string | null, to: string | null): Range | null {
  if (!validDay(from ?? undefined) || !validDay(to ?? undefined) || from! > to!) return null;
  const r = { bas: from!, bit: to! };
  return dayCount(r) > API_MAX_DAYS ? null : r;
}

export type DailyRow = { status: "kapandi" | "iade"; channel: SaleRow["channel"]; total: Kurus; tabId: string | null; at: Date };
export type DailyStat = { day: string; orderCount: number; cancelledCount: number; grossRevenue: number; channels: { masa: number; paket: number; kasa: number } };
const istDay = (d: Date) => new Date(d.getTime() + IST).toISOString().slice(0, 10);

/** Adisyon parçaları (hesap bölme) aynı gün tek sipariş; iade ciroyu düşer ve iptal sayılır. */
export function dailyStats(rows: DailyRow[]): DailyStat[] {
  const days = new Map<string, { gross: number; refunds: number; tabs: Set<string>; ch: DailyStat["channels"] }>();
  for (const x of rows) {
    if (x.channel === "platform") continue;
    const k = istDay(x.at);
    let d = days.get(k);
    if (!d) days.set(k, (d = { gross: 0, refunds: 0, tabs: new Set(), ch: { masa: 0, paket: 0, kasa: 0 } }));
    if (x.status === "iade") { d.gross -= x.total; d.refunds++; continue; }
    d.gross += x.total;
    if (x.tabId) { if (d.tabs.has(x.tabId)) continue; d.tabs.add(x.tabId); }
    d.ch[x.channel]++;
  }
  return [...days].sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, d]) => ({
    day, orderCount: d.ch.masa + d.ch.paket + d.ch.kasa, cancelledCount: d.refunds, grossRevenue: d.gross / 100, channels: d.ch,
  }));
}
```

- [ ] **Step 4: Yeşil gör**

Run: `node --import ./tests/ts-resolve.mjs --test tests/daily-stats.test.ts 2>&1 | tail -5`
Expected: `# pass 6`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add lib/core/report.ts tests/daily-stats.test.ts
git commit -m "M9c Görev 1: günlük özet (dailyStats) + katı API aralığı"
```

---

### Task 2: Anahtar tablosu, sorgu ve uç

**Files:**
- Modify: `db/schema.ts` (dosya sonuna)
- Create: `lib/integrations/keys.ts`
- Modify: `lib/admin/report.ts` (dosya sonuna `dailyStatsData`)
- Create: `app/api/v1/stats/daily/route.ts`
- Test: `tests/integration-db.test.ts`

**Interfaces:**
- Consumes: `dailyStats`, `apiRange`, `DailyRow` (Task 1); `sha256`, `newDeviceToken` (`lib/auth/tokens`); `hit` (`lib/ratelimit`); `withTenant`, `getDb`, `schema`, `Tx` (`@/db`).
- Produces:
  - `schema.integrationKeys`
  - `KEY_PREFIX = "cpk_"`; `createKey(tenantId: string, name: string): Promise<{ id: string; key: string }>`; `listKeys(tenantId: string): Promise<{ id; name; prefix; createdAt; lastUsedAt; revokedAt }[]>`; `revokeKey(tenantId: string, id: string): Promise<boolean>`; `findKey(key: string): Promise<{ id: string; tenantId: string; tenantName: string } | null>`; `keyFromRequest(req: Request)` (aynı dönüş)
  - `dailyStatsData(tx: Tx, r: Range): Promise<DailyStat[]>`
  - `GET /api/v1/stats/daily?from&to` → 200 `{ business: { name }, days: DailyStat[] }` | 400 `{ error: "invalid_range", maxDays: 92 }` | 401 `{ error: "unauthorized" }` | 429 `{ error: "rate_limited" }`

- [ ] **Step 1: Şema ekle** — `db/schema.ts` sonuna:

```ts
// — M9c: ajans erişim anahtarları. RLS yok (anahtar kiracı bilinmeden hash ile aranır, devices gibi); yalnız lib/integrations/keys erişir, her sorguda tenantId. —
export const integrationKeys = pgTable("integration_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  createdAt: ts("created_at").notNull().defaultNow(),
  lastUsedAt: ts("last_used_at"),
  revokedAt: ts("revoked_at"),
}, (t) => [index("integration_keys_tenant_idx").on(t.tenantId)]);
```

Run: `npm run db:push:test 2>&1 | tail -3`
Expected: `RLS uygulandı` (tablo oluştu; `grant ... on all tables` yeni tabloyu da kapsar).

- [ ] **Step 2: Failing test yaz** — `tests/integration-db.test.ts`

```ts
// tests/integration-db.test.ts — cabukpos_test, uygulama rolü. M9c: ajans anahtarı + günlük özet sorgusu + uç.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
process.env.MIGRATE_DATABASE_URL = "postgres://yigiterturk@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { applyDoc } = await import("@/lib/sync/apply");
const { createKey, findKey, listKeys, revokeKey } = await import("@/lib/integrations/keys");
const { dailyStatsData } = await import("@/lib/admin/report");
const { istToday } = await import("@/lib/core/report");
const { GET } = await import("@/app/api/v1/stats/daily/route");
const { eq, like } = await import("drizzle-orm");

const [t] = await getDb().insert(schema.tenants).values({ name: "M9C-T", vertical: "restoran" }).returning();
const [t2] = await getDb().insert(schema.tenants).values({ name: "M9C-T2", vertical: "restoran" }).returning();
const s = await withTenant(t.id, async (tx) => {
  const [store] = await tx.insert(schema.stores).values({ tenantId: t.id, name: "Merkez" }).returning();
  const [ali] = await tx.insert(schema.staff).values({ tenantId: t.id, name: "Ali", pinHash: "x" }).returning();
  const [mudur] = await tx.insert(schema.staff).values({ tenantId: t.id, name: "Müdür", role: "mudur", pinHash: "x" }).returning();
  const [doner] = await tx.insert(schema.products).values({ tenantId: t.id, name: "Döner", price: 18000, vatRate: 10 }).returning();
  return { store, ali, mudur, doner };
});
const [dev] = await getDb().insert(schema.devices).values({ tenantId: t.id, storeId: s.store.id, name: "Kasa 1", receiptPrefix: "C1" }).returning();
const ctx = { tenantId: t.id, storeId: s.store.id, deviceId: dev.id, receiptPrefix: "C1" };
const shiftId = crypto.randomUUID();
const at = new Date().toISOString();
const ok = async (doc: Record<string, unknown>) => assert.equal((await applyDoc(ctx, doc)).ok, true);
const line = { productId: s.doner.id, name: "Döner", unitPrice: 18000, vatRate: 10, qtyMilli: 1000 };
await ok({ kind: "shift_open", id: shiftId, staffId: s.ali.id, at, openingCash: 0 });
const kasaSale = crypto.randomUUID();
await ok({ kind: "sale", id: kasaSale, shiftId, staffId: s.ali.id, receiptSeq: 1, at, lines: [line], payments: [{ method: "kart", amount: 18000 }] });
// Masa adisyonu iki parça + platform satışı ve onun iadesi: doğrudan satır (adisyon kuralları tab-db testinde)
const vat = [{ rate: 10, gross: 9000, net: 8182, vat: 818 }];
const base = { tenantId: t.id, storeId: s.store.id, deviceId: dev.id, shiftId, staffId: s.ali.id, vat };
const tab = crypto.randomUUID(), platformSale = crypto.randomUUID();
await withTenant(t.id, (tx) => tx.insert(schema.sales).values([
  { ...base, id: crypto.randomUUID(), receiptNo: "C1-900001", channel: "masa", total: 9000, tabId: tab },
  { ...base, id: crypto.randomUUID(), receiptNo: "C1-900002", channel: "masa", total: 9000, tabId: tab },
  { ...base, id: platformSale, receiptNo: "C1-900003", channel: "platform", total: 30000, tabId: crypto.randomUUID() },
  { ...base, id: crypto.randomUUID(), receiptNo: "C1-900004", channel: "kasa", status: "iade", total: 30000, refundOf: platformSale },
]));
// Kasa satışının iadesi (sayılır)
await ok({ kind: "refund", id: crypto.randomUUID(), shiftId, staffId: s.ali.id, approvedBy: s.mudur.id, refundOf: kasaSale, receiptSeq: 2, at, lines: [line], payments: [{ method: "kart", amount: 18000 }] });
const today = istToday();

const call = (key: string | null, q = `from=${today}&to=${today}`) =>
  GET(new Request(`http://x/api/v1/stats/daily?${q}`, key ? { headers: { authorization: `Bearer ${key}` } } : {}));

after(async () => {
  await getDb().delete(schema.loginAttempts).where(like(schema.loginAttempts.key, "apikey:%"));
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t.id));
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t2.id));
  await closeDb();
});

test("dailyStatsData: masa parçaları tek sipariş, kasa iadesi düşer, platform ve iadesi hariç", async () => {
  const d = await withTenant(t.id, (tx) => dailyStatsData(tx, { bas: today, bit: today }));
  assert.deepEqual(d, [{ day: today, orderCount: 2, cancelledCount: 1, grossRevenue: 180, channels: { masa: 1, paket: 0, kasa: 1 } }]);
});

test("anahtar: üret → bul (son kullanım yazılır) → listede önek → iptal → bulunmaz", async () => {
  const k = await createKey(t.id, "Zirve Ajans");
  assert.match(k.key, /^cpk_[A-Za-z0-9_-]{43}$/);
  const f = await findKey(k.key);
  assert.deepEqual(f, { id: k.id, tenantId: t.id, tenantName: "M9C-T" });
  const [l] = await listKeys(t.id);
  assert.equal(l.prefix, k.key.slice(0, 8));
  assert.ok(l.lastUsedAt);
  assert.equal(await revokeKey(t2.id, k.id), false); // başka kiracı iptal edemez
  assert.equal(await revokeKey(t.id, k.id), true);
  assert.equal(await findKey(k.key), null);
  assert.equal(await findKey("cpk_yok"), null);
  assert.equal(await findKey("rastgele"), null);
});

test("uç: 401 / 400 / 200 ve kiracı ayrımı", async () => {
  assert.equal((await call(null)).status, 401);
  assert.equal((await call("cpk_uydurma")).status, 401);
  const k = await createKey(t.id, "Ajans");
  const k2 = await createKey(t2.id, "Başka ajans");
  assert.equal((await call(k.key, `from=${today}&to=2020-01-01`)).status, 400);
  const r = await call(k.key);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.business.name, "M9C-T");
  assert.equal(body.days[0].orderCount, 2);
  const r2 = await (await call(k2.key)).json();
  assert.deepEqual(r2, { business: { name: "M9C-T2" }, days: [] });
});

test("uç: anahtar başına dakikada 60 istek → 429", async () => {
  const k = await createKey(t.id, "Hızlı ajans");
  await getDb().insert(schema.loginAttempts).values({ key: `apikey:${k.id}`, n: 60 });
  assert.equal((await call(k.key)).status, 429);
});
```

- [ ] **Step 3: Çalıştır, kırmızı gör**

Run: `node --import ./tests/ts-resolve.mjs --test tests/integration-db.test.ts 2>&1 | tail -5`
Expected: FAIL — `@/lib/integrations/keys` bulunamadı.

- [ ] **Step 4: Anahtar modülü** — `lib/integrations/keys.ts`

```ts
// lib/integrations/keys.ts — M9c ajans erişim anahtarları. integration_keys RLS dışı → her sorguda tenantId koşulu.
// Düz anahtar yalnız üretimde döner; DB'de sha256.
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { newDeviceToken, sha256 } from "@/lib/auth/tokens";

const K = schema.integrationKeys;
export const KEY_PREFIX = "cpk_";

export async function createKey(tenantId: string, name: string): Promise<{ id: string; key: string }> {
  const key = KEY_PREFIX + newDeviceToken();
  const [row] = await getDb().insert(K).values({ tenantId, name, prefix: key.slice(0, 8), keyHash: await sha256(key) }).returning({ id: K.id });
  return { id: row.id, key };
}

export function listKeys(tenantId: string) {
  return getDb().select({ id: K.id, name: K.name, prefix: K.prefix, createdAt: K.createdAt, lastUsedAt: K.lastUsedAt, revokedAt: K.revokedAt })
    .from(K).where(eq(K.tenantId, tenantId)).orderBy(desc(K.createdAt));
}

export async function revokeKey(tenantId: string, id: string): Promise<boolean> {
  const rows = await getDb().update(K).set({ revokedAt: new Date() })
    .where(and(eq(K.id, id), eq(K.tenantId, tenantId), isNull(K.revokedAt))).returning({ id: K.id });
  return rows.length > 0;
}

/** Etkin anahtar → kiracı. Son kullanım en fazla dakikada bir yazılır. */
export async function findKey(key: string): Promise<{ id: string; tenantId: string; tenantName: string } | null> {
  if (!key.startsWith(KEY_PREFIX) || key.length > 100) return null;
  const [row] = await getDb().select({ id: K.id, tenantId: K.tenantId, tenantName: schema.tenants.name })
    .from(K).innerJoin(schema.tenants, eq(schema.tenants.id, K.tenantId))
    .where(and(eq(K.keyHash, await sha256(key)), isNull(K.revokedAt)));
  if (!row) return null;
  await getDb().update(K).set({ lastUsedAt: new Date() })
    .where(and(eq(K.id, row.id), or(isNull(K.lastUsedAt), lt(K.lastUsedAt, sql`now() - interval '1 minute'`))));
  return row;
}

export function keyFromRequest(req: Request) {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  return m ? findKey(m[1]) : Promise.resolve(null);
}
```

- [ ] **Step 5: Sorgu** — `lib/admin/report.ts` sonuna (import satırına `dailyStats, type DailyStat` ekle; `alias` zaten import'lu):

```ts
/** M9c ajans API'si: iadenin kanalı asıl satışınkidir (iade satırı kendisi 'kasa' yazılır). */
export async function dailyStatsData(tx: Tx, r: Range): Promise<DailyStat[]> {
  const O = alias(S, "o");
  const rows = await tx.select({ status: S.status, channel: sql<SaleRow["channel"]>`coalesce(${O.channel}, ${S.channel})`, total: S.total, tabId: S.tabId, at: S.createdAt })
    .from(S).leftJoin(O, eq(O.id, S.refundOf)).where(and(closedOrRefund, inRange(S.createdAt, r)));
  return dailyStats(rows.map((x) => ({ ...x, status: x.status as "kapandi" | "iade" })));
}
```

Import satırı `lib/admin/report.ts:5-8` → `byChannel, ... , dailyStats, ..., type DailyStat, type PayRow, ...` (alfabetik sıraya uy).

- [ ] **Step 6: Uç** — `app/api/v1/stats/daily/route.ts`

```ts
// Ajans API'si (M9c): GET /api/v1/stats/daily?from=YYYY-MM-DD&to=YYYY-MM-DD, Authorization: Bearer cpk_…
// Abonelik kilidinde de çalışır (veri müşterinin). Anahtar başına dakikada 60 istek.
import { withTenant } from "@/db";
import { keyFromRequest } from "@/lib/integrations/keys";
import { hit } from "@/lib/ratelimit";
import { apiRange, API_MAX_DAYS } from "@/lib/core/report";
import { dailyStatsData } from "@/lib/admin/report";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const k = await keyFromRequest(req);
  if (!k) return Response.json({ error: "unauthorized" }, { status: 401 });
  if ((await hit(`apikey:${k.id}`, 1)) > 60) return Response.json({ error: "rate_limited" }, { status: 429 });
  const sp = new URL(req.url).searchParams;
  const r = apiRange(sp.get("from"), sp.get("to"));
  if (!r) return Response.json({ error: "invalid_range", maxDays: API_MAX_DAYS }, { status: 400 });
  const days = await withTenant(k.tenantId, (tx) => dailyStatsData(tx, r));
  return Response.json({ business: { name: k.tenantName }, days });
}
```

- [ ] **Step 7: Yeşil gör**

Run: `node --import ./tests/ts-resolve.mjs --test tests/integration-db.test.ts 2>&1 | tail -5`
Expected: `# pass 4`, `# fail 0`. (429 testinde `hit` sayacı 60→61 olur.)

- [ ] **Step 8: Commit**

```bash
git add db/schema.ts lib/integrations/keys.ts lib/admin/report.ts app/api/v1/stats/daily/route.ts tests/integration-db.test.ts
git commit -m "M9c Görev 2: integration_keys, günlük özet sorgusu, /api/v1/stats/daily"
```

---

### Task 3: Yönetim → Entegrasyonlar + E2E + prod hazırlığı

**Files:**
- Create: `lib/admin/integration-actions.ts`
- Create: `components/admin/IntegrationKeyForm.tsx`
- Create: `app/yonetim/entegrasyonlar/page.tsx`
- Modify: `app/yonetim/Nav.tsx` (Abonelik'ten sonra)
- Create: `e2e/m9c.mjs`
- Modify: `docs/PROGRESS.md`, `scripts/prod-push.sh`

**Interfaces:**
- Consumes: `createKey`, `listKeys`, `revokeKey` (Task 2); `requireWriter`, `requireAdmin` (`lib/auth/session`, dönüşte `role`, `tenantId`, `id`); `audit(tx, tenantId, actor, action, detail)`; `useFormAction(action, initial)`.
- Produces: `KeyState = { error?: string; field?: string; key?: string; name?: string }`; `createIntegrationKey(_: KeyState, form: FormData): Promise<KeyState>`; `revokeIntegrationKey(id: string): Promise<void>`; sayfa `/yonetim/entegrasyonlar`; test kimlikleri `integration-key`, `key-row`.

- [ ] **Step 1: Server action'lar** — `lib/admin/integration-actions.ts`

```ts
"use server";
// M9c ajans erişim anahtarları: yalnız işletme sahibi. Oluşturma abonelik kilidinde kapalı; iptal her zaman açık (güvenlik).
import { revalidatePath } from "next/cache";
import { withTenant } from "@/db";
import { requireAdmin, requireWriter } from "@/lib/auth/session";
import { createKey, revokeKey } from "@/lib/integrations/keys";
import { audit } from "@/lib/audit";

export type KeyState = { error?: string; field?: string; key?: string; name?: string };
const PATH = "/yonetim/entegrasyonlar";

export async function createIntegrationKey(_: KeyState, form: FormData): Promise<KeyState> {
  const a = await requireWriter();
  if (a.role !== "sahip") return { error: "Anahtarı yalnız işletme sahibi oluşturabilir." };
  const name = String(form.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 40) return { error: "Ad 2-40 karakter.", field: "name" };
  const { id, key } = await createKey(a.tenantId, name);
  await withTenant(a.tenantId, (tx) => audit(tx, a.tenantId, `user:${a.id}`, "integration_key.create", { id, name }));
  revalidatePath(PATH);
  return { key, name };
}

export async function revokeIntegrationKey(id: string): Promise<void> {
  const a = await requireAdmin();
  if (a.role !== "sahip") return;
  if (await revokeKey(a.tenantId, id)) await withTenant(a.tenantId, (tx) => audit(tx, a.tenantId, `user:${a.id}`, "integration_key.revoke", { id }));
  revalidatePath(PATH);
}
```

- [ ] **Step 2: Form bileşeni** — `components/admin/IntegrationKeyForm.tsx`

```tsx
"use client";
import { useState } from "react";
import { createIntegrationKey, type KeyState } from "@/lib/admin/integration-actions";
import { useFormAction } from "@/components/useFormAction";
import { Button, Field, Input } from "@/components/ui";

function KeyBox({ s }: { s: KeyState }) {
  const [copied, setCopied] = useState(false);
  if (!s.key) return s.error && !s.field ? <p className="mt-2 text-sm text-red-700">{s.error}</p> : null;
  return (
    <div className="mt-4 rounded-xl border border-brand bg-brand-soft p-4">
      <div className="text-sm">{s.name} için erişim anahtarı — <b>yalnız şimdi gösterilir</b>, kaydedin.</div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code data-testid="integration-key" className="break-all rounded bg-white px-2 py-1 font-mono text-sm">{s.key}</code>
        <button type="button" className="text-sm text-brand underline" onClick={() => navigator.clipboard.writeText(s.key!).then(() => setCopied(true))}>{copied ? "Kopyalandı" : "Kopyala"}</button>
      </div>
      <p className="mt-2 text-sm text-stone-700">Ajans panelinde Bağlantılar → ÇabukPOS alanına yapıştırılır. Anahtar yalnız günlük satış özetini okur; hiçbir şeyi değiştiremez.</p>
    </div>
  );
}

export function IntegrationKeyForm() {
  const { state, pending, onSubmit } = useFormAction(createIntegrationKey, {} as KeyState);
  return (
    <form onSubmit={onSubmit}>
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <Field label="Ajans adı"><Input name="name" placeholder="Zirve Ajans" maxLength={40} required /></Field>
          {state.field === "name" && state.error && <p className="mt-1 text-sm text-red-700">{state.error}</p>}
        </div>
        <Button type="submit" disabled={pending} className="mt-6">{pending ? "Oluşturuluyor…" : "Ajans erişimi oluştur"}</Button>
      </div>
      <KeyBox s={state} />
    </form>
  );
}
```

- [ ] **Step 3: Sayfa** — `app/yonetim/entegrasyonlar/page.tsx`

```tsx
import { requireAdmin } from "@/lib/auth/session";
import { listKeys } from "@/lib/integrations/keys";
import { revokeIntegrationKey } from "@/lib/admin/integration-actions";
import { IntegrationKeyForm } from "@/components/admin/IntegrationKeyForm";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
const dt = (d: Date) => d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });

export default async function Entegrasyonlar() {
  const a = await requireAdmin();
  const owner = a.role === "sahip";
  const rows = await listKeys(a.tenantId);
  return (
    <>
      <PageHeader title="Entegrasyonlar" desc="Ajansınıza salt okunur erişim verin: günlük sipariş, ciro ve iade özeti. Platform siparişleri dahil değildir." />
      {owner ? <Card className="mb-6 p-5"><IntegrationKeyForm /></Card> : <Card className="mb-6 p-4 text-sm text-muted">Anahtarları yalnız işletme sahibi yönetebilir.</Card>}
      {rows.length === 0 ? <Empty>Henüz erişim anahtarı yok.</Empty> : (
        <Card className="divide-y divide-line">
          {rows.map((k) => (
            <div key={k.id} data-testid="key-row" className="flex flex-wrap items-center gap-3 p-4">
              <div className="font-medium">{k.name}</div>
              <span className="font-mono text-sm text-muted">{k.prefix}…</span>
              {k.revokedAt ? <Badge tone="bad">İptal</Badge> : <Badge tone="ok">Etkin</Badge>}
              <span className="text-xs text-muted">Oluşturma {dt(k.createdAt)}{k.lastUsedAt ? ` · son kullanım ${dt(k.lastUsedAt)}` : " · hiç kullanılmadı"}</span>
              {owner && !k.revokedAt && (
                <form action={revokeIntegrationKey.bind(null, k.id)} className="ml-auto"><button className="text-sm text-red-700 underline">İptal et</button></form>
              )}
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
```

- [ ] **Step 4: Nav** — `app/yonetim/Nav.tsx`, Abonelik satırından sonra:

```ts
  { href: "/yonetim/entegrasyonlar", label: "Entegrasyonlar" },
```

- [ ] **Step 5: E2E** — `e2e/m9c.mjs`

```js
// e2e/m9c.mjs — Ajans erişimi. Kayıt → Entegrasyonlar → anahtar üret → uç 200 (işletme adı, days dizi) →
// 400 (ters aralık) → İptal et → 401. Satış sayımı DB testinde (tests/integration-db.test.ts).
// Kullanım: npm run build && node --env-file=.env.local e2e/m9c.mjs (sunucu :3800)
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3800";
const stamp = Date.now();
const tenant = `E2E Kebapçı ${stamp}`;
const step = (m) => console.log("•", m);
const expect = (got, want, what) => { if (got !== want) throw new Error(`${what}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`); };
const day = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
const api = (key, q = `from=${day}&to=${day}`) => fetch(`${BASE}/api/v1/stats/daily?${q}`, { headers: key ? { authorization: `Bearer ${key}` } : {} });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
try {
  const admin = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  admin.on("pageerror", (e) => errors.push(e.message));
  await admin.goto(`${BASE}/kayit`);
  await admin.fill("input[name=businessName]", tenant);
  await admin.getByRole("button", { name: "Restoran" }).click();
  await admin.fill("input[name=name]", "Yiğit Test");
  await admin.fill("input[name=email]", `m9c-${stamp}@ornek.com`);
  await admin.fill("input[name=password]", "Cabukpos2026x");
  await admin.getByRole("button", { name: "Hesap oluştur" }).click();
  await admin.waitForURL(`${BASE}/yonetim**`);

  expect((await api(null)).status, 401, "anahtarsız");
  await admin.goto(`${BASE}/yonetim/entegrasyonlar`);
  await admin.fill("input[name=name]", "Zirve Ajans");
  await admin.getByRole("button", { name: "Ajans erişimi oluştur" }).click();
  const key = (await admin.getByTestId("integration-key").innerText()).trim();
  if (!/^cpk_[A-Za-z0-9_-]{43}$/.test(key)) throw new Error(`anahtar biçimi: ${key}`);
  step("anahtar üretildi, bir kez gösterildi");

  const r = await api(key);
  expect(r.status, 200, "anahtarla");
  const body = await r.json();
  expect(body.business.name, tenant, "işletme adı");
  if (!Array.isArray(body.days)) throw new Error("days dizi değil");
  expect((await api(key, `from=${day}&to=2020-01-01`)).status, 400, "ters aralık");
  step("uç: 200 (işletme adı, days) + 400 ters aralık");

  await admin.reload();
  await admin.getByTestId("key-row").getByText(/son kullanım/).waitFor();
  await admin.getByRole("button", { name: "İptal et" }).click();
  await admin.getByTestId("key-row").getByText("İptal", { exact: true }).waitFor();
  expect((await api(key)).status, 401, "iptal sonrası");
  step("son kullanım görünür; İptal et → 401");

  if (errors.length) throw new Error(`sayfa hataları: ${errors.join(" | ")}`);
  console.log("M9c OK");
} finally {
  await browser.close();
}
```

- [ ] **Step 6: Tüm kapılar**

Run (sırayla; :3800'deki eski `next start`'ı port üzerinden öldür: `lsof -ti:3800 | xargs kill`):
```bash
npx tsc --noEmit 2>&1 | tail -5
npm run lint 2>&1 | tail -5
npm test 2>&1 | grep -E "^# (pass|fail)"
npm run build 2>&1 | tail -3 && (npx next start -p 3800 >/dev/null 2>&1 &) && sleep 4
node --env-file=.env.local e2e/m9c.mjs && node --env-file=.env.local e2e/m9a.mjs
```
Expected: tsc/lint temiz; `# pass 130` (120 + 6 + 4), `# fail 0`; `M9c OK`, `M9a OK`. Kayıt sınırı (5/saat/IP) takılırsa yerelde `delete from login_attempts where key like 'signup:%'`.

- [ ] **Step 7: PROGRESS + prod-push.sh**

`docs/PROGRESS.md` sonuna M9c bölümü (kararlar: RLS dışı anahtar tablosu, platform hariç, iade kanalı asıl satıştan, kilitte okuma açık, iptal her zaman açık). `scripts/prod-push.sh` (git exclude'da) başlığını M9c yap ve satırları değiştir:

```sh
  1) git checkout m9c-ajans && DATABASE_URL="$URL" node node_modules/drizzle-kit/bin.cjs push --force ;;
  2) MIGRATE_DATABASE_URL="$URL" node scripts/db-rls.mjs ;;
  3) psql "$URL" -Atc "select relname, relrowsecurity from pg_class where relname in ('integration_keys','sales'); select has_table_privilege('cabukpos_app','integration_keys','select')" ;;
  4) git checkout main && git merge --ff-only m9c-ajans && git push ;;
  5) BASE=https://cabukpos-app.vercel.app node e2e/m9c.mjs ;;
```
3'te beklenen: `integration_keys|f`, `sales|t`, `t`.

- [ ] **Step 8: Commit + push**

```bash
git add lib/admin/integration-actions.ts components/admin/IntegrationKeyForm.tsx app/yonetim/entegrasyonlar app/yonetim/Nav.tsx e2e/m9c.mjs docs/PROGRESS.md
git commit -m "M9c Görev 3: Entegrasyonlar sayfası (ajans anahtarı üret/iptal), e2e/m9c.mjs, ilerleme notu"
git push -u origin m9c-ajans
```

---

### Task 4: Ajans paneli — ÇabukPOS istemcisi (restoran-zirve)

Çalışma dizini: `~/nocturn-saas-suite/restoran-zirve` (main).

**Files:**
- Modify: `lib/platforms/labels.ts`, `lib/platforms/index.ts`, `db/schema.ts:17`
- Create: `lib/platforms/cabukpos/index.ts`
- Test: `tests/cabukpos.test.ts`

**Interfaces:**
- Consumes: ÇabukPOS ucu (Task 2 yanıt biçimi); `PlatformError`, `PlatformClient`, `ClientOptions`, `DailyOrderStat` (`lib/platforms/types`).
- Produces: `createCabukposClient(creds: { apiKey: string }, opts?: ClientOptions): PlatformClient`; `dayChunks(from: Date, to: Date): [string, string][]`.

- [ ] **Step 1: Failing test** — `tests/cabukpos.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createCabukposClient, dayChunks } from "@/lib/platforms/cabukpos";
import { PlatformError } from "@/lib/platforms/types";

const creds = { apiKey: "cpk_test" };
function fakeFetch(handler: (url: string) => { status?: number; body?: unknown }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = handler(url);
    return new Response(r.body === undefined ? "" : JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { f, calls };
}
const day = { day: "2026-09-28", orderCount: 3, cancelledCount: 1, grossRevenue: 175.5, channels: { masa: 1, paket: 1, kasa: 1 } };

test("testConnection: Bearer başlığı, bugünün İstanbul günü, işletme adı", async () => {
  const { f, calls } = fakeFetch(() => ({ body: { business: { name: "Kebapçı" }, days: [] } }));
  const r = await createCabukposClient(creds, { fetch: f }).testConnection();
  assert.equal(r.storeName, "Kebapçı");
  assert.match(calls[0].url, /^https:\/\/cabukpos-app\.vercel\.app\/api\/v1\/stats\/daily\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/);
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, "Bearer cpk_test");
});

test("listOrderStats: kanal alanı atılır, DailyOrderStat döner", async () => {
  const { f } = fakeFetch(() => ({ body: { business: { name: "K" }, days: [day] } }));
  const c = createCabukposClient(creds, { fetch: f });
  assert.deepEqual(c.capabilities, ["orders.stats"]);
  assert.deepEqual(await c.listOrderStats!(new Date("2026-09-28T09:00:00Z"), new Date("2026-09-28T10:00:00Z")), [{ day: "2026-09-28", orderCount: 3, cancelledCount: 1, grossRevenue: 175.5 }]);
});

test("dayChunks: 92 günlük parçalar, İstanbul günü", () => {
  assert.deepEqual(dayChunks(new Date("2026-09-27T22:00:00Z"), new Date("2026-09-28T20:00:00Z")), [["2026-09-28", "2026-09-28"]]);
  const c = dayChunks(new Date("2026-01-01T12:00:00Z"), new Date("2026-06-30T12:00:00Z")); // 181 gün
  assert.deepEqual(c, [["2026-01-01", "2026-04-02"], ["2026-04-03", "2026-06-30"]]);
});

test("hatalar: 401 → auth, 429 → rate_limit, 500 → upstream, ağ → network", async () => {
  for (const [status, kind] of [[401, "auth"], [429, "rate_limit"], [500, "upstream"]] as const) {
    const { f } = fakeFetch(() => ({ status }));
    await assert.rejects(createCabukposClient(creds, { fetch: f }).testConnection(), (e: PlatformError) => e.kind === kind);
  }
  const boom = (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;
  await assert.rejects(createCabukposClient(creds, { fetch: boom }).testConnection(), (e: PlatformError) => e.kind === "network");
});
```

- [ ] **Step 2: Kırmızı gör**

Run: `node --import ./tests/ts-resolve.mjs --test tests/cabukpos.test.ts 2>&1 | tail -5`
Expected: FAIL — modül yok.

- [ ] **Step 3: İstemci** — `lib/platforms/cabukpos/index.ts`

```ts
// ÇabukPOS (kendi POS'umuz) — işletme sahibinin verdiği salt okunur ajans anahtarıyla günlük özet.
// Uç: GET /api/v1/stats/daily?from&to (en fazla 92 gün, İstanbul günü). Platform siparişleri ÇabukPOS tarafında hariç (çift sayım olmaz).
import { PlatformError, type ClientOptions, type DailyOrderStat, type PlatformClient } from "../types";

const DAY = 86400_000, IST = 3 * 3600_000, MAX_DAYS = 92;
const istDay = (d: Date) => new Date(d.getTime() + IST).toISOString().slice(0, 10);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function dayChunks(from: Date, to: Date): [string, string][] {
  const out: [string, string][] = [];
  const end = Date.parse(istDay(to));
  for (let s = Date.parse(istDay(from)); s <= end; ) {
    const e = Math.min(s + (MAX_DAYS - 1) * DAY, end);
    out.push([iso(s), iso(e)]);
    s = e + DAY;
  }
  return out;
}

type Daily = { business: { name: string }; days: (DailyOrderStat & { channels?: unknown })[] };

export function createCabukposClient(creds: { apiKey: string }, opts: ClientOptions = {}): PlatformClient {
  const f = opts.fetch ?? fetch;
  const base = (process.env.CABUKPOS_API_URL ?? "https://cabukpos-app.vercel.app").replace(/\/$/, "");
  async function daily(from: string, to: string): Promise<Daily> {
    let res: Response;
    try {
      res = await f(`${base}/api/v1/stats/daily?from=${from}&to=${to}`, { headers: { Authorization: `Bearer ${creds.apiKey}` } });
    } catch (e) {
      throw new PlatformError("network", `ÇabukPOS'a ulaşılamadı: ${(e as Error).message}`);
    }
    if (res.status === 401) throw new PlatformError("auth", "ÇabukPOS anahtarı geçersiz ya da iptal edilmiş.", 401);
    if (res.status === 429) throw new PlatformError("rate_limit", "ÇabukPOS istek sınırı aşıldı; sonraki senkronda denenecek.", 429);
    if (!res.ok) throw new PlatformError("upstream", `ÇabukPOS ${res.status} döndü.`, res.status);
    return (await res.json()) as Daily;
  }
  return {
    platform: "cabukpos",
    capabilities: ["orders.stats"],
    async testConnection() {
      const d = istDay(new Date());
      return { storeName: (await daily(d, d)).business.name };
    },
    async listOrderStats(from, to) {
      const out: DailyOrderStat[] = [];
      for (const [a, b] of dayChunks(from, to)) {
        for (const x of (await daily(a, b)).days) out.push({ day: x.day, orderCount: x.orderCount, cancelledCount: x.cancelledCount, grossRevenue: x.grossRevenue });
      }
      return out;
    },
  };
}
```

- [ ] **Step 4: Kayıt** — üç dosya:

`lib/platforms/labels.ts` → `PLATFORM_LABEL`'a `mock` satırından önce: `cabukpos: "ÇabukPOS",`

`db/schema.ts:17` → `export const platform = pgEnum("platform", ["trendyol", "yemeksepeti", "migros", "cabukpos", "mock"]);`

`lib/platforms/index.ts`:
```ts
import { createCabukposClient } from "./cabukpos";
// CREDENTIAL_FIELDS'a (mock'tan önce):
  cabukpos: [{ key: "apiKey", label: "Ajans erişim anahtarı", secret: true, hint: "ÇabukPOS → Yönetim → Entegrasyonlar → Ajans erişimi oluştur" }],
// credentialSchemas'a:
  cabukpos: z.object({ apiKey: z.string().trim().regex(/^cpk_[A-Za-z0-9_-]{20,}$/, "Anahtar cpk_ ile başlamalı.") }),
// SUPPORTED_PLATFORMS:
export const SUPPORTED_PLATFORMS = ["trendyol", "yemeksepeti", "cabukpos", "mock"] as const satisfies readonly PlatformId[];
// createRawClient switch'ine:
    case "cabukpos":
      return createCabukposClient(credentialSchemas.cabukpos.parse(credentials), opts);
```

- [ ] **Step 5: Kapılar**

```bash
npm run db:push 2>&1 | tail -2 && npm run db:push:test 2>&1 | tail -2
npx tsc --noEmit 2>&1 | tail -5
npm test 2>&1 | grep -E "^# (pass|fail)"
```
Expected: enum'a `cabukpos` eklendi; tsc temiz (başka `Record<PlatformId,…>`/switch eksikse tsc gösterir → aynı kalıpla ekle); `# fail 0`.

- [ ] **Step 6: Commit + push**

```bash
git add lib/platforms db/schema.ts tests/cabukpos.test.ts
git commit -m "ÇabukPOS bağlantısı: ajans anahtarıyla günlük sipariş/ciro/iade özeti (M9c)"
git push
```

---

## Canlıya alma (Yiğit, `!` ile TEK TEK)

1. `sh scripts/prod-push.sh 1` — şema (integration_keys)
2. `sh scripts/prod-push.sh 2` — RLS betiği (yeni tabloya GRANT)
3. `sh scripts/prod-push.sh 3` — beklenen `integration_keys|f`, `sales|t`, `t`
4. `sh scripts/prod-push.sh 4` — main (Vercel yayını); `vercel inspect` Ready olana kadar bekle
5. `sh scripts/prod-push.sh 5` — canlı E2E → `M9c OK`
