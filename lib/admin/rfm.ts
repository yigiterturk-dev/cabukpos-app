// lib/admin/rfm.ts — #40: müşteri RFM + kohort verisi. Yalnız tamamlanmış, iadesiz satışlar; paket sipariş telefonundan müşteri bağlantısı.
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { schema, type Tx } from "@/db";
import { normalizePhone } from "@/lib/core/delivery";
import { cohortGrid, rfmMonths, rfmScore, RFM_SEGMENT, rfmSegment, type CohortRow } from "@/lib/core/rfm";

export type RfmRow = {
  customerId: string; name: string; phone: string; orders: number; spend: number;
  lastOrderAt: string; firstOrderAt: string; recencyDays: number; r: number; f: number; m: number; segment: string;
};

export { rfmMonths };

export type RfmData = {
  summary: { total: number; active30: number; new30: number; spend30: number };
  rows: RfmRow[];
  cohorts: CohortRow[];
};

const SEGMENT_LABEL = RFM_SEGMENT;

export async function rfmData(tx: Tx, tenantId: string, nowMs = Date.now()): Promise<RfmData> {
  const S = schema.sales, TE = schema.tabEvents, C = schema.customers;
  const since = new Date(nowMs - 365 * 86_400_000);

  const customers = await tx.select({ id: C.id, phone: C.phone, name: C.name, createdAt: C.createdAt }).from(C).where(eq(C.tenantId, tenantId));
  const byPhone = new Map(customers.map((c) => [c.phone, c]));

  // Paket siparişi olayları → adisyonu telefondan müşteriye bağla (aynı adisyonun ilk olayı kazanır).
  const orderEvents = (await tx.select({ tabId: TE.tabId, payload: TE.payload, at: TE.at })
    .from(TE)
    .where(and(eq(TE.tenantId, tenantId), eq(TE.type, "order"), gte(TE.at, since)))
    .orderBy(TE.seq)) as { tabId: string; payload: { phone?: string }; at: Date }[];
  const tabCustomer = new Map<string, string>();
  for (const e of orderEvents) {
    if (tabCustomer.has(e.tabId)) continue;
    const phone = normalizePhone(e.payload?.phone ?? "");
    const c = phone ? byPhone.get(phone) : undefined;
    if (c) tabCustomer.set(e.tabId, c.id);
  }

  const saleRows = (await tx.select({ tabId: S.tabId, total: sql<number>`(${S.total} - ${S.discount})::int`, at: S.createdAt })
    .from(S)
    .where(and(eq(S.tenantId, tenantId), eq(S.status, "kapandi"), isNull(S.refundOf), gte(S.createdAt, since)))) as { tabId: string | null; total: number; at: Date }[];

  const agg = new Map<string, { orders: number; spend: number; last: number; first: number }>();
  const ordersForCohort: { customerId: string; at: string }[] = [];
  for (const s of saleRows) {
    if (!s.tabId) continue;
    const cid = tabCustomer.get(s.tabId);
    if (!cid) continue;
    const a = agg.get(cid) ?? { orders: 0, spend: 0, last: 0, first: Infinity };
    a.orders++;
    a.spend += s.total;
    a.last = Math.max(a.last, s.at.getTime());
    a.first = Math.min(a.first, s.at.getTime());
    agg.set(cid, a);
    ordersForCohort.push({ customerId: cid, at: s.at.toISOString() });
  }

  const nameOf = new Map(customers.map((c) => [c.id, c]));
  const rows: RfmRow[] = [...agg.entries()].map(([customerId, a]) => {
    const c = nameOf.get(customerId);
    const scores = rfmScore(nowMs, new Date(a.last).toISOString(), a.orders, a.spend);
    return {
      customerId, name: c?.name ?? "—", phone: c?.phone ?? "", orders: a.orders, spend: a.spend,
      lastOrderAt: new Date(a.last).toISOString(), firstOrderAt: new Date(a.first).toISOString(),
      recencyDays: Math.max(0, Math.floor((nowMs - a.last) / 86_400_000)),
      r: scores.r, f: scores.f, m: scores.m, segment: SEGMENT_LABEL[rfmSegment(scores)],
    };
  }).sort((x, y) => y.spend - x.spend);

  const months = rfmMonths(nowMs);
  const sinceMonth = months[0];
  const cohorts = cohortGrid(ordersForCohort.filter((o) => o.at.slice(0, 7) >= sinceMonth), months);

  const t30 = new Date(nowMs - 30 * 86_400_000);
  const summary = {
    total: customers.length,
    active30: rows.filter((r) => new Date(r.lastOrderAt).getTime() >= t30.getTime()).length,
    new30: customers.filter((c) => c.createdAt >= t30).length,
    spend30: saleRows.filter((s) => s.at >= t30 && s.tabId && tabCustomer.has(s.tabId)).reduce((a, s) => a + s.total, 0),
  };
  return { summary, rows: rows.slice(0, 500), cohorts };
}
