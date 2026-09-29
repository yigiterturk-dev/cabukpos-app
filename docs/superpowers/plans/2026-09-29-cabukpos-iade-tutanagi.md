# İade tutanağı Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline; Yiğit kuralı: ajan yok). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** e-Arşiv'li satışın kısmi iadesinde kasada termal iade tutanağı (TCKN) ya da "alıcı iade faturası" notu (VKN); bulutta `fiscal_refunds` kaydı; yönetimde alıcı faturası girişi ve A4 tutanak.

**Architecture:** Saf `lib/core/refundNote.ts` içeriği üretir (kasa ekranı, ESC/POS, A4 aynı kaynaktan). Kasa iade anında asıl belgenin bilgisini (yerel satıştan ya da bulut sorgusundan) iade satışına `refundFiscal` olarak yazar. Bulut eşitlemede `onRefund` kısmi iadede `fiscal_refunds` açar; tam iadede iptal akışı aynen, iptal reddi yedek kayıt açar.

**Tech Stack:** Next.js 16, Drizzle + Neon Postgres (RLS), Dexie (kasa), node:test, playwright-core E2E.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-29-cabukpos-iade-tutanagi-design.md`.
- Kısmi = iade asıl satışın tüm kalemlerini kapsamıyor **ya da** önceden iade var. Tam = ilk iade ve toplam ≥ asıl toplam. Kasa ve bulut aynı kuralı kullanır.
- Tutanak no = iade fiş no. Asıl belge kısmi iadede `issued` kalır; `cancel_rejected` yalnız gerçek iptal reddinde.
- Erişilebilir adlar/E2E seçicileri değişmez. Native select yok, beyaz zemin.
- Her görevde `npm test`, `npx tsc --noEmit`, `npx eslint` temiz. Şema değişince `npm run db:push:test` **ve** `npm run db:push` (yerel sunucu) + rls.
- Commit yazarı r.y.erturk@gmail.com; mesaj biçimi mevcut commit'lerle aynı.

## Dosya haritası

| Dosya | Sorumluluk |
|---|---|
| `lib/core/refundNote.ts` (yeni) | `RefundFiscal` tipi, `buyerKindOf`, `isPartialRefund`, `refundNote` (saf) |
| `db/schema.ts`, `db/rls.sql` | `fiscal_refunds` tablosu + RLS |
| `lib/fiscal/issue.ts` | `onRefund` kısmi → kayıt; `cancelOne` reddi → kayıt |
| `lib/sync/apply.ts` | `onRefund` çağrısına tenantId + refundId |
| `lib/sync/lookup.ts`, `lib/offline/db.ts`, `lib/offline/state.ts` | `LookedUpSale.fiscal`, `LocalSale.refundFiscal` |
| `app/api/sync/catalog/route.ts` | katalogda `fiscal.sellerTaxId` |
| `components/kasa/RefundScreen.tsx`, `components/kasa/KasaApp.tsx`, `lib/core/receipt.ts` | kasada tutanak (ekran + ESC/POS) |
| `lib/admin/fiscal-actions.ts` | `resolveBuyerInvoice` |
| `components/reports/BuyerInvoices.tsx` (yeni), `components/reports/ReviewTab.tsx` | bekleyen alıcı faturaları + form |
| `app/yonetim/mali/page.tsx`, `app/yonetim/mali/iade/[id]/page.tsx` (yeni) | iade rozeti + A4 tutanak |
| `e2e/iade.mjs` (yeni) | uçtan uca |

---

### Task 1: Saf tutanak içeriği + şema

**Files:**
- Create: `lib/core/refundNote.ts`, `tests/refund-note.test.ts`
- Modify: `db/schema.ts` (fiscalDocuments'tan sonra), `db/rls.sql` (M8 bloğundaki diziye `fiscal_refunds`)

**Interfaces:**
- Produces:
  - `type RefundFiscal = { number: string; ettn: string; invoiceAt: string; buyerKind: "tckn" | "vkn"; partial: boolean; sellerTaxId: string | null }`
  - `buyerKindOf(taxId: string | null | undefined): "tckn" | "vkn"`
  - `isPartialRefund(remaining: { productId: string; qtyMilli: number }[], picked: { productId: string; qtyMilli: number }[], refundedBefore: boolean): boolean`
  - `refundNote(f: RefundFiscal, sellerName: string, refundNo: string): RefundNote | null`
  - `type RefundNote = { kind: "tutanak"; title: "İADE TUTANAĞI"; rows: [string, string][]; statement: string; sign: string[] } | { kind: "note"; text: string }`
  - `schema.fiscalRefunds`

- [ ] **Step 1: Failing test** `tests/refund-note.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
const { buyerKindOf, isPartialRefund, refundNote } = await import("@/lib/core/refundNote");

