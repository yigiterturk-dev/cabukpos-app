// lib/offline/db.ts — Kasa IndexedDB'si (Dexie). Yalnız tarayıcıda.
// Satış, vardiya açma ve gün sonu tek işlemde hem yerel kayda hem giden kutusuna yazılır.
import Dexie, { type Table } from "dexie";
import { totals, type CartLine } from "@/lib/core/cart";
import { settle, type Payment } from "@/lib/core/payment";
import { summarizeShift } from "@/lib/core/shift";
import { formatReceipt, type SyncDoc } from "@/lib/sync/docs";
import { emptyMeta, type ClosedShift, type LocalSale, type Meta, type OutboxRow, type RejectedRow } from "./state";

class KasaDb extends Dexie {
  meta!: Table<Meta, string>;
  sales!: Table<LocalSale, string>;
  outbox!: Table<OutboxRow, number>;
  rejected!: Table<RejectedRow, string>;
  constructor() {
    super("cabukpos-kasa");
    this.version(1).stores({ meta: "key", sales: "id, shiftId, at", outbox: "++n, id", rejected: "id" });
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
  await d.transaction("rw", [d.meta, d.sales, d.outbox, d.rejected], async () => {
    const now = new Date().toISOString();
    for (const o of await d.outbox.toArray()) await d.rejected.put({ id: o.id, doc: o.doc, error: reason, at: now });
    await d.outbox.clear();
    await d.sales.clear();
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

export async function recordSaleLocal(staff: { id: string; name: string }, cart: CartLine[], payments: Payment[], saleId: string): Promise<{ ok: true; sale: LocalSale } | { ok: false; error: string }> {
  const d = kasaDb();
  return d.transaction("rw", [d.meta, d.sales, d.outbox], async () => {
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
    const lines = cart.map((l) => ({ productId: l.productId, name: l.name, unitPrice: l.unitPrice, vatRate: l.vatRate, qtyMilli: l.qtyMilli }));
    const sale: LocalSale = { id: saleId, shiftId: m.shift.id, staffId: staff.id, staffName: staff.name, seq, receiptNo: formatReceipt(m.device.receiptPrefix, seq), at, lines, payments: s.payments, total: t.total, change: s.change, vat: t.vat };
    await d.sales.add(sale);
    await enqueue({ kind: "sale", id: saleId, shiftId: m.shift.id, staffId: staff.id, receiptSeq: seq, at, lines, payments: s.payments });
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
