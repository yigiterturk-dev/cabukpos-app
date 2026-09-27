# ÇabukPOS M1 — Çekirdek + Kasa Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans ile, ANA oturumda (Yiğit kuralı: ajan yok, token ekonomisi). Adımlar `- [ ]` ile işaretlenir.
> Kod kapsamı notu (Yiğit'in token kuralı skill'in önünde): tam kod, doğruluğu kritik yerlerde (saf çekirdek, şema + RLS, satış kaydı, testler) verildi. Arayüz görevleri kesin dosya, davranış ve metinle tanımlı; bileşenler restoran-zirve `components/ui.tsx` + `useFormAction.ts` kopyalanarak yazılır, E2E kodu tam verildi.

**Goal:** Bir işletme kaydolur, ürün/personel/cihaz tanımlar; eşlenen kasada PIN ile girilir, vardiya açılır, hızlı satış yapılır (nakit/kart/yemek kartı/karma), 80 mm bilgi fişi basılır, gün sonu kapatılır.

**Architecture:** Yeni depo `~/nocturn-saas-suite/cabukpos-app`, Next.js 16 App Router. Postgres'te her iş tablosunda `tenant_id` + FORCE RLS; uygulama süper kullanıcı OLMAYAN `cabukpos_app` rolüyle bağlanır, her istek `withTenant()` işlemi içinde `app.tenant_id` ayarlar. Kimlik tabloları (tenants, users, devices) RLS dışı, yalnız kimlik kodu erişir. Saf çekirdek (`lib/core`) DB'siz ve birim testli; M2'de istemcide aynen çalışacak.

**Tech Stack:** Next.js ^16.3.6, React 19.1, Tailwind 4, TypeScript 5, drizzle-orm ^0.45 + drizzle-kit, postgres ^3.4, jose ^6, bcryptjs ^3, zod ^4; test: `node --test` + restoran-zirve `tests/ts-resolve*.mjs`; E2E: playwright-core + sistem Chrome.

## Global Constraints

- Para her yerde tamsayı **kuruş**; fiyatlar KDV dahil; KDV oranları yalnız 1, 10, 20.
- Miktar `qtyMilli` (1 adet = 1000); M1 arayüzü yalnız adet artırır.
- Satır adı/fiyatı/KDV'si satışa kopyalanır.
- Fiş no cihaz başına boşluksuz: `<önek>-<6 hane>` (ör. `K1-000001`).
- Next 16: `middleware.ts` değil `proxy.ts`.
- Native `<select>` YOK (restoran-zirve `components/Select.tsx` kopyalanır); zemin beyaz.
- Git yazarı `r.y.erturk@gmail.com`; commit sonunda AI imzası yok (Yiğit kuralı); main'e doğrudan push.
- Metinler Türkçe; bilgi fişinde "Bilgi fişidir, mali değeri yoktur." yazar.
- Uygulama DB rolü RLS'yi atlamaz: `DATABASE_URL` = `cabukpos_app`, şema işleri `MIGRATE_DATABASE_URL` = sahip rol.

## Dosya haritası

```
cabukpos-app/
  db/schema.ts            tablolar
  db/index.ts             getDb(), withTenant()
  db/rls.sql              rol, yetki, RLS politikaları (idempotent)
  scripts/db-rls.mjs      rls.sql'i MIGRATE_DATABASE_URL'e uygular
  lib/core/money.ts       kuruş, TL biçim/ayrıştırma, KDV ayırma
  lib/core/cart.ts        sepet
  lib/core/payment.ts     ödeme kapatma, para üstü
  lib/core/shift.ts       vardiya özeti
  lib/auth/pin.ts         PIN kuralı + PBKDF2 (WebCrypto; M2'de istemcide de çalışır)
  lib/auth/tokens.ts      eşleme kodu, cihaz jetonu, sha256
  lib/auth/session.ts     yönetici oturumu (cz_session)
  lib/auth/kasa.ts        cihaz (cz_device) + kasiyer (cz_cashier) çözümü
  lib/kasa/sale.ts        recordSale (idempotent)
  lib/kasa/actions.ts     kasa server action'ları
  lib/admin/*.ts          ürün, personel, cihaz action'ları + zod doğrulama
  app/(auth)/kayit, giris
  app/yonetim/{urunler,personel,cihazlar,raporlar}
  app/kasa/{page,eslestir,fis/[id],gun-sonu}
  proxy.ts
  tests/*.test.ts, e2e/m1.mjs
```

---

### Task 1: Depo iskeleti + DB'ler + test düzeni

**Files:** Create: tüm iskelet, `.env.local`, `.env.example`, `tests/ts-resolve.mjs`, `tests/ts-resolve-hooks.mjs`, `docs/` (spec + bu plan kopyası), `docs/PROGRESS.md`

- [ ] **Step 1: İskelet**

```bash
cd ~/nocturn-saas-suite
npx create-next-app@latest cabukpos-app --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --turbopack --yes
cd cabukpos-app
git config user.email r.y.erturk@gmail.com && git config user.name "Yiğit Ertürk"
npm i drizzle-orm postgres jose bcryptjs zod
npm i -D drizzle-kit @types/bcryptjs playwright-core
cp ../restoran-zirve/tests/ts-resolve.mjs ../restoran-zirve/tests/ts-resolve-hooks.mjs tests/ 2>/dev/null || (mkdir -p tests && cp ../restoran-zirve/tests/ts-resolve*.mjs tests/)
mkdir -p docs/superpowers/specs docs/superpowers/plans
cp ../restoran-zirve/docs/superpowers/specs/2026-09-28-cabukpos-pos-design.md docs/superpowers/specs/
cp ../restoran-zirve/docs/superpowers/plans/2026-09-28-cabukpos-m1-cekirdek-kasa.md docs/superpowers/plans/
cp ../restoran-zirve/components/ui.tsx ../restoran-zirve/components/useFormAction.ts ../restoran-zirve/components/Select.tsx components/ 2>/dev/null || (mkdir -p components && cp ../restoran-zirve/components/{ui.tsx,useFormAction.ts,Select.tsx} components/)
```
`app/globals.css`'e restoran-zirve'deki `@theme` renk belirteçlerini (`--color-brand`, `--color-brand-soft`, `--color-line`, `--color-muted`, `--color-ink`) kopyala.

- [ ] **Step 2: Veritabanları ve rol**

```bash
createdb cabukpos && createdb cabukpos_test
```
`.env.local`:
```
MIGRATE_DATABASE_URL=postgres://yigiterturk@localhost:5432/cabukpos
DATABASE_URL=postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos
AUTH_SECRET=<openssl rand -base64 48>
```
`.env.example` aynı anahtarlar, değerler boş. `.gitignore`'da `.env*.local` olduğunu doğrula.

- [ ] **Step 3: package.json script'leri**

```json
"test": "node --import ./tests/ts-resolve.mjs --test \"tests/*.test.ts\"",
"db:push": "sh -c 'DATABASE_URL=$(grep ^MIGRATE_DATABASE_URL .env.local | cut -d= -f2-) node node_modules/drizzle-kit/bin.cjs push --force'",
"db:rls": "node --env-file=.env.local scripts/db-rls.mjs",
"db:push:test": "DATABASE_URL=postgres://yigiterturk@localhost:5432/cabukpos_test node node_modules/drizzle-kit/bin.cjs push --force",
"db:rls:test": "MIGRATE_DATABASE_URL=postgres://yigiterturk@localhost:5432/cabukpos_test node scripts/db-rls.mjs"
```
`drizzle.config.ts`: `{ schema: "./db/schema.ts", dialect: "postgresql", dbCredentials: { url: process.env.DATABASE_URL! } }`.

- [ ] **Step 4: Doğrula + commit**

Run: `npm run build 2>&1 | tail -3` → başarılı. `docs/PROGRESS.md` oluştur (başlık + "M1 — Çekirdek + kasa" altında bu plandaki görevler `- [ ]`).
```bash
git add -A && git commit -m "İskelet: Next 16, drizzle, test düzeni, spec + M1 planı"
gh repo create yigiterturk-dev/cabukpos-app --private --source . --push
```

---

### Task 2: Para ve sepet çekirdeği (saf)

**Files:** Create `lib/core/money.ts`, `lib/core/cart.ts`; Test `tests/cart.test.ts`

**Interfaces — Produces:**
`Kurus = number`, `VatRate = 1|10|20`, `VAT_RATES`, `parseTL(s): Kurus|null`, `formatTL(k): string`, `splitVat(gross, rate): {net, vat}`;
`CartProduct {id,name,price,vatRate}`, `CartLine {productId,name,unitPrice,vatRate,qtyMilli}`, `addProduct(cart,p,qtyMilli=1000)`, `setQty(cart,productId,qtyMilli)`, `lineTotal(l)`, `VatLine {rate,gross,net,vat}`, `totals(cart): {total, count, vat: VatLine[]}`

