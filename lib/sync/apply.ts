// lib/sync/apply.ts — Kasadan gelen belgeyi bulutta uygular. İdempotent: aynı kimlik ikinci kez yazılmaz.
// Tamamlanmış satış/iade reddedilmez: fiyat farkı, silinmiş/pasif ürün, fiş no çakışması, fazla iade → kaydedilir + sales.review.
// Stok takipli ürünlerde satış (−) ve iade (+) hareketi satış anıyla yazılır.
// Reddedilen yalnız biçimi bozuk ya da bu cihaza/kiracıya ait olmayan kimlik taşıyan belgedir.
import { and, eq, inArray, sql } from "drizzle-orm";
import { schema, withTenant, type Tx } from "@/db";
import { lineTotal, totals, type CartLine } from "@/lib/core/cart";
import { settle } from "@/lib/core/payment";
import { summarizeShift } from "@/lib/core/shift";
import type { VatLine } from "@/lib/core/cart";
import type { PayMethod } from "@/lib/core/payment";
import { audit } from "@/lib/audit";
import { refundable, type RefLine } from "@/lib/core/refund";
import { foldTabs, type TabEv, type TabEvent } from "@/lib/core/tab";
import { formatReceipt, syncDoc, type DocResult, type RefundDoc, type SaleDoc, type SyncDoc, type TabDoc } from "./docs";

export type DeviceCtx = { tenantId: string; storeId: string; deviceId: string; receiptPrefix: string };
const FUTURE_SLACK_MS = 5 * 60_000;

