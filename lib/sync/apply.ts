// lib/sync/apply.ts — Kasadan gelen belgeyi bulutta uygular. İdempotent: aynı kimlik ikinci kez yazılmaz.
// Tamamlanmış satış/iade reddedilmez: fiyat farkı, silinmiş/pasif ürün, fiş no çakışması, fazla iade → kaydedilir + sales.review.
// Stok takipli ürünlerde satış (−) ve iade (+) hareketi satış anıyla yazılır. M7: reçeteli satırda ürün değil hammaddeler düşer (recete);
// satır maliyeti (sale_lines.cost) eşitleme anındaki son alış maliyetlerinden donar.
// Reddedilen yalnız biçimi bozuk ya da bu cihaza/kiracıya ait olmayan kimlik taşıyan belgedir.
import { and, eq, inArray, sql } from "drizzle-orm";
import { schema, withTenant, type Tx } from "@/db";
import { lineTotal, totals, type AnyLine } from "@/lib/core/cart";
import { settle } from "@/lib/core/payment";
import { summarizeShift } from "@/lib/core/shift";
import type { VatLine } from "@/lib/core/cart";
import type { PayMethod } from "@/lib/core/payment";
import { audit } from "@/lib/audit";
import { refundable, type RefLine } from "@/lib/core/refund";
import { consumption, lineCost, type RecipeItem, type Recipes } from "@/lib/core/recipe";
import { foldTabs, type TabEv, type TabEvent } from "@/lib/core/tab";
import { normalizePhone } from "@/lib/core/delivery";
import { notifyPlatform, notifyPlatformStatus } from "@/lib/platform/notify";
import { onRefund, openFiscalDoc } from "@/lib/fiscal/issue";
import { formatReceipt, syncDoc, type DocResult, type RefundDoc, type SaleDoc, type SyncDoc, type TabDoc } from "./docs";

export type DeviceCtx = { tenantId: string; storeId: string; deviceId: string; receiptPrefix: string };
const FUTURE_SLACK_MS = 5 * 60_000;

