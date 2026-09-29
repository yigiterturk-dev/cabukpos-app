# ÇabukPOS M9b — Abonelik Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 14 gün deneme, tarihten türeyen abonelik durumu, kilitte yönetim salt okunur (kasa hiç kilitlenmez), sağlayıcıdan bağımsız ödeme (v1 sahte), günlük hatırlatma.

**Architecture:** Tarihler `tenants`'ta; durum saf `billingInfo()` ile hesaplanır. `getAdmin()` durumu taşır; `requireWriter()` tüm yönetim server action'larını korur. Ödeme `billing_payments` (RLS'siz) + `completePayment` (satır kilidi, idempotent).

**Tech Stack:** Next.js 16, Drizzle + Postgres, node:test, Playwright.

Spec: `docs/superpowers/specs/2026-09-29-cabukpos-m9b-abonelik-design.md`

## Global Constraints
- Para kuruş. Fiyat env'den; kodda fiyat rakamı YOK.
- Kasa (satış, eşitleme, vardiya) abonelikten hiç etkilenmez.
- `BILLING_PROVIDER` boşsa ödeme kapalı.
- Commit yazarı r.y.erturk@gmail.com; AI imzası YOK.
- Tek test: `node --import ./tests/ts-resolve.mjs --test tests/<ad>.test.ts`; DB testlerinde `after` içinde `closeDb()` ŞART (yoksa süreç asılı kalır).

---

### Task 1: Saf durum hesabı + şema + servis

**Files:** Create `lib/core/billing.ts`, `lib/billing/plans.ts`, `lib/billing/provider.ts`, `lib/billing/service.ts`, `tests/billing.test.ts`, `tests/billing-db.test.ts`; Modify `db/schema.ts` (tenants sütunları + tablo).

**Interfaces (Produces):** `BillingPeriod`, `BillingState`, `BillingInfo`, `PERIODS`, `STATE_LABEL`, `billingInfo(t, now?)`, `extendFrom(t, period, now?)`, `reminderDue(t, now?)`, `bannerText(i)`; `planPrice(p)`, `salesContact()`; `BillingProvider`, `getBillingProvider()`; `tenantBilling`, `createPayment`, `paymentOf`, `paymentsOf`, `completePayment`.

- [ ] **Step 1: tests/billing.test.ts**

```ts
// tests/billing.test.ts — abonelik durumu (saf).
import { test } from "node:test";
import assert from "node:assert/strict";
import { billingInfo, extendFrom, reminderDue, bannerText } from "@/lib/core/billing";

const D = (s: string) => new Date(s);
const now = D("2026-09-29T12:00:00Z");

test("durum: deneme, uyarı, aktif, ek süre, kilit", () => {
  let i = billingInfo({ trialEndsAt: D("2026-10-13T12:00:00Z"), paidUntil: null }, now);
  assert.deepEqual([i.state, i.daysLeft, i.warn, i.locked], ["deneme", 14, false, false]);
  i = billingInfo({ trialEndsAt: D("2026-10-03T12:00:00Z"), paidUntil: null }, now);
  assert.deepEqual([i.daysLeft, i.warn], [4, true]);
  assert.equal(bannerText(i), "Deneme süren 4 gün sonra bitiyor.");
  i = billingInfo({ trialEndsAt: D("2026-09-01T00:00:00Z"), paidUntil: D("2026-12-01T00:00:00Z") }, now);
  assert.deepEqual([i.state, i.warn], ["aktif", false]);
  i = billingInfo({ trialEndsAt: D("2026-09-27T12:00:00Z"), paidUntil: null }, now);
  assert.deepEqual([i.state, i.daysLeft, i.warn, i.locked], ["ek_sure", 5, true, false]);
  i = billingInfo({ trialEndsAt: D("2026-09-20T12:00:00Z"), paidUntil: null }, now);
  assert.deepEqual([i.state, i.locked], ["kilitli", true]);
  assert.match(bannerText(i), /salt okunur/);
});

test("uzatma: kalan süre korunur, bitmişse bugünden", () => {
  assert.equal(extendFrom({ trialEndsAt: D("2026-10-05T00:00:00Z"), paidUntil: null }, "aylik", now).toISOString(), "2026-11-05T00:00:00.000Z");
  assert.equal(extendFrom({ trialEndsAt: D("2026-09-01T00:00:00Z"), paidUntil: D("2026-09-25T00:00:00Z") }, "yillik", now).toISOString(), "2027-09-29T12:00:00.000Z");
});

test("hatırlatma: 1-7 gün kala, aynı bitişe bir kez", () => {
  const t = { trialEndsAt: D("2026-10-03T12:00:00Z"), paidUntil: null, remindedEnd: null };
  assert.equal(reminderDue(t, now), true);
  assert.equal(reminderDue({ ...t, remindedEnd: t.trialEndsAt }, now), false);
  assert.equal(reminderDue({ ...t, trialEndsAt: D("2026-10-20T00:00:00Z") }, now), false);
  assert.equal(reminderDue({ ...t, trialEndsAt: D("2026-09-28T00:00:00Z") }, now), false);
});
```

- [ ] **Step 2: lib/core/billing.ts**

```ts
// lib/core/billing.ts — Abonelik durumu (saf). Bitiş = max(deneme sonu, ödenen dönem sonu);
// sonra 7 gün ek süre, sonra kilit (yalnız yönetim yazması; kasa hiç kilitlenmez).
const DAY = 86400_000;
export const TRIAL_DAYS = 14, GRACE_DAYS = 7, WARN_DAYS = 7;

export type BillingPeriod = "aylik" | "yillik";
export const PERIODS: { key: BillingPeriod; label: string }[] = [{ key: "aylik", label: "Aylık" }, { key: "yillik", label: "Yıllık" }];
export type BillingState = "deneme" | "aktif" | "ek_sure" | "kilitli";
export const STATE_LABEL: Record<BillingState, string> = { deneme: "Deneme", aktif: "Aktif", ek_sure: "Ek süre", kilitli: "Kilitli" };
export type BillingDates = { trialEndsAt: Date; paidUntil: Date | null };
export type BillingInfo = { state: BillingState; endsAt: Date; lockAt: Date; daysLeft: number; warn: boolean; locked: boolean };

export const endOf = (t: BillingDates) => (t.paidUntil && t.paidUntil > t.trialEndsAt ? t.paidUntil : t.trialEndsAt);

export function billingInfo(t: BillingDates, now = new Date()): BillingInfo {
  const endsAt = endOf(t), lockAt = new Date(endsAt.getTime() + GRACE_DAYS * DAY), n = now.getTime();
  const state: BillingState = n < endsAt.getTime() ? (t.paidUntil && t.paidUntil.getTime() > n ? "aktif" : "deneme") : n < lockAt.getTime() ? "ek_sure" : "kilitli";
  const daysLeft = Math.max(0, Math.ceil(((state === "deneme" || state === "aktif" ? endsAt : lockAt).getTime() - n) / DAY));
  const running = state === "deneme" || state === "aktif";
  return { state, endsAt, lockAt, daysLeft, warn: running ? daysLeft <= WARN_DAYS : true, locked: state === "kilitli" };
}

/** Ödenen dönemin sonu: max(şimdi, mevcut bitiş) + 1 ay / 1 yıl. */
export function extendFrom(t: BillingDates, period: BillingPeriod, now = new Date()): Date {
  const d = new Date(Math.max(now.getTime(), endOf(t).getTime()));
  if (period === "aylik") d.setUTCMonth(d.getUTCMonth() + 1);
  else d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d;
}

/** Günlük hatırlatma: bitişe 1-7 gün kala, aynı bitiş için bir kez. */
export function reminderDue(t: BillingDates & { remindedEnd: Date | null }, now = new Date()): boolean {
  const i = billingInfo(t, now);
  return (i.state === "deneme" || i.state === "aktif") && i.daysLeft >= 1 && i.daysLeft <= WARN_DAYS && t.remindedEnd?.getTime() !== i.endsAt.getTime();
}

export function bannerText(i: BillingInfo): string {
  if (i.state === "kilitli") return "Aboneliğin sona erdi; yönetim salt okunur. Kasa satışa devam ediyor.";
  if (i.state === "ek_sure") return `Aboneliğin sona erdi. ${i.daysLeft} gün içinde ödeme yapılmazsa yönetim salt okunur olur.`;
  return `${i.state === "deneme" ? "Deneme süren" : "Aboneliğin"} ${i.daysLeft} gün sonra bitiyor.`;
}
```

- [ ] **Step 3:** Run `node --import ./tests/ts-resolve.mjs --test tests/billing.test.ts 2>&1 | grep -E "^ℹ (pass|fail)"` → fail 0.

- [ ] **Step 4: db/schema.ts** — `tenants` içine `address` satırından sonra:

```ts
  trialEndsAt: ts("trial_ends_at").notNull().default(sql`now() + interval '14 days'`), // M9b: mevcut işletmeler yayından 14 gün
  paidUntil: ts("paid_until"),
  billingRemindedEnd: ts("billing_reminded_end"), // hatırlatma gönderilen bitiş (aynı bitişe bir kez)
```

Dosya sonuna:

```ts
// — M9b: abonelik ödemeleri. RLS yok (sağlayıcı geri bildirimi kiracı bağlamsız gelir); yalnız lib/billing erişir. —
export const billingPayments = pgTable("billing_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  provider: text("provider").notNull(),
  period: text("period").notNull(), // aylik | yillik
  amount: integer("amount").notNull(), // kuruş, KDV dahil
  status: text("status").notNull().default("bekliyor"), // bekliyor | odendi | basarisiz
  providerRef: text("provider_ref"),
  periodEnd: ts("period_end"),
  createdAt: ts("created_at").notNull().defaultNow(),
  paidAt: ts("paid_at"),
}, (t) => [index("billing_payments_tenant_idx").on(t.tenantId, t.createdAt)]);
```

- [ ] **Step 5: lib/billing/plans.ts**

```ts
// lib/billing/plans.ts — Tek paket. Fiyat kararlaştırılınca env'den (kuruş, KDV dahil); boşsa o dönem satın alınamaz.
import type { BillingPeriod } from "@/lib/core/billing";

const price = (v: string | undefined) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
export const planPrice = (p: BillingPeriod): number | null => price(p === "aylik" ? process.env.PLAN_PRICE_AYLIK : process.env.PLAN_PRICE_YILLIK);
export const salesContact = () => process.env.SALES_CONTACT || null;
```

- [ ] **Step 6: lib/billing/provider.ts**

```ts
// lib/billing/provider.ts — Ödeme sağlayıcı arayüzü. Gerçek sağlayıcı (PayTR/iyzico) = yeni dosya + webhook route → completePayment.
import type { BillingPeriod } from "@/lib/core/billing";

export type CheckoutInput = { paymentId: string; amount: number; period: BillingPeriod; tenantName: string; email: string };
export interface BillingProvider {
  name: string;
  test: boolean;
  start(p: CheckoutInput): Promise<{ redirectUrl: string }>;
}

export const fakeBilling: BillingProvider = {
  name: "fake",
  test: true,
  start: async (p) => ({ redirectUrl: `/yonetim/abonelik/test-odeme/${p.paymentId}` }),
};

/** BILLING_PROVIDER boşsa ödeme kapalı (canlıda sahte sağlayıcı ücretsiz uzatma olurdu). */
export function getBillingProvider(): BillingProvider | null {
  return process.env.BILLING_PROVIDER === "fake" ? fakeBilling : null;
}
```

- [ ] **Step 7: lib/billing/service.ts**

```ts
// lib/billing/service.ts — Abonelik DB işlemleri (tenants + billing_payments; ikisi de RLS'siz).
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { extendFrom, type BillingPeriod } from "@/lib/core/billing";

const T = schema.tenants, P = schema.billingPayments;

export async function tenantBilling(tenantId: string) {
  const [t] = await getDb().select({ trialEndsAt: T.trialEndsAt, paidUntil: T.paidUntil }).from(T).where(eq(T.id, tenantId));
  return t ?? null;
}

export async function createPayment(tenantId: string, provider: string, period: BillingPeriod, amount: number) {
  const [p] = await getDb().insert(P).values({ tenantId, provider, period, amount }).returning();
  return p;
}

export async function paymentOf(tenantId: string, id: string) {
  const [p] = await getDb().select().from(P).where(and(eq(P.id, id), eq(P.tenantId, tenantId)));
  return p ?? null;
}

export const paymentsOf = (tenantId: string) => getDb().select().from(P).where(eq(P.tenantId, tenantId)).orderBy(desc(P.createdAt)).limit(20);

/** Sağlayıcı sonucu. Satır kilidiyle idempotent: yalnız bekleyen ödeme işlenir; başarılıysa dönem uzar. */
export async function completePayment(id: string, ok: boolean, providerRef: string, now = new Date()): Promise<"odendi" | "basarisiz" | "zaten"> {
  return getDb().transaction(async (tx) => {
    const [p] = await tx.select().from(P).where(eq(P.id, id)).for("update");
    if (!p || p.status !== "bekliyor") return "zaten";
    if (!ok) {
      await tx.update(P).set({ status: "basarisiz", providerRef }).where(eq(P.id, id));
      return "basarisiz";
    }
    const [t] = await tx.select({ trialEndsAt: T.trialEndsAt, paidUntil: T.paidUntil }).from(T).where(eq(T.id, p.tenantId)).for("update");
    const until = extendFrom(t, p.period as BillingPeriod, now);
    await tx.update(T).set({ paidUntil: until }).where(eq(T.id, p.tenantId));
    await tx.update(P).set({ status: "odendi", providerRef, paidAt: now, periodEnd: until }).where(eq(P.id, id));
    return "odendi";
  });
}
```

- [ ] **Step 8: tests/billing-db.test.ts**

```ts
// tests/billing-db.test.ts — cabukpos_test, uygulama rolü. Deneme varsayılanı + ödeme idempotentliği.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
process.env.MIGRATE_DATABASE_URL = "postgres://yigiterturk@localhost:5432/cabukpos_test";
const { getDb, closeDb, schema } = await import("@/db");
const { createPayment, completePayment, tenantBilling } = await import("@/lib/billing/service");
const { eq } = await import("drizzle-orm");

const [t] = await getDb().insert(schema.tenants).values({ name: "ABONE-T", vertical: "market" }).returning();
after(async () => {
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t.id));
  await closeDb();
});

test("yeni işletme 14 gün deneme", async () => {
  const b = (await tenantBilling(t.id))!;
  const days = (b.trialEndsAt.getTime() - Date.now()) / 86400_000;
  assert.ok(days > 13.9 && days <= 14.01, String(days));
  assert.equal(b.paidUntil, null);
});

test("ödeme: başarısız uzatmaz, başarılı bir kez uzatır", async () => {
  const f = await createPayment(t.id, "fake", "aylik", 100);
  assert.equal(await completePayment(f.id, false, "x"), "basarisiz");
  assert.equal(await completePayment(f.id, true, "x"), "zaten");
  assert.equal((await tenantBilling(t.id))!.paidUntil, null);
  const p = await createPayment(t.id, "fake", "yillik", 1000);
  const rs = await Promise.all([completePayment(p.id, true, "a"), completePayment(p.id, true, "b")]);
  assert.deepEqual(rs.sort(), ["odendi", "zaten"]);
  const b = (await tenantBilling(t.id))!;
  const exp = new Date(b.trialEndsAt);
  exp.setUTCFullYear(exp.getUTCFullYear() + 1);
  assert.equal(b.paidUntil!.toISOString(), exp.toISOString());
});
```

- [ ] **Step 9:** `npm run db:push:test 2>&1 | tail -1 && node --import ./tests/ts-resolve.mjs --test tests/billing.test.ts tests/billing-db.test.ts 2>&1 | grep -E "^ℹ (pass|fail)"` → fail 0. `npx tsc --noEmit`.

- [ ] **Step 10: Commit** `git add -A lib/core/billing.ts lib/billing db/schema.ts tests/billing*.ts && git commit -m "M9b Görev 1: abonelik durumu (saf), tenants deneme/ödeme sütunları, billing_payments, sahte sağlayıcı, completePayment"`

---

### Task 2: Kilit + yönetim ekranı + ödeme akışı

**Files:** Modify `lib/auth/session.ts`, `lib/admin/*-actions.ts` (11 dosya), `app/yonetim/layout.tsx`, `app/yonetim/Nav.tsx`; Create `lib/billing/actions.ts`, `app/yonetim/abonelik/page.tsx`, `app/yonetim/abonelik/test-odeme/[id]/page.tsx`.

- [ ] **Step 1: lib/auth/session.ts** — import `import { billingInfo } from "@/lib/core/billing";`; `getAdmin` seçimine `trialEndsAt: t.trialEndsAt, paidUntil: t.paidUntil` ekle, dönüşe `billing: billingInfo({ trialEndsAt: row.trialEndsAt, paidUntil: row.paidUntil })`. Dosya sonuna:

```ts
/** Yönetim yazması (server action): abonelik kilitliyse Abonelik sayfasına. Okuma serbest; kasa hiç etkilenmez. */
export async function requireWriter() {
  const a = await requireAdmin();
  if (a.billing.locked) redirect("/yonetim/abonelik?kilit=1");
  return a;
}
```

- [ ] **Step 2:** `sed -i '' 's/\brequireAdmin\b/requireWriter/g' lib/admin/*-actions.ts` → `grep -c requireAdmin lib/admin/*-actions.ts` hepsi 0.

- [ ] **Step 3: lib/billing/actions.ts**

```ts
"use server";
// Abonelik server action'ları. Kilitliyken de çalışır (requireAdmin): ödeme kilidi açan tek yol.
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import type { BillingPeriod } from "@/lib/core/billing";
import { planPrice } from "./plans";
import { getBillingProvider } from "./provider";
import { completePayment, createPayment, paymentOf } from "./service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function startCheckout(form: FormData) {
  const a = await requireAdmin();
  const period: BillingPeriod = form.get("period") === "yillik" ? "yillik" : "aylik";
  const provider = getBillingProvider(), amount = planPrice(period);
  if (!provider || !amount) redirect("/yonetim/abonelik?sonuc=hata");
  const p = await createPayment(a.tenantId, provider.name, period, amount);
  const { redirectUrl } = await provider.start({ paymentId: p.id, amount, period, tenantName: a.tenantName, email: a.email });
  redirect(redirectUrl);
}

/** Yalnız sahte sağlayıcı: test ödeme sayfasının sonucu. */
export async function fakeResult(form: FormData) {
  const a = await requireAdmin();
  const id = String(form.get("id") ?? "");
  if (getBillingProvider()?.name !== "fake" || !UUID.test(id)) redirect("/yonetim/abonelik?sonuc=hata");
  const p = await paymentOf(a.tenantId, id);
  if (!p || p.provider !== "fake") redirect("/yonetim/abonelik?sonuc=hata");
  const r = await completePayment(p.id, form.get("ok") === "1", `fake-${p.id}`);
  redirect(`/yonetim/abonelik?sonuc=${r === "odendi" ? "ok" : "hata"}`);
}
```

- [ ] **Step 4: app/yonetim/abonelik/page.tsx**

```tsx
import { requireAdmin } from "@/lib/auth/session";
import { formatTL } from "@/lib/core/money";
import { PERIODS, STATE_LABEL } from "@/lib/core/billing";
import { planPrice, salesContact } from "@/lib/billing/plans";
import { getBillingProvider } from "@/lib/billing/provider";
import { paymentsOf } from "@/lib/billing/service";
import { startCheckout } from "@/lib/billing/actions";
import { Badge, Card, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
const day = (d: Date) => d.toLocaleDateString("tr-TR", { dateStyle: "long", timeZone: "Europe/Istanbul" });
const STATUS: Record<string, string> = { bekliyor: "Bekliyor", odendi: "Ödendi", basarisiz: "Başarısız" };

export default async function Abonelik({ searchParams }: { searchParams: Promise<{ kilit?: string; sonuc?: string }> }) {
  const a = await requireAdmin();
  const sp = await searchParams;
  const b = a.billing, provider = getBillingProvider(), contact = salesContact();
  const pays = await paymentsOf(a.tenantId);
  return (
    <>
      <PageHeader title="Abonelik" desc="ÇabukPOS aboneliği. Abonelik bitse de kasa satışa devam eder; yalnız yönetim salt okunur olur." />
      {sp.kilit && b.locked && <Card className="mb-4 border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">Abonelik sona erdiği için değişiklik yapılamıyor. Ödeme yapınca yönetim hemen açılır.</Card>}
      {sp.sonuc === "ok" && <Card className="mb-4 border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status">Ödeme alındı, teşekkürler.</Card>}
      {sp.sonuc === "hata" && <Card className="mb-4 border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">Ödeme tamamlanamadı. Tekrar deneyebilirsin.</Card>}
      <Card className="mb-6 flex flex-wrap items-center gap-3 p-4">
        <Badge tone={b.locked ? "bad" : b.warn ? "warn" : "ok"}><span data-testid="billing-state">{STATE_LABEL[b.state]}</span></Badge>
        <span className="text-sm" data-testid="billing-ends">
          {b.state === "deneme" || b.state === "aktif" ? `Bitiş: ${day(b.endsAt)} (${b.daysLeft} gün)` : `Bitti: ${day(b.endsAt)} · salt okunur: ${day(b.lockAt)}`}
        </span>
        {provider?.test && <Badge tone="warn">TEST ödeme</Badge>}
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        {PERIODS.map((p) => {
          const price = planPrice(p.key);
          return (
            <Card key={p.key} className="p-4">
              <h2 className="font-semibold">{p.label}</h2>
              <div className="my-2 text-2xl font-semibold tabular-nums">{price ? formatTL(price) : "—"}</div>
              {provider && price ? (
                <form action={startCheckout}>
                  <input type="hidden" name="period" value={p.key} />
                  <button className="w-full rounded-lg bg-brand py-2.5 font-medium text-white">{p.label} öde</button>
                </form>
              ) : <p className="text-sm text-muted">Online ödeme yakında.{contact ? ` Ödeme için: ${contact}` : ""}</p>}
            </Card>
          );
        })}
      </div>
      {pays.length > 0 && (
        <Card className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-muted"><tr>{["Tarih", "Dönem", "Tutar", "Durum", "Dönem sonu"].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">{pays.map((p) => (
              <tr key={p.id}><td className="px-4 py-2.5">{day(p.createdAt)}</td><td className="px-4 py-2.5">{p.period === "yillik" ? "Yıllık" : "Aylık"}</td><td className="px-4 py-2.5 tabular-nums">{formatTL(p.amount)}</td><td className="px-4 py-2.5">{STATUS[p.status] ?? p.status}</td><td className="px-4 py-2.5">{p.periodEnd ? day(p.periodEnd) : "—"}</td></tr>
            ))}</tbody>
          </table>
        </Card>
      )}
    </>
  );
}
```

- [ ] **Step 5: app/yonetim/abonelik/test-odeme/[id]/page.tsx**

```tsx
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { formatTL } from "@/lib/core/money";
import { getBillingProvider } from "@/lib/billing/provider";
import { paymentOf } from "@/lib/billing/service";
import { fakeResult } from "@/lib/billing/actions";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TestOdeme({ params }: { params: Promise<{ id: string }> }) {
  const a = await requireAdmin();
  const { id } = await params;
  if (getBillingProvider()?.name !== "fake" || !UUID.test(id)) notFound();
  const p = await paymentOf(a.tenantId, id);
  if (!p || p.status !== "bekliyor") notFound();
  return (
    <Card className="mx-auto max-w-md p-6">
      <div className="mb-4 rounded bg-amber-100 px-2 py-1 text-center text-xs font-semibold text-amber-900">TEST ÖDEME — gerçek para çekilmez</div>
      <h1 className="text-lg font-semibold">ÇabukPOS {p.period === "yillik" ? "yıllık" : "aylık"} abonelik</h1>
      <div className="my-4 text-3xl font-semibold tabular-nums">{formatTL(p.amount)}</div>
      <form action={fakeResult} className="flex gap-2">
        <input type="hidden" name="id" value={p.id} />
        <button name="ok" value="0" className="flex-1 rounded-lg border border-line py-2.5">Başarısız</button>
        <button name="ok" value="1" className="flex-[2] rounded-lg bg-brand py-2.5 font-medium text-white">Ödemeyi onayla</button>
      </form>
    </Card>
  );
}
```

- [ ] **Step 6: layout bandı** — `app/yonetim/layout.tsx`: import `Link` ve `bannerText`; `<main …>` içinde `{children}`'dan önce:

```tsx
        {a.billing.warn && (
          <div data-testid="billing-banner" className={`mb-6 rounded-lg border p-3 text-sm print:hidden ${a.billing.locked ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
            {bannerText(a.billing)} <Link href="/yonetim/abonelik" className="font-medium underline">Abonelik</Link>
          </div>
        )}
