// lib/offline/db.ts — Kasa IndexedDB'si (Dexie). Yalnız tarayıcıda.
// Satış, vardiya açma ve gün sonu tek işlemde hem yerel kayda hem giden kutusuna yazılır.
import Dexie, { type Table } from "dexie";
import { totals, type AnyLine } from "@/lib/core/cart";
import { settle, type Payment } from "@/lib/core/payment";
import { refundable, type RefLine } from "@/lib/core/refund";
import { summarizeShift } from "@/lib/core/shift";
import { formatReceipt, type SyncDoc } from "@/lib/sync/docs";
import type { PaidLine, TabEvent } from "@/lib/core/tab";
import type { LineOption } from "@/lib/core/options";
import type { LookedUpSale } from "@/lib/sync/lookup";
import { emptyMeta, type ClosedShift, type LocalSale, type Meta, type OutboxRow, type RejectedRow } from "./state";

class KasaDb extends Dexie {
  meta!: Table<Meta, string>;
  sales!: Table<LocalSale, string>;
  outbox!: Table<OutboxRow, number>;
  rejected!: Table<RejectedRow, string>;
  tabEvents!: Table<TabEvent, string>;
  constructor() {
    super("cabukpos-kasa");
    this.version(1).stores({ meta: "key", sales: "id, shiftId, at", outbox: "++n, id", rejected: "id" });
    this.version(2).stores({ sales: "id, shiftId, at, receiptNo, refundOf" }); // M3: iade için fiş no ile arama
    this.version(3).stores({ tabEvents: "id, seq, tabId" }); // M5: adisyon olayları (sunucudan + yerel bekleyen, seq null)
  }
}

let db: KasaDb | null = null;
export const kasaDb = () => (db ??= new KasaDb());

export async function loadMeta(): Promise<Meta> {
  return (await kasaDb().meta.get("state")) ?? emptyMeta();
}

/** Tarayıcı başka cihaz olarak eşlendi: bekleyen belgeler "reddedildi"ye, geri kalan yerel veri silinir. */
export async function resetForDevice(reason: string) {
  const d = kasaDb();
  await d.transaction("rw", [d.meta, d.sales, d.outbox, d.rejected, d.tabEvents], async () => {
    const now = new Date().toISOString();
    for (const o of await d.outbox.toArray()) await d.rejected.put({ id: o.id, doc: o.doc, error: reason, at: now });
    await d.outbox.clear();
    await d.sales.clear();
    await d.tabEvents.clear();
    await d.meta.put(emptyMeta());
  });
}

const enqueue = (doc: SyncDoc) => kasaDb().outbox.add({ id: doc.id, doc });

export async function openShiftLocal(staffId: string, openingCash: number): Promise<Meta> {
  const d = kasaDb();
  return d.transaction("rw", [d.meta, d.outbox], async () => {
    const m = await loadMeta();
    if (m.shift) return m;
    const shift = { id: crypto.randomUUID(), openedBy: staffId, openedAt: new Date().toISOString(), openingCash };
    await enqueue({ kind: "shift_open", id: shift.id, staffId, at: shift.openedAt, openingCash });
    const next = { ...m, shift };
    await d.meta.put(next);
    return next;
  });
}

export type SaleCartLine = AnyLine & { options?: LineOption[]; note?: string | null };
/** Masadan parça ödeme: satış belgesi tab alanı taşır, yerelde "paid" olayı aynı işlemde yazılır. */
export type SaleTab = { tabId: string; tableId: string | null; tableName: string; paidLines: PaidLine[] };

export async function recordSaleLocal(staff: { id: string; name: string }, cart: SaleCartLine[], payments: Payment[], saleId: string, tab?: SaleTab): Promise<{ ok: true; sale: LocalSale } | { ok: false; error: string }> {
  const d = kasaDb();
  return d.transaction("rw", [d.meta, d.sales, d.outbox, d.tabEvents], async () => {
    const done = await d.sales.get(saleId);
    if (done) return { ok: true as const, sale: done };
    const m = await loadMeta();
    if (!m.device || !m.shift) return { ok: false as const, error: "Açık vardiya yok." };
    if (!cart.length) return { ok: false as const, error: "Sepet boş." };
    const t = totals(cart);
    const s = settle(t.total, payments);
    if (!s.ok) return s;
    const seq = m.nextSeq;
    const at = new Date().toISOString();
    const lines = cart.map((l) => ({
      productId: l.productId, name: l.name, unitPrice: l.unitPrice, vatRate: l.vatRate, qtyMilli: l.qtyMilli,
      ...(tab ? { options: l.options ?? [], note: l.note ?? null, discount: l.discount ?? 0 } : {}),
    }));
    const sale: LocalSale = { id: saleId, shiftId: m.shift.id, staffId: staff.id, staffName: staff.name, seq, receiptNo: formatReceipt(m.device.receiptPrefix, seq), at, lines, payments: s.payments, total: t.total, change: s.change, vat: t.vat, ...(tab ? { tabId: tab.tabId, tableName: tab.tableName } : {}) };
    await d.sales.add(sale);
    const tabField = tab ? { tab: { tabId: tab.tabId, tableId: tab.tableId, paidLines: tab.paidLines } } : {};
    await enqueue({ kind: "sale", id: saleId, shiftId: m.shift.id, staffId: staff.id, receiptSeq: seq, at, lines, payments: s.payments, ...tabField });
    if (tab) await d.tabEvents.put({ id: saleId, tabId: tab.tabId, tableId: tab.tableId, at, staffId: staff.id, approvedBy: null, seq: null, ev: { type: "paid", saleId, lines: tab.paidLines, amount: t.total } });
    await d.meta.put({ ...m, nextSeq: seq + 1 });
    return { ok: true as const, sale };
  });
}