const F = { number: "CBP2026000000001", ettn: "11111111-2222-3333-4444-555555555555", invoiceAt: "2026-09-29T10:00:00.000Z", buyerKind: "tckn" as const, partial: true, sellerTaxId: "1234567890" };

test("buyerKindOf: VKN 10 hane → vkn, TCKN/nihai/boş → tckn", () => {
  assert.equal(buyerKindOf("1234567890"), "vkn");
  assert.equal(buyerKindOf("11111111111"), "tckn");
  assert.equal(buyerKindOf(null), "tckn");
});

test("isPartialRefund: hepsi seçili ve önceki iade yok → tam; eksik ya da önceki iade → kısmi", () => {
  const rem = [{ productId: "a", qtyMilli: 2000 }, { productId: "b", qtyMilli: 1000 }];
  assert.equal(isPartialRefund(rem, rem, false), false);
  assert.equal(isPartialRefund(rem, [{ productId: "a", qtyMilli: 2000 }], false), true);
  assert.equal(isPartialRefund(rem, [{ productId: "a", qtyMilli: 1000 }, { productId: "b", qtyMilli: 1000 }], false), true);
  assert.equal(isPartialRefund(rem, rem, true), true);
});

test("refundNote: tam iadede yok; TCKN → tutanak (no = iade fiş no, fatura bilgisi, imza alanları); VKN → not", () => {
  assert.equal(refundNote({ ...F, partial: false }, "Kebapçı", "K1-000002"), null);
  const t = refundNote(F, "Kebapçı", "K1-000002");
  assert.ok(t && t.kind === "tutanak");
  assert.deepEqual(t.rows[0], ["Tutanak no", "K1-000002"]);
  assert.ok(t.rows.some(([k, v]) => k === "Asıl fatura" && v === F.number));
  assert.ok(t.rows.some(([k, v]) => k === "ETTN" && v === F.ettn));
  assert.ok(t.rows.some(([k, v]) => k === "Satıcı VKN" && v === "1234567890"));
  assert.deepEqual(t.sign, ["Müşteri ad soyad", "Müşteri TCKN", "Müşteri imza", "Satıcı imza"]);
  const n = refundNote({ ...F, buyerKind: "vkn" }, "Kebapçı", "K1-000002");
  assert.deepEqual(n, { kind: "note", text: `Alıcı iade faturası düzenleyecektir. Fatura: ${F.number}` });
});
```

- [ ] **Step 2:** `npm test 2>&1 | tail -5` → FAIL (modül yok).

- [ ] **Step 3: Implement** `lib/core/refundNote.ts`

```ts
// lib/core/refundNote.ts — e-Arşiv'li satışın iadesinde belge içeriği (kasa ekranı, ESC/POS ve A4 aynı kaynak).
// Nihai tüketiciye (TCKN) satıcı iade faturası kesemez → iade tutanağı; VKN'li alıcı iade faturasını kendisi keser.
import { validateTaxId } from "./fiscal";

export type RefundFiscal = { number: string; ettn: string; invoiceAt: string; buyerKind: "tckn" | "vkn"; partial: boolean; sellerTaxId: string | null };
export type RefundNote =
  | { kind: "tutanak"; title: "İADE TUTANAĞI"; rows: [string, string][]; statement: string; sign: string[] }
  | { kind: "note"; text: string };