- [ ] **Step 1: Test**

```ts
// tests/cart.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatTL, parseTL, splitVat } from "@/lib/core/money";
import { addProduct, lineTotal, setQty, totals } from "@/lib/core/cart";

const doner = { id: "d", name: "Döner", price: 18000, vatRate: 10 as const };
const ayran = { id: "a", name: "Ayran", price: 2500, vatRate: 10 as const };
const su = { id: "s", name: "Su", price: 1000, vatRate: 20 as const };

test("TL ayrıştırma ve biçim", () => {
  assert.equal(parseTL("12,50"), 1250);
  assert.equal(parseTL("12.5"), 1250);
  assert.equal(parseTL("1.234,56"), 123456);
  assert.equal(parseTL(" 7 ₺"), 700);
  assert.equal(parseTL("0,005"), null);
  assert.equal(parseTL("-3"), null);
  assert.equal(parseTL("abc"), null);
  assert.equal(formatTL(123456), "1.234,56 ₺");
  assert.equal(formatTL(-500), "-5,00 ₺");
});

test("KDV ayırma (dahil fiyattan)", () => {
  assert.deepEqual(splitVat(38500, 10), { net: 35000, vat: 3500 });
  assert.deepEqual(splitVat(1000, 20), { net: 833, vat: 167 });
  assert.deepEqual(splitVat(1, 1), { net: 1, vat: 0 });
});

test("sepet: ekle birleştirir, miktar 0 siler, toplam ve oran bazında KDV", () => {
  let c = addProduct([], doner);
  c = addProduct(c, ayran);
  c = addProduct(c, doner);
  assert.equal(c.length, 2);
  assert.equal(c[0].qtyMilli, 2000);
  assert.equal(lineTotal(c[0]), 36000);
  c = addProduct(c, su);
  const t = totals(c);
  assert.equal(t.total, 39500);
  assert.equal(t.count, 4);
  assert.deepEqual(t.vat, [
    { rate: 10, gross: 38500, net: 35000, vat: 3500 },
    { rate: 20, gross: 1000, net: 833, vat: 167 },
  ]);
  c = setQty(c, "s", 0);
  assert.equal(c.length, 2);
  assert.equal(lineTotal({ ...c[1], qtyMilli: 1500 }), 3750); // M3 tartılı için kesirli miktar
});
```

- [ ] **Step 2:** Run `node --import ./tests/ts-resolve.mjs --test tests/cart.test.ts` → FAIL (modül yok)

- [ ] **Step 3: Uygulama**

```ts
// lib/core/money.ts — Saf para yardımcıları. Tutarlar tamsayı kuruş, fiyatlar KDV dahil.
export type Kurus = number;
export const VAT_RATES = [1, 10, 20] as const;
export type VatRate = (typeof VAT_RATES)[number];
export const isVatRate = (n: number): n is VatRate => (VAT_RATES as readonly number[]).includes(n);

/** "12,50", "12.5", "1.234,56", "7 ₺" → kuruş. Negatif, 2'den fazla kuruş hanesi ya da çöp → null. */
export function parseTL(input: string): Kurus | null {
  let s = input.replace(/[\s₺]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [int, frac = ""] = s.split(".");
  return Number(int) * 100 + Number(frac.padEnd(2, "0"));
}

const fmt = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const formatTL = (k: Kurus) => `${fmt.format(k / 100)} ₺`;

/** KDV dahil tutardan net + KDV (net yuvarlanır, KDV = fark → toplam her zaman tutar). */
export function splitVat(gross: Kurus, rate: VatRate): { net: Kurus; vat: Kurus } {
  const net = Math.round((gross * 100) / (100 + rate));
  return { net, vat: gross - net };
}
```

```ts
// lib/core/cart.ts — Saf sepet. Miktar qtyMilli (1 adet = 1000).
import { splitVat, type Kurus, type VatRate } from "./money";

export type CartProduct = { id: string; name: string; price: Kurus; vatRate: VatRate };
export type CartLine = { productId: string; name: string; unitPrice: Kurus; vatRate: VatRate; qtyMilli: number };
export type VatLine = { rate: VatRate; gross: Kurus; net: Kurus; vat: Kurus };

export const lineTotal = (l: CartLine): Kurus => Math.round((l.unitPrice * l.qtyMilli) / 1000);

export function addProduct(cart: CartLine[], p: CartProduct, qtyMilli = 1000): CartLine[] {
  const i = cart.findIndex((l) => l.productId === p.id);
  if (i === -1) return [...cart, { productId: p.id, name: p.name, unitPrice: p.price, vatRate: p.vatRate, qtyMilli }];
  return cart.map((l, j) => (j === i ? { ...l, qtyMilli: l.qtyMilli + qtyMilli } : l));
}

export function setQty(cart: CartLine[], productId: string, qtyMilli: number): CartLine[] {
  return qtyMilli <= 0 ? cart.filter((l) => l.productId !== productId) : cart.map((l) => (l.productId === productId ? { ...l, qtyMilli } : l));
}

export function totals(cart: CartLine[]): { total: Kurus; count: number; vat: VatLine[] } {
  const byRate = new Map<VatRate, Kurus>();
  let total = 0;
  let count = 0;
  for (const l of cart) {
    const t = lineTotal(l);
    total += t;
    count += Math.ceil(l.qtyMilli / 1000);
    byRate.set(l.vatRate, (byRate.get(l.vatRate) ?? 0) + t);
  }
  const vat = [...byRate].sort(([a], [b]) => a - b).map(([rate, gross]) => ({ rate, gross, ...splitVat(gross, rate) }));
  return { total, count, vat };
}
```

- [ ] **Step 4:** Run aynı komut → PASS (3 test)
- [ ] **Step 5:** `git add lib/core tests/cart.test.ts && git commit -m "Çekirdek: kuruş, KDV ayırma, sepet"`

---

### Task 3: Ödeme kapatma + vardiya özeti (saf)

**Files:** Create `lib/core/payment.ts`, `lib/core/shift.ts`; Test `tests/payment.test.ts`

**Interfaces — Produces:** `PayMethod = "nakit"|"kart"|"yemek_karti"`, `PAY_METHODS: {value,label}[]`, `Payment {method, amount}`, `settle(total, payments): {ok:true, payments, paid, change} | {ok:false, error}`; `ShiftSale {total, change, payments, vat}`, `summarizeShift(openingCash, sales): {saleCount, gross, byMethod: Record<PayMethod,Kurus>, netCash, expectedCash, vat: VatLine[]}`

- [ ] **Step 1: Test**

```ts
// tests/payment.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { settle } from "@/lib/core/payment";
import { summarizeShift } from "@/lib/core/shift";

test("ödeme: tam, karma, para üstü yalnız nakitten, hatalar", () => {
  assert.deepEqual(settle(38500, [{ method: "kart", amount: 38500 }]), { ok: true, payments: [{ method: "kart", amount: 38500 }], paid: 38500, change: 0 });
  const k = settle(38500, [{ method: "kart", amount: 20000 }, { method: "nakit", amount: 10000 }, { method: "nakit", amount: 10000 }]);
  assert.deepEqual(k, { ok: true, payments: [{ method: "kart", amount: 20000 }, { method: "nakit", amount: 20000 }], paid: 40000, change: 1500 });
  assert.match((settle(38500, [{ method: "kart", amount: 40000 }]) as { error: string }).error, /aşamaz/);
  assert.match((settle(38500, [{ method: "nakit", amount: 30000 }]) as { error: string }).error, /Eksik ödeme: 85,00 ₺/);
  assert.match((settle(100, [{ method: "nakit", amount: -5 }]) as { error: string }).error, /Geçersiz tutar/);
  assert.match((settle(100, []) as { error: string }).error, /Eksik ödeme/);
});

test("vardiya özeti: yöntem bazında, net nakit, beklenen kasa, KDV", () => {
  const s = summarizeShift(50000, [
    { total: 38500, change: 1500, payments: [{ method: "kart", amount: 20000 }, { method: "nakit", amount: 20000 }], vat: [{ rate: 10, gross: 38500, net: 35000, vat: 3500 }] },
    { total: 1000, change: 0, payments: [{ method: "nakit", amount: 1000 }], vat: [{ rate: 20, gross: 1000, net: 833, vat: 167 }] },
  ]);
  assert.equal(s.saleCount, 2);
  assert.equal(s.gross, 39500);
  assert.deepEqual(s.byMethod, { nakit: 19500, kart: 20000, yemek_karti: 0 });
  assert.equal(s.expectedCash, 69500);
  assert.deepEqual(s.vat.map((v) => [v.rate, v.gross, v.vat]), [[10, 38500, 3500], [20, 1000, 167]]);
});
```