/** Bu cihazda kayıtlı satış + yerel iadeler düşülmüş satırlar. Yoksa null (bulutta aranır). */
export async function findLocalSale(receiptNo: string): Promise<LookedUpSale | null> {
  const d = kasaDb();
  const sale = (await d.sales.where("receiptNo").equals(receiptNo).toArray()).find((s) => !s.refund);
  if (!sale) return null;
  const refunds = await d.sales.where("refundOf").equals(sale.id).toArray();
  return { id: sale.id, receiptNo: sale.receiptNo, at: sale.at, lines: refundable(sale.lines.flatMap((l) => (l.productId ? [{ ...l, productId: l.productId }] : [])), refunds.flatMap((r) => r.lines.flatMap((l) => (l.productId ? [{ ...l, productId: l.productId }] : [])))) };
}

/** İade: yerel kayıt + giden kutusu, aynı fiş sayacı. Geri ödeme tek yöntemle, tutar = iade toplamı. */
export async function recordRefundLocal(staff: { id: string; name: string }, approvedBy: string, of: { id: string; receiptNo: string }, lines: RefLine[], method: Payment["method"], refundId: string): Promise<{ ok: true; sale: LocalSale } | { ok: false; error: string }> {
  const d = kasaDb();
  return d.transaction("rw", [d.meta, d.sales, d.outbox], async () => {
    const done = await d.sales.get(refundId);
    if (done) return { ok: true as const, sale: done };
    const m = await loadMeta();
    if (!m.device || !m.shift) return { ok: false as const, error: "Açık vardiya yok." };
    const picked = lines.filter((l) => l.qtyMilli > 0);
    if (!picked.length) return { ok: false as const, error: "İade edilecek ürün seçin." };
    const t = totals(picked);
    const payments = [{ method, amount: t.total }];
    const seq = m.nextSeq;
    const at = new Date().toISOString();
    const sale: LocalSale = { id: refundId, shiftId: m.shift.id, staffId: staff.id, staffName: staff.name, seq, receiptNo: formatReceipt(m.device.receiptPrefix, seq), at, lines: picked, payments, total: t.total, change: 0, vat: t.vat, refund: true, refundOf: of.id, refundOfNo: of.receiptNo, approvedBy };
    await d.sales.add(sale);
    await enqueue({ kind: "refund", id: refundId, shiftId: m.shift.id, staffId: staff.id, approvedBy, refundOf: of.id, receiptSeq: seq, at, lines: picked, payments });
    await d.meta.put({ ...m, nextSeq: seq + 1 });
    return { ok: true as const, sale };
  });
}

export async function shiftSales(shiftId: string) {
  return (await kasaDb().sales.where("shiftId").equals(shiftId).sortBy("at"));
}

export async function closeShiftLocal(staffId: string, countedCash: number): Promise<Meta> {
  const d = kasaDb();
  return d.transaction("rw", [d.meta, d.sales, d.outbox], async () => {
    const m = await loadMeta();
    if (!m.shift) return m;
    const sales = await d.sales.where("shiftId").equals(m.shift.id).toArray();
    const closedAt = new Date().toISOString();
    const lastClosed: ClosedShift = { ...m.shift, closedBy: staffId, closedAt, countedCash, expectedCash: summarizeShift(m.shift.openingCash, sales).expectedCash };
    await enqueue({ kind: "shift_close", id: m.shift.id, staffId, at: closedAt, countedCash });
    // Eski vardiyaların eşitlenmiş satışları: son kapanan vardiya dışında 14 günden eskiler silinir.
    const cutoff = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const pendingIds = new Set((await d.outbox.toArray()).map((o) => o.id));
    const old = await d.sales.where("at").below(cutoff).filter((s) => s.shiftId !== m.shift!.id && !pendingIds.has(s.id)).primaryKeys();
    await d.sales.bulkDelete(old);
    const next = { ...m, shift: null, lastClosed };
    await d.meta.put(next);
    return next;
  });
}

/** Yetkili işlem kaydı (elle çekmece açma) → giden kutusu → audit_log. */
export async function recordAuditLocal(staffId: string, approvedBy: string | null, action: "cekmece") {
  await enqueue({ kind: "audit", id: crypto.randomUUID(), staffId, approvedBy, at: new Date().toISOString(), action });
}