export const buyerKindOf = (taxId: string | null | undefined): "tckn" | "vkn" => (taxId && validateTaxId(taxId) === "vkn" ? "vkn" : "tckn");

/** Tam iade = ilk iade ve kalan tüm kalemler tam miktarıyla seçili. Bulutta aynı kural: ilk iade ve toplam ≥ asıl. */
export function isPartialRefund(remaining: { productId: string; qtyMilli: number }[], picked: { productId: string; qtyMilli: number }[], refundedBefore: boolean): boolean {
  if (refundedBefore) return true;
  const got = new Map(picked.map((p) => [p.productId, p.qtyMilli]));
  return remaining.some((r) => (got.get(r.productId) ?? 0) < r.qtyMilli);
}

const day = (iso: string) => new Date(iso).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" });

export function refundNote(f: RefundFiscal, sellerName: string, refundNo: string): RefundNote | null {
  if (!f.partial) return null;
  if (f.buyerKind === "vkn") return { kind: "note", text: `Alıcı iade faturası düzenleyecektir. Fatura: ${f.number}` };
  return {
    kind: "tutanak",
    title: "İADE TUTANAĞI",
    rows: [["Tutanak no", refundNo], ["Satıcı", sellerName], ["Satıcı VKN", f.sellerTaxId ?? "—"], ["Asıl fatura", f.number], ["Fatura tarihi", day(f.invoiceAt)], ["ETTN", f.ettn]],
    statement: "Yukarıdaki kalemler müşteriye iade edilmiş ve bedeli ödenmiştir.",
    sign: ["Müşteri ad soyad", "Müşteri TCKN", "Müşteri imza", "Satıcı imza"],
  };
}
```

- [ ] **Step 4: Şema** `db/schema.ts`, `fiscalDocuments`'tan hemen sonra:

```ts
// — İade tutanağı / alıcı iade faturası: e-Arşiv'li satışın kısmi iadesi (ya da iptali reddedilen tam iade). —
export const fiscalRefunds = pgTable("fiscal_refunds", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  refundSaleId: uuid("refund_sale_id").notNull().unique().references(() => sales.id, { onDelete: "cascade" }),
  fiscalDocId: uuid("fiscal_doc_id").notNull().references(() => fiscalDocuments.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().$type<"tutanak" | "alici_faturasi">(),
  buyerInvoiceNo: text("buyer_invoice_no"),
  buyerInvoiceDate: date("buyer_invoice_date"),
  resolvedAt: ts("resolved_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("fiscal_refunds_open_idx").on(t.tenantId, t.resolvedAt)]);
```

(`date` drizzle `pg-core` importuna eklenir, yoksa.) `db/rls.sql` M8 bloğu: `array['fiscal_settings','fiscal_documents','fiscal_refunds']`.

- [ ] **Step 5:** `npm run db:push:test && npm run db:push` (rls zincirli) → `npm test 2>&1 | grep -E "ℹ (pass|fail)"` → hepsi geçer.

- [ ] **Step 6: Commit** `git add lib/core/refundNote.ts tests/refund-note.test.ts db/schema.ts db/rls.sql && git commit -m "İade tutanağı: saf içerik + fiscal_refunds şeması"`

---

### Task 2: Bulut eşitleme (`onRefund`, `cancelOne`)

**Files:**
- Modify: `lib/fiscal/issue.ts:77-105`, `lib/sync/apply.ts:282`, `tests/fiscal-db.test.ts` (iade testi)

**Interfaces:**
- Consumes: `schema.fiscalRefunds`, `buyerKindOf`
- Produces: `onRefund(tx: Tx, tenantId: string, refundOf: string, refundId: string): Promise<void>`; `openRefundRecord(tx, tenantId, doc, refundId)` (iç)

- [ ] **Step 1: Test güncelle** — `tests/fiscal-db.test.ts` iade testinde `refund()` iade id'sini döndürsün (`return id`), kısmi beklentisi değişir, yeni durumlar eklenir:

```ts
  const part = await sync(f, {}, 3000);
  await issueOne(f.t.id, part);
  const r1 = await refund(f, part, 1000);
  const p = await docOf(f, part);
  assert.deepEqual([p.status, p.cancelPending], ["issued", false]);
  const fr = await refundsOf(f, p.id);
  assert.deepEqual(fr.map((x) => [x.refundSaleId, x.kind, !!x.resolvedAt]), [[r1, "tutanak", true]]);
  await refund(f, part, 2000); // kalan tamamı: önceki iade var → yine kısmi, iptal yok
  assert.equal((await docOf(f, part)).cancelPending, false);
  assert.equal((await refundsOf(f, p.id)).length, 2);

  const vkn = await sync(f, { fiscal: { token: newFiscalToken(), buyer: VKN_BUYER } }, 3000);
  await issueOne(f.t.id, vkn);
  await refund(f, vkn, 1000);
  const [v] = await refundsOf(f, (await docOf(f, vkn)).id);
  assert.deepEqual([v.kind, v.resolvedAt], ["alici_faturasi", null]);
```

8 gün bloğu sonuna: `assert.deepEqual((await refundsOf(f, o.id)).map((x) => x.kind), ["tutanak"]);`
Yardımcı: `const refundsOf = async (f: Fx, docId: string) => withTenant(f.t.id, (tx) => tx.select().from(schema.fiscalRefunds).where(eq(schema.fiscalRefunds.fiscalDocId, docId)).orderBy(schema.fiscalRefunds.createdAt));`
`refund()` sonunda `return id;` (id `randomUUID()` değişkene alınır).

- [ ] **Step 2:** `npm test 2>&1 | grep -E "not ok|ℹ fail"` → iade testi FAIL.

- [ ] **Step 3: Implement** `lib/fiscal/issue.ts`:

```ts
/** Kısmi iade ya da iptali reddedilen tam iade: TCKN → tutanak (çözülmüş), VKN → alıcının iade faturası beklenir. */
async function openRefundRecord(tx: Tx, tenantId: string, doc: typeof D.$inferSelect, refundSaleId: string) {
  const kind = buyerKindOf(doc.buyer?.taxId) === "vkn" ? "alici_faturasi" : "tutanak";
  await tx.insert(schema.fiscalRefunds).values({ tenantId, refundSaleId, fiscalDocId: doc.id, kind, resolvedAt: kind === "tutanak" ? new Date() : null }).onConflictDoNothing();
}

/** İade eşitlemesinde (aynı işlem). İlk iade ve tam → iptal kuyruğu; aksi (kısmi) → iade kaydı. */
export async function onRefund(tx: Tx, tenantId: string, refundOf: string, refundId: string) {
  const [doc] = await tx.select().from(D).where(eq(D.saleId, refundOf));
  if (!doc || doc.status === "cancelled") return;
  const [orig] = await tx.select({ total: schema.sales.total }).from(schema.sales).where(eq(schema.sales.id, refundOf));
  const [ref] = await tx.select({ n: sql<number>`count(*)::int`, sum: sql<number>`coalesce(sum(${schema.sales.total}), 0)::int` }).from(schema.sales).where(and(eq(schema.sales.refundOf, refundOf), eq(schema.sales.status, "iade")));
  const full = !!orig && ref.n === 1 && ref.sum >= orig.total;
  if (doc.status === "issued" || doc.status === "cancel_rejected") {
    if (full && doc.status === "issued") await tx.update(D).set({ cancelPending: true }).where(eq(D.id, doc.id));
    else await openRefundRecord(tx, tenantId, doc, refundId);
  } else if (full && (doc.status === "pending" || doc.status === "error")) {
    await tx.update(D).set({ status: "cancelled", lastError: "kesilmeden iade edildi" }).where(eq(D.id, doc.id));
  }
}
```

`cancelOne` içinde red dalı: güncellemeden sonra

```ts
    if (!r.ok) {
      const [rs] = await tx.select({ id: schema.sales.id }).from(schema.sales).where(and(eq(schema.sales.refundOf, doc.saleId), eq(schema.sales.status, "iade"))).limit(1);
      if (rs) await openRefundRecord(tx, tenantId, doc, rs.id);
    }
```

`import { buyerKindOf } from "@/lib/core/refundNote";` eklenir. `lib/sync/apply.ts:282` → `await onRefund(tx, ctx.tenantId, doc.refundOf, doc.id);`

- [ ] **Step 4:** `npm test 2>&1 | grep -E "ℹ (pass|fail)"` → fail 0.
- [ ] **Step 5: Commit** `"İade tutanağı: eşitlemede fiscal_refunds (kısmi iade + iptal reddi)"`

---

### Task 3: Kasa — asıl belge bilgisi ve termal tutanak

**Files:**
- Modify: `lib/sync/lookup.ts`, `lib/offline/db.ts` (`findLocalSale`, `recordRefundLocal`), `lib/offline/state.ts` (`LocalSale.refundFiscal`), `app/api/sync/catalog/route.ts` (+ `Catalog.fiscal.sellerTaxId`), `components/kasa/RefundScreen.tsx`, `components/kasa/KasaApp.tsx` (fiş görünümü), `lib/core/receipt.ts` (`ReceiptSale.refundFiscal`, `renderReceipt`), `tests/escpos.test.ts`

**Interfaces:**
- Consumes: `RefundFiscal`, `isPartialRefund`, `refundNote`, `buyerKindOf`
- Produces: `LookedUpSale = { id; receiptNo; at; lines; fiscal: { number: string; ettn: string; invoiceAt: string; buyerKind: "tckn" | "vkn"; refundedBefore: boolean } | null }`; `recordRefundLocal(..., refundId, refundFiscal?: RefundFiscal)`

- [ ] **Step 1: Failing ESC/POS testi** (`tests/escpos.test.ts` sonuna; mevcut yardımcıyla bayt → metin):

```ts
test("iade fişinde tutanak: başlık, tutanak no, imza alanları; VKN'de not", () => {
  const base = { receiptNo: "K1-000002", at: "2026-09-29T10:00:00.000Z", staffName: "Ali", lines: [{ productId: "p", name: "Çay", unitPrice: 2000, qtyMilli: 1000 }], payments: [{ method: "nakit" as const, amount: 2000 }], total: 2000, change: 0, vat: [], refund: true, refundOfNo: "K1-000001" };
  const rf = { number: "CBP2026000000001", ettn: "e", invoiceAt: "2026-09-29T09:00:00.000Z", buyerKind: "tckn" as const, partial: true, sellerTaxId: "1234567890" };
  const t = text(renderReceipt({ ...base, refundFiscal: rf }, H, O));
  assert.match(t, /IADE TUTANAGI|İADE TUTANAĞI/);
  assert.match(t, /Musteri imza|Müşteri imza/);
  const n = text(renderReceipt({ ...base, refundFiscal: { ...rf, buyerKind: "vkn" } }, H, O));
  assert.match(n, /iade faturasi duzenleyecektir|iade faturası düzenleyecektir/);
});
```

(`text`, `H`, `O` dosyadaki mevcut yardımcı/sabit adlarıyla eşlenir; yoksa `new TextDecoder("latin1")` ile çözüp Türkçe karakterleri regex'te iki biçimde ara.)

- [ ] **Step 2:** FAIL doğrula.
- [ ] **Step 3: `lib/core/receipt.ts`** — `ReceiptSale`'e `refundFiscal?: RefundFiscal;`; `renderReceipt`'te fiscal bloğundan sonra, "Bilgi fişidir" satırından önce:

```ts
  const rn = sale.refund && sale.refundFiscal ? refundNote(sale.refundFiscal, h.tenantName, sale.receiptNo) : null;
  if (rn?.kind === "note") p.rule().lines(rn.text);
  if (rn?.kind === "tutanak") {
    p.rule().align("center").bold(true).line(rn.title).bold(false).align("left");
    for (const [k, v] of rn.rows) p.cols2(k, v);
    p.lines(rn.statement);
    for (const s of rn.sign) p.feed(1).line(`${s}: ${".".repeat(Math.max(4, o.width === 58 ? 14 : 24))}`);
  }
```

(`p.feed` yoksa `p.line("")`.)

- [ ] **Step 4: Veri yolu**
  - `lib/offline/state.ts`: `LocalSale`'e `refundFiscal?: RefundFiscal;`; `Catalog.fiscal`'e `sellerTaxId?: string | null`.
  - `catalog/route.ts`: tenant taxId'yi (tenants RLS dışı, `getDb()` + `eq(tenants.id, tenantId)`) `fiscal.sellerTaxId` olarak ekle.
  - `lib/sync/lookup.ts`: `LookedUpSale`'e `fiscal`; sorguda `fiscal_documents` `issued` belge:

```ts
    const [doc] = await tx.select({ number: D.number, ettn: D.ettn, issuedAt: D.issuedAt, buyer: D.buyer }).from(D).where(and(eq(D.saleId, s.id), eq(D.status, "issued")));
    const fiscal = doc?.number && doc.ettn && doc.issuedAt ? { number: doc.number, ettn: doc.ettn, invoiceAt: doc.issuedAt.toISOString(), buyerKind: buyerKindOf(doc.buyer?.taxId), refundedBefore: sold.refunded.length > 0 } : null;
```

  - `findLocalSale`: `fiscal: sale.fiscal?.number && sale.fiscal.ettn ? { number, ettn, invoiceAt: sale.at, buyerKind: buyerKindOf(sale.fiscal.buyer?.taxId), refundedBefore: refunds.length > 0 } : null`.
  - `recordRefundLocal` son parametre `refundFiscal?: RefundFiscal` → `sale` nesnesine `...(refundFiscal ? { refundFiscal } : {})` (outbox belgesine EKLENMEZ; bulut kendi hesaplar).
  - `RefundScreen.record`: `const rf = sale.fiscal ? { ...sale.fiscal, partial: isPartialRefund(sale.lines, picked, sale.fiscal.refundedBefore), sellerTaxId: meta.catalog.fiscal?.sellerTaxId ?? null } : undefined;` → `recordRefundLocal(..., refundId, rf)` (`refundedBefore` alanı RefundFiscal'e taşınmaz: `const { refundedBefore, ...f } = sale.fiscal`).
- [ ] **Step 5: Ekran fişi** (`KasaApp.tsx` fiş `<article>`, fiscal bloğundan sonra):

```tsx
        {rn?.kind === "note" && <p className="mt-2 border-t border-dashed border-ink pt-1">{rn.text}</p>}
        {rn?.kind === "tutanak" && (
          <div className="mt-2 border-t border-dashed border-ink pt-1" data-testid="refund-note">
            <div className="text-center font-bold">{rn.title}</div>
            {rn.rows.map(([k, v]) => <div key={k} className="flex justify-between gap-2"><span>{k}</span><span className="break-all text-right">{v}</span></div>)}
            <p className="mt-1">{rn.statement}</p>
            {rn.sign.map((s) => <div key={s} className="mt-3 flex gap-1"><span>{s}:</span><span className="flex-1 border-b border-dotted border-ink" /></div>)}
          </div>
        )}
```

`const rn = sale.refund && sale.refundFiscal ? refundNote(sale.refundFiscal, d.tenantName, sale.receiptNo) : null;`

- [ ] **Step 6:** `npm test`, `tsc`, `eslint` temiz. Commit `"İade tutanağı: kasada asıl fatura bilgisi + termal/ekran tutanak"`

---

### Task 4: Yönetim — alıcı faturası girişi, iade rozeti, A4 tutanak

**Files:**
- Modify: `lib/admin/fiscal-actions.ts`, `components/reports/ReviewTab.tsx`, `app/yonetim/mali/page.tsx`
- Create: `components/reports/BuyerInvoices.tsx`, `app/yonetim/mali/iade/[id]/page.tsx`, `tests/refund-note.test.ts` (doğrulama testi)

**Interfaces:**
- Produces: `validateBuyerInvoice(no: string, date: string, soldAt: Date): string | null` (saf, `lib/core/refundNote.ts`); `resolveBuyerInvoice(_: FiscalState, form: FormData): Promise<FiscalState>` (form: `id`, `no`, `date`)

- [ ] **Step 1: Failing test** (`tests/refund-note.test.ts`):

```ts
const { validateBuyerInvoice } = await import("@/lib/core/refundNote");
test("validateBuyerInvoice: no gerekli, tarih biçimi, asıl satıştan önce olamaz", () => {
  const sold = new Date("2026-09-20T10:00:00Z");
  assert.equal(validateBuyerInvoice("", "2026-09-25", sold), "Fatura no gerekli.");
  assert.equal(validateBuyerInvoice("ABC2026000000001", "25.09.2026", sold), "Tarih biçimi geçersiz.");
  assert.equal(validateBuyerInvoice("ABC2026000000001", "2026-09-19", sold), "Tarih asıl satıştan önce olamaz.");
  assert.equal(validateBuyerInvoice("ABC2026000000001", "2026-09-20", sold), null);
});
```

- [ ] **Step 2:** FAIL → **Step 3** implement:

```ts
export function validateBuyerInvoice(no: string, date: string, soldAt: Date): string | null {
  if (!no.trim()) return "Fatura no gerekli.";
  if (no.trim().length > 40) return "Fatura no en çok 40 karakter.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return "Tarih biçimi geçersiz.";
  const soldDay = soldAt.toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
  return date < soldDay ? "Tarih asıl satıştan önce olamaz." : null;
}
```

`fiscal-actions.ts`:

```ts
export async function resolveBuyerInvoice(_: FiscalState, form: FormData): Promise<FiscalState> {
  const a = await requireWriter();
  const id = str(form, "id"), no = str(form, "no"), date = str(form, "date");
  if (!UUID.test(id)) return { error: "Kayıt bulunamadı." };
  return withTenant(a.tenantId, async (tx) => {
    const R = schema.fiscalRefunds;
    const [r] = await tx.select({ id: R.id, soldAt: schema.sales.createdAt }).from(R)
      .innerJoin(schema.fiscalDocuments, eq(schema.fiscalDocuments.id, R.fiscalDocId)).innerJoin(schema.sales, eq(schema.sales.id, schema.fiscalDocuments.saleId))
      .where(and(eq(R.id, id), eq(R.kind, "alici_faturasi"), isNull(R.resolvedAt)));
    if (!r) return { error: "Kayıt bulunamadı ya da zaten kapandı." };
    const err = validateBuyerInvoice(no, date, r.soldAt);
    if (err) return { error: err, field: err.startsWith("Fatura") ? "no" : "date" };
    await tx.update(R).set({ buyerInvoiceNo: no, buyerInvoiceDate: date, resolvedAt: new Date() }).where(eq(R.id, id));
    await audit(tx, a.tenantId, `user:${a.id}`, "fiscal.buyer_invoice", { id, no, date });
    revalidatePath("/yonetim/raporlar");
    return { savedAt: Date.now() };
  });
}
```

- [ ] **Step 4: `BuyerInvoices.tsx`** — sunucu bileşeni `BuyerInvoices({ tenantId })` çözülmemiş `alici_faturasi` kayıtlarını (asıl fatura no, alıcı adı, iade fiş no + tutarı, tarih) listeler; boşsa `null`. Her satırda istemci bileşeni `BuyerInvoiceForm({ id })`: `useFormAction(resolveBuyerInvoice, {})`, alanlar `Field "Alıcının fatura no"` + `Field "Fatura tarihi"` (`type="date"`), buton **"Kaydet"**; hata `text-bad`. Başlık: "Alıcının iade faturası bekleniyor (N)". `ReviewTab` en üstte `<BuyerInvoices tenantId={tenantId} />` (dönemden bağımsız), boş durum mesajı yalnız ikisi de boşsa.
- [ ] **Step 5: Mali → Belgeler** — belge sorgusuna `fiscal_refunds` sol birleştirme (`count`, ilk tutanak id'si); satırda `Badge tone="warn"` "İade" + tutanak varsa `Link href={/yonetim/mali/iade/<id>}` "Tutanak".
- [ ] **Step 6: A4 sayfa** `app/yonetim/mali/iade/[id]/page.tsx`: `requireAdmin`; kayıt + asıl belge + iade satışı + `sale_lines` + tenant; `refundNote({ number, ettn, invoiceAt: issuedAt, buyerKind, partial: true, sellerTaxId }, tenant.name, refundReceiptNo)`; kalem tablosu (ad, miktar, birim fiyat, KDV %, tutar), KDV kırılımı (`sales.vat`), toplam, imza kutuları; "Yazdır" butonu (`window.print`, istemci küçük bileşen), `@page { size: A4 }`. `alici_faturasi` ise tutanak yerine alıcı faturası no/tarihi gösterilir. Bulunamazsa `notFound()` (loading.tsx YOK).
- [ ] **Step 7:** `npm test`, `tsc`, `eslint`. Commit `"İade tutanağı: yönetimde alıcı faturası girişi, iade rozeti, A4 tutanak"`

---

### Task 5: E2E + regresyon + belgeler

**Files:**
- Create: `e2e/iade.mjs`
- Modify: `docs/PROGRESS.md`, `scripts/prod-push.sh` (git exclude'da, yerel)

- [ ] **Step 1: `e2e/iade.mjs`** — `e2e/m8.mjs`'in kayıt/ürün/personel/cihaz/eşleme/vardiya ve mali ayar adımlarını kopyala (kasa kanalı = e-Arşiv, işletme VKN + vergi dairesi + adres). Akış:
  1. 2 ürünlü satış → fişte `receipt-fiscal` içinde "e-ARŞİV FATURA".
  2. İade → fiş no → yalnız 1 ürün → müdür PIN → iade fişinde `getByTestId("refund-note")` görünür, "İADE TUTANAĞI" ve "Müşteri imza" metni.
  3. Kasada "Fatura" ile VKN'li alıcı (1234567890, adres) satış → kısmi iade → fişte "Alıcı iade faturası düzenleyecektir" görünür, `refund-note` yok.
  4. Yönetim → `/yonetim/raporlar?sekme=inceleme` → "Alıcının iade faturası bekleniyor (1)" → no + tarih (bugün) → "Kaydet" → satır kaybolur.
  5. `/yonetim/mali?sekme=belgeler` → "Tutanak" bağlantısı → A4 sayfada "İADE TUTANAĞI".
  Çıktı `İADE OK`. `grantPermissions(['local-network-access'])` m8'deki gibi.
- [ ] **Step 2:** `npm run build` → `:3800`'de `next start` (eski süreci port üzerinden öldür) → `BASE=http://127.0.0.1:3800 node --env-file=.env.local e2e/iade.mjs` → `İADE OK`. Regresyon: `e2e/m8.mjs` (M8 OK — kısmi iade beklentisi değiştiyse m8'i güncelle), `e2e/m3.mjs` (M3 OK).
- [ ] **Step 3:** `docs/PROGRESS.md`'ye "İade tutanağı" bölümü; `scripts/prod-push.sh` 3. adım kontrolü: `fiscal_refunds` relrowsecurity `t`.
- [ ] **Step 4: Commit + push** `"İade tutanağı: E2E + PROGRESS"`. Prod: `prod-push.sh 1..5` Yiğit `!` ile tek tek (şema → rls → kontrol → main → canlı E2E iade).
