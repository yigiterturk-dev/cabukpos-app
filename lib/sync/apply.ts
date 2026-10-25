import { writeStock } from "@/lib/admin/stock-lots";
import { staffCan, permissionForTab, type StaffPermission } from "@/lib/core/staff-permissions";
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
import { verifyJwt } from "@/lib/auth/jwt";
import { refundable, refundKey, type RefLine } from "@/lib/core/refund";
import { consumption, lineCost, type RecipeItem, type Recipes } from "@/lib/core/recipe";
import { foldTabs, type TabEv, type TabEvent } from "@/lib/core/tab";
import { normalizePhone } from "@/lib/core/delivery";
import { endOfStoredIstanbulDay } from "@/lib/core/date";
import { notifyPlatform, notifyPlatformStatus } from "@/lib/platform/notify";
import { onRefund, openFiscalDoc } from "@/lib/fiscal/issue";
import { capDiscount, couponCheck, pointsEarned, pointsValue, type CouponLike } from "@/lib/loyalty";
import { formatReceipt, syncDoc, type DocResult, type RefundDoc, type SaleDoc, type SyncDoc, type TabDoc } from "./docs";

export type DeviceCtx = { tenantId: string; storeId: string; deviceId: string; receiptPrefix: string; now?: number };
const FUTURE_SLACK_MS = 5 * 60_000;
const PAST_WINDOW_MS = 30 * 60_000;

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
async function permitted(tx: Tx, id: string | null, permission: StaffPermission) {
  const [person] = id ? await tx.select().from(schema.staff).where(eq(schema.staff.id,id)) : [];
  return staffCan(person,permission);
}

/** Cihaz saati ileri/geri gitmişse sunucu saati. now: cihazın push anındaki saati (sync.now); yoksa yalnız ileri yönü kollar.
 *  Geri yön: cihaz saati sunucudan sapmışsa ve belge cihaz saatine göre "taze"se (son 30 dk) sunucu zamanına çekilir;
 *  gerçekten uzun süredir çevrimdışı cihazın eski belgeleri kendi zamanında kalır. */
function clampAt(at: string, reasons?: string[], deviceNow?: number): Date {
  const d = new Date(at);
  const now = Date.now();
  if (d.getTime() > now + FUTURE_SLACK_MS) { reasons?.push("cihaz saati ileri"); return new Date(); }
  if (deviceNow && Math.abs(now - deviceNow) > FUTURE_SLACK_MS && d.getTime() > deviceNow - PAST_WINDOW_MS) { reasons?.push("cihaz saati geri"); return new Date(); }
  return d;
}

/** PinPad'in /api/kasa/onay'dan aldığı kısa ömürlü müdür onayı. Yoksa eski davranış (rol beyanı);
 *  varsa geçersizse review'a yazılır — onaylı cihazlarda onay, PIN bilgisine kriptografik olarak bağlanır. */
async function approvalOk(token: string, ctx: DeviceCtx, staffId: string): Promise<boolean> {
  const p = await verifyJwt("onay", token);
  return Boolean(p && p.sub === staffId && p.tid === ctx.tenantId && p.did === ctx.deviceId);
}

