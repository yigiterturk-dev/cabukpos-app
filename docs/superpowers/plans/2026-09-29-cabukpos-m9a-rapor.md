# ÇabukPOS M9a — Raporlar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yönetimde Özet / Yoğunluk / Ürünler / Personel raporları + CSV; kasada sepetten silme ve sepet boşaltma buluta kaydedilir.

**Architecture:** İstek anında SQL toplama (`lib/admin/report.ts`) → saf hesap (`lib/core/report.ts`, birim testli) → sunucu bileşenleri (`components/reports/*`). Kasa, silinen satırları mevcut giden kutusuna `register_event` belgesi olarak yazar; bulut `register_events` tablosuna idempotent ekler.

**Tech Stack:** Next.js 16 (App Router, `searchParams` Promise), Drizzle + Neon Postgres (RLS, `withTenant`), Dexie (kasa IndexedDB), zod, node:test, Playwright (e2e).

Spec: `docs/superpowers/specs/2026-09-29-cabukpos-m9a-rapor-design.md`

## Global Constraints

- Para her yerde tamsayı kuruş (`Kurus`). Gösterim `formatTL`.
- Gün sınırı Europe/Istanbul (+03:00, DST yok). Satış zamanı `sales.created_at`.
- Brüt ciro = `kapandi` toplamı − `iade` toplamı; `iptal` hiçbir toplamda yok.
- Yeni tablo RLS'li: `db/rls.sql` listesine eklenir. `drizzle-kit push` RLS'yi kapatır → `db:push:test` zaten `db:rls:test` zincirli.
- UI: beyaz zemin, native `<select>` YOK (sekme/bağlantı düğmeleri), `tabular-nums`.
- Commit yazarı r.y.erturk@gmail.com; commit mesajında AI imzası/`Co-Authored-By` YOK.
- Yerel test DB: `npm run db:push:test` (cabukpos_test). Tek dosya: `node --import ./tests/ts-resolve.mjs --test tests/<ad>.test.ts`.
- Next 16: kod yazmadan önce ilgili rehber `node_modules/next/dist/docs/` (route handler için `route.ts` belgesi).

## Dosya haritası

| Dosya | Sorumluluk |
|---|---|
| `db/schema.ts` (değişir) | `registerEvents` tablosu, `sales_at_idx` |
| `db/rls.sql` (değişir) | `register_events` RLS |
| `lib/core/cart.ts` (değişir) | `RemovedLine`, `removedLines()` saf fark |
| `lib/sync/docs.ts` (değişir) | `register_event` belge şeması |
| `lib/sync/apply.ts` (değişir) | `register_event` uygulama |
| `lib/offline/db.ts` (değişir) | `recordRegisterEventLocal()` |
| `components/kasa/SaleScreen.tsx`, `KasaApp.tsx` (değişir) | `onRemove` kancası |
| `lib/core/report.ts` (yeni) | dönem, özet, dağılım, yoğunluk, ürün, personel, olay metni, CSV — saf |
| `lib/admin/report.ts` (yeni) | dönem SQL'leri + sekme verisi + `reportCsv` |
| `components/reports/*.tsx` (yeni) | sekme görünümleri |
| `app/yonetim/raporlar/page.tsx` (değişir) | sekme yönlendirme |
| `app/yonetim/raporlar/csv/route.ts` (yeni) | CSV indirme |
| `tests/report.test.ts`, `tests/report-db.test.ts` (yeni), `tests/cart.test.ts`, `tests/sync.test.ts` (değişir) | testler |
| `e2e/m9a.mjs` (yeni), `e2e/m1.mjs` (değişir) | uçtan uca |

---

### Task 1: Kasa olayı — şema, belge, bulutta uygulama

**Files:**
- Modify: `db/schema.ts` (sales tablosu indeksleri; dosya sonuna `registerEvents`)
- Modify: `db/rls.sql` (M8 bloğundan sonra)
- Modify: `lib/core/cart.ts`
- Modify: `lib/sync/docs.ts:93` (audit satırından sonra)
- Modify: `lib/sync/apply.ts:74-81` (audit dalından sonra)
- Test: `tests/sync.test.ts` (sona ekle)

**Interfaces:**
- Produces: `type RemovedLine = { productId: string | null; name: string; qtyMilli: number; total: Kurus }` (`lib/core/cart.ts`); `schema.registerEvents`; `SyncDoc` üyesi `{ kind: "register_event"; id; shiftId; staffId; at; type: "line_removed" | "cart_cleared"; lines: RemovedLine[] }`.

- [ ] **Step 1: Failing test** — `tests/sync.test.ts` sonuna (dosyadaki `ctx`, `setup`, `shiftId`, `now`, `t`, `t2` kullanılır; `shiftId` dosyanın başındaki testlerde `shift_open` ile açılmış olmalı — değilse testte açılır):

```ts
test("M9a: register_event idempotent, vardiyasız reddedilir, RLS", async () => {
  await applyDoc(ctx, { kind: "shift_open", id: shiftId, staffId: setup.st.id, at: now(), openingCash: 0 }); // zaten açıksa no-op
  const ev = {
    kind: "register_event", id: crypto.randomUUID(), shiftId, staffId: setup.st.id, at: now(), type: "cart_cleared",
    lines: [{ productId: setup.doner.id, name: "Döner", qtyMilli: 2000, total: 36000 }, { productId: null, name: "Serbest", qtyMilli: 1000, total: 500 }],
  };
  assert.deepEqual(await applyDoc(ctx, ev), { id: ev.id, ok: true });
  assert.deepEqual(await applyDoc(ctx, ev), { id: ev.id, ok: true });
  const rows = await withTenant(t.id, (tx) => tx.select().from(schema.registerEvents).where(eq(schema.registerEvents.id, ev.id)));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].total, 36500);
  assert.equal(rows[0].type, "cart_cleared");
  const bad = await applyDoc(ctx, { ...ev, id: crypto.randomUUID(), shiftId: crypto.randomUUID() });
  assert.equal(bad.ok, false);
  assert.equal((await applyDoc(ctx, { ...ev, id: crypto.randomUUID(), type: "baska" })).ok, false);
  const leak = await withTenant(t2.id, (tx) => tx.select().from(schema.registerEvents));
  assert.equal(leak.length, 0);
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `node --import ./tests/ts-resolve.mjs --test tests/sync.test.ts 2>&1 | tail -15`
Expected: FAIL (`schema.registerEvents` undefined / TS hata).

- [ ] **Step 3: `lib/core/cart.ts`** — `setQty`'nin altına:

```ts
/** M9a: kasadan silinen içerik (register_events.lines). total KDV dahil, indirimsiz. */
export type RemovedLine = { productId: string | null; name: string; qtyMilli: number; total: Kurus };

/** Sepet değişiminde çıkan miktar (silinen satır / azaltılan adet). Artış ve yeni satır yok sayılır. */
export function removedLines(before: CartLine[], after: CartLine[]): RemovedLine[] {
  const now = new Map(after.map((l) => [l.productId, l.qtyMilli]));
  return before.flatMap((l) => {
    const gone = l.qtyMilli - (now.get(l.productId) ?? 0);
    return gone > 0 ? [{ productId: l.productId, name: l.name, qtyMilli: gone, total: lineTotal({ ...l, qtyMilli: gone, discount: 0 }) }] : [];
  });
}
```

- [ ] **Step 4: `db/schema.ts`**

`sales` tablosunun ikinci argümanındaki diziye ekle:

```ts
}, (t) => [uniqueIndex("sales_receipt_uq").on(t.deviceId, t.receiptNo), index("sales_shift_idx").on(t.shiftId), index("sales_at_idx").on(t.tenantId, t.storeId, t.createdAt)]);
```

Dosya sonuna (import: `import type { RemovedLine } from "@/lib/core/cart";` dosya başına):

```ts
// — M9a: kasa olayı (sepetten silme / sepeti boşaltma). Değişmez; kimlik istemcide. —
export const registerEvents = pgTable("register_events", {
  id: uuid("id").primaryKey(),
  tenantId: tenantRef(),
  storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  deviceId: uuid("device_id").notNull().references(() => devices.id),
  shiftId: uuid("shift_id").notNull().references(() => shifts.id),
  staffId: uuid("staff_id").notNull().references(() => staff.id),
  at: ts("at").notNull(),
  type: text("type").notNull(), // line_removed | cart_cleared
  lines: jsonb("lines").notNull().$type<RemovedLine[]>(),
  total: integer("total").notNull(),
  syncedAt: ts("synced_at").notNull().defaultNow(),
}, (t) => [index("register_events_at_idx").on(t.tenantId, t.storeId, t.at)]);
```

- [ ] **Step 5: `db/rls.sql`** sonuna:

```sql
-- M9a: kasa olayı
alter table register_events enable row level security;
alter table register_events force row level security;
drop policy if exists tenant_isolation on register_events;
create policy tenant_isolation on register_events using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
```

- [ ] **Step 6: `lib/sync/docs.ts`** — `syncDoc` birliğinde `audit` satırından sonra:

```ts
  // M9a: sepetten silme / sepeti boşaltma (müdür onayı yok, yalnız kayıt). Kimlik register_events.id.
  z.object({
    kind: z.literal("register_event"), id: uuid, shiftId: uuid, staffId: uuid, at,
    type: z.enum(["line_removed", "cart_cleared"]),
    lines: z.array(z.object({ productId: uuid.nullable(), name: z.string().min(1).max(120), qtyMilli: z.number().int().min(1).max(1_000_000), total: kurus })).min(1).max(500),
  }),
```

- [ ] **Step 7: `lib/sync/apply.ts`** — `if (doc.kind === "audit") { … }` bloğundan sonra:

```ts
  if (doc.kind === "register_event") {
    const [shift] = await tx.select({ id: sh.id }).from(sh).where(and(eq(sh.id, doc.shiftId), eq(sh.deviceId, ctx.deviceId)));
    if (!shift) return "Vardiya bulunamadı.";
    if (!(await staffExists(tx, doc.staffId))) return "Personel bulunamadı.";
    await tx.insert(schema.registerEvents)
      .values({ id: doc.id, tenantId: ctx.tenantId, storeId: ctx.storeId, deviceId: ctx.deviceId, shiftId: doc.shiftId, staffId: doc.staffId, at: clampAt(doc.at), type: doc.type, lines: doc.lines, total: doc.lines.reduce((s, l) => s + l.total, 0) })
      .onConflictDoNothing();
    return null;
  }
```

- [ ] **Step 8: Şema test DB'ye + testler**

Run: `npm run db:push:test 2>&1 | tail -3 && node --import ./tests/ts-resolve.mjs --test tests/sync.test.ts 2>&1 | tail -5`
Expected: `# fail 0`

- [ ] **Step 9: Commit**

```bash
git add db/schema.ts db/rls.sql lib/core/cart.ts lib/sync/docs.ts lib/sync/apply.ts tests/sync.test.ts
git commit -m "M9a Görev 1: register_events tablosu + register_event eşitleme belgesi, sales_at_idx"
```

---

### Task 2: Kasada silme ve boşaltmayı kaydet