- [ ] **Step 2:** Run `node --import ./tests/ts-resolve.mjs --test tests/payment.test.ts` → FAIL
- [ ] **Step 3: Uygulama**

```ts
// lib/core/payment.ts — Ödeme kapatma (saf). Kart/yemek kartı toplamı aşamaz; para üstü yalnız nakitten.
import { formatTL, type Kurus } from "./money";

export const PAY_METHODS = [
  { value: "nakit", label: "Nakit" },
  { value: "kart", label: "Kart" },
  { value: "yemek_karti", label: "Yemek kartı" },
] as const;
export type PayMethod = (typeof PAY_METHODS)[number]["value"];
export type Payment = { method: PayMethod; amount: Kurus };
export type Settlement = { ok: true; payments: Payment[]; paid: Kurus; change: Kurus } | { ok: false; error: string };

export function settle(total: Kurus, input: Payment[]): Settlement {
  if (input.some((p) => !Number.isInteger(p.amount) || p.amount <= 0 || !PAY_METHODS.some((m) => m.value === p.method))) return { ok: false, error: "Geçersiz tutar ya da ödeme türü." };
  const merged = new Map<PayMethod, Kurus>();
  for (const p of input) merged.set(p.method, (merged.get(p.method) ?? 0) + p.amount);
  const payments = [...merged].map(([method, amount]) => ({ method, amount }));
  const nonCash = payments.filter((p) => p.method !== "nakit").reduce((a, p) => a + p.amount, 0);
  if (nonCash > total) return { ok: false, error: "Kart ve yemek kartı tutarı toplamı aşamaz." };
  const paid = payments.reduce((a, p) => a + p.amount, 0);
  if (paid < total) return { ok: false, error: `Eksik ödeme: ${formatTL(total - paid)}` };
  return { ok: true, payments, paid, change: paid - total };
}
```

```ts
// lib/core/shift.ts — Vardiya (gün sonu) özeti (saf). Nakit = alınan nakit − para üstü.
import type { Kurus, VatRate } from "./money";
import type { VatLine } from "./cart";
import { splitVat } from "./money";
import type { Payment, PayMethod } from "./payment";

export type ShiftSale = { total: Kurus; change: Kurus; payments: Payment[]; vat: VatLine[] };

export function summarizeShift(openingCash: Kurus, sales: ShiftSale[]) {
  const byMethod: Record<PayMethod, Kurus> = { nakit: 0, kart: 0, yemek_karti: 0 };
  const byRate = new Map<VatRate, Kurus>();
  let gross = 0;
  for (const s of sales) {
    gross += s.total;
    for (const p of s.payments) byMethod[p.method] += p.amount;
    byMethod.nakit -= s.change;
    for (const v of s.vat) byRate.set(v.rate, (byRate.get(v.rate) ?? 0) + v.gross);
  }
  const vat = [...byRate].sort(([a], [b]) => a - b).map(([rate, g]) => ({ rate, gross: g, ...splitVat(g, rate) }));
  return { saleCount: sales.length, gross, byMethod, netCash: byMethod.nakit, expectedCash: openingCash + byMethod.nakit, vat };
}
```

- [ ] **Step 4:** Run → PASS (2 test)
- [ ] **Step 5:** `git add lib/core tests/payment.test.ts && git commit -m "Çekirdek: ödeme kapatma, vardiya özeti"`

---

### Task 4: PIN ve cihaz jetonları (saf)

**Files:** Create `lib/auth/pin.ts`, `lib/auth/tokens.ts`; Test `tests/pin.test.ts`

**Interfaces — Produces:** `pinProblem(pin): string|null`, `hashPin(pin, iterations=100_000): Promise<string>` (biçim `pbkdf2$<iter>$<salt b64url>$<hash b64url>`), `verifyPin(pin, stored): Promise<boolean>`; `newPairingCode(): string` (8 karakter, `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`), `newDeviceToken(): string` (32 bayt b64url), `sha256(s): Promise<string>` (hex)

- [ ] **Step 1: Test**

```ts
// tests/pin.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPin, pinProblem, verifyPin } from "@/lib/auth/pin";
import { newDeviceToken, newPairingCode, sha256 } from "@/lib/auth/tokens";

test("PIN kuralı", () => {
  assert.equal(pinProblem("4826"), null);
  assert.equal(pinProblem("482619"), null);
  assert.match(pinProblem("123")!, /4-6 hane/);
  assert.match(pinProblem("12a4")!, /4-6 hane/);
  assert.match(pinProblem("1111")!, /tahmin/);
  assert.match(pinProblem("1234")!, /tahmin/);
  assert.match(pinProblem("987654")!, /tahmin/);
});

test("PIN hash: doğrula, yanlış PIN, bozuk kayıt, tuz farklı", async () => {
  const h = await hashPin("4826", 1000);
  assert.match(h, /^pbkdf2\$1000\$[\w-]+\$[\w-]+$/);
  assert.equal(await verifyPin("4826", h), true);
  assert.equal(await verifyPin("4827", h), false);
  assert.equal(await verifyPin("4826", "bozuk"), false);
  assert.notEqual(await hashPin("4826", 1000), h);
});

test("eşleme kodu, cihaz jetonu, sha256", async () => {
  const c = newPairingCode();
  assert.match(c, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  assert.notEqual(newPairingCode(), c);
  assert.match(newDeviceToken(), /^[\w-]{43}$/);
  assert.equal(await sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});
```

- [ ] **Step 2:** Run `node --import ./tests/ts-resolve.mjs --test tests/pin.test.ts` → FAIL
- [ ] **Step 3: Uygulama**

```ts
// lib/auth/pin.ts — Kasa PIN'i. WebCrypto PBKDF2: sunucuda ve (M2) tarayıcıda aynı kod.
const enc = new TextEncoder();
const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export function pinProblem(pin: string): string | null {
  if (!/^\d{4,6}$/.test(pin)) return "PIN 4-6 hane rakam olmalı.";
  const d = [...pin].map(Number);
  const same = d.every((x) => x === d[0]);
  const up = d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  const down = d.every((x, i) => i === 0 || x === d[i - 1] - 1);
  return same || up || down ? "Bu PIN kolay tahmin edilir; başka bir PIN seçin." : null;
}

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
}

export async function hashPin(pin: string, iterations = 100_000): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${iterations}$${b64u(salt)}$${b64u(await derive(pin, salt, iterations))}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [alg, it, salt, hash] = stored.split("$");
  if (alg !== "pbkdf2" || !it || !salt || !hash) return false;
  try {
    const got = await derive(pin, unb64u(salt), Number(it));
    const want = unb64u(hash);
    if (got.length !== want.length) return false;
    let diff = 0;
    for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i];
    return diff === 0;
  } catch {
    return false;
  }
}
```

```ts
// lib/auth/tokens.ts — Cihaz eşleme kodu, cihaz jetonu, sha256 (WebCrypto).
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 0/O, 1/I yok
export function newPairingCode(): string {
  return [...crypto.getRandomValues(new Uint8Array(8))].map((b) => ALPHA[b % ALPHA.length]).join("");
}
export function newDeviceToken(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export async function sha256(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, "0")).join("");
}
```
(Not: 256 % 32 = 0 → `b % 32` önyargısız.)

- [ ] **Step 4:** Run → PASS (3 test)
- [ ] **Step 5:** `git add lib/auth tests/pin.test.ts && git commit -m "PIN (PBKDF2) ve cihaz jetonları"`

---

### Task 5: Şema + RLS + withTenant

**Files:** Create `db/schema.ts`, `db/index.ts`, `db/rls.sql`, `scripts/db-rls.mjs`; Test `tests/rls.test.ts`

**Interfaces — Produces:** `schema.*` (aşağıda), `getDb()`, `withTenant<T>(tenantId, fn: (tx) => Promise<T>): Promise<T>`, `Tx` tipi

- [ ] **Step 1: Şema**