```

- [ ] **Step 7: Nav** — `app/yonetim/Nav.tsx` `items` dizisinin sonuna `{ href: "/yonetim/abonelik", label: "Abonelik" },`.

- [ ] **Step 8:** `npx tsc --noEmit && npx eslint app/yonetim lib/billing lib/auth lib/admin 2>&1 | tail -3` → temiz.

- [ ] **Step 9: Commit** `git commit -am … ` + yeni dosyalar: "M9b Görev 2: requireWriter kilidi, Abonelik sayfası, sahte ödeme akışı, uyarı bandı"

---

### Task 3: Kasa notu + hatırlatma cron'u

**Files:** Create `lib/mail.ts`, `app/api/cron/billing/route.ts`; Modify `app/api/sync/catalog/route.ts`, `lib/offline/state.ts:11`, `components/kasa/KasaApp.tsx` (Vardiya kapalı ekranı), `vercel.json`.

- [ ] **Step 1: lib/mail.ts**

```ts
// lib/mail.ts — Resend (bağımlılıksız). Yapılandırma yoksa false; çağıran atlar.
export const mailReady = () => !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM && process.env.APP_URL);
export const appUrl = () => (process.env.APP_URL ?? "").replace(/\/$/, "");
export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export async function sendEmail(m: { to: string[]; subject: string; text: string; html: string }): Promise<boolean> {
  if (!mailReady() || !m.to.length) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.MAIL_FROM, ...m }),
  }).catch(() => null);
  return !!res?.ok;
}
```

- [ ] **Step 2: app/api/cron/billing/route.ts**

```ts
// Günlük abonelik hatırlatması (Vercel Cron): bitişe 1-7 gün kala sahiplere, aynı bitişe bir kez.
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { billingInfo, reminderDue } from "@/lib/core/billing";
import { appUrl, esc, mailReady, sendEmail } from "@/lib/mail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("yetkisiz", { status: 401 });
  if (!mailReady()) return Response.json({ skipped: "mail" });
  const T = schema.tenants, U = schema.users;
  const rows = await getDb().select({ id: T.id, name: T.name, trialEndsAt: T.trialEndsAt, paidUntil: T.paidUntil, remindedEnd: T.billingRemindedEnd }).from(T);
  let sent = 0;
  for (const t of rows) {
    if (!reminderDue(t)) continue;
    const i = billingInfo(t);
    const owners = await getDb().select({ email: U.email }).from(U).where(and(eq(U.tenantId, t.id), eq(U.role, "sahip"), eq(U.active, true)));
    const url = `${appUrl()}/yonetim/abonelik`;
    const what = i.state === "deneme" ? "deneme süren" : "aboneliğin";
    const ok = await sendEmail({
      to: owners.map((o) => o.email),
      subject: `ÇabukPOS ${what} ${i.daysLeft} gün sonra bitiyor`,
      text: `${t.name} için ÇabukPOS ${what} ${i.daysLeft} gün sonra bitiyor. Kasa satışa devam eder; yönetimi açık tutmak için:\n${url}\n`,
      html: `<p>${esc(t.name)} için ÇabukPOS ${what} <b>${i.daysLeft} gün</b> sonra bitiyor. Kasa satışa devam eder; yönetimi açık tutmak için:</p><p><a href="${url}">${url}</a></p>`,
    });
    if (ok) { await getDb().update(T).set({ billingRemindedEnd: i.endsAt }).where(eq(T.id, t.id)); sent++; }
  }
  return Response.json({ sent });
}
```

- [ ] **Step 3: vercel.json** → `"crons": [{ "path": "/api/cron/fiscal", "schedule": "0 3 * * *" }, { "path": "/api/cron/billing", "schedule": "0 6 * * *" }]`

- [ ] **Step 4: kasa** — `lib/offline/state.ts` `DeviceInfo`'ya `billing?: { state: BillingState; daysLeft: number } | null` (import type `BillingState`). `app/api/sync/catalog/route.ts`: dönüşten önce

```ts
  const [bt] = await getDb().select({ trialEndsAt: schema.tenants.trialEndsAt, paidUntil: schema.tenants.paidUntil }).from(schema.tenants).where(eq(schema.tenants.id, device.tenantId));
  const bi = bt ? billingInfo(bt) : null;