**Files:**
- Modify: `lib/offline/db.ts:153-157` (recordAuditLocal'ın altına)
- Modify: `components/kasa/SaleScreen.tsx:125,185,188,220`
- Modify: `components/kasa/KasaApp.tsx:609-618`
- Test: `tests/cart.test.ts`

**Interfaces:**
- Consumes: `removedLines`, `RemovedLine` (Task 1).
- Produces: `recordRegisterEventLocal(shiftId: string, staffId: string, type: "line_removed" | "cart_cleared", lines: RemovedLine[]): Promise<void>`; `SaleScreen` prop `onRemove?: (type: "line_removed" | "cart_cleared", lines: RemovedLine[]) => void`.

- [ ] **Step 1: Failing test** — `tests/cart.test.ts` import satırına `removedLines` ekle, sona:

```ts
test("M9a: removedLines — silme, azaltma, artış yok sayılır, boşaltma", () => {
  const c = addProduct(addProduct([], doner, 3000), ayran);
  assert.deepEqual(removedLines(c, setQty(c, "d", 1000)), [{ productId: "d", name: "Döner", qtyMilli: 2000, total: 36000 }]);
  assert.deepEqual(removedLines(c, setQty(c, "a", 0)), [{ productId: "a", name: "Ayran", qtyMilli: 1000, total: 2500 }]);
  assert.deepEqual(removedLines(c, addProduct(c, su)), []);
  assert.deepEqual(removedLines(c, setQty(c, "d", 4000)), []);
  assert.equal(removedLines(c, []).reduce((s, l) => s + l.total, 0), 56500);
});
```

- [ ] **Step 2: Run** `node --import ./tests/ts-resolve.mjs --test tests/cart.test.ts 2>&1 | tail -5` → PASS bekleniyor (fonksiyon Task 1'de yazıldı; bu test onun sözleşmesini kilitler). FAIL ise Task 1 Step 3'ü düzelt.

- [ ] **Step 3: `lib/offline/db.ts`** — import'a `import type { RemovedLine } from "@/lib/core/cart";`, `recordAuditLocal`'ın altına:

```ts
/** M9a: sepetten silme / sepeti boşaltma → giden kutusu → register_events. */
export async function recordRegisterEventLocal(shiftId: string, staffId: string, type: "line_removed" | "cart_cleared", lines: RemovedLine[]) {
  if (!lines.length) return;
  await enqueue({ kind: "register_event", id: crypto.randomUUID(), shiftId, staffId, at: new Date().toISOString(), type, lines });
}
```

- [ ] **Step 4: `components/kasa/SaleScreen.tsx`**

Import: `import { addProduct, lineTotal, removedLines, setQty, totals, type CartLine, type RemovedLine } from "@/lib/core/cart";`

İmzaya prop ekle: `…, scale, onRemove }: { …; scale?: ReadScale; onRemove?: (type: "line_removed" | "cart_cleared", lines: RemovedLine[]) => void }`

`const t = totals(cart);` satırının altına:

```ts
  // M9a: silme/azaltma kaydı. Güncelleyici fonksiyon değil düz değer: StrictMode'da iki kez çağrılıp çift olay yazmasın.
  const shrink = (next: CartLine[]) => {
    const out = removedLines(cart, next);
    setCart(next);
    if (out.length) onRemove?.("line_removed", out);
  };
  const clear = () => {
    if (cart.length) onRemove?.("cart_cleared", removedLines(cart, []));
    setCart([]);
  };
```

Satır 185: `onClick={() => shrink(setQty(cart, l.productId, 0))}`
Satır 188: `onClick={() => shrink(setQty(cart, l.productId, l.qtyMilli - 1000))}`
Satır 220: `onClick={clear}`
(Satır 190 "artır" ve satış sonrası `onDone` içindeki `setCart([])` DEĞİŞMEZ — satışla kapanan sepet olay değildir.)

- [ ] **Step 5: `components/kasa/KasaApp.tsx`** — import listesine `recordRegisterEventLocal` (`@/lib/offline/db`), `<SaleScreen` prop'larına:

```tsx
        onRemove={(type, lines) => { if (cashier && meta.shift) void recordRegisterEventLocal(meta.shift.id, cashier.id, type, lines).then(kick); }}
```

- [ ] **Step 6: Doğrula**

Run: `npx tsc --noEmit 2>&1 | head -5 && npx eslint components/kasa lib/offline lib/core/cart.ts 2>&1 | tail -3 && node --import ./tests/ts-resolve.mjs --test tests/cart.test.ts tests/offline.test.ts 2>&1 | tail -4`
Expected: tsc/eslint çıktısız, `# fail 0`.

- [ ] **Step 7: Commit**

```bash
git add lib/offline/db.ts components/kasa/SaleScreen.tsx components/kasa/KasaApp.tsx tests/cart.test.ts
git commit -m "M9a Görev 2: kasa sepetten silme/azaltma ve Temizle'yi register_event olarak giden kutusuna yazar"
```

---

### Task 3: Saf rapor hesabı — `lib/core/report.ts`

**Files:**
- Create: `lib/core/report.ts`
- Test: `tests/report.test.ts`

**Interfaces:**
- Produces (hepsi `lib/core/report.ts`'ten export):
  - `type Range = { bas: string; bit: string }`; `parseRange(bas?: string, bit?: string, now?: number): Range`; `prevRange(r): Range`; `rangeBounds(r): { from: Date; to: Date }`; `dayCount(r): number`; `presets(now?: number): { key: string; label: string; bas: string; bit: string }[]`; `istToday(now?: number, offsetDays?: number): string`
  - `REPORT_TABS: readonly { key: ReportTab; label: string; csv: boolean; range: boolean }[]`; `type ReportTab = "ozet" | "yogunluk" | "urunler" | "personel" | "vardiyalar" | "karlilik"`
  - `type SaleRow = { id: string; status: "kapandi" | "iade"; channel: "kasa" | "masa" | "paket" | "platform"; total: Kurus; net: Kurus; change: Kurus; at: Date; staffId: string }`
  - `type PayRow = { saleId: string; method: PayMethod; amount: Kurus }`
  - `type Summary = { gross: Kurus; net: Kurus; count: number; refunds: number; refundTotal: Kurus; avg: Kurus | null }`; `summarize(sales): Summary`; `pctChange(now: number, before: number): number | null`
  - `byChannel(sales): { key: string; label: string; gross: Kurus; count: number }[]`; `byMethod(sales, pays): { key: PayMethod; label: string; amount: Kurus }[]`
  - `type Heat = { cells: { gross: Kurus; count: number }[][]; max: Kurus }`; `heatmap(sales): Heat`; `WEEKDAYS`
  - `type LineRow = { productId: string | null; name: string; categoryId: string | null; qtyMilli: number; total: Kurus; refund: boolean }`; `type ProductRow = { key: string; productId: string | null; name: string; categoryId: string | null; qtyMilli: number; gross: Kurus; share: number }`; `productRows(lines, sort?: "adet" | "ciro"): ProductRow[]`; `type CategoryRow = { key: string; name: string; qtyMilli: number; gross: Kurus; share: number }`; `categoryRows(rows, names: Map<string, string>): CategoryRow[]`
  - `type EventKind = "iade" | "iptal" | "ikram" | "indirim" | "paket_iptal" | "silme"`; `EVENT_LABEL: Record<EventKind, string>`; `type StaffEvent = { at: Date; staffId: string | null; kind: EventKind; text: string; amount: Kurus | null; approvedBy: string | null; reason: string | null }`; `tabEventRow(x: { at: Date; staffId: string | null; approvedBy: string | null; type: string; payload: unknown; line: unknown }): StaffEvent`; `registerEventRow(x: { at: Date; staffId: string; type: string; lines: RemovedLine[]; total: Kurus }): StaffEvent`
  - `type StaffRow = { staffId: string; name: string; gross: Kurus; count: number; refunds: number; refundTotal: Kurus; voids: number; voidTotal: Kurus; comps: number; compTotal: Kurus; discounts: number; discountTotal: Kurus; cancels: number; removed: number; removedTotal: Kurus }`; `staffRows(sales, discounts: { staffId: string; discount: Kurus }[], events: StaffEvent[], names: Map<string, string>): StaffRow[]`
  - `toCsv(head: string[], rows: (string | number | null)[][]): string`; `csvTL(k: Kurus): string`; `csvQty(milli: number): string`; `qtyText(milli: number): string`

- [ ] **Step 1: Failing test** — `tests/report.test.ts`:

```ts
// tests/report.test.ts — saf rapor hesabı (DB yok).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseRange, prevRange, rangeBounds, dayCount, presets, summarize, pctChange, byChannel, byMethod, heatmap,
  productRows, categoryRows, staffRows, tabEventRow, registerEventRow, toCsv, csvTL, csvQty, type SaleRow,
} from "@/lib/core/report";

const NOW = Date.parse("2026-09-29T10:00:00Z"); // İstanbul 13:00, Salı
const sale = (o: Partial<SaleRow>): SaleRow => ({ id: crypto.randomUUID(), status: "kapandi", channel: "kasa", total: 10000, net: 9091, change: 0, at: new Date(NOW), staffId: "s1", ...o });

test("dönem: varsayılan 7 gün, ters sıra düzelir, tavan 366, önceki dönem, İstanbul sınırı", () => {
  assert.deepEqual(parseRange(undefined, undefined, NOW), { bas: "2026-09-23", bit: "2026-09-29" });
  assert.deepEqual(parseRange("2026-09-29", "2026-09-01", NOW), { bas: "2026-09-01", bit: "2026-09-29" });
  assert.deepEqual(parseRange("x", "2026-09-01", NOW), { bas: "2026-09-23", bit: "2026-09-29" });
  assert.equal(dayCount(parseRange("2020-01-01", "2026-09-29", NOW)), 366);
  assert.deepEqual(prevRange({ bas: "2026-09-23", bit: "2026-09-29" }), { bas: "2026-09-16", bit: "2026-09-22" });
  const b = rangeBounds({ bas: "2026-09-29", bit: "2026-09-29" });
  assert.equal(b.from.toISOString(), "2026-09-28T21:00:00.000Z");
  assert.equal(b.to.toISOString(), "2026-09-29T21:00:00.000Z");
  const p = presets(NOW);
  assert.deepEqual(p.find((x) => x.key === "ay"), { key: "ay", label: "Bu ay", bas: "2026-09-01", bit: "2026-09-29" });
  assert.deepEqual(p.find((x) => x.key === "dun"), { key: "dun", label: "Dün", bas: "2026-09-28", bit: "2026-09-28" });
});

test("özet: iade düşer, ortalama, değişim", () => {
  const s = summarize([sale({ total: 30000, net: 27273 }), sale({ total: 10000, net: 9091 }), sale({ status: "iade", total: 5000, net: 4545 })]);
  assert.deepEqual(s, { gross: 35000, net: 31819, count: 2, refunds: 1, refundTotal: 5000, avg: 17500 });
  assert.equal(summarize([]).avg, null);
  assert.equal(pctChange(150, 100), 50);
  assert.equal(pctChange(5, 0), null);
});

test("kanal ve ödeme dağılımı: para üstü nakitten, iade eksi", () => {
  const a = sale({ id: "a", total: 9000, change: 1000 }), b = sale({ id: "b", channel: "paket", total: 5000 }), r = sale({ id: "r", status: "iade", total: 2000 });
  assert.deepEqual(byChannel([a, b, r]), [{ key: "kasa", label: "Kasa", gross: 7000, count: 1 }, { key: "paket", label: "Paket", gross: 5000, count: 1 }]);
  const m = byMethod([a, b, r], [{ saleId: "a", method: "nakit", amount: 10000 }, { saleId: "b", method: "kart", amount: 5000 }, { saleId: "r", method: "nakit", amount: 2000 }]);
  assert.deepEqual(m, [{ key: "nakit", label: "Nakit", amount: 7000 }, { key: "kart", label: "Kart", amount: 5000 }]);
});

test("yoğunluk: İstanbul günü ve saati (UTC 21:30 Pzt = Salı 00:30)", () => {
  const h = heatmap([sale({ at: new Date("2026-09-28T21:30:00Z"), total: 4000 }), sale({ at: new Date("2026-09-28T21:45:00Z"), total: 1000 })]);
  assert.deepEqual(h.cells[1][0], { gross: 5000, count: 2 });
  assert.equal(h.max, 5000);
  assert.equal(h.cells.length, 7);
  assert.equal(h.cells[0].length, 24);
});

test("ürün ve kategori: iade eksi, pay, sıralama", () => {
  const rows = productRows([
    { productId: "p1", name: "Döner", categoryId: "c1", qtyMilli: 2000, total: 36000, refund: false },
    { productId: "p2", name: "Ayran", categoryId: null, qtyMilli: 5000, total: 12500, refund: false },
    { productId: "p1", name: "Döner", categoryId: "c1", qtyMilli: 1000, total: 18000, refund: true },
  ]);
  assert.deepEqual(rows.map((r) => [r.name, r.qtyMilli, r.gross]), [["Döner", 1000, 18000], ["Ayran", 5000, 12500]]);
  assert.equal(Math.round(rows[0].share), 59);
  assert.deepEqual(productRows([{ productId: "p1", name: "Döner", categoryId: "c1", qtyMilli: 1000, total: 18000, refund: false }, { productId: "p2", name: "Ayran", categoryId: null, qtyMilli: 5000, total: 12500, refund: false }], "adet").map((r) => r.name), ["Ayran", "Döner"]);
  assert.deepEqual(categoryRows(rows, new Map([["c1", "Ana yemek"]])).map((c) => [c.name, c.gross]), [["Ana yemek", 18000], ["Kategorisiz", 12500]]);
});

test("olay metni + personel birleştirme", () => {
  const at = new Date(NOW);
  const v = tabEventRow({ at, staffId: "s1", approvedBy: "m1", type: "void", payload: { lineId: "l", reason: "yanlış" }, line: { name: "Döner", unitPrice: 18000, qtyMilli: 2000 } });
  assert.deepEqual(v, { at, staffId: "s1", kind: "iptal", text: "Döner × 2", amount: 36000, approvedBy: "m1", reason: "yanlış" });
  const d = tabEventRow({ at, staffId: "s1", approvedBy: null, type: "discount", payload: { percent: 10, amount: null, reason: "" }, line: null });
  assert.equal(d.text, "Adisyon indirimi %10");
  assert.equal(d.reason, null);
  const c = tabEventRow({ at, staffId: "s1", approvedBy: null, type: "comp", payload: { lineId: "x", reason: "müdavim" }, line: { name: "Çay", unitPrice: 1000, qtyMilli: 1000 } });
  const r = registerEventRow({ at, staffId: "s1", type: "cart_cleared", lines: [{ productId: null, name: "Su", qtyMilli: 1000, total: 1000 }, { productId: null, name: "Ayran", qtyMilli: 2000, total: 5000 }], total: 6000 });
  assert.equal(r.text, "Sepet boşaltıldı: Su × 1, Ayran × 2");
  const rows = staffRows(
    [sale({ total: 30000 }), sale({ staffId: "s2", total: 5000 }), sale({ status: "iade", total: 2000 })],
    [{ staffId: "s1", discount: 1500 }],
    [v, d, c, r, { at, staffId: "s1", kind: "iade", text: "İade K1-000001", amount: 2000, approvedBy: "m1", reason: null }, { ...r, staffId: null }],
    new Map([["s1", "Ayşe"]]),
  );
  assert.deepEqual(rows[0], { staffId: "s1", name: "Ayşe", gross: 30000, count: 1, refunds: 1, refundTotal: 2000, voids: 1, voidTotal: 36000, comps: 1, compTotal: 1000, discounts: 1, discountTotal: 1500, cancels: 0, removed: 1, removedTotal: 6000 });
  assert.equal(rows[1].name, "Bilinmeyen");
});

test("CSV: BOM, ; ayırıcı, CRLF, kaçış, formül koruması, negatif tutar korunur", () => {
  const out = toCsv(["Ad", "Tutar"], [["=HYPERLINK(1)", csvTL(-1250)], ['A;"b"', csvTL(123450)], ["x", null], ["y", csvQty(1500)]]);
  assert.equal(out, "﻿Ad;Tutar\r\n'=HYPERLINK(1);-12,50\r\n\"A;\"\"b\"\"\";1234,50\r\nx;\r\ny;1,5\r\n");
});
```

- [ ] **Step 2: Run** `node --import ./tests/ts-resolve.mjs --test tests/report.test.ts 2>&1 | tail -5` → FAIL (modül yok).

- [ ] **Step 3: `lib/core/report.ts`**

```ts
// lib/core/report.ts — M9a raporları, saf hesap (DB yok). Tutarlar kuruş, gün İstanbul (+03:00).
// Brüt = kapandi − iade (KDV dahil, indirimli); iptal satış hiç gelmez (sorgu süzer).
import { formatTL, type Kurus } from "./money";
import { PAY_METHODS, type PayMethod } from "./payment";
import type { RemovedLine } from "./cart";

const DAY = 86400_000;
const IST = 3 * 3600_000;
export const MAX_DAYS = 366;

export type Range = { bas: string; bit: string };
export type ReportTab = "ozet" | "yogunluk" | "urunler" | "personel" | "vardiyalar" | "karlilik";
export const REPORT_TABS: readonly { key: ReportTab; label: string; csv: boolean; range: boolean }[] = [
  { key: "ozet", label: "Özet", csv: true, range: true },
  { key: "yogunluk", label: "Yoğunluk", csv: true, range: true },
  { key: "urunler", label: "Ürünler", csv: true, range: true },
  { key: "personel", label: "Personel", csv: true, range: true },
  { key: "vardiyalar", label: "Vardiyalar", csv: false, range: false },
  { key: "karlilik", label: "Kârlılık", csv: false, range: true },
];

export const istToday = (now = Date.now(), offsetDays = 0) => new Date(now + IST + offsetDays * DAY).toISOString().slice(0, 10);
const validDay = (d: string | undefined): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
const shiftDay = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export const dayCount = (r: Range) => Math.round((Date.parse(`${r.bit}T00:00:00Z`) - Date.parse(`${r.bas}T00:00:00Z`)) / DAY) + 1;

/** Geçersiz → son 7 gün; ters sıra düzelir; 366 günden uzunsa başlangıç kısalır. */
export function parseRange(bas?: string, bit?: string, now = Date.now()): Range {
  if (!validDay(bas) || !validDay(bit)) return { bas: istToday(now, -6), bit: istToday(now) };
  const [b, e] = bas <= bit ? [bas, bit] : [bit, bas];
  return dayCount({ bas: b, bit: e }) > MAX_DAYS ? { bas: shiftDay(e, -(MAX_DAYS - 1)), bit: e } : { bas: b, bit: e };
}
export const prevRange = (r: Range): Range => ({ bas: shiftDay(r.bas, -dayCount(r)), bit: shiftDay(r.bas, -1) });
export const rangeBounds = (r: Range) => ({ from: new Date(`${r.bas}T00:00:00+03:00`), to: new Date(Date.parse(`${r.bit}T00:00:00+03:00`) + DAY) });
export const presets = (now = Date.now()) => [
  { key: "bugun", label: "Bugün", bas: istToday(now), bit: istToday(now) },
  { key: "dun", label: "Dün", bas: istToday(now, -1), bit: istToday(now, -1) },
  { key: "7", label: "7 gün", bas: istToday(now, -6), bit: istToday(now) },
  { key: "30", label: "30 gün", bas: istToday(now, -29), bit: istToday(now) },
  { key: "ay", label: "Bu ay", bas: `${istToday(now).slice(0, 8)}01`, bit: istToday(now) },
];

export type SaleRow = { id: string; status: "kapandi" | "iade"; channel: "kasa" | "masa" | "paket" | "platform"; total: Kurus; net: Kurus; change: Kurus; at: Date; staffId: string };
export type PayRow = { saleId: string; method: PayMethod; amount: Kurus };
export type Summary = { gross: Kurus; net: Kurus; count: number; refunds: number; refundTotal: Kurus; avg: Kurus | null };

export function summarize(sales: SaleRow[]): Summary {
  const s = { gross: 0, net: 0, count: 0, refunds: 0, refundTotal: 0 };
  for (const x of sales) {
    if (x.status === "kapandi") { s.gross += x.total; s.net += x.net; s.count++; }
    else { s.gross -= x.total; s.net -= x.net; s.refunds++; s.refundTotal += x.total; }
  }
  return { ...s, avg: s.count ? Math.round(s.gross / s.count) : null };
}
export const pctChange = (now: number, before: number): number | null => (before === 0 ? null : ((now - before) / before) * 100);

const CHANNELS = [["kasa", "Kasa"], ["masa", "Masa"], ["paket", "Paket"], ["platform", "Platform"]] as const;
export function byChannel(sales: SaleRow[]) {
  return CHANNELS.map(([key, label]) => {
    const mine = sales.filter((s) => s.channel === key);
    return { key, label, gross: mine.reduce((t, s) => t + (s.status === "kapandi" ? s.total : -s.total), 0), count: mine.filter((s) => s.status === "kapandi").length };
  }).filter((c) => c.count || c.gross);
}

/** Ödeme yöntemi: iade eksi; para üstü (satış başına bir kez) nakitten düşer. */
export function byMethod(sales: SaleRow[], pays: PayRow[]) {
  const sale = new Map(sales.map((s) => [s.id, s]));
  const sum = new Map<PayMethod, number>();
  for (const p of pays) {
    const s = sale.get(p.saleId);
    if (s) sum.set(p.method, (sum.get(p.method) ?? 0) + (s.status === "iade" ? -p.amount : p.amount));
  }
  const change = sales.reduce((t, s) => t + (s.status === "kapandi" ? s.change : 0), 0);
  if (change) sum.set("nakit", (sum.get("nakit") ?? 0) - change);
  return PAY_METHODS.filter((m) => sum.get(m.value)).map((m) => ({ key: m.value, label: m.label, amount: sum.get(m.value)! }));
}

export const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"] as const;
export type Heat = { cells: { gross: Kurus; count: number }[][]; max: Kurus };
/** 7 (Pzt=0) × 24 saat, İstanbul saati. */
export function heatmap(sales: SaleRow[]): Heat {
  const cells = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ gross: 0, count: 0 })));
  for (const s of sales) {
    const d = new Date(s.at.getTime() + IST);
    const c = cells[(d.getUTCDay() + 6) % 7][d.getUTCHours()];
    if (s.status === "kapandi") { c.gross += s.total; c.count++; } else c.gross -= s.total;
  }
  return { cells, max: Math.max(0, ...cells.flat().map((c) => c.gross)) };
}

export type LineRow = { productId: string | null; name: string; categoryId: string | null; qtyMilli: number; total: Kurus; refund: boolean };
export type ProductRow = { key: string; productId: string | null; name: string; categoryId: string | null; qtyMilli: number; gross: Kurus; share: number };
export function productRows(lines: LineRow[], sort: "adet" | "ciro" = "ciro"): ProductRow[] {
  const by = new Map<string, ProductRow>();
  for (const l of lines) {
    const key = l.productId ?? `ad:${l.name}`;
    const r = by.get(key) ?? { key, productId: l.productId, name: l.name, categoryId: l.categoryId, qtyMilli: 0, gross: 0, share: 0 };
    const s = l.refund ? -1 : 1;
    r.qtyMilli += s * l.qtyMilli;
    r.gross += s * l.total;
    by.set(key, r);
  }
  const rows = [...by.values()];
  const total = rows.reduce((t, r) => t + r.gross, 0);
  for (const r of rows) r.share = total > 0 ? (r.gross / total) * 100 : 0;
  return rows.sort((a, b) => (sort === "adet" ? b.qtyMilli - a.qtyMilli : b.gross - a.gross) || a.name.localeCompare(b.name, "tr"));
}

export type CategoryRow = { key: string; name: string; qtyMilli: number; gross: Kurus; share: number };
export function categoryRows(rows: ProductRow[], names: Map<string, string>): CategoryRow[] {
  const by = new Map<string, CategoryRow>();
  for (const r of rows) {
    const key = r.categoryId ?? "-";
    const c = by.get(key) ?? { key, name: (r.categoryId && names.get(r.categoryId)) || "Kategorisiz", qtyMilli: 0, gross: 0, share: 0 };
    c.qtyMilli += r.qtyMilli; c.gross += r.gross; c.share += r.share;
    by.set(key, c);
  }
  return [...by.values()].sort((a, b) => b.gross - a.gross);
}

export type EventKind = "iade" | "iptal" | "ikram" | "indirim" | "paket_iptal" | "silme";
export const EVENT_LABEL: Record<EventKind, string> = { iade: "İade", iptal: "Adisyon iptali", ikram: "İkram", indirim: "İndirim", paket_iptal: "Paket iptali", silme: "Sepetten silme" };
export type StaffEvent = { at: Date; staffId: string | null; kind: EventKind; text: string; amount: Kurus | null; approvedBy: string | null; reason: string | null };

export const qtyText = (milli: number) => (milli / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 3 });
const TAB_KIND: Record<string, EventKind> = { void: "iptal", comp: "ikram", discount: "indirim", cancel: "paket_iptal" };

/** tab_events (void/comp/discount/cancel) + satırın "add" olayı → olay. */
export function tabEventRow(x: { at: Date; staffId: string | null; approvedBy: string | null; type: string; payload: unknown; line: unknown }): StaffEvent {
  const p = x.payload as { reason?: string; percent?: number | null; amount?: number | null };
  const l = x.line as { name: string; unitPrice: number; qtyMilli: number } | null;
  const lineAmount = l ? Math.round((l.unitPrice * l.qtyMilli) / 1000) : null;
  const text = x.type === "discount"
    ? p.percent != null ? `Adisyon indirimi %${p.percent}` : p.amount != null ? `Adisyon indirimi ${formatTL(p.amount)}` : "İndirim kaldırıldı"
    : x.type === "cancel" ? "Paket sipariş iptali" : l ? `${l.name} × ${qtyText(l.qtyMilli)}` : "Satır";
  const amount = x.type === "discount" ? (p.amount ?? null) : x.type === "cancel" ? null : lineAmount;
  return { at: x.at, staffId: x.staffId, kind: TAB_KIND[x.type], text, amount, approvedBy: x.approvedBy, reason: p.reason || null };
}

export function registerEventRow(x: { at: Date; staffId: string; type: string; lines: RemovedLine[]; total: Kurus }): StaffEvent {
  const what = x.lines.map((l) => `${l.name} × ${qtyText(l.qtyMilli)}`).join(", ");
  return { at: x.at, staffId: x.staffId, kind: "silme", text: x.type === "cart_cleared" ? `Sepet boşaltıldı: ${what}` : what, amount: x.total, approvedBy: null, reason: null };
}

export type StaffRow = { staffId: string; name: string; gross: Kurus; count: number; refunds: number; refundTotal: Kurus; voids: number; voidTotal: Kurus; comps: number; compTotal: Kurus; discounts: number; discountTotal: Kurus; cancels: number; removed: number; removedTotal: Kurus };
/** Satış (kapandi) sales'ten; iade/iptal/ikram/indirim/paket iptali/silme olaylardan; "indirim + ikram payı" tutarı sale_lines.discount'tan. */
export function staffRows(sales: SaleRow[], discounts: { staffId: string; discount: Kurus }[], events: StaffEvent[], names: Map<string, string>): StaffRow[] {
  const by = new Map<string, StaffRow>();
  const row = (id: string) => {
    let r = by.get(id);
    if (!r) by.set(id, (r = { staffId: id, name: names.get(id) ?? "Bilinmeyen", gross: 0, count: 0, refunds: 0, refundTotal: 0, voids: 0, voidTotal: 0, comps: 0, compTotal: 0, discounts: 0, discountTotal: 0, cancels: 0, removed: 0, removedTotal: 0 }));
    return r;
  };
  for (const s of sales) if (s.status === "kapandi") { const r = row(s.staffId); r.gross += s.total; r.count++; }
  for (const d of discounts) row(d.staffId).discountTotal += d.discount;
  for (const e of events) {
    if (!e.staffId) continue;
    const r = row(e.staffId), a = e.amount ?? 0;
    if (e.kind === "iade") { r.refunds++; r.refundTotal += a; }
    else if (e.kind === "iptal") { r.voids++; r.voidTotal += a; }
    else if (e.kind === "ikram") { r.comps++; r.compTotal += a; }
    else if (e.kind === "indirim") r.discounts++;
    else if (e.kind === "paket_iptal") r.cancels++;
    else { r.removed++; r.removedTotal += a; }
  }
  return [...by.values()].sort((a, b) => b.gross - a.gross || a.name.localeCompare(b.name, "tr"));
}

// — CSV: Türkçe Excel (UTF-8 BOM, ;, CRLF, ondalık virgül) —
export const csvTL = (k: Kurus) => (k / 100).toFixed(2).replace(".", ",");
export const csvQty = (milli: number) => String(milli / 1000).replace(".", ",");
const NUMERIC = /^-?\d+(,\d+)?$/;
function cell(v: string | number | null): string {
  if (v === null) return "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && !NUMERIC.test(s)) s = `'${s}`; // formül enjeksiyonu
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const toCsv = (head: string[], rows: (string | number | null)[][]) => `﻿${[head, ...rows].map((r) => r.map(cell).join(";")).join("\r\n")}\r\n`;
```

- [ ] **Step 4: Run** `node --import ./tests/ts-resolve.mjs --test tests/report.test.ts 2>&1 | tail -5` → `# fail 0`. `PayMethod` `lib/core/payment.ts`'ten export değilse: `export type PayMethod = (typeof PAY_METHODS)[number]["value"];` ekle.

- [ ] **Step 5: Commit**

```bash
git add lib/core/report.ts tests/report.test.ts lib/core/payment.ts
git commit -m "M9a Görev 3: saf rapor hesabı (dönem, özet, dağılım, yoğunluk, ürün, personel, CSV)"
```

---

### Task 4: Rapor sorguları — `lib/admin/report.ts`

**Files:**
- Create: `lib/admin/report.ts`
- Test: `tests/report-db.test.ts`

**Interfaces:**
- Consumes: Task 1 tablo, Task 3 fonksiyon/tipleri.
- Produces:
  - `summaryData(tx: Tx, r: Range): Promise<{ now: Summary; before: Summary; channels: ReturnType<typeof byChannel>; methods: ReturnType<typeof byMethod> }>`
  - `heatData(tx, r): Promise<Heat>`
  - `productData(tx, r, sort: "adet" | "ciro"): Promise<{ rows: ProductRow[]; categories: CategoryRow[]; unsold: { id: string; name: string }[] }>`
  - `staffData(tx, r): Promise<StaffRow[]>`
  - `staffEvents(tx, r, staffId: string): Promise<{ events: StaffEvent[]; names: Map<string, string> }>` (en çok 500)
  - `reportCsv(tx, sekme: string, r: Range, kisi: string | null): Promise<string | null>` (bilinmeyen sekme → null)

- [ ] **Step 1: Failing test** — `tests/report-db.test.ts`:

```ts
// tests/report-db.test.ts — cabukpos_test, uygulama rolü. Dönem sorguları + CSV + RLS.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
process.env.MIGRATE_DATABASE_URL = "postgres://yigiterturk@localhost:5432/cabukpos_test";
const { getDb, withTenant, schema } = await import("@/db");
const { applyDoc } = await import("@/lib/sync/apply");
const { summaryData, heatData, productData, staffData, staffEvents, reportCsv } = await import("@/lib/admin/report");
const { istToday } = await import("@/lib/core/report");
const { eq } = await import("drizzle-orm");

const [t] = await getDb().insert(schema.tenants).values({ name: "RAPOR-T", vertical: "restoran" }).returning();
const [t2] = await getDb().insert(schema.tenants).values({ name: "RAPOR-T2", vertical: "market" }).returning();
const s = await withTenant(t.id, async (tx) => {
  const [store] = await tx.insert(schema.stores).values({ tenantId: t.id, name: "Merkez" }).returning();
  const [cat] = await tx.insert(schema.categories).values({ tenantId: t.id, name: "Ana yemek" }).returning();
  const [ali] = await tx.insert(schema.staff).values({ tenantId: t.id, name: "Ali", pinHash: "x" }).returning();
  const [mudur] = await tx.insert(schema.staff).values({ tenantId: t.id, name: "Müdür", role: "mudur", pinHash: "x" }).returning();
  const [doner] = await tx.insert(schema.products).values({ tenantId: t.id, name: "Döner", price: 18000, vatRate: 10, categoryId: cat.id }).returning();
  const [ayran] = await tx.insert(schema.products).values({ tenantId: t.id, name: "Ayran", price: 2500, vatRate: 10 }).returning();
  await tx.insert(schema.products).values({ tenantId: t.id, name: "Künefe", price: 9000, vatRate: 10 });
  await tx.insert(schema.products).values({ tenantId: t.id, name: "Un", price: 100, vatRate: 1, sellable: false });
  return { store, cat, ali, mudur, doner, ayran };
});
const [dev] = await getDb().insert(schema.devices).values({ tenantId: t.id, storeId: s.store.id, name: "Kasa 1", receiptPrefix: "R1" }).returning();
const ctx = { tenantId: t.id, storeId: s.store.id, deviceId: dev.id, receiptPrefix: "R1" };
const shiftId = crypto.randomUUID();
const at = new Date().toISOString();
const ok = async (doc: Record<string, unknown>) => assert.equal((await applyDoc(ctx, doc)).ok, true);
await ok({ kind: "shift_open", id: shiftId, staffId: s.ali.id, at, openingCash: 0 });
const sale1 = crypto.randomUUID();
await ok({ kind: "sale", id: sale1, shiftId, staffId: s.ali.id, receiptSeq: 1, at, lines: [{ productId: s.doner.id, name: "Döner", unitPrice: 18000, vatRate: 10, qtyMilli: 2000 }, { productId: s.ayran.id, name: "Ayran", unitPrice: 2500, vatRate: 10, qtyMilli: 1000 }], payments: [{ method: "nakit", amount: 40000 }] });
await ok({ kind: "refund", id: crypto.randomUUID(), shiftId, staffId: s.ali.id, approvedBy: s.mudur.id, refundOf: sale1, receiptSeq: 2, at, lines: [{ productId: s.ayran.id, name: "Ayran", unitPrice: 2500, vatRate: 10, qtyMilli: 1000 }], payments: [{ method: "nakit", amount: 2500 }] });
await ok({ kind: "register_event", id: crypto.randomUUID(), shiftId, staffId: s.ali.id, at, type: "line_removed", lines: [{ productId: s.doner.id, name: "Döner", qtyMilli: 1000, total: 18000 }] });
// Adisyon iptali: olaylar doğrudan (applyTab kurallarından bağımsız sınanır)
const tabId = crypto.randomUUID(), lineId = crypto.randomUUID();
await withTenant(t.id, (tx) => tx.insert(schema.tabEvents).values([
  { id: crypto.randomUUID(), tenantId: t.id, storeId: s.store.id, tabId, staffId: s.ali.id, at: new Date(), type: "add", payload: { type: "add", lineId, productId: s.doner.id, name: "Döner", unitPrice: 18000, vatRate: 10, qtyMilli: 1000, options: [], note: null, stationId: null } },
  { id: crypto.randomUUID(), tenantId: t.id, storeId: s.store.id, tabId, staffId: s.ali.id, approvedBy: s.mudur.id, at: new Date(), type: "void", payload: { type: "void", lineId, reason: "yanlış masa" } },
]));
const r = { bas: istToday(), bit: istToday() };

after(async () => {
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t.id));
  await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t2.id));
});

test("özet: brüt 385 − 25 = 360, önceki dönem 0, nakit para üstü (15) düşülmüş", async () => {
  const d = await withTenant(t.id, (tx) => summaryData(tx, r));
  assert.equal(d.now.gross, 36000);
  assert.equal(d.now.count, 1);
  assert.equal(d.before.gross, 0);
  assert.deepEqual(d.methods, [{ key: "nakit", label: "Nakit", amount: 36000 }]); // 400 − 15 üstü − 25 iade
});

test("yoğunluk + ürün + hiç satılmayan (hammadde hariç)", async () => {
  const h = await withTenant(t.id, (tx) => heatData(tx, r));
  assert.equal(h.max, 36000);
  const p = await withTenant(t.id, (tx) => productData(tx, r, "ciro"));
  assert.deepEqual(p.rows.map((x) => [x.name, x.qtyMilli, x.gross]), [["Döner", 2000, 36000], ["Ayran", 0, 0]]);
  assert.equal(p.categories[0].name, "Ana yemek");
  assert.deepEqual(p.unsold.map((x) => x.name), ["Künefe"]);
});

test("personel: iade, adisyon iptali, sepetten silme; olay listesi", async () => {
  const [ali] = await withTenant(t.id, (tx) => staffData(tx, r));
  assert.equal(ali.name, "Ali");
  assert.deepEqual([ali.gross, ali.refunds, ali.refundTotal, ali.voids, ali.voidTotal, ali.removed, ali.removedTotal], [38500, 1, 2500, 1, 18000, 1, 18000]);
  const { events, names } = await withTenant(t.id, (tx) => staffEvents(tx, r, s.ali.id));
  assert.deepEqual(events.map((e) => e.kind).sort(), ["iade", "iptal", "silme"]);
  assert.equal(names.get(s.mudur.id), "Müdür");
});

test("CSV: personel + bilinmeyen sekme + başka kiracı boş", async () => {
  const csv = await withTenant(t.id, (tx) => reportCsv(tx, "personel", r, null));
  assert.ok(csv!.startsWith("﻿Personel;"));
  assert.match(csv!, /Ali;385,00;1;/);
  assert.equal(await withTenant(t.id, (tx) => reportCsv(tx, "yok", r, null)), null);
  const empty = await withTenant(t2.id, (tx) => staffData(tx, r));
  assert.equal(empty.length, 0);
});
```

- [ ] **Step 2: Run** `node --import ./tests/ts-resolve.mjs --test tests/report-db.test.ts 2>&1 | tail -5` → FAIL (modül yok).

- [ ] **Step 3: `lib/admin/report.ts`**

```ts
// lib/admin/report.ts — M9a dönem sorguları (withTenant içinde) → lib/core/report saf hesabı.
import { and, desc, eq, gte, inArray, lt, notInArray, sql, type SQL } from "drizzle-orm";
import { alias, type PgColumn } from "drizzle-orm/pg-core";
import { schema, type Tx } from "@/db";
import {
  byChannel, byMethod, categoryRows, csvQty, csvTL, EVENT_LABEL, heatmap, prevRange, productRows, rangeBounds, registerEventRow,
  staffRows, summarize, tabEventRow, toCsv, WEEKDAYS, type PayRow, type Range, type SaleRow, type StaffEvent,
} from "@/lib/core/report";
import type { PayMethod } from "@/lib/core/payment";

const S = schema.sales, L = schema.saleLines;
const inRange = (col: PgColumn, r: Range) => { const { from, to } = rangeBounds(r); return and(gte(col, from), lt(col, to)) as SQL; };
const closedOrRefund = inArray(S.status, ["kapandi", "iade"]);

async function salesIn(tx: Tx, r: Range): Promise<SaleRow[]> {
  const rows = await tx.select({ id: S.id, status: S.status, channel: S.channel, total: S.total, change: S.change, vat: S.vat, at: S.createdAt, staffId: S.staffId })
    .from(S).where(and(closedOrRefund, inRange(S.createdAt, r)));
  return rows.map((x) => ({ id: x.id, status: x.status as SaleRow["status"], channel: x.channel, total: x.total, change: x.change, net: (x.vat as { net: number }[]).reduce((t, v) => t + v.net, 0), at: x.at, staffId: x.staffId }));
}

async function paymentsIn(tx: Tx, r: Range): Promise<PayRow[]> {
  const P = schema.payments;
  const rows = await tx.select({ saleId: P.saleId, method: P.method, amount: P.amount }).from(P).innerJoin(S, eq(S.id, P.saleId)).where(and(closedOrRefund, inRange(S.createdAt, r)));
  return rows.map((x) => ({ ...x, method: x.method as PayMethod }));
}

async function staffNames(tx: Tx) {
  return new Map((await tx.select({ id: schema.staff.id, name: schema.staff.name }).from(schema.staff)).map((x) => [x.id, x.name]));
}

export async function summaryData(tx: Tx, r: Range) {
  const [sales, pays, before] = [await salesIn(tx, r), await paymentsIn(tx, r), await salesIn(tx, prevRange(r))];
  return { now: summarize(sales), before: summarize(before), channels: byChannel(sales), methods: byMethod(sales, pays) };
}

export const heatData = async (tx: Tx, r: Range) => heatmap(await salesIn(tx, r));

export async function productData(tx: Tx, r: Range, sort: "adet" | "ciro") {
  const Pr = schema.products;
  const lines = await tx.select({ productId: L.productId, name: L.name, categoryId: Pr.categoryId, qtyMilli: L.qtyMilli, total: L.total, status: S.status })
    .from(L).innerJoin(S, eq(S.id, L.saleId)).leftJoin(Pr, eq(Pr.id, L.productId))
    .where(and(closedOrRefund, inRange(S.createdAt, r)));
  const rows = productRows(lines.map((l) => ({ ...l, refund: l.status === "iade" })), sort);
  const names = new Map((await tx.select({ id: schema.categories.id, name: schema.categories.name }).from(schema.categories)).map((c) => [c.id, c.name]));
  const sold = rows.flatMap((x) => (x.productId ? [x.productId] : []));
  const unsold = await tx.select({ id: Pr.id, name: Pr.name }).from(Pr)
    .where(and(eq(Pr.active, true), eq(Pr.sellable, true), sold.length ? notInArray(Pr.id, sold) : undefined)).orderBy(Pr.name);
  return { rows, categories: categoryRows(rows, names), unsold };
}

async function eventsIn(tx: Tx, r: Range, staffId?: string, limit?: number): Promise<StaffEvent[]> {
  const T = schema.tabEvents, A = alias(schema.tabEvents, "a"), R = schema.registerEvents;
  const who = (c: PgColumn) => (staffId ? eq(c, staffId) : undefined);
  const refunds = await tx.select({ at: S.createdAt, staffId: S.staffId, approvedBy: S.approvedBy, receiptNo: S.receiptNo, total: S.total }).from(S)
    .where(and(eq(S.status, "iade"), inRange(S.createdAt, r), who(S.staffId))).orderBy(desc(S.createdAt)).limit(limit ?? 100_000);
  const tabs = await tx.select({ at: T.at, staffId: T.staffId, approvedBy: T.approvedBy, type: T.type, payload: T.payload, line: A.payload }).from(T)
    .leftJoin(A, and(eq(A.tabId, T.tabId), eq(A.type, "add"), sql`${A.payload}->>'lineId' = ${T.payload}->>'lineId'`))
    .where(and(inArray(T.type, ["void", "comp", "discount", "cancel"]), inRange(T.at, r), who(T.staffId))).orderBy(desc(T.at)).limit(limit ?? 100_000);
  const regs = await tx.select({ at: R.at, staffId: R.staffId, type: R.type, lines: R.lines, total: R.total }).from(R)
    .where(and(inRange(R.at, r), who(R.staffId))).orderBy(desc(R.at)).limit(limit ?? 100_000);
  const all: StaffEvent[] = [
    ...refunds.map((x) => ({ at: x.at, staffId: x.staffId, kind: "iade" as const, text: `İade ${x.receiptNo}`, amount: x.total, approvedBy: x.approvedBy, reason: null })),
    ...tabs.map(tabEventRow),
    ...regs.map(registerEventRow),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  return limit ? all.slice(0, limit) : all;
}

export async function staffData(tx: Tx, r: Range) {
  const discounts = await tx.select({ staffId: S.staffId, discount: sql<number>`sum(${L.discount})::int` }).from(L).innerJoin(S, eq(S.id, L.saleId))
    .where(and(eq(S.status, "kapandi"), inRange(S.createdAt, r), sql`${L.discount} > 0`)).groupBy(S.staffId);
  return staffRows(await salesIn(tx, r), discounts, await eventsIn(tx, r), await staffNames(tx));
}

export async function staffEvents(tx: Tx, r: Range, staffId: string) {
  return { events: await eventsIn(tx, r, staffId, 500), names: await staffNames(tx) };
}

const pct = (n: number | null) => (n === null ? "" : n.toFixed(1).replace(".", ","));
const dt = (d: Date) => d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function reportCsv(tx: Tx, sekme: string, r: Range, kisi: string | null): Promise<string | null> {
  if (sekme === "ozet") {
    const d = await summaryData(tx, r);
    return toCsv(["Kalem", "Değer", "Önceki dönem"], [
      ["Brüt ciro", csvTL(d.now.gross), csvTL(d.before.gross)], ["Net ciro (KDV hariç)", csvTL(d.now.net), csvTL(d.before.net)],
      ["Fiş", d.now.count, d.before.count], ["Ortalama sepet", d.now.avg === null ? null : csvTL(d.now.avg), d.before.avg === null ? null : csvTL(d.before.avg)],
      ["İade", csvTL(d.now.refundTotal), csvTL(d.before.refundTotal)],
      ...d.channels.map((c) => [`Kanal: ${c.label}`, csvTL(c.gross), null]), ...d.methods.map((m) => [`Ödeme: ${m.label}`, csvTL(m.amount), null]),
    ]);
  }
  if (sekme === "yogunluk") {
    const h = await heatData(tx, r);
    return toCsv(["Gün", ...Array.from({ length: 24 }, (_, i) => `${i}:00`)], h.cells.map((row, i) => [WEEKDAYS[i], ...row.map((c) => csvTL(c.gross))]));
  }
  if (sekme === "urunler") {
    const p = await productData(tx, r, "ciro");
    const cat = new Map(p.categories.map((c) => [c.key, c.name]));
    return toCsv(["Ürün", "Kategori", "Adet", "Brüt", "Pay %"], p.rows.map((x) => [x.name, cat.get(x.categoryId ?? "-") ?? "Kategorisiz", csvQty(x.qtyMilli), csvTL(x.gross), pct(x.share)]));
  }
  if (sekme === "personel") {
    const rows = await staffData(tx, r);
    return toCsv(["Personel", "Satış", "Fiş", "İade adet", "İade", "Adisyon iptali adet", "Adisyon iptali", "İkram adet", "İkram", "İndirim adet", "İndirim + ikram payı", "Paket iptali", "Sepetten silme adet", "Sepetten silme"],
      rows.map((x) => [x.name, csvTL(x.gross), x.count, x.refunds, csvTL(x.refundTotal), x.voids, csvTL(x.voidTotal), x.comps, csvTL(x.compTotal), x.discounts, csvTL(x.discountTotal), x.cancels, x.removed, csvTL(x.removedTotal)]));
  }
  if (sekme === "olaylar" && kisi && UUID.test(kisi)) {
    const { events, names } = await staffEvents(tx, r, kisi);
    return toCsv(["Zaman", "Tür", "İçerik", "Tutar", "Onaylayan", "Gerekçe"],
      events.map((e) => [dt(e.at), EVENT_LABEL[e.kind], e.text, e.amount === null ? null : csvTL(e.amount), e.approvedBy ? names.get(e.approvedBy) ?? "Bilinmeyen" : null, e.reason]));
  }
  return null;
}
```

- [ ] **Step 4: Run** `node --import ./tests/ts-resolve.mjs --test tests/report-db.test.ts 2>&1 | tail -8` → `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/report.ts tests/report-db.test.ts
git commit -m "M9a Görev 4: rapor sorguları (özet, yoğunluk, ürün, personel, olaylar) + CSV üretimi"
```

---

### Task 5: Rapor ekranı — sekmeler

**Files:**
- Create: `components/reports/RangeBar.tsx`, `components/reports/SummaryTab.tsx`, `components/reports/HeatTab.tsx`, `components/reports/ProductsTab.tsx`, `components/reports/StaffTab.tsx`, `components/reports/ProfitTab.tsx`, `components/reports/ShiftsTab.tsx`
- Modify: `app/yonetim/raporlar/page.tsx` (tamamı yeniden)
- Modify: `e2e/m1.mjs:117` (varsayılan sekme artık Özet)

**Interfaces:**
- Consumes: Task 3 (`REPORT_TABS`, `parseRange`, `presets`, `pctChange`, `WEEKDAYS`, `EVENT_LABEL`, `qtyText`, tipler), Task 4 (`summaryData`, `heatData`, `productData`, `staffData`, `staffEvents`).
- Produces (e2e'nin dayandığı test kimlikleri): `sum-gross`, `sum-count`, `sum-avg`, `staff-<ad>` satırı içinde `staff-refund`, `staff-void`, `staff-removed`; olay listesi `staff-events`; `critical-card` ve `profit-*` korunur.

- [ ] **Step 1: `components/reports/RangeBar.tsx`**

```tsx
import Link from "next/link";
import { presets, type Range, type ReportTab } from "@/lib/core/report";

const qs = (o: Record<string, string | undefined>) => new URLSearchParams(Object.entries(o).filter((e): e is [string, string] => !!e[1])).toString();
export const reportHref = (sekme: ReportTab, r?: Range, extra: Record<string, string | undefined> = {}) => `/yonetim/raporlar?${qs({ sekme, bas: r?.bas, bit: r?.bit, ...extra })}`;

/** Tarih aralığı: hazır aralıklar (bağlantı) + başlangıç/bitiş + CSV. */
export function RangeBar({ sekme, range, csv, extra = {} }: { sekme: ReportTab; range: Range; csv: string | null; extra?: Record<string, string | undefined> }) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 text-sm">
      <div className="flex flex-wrap gap-1" aria-label="Hazır aralık">
        {presets().map((p) => {
          const on = p.bas === range.bas && p.bit === range.bit;
          return <Link key={p.key} href={reportHref(sekme, p, extra)} aria-current={on ? "true" : undefined} className={`rounded-lg border px-3 py-2 ${on ? "border-brand bg-brand-soft font-medium text-brand" : "border-line hover:bg-stone-50"}`}>{p.label}</Link>;
        })}
      </div>
      <form className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="sekme" value={sekme} />
        {Object.entries(extra).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
        <label className="flex flex-col gap-1">Başlangıç<input type="date" name="bas" defaultValue={range.bas} className="rounded-lg border border-line px-3 py-2" /></label>
        <label className="flex flex-col gap-1">Bitiş<input type="date" name="bit" defaultValue={range.bit} className="rounded-lg border border-line px-3 py-2" /></label>
        <button className="rounded-lg border border-line px-3 py-2 hover:bg-stone-50">Göster</button>
      </form>
      {csv && <a href={`/yonetim/raporlar/csv?${qs({ sekme: csv, bas: range.bas, bit: range.bit, ...extra })}`} download className="ml-auto rounded-lg border border-line px-3 py-2 hover:bg-stone-50">CSV indir</a>}
    </div>
  );
}
```

- [ ] **Step 2: `components/reports/SummaryTab.tsx`**

```tsx
import { formatTL } from "@/lib/core/money";
import { pctChange } from "@/lib/core/report";
import type { summaryData } from "@/lib/admin/report";
import { Card, Empty } from "@/components/ui";

type Data = Awaited<ReturnType<typeof summaryData>>;
function Delta({ now, before }: { now: number; before: number }) {
  const p = pctChange(now, before);
  if (p === null) return <span className="text-xs text-muted">önceki dönem —</span>;
  return <span className={`text-xs tabular-nums ${p < 0 ? "text-red-700" : "text-emerald-700"}`}>{p >= 0 ? "+" : ""}{p.toFixed(1)}% önceki döneme göre</span>;
}
const Box = ({ label, value, testId, delta }: { label: string; value: string; testId: string; delta: React.ReactNode }) => (
  <Card className="p-4"><div className="text-xs text-muted">{label}</div><div className="mt-1 text-2xl font-semibold tabular-nums" data-testid={testId}>{value}</div>{delta}</Card>
);

export function SummaryTab({ d }: { d: Data }) {
  if (!d.now.count && !d.now.refunds) return <Empty>Bu aralıkta satış yok.</Empty>;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Box label="Brüt ciro" value={formatTL(d.now.gross)} testId="sum-gross" delta={<Delta now={d.now.gross} before={d.before.gross} />} />
        <Box label="Fiş" value={String(d.now.count)} testId="sum-count" delta={<Delta now={d.now.count} before={d.before.count} />} />
        <Box label="Ortalama sepet" value={d.now.avg === null ? "—" : formatTL(d.now.avg)} testId="sum-avg" delta={<Delta now={d.now.avg ?? 0} before={d.before.avg ?? 0} />} />
      </div>
      <p className="text-sm text-muted">Net ciro (KDV hariç) <b className="tabular-nums text-ink">{formatTL(d.now.net)}</b> · İade {d.now.refunds} · <span className="tabular-nums">{formatTL(d.now.refundTotal)}</span></p>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs text-muted"><tr><th className="px-4 py-2.5 font-medium">Kanal</th><th className="px-4 py-2.5 text-right font-medium">Fiş</th><th className="px-4 py-2.5 text-right font-medium">Brüt</th></tr></thead>
          <tbody className="divide-y divide-line">{d.channels.map((c) => <tr key={c.key}><td className="px-4 py-2.5">{c.label}</td><td className="px-4 py-2.5 text-right tabular-nums">{c.count}</td><td className="px-4 py-2.5 text-right tabular-nums">{formatTL(c.gross)}</td></tr>)}</tbody>
        </table></Card>
        <Card className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs text-muted"><tr><th className="px-4 py-2.5 font-medium">Ödeme</th><th className="px-4 py-2.5 text-right font-medium">Tutar</th></tr></thead>
          <tbody className="divide-y divide-line">{d.methods.map((m) => <tr key={m.key}><td className="px-4 py-2.5">{m.label}</td><td className="px-4 py-2.5 text-right tabular-nums">{formatTL(m.amount)}</td></tr>)}</tbody>
        </table></Card>
      </div>
    </div>
  );
}
```

(`text-ink` sınıfı yoksa `globals.css`'teki ana metin rengini kullan — `grep -n "\-\-color" app/globals.css`.)

- [ ] **Step 3: `components/reports/HeatTab.tsx`**

```tsx
import { formatTL } from "@/lib/core/money";
import { WEEKDAYS, type Heat } from "@/lib/core/report";
import { Card, Empty } from "@/components/ui";

export function HeatTab({ h }: { h: Heat }) {
  if (h.max <= 0) return <Empty>Bu aralıkta satış yok.</Empty>;
  return (
    <Card className="overflow-x-auto p-4">
      <table className="text-xs" data-testid="heat">
        <thead><tr><th />{Array.from({ length: 24 }, (_, i) => <th key={i} className="w-9 pb-1 font-normal text-muted">{i}</th>)}</tr></thead>
        <tbody>
          {h.cells.map((row, d) => (
            <tr key={d}>
              <th className="pr-2 text-left font-medium">{WEEKDAYS[d]}</th>
              {row.map((c, i) => (
                <td key={i} title={`${WEEKDAYS[d]} ${i}:00 · ${formatTL(c.gross)} · ${c.count} fiş`} className="h-8 w-9 border border-white" style={{ backgroundColor: c.gross > 0 ? `color-mix(in srgb, var(--color-brand) ${Math.round(12 + (c.gross / h.max) * 88)}%, white)` : "#f5f5f4" }} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-muted">Koyu hücre = yüksek ciro. Üzerine gelince tutar ve fiş sayısı.</p>
    </Card>
  );
}
```

(`--color-brand` değişken adını `app/globals.css`'ten doğrula; farklıysa onu kullan.)

- [ ] **Step 4: `components/reports/ProductsTab.tsx`**

```tsx
import Link from "next/link";
import { formatTL } from "@/lib/core/money";
import { qtyText, type Range } from "@/lib/core/report";
import type { productData } from "@/lib/admin/report";
import { Card, Empty } from "@/components/ui";
import { reportHref } from "./RangeBar";

const th = "px-4 py-2.5 font-medium", td = "px-4 py-2.5 text-right tabular-nums";
export function ProductsTab({ d, range, sort }: { d: Awaited<ReturnType<typeof productData>>; range: Range; sort: "adet" | "ciro" }) {
  const cat = new Map(d.categories.map((c) => [c.key, c.name]));
  const sortLink = (k: "adet" | "ciro", label: string) => <Link href={reportHref("urunler", range, { sirala: k })} className={sort === k ? "font-semibold text-brand underline" : "underline"}>{label}</Link>;
  return (
    <div className="space-y-6">
      {d.rows.length === 0 ? <Empty>Bu aralıkta satış yok.</Empty> : (
        <Card className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs text-muted"><tr><th className={th}>Ürün</th><th className={th}>Kategori</th><th className={`${th} text-right`}>{sortLink("adet", "Adet")}</th><th className={`${th} text-right`}>{sortLink("ciro", "Brüt")}</th><th className={`${th} text-right`}>Pay</th></tr></thead>
          <tbody className="divide-y divide-line">{d.rows.map((r) => (
            <tr key={r.key} data-testid={`product-${r.name}`}><td className="px-4 py-2.5 font-medium">{r.name}</td><td className="px-4 py-2.5 text-muted">{cat.get(r.categoryId ?? "-") ?? "Kategorisiz"}</td><td className={td}>{qtyText(r.qtyMilli)}</td><td className={td}>{formatTL(r.gross)}</td><td className={td}>%{r.share.toFixed(1)}</td></tr>
          ))}</tbody>
        </table></Card>
      )}
      {d.categories.length > 0 && (
        <Card className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs text-muted"><tr><th className={th}>Kategori</th><th className={`${th} text-right`}>Brüt</th><th className={`${th} text-right`}>Pay</th></tr></thead>
          <tbody className="divide-y divide-line">{d.categories.map((c) => <tr key={c.key}><td className="px-4 py-2.5">{c.name}</td><td className={td}>{formatTL(c.gross)}</td><td className={td}>%{c.share.toFixed(1)}</td></tr>)}</tbody>
        </table></Card>
      )}
      <Card className="p-4" data-testid="unsold">
        <h2 className="mb-2 font-semibold">Hiç satılmayanlar ({d.unsold.length})</h2>
        {d.unsold.length ? <p className="text-sm">{d.unsold.map((u) => u.name).join(", ")}</p> : <p className="text-sm text-muted">Tüm aktif ürünler bu aralıkta en az bir kez satıldı.</p>}
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: `components/reports/StaffTab.tsx`**

```tsx
import Link from "next/link";
import { formatTL } from "@/lib/core/money";
import { EVENT_LABEL, type Range, type StaffEvent, type StaffRow } from "@/lib/core/report";
import { Card, Empty } from "@/components/ui";
import { reportHref } from "./RangeBar";

const dt = (d: Date) => d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });
const nt = (n: number, k?: number) => (n ? (k === undefined ? String(n) : `${n} · ${formatTL(k)}`) : "—");
const td = "px-4 py-2.5 text-right tabular-nums whitespace-nowrap";
const warn = (n: number) => (n ? `${td} font-medium text-amber-800` : `${td} text-muted`);

export function StaffTab({ rows, range, kisi, events }: { rows: StaffRow[]; range: Range; kisi: string | null; events: { events: StaffEvent[]; names: Map<string, string> } | null }) {
  if (!rows.length) return <Empty>Bu aralıkta personel hareketi yok.</Empty>;
  const cols = ["Personel", "Satış", "Fiş", "İade", "Adisyon iptali", "İkram", "İndirim", "İndirim + ikram payı", "Paket iptali", "Sepetten silme"];
  return (
    <div className="space-y-6">
      <Card className="overflow-x-auto"><table className="w-full text-sm">
        <thead className="border-b border-line text-left text-xs text-muted"><tr>{cols.map((h, i) => <th key={h} className={`px-4 py-2.5 font-medium ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">{rows.map((r) => (
          <tr key={r.staffId} data-testid={`staff-${r.name}`} className={kisi === r.staffId ? "bg-brand-soft" : "hover:bg-stone-50"}>
            <td className="px-4 py-2.5"><Link href={reportHref("personel", range, { kisi: r.staffId })} className="font-medium underline">{r.name}</Link></td>
            <td className={td}>{formatTL(r.gross)}</td><td className={td}>{r.count}</td>
            <td className={warn(r.refunds)} data-testid="staff-refund">{nt(r.refunds, r.refundTotal)}</td>
            <td className={warn(r.voids)} data-testid="staff-void">{nt(r.voids, r.voidTotal)}</td>
            <td className={warn(r.comps)}>{nt(r.comps, r.compTotal)}</td>
            <td className={warn(r.discounts)}>{nt(r.discounts)}</td>
            <td className={td}>{r.discountTotal ? formatTL(r.discountTotal) : "—"}</td>
            <td className={warn(r.cancels)}>{nt(r.cancels)}</td>
            <td className={warn(r.removed)} data-testid="staff-removed">{nt(r.removed, r.removedTotal)}</td>
          </tr>
        ))}</tbody>
      </table></Card>
      {kisi && events && (
        <Card className="overflow-x-auto" data-testid="staff-events">
          <div className="flex items-baseline justify-between px-4 pt-4"><h2 className="font-semibold">{rows.find((r) => r.staffId === kisi)?.name ?? "Personel"} — olaylar</h2><a href={`/yonetim/raporlar/csv?sekme=olaylar&bas=${range.bas}&bit=${range.bit}&kisi=${kisi}`} download className="text-sm underline">CSV indir</a></div>
          {events.events.length === 0 ? <p className="p-4 text-sm text-muted">Bu aralıkta olay yok.</p> : (
            <table className="mt-2 w-full text-sm">
              <thead className="border-b border-line text-left text-xs text-muted"><tr>{["Zaman", "Tür", "İçerik", "Tutar", "Onaylayan", "Gerekçe"].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">{events.events.map((e, i) => (
                <tr key={i}><td className="px-4 py-2.5 whitespace-nowrap">{dt(e.at)}</td><td className="px-4 py-2.5">{EVENT_LABEL[e.kind]}</td><td className="px-4 py-2.5">{e.text}</td><td className="px-4 py-2.5 tabular-nums">{e.amount === null ? "—" : formatTL(e.amount)}</td><td className="px-4 py-2.5">{e.approvedBy ? events.names.get(e.approvedBy) ?? "Bilinmeyen" : "—"}</td><td className="px-4 py-2.5 text-muted">{e.reason ?? "—"}</td></tr>
              ))}</tbody>
            </table>
          )}
          {events.events.length === 500 && <p className="p-4 text-xs text-muted">İlk 500 olay gösteriliyor; tamamı için aralığı daralt.</p>}
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 6: `ProfitTab.tsx` ve `ShiftsTab.tsx`** — mevcut `page.tsx`'ten taşı, davranış aynı:

`components/reports/ProfitTab.tsx`: mevcut `page.tsx:40-89` karlılık dalının veri kısmı (satır 41-46) + JSX'in `<form>` SONRASI kısmı (satır 56-86: `rows.length === 0 ?` … maliyeti eksik `<p>`). İmza:

```tsx
export async function ProfitTab({ tenantId, range }: { tenantId: string; range: Range }) {
  const { bas, bit } = range;
  // ↓ page.tsx:41-46 aynen (L, S, lines, rows, sum)
  return (<>{/* ↓ page.tsx:56-86 aynen */}</>);
}
```
Import'lar: `and, eq, gte, inArray, lt` (drizzle-orm), `schema, withTenant` (@/db), `formatTL`, `profitRows`, `Card, Empty`, `type Range`. Tarih formu kalkar (RangeBar karşılar).

`components/reports/ShiftsTab.tsx`: `page.tsx:91-127` (vardiya sorgusu + tablo) + `dt` sabiti (satır 13). İmza `export async function ShiftsTab({ tenantId }: { tenantId: string })`; import'lar: `Link`, `desc, eq, sql`, `schema, withTenant`, `formatTL`, `signedTL` (@/components/ShiftReport), `Badge, Card, Empty`.

- [ ] **Step 7: `app/yonetim/raporlar/page.tsx`** — tamamını değiştir:

```tsx
import Link from "next/link";
import { withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { firstStoreId, stockLevels } from "@/lib/admin/stock";
import { formatQty, isCriticalRow } from "@/lib/admin/stock-view";
import { heatData, productData, staffData, staffEvents, summaryData } from "@/lib/admin/report";
import { parseRange, REPORT_TABS, type ReportTab } from "@/lib/core/report";
import { Card, PageHeader } from "@/components/ui";
import { RangeBar, reportHref } from "@/components/reports/RangeBar";
import { SummaryTab } from "@/components/reports/SummaryTab";
import { HeatTab } from "@/components/reports/HeatTab";
import { ProductsTab } from "@/components/reports/ProductsTab";
import { StaffTab } from "@/components/reports/StaffTab";
import { ProfitTab } from "@/components/reports/ProfitTab";
import { ShiftsTab } from "@/components/reports/ShiftsTab";

export const dynamic = "force-dynamic";
const DESC: Record<ReportTab, string> = {
  ozet: "Ciro, fiş ve ortalama sepet; önceki eşit uzunluktaki döneme göre değişim. İadeler düşülür.",
  yogunluk: "Haftanın günü × saat bazında ciro (İstanbul saati).",
  urunler: "Ürün ve kategori bazında adet ve brüt ciro; hiç satılmayan aktif ürünler.",
  personel: "Kişi başına satış ve iade, iptal, ikram, indirim, sepetten silme. İsme tıklayınca olay listesi.",
  vardiyalar: "Vardiya (gün sonu) raporları. Son 200 vardiya.",
  karlilik: "Ürün kârlılığı: KDV hariç net ciro, satış anındaki maliyet, brüt kâr. İadeler düşülür.",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Raporlar({ searchParams }: { searchParams: Promise<{ sekme?: string; bas?: string; bit?: string; sirala?: string; kisi?: string }> }) {
  const a = await requireAdmin();
  const sp = await searchParams;
  const tab = REPORT_TABS.find((t) => t.key === sp.sekme) ?? REPORT_TABS[0];
  const range = parseRange(sp.bas, sp.bit);
  const sort = sp.sirala === "adet" ? "adet" : "ciro";
  const kisi = sp.kisi && UUID.test(sp.kisi) ? sp.kisi : null;
  const critical = await withTenant(a.tenantId, async (tx) => {
    const storeId = await firstStoreId(tx);
    return storeId ? (await stockLevels(tx, storeId)).filter(isCriticalRow) : [];
  });

  let body: React.ReactNode;
  if (tab.key === "ozet") body = <SummaryTab d={await withTenant(a.tenantId, (tx) => summaryData(tx, range))} />;
  else if (tab.key === "yogunluk") body = <HeatTab h={await withTenant(a.tenantId, (tx) => heatData(tx, range))} />;
  else if (tab.key === "urunler") body = <ProductsTab d={await withTenant(a.tenantId, (tx) => productData(tx, range, sort))} range={range} sort={sort} />;
  else if (tab.key === "personel") {
    const [rows, events] = await withTenant(a.tenantId, async (tx) => [await staffData(tx, range), kisi ? await staffEvents(tx, range, kisi) : null] as const);
    body = <StaffTab rows={rows} range={range} kisi={kisi} events={events} />;
  } else if (tab.key === "karlilik") body = <ProfitTab tenantId={a.tenantId} range={range} />;
  else body = <ShiftsTab tenantId={a.tenantId} />;

  return (
    <>
      <PageHeader title="Raporlar" desc={DESC[tab.key]} />
      {critical.length > 0 && (
        <Card className="mb-6 border-red-200 bg-red-50 p-4" data-testid="critical-card">
          <div className="mb-2 flex items-baseline justify-between"><h2 className="font-semibold text-red-800">Kritik stok ({critical.length})</h2><Link href="/yonetim/stok?kritik=1" className="text-sm text-red-800 underline">Stok</Link></div>
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">{critical.map((c) => <li key={c.id}><b>{c.name}</b> <span className="tabular">{formatQty(c.level, c.unit)}</span> <span className="text-muted">(sınır {formatQty(c.minStock!, c.unit)})</span></li>)}</ul>
        </Card>
      )}
      <div className="mb-4 flex flex-wrap gap-1" role="tablist" aria-label="Rapor">
        {REPORT_TABS.map((t) => <Link key={t.key} href={reportHref(t.key, t.range ? range : undefined)} role="tab" aria-selected={t.key === tab.key} className={`rounded-lg border px-3 py-1.5 text-sm ${t.key === tab.key ? "border-brand bg-brand-soft font-medium text-brand" : "border-line hover:bg-stone-50"}`}>{t.label}</Link>)}
      </div>
      {tab.range && <RangeBar sekme={tab.key} range={range} csv={tab.csv ? tab.key : null} extra={tab.key === "urunler" ? { sirala: sp.sirala } : tab.key === "personel" ? { kisi: kisi ?? undefined } : {}} />}
      {body}
    </>
  );
}
```


- [ ] **Step 8: `e2e/m1.mjs:117`** → `await admin.goto(\`${BASE}/yonetim/raporlar?sekme=vardiyalar\`);`

- [ ] **Step 9: Doğrula**

Run: `npx tsc --noEmit 2>&1 | head -10 && npx eslint app/yonetim/raporlar components/reports lib/admin/report.ts 2>&1 | tail -5`
Expected: çıktısız.

- [ ] **Step 10: Commit**

```bash
git add components/reports app/yonetim/raporlar/page.tsx e2e/m1.mjs
git commit -m "M9a Görev 5: rapor sekmeleri (Özet, Yoğunluk, Ürünler, Personel) + ortak tarih çubuğu; Vardiyalar/Kârlılık bileşene taşındı"
```

---

### Task 6: CSV indirme uç noktası

**Files:**
- Create: `app/yonetim/raporlar/csv/route.ts`

**Interfaces:**
- Consumes: `reportCsv` (Task 4), `parseRange` (Task 3), `getAdmin` (`lib/auth/session.ts:22`).
- Produces: `GET /yonetim/raporlar/csv?sekme=ozet|yogunluk|urunler|personel|olaylar&bas&bit[&kisi]` → 200 `text/csv; charset=utf-8` + `attachment`; oturumsuz 401; bilinmeyen sekme 400.

- [ ] **Step 1:** Next 16 route handler belgesine bak: `ls node_modules/next/dist/docs/ | grep -i route` ve ilgili dosyada `GET(request` imzasını doğrula.

- [ ] **Step 2: `app/yonetim/raporlar/csv/route.ts`**

```ts
// Rapor CSV'si (Türkçe Excel: BOM + ;). Yalnız yönetim oturumu (sahip/müdür).
import { withTenant } from "@/db";
import { getAdmin } from "@/lib/auth/session";
import { reportCsv } from "@/lib/admin/report";
import { parseRange } from "@/lib/core/report";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const a = await getAdmin();
  if (!a) return new Response("Oturum gerekli.", { status: 401 });
  const q = new URL(req.url).searchParams;
  const sekme = q.get("sekme") ?? "";
  const r = parseRange(q.get("bas") ?? undefined, q.get("bit") ?? undefined);
  const body = await withTenant(a.tenantId, (tx) => reportCsv(tx, sekme, r, q.get("kisi")));
  if (body === null) return new Response("Bilinmeyen rapor.", { status: 400 });
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="cabukpos-${sekme}-${r.bas}_${r.bit}.csv"`,
      "cache-control": "no-store",
    },
  });
}
```

- [ ] **Step 3: Doğrula** `npx tsc --noEmit 2>&1 | head -5 && npm run build 2>&1 | grep -E "raporlar|error|Error" | head -10` → `/yonetim/raporlar/csv` rota olarak listelenir, hata yok.

- [ ] **Step 4: Commit**

```bash
git add app/yonetim/raporlar/csv/route.ts
git commit -m "M9a Görev 6: rapor CSV indirme uç noktası"
```

---

### Task 7: E2E + ilerleme notu

**Files:**
- Create: `e2e/m9a.mjs`
- Modify: `docs/PROGRESS.md` (sona M9a bölümü)

- [ ] **Step 1: `e2e/m9a.mjs`**

```js
// e2e/m9a.mjs — Raporlar. Kasa: Adana×2 + Ayran → Adana azalt (silme 300) → satış 350 kart →
// Ayran ekle + sil (50) → Adana ekle + Temizle (300) → Ayran iadesi (müdür PIN) → Özet brüt 300, 1 fiş →
// Personel: Ayşe silinen 3 · 650, iade 1 · 50, olay listesinde "Sepet boşaltıldı" → CSV (BOM + ;) → Vardiyalar sekmesi.
// Kullanım: npm run build && node --env-file=.env.local e2e/m9a.mjs (sunucu :3800)
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3800";
const stamp = Date.now();
const tenant = `E2E Kebapçı ${stamp}`;
const step = (m) => console.log("•", m);
const expect = (got, want, what) => { if (got !== want) throw new Error(`${what}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`); };

const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
const page = async () => {
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  return p;
};
const pin = async (p, digits) => {
  for (const d of digits) await p.getByRole("button", { name: d, exact: true }).click();
  await p.getByRole("button", { name: "Gir" }).click();
};
const text = async (loc) => (await loc.innerText()).trim();

try {
  const admin = await page();
  await admin.goto(`${BASE}/kayit`);
  await admin.fill("input[name=businessName]", tenant);
  await admin.getByRole("button", { name: "Restoran" }).click();
  await admin.fill("input[name=name]", "Yiğit Test");
  await admin.fill("input[name=email]", `m9a-${stamp}@ornek.com`);
  await admin.fill("input[name=password]", "Cabukpos2026x");
  await admin.getByRole("button", { name: "Hesap oluştur" }).click();
  await admin.waitForURL(`${BASE}/yonetim**`);

  await admin.goto(`${BASE}/yonetim/urunler`);
  for (const [name, price] of [["Adana", "300"], ["Ayran", "50"]]) {
    await admin.fill("input[name=name]", name);
    await admin.fill("input[name=price]", price);
    await admin.getByRole("button", { name: "%10", exact: true }).click();
    await admin.getByRole("button", { name: "Ürünü kaydet" }).click();
    await admin.getByRole("cell", { name, exact: true }).waitFor();
  }
  await admin.goto(`${BASE}/yonetim/personel`);
  for (const [name, role, p] of [["Ayşe Kasiyer", null, "5820"], ["Mehmet Müdür", "Müdür", "7391"]]) {
    await admin.fill("input[name=name]", name);
    if (role) await admin.getByRole("button", { name: role, exact: true }).click();
    await admin.fill("input[name=pin]", p);
    await admin.getByRole("button", { name: "Personeli kaydet" }).click();
    await admin.getByRole("cell", { name }).waitFor();
  }
  await admin.goto(`${BASE}/yonetim/cihazlar`);
  await admin.fill("input[name=name]", "Kasa 1");
  await admin.fill("input[name=receiptPrefix]", "K1");
  await admin.getByRole("button", { name: "Cihaz ekle" }).click();
  const code = (await admin.getByTestId("pairing-code").innerText()).trim();
  const kasa = await page();
  await kasa.goto(`${BASE}/kasa/eslestir`);
  await kasa.fill("input[name=code]", code);
  await kasa.getByRole("button", { name: "Eşle" }).click();
  await kasa.waitForURL(`${BASE}/kasa`);
  await pin(kasa, "5820");
  await kasa.fill("input[name=amount]", "0");
  await kasa.getByRole("button", { name: "Vardiyayı aç" }).click();

  const adana = kasa.getByRole("button", { name: /^Adana \d/ }), ayran = kasa.getByRole("button", { name: /^Ayran \d/ });
  await adana.click(); await adana.click(); await ayran.click();
  await kasa.getByRole("button", { name: "Adana azalt" }).click();
  await kasa.getByRole("button", { name: "Öde" }).click();
  await kasa.getByRole("button", { name: "Tamamı kart" }).click();
  await kasa.getByRole("button", { name: "Satışı tamamla" }).click();
  await kasa.getByText(/Fiş K1-000001/).waitFor();
  step("satış K1-000001: Adana×1 + Ayran = 350 (1 Adana azaltıldı)");

  await ayran.click();
  await kasa.getByRole("button", { name: "Ayran sil" }).click();
  await adana.click();
  await kasa.getByRole("button", { name: "Temizle" }).click();
  step("Ayran sil (50) + Adana ekle, Temizle (300)");

  await kasa.getByRole("button", { name: "İade" }).click();
  await kasa.getByLabel("İade fiş no").fill("k1-1");
  await kasa.getByRole("button", { name: "Fişi bul" }).click();
  await kasa.getByRole("button", { name: "Ayran iade artır" }).click();
  await kasa.getByRole("button", { name: "İadeyi onayla" }).click();
  await pin(kasa, "7391");
  await kasa.getByText("İADE FİŞİ").waitFor();
  await kasa.getByRole("button", { name: "Kasaya dön" }).click();
  await kasa.getByTestId("sync-pending").waitFor({ state: "detached", timeout: 20000 });
  step("Ayran iadesi (müdür PIN), eşitlendi");

  await admin.goto(`${BASE}/yonetim/raporlar`);
  expect(await text(admin.getByTestId("sum-gross")), "300,00 ₺", "özet brüt (350 − 50)");
  expect(await text(admin.getByTestId("sum-count")), "1", "fiş sayısı");
  step("Özet: brüt 300, 1 fiş");

  await admin.getByRole("tab", { name: "Personel" }).click();
  const ayse = admin.getByTestId("staff-Ayşe Kasiyer");
  await ayse.waitFor();
  expect(await text(ayse.getByTestId("staff-removed")), "3 · 650,00 ₺", "sepetten silme");
  expect(await text(ayse.getByTestId("staff-refund")), "1 · 50,00 ₺", "iade");
  await ayse.getByRole("link", { name: "Ayşe Kasiyer" }).click();
  const ev = admin.getByTestId("staff-events");
  await ev.getByText(/Sepet boşaltıldı: Adana × 1/).waitFor();
  await ev.getByText("İade K1-000001", { exact: false }).first().waitFor();
  step("Personel: silme 3 · 650, iade 1 · 50, olay listesi");

  const url = new URL(admin.url());
  const res = await admin.request.get(`${BASE}/yonetim/raporlar/csv?sekme=personel&bas=${url.searchParams.get("bas")}&bit=${url.searchParams.get("bit")}`);
  expect(res.status(), 200, "CSV durum");
  const csv = await res.text();
  if (!csv.startsWith("﻿Personel;")) throw new Error(`CSV başı: ${JSON.stringify(csv.slice(0, 30))}`);
  if (!/Ayşe Kasiyer;350,00;1;1;50,00;.*;3;650,00\r\n/.test(csv)) throw new Error(`CSV satırı: ${csv}`);
  expect((await (await browser.newContext()).request.get(`${BASE}/yonetim/raporlar/csv?sekme=personel`)).status(), 401, "oturumsuz CSV");
  step("CSV: BOM + ; + Ayşe satırı; oturumsuz 401");

  await admin.getByRole("tab", { name: "Vardiyalar" }).click();
  await admin.getByText("Açık").first().waitFor();
  step("Vardiyalar sekmesi");

  if (errors.length) throw new Error(`sayfa hataları: ${errors.join(" | ")}`);
  console.log("M9a OK");
} finally {
  await browser.close();
}
```

(Oturumsuz istekte `/yonetim` proxy'si 401 yerine `/giris`'e yönlendirirse Playwright yönlendirmeyi izler ve 200 döner: o durumda beklentiyi `res.url()` `/giris` içerir diye değiştir — davranışı `proxy.ts`'ten doğrula.)

- [ ] **Step 2: Çalıştır** — önce :3800'deki eski sunucuyu öldür (hafıza: pkill eşleşmez):

```bash
lsof -ti :3800 | xargs kill 2>/dev/null; npm run build 2>&1 | tail -3
(npx next start -p 3800 > /tmp/cabukpos-e2e.log 2>&1 &) ; sleep 4
node --env-file=.env.local e2e/m9a.mjs 2>&1 | tail -12
```
Expected: son satır `M9a OK`.

- [ ] **Step 3: Regresyon** `node --env-file=.env.local e2e/m1.mjs 2>&1 | tail -2 && node --env-file=.env.local e2e/m8.mjs 2>&1 | tail -2 && npm test 2>&1 | grep -E "^# (pass|fail)"` → `M1 OK`, `M8 OK`, `# fail 0`.

- [ ] **Step 4: `docs/PROGRESS.md`** sonuna:

```markdown
## M9a — Raporlar (2026-09-29)

Spec `docs/superpowers/specs/2026-09-29-cabukpos-m9a-rapor-design.md`, plan `docs/superpowers/plans/2026-09-29-cabukpos-m9a-rapor.md`.
- Sekmeler: Özet (varsayılan), Yoğunluk, Ürünler, Personel, Vardiyalar, Kârlılık; ortak tarih çubuğu + CSV (`/yonetim/raporlar/csv`).
- Kasa: sepetten silme/azaltma ve Temizle → `register_event` → `register_events` (RLS). Satışla kapanan sepet olay değil.
- Rapor = istek anında SQL (`lib/admin/report.ts`) + saf hesap (`lib/core/report.ts`).
- Prod: `scripts/prod-push.sh 1` (şema: register_events + sales_at_idx) → `2` (rls) → `3` (relrowsecurity: register_events t) → main → canlı E2E m9a.
```

- [ ] **Step 5: Commit + push**

```bash
git add e2e/m9a.mjs docs/PROGRESS.md
git commit -m "M9a Görev 7: e2e/m9a.mjs (M9a OK), ilerleme notu"
git push
```