```ts
// db/schema.ts
import { pgTable, pgEnum, uuid, text, integer, boolean, timestamp, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";

export const vertical = pgEnum("vertical", ["restoran", "market"]);
export const userRole = pgEnum("user_role", ["sahip", "mudur"]);
export const staffRole = pgEnum("staff_role", ["kasiyer", "mudur"]);
export const payMethod = pgEnum("pay_method", ["nakit", "kart", "yemek_karti"]);
export const saleChannel = pgEnum("sale_channel", ["kasa", "masa", "paket", "platform"]);
export const saleStatus = pgEnum("sale_status", ["kapandi", "iptal"]);

const ts = (n: string) => timestamp(n, { withTimezone: true });
const tenantRef = () => uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" });

// — Kimlik tabloları (RLS yok; yalnız lib/auth erişir) —
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  vertical: vertical("vertical").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull().default("sahip"),
  active: boolean("active").notNull().default(true),
  tokenVersion: integer("token_version").notNull().default(0),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const devices = pgTable("devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  receiptPrefix: text("receipt_prefix").notNull(),
  nextReceiptNo: integer("next_receipt_no").notNull().default(1),
  tokenHash: text("token_hash").unique(),
  pairingCode: text("pairing_code").unique(),
  pairingExpiresAt: ts("pairing_expires_at"),
  pairedAt: ts("paired_at"),
  revokedAt: ts("revoked_at"),
  lastSeenAt: ts("last_seen_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("devices_prefix_uq").on(t.tenantId, t.receiptPrefix)]);

// — İş tabloları (RLS: tenant_id = app.tenant_id) —
export const stores = pgTable("stores", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  name: text("name").notNull(),
  address: text("address"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const staff = pgTable("staff", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  name: text("name").notNull(),
  role: staffRole("role").notNull().default("kasiyer"),
  pinHash: text("pin_hash").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  name: text("name").notNull(),
  sort: integer("sort").notNull().default(0),
});

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  price: integer("price").notNull(),
  vatRate: integer("vat_rate").notNull(),
  barcodes: text("barcodes").array().notNull().default([]),
  active: boolean("active").notNull().default(true),
  sort: integer("sort").notNull().default(0),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("products_tenant_idx").on(t.tenantId)]);

export const shifts = pgTable("shifts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  storeId: uuid("store_id").notNull().references(() => stores.id),
  deviceId: uuid("device_id").notNull().references(() => devices.id),
  openedBy: uuid("opened_by").notNull().references(() => staff.id),
  openedAt: ts("opened_at").notNull().defaultNow(),
  openingCash: integer("opening_cash").notNull(),
  closedBy: uuid("closed_by").references(() => staff.id),
  closedAt: ts("closed_at"),
  countedCash: integer("counted_cash"),
  expectedCash: integer("expected_cash"),
}, (t) => [index("shifts_device_idx").on(t.deviceId, t.closedAt)]);

export const sales = pgTable("sales", {
  id: uuid("id").primaryKey(), // istemci üretir (idempotent)
  tenantId: tenantRef(),
  storeId: uuid("store_id").notNull().references(() => stores.id),
  deviceId: uuid("device_id").notNull().references(() => devices.id),
  shiftId: uuid("shift_id").notNull().references(() => shifts.id),
  staffId: uuid("staff_id").notNull().references(() => staff.id),
  receiptNo: text("receipt_no").notNull(),
  channel: saleChannel("channel").notNull().default("kasa"),
  status: saleStatus("status").notNull().default("kapandi"),
  total: integer("total").notNull(),
  change: integer("change").notNull().default(0),
  vat: jsonb("vat").notNull().$type<{ rate: number; gross: number; net: number; vat: number }[]>(),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("sales_receipt_uq").on(t.deviceId, t.receiptNo), index("sales_shift_idx").on(t.shiftId)]);

export const saleLines = pgTable("sale_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  saleId: uuid("sale_id").notNull().references(() => sales.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  unitPrice: integer("unit_price").notNull(),
  vatRate: integer("vat_rate").notNull(),
  qtyMilli: integer("qty_milli").notNull(),
  total: integer("total").notNull(),
});

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  saleId: uuid("sale_id").notNull().references(() => sales.id, { onDelete: "cascade" }),
  method: payMethod("method").notNull(),
  amount: integer("amount").notNull(),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  actor: text("actor").notNull(), // "user:<id>" | "staff:<id>"
  action: text("action").notNull(),
  detail: jsonb("detail"),
  createdAt: ts("created_at").notNull().defaultNow(),
});
```

- [ ] **Step 2: RLS SQL + uygulayıcı**

```sql
-- db/rls.sql — idempotent. Uygulama rolü süper kullanıcı değil ve RLS'yi atlamaz.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'cabukpos_app') then
    create role cabukpos_app login password 'dev-app-pass' nosuperuser nobypassrls;
  end if;
end $$;
grant usage on schema public to cabukpos_app;
grant select, insert, update, delete on all tables in schema public to cabukpos_app;
alter default privileges in schema public grant select, insert, update, delete on tables to cabukpos_app;

do $$ declare t text; begin
  foreach t in array array['stores','staff','categories','products','shifts','sales','sale_lines','payments','audit_log'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format($p$create policy tenant_isolation on %I using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)$p$, t);
  end loop;
end $$;
```
Üretimde rol parolası: Neon konsolunda `cabukpos_app` rolü açılır, bu dosyadaki `create role` bloğu atlanır (rol zaten var).

```js
// scripts/db-rls.mjs — db/rls.sql'i sahip rolle uygular.
import { readFileSync } from "node:fs";
import postgres from "postgres";
const url = process.env.MIGRATE_DATABASE_URL;
if (!url) throw new Error("MIGRATE_DATABASE_URL gerekli");
const sql = postgres(url, { max: 1, onnotice: () => {} });
await sql.unsafe(readFileSync(new URL("../db/rls.sql", import.meta.url), "utf8"));
await sql.end();
console.log("RLS uygulandı");
```

- [ ] **Step 3: DB istemcisi**

```ts
// db/index.ts — Sunucu tarafı Drizzle. İş tablolarına YALNIZ withTenant içinden erişilir (RLS).
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema";

if (typeof window !== "undefined") throw new Error("db yalnız sunucuda");
type Db = ReturnType<typeof drizzle<typeof schema>>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
const g = globalThis as unknown as { __czDb?: Db; __czClient?: ReturnType<typeof postgres> };

export function getDb(): Db {
  if (!g.__czDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL tanımlı değil.");
    g.__czClient = postgres(url, { max: 5, prepare: false, onnotice: () => {} });
    g.__czDb = drizzle(g.__czClient, { schema });
  }
  return g.__czDb;
}

/** İşlem içinde app.tenant_id ayarlar; RLS bu kiracının satırlarını gösterir/yazdırır. */
export function withTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}

export async function closeDb() {
  await g.__czClient?.end();
  g.__czDb = undefined;
}
export { schema };
```

- [ ] **Step 4: RLS testi**

```ts
// tests/rls.test.ts — cabukpos_test üzerinde, uygulama rolüyle.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { eq, inArray } = await import("drizzle-orm");

after(async () => {
  await getDb().delete(schema.tenants).where(inArray(schema.tenants.name, ["RLS-A", "RLS-B"]));
  await closeDb();
});

test("RLS: kiracı yalnız kendini görür, başkası adına yazamaz, ayarsız hiçbir şey görmez", async () => {
  const [a, b] = await getDb().insert(schema.tenants).values([{ name: "RLS-A", vertical: "market" }, { name: "RLS-B", vertical: "restoran" }]).returning();
  await withTenant(a.id, (tx) => tx.insert(schema.products).values({ tenantId: a.id, name: "Süt", price: 3500, vatRate: 1 }));
  assert.equal((await withTenant(a.id, (tx) => tx.select().from(schema.products))).length, 1);
  assert.equal((await withTenant(b.id, (tx) => tx.select().from(schema.products))).length, 0);
  assert.equal((await getDb().select().from(schema.products).where(eq(schema.products.name, "Süt"))).length, 0);
  await assert.rejects(withTenant(b.id, (tx) => tx.insert(schema.products).values({ tenantId: a.id, name: "Sahte", price: 1, vatRate: 1 })), /row-level security/);
});
```

- [ ] **Step 5:** Run `npm run db:push:test && npm run db:rls:test && node --import ./tests/ts-resolve.mjs --test tests/rls.test.ts` → PASS. Sonra geliştirme DB'si: `npm run db:push && npm run db:rls`.
- [ ] **Step 6:** `git add db scripts tests/rls.test.ts drizzle.config.ts package.json && git commit -m "Şema + FORCE RLS + uygulama rolü + withTenant"`

---

### Task 6: Kayıt, yönetici girişi, proxy

