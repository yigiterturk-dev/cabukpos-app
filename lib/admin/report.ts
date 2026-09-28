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