```
ve `device: { …, nextReceiptNo: dv?.next ?? 1, billing: bi?.warn ? { state: bi.state, daysLeft: bi.daysLeft } : null }`. `KasaApp.tsx` "Vardiya kapalı" `<Center>` içinde `MoneyForm`'dan önce:

```tsx
          {d.billing && <p data-testid="kasa-billing" className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{d.billing.state === "deneme" || d.billing.state === "aktif" ? `Abonelik ${d.billing.daysLeft} gün sonra bitiyor.` : "Abonelik sona erdi. Satış devam eder; yöneticinize haber verin."}</p>}
```

- [ ] **Step 5:** `npx tsc --noEmit && npx eslint app/api lib/mail.ts components/kasa lib/offline 2>&1 | tail -3` → temiz. Commit "M9b Görev 3: kasada abonelik notu, günlük hatırlatma cron'u, lib/mail".

---

### Task 4: E2E + ilerleme

**Files:** Create `e2e/m9b.mjs`; Modify `docs/PROGRESS.md`, `.env.local` (yalnız yerel: `BILLING_PROVIDER=fake`, `PLAN_PRICE_AYLIK=100000`, `PLAN_PRICE_YILLIK=1000000` — TEST değerleri, gerçek fiyat değil).

- [ ] **Step 1: e2e/m9b.mjs**

```js
// e2e/m9b.mjs — Abonelik. Kayıt → Deneme 14 gün → (DB) deneme 10 gün önce bitti → kilit bandı →
// ürün kaydı Abonelik'e yönlenir → [ödeme açıksa] başarısız aylık → hata, hâlâ kilitli → yıllık öde → Aktif,
// dönem ~1 yıl → ürün kaydı açık. Ödeme kapalıysa (canlı) ödeme adımları atlanır.
// Kullanım: npm run build && node --env-file=.env.local e2e/m9b.mjs (sunucu :3800)
import { chromium } from "playwright-core";
import postgres from "postgres";