**Files:** Create `lib/auth/session.ts`, `lib/auth/actions.ts`, `lib/ratelimit.ts` (restoran-zirve'den; `login_attempts` tablosu şemaya eklenir, RLS dışı), `app/(auth)/kayit/page.tsx`, `app/(auth)/giris/page.tsx`, `app/yonetim/layout.tsx`, `app/yonetim/page.tsx`, `proxy.ts`

**Interfaces — Produces:** `getAdmin(): Promise<{id,name,email,role,tenantId,tenantName,vertical}|null>`, `requireAdmin()` (yoksa `/giris`), `signup(state, form)`, `login(state, form)`, `logout()`

Davranış:
- `signup`: alanlar işletme adı, dikey (restoran/market — iki düğmeli seçim, native select yok), ad soyad, e-posta, şifre (≥10, harf+rakam; restoran-zirve `passwordProblem` kopyası `lib/auth/password.ts`). Tek işlemde: `tenants` → `users` (sahip, bcrypt 12) → `withTenant`: `stores` ("Merkez") + `audit_log` ("tenant.signup"). E-posta var → "Bu e-posta zaten kayıtlı." IP başına saatte 5 kayıt (`hit("signup:<ip>", 60)`). Başarı → oturum + `/yonetim`.
- `login`: restoran-zirve `lib/auth/actions.ts` ile aynı (deneme sınırı, `lastLoginAt` yok), oturum yükü `{ userId, tenantId, v }`, çerez `cz_session`, 14 gün. `getAdmin` DB'den `active` + `tokenVersion === v` kontrol eder.
- `proxy.ts`: `/yonetim` ve altı için `cz_session` imzası yoksa `/giris`. `/kasa`, `/giris`, `/kayit`, statikler serbest.
- `/yonetim` layout: sol menü (Ürünler, Personel, Cihazlar, Raporlar), işletme adı, çıkış; mobilde menü üstte, hesap/çıkış görünür (restoran-zirve `app/(panel)/layout.tsx` düzeni).

- [ ] Step 1: Dosyaları yaz. Step 2: `npx tsc --noEmit` temiz. Step 3: elle: `/kayit` → `/yonetim` açılıyor, çıkış → `/giris`, `/yonetim` girişsiz → `/giris` (E2E Task 11'de kalıcı test). Step 4: commit "Kayıt, yönetici girişi, proxy".

---

### Task 7: Ürün ve kategori yönetimi

**Files:** Create `lib/admin/catalog.ts` (saf zod doğrulama), `lib/admin/catalog-actions.ts`, `app/yonetim/urunler/page.tsx`, `components/ProductForm.tsx`; Test `tests/catalog.test.ts`

**Interfaces — Produces:** `parseProduct(form: Record<string,string>): {ok:true, value:{name, price, vatRate, categoryId|null, barcodes: string[]}} | {ok:false, error, field}`; action'lar `saveCategory`, `deleteCategory`, `saveProduct(id|null, state, form)`, `setProductActive(id, active)`

- [ ] **Step 1: Test**

```ts
// tests/catalog.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProduct } from "@/lib/admin/catalog";

test("ürün doğrulama: TL fiyat, KDV oranı, barkod listesi", () => {
  const ok = parseProduct({ name: " Ayran ", price: "25,00", vatRate: "10", categoryId: "", barcodes: "8690000000011, 8690000000011\n123" });
  assert.deepEqual(ok, { ok: true, value: { name: "Ayran", price: 2500, vatRate: 10, categoryId: null, barcodes: ["8690000000011", "123"] } });
  const bad = (o: Record<string, string>, field: string) => {
    const r = parseProduct({ name: "Ayran", price: "25", vatRate: "10", categoryId: "", barcodes: "", ...o });
    assert.ok(!r.ok && r.field === field, JSON.stringify(r));
  };
  bad({ name: "A" }, "name");
  bad({ price: "abc" }, "price");
  bad({ price: "0" }, "price");
  bad({ vatRate: "8" }, "vatRate");
  bad({ categoryId: "x" }, "categoryId");
  bad({ barcodes: "12 34" }, "barcodes");
});
```

- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3: Uygulama**

```ts
// lib/admin/catalog.ts — Ürün formu doğrulaması (saf).
import { isVatRate, parseTL, type VatRate } from "@/lib/core/money";

type Out = { ok: true; value: { name: string; price: number; vatRate: VatRate; categoryId: string | null; barcodes: string[] } } | { ok: false; error: string; field: string };
const UUID = /^[0-9a-f-]{36}$/i;

export function parseProduct(f: Record<string, string>): Out {
  const name = (f.name ?? "").trim();
  if (name.length < 2 || name.length > 80) return { ok: false, error: "Ürün adı 2-80 karakter.", field: "name" };
  const price = parseTL(f.price ?? "");
  if (price === null || price <= 0 || price > 10_000_000) return { ok: false, error: "Fiyat geçersiz (ör. 25,00).", field: "price" };
  const vat = Number(f.vatRate);
  if (!isVatRate(vat)) return { ok: false, error: "KDV oranı %1, %10 ya da %20 olmalı.", field: "vatRate" };
  const categoryId = (f.categoryId ?? "").trim() || null;
  if (categoryId && !UUID.test(categoryId)) return { ok: false, error: "Kategori geçersiz.", field: "categoryId" };
  const parts = (f.barcodes ?? "").split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  if (parts.some((b) => !/^\d{3,14}$/.test(b))) return { ok: false, error: "Barkod yalnız rakam (3-14 hane); virgül ya da satırla ayırın.", field: "barcodes" };
  return { ok: true, value: { name, price, vatRate: vat, categoryId, barcodes: [...new Set(parts)] } };
}
```

- [ ] **Step 4:** Run → PASS
- [ ] **Step 5: Ekran + action'lar.** Her action `requireAdmin()` → `withTenant(admin.tenantId, …)`; kategori silinirse ürünleri kategorisiz kalır. `/yonetim/urunler`: üstte kategori çipleri + "Kategori ekle" satırı; altta ürün tablosu (ad, kategori, fiyat `formatTL`, KDV %, barkod sayısı, satışta rozeti, Düzenle, Satıştan kaldır/Geri al); "Ürün ekle" formu: Ad, Fiyat (TL metin alanı, `inputMode="decimal"`), KDV (üç düğmeli seçim %1/%10/%20), Kategori (`components/Select.tsx`), Barkodlar (textarea). Hata metni `field` alanının altında.
- [ ] **Step 6:** `npx tsc --noEmit` + commit "Ürün ve kategori yönetimi".

---

### Task 8: Personel (PIN) ve cihaz eşleme

**Files:** Create `lib/admin/staff-actions.ts`, `lib/admin/device-actions.ts`, `app/yonetim/personel/page.tsx`, `app/yonetim/cihazlar/page.tsx`

**Interfaces — Consumes:** `hashPin`, `pinProblem`, `newPairingCode`. **Produces:** `saveStaff(id|null, state, form)`, `setStaffActive`, `createDevice(state, form) → {code, expiresAt}`, `newPairing(deviceId) → {code, expiresAt}`, `revokeDevice(deviceId)`

Davranış:
- Personel: ad, rol (Kasiyer/Müdür, iki düğme), PIN (düzenlemede boş = değişmez). Kural `pinProblem`; aynı kiracıda aynı PIN iki aktif kişide olamaz (PIN ile kim olduğunu buluyoruz): kaydetmeden önce aktif personelin hash'lerine `verifyPin` → eşleşme varsa "Bu PIN başka birinde kullanılıyor." Liste: ad, rol, aktif, Düzenle, Pasifleştir.
- Cihaz: ad ("Kasa 1") + fiş öneki (1-4 büyük harf/rakam, kiracıda benzersiz; ör. `K1`) + şube (M1'de tek şube "Merkez", seçim gösterilmez). Kayıtta `pairingCode = newPairingCode()`, `pairingExpiresAt = now + 15 dk`. Ekranda büyük harflerle kod + "Kasada cabukpos adresine girip /kasa'da bu kodu yazın, 15 dk geçerli". Liste: ad, önek, durum (Eşleşmedi / Eşlendi <tarih> / İptal), son görülme; "Yeni eşleme kodu" (token_hash'i siler — eski cihaz düşer), "İptal et" (revoked_at).
- `devices` RLS dışı: action'lar sorguya `eq(devices.tenantId, admin.tenantId)` koşulunu HER ZAMAN ekler.
- Denetim: `staff.save`, `device.create`, `device.pair_code`, `device.revoke`.

- [ ] Step 1: Yaz. Step 2: tsc. Step 3: commit "Personel PIN ve cihaz eşleme".

---

### Task 9: Kasa girişi — eşleme, PIN, vardiya açma

**Files:** Create `lib/auth/kasa.ts`, `lib/kasa/actions.ts` (bu görevdeki kısım), `app/kasa/layout.tsx`, `app/kasa/page.tsx`, `app/kasa/eslestir/page.tsx`, `components/kasa/PinPad.tsx`, `components/kasa/OpenShift.tsx`

**Interfaces — Produces:**
`getDevice(): Promise<{id, tenantId, storeId, name, receiptPrefix, tenantName}|null>` (cz_device → sha256 → devices, revoked değil; `lastSeenAt` güncellenir, en fazla 5 dk'da bir),
`getCashier(): Promise<{staffId, name, role}|null>` (cz_cashier JWT, audience "cashier", `deviceId` eşleşmeli, staff aktif),
`openShift(tx, device, staffId, openingCash)`, `currentShift(tx, deviceId)`,
action'lar `pairDevice(state, form)`, `pinLogin(state, form)`, `pinLogout()`, `openShiftAction(state, form)`

Davranış:
- `/kasa` (sunucu bileşeni) sırayla: cihaz yok → `/kasa/eslestir`; kasiyer yok → PIN ekranı; açık vardiya yok → vardiya açma; yoksa satış ekranı (Task 10).
- `pairDevice`: kod büyük harfe çevrilir; `pairing_code = kod AND pairing_expires_at > now() AND revoked_at is null` → `token = newDeviceToken()`, `token_hash = sha256(token)`, `pairing_code = null`, `paired_at = now()`; çerez `cz_device` (httpOnly, secure üretimde, sameSite lax, path "/", 400 gün). IP başına 15 dk'da 10 deneme. Hatalı → "Kod geçersiz ya da süresi dolmuş."
- PIN ekranı: büyük rakam tuşları (dokunmatik, 64 px), 4-6 hane girilince "Gir". `pinLogin`: cihazın kiracısında aktif personel içinde `verifyPin` eşleşeni bulur; cihaz başına 15 dk'da 10 yanlış → "Çok fazla deneme"; başarı → `cz_cashier` (12 saat).
- Vardiya açma: "Kasadaki açılış nakdi" (TL) → `shifts` kaydı. Cihazda açık vardiya varken ikinci açılamaz.
- Üst çubuk: işletme adı · cihaz adı · kasiyer adı · "Kasiyer değiştir" (pinLogout).

- [ ] Step 1: Yaz. Step 2: tsc. Step 3: commit "Kasa: eşleme, PIN girişi, vardiya açma".

---

### Task 10: Satış ekranı + idempotent satış kaydı

**Files:** Create `lib/kasa/sale.ts`, `components/kasa/SaleScreen.tsx`, `components/kasa/PayDialog.tsx`; Modify `lib/kasa/actions.ts` (+`completeSale`); Test `tests/sale.test.ts`

**Interfaces — Consumes:** `addProduct/setQty/totals`, `settle`, `withTenant`. **Produces:**
`SaleInput = { id: string; lines: { productId: string; qtyMilli: number }[]; payments: Payment[] }`,
`SaleCtx = { tenantId, storeId, deviceId, staffId, receiptPrefix }`,
`recordSale(ctx, input): Promise<{ok:true, saleId, receiptNo, change} | {ok:false, error}>`

- [ ] **Step 1: Test**

```ts
// tests/sale.test.ts — cabukpos_test, uygulama rolü.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
process.env.MIGRATE_DATABASE_URL = "postgres://yigiterturk@localhost:5432/cabukpos_test";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { recordSale } = await import("@/lib/kasa/sale");
const { eq } = await import("drizzle-orm");

const [t] = await getDb().insert(schema.tenants).values({ name: "SATIS-T", vertical: "restoran" }).returning();
const setup = await withTenant(t.id, async (tx) => {
  const [store] = await tx.insert(schema.stores).values({ tenantId: t.id, name: "Merkez" }).returning();
  const [st] = await tx.insert(schema.staff).values({ tenantId: t.id, name: "Ali", pinHash: "x" }).returning();
  const [doner] = await tx.insert(schema.products).values({ tenantId: t.id, name: "Döner", price: 18000, vatRate: 10 }).returning();
  const [ayran] = await tx.insert(schema.products).values({ tenantId: t.id, name: "Ayran", price: 2500, vatRate: 10, active: false }).returning();
  return { store, st, doner, ayran };
});
const [dev] = await getDb().insert(schema.devices).values({ tenantId: t.id, storeId: setup.store.id, name: "Kasa 1", receiptPrefix: "K1" }).returning();
await withTenant(t.id, (tx) => tx.insert(schema.shifts).values({ tenantId: t.id, storeId: setup.store.id, deviceId: dev.id, openedBy: setup.st.id, openingCash: 50000 }));
const ctx = { tenantId: t.id, storeId: setup.store.id, deviceId: dev.id, staffId: setup.st.id, receiptPrefix: "K1" };

after(async () => {
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t.id));
  await closeDb();
});

test("satış: sunucu fiyatı, fiş no, para üstü; aynı id ikinci kez yeni kayıt/fiş no üretmez", async () => {
  const id = crypto.randomUUID();
  const input = { id, lines: [{ productId: setup.doner.id, qtyMilli: 2000 }], payments: [{ method: "nakit" as const, amount: 40000 }] };
  const r1 = await recordSale(ctx, input);
  assert.deepEqual(r1, { ok: true, saleId: id, receiptNo: "K1-000001", change: 4000 });
  const r2 = await recordSale(ctx, input);
  assert.deepEqual(r2, r1);
  const [row] = await withTenant(t.id, (tx) => tx.select().from(schema.sales).where(eq(schema.sales.id, id)));
  assert.equal(row.total, 36000);
  assert.deepEqual(row.vat, [{ rate: 10, gross: 36000, net: 32727, vat: 3273 }]);
  const [d] = await getDb().select().from(schema.devices).where(eq(schema.devices.id, dev.id));
  assert.equal(d.nextReceiptNo, 2);
});

test("satış: pasif ürün, eksik ödeme, boş sepet, açık vardiya yok → hata, fiş no ilerlemez", async () => {
  const mk = (lines: { productId: string; qtyMilli: number }[], amount: number) => ({ id: crypto.randomUUID(), lines, payments: [{ method: "kart" as const, amount }] });
  assert.match((await recordSale(ctx, mk([{ productId: setup.ayran.id, qtyMilli: 1000 }], 2500)) as { error: string }).error, /satıştan kalk/);
  assert.match((await recordSale(ctx, mk([{ productId: setup.doner.id, qtyMilli: 1000 }], 100)) as { error: string }).error, /Eksik ödeme/);
  assert.match((await recordSale(ctx, mk([], 0)) as { error: string }).error, /Sepet boş/);
  await withTenant(t.id, (tx) => tx.update(schema.shifts).set({ closedAt: new Date() }).where(eq(schema.shifts.deviceId, dev.id)));
  assert.match((await recordSale(ctx, mk([{ productId: setup.doner.id, qtyMilli: 1000 }], 18000)) as { error: string }).error, /vardiya/);
  const [d] = await getDb().select().from(schema.devices).where(eq(schema.devices.id, dev.id));
  assert.equal(d.nextReceiptNo, 2);
});
```

- [ ] **Step 2:** Run `node --import ./tests/ts-resolve.mjs --test tests/sale.test.ts` → FAIL
- [ ] **Step 3: Uygulama**

```ts
// lib/kasa/sale.ts — Satış kaydı. İdempotent: aynı id → aynı sonuç, yeni fiş no yok.
// M1 çevrimiçi: fiyat/KDV sunucudaki üründen alınır. (M2: çevrimdışı satışta istemci anlık görüntüsü kabul edilecek.)
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { addProduct, totals, type CartLine } from "@/lib/core/cart";
import { isVatRate } from "@/lib/core/money";
import { settle, type Payment } from "@/lib/core/payment";

export type SaleInput = { id: string; lines: { productId: string; qtyMilli: number }[]; payments: Payment[] };
export type SaleCtx = { tenantId: string; storeId: string; deviceId: string; staffId: string; receiptPrefix: string };
export type SaleResult = { ok: true; saleId: string; receiptNo: string; change: number } | { ok: false; error: string };

export async function recordSale(ctx: SaleCtx, input: SaleInput): Promise<SaleResult> {
  if (!/^[0-9a-f-]{36}$/i.test(input.id)) return { ok: false, error: "Geçersiz satış kimliği." };
  if (!input.lines.length) return { ok: false, error: "Sepet boş." };
  if (input.lines.some((l) => !Number.isInteger(l.qtyMilli) || l.qtyMilli <= 0 || l.qtyMilli > 1_000_000)) return { ok: false, error: "Geçersiz miktar." };

  return withTenant(ctx.tenantId, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.id}))`);
    const [done] = await tx.select({ receiptNo: schema.sales.receiptNo, change: schema.sales.change }).from(schema.sales).where(eq(schema.sales.id, input.id));
    if (done) return { ok: true, saleId: input.id, receiptNo: done.receiptNo, change: done.change };

    const [shift] = await tx.select({ id: schema.shifts.id }).from(schema.shifts).where(and(eq(schema.shifts.deviceId, ctx.deviceId), isNull(schema.shifts.closedAt)));
    if (!shift) return { ok: false, error: "Açık vardiya yok; önce vardiya açın." };

    const ids = [...new Set(input.lines.map((l) => l.productId))];
    const prods = await tx.select().from(schema.products).where(and(inArray(schema.products.id, ids), eq(schema.products.active, true)));
    if (prods.length !== ids.length) return { ok: false, error: "Sepetteki bir ürün bulunamadı ya da satıştan kalktı." };
    let cart: CartLine[] = [];
    for (const l of input.lines) {
      const p = prods.find((x) => x.id === l.productId)!;
      if (!isVatRate(p.vatRate)) return { ok: false, error: `${p.name}: KDV oranı geçersiz.` };
      cart = addProduct(cart, { id: p.id, name: p.name, price: p.price, vatRate: p.vatRate }, l.qtyMilli);
    }
    const t = totals(cart);
    const s = settle(t.total, input.payments);
    if (!s.ok) return s;

    const [n] = await tx
      .update(schema.devices)
      .set({ nextReceiptNo: sql`${schema.devices.nextReceiptNo} + 1` })
      .where(and(eq(schema.devices.id, ctx.deviceId), eq(schema.devices.tenantId, ctx.tenantId)))
      .returning({ no: sql<number>`${schema.devices.nextReceiptNo} - 1` });
    const receiptNo = `${ctx.receiptPrefix}-${String(n.no).padStart(6, "0")}`;

    await tx.insert(schema.sales).values({ id: input.id, tenantId: ctx.tenantId, storeId: ctx.storeId, deviceId: ctx.deviceId, shiftId: shift.id, staffId: ctx.staffId, receiptNo, total: t.total, change: s.change, vat: t.vat });
    await tx.insert(schema.saleLines).values(cart.map((l) => ({ tenantId: ctx.tenantId, saleId: input.id, productId: l.productId, name: l.name, unitPrice: l.unitPrice, vatRate: l.vatRate, qtyMilli: l.qtyMilli, total: Math.round((l.unitPrice * l.qtyMilli) / 1000) })));
    await tx.insert(schema.payments).values(s.payments.map((p) => ({ tenantId: ctx.tenantId, saleId: input.id, method: p.method, amount: p.amount })));
    return { ok: true, saleId: input.id, receiptNo, change: s.change };
  });
}
```
Not: `devices` RLS dışı; `tenantId` koşulu kodda. Hata dönen yollar işlemi geri almaz ama hiçbir şey yazmamıştır (fiş no güncellemesi yalnız doğrulamalardan sonra).

- [ ] **Step 4:** Run → PASS (2 test)
- [ ] **Step 5: Satış ekranı.** `SaleScreen` (istemci bileşeni, props: kategoriler + aktif ürünler + cihaz/kasiyer adları): solda kategori çipleri ve ürün döşemeleri (ad + fiyat, dokununca `addProduct`); üstte arama/barkod alanı (Enter: barkod tam eşleşme → ekle, yoksa ada göre filtre); sağda sepet (satır: ad, −/+ ile `setQty` ±1000, satır tutarı), altta TOPLAM büyük, KDV satırları küçük, "Öde" ve "Temizle". `PayDialog`: kalan tutar; hızlı düğmeler "Tamamı nakit", "Tamamı kart", "Tamamı yemek kartı"; karma için yöntem + tutar ekle listesi; nakitte "Verilen" alanı → para üstü canlı (`settle` istemcide de çalışır); "Satışı tamamla" → `completeSale({ id: crypto.randomUUID() /* diyalog açılınca bir kez üretilir */, lines, payments })`. Başarı → sepet temizlenir, "Fiş K1-000001 · Para üstü 15,00 ₺" bandı + "Fişi yazdır" bağlantısı (`/kasa/fis/<id>`, yeni sekme) . Ağ hatasında aynı id ile "Tekrar dene" (idempotent).
- [ ] **Step 6:** `completeSale` action: `getDevice` + `getCashier` yoksa hata; `recordSale`; `audit_log` "sale.complete" yok (satış kendisi kayıt). tsc + commit "Satış ekranı ve idempotent satış kaydı".

---

### Task 11: Bilgi fişi, gün sonu, raporlar, E2E

**Files:** Create `lib/kasa/shift-report.ts`, `app/kasa/fis/[id]/page.tsx`, `app/kasa/gun-sonu/page.tsx`, `app/yonetim/raporlar/page.tsx`, `app/yonetim/raporlar/[shiftId]/page.tsx`, `components/ShiftReport.tsx`, `components/PrintButton.tsx` (restoran-zirve'den), `e2e/m1.mjs`; Modify `lib/kasa/actions.ts` (+`closeShiftAction`)

**Interfaces — Consumes:** `summarizeShift`. **Produces:** `loadShiftReport(tenantId, shiftId): Promise<{shift, summary, sales: {receiptNo, createdAt, total}[]} | null>`, `closeShiftAction(state, form)`

Davranış:
- `/kasa/fis/[id]`: yalnız aynı cihazın kasiyeri (cihaz + kiracı eşleşmesi) açar. 80 mm: `@page { size: 80mm auto; margin: 0 }`, gövde 72 mm, 12 px monospace. İçerik: işletme adı, şube, tarih-saat (Europe/Istanbul), fiş no, kasiyer; satırlar (ad, miktar × birim, tutar); KDV tablosu (oran, matrah, KDV); TOPLAM; ödemeler; para üstü; "Bilgi fişidir, mali değeri yoktur." Açılınca `window.print()` (?yazdir=0 ile kapatılır, E2E için).
- `/kasa/gun-sonu`: açık vardiyanın özeti (`summarizeShift`: satış sayısı, ciro, yöntem bazında, KDV, açılış nakdi, beklenen kasa); "Sayılan nakit" (TL) → `closeShiftAction`: `countedCash`, `expectedCash`, `closedBy`, `closedAt`; fark = sayılan − beklenen (eksi kırmızı, artı yeşil). Kapanınca rapor sayfası yazdırılabilir; kasiyer oturumu kapanır, `/kasa` PIN ekranına döner.
- `/yonetim/raporlar`: vardiyalar (cihaz, açan, açılış/kapanış, ciro, fark) → ayrıntı aynı `ShiftReport` bileşeni.

- [ ] **Step 1: E2E**

```js
// e2e/m1.mjs — Kayıt → ürün/personel/cihaz → eşleme → PIN → vardiya → karma ödemeli satış → fiş → ikinci satış
// → gün sonu (beklenen/fark) → yönetim raporu; ikinci işletme ilk işletmenin ürününü görmez.
// Kullanım: node --env-file=.env.local e2e/m1.mjs (sunucu :3800: npm run build && PORT=3800 npm start)
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3800";
const stamp = Date.now();
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
const page = async (w = 1280) => {
  const p = await (await browser.newContext({ viewport: { width: w, height: 900 } })).newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  return p;
};
const step = (m) => console.log("•", m);

