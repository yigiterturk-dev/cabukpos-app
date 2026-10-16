// lib/admin/accounting.ts — #20: ayın muhasebe yevmiyesini DB'den kurar (kiracı kapsamlı; audit PII'sız).
import { and, eq, gte, isNotNull, isNull, lt, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { schema } from "@/db";
import { audit } from "@/lib/audit";
import { discountedVat } from "@/lib/core/cart";
import { buildMonthlyJournal, type MonthInput, type PosDay } from "@/lib/core/accounting";
import { purchaseDocVat } from "@/lib/core/purchase";

const IST = 3 * 3600_000;

/** Ayın [başlangıç, bitiş) aralığı ve gün etiketleri (Europe/Istanbul, sabit UTC+3). */
export function istMonthRange(year: number, month: number) {
  const startMs = Date.UTC(year, month - 1, 1) - IST;
  const endMs = Date.UTC(year, month, 1) - IST;
  const start = new Date(startMs), end = new Date(endMs);
  const day = (d: Date | string) => new Date((typeof d === "string" ? new Date(d).getTime() : d.getTime()) + IST).toISOString().slice(0, 10);
  return { start, end, startDay: day(start), endDay: day(end), dayLabel: (d: Date | string) => day(d) };
}

/** Şu anki ay (Istanbul) — RSC gövdesinde ham Date.now çağrısını da buraya gizleriz. */
export function currentIstMonth() {
  const d = new Date(Date.now() + IST);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

const vatSum = (vat: { gross: number; net: number; vat: number }[]) => vat.reduce((a, v) => ({ gross: a.gross + v.gross, net: a.net + v.net, vat: a.vat + v.vat }), { gross: 0, net: 0, vat: 0 });

export async function monthlyAccountingJournal(tx: Tx, input: { tenantId: string; year: number; month: number; actor: string }) {
  const { start, end, startDay, endDay, dayLabel } = istMonthRange(input.year, input.month);
  const S = schema.sales, D = schema.fiscalDocuments, RF = schema.fiscalRefunds, P = schema.purchases, SUP = schema.suppliers, PL = schema.purchaseLines;
  // Ham coalesce ifadesi tip belirsizdir; ISO metni timestamptz'e cast ederek bağlarız.
  const earsivAt = sql`coalesce(${D.issuedAt}, ${D.createdAt})`;
  const earsivBetween = and(sql`${earsivAt} >= ${start.toISOString()}::timestamptz`, sql`${earsivAt} < ${end.toISOString()}::timestamptz`);

  const [sales, earsiv, refunds, purchases, pLines] = await Promise.all([
    tx.select({ id: S.id, total: S.total, discount: S.discount, vat: S.vat, at: S.createdAt }).from(S)
      .where(and(eq(S.tenantId, input.tenantId), eq(S.status, "kapandi"), isNull(S.refundOf), gte(S.createdAt, start), lt(S.createdAt, end))),
    tx.select({ saleId: S.id, no: D.number, buyer: D.buyer, total: S.total, discount: S.discount, vat: S.vat, at: sql<Date>`${earsivAt}` }).from(D).innerJoin(S, eq(S.id, D.saleId))
      .where(and(eq(D.tenantId, input.tenantId), eq(D.status, "issued"), earsivBetween)),
    tx.select({ no: S.receiptNo, total: S.total, discount: S.discount, vat: S.vat, at: S.createdAt, kind: RF.kind, buyer: D.buyer }).from(S)
      .leftJoin(RF, eq(RF.refundSaleId, S.id)).leftJoin(D, eq(D.id, RF.fiscalDocId))
      .where(and(eq(S.tenantId, input.tenantId), eq(S.status, "iade"), isNotNull(S.refundOf), gte(S.createdAt, start), lt(S.createdAt, end))),
    tx.select({ id: P.id, docNo: P.docNo, total: P.total, date: P.date, supplier: SUP.name }).from(P).leftJoin(SUP, eq(SUP.id, P.supplierId))
      .where(and(eq(P.tenantId, input.tenantId), eq(P.status, "kayitli"), gte(P.date, startDay), lt(P.date, endDay))).orderBy(P.date),
    // Alım satırları: dondurulmuş KDV oranı → fişin indirilecek KDV'si (191)
    tx.select({ purchaseId: PL.purchaseId, total: PL.total, vatRate: PL.vatRate }).from(PL).innerJoin(P, eq(P.id, PL.purchaseId))
      .where(and(eq(PL.tenantId, input.tenantId), eq(P.status, "kayitli"), gte(P.date, startDay), lt(P.date, endDay))),
  ]);

  // e-Arşiv satışları gün sonu POS özetinden çıkar (çifte sayım olmasın); cari kaydı ayrı yazılır.
  const earsivSaleIds = new Set(earsiv.map((e) => e.saleId));
  const posByDay = new Map<string, PosDay>();
  for (const s of sales) {
    if (earsivSaleIds.has(s.id)) continue;
    const v = vatSum(s.vat ?? []);
    const key = dayLabel(s.at);
    const cur = posByDay.get(key) ?? { date: key, gross: 0, net: 0, vat: 0 };
    cur.gross += s.total - s.discount; cur.net += v.net - s.discount; cur.vat += v.vat; // #33: indirim düşülmüş net
    posByDay.set(key, cur);
  }

  const linesByPurchase = new Map<string, { total: number; vatRate: number | null }[]>();
  for (const l of pLines) {
    const arr = linesByPurchase.get(l.purchaseId);
    if (arr) arr.push({ total: l.total, vatRate: l.vatRate });
    else linesByPurchase.set(l.purchaseId, [{ total: l.total, vatRate: l.vatRate }]);
  }
  const monthInput: MonthInput = {
    year: input.year, month: input.month,
    posDays: [...posByDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
    earsiv: earsiv.filter((e) => e.no).map((e) => ({ date: dayLabel(e.at), no: e.no!, buyer: e.buyer.name, ...vatSum(discountedVat(e.vat ?? [], e.discount ?? 0)), gross: e.total - e.discount })),
    refunds: refunds.map((r) => {
      const v = vatSum(r.vat ?? []);
      return { date: dayLabel(r.at), no: r.no, gross: r.total - r.discount, net: v.net - r.discount, vat: v.vat, earsiv: r.kind === "alici_faturasi", buyer: r.buyer?.name };
    }),
    purchases: purchases.map((p) => ({ date: p.date, docNo: p.docNo ?? "-", supplier: p.supplier ?? "-", total: p.total, vat: purchaseDocVat(linesByPurchase.get(p.id) ?? []) })),
  };
  const entries = buildMonthlyJournal(monthInput);
  await audit(tx, input.tenantId, input.actor, "accounting.export", { year: input.year, month: input.month, entries: entries.length, posDays: monthInput.posDays.length, earsiv: monthInput.earsiv.length, refunds: monthInput.refunds.length, purchases: monthInput.purchases.length });
  return entries;
}