const BASE = process.env.BASE ?? "http://localhost:3800";
const stamp = Date.now();
const tenant = `E2E Kebapçı ${stamp}`;
const step = (m) => console.log("•", m);
const expect = (got, want, what) => { if (got !== want) throw new Error(`${what}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`); };

const browser = await chromium.launch({ channel: "chrome", headless: true });
const sql = postgres(process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL, { max: 1 });
const errors = [];
const text = async (loc) => (await loc.innerText()).trim();
const addProduct = async (p, name) => {
  await p.goto(`${BASE}/yonetim/urunler`);
  await p.fill("input[name=name]", name);
  await p.fill("input[name=price]", "100");
  await p.getByRole("button", { name: "%10", exact: true }).click();
  await p.getByRole("button", { name: "Ürünü kaydet" }).click();
};

try {
  const admin = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  admin.on("pageerror", (e) => errors.push(e.message));
  await admin.goto(`${BASE}/kayit`);
  await admin.fill("input[name=businessName]", tenant);
  await admin.getByRole("button", { name: "Restoran" }).click();
  await admin.fill("input[name=name]", "Yiğit Test");
  await admin.fill("input[name=email]", `m9b-${stamp}@ornek.com`);
  await admin.fill("input[name=password]", "Cabukpos2026x");
  await admin.getByRole("button", { name: "Hesap oluştur" }).click();
  await admin.waitForURL(`${BASE}/yonetim**`);

  await admin.goto(`${BASE}/yonetim/abonelik`);
  expect(await text(admin.getByTestId("billing-state")), "Deneme", "yeni işletme");
  if (!(await text(admin.getByTestId("billing-ends"))).includes("(14 gün)")) throw new Error("deneme 14 gün değil");
  if (await admin.getByTestId("billing-banner").count()) throw new Error("denemenin başında bant olmamalı");
  step("kayıt: Deneme, 14 gün, bant yok");

  await sql`update tenants set trial_ends_at = now() - interval '10 days' where name = ${tenant}`;
  await admin.goto(`${BASE}/yonetim`);
  await admin.getByTestId("billing-banner").getByText(/salt okunur/).waitFor();
  await addProduct(admin, "Adana");
  await admin.waitForURL(/\/yonetim\/abonelik\?kilit=1/);
  await admin.getByRole("alert").getByText(/değişiklik yapılamıyor/).waitFor();
  expect(await text(admin.getByTestId("billing-state")), "Kilitli", "kilit");
  step("deneme 10 gün önce bitti → bant, ürün kaydı Abonelik'e yönlendi");

  if (await admin.getByText("Online ödeme yakında").count()) {
    step("ödeme kapalı (BILLING_PROVIDER yok) → ödeme adımları atlandı");
  } else {
    await admin.getByRole("button", { name: "Aylık öde" }).click();
    await admin.getByText("TEST ÖDEME").waitFor();
    await admin.getByRole("button", { name: "Başarısız" }).click();
    await admin.waitForURL(/sonuc=hata/);
    expect(await text(admin.getByTestId("billing-state")), "Kilitli", "başarısız ödeme sonrası");
    await admin.getByRole("button", { name: "Yıllık öde" }).click();
    await admin.getByRole("button", { name: "Ödemeyi onayla" }).click();
    await admin.waitForURL(/sonuc=ok/);
    expect(await text(admin.getByTestId("billing-state")), "Aktif", "ödeme sonrası");
    const [t] = await sql`select extract(epoch from paid_until - now()) / 86400 as d from tenants where name = ${tenant}`;
    if (!(Number(t.d) > 364 && Number(t.d) <= 366)) throw new Error(`dönem ${t.d} gün`);
    await addProduct(admin, "Adana");
    await admin.getByRole("cell", { name: "Adana", exact: true }).waitFor();
    step("başarısız aylık → hâlâ kilitli; yıllık → Aktif (~365 gün), ürün kaydı açıldı");
  }

  if (errors.length) throw new Error(`sayfa hataları: ${errors.join(" | ")}`);
  console.log("M9b OK");
} finally {
  await browser.close();
  await sql.end();
}
```

- [ ] **Step 2:** yerel şema (`npm run db:push`), `.env.local` test değerleri, build, :3800 yeniden başlat, `node --env-file=.env.local e2e/m9b.mjs` → `M9b OK`. Regresyon: `e2e/m1.mjs`, `e2e/m9a.mjs`, `npm test` (kayıt sınırı dolarsa yerelde `delete from login_attempts where key like 'signup:%'`).

- [ ] **Step 3:** `docs/PROGRESS.md` M9b bölümü; `scripts/prod-push.sh` (git dışı) m9b'ye; commit + push.