const admin = await page();
await admin.goto(`${BASE}/kayit`);
await admin.fill("input[name=businessName]", "E2E Dönerci");
await admin.getByRole("button", { name: "Restoran" }).click();
await admin.fill("input[name=name]", "Yiğit Test");
await admin.fill("input[name=email]", `m1-${stamp}@ornek.com`);
await admin.fill("input[name=password]", "Cabukpos2026x");
await admin.getByRole("button", { name: "Hesap oluştur" }).click();
await admin.waitForURL(`${BASE}/yonetim**`);
step("kayıt → yönetim");

await admin.goto(`${BASE}/yonetim/urunler`);
await admin.fill("input[name=categoryName]", "Ana yemek");
await admin.getByRole("button", { name: "Kategori ekle" }).click();
await admin.getByText("Ana yemek").first().waitFor();
for (const [name, price, vat] of [["Döner", "180,00", "10"], ["Ayran", "25", "10"], ["Su", "10", "20"]]) {
  await admin.fill("input[name=name]", name);
  await admin.fill("input[name=price]", price);
  await admin.getByRole("button", { name: `%${vat}`, exact: true }).click();
  await admin.getByRole("button", { name: "Ürünü kaydet" }).click();
  await admin.getByRole("cell", { name, exact: true }).waitFor();
}
await admin.fill("input[name=name]", "Hatalı");
await admin.fill("input[name=price]", "abc");
await admin.getByRole("button", { name: "Ürünü kaydet" }).click();
await admin.getByText("Fiyat geçersiz (ör. 25,00).").waitFor();
step("3 ürün eklendi; geçersiz fiyat reddedildi");