async function apply(tx: Tx, ctx: DeviceCtx, doc: SyncDoc): Promise<string | null> {
  const sh = schema.shifts;
  if (doc.kind === "shift_open") {
    const [done] = await tx.select({ deviceId: sh.deviceId }).from(sh).where(eq(sh.id, doc.id));
    if (done) return done.deviceId === ctx.deviceId ? null : "Vardiya başka cihazda.";
    if (!(await staffExists(tx, doc.staffId))) return "Personel bulunamadı.";
    if (!(await permitted(tx,doc.staffId,"shift"))) return "Vardiya yetkisi yok.";
    await tx.insert(sh).values({ id: doc.id, tenantId: ctx.tenantId, storeId: ctx.storeId, deviceId: ctx.deviceId, openedBy: doc.staffId, openedAt: clampAt(doc.at, undefined, ctx.now), openingCash: doc.openingCash });
    await audit(tx, ctx.tenantId, `staff:${doc.staffId}`, "shift.open", { shiftId: doc.id, deviceId: ctx.deviceId, openingCash: doc.openingCash });
    return null;
  }

  if (doc.kind === "shift_close") {
    const [shift] = await tx.select().from(sh).where(and(eq(sh.id, doc.id), eq(sh.deviceId, ctx.deviceId)));
    if (!shift) return "Vardiya bulunamadı.";
    if (shift.closedAt) return null;
    if (!(await permitted(tx,doc.staffId,"shift"))) return "Vardiya yetkisi yok.";
    if (!(await staffExists(tx, doc.staffId))) return "Personel bulunamadı.";
    const expectedCash = await expectedCashOf(tx, shift.id, shift.openingCash);
    await tx.update(sh).set({ closedAt: clampAt(doc.at, undefined, ctx.now), closedBy: doc.staffId, countedCash: doc.countedCash, expectedCash }).where(eq(sh.id, shift.id));
    await audit(tx, ctx.tenantId, `staff:${doc.staffId}`, "shift.close", { shiftId: shift.id, counted: doc.countedCash, expected: expectedCash });
    return null;
  }

  if (doc.kind === "audit") {
    if (!(await staffExists(tx, doc.staffId))) return "Personel bulunamadı.";
    if (!(await permitted(tx,doc.approvedBy??doc.staffId,"drawer"))) return "Çekmece yetkisi yok.";
    await tx.insert(schema.auditLog)
      .values({ id: doc.id, tenantId: ctx.tenantId, actor: `staff:${doc.staffId}`, action: `kasa.${doc.action}`, detail: { deviceId: ctx.deviceId, approvedBy: doc.approvedBy }, createdAt: clampAt(doc.at, undefined, ctx.now) })
      .onConflictDoNothing();
    return null;
  }

  if (doc.kind === "register_event") {
    const [shift] = await tx.select({ id: sh.id }).from(sh).where(and(eq(sh.id, doc.shiftId), eq(sh.deviceId, ctx.deviceId)));
    if (!shift) return "Vardiya bulunamadı.";
    if (!(await staffExists(tx, doc.staffId))) return "Personel bulunamadı.";
    await tx.insert(schema.registerEvents)
      .values({ id: doc.id, tenantId: ctx.tenantId, storeId: ctx.storeId, deviceId: ctx.deviceId, shiftId: doc.shiftId, staffId: doc.staffId, at: clampAt(doc.at, undefined, ctx.now), type: doc.type, lines: doc.lines, total: doc.lines.reduce((s, l) => s + l.total, 0) })
      .onConflictDoNothing();
    return null;
  }

  if (doc.kind === "safe_drop") {
    if (!(await permitted(tx,doc.staffId,"safeDrop"))) return "Para aktarma yetkisi yok.";
    const [shift] = await tx.select({ id: sh.id }).from(sh).where(and(eq(sh.id, doc.shiftId), eq(sh.deviceId, ctx.deviceId)));
    if (!shift) return "Vardiya bulunamadı.";
    if (!(await staffExists(tx, doc.staffId))) return "Personel bulunamadı.";
    await tx.insert(schema.registerEvents)
      .values({ id: doc.id, tenantId: ctx.tenantId, storeId: ctx.storeId, deviceId: ctx.deviceId, shiftId: doc.shiftId, staffId: doc.staffId, at: clampAt(doc.at, undefined, ctx.now), type: "safe_drop", lines: [], total: doc.amount })
      .onConflictDoNothing();
    await audit(tx, ctx.tenantId, `staff:${doc.staffId}`, "kasa.safe_drop", { shiftId: doc.shiftId, amount: doc.amount });
    return null;
  }

  if (doc.kind === "tab") return applyTab(tx, ctx, doc);
  return doc.kind === "refund" ? applyRefund(tx, ctx, doc) : applySale(tx, ctx, doc);
}