export async function applyDoc(ctx: DeviceCtx, raw: unknown): Promise<DocResult> {
  const parsed = syncDoc.safeParse(raw);
  const id = typeof (raw as { id?: unknown })?.id === "string" ? String((raw as { id: string }).id).slice(0, 64) : "";
  if (!parsed.success) return { id, ok: false, error: "Geçersiz belge." };
  const doc = parsed.data;
  return withTenant(ctx.tenantId, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${doc.id}))`);
    const error = await apply(tx, ctx, doc);
    return error ? { id: doc.id, ok: false, error } : { id: doc.id, ok: true };
  });
}

async function staffExists(tx: Tx, staffId: string) {
  const [s] = await tx.select({ id: schema.staff.id }).from(schema.staff).where(eq(schema.staff.id, staffId));
  return Boolean(s);
}

/** Cihaz saati ileri gitmişse sunucu saati. */
function clampAt(at: string, reasons?: string[]): Date {
  const d = new Date(at);
  if (d.getTime() > Date.now() + FUTURE_SLACK_MS) { reasons?.push("cihaz saati ileri"); return new Date(); }
  return d;
}

async function apply(tx: Tx, ctx: DeviceCtx, doc: SyncDoc): Promise<string | null> {
  const sh = schema.shifts;
  if (doc.kind === "shift_open") {
    const [done] = await tx.select({ deviceId: sh.deviceId }).from(sh).where(eq(sh.id, doc.id));
    if (done) return done.deviceId === ctx.deviceId ? null : "Vardiya başka cihazda.";
    if (!(await staffExists(tx, doc.staffId))) return "Personel bulunamadı.";
    await tx.insert(sh).values({ id: doc.id, tenantId: ctx.tenantId, storeId: ctx.storeId, deviceId: ctx.deviceId, openedBy: doc.staffId, openedAt: clampAt(doc.at), openingCash: doc.openingCash });
    await audit(tx, ctx.tenantId, `staff:${doc.staffId}`, "shift.open", { shiftId: doc.id, deviceId: ctx.deviceId, openingCash: doc.openingCash });
    return null;
  }

  if (doc.kind === "shift_close") {
    const [shift] = await tx.select().from(sh).where(and(eq(sh.id, doc.id), eq(sh.deviceId, ctx.deviceId)));
    if (!shift) return "Vardiya bulunamadı.";
    if (shift.closedAt) return null;
    if (!(await staffExists(tx, doc.staffId))) return "Personel bulunamadı.";
    const expectedCash = await expectedCashOf(tx, shift.id, shift.openingCash);
    await tx.update(sh).set({ closedAt: clampAt(doc.at), closedBy: doc.staffId, countedCash: doc.countedCash, expectedCash }).where(eq(sh.id, shift.id));
    await audit(tx, ctx.tenantId, `staff:${doc.staffId}`, "shift.close", { shiftId: shift.id, counted: doc.countedCash, expected: expectedCash });
    return null;
  }

  if (doc.kind === "audit") {
    if (!(await staffExists(tx, doc.staffId))) return "Personel bulunamadı.";
    await tx.insert(schema.auditLog)
      .values({ id: doc.id, tenantId: ctx.tenantId, actor: `staff:${doc.staffId}`, action: `kasa.${doc.action}`, detail: { deviceId: ctx.deviceId, approvedBy: doc.approvedBy }, createdAt: clampAt(doc.at) })
      .onConflictDoNothing();
    return null;
  }

  if (doc.kind === "tab") return applyTab(tx, ctx, doc);
  return doc.kind === "refund" ? applyRefund(tx, ctx, doc) : applySale(tx, ctx, doc);
}

async function expectedCashOf(tx: Tx, shiftId: string, openingCash: number) {
  const sales = await tx.select({ id: schema.sales.id, total: schema.sales.total, change: schema.sales.change, vat: schema.sales.vat, status: schema.sales.status }).from(schema.sales).where(and(eq(schema.sales.shiftId, shiftId), inArray(schema.sales.status, ["kapandi", "iade"])));
  const pays = sales.length ? await tx.select().from(schema.payments).where(inArray(schema.payments.saleId, sales.map((s) => s.id))) : [];
  return summarizeShift(openingCash, sales.map((s) => ({ refund: s.status === "iade", total: s.total, change: s.change, vat: s.vat as VatLine[], payments: pays.filter((p) => p.saleId === s.id).map((p) => ({ method: p.method as PayMethod, amount: p.amount })) }))).expectedCash;
}

type Checked = { lines: (CartLine & { known: boolean; trackStock: boolean; options?: { id: string; name: string; delta: number }[]; note?: string | null })[]; reasons: string[] };

/** Ortak ön kontrol: idempotentlik, vardiya, personel, ürün anlık görüntüsü. string → reddet; null → zaten yazılmış. */
async function precheck(tx: Tx, ctx: DeviceCtx, doc: SaleDoc | RefundDoc): Promise<string | null | Checked> {
  const [done] = await tx.select({ deviceId: schema.sales.deviceId }).from(schema.sales).where(eq(schema.sales.id, doc.id));
  if (done) return done.deviceId === ctx.deviceId ? null : "Satış başka cihazda.";
  const [shift] = await tx.select({ closedAt: schema.shifts.closedAt }).from(schema.shifts).where(and(eq(schema.shifts.id, doc.shiftId), eq(schema.shifts.deviceId, ctx.deviceId)));
  if (!shift) return "Vardiya bulunamadı.";
  if (!(await staffExists(tx, doc.staffId))) return "Personel bulunamadı.";

  const reasons: string[] = [];
  if (shift.closedAt) reasons.push("kapanmış vardiyaya geldi");
  const ids = [...new Set(doc.lines.map((l) => l.productId))];
  const prods = await tx.select({ id: schema.products.id, price: schema.products.price, vatRate: schema.products.vatRate, active: schema.products.active, trackStock: schema.products.trackStock }).from(schema.products).where(inArray(schema.products.id, ids));
  const optIds = [...new Set(doc.lines.flatMap((l) => (l.options ?? []).map((o) => o.id)))];
  const opts = optIds.length ? await tx.select({ id: schema.options.id, delta: schema.options.delta }).from(schema.options).where(inArray(schema.options.id, optIds)) : [];
  const lines = doc.lines.map((l) => {
    const p = prods.find((x) => x.id === l.productId);
    if (doc.kind === "sale") {
      const expected = p ? p.price + (l.options ?? []).reduce((a, o) => a + (opts.find((x) => x.id === o.id)?.delta ?? NaN), 0) : NaN;
      if (!p) reasons.push(`silinmiş ürün: ${l.name}`);
      else if (!p.active) reasons.push(`satıştan kalkmış ürün: ${l.name}`);
      else if (Math.max(0, expected) !== l.unitPrice || p.vatRate !== l.vatRate) reasons.push(`fiyat/KDV farkı: ${l.name}`);
    }
    return { productId: l.productId, name: l.name, unitPrice: l.unitPrice, vatRate: l.vatRate, qtyMilli: l.qtyMilli, discount: l.discount, options: l.options, note: l.note, known: Boolean(p), trackStock: Boolean(p?.trackStock) };
  });
  return { lines, reasons };
}

async function freeReceiptNo(tx: Tx, ctx: DeviceCtx, seq: number, reasons: string[]) {
  let receiptNo = formatReceipt(ctx.receiptPrefix, seq);
  for (let n = 2; ; n++) {
    const [dup] = await tx.select({ id: schema.sales.id }).from(schema.sales).where(and(eq(schema.sales.deviceId, ctx.deviceId), eq(schema.sales.receiptNo, receiptNo)));
    if (!dup) return receiptNo;
    if (n === 2) reasons.push("fiş no çakıştı");
    receiptNo = `${formatReceipt(ctx.receiptPrefix, seq)}-${n}`;
  }
}

async function write(tx: Tx, ctx: DeviceCtx, doc: SaleDoc | RefundDoc, c: Checked, payments: { method: PayMethod; amount: number }[], change: number, extra: { status: "kapandi" | "iade"; refundOf?: string; approvedBy?: string; tabId?: string; tableId?: string; channel?: "masa" }) {
  const t = totals(c.lines);
  const receiptNo = await freeReceiptNo(tx, ctx, doc.receiptSeq, c.reasons);
  const at = clampAt(doc.at, c.reasons);
  await tx.insert(schema.sales).values({ id: doc.id, tenantId: ctx.tenantId, storeId: ctx.storeId, deviceId: ctx.deviceId, shiftId: doc.shiftId, staffId: doc.staffId, receiptNo, total: t.total, change, vat: t.vat, createdAt: at, review: c.reasons.length ? c.reasons.join("; ") : null, ...extra });
  await tx.insert(schema.saleLines).values(c.lines.map((l) => ({ tenantId: ctx.tenantId, saleId: doc.id, productId: l.known ? l.productId : null, name: l.name, unitPrice: l.unitPrice, vatRate: l.vatRate, qtyMilli: l.qtyMilli, total: lineTotal(l), options: l.options ?? null, note: l.note ?? null, discount: l.discount ?? 0 })));
  await tx.insert(schema.payments).values(payments.map((p) => ({ tenantId: ctx.tenantId, saleId: doc.id, method: p.method, amount: p.amount })));
  const sign = extra.status === "iade" ? 1 : -1;
  const stock = c.lines.filter((l) => l.known && l.trackStock);
  if (stock.length) await tx.insert(schema.stockMovements).values(stock.map((l) => ({ tenantId: ctx.tenantId, storeId: ctx.storeId, productId: l.productId, kind: extra.status === "iade" ? ("iade" as const) : ("satis" as const), qtyMilli: sign * l.qtyMilli, at, saleId: doc.id, actor: `staff:${doc.staffId}` })));
  await tx.update(schema.devices).set({ nextReceiptNo: sql`greatest(${schema.devices.nextReceiptNo}, ${doc.receiptSeq + 1})` }).where(and(eq(schema.devices.id, ctx.deviceId), eq(schema.devices.tenantId, ctx.tenantId)));
}

async function applySale(tx: Tx, ctx: DeviceCtx, doc: SaleDoc): Promise<string | null> {
  const c = await precheck(tx, ctx, doc);
  if (c === null || typeof c === "string") return c;
  const total = totals(c.lines).total;
  const s = settle(total, doc.payments);
  if (!s.ok) c.reasons.push(`ödeme: ${s.error}`);
  const tab = doc.tab;
  if (tab) {
    // Masadan parça ödeme: adisyonda kalandan fazlası (çift ödeme, çevrimdışı çakışma) → yine yazılır, incelenir.
    const state = foldTabs(await tabEventsOf(tx, tab.tabId)).get(tab.tabId);
    if (!state) c.reasons.push("adisyon bulunamadı");
    else for (const p of tab.paidLines) {
      const l = state.lines.find((x) => x.lineId === p.lineId);
      if (!l || l.voided || l.paidMilli + p.qtyMilli > l.qtyMilli) { c.reasons.push("adisyonda ödenmiş/olmayan satır"); break; }
    }
  }
  await write(tx, ctx, doc, c, s.ok ? s.payments : doc.payments, s.ok ? s.change : 0, { status: "kapandi", ...(tab ? { tabId: tab.tabId, tableId: tab.tableId, channel: "masa" as const } : {}) });
  if (tab) {
    const ev: TabEv = { type: "paid", saleId: doc.id, lines: tab.paidLines, amount: total };
    await tx.insert(schema.tabEvents).values({ id: doc.id, tenantId: ctx.tenantId, storeId: ctx.storeId, tabId: tab.tabId, tableId: tab.tableId, deviceId: ctx.deviceId, staffId: doc.staffId, at: clampAt(doc.at), type: ev.type, payload: ev }).onConflictDoNothing();
  }
  return null;
}

/** Adisyonun tüm olayları (kiracı içinde, RLS), sunucu sırasıyla. */
export async function tabEventsOf(tx: Tx, tabId: string): Promise<TabEvent[]> {
  const E = schema.tabEvents;
  const rows = await tx.select().from(E).where(eq(E.tabId, tabId)).orderBy(E.seq);
  return rows.map(toTabEvent);
}

export const toTabEvent = (r: typeof schema.tabEvents.$inferSelect): TabEvent =>
  ({ id: r.id, tabId: r.tabId, tableId: r.tableId, at: r.at.toISOString(), staffId: r.staffId, approvedBy: r.approvedBy, seq: r.seq, ev: r.payload as TabEv });

const NEEDS_MANAGER = new Set(["comp", "discount"]);

async function applyTab(tx: Tx, ctx: DeviceCtx, doc: TabDoc): Promise<string | null> {
  const E = schema.tabEvents;
  const [done] = await tx.select({ id: E.id }).from(E).where(eq(E.id, doc.id));
  if (done) return null;
  const tableIds = [doc.tableId, ...(doc.ev.type === "move" ? [doc.ev.toTableId] : [])];
  const tbls = await tx.select({ id: schema.tables.id }).from(schema.tables).where(inArray(schema.tables.id, tableIds));
  if (tbls.length !== new Set(tableIds).size) return "Masa bulunamadı.";
  if (doc.staffId && !(await staffExists(tx, doc.staffId))) return "Personel bulunamadı.";
  if (!doc.staffId && !["kitchen", "printed"].includes(doc.ev.type)) return "Personel gerekli.";

  const reasons: string[] = [];
  const ev = doc.ev;
  const state = foldTabs(await tabEventsOf(tx, doc.tabId)).get(doc.tabId);
  if (state?.closed && ["add", "send", "comp", "discount", "move"].includes(ev.type)) reasons.push("kapanmış adisyona olay");
  if (ev.type === "add") {
    const [p] = await tx.select({ id: schema.products.id }).from(schema.products).where(eq(schema.products.id, ev.productId));
    if (!p) reasons.push(`silinmiş ürün: ${ev.name}`);
  }
  const sentVoid = ev.type === "void" && Boolean(state?.lines.find((l) => l.lineId === ev.lineId)?.sent);
  const guarded = NEEDS_MANAGER.has(ev.type) || sentVoid;
  if (guarded) {
    const who = doc.approvedBy ?? doc.staffId;
    const [s] = who ? await tx.select({ role: schema.staff.role }).from(schema.staff).where(eq(schema.staff.id, who)) : [];
    if (!s) return "Onaylayan personel bulunamadı.";
    if (s.role !== "mudur") reasons.push("müdür onayı yok");
  }
  const at = clampAt(doc.at, reasons);
  await tx.insert(E).values({ id: doc.id, tenantId: ctx.tenantId, storeId: ctx.storeId, tabId: doc.tabId, tableId: doc.tableId, deviceId: ctx.deviceId, staffId: doc.staffId, approvedBy: doc.approvedBy, at, type: ev.type, payload: ev, review: reasons.length ? reasons.join("; ") : null });
  if (guarded) await audit(tx, ctx.tenantId, `staff:${doc.staffId}`, `masa.${ev.type}`, { tabId: doc.tabId, tableId: doc.tableId, approvedBy: doc.approvedBy, ev, review: reasons.length ? reasons : undefined });
  return null;
}

async function applyRefund(tx: Tx, ctx: DeviceCtx, doc: RefundDoc): Promise<string | null> {
  const c = await precheck(tx, ctx, doc);
  if (c === null || typeof c === "string") return c;
  const [approver] = await tx.select({ role: schema.staff.role }).from(schema.staff).where(eq(schema.staff.id, doc.approvedBy));
  if (!approver) return "Onaylayan personel bulunamadı.";
  if (approver.role !== "mudur") c.reasons.push("onaylayan müdür değil");
  const sold = await soldLines(tx, doc.refundOf);
  if (!sold) c.reasons.push("asıl satış bulunamadı");
  else {
    const left = refundable(sold.lines, sold.refunded);
    const want = new Map<string, number>();
    for (const l of c.lines) want.set(l.productId, (want.get(l.productId) ?? 0) + l.qtyMilli);
    for (const [pid, q] of want) if (q > left.filter((l) => l.productId === pid).reduce((a, l) => a + l.qtyMilli, 0)) c.reasons.push(`satılandan fazla iade: ${c.lines.find((l) => l.productId === pid)!.name}`);
  }
  if (doc.payments[0].amount !== totals(c.lines).total) c.reasons.push("iade ödemesi toplamla eşleşmiyor");
  await write(tx, ctx, doc, c, doc.payments, 0, { status: "iade", refundOf: doc.refundOf, approvedBy: doc.approvedBy });
  return null;
}

/** Kapanmış satışın satırları + ona yapılmış iadelerin satırları (kiracı içinde, RLS). */
export async function soldLines(tx: Tx, saleId: string) {
  const [sale] = await tx.select({ id: schema.sales.id }).from(schema.sales).where(and(eq(schema.sales.id, saleId), eq(schema.sales.status, "kapandi")));
  if (!sale) return null;
  const L = schema.saleLines;
  const lines = await tx.select({ productId: L.productId, name: L.name, unitPrice: L.unitPrice, vatRate: L.vatRate, qtyMilli: L.qtyMilli }).from(L).where(eq(L.saleId, saleId));
  const refunds = await tx.select({ id: schema.sales.id }).from(schema.sales).where(and(eq(schema.sales.refundOf, saleId), eq(schema.sales.status, "iade")));
  const refunded = refunds.length ? await tx.select({ productId: L.productId, qtyMilli: L.qtyMilli }).from(L).where(inArray(L.saleId, refunds.map((r) => r.id))) : [];
  return {
    lines: lines.flatMap((l): RefLine[] => (l.productId ? [{ ...l, productId: l.productId, vatRate: l.vatRate as RefLine["vatRate"] }] : [])),
    refunded: refunded.flatMap((l) => (l.productId ? [{ productId: l.productId, qtyMilli: l.qtyMilli }] : [])),
  };
}