await admin.goto(`${BASE}/yonetim/personel`);
await admin.fill("input[name=name]", "Ali Kasiyer");
await admin.fill("input[name=pin]", "1234");
await admin.getByRole("button", { name: "Personeli kaydet" }).click();
await admin.getByText("Bu PIN kolay tahmin edilir; başka bir PIN seçin.").waitFor();
await admin.fill("input[name=pin]", "4826");
await admin.getByRole("button", { name: "Personeli kaydet" }).click();
await admin.getByRole("cell", { name: "Ali Kasiyer" }).waitFor();
await admin.goto(`${BASE}/yonetim/cihazlar`);
await admin.fill("input[name=name]", "Kasa 1");
await admin.fill("input[name=receiptPrefix]", "K1");
await admin.getByRole("button", { name: "Cihaz ekle" }).click();
const code = (await admin.getByTestId("pairing-code").innerText()).trim();
if (!/^[A-Z2-9]{8}$/.test(code)) throw new Error(`eşleme kodu: ${code}`);
step(`personel (kolay PIN reddedildi) + cihaz, eşleme kodu ${code}`);

const kasa = await page(1280);
await kasa.goto(`${BASE}/kasa`);
await kasa.waitForURL(`${BASE}/kasa/eslestir`);
await kasa.fill("input[name=code]", "YANLIS22");
await kasa.getByRole("button", { name: "Eşle" }).click();
await kasa.getByText("Kod geçersiz ya da süresi dolmuş.").waitFor();
await kasa.fill("input[name=code]", code.toLowerCase());
await kasa.getByRole("button", { name: "Eşle" }).click();
await kasa.waitForURL(`${BASE}/kasa`);
for (const d of "4827") await kasa.getByRole("button", { name: d, exact: true }).click();
await kasa.getByRole("button", { name: "Gir" }).click();
await kasa.getByText("PIN hatalı.").waitFor();
for (const d of "4826") await kasa.getByRole("button", { name: d, exact: true }).click();
await kasa.getByRole("button", { name: "Gir" }).click();
await kasa.fill("input[name=openingCash]", "500");
await kasa.getByRole("button", { name: "Vardiyayı aç" }).click();
await kasa.getByText("Ali Kasiyer").waitFor();
step("kasa: yanlış kod/PIN reddedildi; eşlendi, PIN ile girildi, vardiya açıldı (500 TL)");