export async function applyDoc(ctx: DeviceCtx, raw: unknown): Promise<DocResult> {
  const parsed = syncDoc.safeParse(raw);
  const id = typeof (raw as { id?: unknown })?.id === "string" ? String((raw as { id: string }).id).slice(0, 64) : "";
  if (!parsed.success) return { id, ok: false, error: "Geçersiz belge." };
  const doc = parsed.data;
  const res: DocResult = await withTenant(ctx.tenantId, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${doc.id}))`);
    const error = await apply(tx, ctx, doc);
    return error ? { id: doc.id, ok: false, error } : { id: doc.id, ok: true };
  });
  // M6: platform siparişi kabul/red → platforma bildir; kalanı: kurye aldı (out/handover), teslim, iptal → durum bildirimi.
  // İşlem sonrası; hata olayı geri almaz, review işaretler.
  if (res.ok && doc.kind === "tab") {
    const ev = doc.ev;
    if (ev.type === "accept" || ev.type === "reject") await notifyPlatform(ctx.tenantId, doc.id, doc.tabId, ev);
    else {
      const status = ev.type === "out" || ev.type === "handover" ? "picked" : ev.type === "delivered" ? "delivered" : ev.type === "cancel" ? "cancelled" : null;
      if (status) await notifyPlatformStatus(ctx.tenantId, doc.id, doc.tabId, status);
    }
  }
  return res;
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

  if (doc.kind === "register_event") {
    const [shift] = await tx.select({ id: sh.id }).from(sh).where(and(eq(sh.id, doc.shiftId), eq(sh.deviceId, ctx.deviceId)));
    if (!shift) return "Vardiya bulunamadı.";
    if (!(await staffExists(tx, doc.staffId))) return "Personel bulunamadı.";
    await tx.insert(schema.registerEvents)
      .values({ id: doc.id, tenantId: ctx.tenantId, storeId: ctx.storeId, deviceId: ctx.deviceId, shiftId: doc.shiftId, staffId: doc.staffId, at: clampAt(doc.at), type: doc.type, lines: doc.lines, total: doc.lines.reduce((s, l) => s + l.total, 0) })
      .onConflictDoNothing();
    return null;
  }

  if (doc.kind === "safe_drop") {
    const [shift] = await tx.select({ id: sh.id }).from(sh).where(and(eq(sh.id, doc.shiftId), eq(sh.deviceId, ctx.deviceId)));
    if (!shift) return "Vardiya bulunamadı.";
    if (!(await staffExists(tx, doc.staffId))) return "Personel bulunamadı.";
    await tx.insert(schema.registerEvents)
      .values({ id: doc.id, tenantId: ctx.tenantId, storeId: ctx.storeId, deviceId: ctx.deviceId, shiftId: doc.shiftId, staffId: doc.staffId, at: clampAt(doc.at), type: "safe_drop", lines: [], total: doc.amount })
      .onConflictDoNothing();
    await audit(tx, ctx.tenantId, `staff:${doc.staffId}`, "kasa.safe_drop", { shiftId: doc.shiftId, amount: doc.amount });
    return null;
  }

  if (doc.kind === "tab") return applyTab(tx, ctx, doc);
  return doc.kind === "refund" ? applyRefund(tx, ctx, doc) : applySale(tx, ctx, doc);
}

async function expectedCashOf(tx: Tx, shiftId: string, openingCash: number) {
  const sales = await tx.select({ id: schema.sales.id, total: schema.sales.total, change: schema.sales.change, vat: schema.sales.vat, status: schema.sales.status }).from(schema.sales).where(and(eq(schema.sales.shiftId, shiftId), inArray(schema.sales.status, ["kapandi", "iade"])));
  const pays = sales.length ? await tx.select().from(schema.payments).where(inArray(schema.payments.saleId, sales.map((s) => s.id))) : [];
  const drops = await tx.select({ total: schema.registerEvents.total }).from(schema.registerEvents).where(and(eq(schema.registerEvents.shiftId, shiftId), eq(schema.registerEvents.type, "safe_drop")));
  return summarizeShift(openingCash, sales.map((s) => ({ refund: s.status === "iade", total: s.total, change: s.change, vat: s.vat as VatLine[], payments: pays.filter((p) => p.saleId === s.id).map((p) => ({ method: p.method as PayMethod, amount: p.amount })) })), drops.map((d) => d.total)).expectedCash;
}

type Checked = { lines: (AnyLine & { known: boolean; trackStock: boolean; options?: { id: string; name: string; delta: number }[]; note?: string | null })[]; reasons: string[] };

/** Ortak ön kontrol: idempotentlik, vardiya, personel, ürün anlık görüntüsü. string → reddet; null → zaten yazılmış. */
async function precheck(tx: Tx, ctx: DeviceCtx, doc: SaleDoc | RefundDoc, tabKind: "masa" | "paket" | "platform" | null = null): Promise<string | null | Checked> {
  const [done] = await tx.select({ deviceId: schema.sales.deviceId }).from(schema.sales).where(eq(schema.sales.id, doc.id));
  if (done) return done.deviceId === ctx.deviceId ? null : "Satış başka cihazda.";
  const [shift] = await tx.select({ closedAt: schema.shifts.closedAt }).from(schema.shifts).where(and(eq(schema.shifts.id, doc.shiftId), eq(schema.shifts.deviceId, ctx.deviceId)));
  if (!shift) return "Vardiya bulunamadı.";
  if (!(await staffExists(tx, doc.staffId))) return "Personel bulunamadı.";

  const reasons: string[] = [];
  if (shift.closedAt) reasons.push("kapanmış vardiyaya geldi");
  const ids = [...new Set(doc.lines.flatMap((l) => (l.productId ? [l.productId] : [])))];
  const prods = !ids.length ? [] : await tx.select({ id: schema.products.id, price: schema.products.price, vatRate: schema.products.vatRate, active: schema.products.active, trackStock: schema.products.trackStock }).from(schema.products).where(inArray(schema.products.id, ids));
  const optIds = [...new Set(doc.lines.flatMap((l) => (l.options ?? []).map((o) => o.id)))];
  const opts = optIds.length ? await tx.select({ id: schema.options.id, delta: schema.options.delta }).from(schema.options).where(inArray(schema.options.id, optIds)) : [];
  const lines = doc.lines.map((l) => {
    const p = l.productId ? prods.find((x) => x.id === l.productId) : undefined;
    if (!l.productId) { if (!tabKind || tabKind === "masa") reasons.push(`serbest satır: ${l.name}`); }
    else if (doc.kind === "sale") {
      const expected = p ? p.price + (l.options ?? []).reduce((a, o) => a + (opts.find((x) => x.id === o.id)?.delta ?? NaN), 0) : NaN;
      if (!p) reasons.push(`silinmiş ürün: ${l.name}`);
      else if (!p.active) reasons.push(`satıştan kalkmış ürün: ${l.name}`);
      // Platform siparişinde fiyatı platform belirler (eşlenen ürün katalog fiyatından farklı olabilir).
      else if (tabKind !== "platform" && (Math.max(0, expected) !== l.unitPrice || p.vatRate !== l.vatRate)) reasons.push(`fiyat/KDV farkı: ${l.name}`);
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

/** Satıştaki bilinen ürünlerin ve seçeneklerin reçeteleri + ilgili maliyetler. RLS kiracıyı ayırır. */
async function recipeData(tx: Tx, lines: Checked["lines"]): Promise<{ byProduct: Recipes; byOption: Recipes; costOf: (id: string) => number | null | undefined }> {
  const R = schema.recipeItems;
  const pids = [...new Set(lines.flatMap((l) => (l.known && l.productId ? [l.productId] : [])))];
  const oids = [...new Set(lines.flatMap((l) => (l.options ?? []).map((o) => o.id)))];
  const byProduct: Recipes = new Map();
  const byOption: Recipes = new Map();
  if (!pids.length) return { byProduct, byOption, costOf: () => null };
  const cond = oids.length ? sql`(${inArray(R.productId, pids)} or ${inArray(R.optionId, oids)})` : inArray(R.productId, pids);
  const items: RecipeItem[] = await tx.select({ productId: R.productId, optionId: R.optionId, ingredientId: R.ingredientId, qtyMilli: R.qtyMilli }).from(R).where(cond);
  for (const it of items) {
    const [m, k] = it.productId ? [byProduct, it.productId] : [byOption, it.optionId!];
    m.set(k, [...(m.get(k) ?? []), it]);
  }
  const ids = [...new Set([...pids, ...items.map((i) => i.ingredientId)])];
  const costs = new Map((await tx.select({ id: schema.products.id, cost: schema.products.cost }).from(schema.products).where(inArray(schema.products.id, ids))).map((p) => [p.id, p.cost]));
  return { byProduct, byOption, costOf: (id) => costs.get(id) };
}

async function write(tx: Tx, ctx: DeviceCtx, doc: SaleDoc | RefundDoc, c: Checked, payments: { method: PayMethod; amount: number }[], change: number, extra: { status: "kapandi" | "iade"; refundOf?: string; approvedBy?: string; tabId?: string; tableId?: string | null; channel?: "masa" | "paket" | "platform" }) {
  const t = totals(c.lines);
  const receiptNo = await freeReceiptNo(tx, ctx, doc.receiptSeq, c.reasons);
  const at = clampAt(doc.at, c.reasons);
  const tip = doc.kind === "sale" ? doc.tip ?? 0 : 0; // #49: bahşiş toplamın içinde
  await tx.insert(schema.sales).values({ id: doc.id, tenantId: ctx.tenantId, storeId: ctx.storeId, deviceId: ctx.deviceId, shiftId: doc.shiftId, staffId: doc.staffId, receiptNo, total: t.total + tip, tip, change, vat: t.vat, createdAt: at, review: c.reasons.length ? c.reasons.join("; ") : null, ...extra });
  const r = await recipeData(tx, c.lines);
  const recLines = c.lines.map((l) => ({ productId: l.known ? l.productId : null, qtyMilli: l.qtyMilli, options: l.options }));
  await tx.insert(schema.saleLines).values(c.lines.map((l, i) => ({ tenantId: ctx.tenantId, saleId: doc.id, productId: l.known ? l.productId : null, name: l.name, unitPrice: l.unitPrice, vatRate: l.vatRate, qtyMilli: l.qtyMilli, total: lineTotal(l), options: l.options ?? null, note: l.note ?? null, discount: l.discount ?? 0, cost: lineCost(recLines[i], r.byProduct, r.byOption, r.costOf) })));
  await tx.insert(schema.payments).values(payments.map((p) => ({ tenantId: ctx.tenantId, saleId: doc.id, method: p.method, amount: p.amount })));
  const sign = extra.status === "iade" ? 1 : -1;
  const actor = `staff:${doc.staffId}`;
  const moves: (typeof schema.stockMovements.$inferInsert)[] = [];
  const used = new Map<string, number>();
  c.lines.forEach((l, i) => {
    if (l.known && l.trackStock && !r.byProduct.has(l.productId!)) moves.push({ tenantId: ctx.tenantId, storeId: ctx.storeId, productId: l.productId!, kind: extra.status === "iade" ? "iade" : "satis", qtyMilli: sign * l.qtyMilli, at, saleId: doc.id, actor });
    for (const [id, q] of consumption(recLines[i], r.byProduct, r.byOption)) used.set(id, (used.get(id) ?? 0) + q);
  });
  for (const [id, q] of used) if (q) moves.push({ tenantId: ctx.tenantId, storeId: ctx.storeId, productId: id, kind: "recete", qtyMilli: sign * q, at, saleId: doc.id, actor });
  if (moves.length) await tx.insert(schema.stockMovements).values(moves);
  await tx.update(schema.devices).set({ nextReceiptNo: sql`greatest(${schema.devices.nextReceiptNo}, ${doc.receiptSeq + 1})` }).where(and(eq(schema.devices.id, ctx.deviceId), eq(schema.devices.tenantId, ctx.tenantId)));
}

async function applySale(tx: Tx, ctx: DeviceCtx, doc: SaleDoc): Promise<string | null> {
  const tab = doc.tab;
  const state = tab ? foldTabs(await tabEventsOf(tx, tab.tabId)).get(tab.tabId) : undefined;
  const c = await precheck(tx, ctx, doc, state?.kind ?? null);
  if (c === null || typeof c === "string") return c;
  const total = totals(c.lines).total;
  const tip = doc.tip ?? 0;
  const s = settle(total + tip, doc.payments);
  if (!s.ok) c.reasons.push(`ödeme: ${s.error}`);
  if (tab) {
    // Masadan parça ödeme: adisyonda kalandan fazlası (çift ödeme, çevrimdışı çakışma) → yine yazılır, incelenir.
    if (!state) c.reasons.push("adisyon bulunamadı");
    else for (const p of tab.paidLines) {
      const l = state.lines.find((x) => x.lineId === p.lineId);
      if (!l || l.voided || l.paidMilli + p.qtyMilli > l.qtyMilli) { c.reasons.push("adisyonda ödenmiş/olmayan satır"); break; }
    }
  }
  await write(tx, ctx, doc, c, s.ok ? s.payments : doc.payments, s.ok ? s.change : 0, { status: "kapandi", ...(tab ? { tabId: tab.tabId, tableId: tab.tableId, channel: state?.kind ?? ("masa" as const) } : {}) });
  await openFiscalDoc(tx, ctx.tenantId, doc.id, tab ? (state?.kind ?? "masa") : "kasa", doc.fiscal);
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

const NEEDS_MANAGER = new Set(["comp", "discount", "cancel"]);

async function applyTab(tx: Tx, ctx: DeviceCtx, doc: TabDoc): Promise<string | null> {
  const E = schema.tabEvents;
  const [done] = await tx.select({ id: E.id }).from(E).where(eq(E.id, doc.id));
  if (done) return null;
  const tableIds = [...(doc.tableId ? [doc.tableId] : []), ...(doc.ev.type === "move" ? [doc.ev.toTableId] : [])];
  const tbls = tableIds.length ? await tx.select({ id: schema.tables.id }).from(schema.tables).where(inArray(schema.tables.id, tableIds)) : [];
  if (tbls.length !== new Set(tableIds).size) return "Masa bulunamadı.";
  if (doc.staffId && !(await staffExists(tx, doc.staffId))) return "Personel bulunamadı.";
  if (!doc.staffId && !["kitchen", "printed"].includes(doc.ev.type)) return "Personel gerekli.";

  const reasons: string[] = [];
  const ev = doc.ev;
  const state = foldTabs(await tabEventsOf(tx, doc.tabId)).get(doc.tabId);
  if (state?.closed && ["add", "send", "comp", "discount", "move", "merge"].includes(ev.type)) reasons.push("kapanmış adisyona olay");
  const kind = state?.kind ?? (ev.type === "open" ? (ev.kind ?? "masa") : "masa");
  if (ev.type === "add") {
    if (!ev.productId) { if (kind === "masa") reasons.push(`serbest satır: ${ev.name}`); }
    else {
      const [p] = await tx.select({ id: schema.products.id }).from(schema.products).where(eq(schema.products.id, ev.productId));
      if (!p) reasons.push(`silinmiş ürün: ${ev.name}`);
    }
  }
  if (ev.type === "delivered" && doc.staffId !== state?.delivery.courierId) {
    const [s] = doc.staffId ? await tx.select({ role: schema.staff.role }).from(schema.staff).where(eq(schema.staff.id, doc.staffId)) : [];
    if (s?.role !== "mudur") reasons.push("atanmamış kurye teslim etti");
  }
  if (ev.type === "courier" && ev.staffId) {
    const [s] = await tx.select({ role: schema.staff.role }).from(schema.staff).where(eq(schema.staff.id, ev.staffId));
    if (!s) return "Kurye bulunamadı.";
  }
  if (ev.type === "order") await upsertCustomer(tx, ctx.tenantId, ev);
  // #49: masa birleştirme — kaynak açık, ödemesiz ve aynı cihazın kiracısında olmalı; hedef olayıyla birlikte
  // kaynak adisyona "merge_away" da aynı işlemde yazılır (satışlar tek olayla taşınır, kaynak kapanır).
  let mergeSource: ReturnType<typeof foldTabs> extends Map<string, infer S> ? S | undefined : never;
  if (ev.type === "merge") {
    mergeSource = foldTabs(await tabEventsOf(tx, ev.fromTabId)).get(ev.fromTabId);
    if (!mergeSource) reasons.push("birleştirilecek adisyon bulunamadı");
    else if (mergeSource.closed) reasons.push("kapanmış adisyon birleştirilemez");
    else if (mergeSource.paid > 0 || mergeSource.lines.some((l) => l.paidMilli > 0)) reasons.push("ödemesi başlamış adisyon birleştirilemez");
    else if (!ev.lines.length) reasons.push("taşınacak satır yok");
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
  if (ev.type === "merge" && !reasons.length) {
    const { randomUUID } = await import("node:crypto");
    await tx.insert(E).values({ id: randomUUID(), tenantId: ctx.tenantId, storeId: ctx.storeId, tabId: ev.fromTabId, tableId: mergeSource?.tableId ?? null, deviceId: ctx.deviceId, staffId: doc.staffId, approvedBy: null, at, type: "merge_away", payload: { type: "merge_away", toTabId: doc.tabId }, review: null });
    await audit(tx, ctx.tenantId, `staff:${doc.staffId}`, "masa.merge", { from: ev.fromTabId, to: doc.tabId, staffId: doc.staffId });
  }
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
    for (const l of c.lines) if (l.productId) want.set(l.productId, (want.get(l.productId) ?? 0) + l.qtyMilli); // serbest satır: precheck review
    for (const [pid, q] of want) if (q > left.filter((l) => l.productId === pid).reduce((a, l) => a + l.qtyMilli, 0)) c.reasons.push(`satılandan fazla iade: ${c.lines.find((l) => l.productId === pid)!.name}`);
  }
  if (doc.payments[0].amount !== totals(c.lines).total) c.reasons.push("iade ödemesi toplamla eşleşmiyor");
  await write(tx, ctx, doc, c, doc.payments, 0, { status: "iade", refundOf: doc.refundOf, approvedBy: doc.approvedBy });
  await onRefund(tx, ctx.tenantId, doc.refundOf, doc.id);
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

/** M6: sipariş olayından müşteri defteri (telefonla bul/oluştur, yeni adresi ekle). Telefon biçim dışıysa atlanır. */
export async function upsertCustomer(tx: Tx, tenantId: string, o: Extract<TabEv, { type: "order" }>) {
  const phone = normalizePhone(o.phone);
  if (!phone) return;
  const C = schema.customers, A = schema.customerAddresses;
  const [c] = await tx.insert(C).values({ tenantId, phone, name: o.name, lastOrderAt: new Date() })
    .onConflictDoUpdate({ target: [C.tenantId, C.phone], set: { name: o.name, lastOrderAt: new Date() } }).returning({ id: C.id });
  const addr = o.address.trim();
  const [had] = await tx.select({ id: A.id }).from(A).where(and(eq(A.customerId, c.id), eq(A.address, addr), eq(A.deleted, false)));
  if (had) await tx.update(A).set({ lastUsedAt: new Date(), directions: o.directions, ...(o.zoneId ? { zoneId: o.zoneId } : {}) }).where(eq(A.id, had.id));
  else await tx.insert(A).values({ tenantId, customerId: c.id, address: addr, directions: o.directions, zoneId: o.zoneId });
}