async function expectedCashOf(tx: Tx, shiftId: string, openingCash: number) {
  const sales = await tx.select({ id: schema.sales.id, total: schema.sales.total, discount: schema.sales.discount, change: schema.sales.change, vat: schema.sales.vat, status: schema.sales.status }).from(schema.sales).where(and(eq(schema.sales.shiftId, shiftId), inArray(schema.sales.status, ["kapandi", "iade"])));
  const pays = sales.length ? await tx.select().from(schema.payments).where(inArray(schema.payments.saleId, sales.map((s) => s.id))) : [];
  const drops = await tx.select({ total: schema.registerEvents.total }).from(schema.registerEvents).where(and(eq(schema.registerEvents.shiftId, shiftId), eq(schema.registerEvents.type, "safe_drop")));
  return summarizeShift(openingCash, sales.map((s) => ({ refund: s.status === "iade", total: s.total, discount: s.discount, change: s.change, vat: s.vat as VatLine[], payments: pays.filter((p) => p.saleId === s.id).map((p) => ({ method: p.method as PayMethod, amount: p.amount })) })), drops.map((d) => d.total)).expectedCash;
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

async function write(tx: Tx, ctx: DeviceCtx, doc: SaleDoc | RefundDoc, c: Checked, payments: { method: PayMethod; amount: number }[], change: number, extra: { status: "kapandi" | "iade"; refundOf?: string; approvedBy?: string; tabId?: string; tableId?: string | null; channel?: "masa" | "paket" | "platform"; discount?: number; customerId?: string | null }) {
  // Already completed financial documents are retained for reconciliation; authority failures are visible review findings.
  if (!(await permitted(tx,doc.staffId,"sale"))) c.reasons.push("satış/tahsilat yetkisi yok");
  const t = totals(c.lines);
  const receiptNo = await freeReceiptNo(tx, ctx, doc.receiptSeq, c.reasons);
  const at = clampAt(doc.at, c.reasons, ctx.now);
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
  if (moves.length) await writeStock(tx, moves);
  await tx.update(schema.devices).set({ nextReceiptNo: sql`greatest(${schema.devices.nextReceiptNo}, ${doc.receiptSeq + 1})` }).where(and(eq(schema.devices.id, ctx.deviceId), eq(schema.devices.tenantId, ctx.tenantId)));
}

type SaleExtras = {
  discount: number;
  customerId: string | null;
  coupon: { id: string; discount: number } | null;
  giftCard: { id: string; amount: number } | null;
  loyaltyRedeem: { customerId: string; points: number } | null;
  earn: { customerId: string; points: number } | null;
};

/** #33: satış ekleri — kupon + puan indirimi, hediye kartı, puan kazanımı. Sunucu yetkilidir;
 *  istemci değeriyle uyuşmazlık satışı engellemez, review'a yazılır (fiyat farkı deseniyle aynı). */
async function resolveSaleExtras(tx: Tx, doc: SaleDoc, subtotal: number, reasons: string[]): Promise<SaleExtras> {
  const out: SaleExtras = { discount: 0, customerId: doc.customerId ?? null, coupon: null, giftCard: null, loyaltyRedeem: null, earn: null };
  const parts: number[] = [];

  let customerId = doc.loyalty?.customerId ?? out.customerId;
  if (customerId) {
    const [c] = await tx.select({ id: schema.customers.id }).from(schema.customers).where(eq(schema.customers.id, customerId)).limit(1);
    if (!c) { reasons.push("müşteri bulunamadı"); customerId = null; }
  }
  out.customerId = customerId;

  // Kupon: kod + durum + tarih/limit/alt sınır sunucuda yeniden doğrulanır.
  let couponDiscount = 0;
  if (doc.coupon) {
    const [row] = await tx.select().from(schema.coupons).where(and(eq(schema.coupons.code, doc.coupon.code), eq(schema.coupons.status, "acik"))).limit(1);
    if (!row) reasons.push("kupon: bulunamadı");
    else {
      const [used] = customerId
        ? await tx.select({ n: sql<number>`count(*)::int` }).from(schema.couponUses).where(and(eq(schema.couponUses.couponId, row.id), eq(schema.couponUses.customerId, customerId)))
        : [{ n: 0 }];
      const like: CouponLike = { kind: row.kind, value: row.value, minSubtotal: row.minSubtotal, maxDiscount: row.maxDiscount, startsAt: row.startsAt, endsAt: row.endsAt, usageLimit: row.usageLimit, perCustomerLimit: row.perCustomerLimit, usedCount: row.usedCount };
      const r = couponCheck(like, subtotal, new Date(), Number(used?.n ?? 0));
      if (!r.ok) reasons.push(`kupon: ${r.reason}`);
      else { couponDiscount = r.discount; out.coupon = { id: row.id, discount: r.discount }; }
    }
    if (couponDiscount !== doc.coupon.discount) reasons.push("kupon indirimi uyuşmadı");
  }
  parts.push(couponDiscount);

  // Sadakat ayarları: harcama ya da kazanç varsa okunur (kiracı başına tek satır).
  const [settings] = doc.loyalty || doc.customerId ? await tx.select().from(schema.loyaltySettings).limit(1) : [];

  // Puan harcama: bakiye = hareketlerin işaretli toplamı; alt puan sınırı uygulanır.
  let redeemDiscount = 0;
  if (doc.loyalty) {
    if (!settings?.enabled) reasons.push("sadakat: kapalı");
    else {
      const [bal] = await tx.select({ total: sql<number>`coalesce(sum(${schema.loyaltyEvents.points}), 0)::int` }).from(schema.loyaltyEvents).where(eq(schema.loyaltyEvents.customerId, doc.loyalty.customerId));
      const balance = Number(bal?.total ?? 0);
      if (doc.loyalty.points < settings.minRedeemPoints) reasons.push(`sadakat: en az ${settings.minRedeemPoints} puan gerekli`);
      else if (doc.loyalty.points > balance) reasons.push("sadakat: puan bakiyesi yetersiz");
      else { redeemDiscount = pointsValue(doc.loyalty.points, settings.kurusPerRedeem); out.loyaltyRedeem = { customerId: doc.loyalty.customerId, points: doc.loyalty.points }; }
      if (redeemDiscount !== doc.loyalty.discount) reasons.push("sadakat indirimi uyuşmadı");
    }
  }
  parts.push(redeemDiscount);
  out.discount = capDiscount(subtotal, parts);

  // Puan kazanç: indirimli ara toplam üzerinden; bahşiş puan kazandırmaz.
  if (settings?.enabled && customerId) {
    const pts = pointsEarned(subtotal - out.discount, settings.kurusPerPoint);
    if (pts > 0) out.earn = { customerId, points: pts };
  }

  // Hediye kartı: bakiye ve kalan borçla sınırlanır; karta para üstü verilmez.
  if (doc.giftCard) {
    const [card] = await tx.select().from(schema.giftCards).where(and(eq(schema.giftCards.code, doc.giftCard.code), eq(schema.giftCards.status, "aktif"))).limit(1);
    if (!card) reasons.push("hediye kartı: bulunamadı");
    else if (card.expiresAt && endOfStoredIstanbulDay(card.expiresAt).getTime() < Date.now()) reasons.push("hediye kartı: süresi doldu");
    else {
      const due = subtotal - out.discount + (doc.tip ?? 0);
      const nonGift = doc.payments.filter((p) => p.method !== "hediye_karti").reduce((a, p) => a + p.amount, 0);
      const amount = Math.max(0, Math.min(card.balanceKurus, due - nonGift));
      out.giftCard = { id: card.id, amount };
      if (amount !== doc.giftCard.amount) reasons.push("hediye kartı tutarı uyuşmadı");
    }
  }

  return out;
}

/** Eklerin kalıcılığı (tek işlem içinde): kupon kullanımı, hediye kartı düşümü, puan hareketleri. */
async function persistSaleExtras(tx: Tx, ctx: DeviceCtx, doc: SaleDoc, x: SaleExtras) {
  const actor = `staff:${doc.staffId}`;
  if (x.coupon) {
    await tx.insert(schema.couponUses).values({ tenantId: ctx.tenantId, couponId: x.coupon.id, customerId: x.customerId, saleId: doc.id, discountKurus: x.coupon.discount }).onConflictDoNothing();
    await tx.update(schema.coupons).set({ usedCount: sql`${schema.coupons.usedCount} + 1` }).where(eq(schema.coupons.id, x.coupon.id));
    await audit(tx, ctx.tenantId, actor, "coupon.redeemed", { saleId: doc.id, couponId: x.coupon.id, discount: x.coupon.discount });
  }
  if (x.giftCard && x.giftCard.amount > 0) {
    const [upd] = await tx.update(schema.giftCards).set({ balanceKurus: sql`${schema.giftCards.balanceKurus} - ${x.giftCard.amount}` }).where(and(eq(schema.giftCards.id, x.giftCard.id), eq(schema.giftCards.status, "aktif"))).returning({ balance: schema.giftCards.balanceKurus });
    if (upd) {
      await tx.insert(schema.giftCardEvents).values({ tenantId: ctx.tenantId, cardId: x.giftCard.id, saleId: doc.id, kind: "harcama", amountKurus: -x.giftCard.amount, actor });
      if (upd.balance <= 0) await tx.update(schema.giftCards).set({ status: "bitti" }).where(eq(schema.giftCards.id, x.giftCard.id));
      await audit(tx, ctx.tenantId, actor, "giftcard.spent", { saleId: doc.id, cardId: x.giftCard.id, amount: x.giftCard.amount, balance: upd.balance });
    }
  }
  if (x.loyaltyRedeem) {
    await tx.insert(schema.loyaltyEvents).values({ tenantId: ctx.tenantId, customerId: x.loyaltyRedeem.customerId, saleId: doc.id, kind: "harcanma", points: -x.loyaltyRedeem.points, note: "kasada harcandı", actor });
    await audit(tx, ctx.tenantId, actor, "loyalty.redeemed", { saleId: doc.id, customerId: x.loyaltyRedeem.customerId, points: x.loyaltyRedeem.points });
  }
  if (x.earn) {
    await tx.insert(schema.loyaltyEvents).values({ tenantId: ctx.tenantId, customerId: x.earn.customerId, saleId: doc.id, kind: "kazanc", points: x.earn.points, actor });
  }
}

async function applySale(tx: Tx, ctx: DeviceCtx, doc: SaleDoc): Promise<string | null> {
  const tab = doc.tab;
  const state = tab ? foldTabs(await tabEventsOf(tx, tab.tabId)).get(tab.tabId) : undefined;
  const c = await precheck(tx, ctx, doc, state?.kind ?? null);
  if (c === null || typeof c === "string") return c;
  const subtotal = totals(c.lines).total;
  const tip = doc.tip ?? 0;
  const extras = await resolveSaleExtras(tx, doc, subtotal, c.reasons);
  // Hediye kartı sunucuda çözülür: istemcinin gönderdiği hediye kartı satırı atılır, yetkili tutarla yeniden kurulur.
  let payments = doc.payments.filter((p) => p.method !== "hediye_karti");
  if (extras.giftCard && extras.giftCard.amount > 0) payments = [...payments, { method: "hediye_karti", amount: extras.giftCard.amount }];
  const due = subtotal - extras.discount + tip;
  const s = settle(due, payments);
  if (!s.ok) c.reasons.push(`ödeme: ${s.error}`);
  if (tab) {
    // Masadan parça ödeme: adisyonda kalandan fazlası (çift ödeme, çevrimdışı çakışma) → yine yazılır, incelenir.
    if (!state) c.reasons.push("adisyon bulunamadı");
    else for (const p of tab.paidLines) {
      const l = state.lines.find((x) => x.lineId === p.lineId);
      if (!l || l.voided || l.paidMilli + p.qtyMilli > l.qtyMilli) { c.reasons.push("adisyonda ödenmiş/olmayan satır"); break; }
    }
  }
  await write(tx, ctx, doc, c, s.ok ? s.payments : payments, s.ok ? s.change : 0, { status: "kapandi", discount: extras.discount, customerId: extras.customerId, ...(tab ? { tabId: tab.tabId, tableId: tab.tableId, channel: state?.kind ?? ("masa" as const) } : {}) });
  await persistSaleExtras(tx, ctx, doc, extras);
  await openFiscalDoc(tx, ctx.tenantId, doc.id, tab ? (state?.kind ?? "masa") : "kasa", doc.fiscal);
  if (tab) {
    const ev: TabEv = { type: "paid", saleId: doc.id, lines: tab.paidLines, amount: subtotal };
    await tx.insert(schema.tabEvents).values({ id: doc.id, tenantId: ctx.tenantId, storeId: ctx.storeId, tabId: tab.tabId, tableId: tab.tableId, deviceId: ctx.deviceId, staffId: doc.staffId, at: clampAt(doc.at, undefined, ctx.now), type: ev.type, payload: ev }).onConflictDoNothing();
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
    const [s] = who ? await tx.select().from(schema.staff).where(eq(schema.staff.id, who)) : [];
    if (!s) return "Onaylayan personel bulunamadı.";
    const permission = permissionForTab(ev.type,sentVoid);
    if (permission && !staffCan(s,permission)) return "Bu işlem için personel yetkisi yok.";
    if (doc.approvalToken !== undefined && who && !(await approvalOk(doc.approvalToken, ctx, who))) reasons.push("müdür onayı doğrulanamadı");
  }
  const at = clampAt(doc.at, reasons, ctx.now);
  await tx.insert(E).values({ id: doc.id, tenantId: ctx.tenantId, storeId: ctx.storeId, tabId: doc.tabId, tableId: doc.tableId, deviceId: ctx.deviceId, staffId: doc.staffId, approvedBy: doc.approvedBy, at, type: ev.type, payload: ev, review: reasons.length ? reasons.join("; ") : null });
  if (ev.type === "merge" && !reasons.length) {
    const { randomUUID } = await import("node:crypto");
    await tx.insert(E).values({ id: randomUUID(), tenantId: ctx.tenantId, storeId: ctx.storeId, tabId: ev.fromTabId, tableId: mergeSource?.tableId ?? null, deviceId: ctx.deviceId, staffId: doc.staffId, approvedBy: null, at, type: "merge_away", payload: { type: "merge_away", toTabId: doc.tabId }, review: null });
    await audit(tx, ctx.tenantId, `staff:${doc.staffId}`, "masa.merge", { from: ev.fromTabId, to: doc.tabId, staffId: doc.staffId });
  }
  if (guarded) await audit(tx, ctx.tenantId, `staff:${doc.staffId}`, `masa.${ev.type}`, { tabId: doc.tabId, tableId: doc.tableId, approvedBy: doc.approvedBy, ev, review: reasons.length ? reasons : undefined });
  return null;
}

/** #33: iade — indirimli/hediye kartlı satışın puan ve kart eklemelerini oransal geri alır.
 *  İade tutarı asıl mal toplamına oranlanır; önceki iadeler (note etiketli iade hareketleri) düşülür → çift geri alma olmaz. */
async function reverseSaleExtras(tx: Tx, ctx: DeviceCtx, doc: RefundDoc) {
  const actor = `staff:${doc.staffId}`;
  const L = schema.loyaltyEvents, G = schema.giftCardEvents;
  const [orig] = await tx.select({ total: schema.sales.total, tip: schema.sales.tip }).from(schema.sales).where(eq(schema.sales.id, doc.refundOf));
  if (!orig) return;
  const origGoods = orig.total - orig.tip; // indirim öncesi mal toplamı
  if (origGoods <= 0) return;
  // Kümülatif oran: bu iade dahil asıl satışa yapılmış tüm iadelerin mal toplamı (write önce çalışır).
  const [agg] = await tx.select({ sum: sql<number>`coalesce(sum(${schema.sales.total}), 0)::int` }).from(schema.sales).where(and(eq(schema.sales.refundOf, doc.refundOf), eq(schema.sales.status, "iade")));
  const ratio = Math.min(1, Math.max(0, Number(agg?.sum ?? 0)) / origGoods);

  // Puan: kazancı geri al (eksi), harcamayı geri ver (artı). Hepsi asıl satışa bağlı işaretli hareket.
  const loy = await tx.select({ kind: L.kind, points: L.points, note: L.note, customerId: L.customerId }).from(L).where(eq(L.saleId, doc.refundOf));
  const earned = loy.filter((e) => e.kind === "kazanc").reduce((a, e) => a + e.points, 0);
  const redeemed = -loy.filter((e) => e.kind === "harcanma").reduce((a, e) => a + e.points, 0);
  const earnedRev = -loy.filter((e) => e.note === "iade:kazanc").reduce((a, e) => a + e.points, 0);
  const redeemedRev = loy.filter((e) => e.note === "iade:harcanma").reduce((a, e) => a + e.points, 0);
  const customerId = loy.find((e) => e.kind === "kazanc" || e.kind === "harcanma")?.customerId ?? null;
  const dEarn = Math.max(0, Math.min(earned - earnedRev, Math.floor(earned * ratio) - earnedRev));
  const dRedeem = Math.max(0, Math.min(redeemed - redeemedRev, Math.floor(redeemed * ratio) - redeemedRev));
  if (customerId && dEarn > 0) await tx.insert(L).values({ tenantId: ctx.tenantId, customerId, saleId: doc.refundOf, kind: "iade", points: -dEarn, note: "iade:kazanc", actor });
  if (customerId && dRedeem > 0) await tx.insert(L).values({ tenantId: ctx.tenantId, customerId, saleId: doc.refundOf, kind: "iade", points: dRedeem, note: "iade:harcanma", actor });

  // Hediye kartı: harcamanın iade payı bakiyeye döner (iptal edilmiş karta iade edilmez).
  const ge = await tx.select({ cardId: G.cardId, kind: G.kind, amountKurus: G.amountKurus }).from(G).where(eq(G.saleId, doc.refundOf));
  const giftPaid = -ge.filter((e) => e.kind === "harcama").reduce((a, e) => a + e.amountKurus, 0);
  const giftRev = ge.filter((e) => e.kind === "iade").reduce((a, e) => a + e.amountKurus, 0);
  const cardId = ge.find((e) => e.kind === "harcama")?.cardId ?? null;
  const dGift = Math.max(0, Math.min(giftPaid - giftRev, Math.floor(giftPaid * ratio) - giftRev));
  if (cardId && dGift > 0) {
    const [card] = await tx.select({ status: schema.giftCards.status }).from(schema.giftCards).where(eq(schema.giftCards.id, cardId));
    if (card && card.status !== "iptal") {
      await tx.update(schema.giftCards).set({ balanceKurus: sql`${schema.giftCards.balanceKurus} + ${dGift}`, ...(card.status === "bitti" ? { status: "aktif" as const } : {}) }).where(eq(schema.giftCards.id, cardId));
      await tx.insert(G).values({ tenantId: ctx.tenantId, cardId, saleId: doc.refundOf, kind: "iade", amountKurus: dGift, actor });
      await audit(tx, ctx.tenantId, actor, "giftcard.refunded", { saleId: doc.refundOf, cardId, amount: dGift });
    }
  }
  if (dEarn > 0 || dRedeem > 0) await audit(tx, ctx.tenantId, actor, "loyalty.refund", { saleId: doc.refundOf, earnBack: dEarn, redeemBack: dRedeem });

  // Kupon: satış tümüyle iade edildiğinde kullanım geri alınır (kupon yeniden kullanılabilir).
  if (ratio >= 1) {
    const [cu] = await tx.select({ id: schema.couponUses.id, couponId: schema.couponUses.couponId }).from(schema.couponUses).where(eq(schema.couponUses.saleId, doc.refundOf)).limit(1);
    if (cu) {
      await tx.delete(schema.couponUses).where(eq(schema.couponUses.id, cu.id));
      await tx.update(schema.coupons).set({ usedCount: sql`greatest(${schema.coupons.usedCount} - 1, 0)` }).where(eq(schema.coupons.id, cu.couponId));
      await audit(tx, ctx.tenantId, actor, "coupon.reversed", { saleId: doc.refundOf, couponId: cu.couponId });
    }
  }
}

async function applyRefund(tx: Tx, ctx: DeviceCtx, doc: RefundDoc): Promise<string | null> {
  const c = await precheck(tx, ctx, doc);
  if (c === null || typeof c === "string") return c;
  const [approver] = await tx.select().from(schema.staff).where(eq(schema.staff.id, doc.approvedBy));
  if (!approver) return "Onaylayan personel bulunamadı.";
  if (!staffCan(approver,"refund")) c.reasons.push("onaylayan müdür değil; iade yetkisi yok");
  // Derin tarama #2: PIN sunucuda doğrulanmışsa belge onaya kriptografik olarak bağlanır.
  if (doc.approvalToken !== undefined && !(await approvalOk(doc.approvalToken, ctx, doc.approvedBy))) c.reasons.push("müdür onayı doğrulanamadı");
  const sold = await soldLines(tx, doc.refundOf);
  let serverGoods: number | null = null;
  if (!sold) c.reasons.push("asıl satış bulunamadı");
  else {
    const left = refundable(sold.lines, sold.refunded);
    const leftByKey = new Map<string, number>();
    for (const l of left) { const k = refundKey(l); leftByKey.set(k, (leftByKey.get(k) ?? 0) + l.qtyMilli); }
    // Derin tarama #1/#3: iade satırları asıl satışla satır anahtarıyla eşlenir; tutar sunucu yetkinliğinde
    // orijinal satır tutarından (satır indirimi dahil) oransal hesaplanır — cihazın gönderdiği tutara güvenilmez.
    let goods = 0;
    let allKnown = true;
    for (const l of c.lines) {
      if (!l.productId) { allKnown = false; continue; } // serbest satır: precheck review
      const k = refundKey(l as RefLine);
      const orig = sold.lines.find((s) => refundKey(s) === k);
      if (!orig) { c.reasons.push(`asıl satışta böyle bir satır yok: ${l.name}`); allKnown = false; continue; }
      if (l.qtyMilli > (leftByKey.get(k) ?? 0)) c.reasons.push(`satılandan fazla iade: ${l.name}`);
      goods += orig.total != null && orig.qtyMilli > 0 ? Math.max(0, Math.round((orig.total * l.qtyMilli) / orig.qtyMilli)) : lineTotal(l);
    }
    if (allKnown) serverGoods = goods;
  }
  // #33: asıl satış indirimliyse iade tutarına da oransal indirim yansır — aksi hâlde müşteri fazla para alır.
  const refundGoods = serverGoods ?? totals(c.lines).total;
  const [origSale] = await tx.select({ total: schema.sales.total, tip: schema.sales.tip, discount: schema.sales.discount }).from(schema.sales).where(eq(schema.sales.id, doc.refundOf));
  const origGoods = origSale ? origSale.total - origSale.tip : 0;
  const refundDiscount = origSale && origGoods > 0 ? Math.floor((refundGoods * origSale.discount) / origGoods) : 0;
  if (doc.payments[0].amount !== refundGoods - refundDiscount) c.reasons.push("iade ödemesi toplamla eşleşmiyor");
  await write(tx, ctx, doc, c, doc.payments, 0, { status: "iade", refundOf: doc.refundOf, approvedBy: doc.approvedBy, discount: refundDiscount });
  await reverseSaleExtras(tx, ctx, doc);
  await onRefund(tx, ctx.tenantId, doc.refundOf, doc.id);
  return null;
}

/** Kapanmış satışın satırları + ona yapılmış iadelerin satırları (kiracı içinde, RLS). */
export async function soldLines(tx: Tx, saleId: string) {
  const [sale] = await tx.select({ id: schema.sales.id }).from(schema.sales).where(and(eq(schema.sales.id, saleId), eq(schema.sales.status, "kapandi")));
  if (!sale) return null;
  const L = schema.saleLines;
  const lines = await tx.select({ productId: L.productId, name: L.name, unitPrice: L.unitPrice, vatRate: L.vatRate, qtyMilli: L.qtyMilli, total: L.total, discount: L.discount, options: L.options, note: L.note }).from(L).where(eq(L.saleId, saleId));
  const refunds = await tx.select({ id: schema.sales.id }).from(schema.sales).where(and(eq(schema.sales.refundOf, saleId), eq(schema.sales.status, "iade")));
  const refunded = refunds.length ? await tx.select({ productId: L.productId, qtyMilli: L.qtyMilli, unitPrice: L.unitPrice, vatRate: L.vatRate, options: L.options }).from(L).where(inArray(L.saleId, refunds.map((r) => r.id))) : [];
  return {
    lines: lines.flatMap((l): RefLine[] => (l.productId ? [{ ...l, productId: l.productId, vatRate: l.vatRate as RefLine["vatRate"], options: l.options ?? undefined }] : [])),
    refunded: refunded.flatMap((l) => (l.productId ? [{ ...l, productId: l.productId, vatRate: l.vatRate as RefLine["vatRate"] }] : [])),
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