await kasa.getByRole("button", { name: /^Döner/ }).click();
await kasa.getByRole("button", { name: /^Döner/ }).click();
await kasa.getByRole("button", { name: /^Ayran/ }).click();
await kasa.getByTestId("cart-total").getByText("385,00 ₺").waitFor();
await kasa.getByRole("button", { name: "Öde" }).click();
await kasa.getByRole("button", { name: "Kart ekle" }).click();
await kasa.fill("input[name=amount-kart]", "200");
await kasa.fill("input[name=amount-nakit]", "150");
await kasa.getByText("Eksik ödeme: 35,00 ₺").waitFor();
await kasa.fill("input[name=amount-nakit]", "200");
await kasa.getByText("Para üstü 15,00 ₺").waitFor();
await kasa.getByRole("button", { name: "Satışı tamamla" }).click();
await kasa.getByText(/Fiş K1-000001 · Para üstü 15,00 ₺/).waitFor();
const receiptHref = await kasa.getByRole("link", { name: "Fişi yazdır" }).getAttribute("href");
const fis = await kasa.context().newPage();
await fis.goto(`${BASE}${receiptHref}?yazdir=0`);
for (const t of ["E2E Dönerci", "K1-000001", "Ali Kasiyer", "385,00 ₺", "Kart", "Nakit", "15,00 ₺", "Bilgi fişidir, mali değeri yoktur."]) await fis.getByText(t).first().waitFor();
await fis.close();
step("karma ödemeli satış (kart 200 + nakit 200, üstü 15) + bilgi fişi");

await kasa.getByRole("button", { name: /^Su/ }).click();
await kasa.getByRole("button", { name: "Öde" }).click();
await kasa.getByRole("button", { name: "Tamamı nakit" }).click();
await kasa.getByRole("button", { name: "Satışı tamamla" }).click();
await kasa.getByText(/Fiş K1-000002/).waitFor();
step("ikinci satış: K1-000002");

await kasa.goto(`${BASE}/kasa/gun-sonu`);
for (const t of ["2 satış", "395,00 ₺", "Beklenen kasa", "695,00 ₺"]) await kasa.getByText(t).first().waitFor();
await kasa.fill("input[name=countedCash]", "690");
await kasa.getByRole("button", { name: "Gün sonunu kapat" }).click();
await kasa.getByText("-5,00 ₺").waitFor();
await kasa.goto(`${BASE}/kasa`);
await kasa.getByRole("button", { name: "Gir" }).waitFor();
step("gün sonu: beklenen 695, sayılan 690, fark -5; kasiyer oturumu kapandı");

await admin.goto(`${BASE}/yonetim/raporlar`);
await admin.getByText("395,00 ₺").first().waitFor();
await admin.getByText("-5,00 ₺").first().waitFor();
step("yönetim raporunda vardiya");

const other = await page();
await other.goto(`${BASE}/kayit`);
await other.fill("input[name=businessName]", "E2E Market");
await other.getByRole("button", { name: "Market" }).click();
await other.fill("input[name=name]", "Başka Sahip");
await other.fill("input[name=email]", `m1b-${stamp}@ornek.com`);
await other.fill("input[name=password]", "Cabukpos2026y");
await other.getByRole("button", { name: "Hesap oluştur" }).click();
await other.waitForURL(`${BASE}/yonetim**`);
await other.goto(`${BASE}/yonetim/urunler`);
if ((await other.getByRole("cell", { name: "Döner", exact: true }).count()) !== 0) throw new Error("kiracı sızıntısı");
const anon = await page();
await anon.goto(`${BASE}/yonetim/urunler`);
await anon.waitForURL(`${BASE}/giris`);
step("ikinci işletme ilk işletmenin ürününü görmüyor; girişsiz yönetim → giriş");

await browser.close();
if (errors.length) throw new Error(`sayfa hataları: ${errors.join(" | ")}`);
console.log("M1 OK");
```
(Arayüz metinleri ve `name`/`data-testid` değerleri bu testle birebir uyumlu yazılır: `businessName`, `categoryName`, `pin`, `receiptPrefix`, `code`, `openingCash`, `amount-kart`, `amount-nakit`, `countedCash`, `data-testid="pairing-code"`, `data-testid="cart-total"`; düğmeler "Hesap oluştur", "Kategori ekle", "Ürünü kaydet", "Personeli kaydet", "Cihaz ekle", "Eşle", "Gir", "Vardiyayı aç", "Öde", "Kart ekle", "Tamamı nakit", "Satışı tamamla", "Gün sonunu kapat"; hata "PIN hatalı.")

- [ ] **Step 2:** Ekranları yaz, `npm run build`, `PORT=3800 node --env-file=.env.local node_modules/.bin/next start -p 3800` arka planda.
- [ ] **Step 3:** Run `node --env-file=.env.local e2e/m1.mjs` → "M1 OK"
- [ ] **Step 4: Kapanış kapısı:** `npm test` (hepsi PASS), `npx eslint` temiz, `npx tsc --noEmit` temiz. `docs/PROGRESS.md`'de M1 maddeleri `[x]`, çalıştırma notları (DB rolü, `db:rls`, E2E komutu).
- [ ] **Step 5:** `git add -A && git commit -m "M1: bilgi fişi, gün sonu, raporlar; E2E m1" && git push`

---

## Self-review (plan yazarı)

- Spec M1 satırı: kiracı/şube/cihaz eşleme (T5, T6, T8, T9), kullanıcı+PIN (T4, T6, T8, T9), ürün/kategori/KDV (T2, T7), hızlı satış (T10), ödeme nakit/kart/karma (T3, T10), bilgi fişi 80 mm (T11), vardiya aç/kapa + gün sonu (T3, T9, T11), birim testler sepet/KDV/yuvarlama (T2, T3) + E2E satış (T11). Spec §8 RLS (T5), PIN kilidi (T9), denetim (T6-T8). Kapsam dışı bırakılanlar M2+ (çevrimdışı, barkod okuyucu akışı hariç basit barkod eşleşmesi T10'da var, iade M3, yazıcı ajanı M4).
- Spec'ten sapma: `memberships` yerine M1'de `users` (e-posta, tek kiracı) + `staff` (PIN'li kasa personeli) — kasiyerin e-postası olmaz; çok şubeli üyelik M9'da.
- Tip tutarlılığı: `Payment`, `VatLine`, `CartLine.qtyMilli`, `SaleInput`, `recordSale` imzaları T2/T3/T10/T11'de aynı.
