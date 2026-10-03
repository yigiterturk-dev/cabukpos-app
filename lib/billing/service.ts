// lib/billing/service.ts — Abonelik DB işlemleri (tenants + billing_payments; ikisi de RLS'siz).
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema, withTenant } from "@/db";
import { extendFrom, type BillingPeriod, type UnitCounts } from "@/lib/core/billing";
import { openSubscriptionInvoice } from "./invoice";

const T = schema.tenants, P = schema.billingPayments, S = schema.stores, D = schema.devices, I = schema.billingInvoices;

export async function tenantBilling(tenantId: string) {
  const [t] = await getDb().select({ trialEndsAt: T.trialEndsAt, paidUntil: T.paidUntil, address: T.address }).from(T).where(eq(T.id, tenantId));
  return t ?? null;
}

/** Kiracının şube ve aktif (iptal edilmemiş) terminal sayısı — fiyatlandırma fotoğrafı için. */
export async function tenantUnits(tenantId: string): Promise<UnitCounts> {
  return withTenant(tenantId, async (tx) => {
    const [[s], [d]] = await Promise.all([
      tx.select({ n: count() }).from(S),
      tx.select({ n: count() }).from(D).where(and(eq(D.tenantId, tenantId), isNull(D.revokedAt))), // devices RLS'siz kimlik tablosu → filtre zorunlu
    ]);
    return { stores: s.n, devices: d.n };
  });
}

export async function createPayment(tenantId: string, provider: string, period: BillingPeriod, amount: number, units: UnitCounts = { stores: 0, devices: 0 }) {
  const [p] = await getDb().insert(P).values({ tenantId, provider, period, amount, stores: units.stores, devices: units.devices }).returning();
  return p;
}

export async function paymentOf(tenantId: string, id: string) {
  const [p] = await getDb().select().from(P).where(and(eq(P.id, id), eq(P.tenantId, tenantId)));
  return p ?? null;
}

export const paymentsOf = (tenantId: string) =>
  getDb().select({ p: P, invoice: { token: I.token, status: I.status } }).from(P)
    .leftJoin(I, eq(I.paymentId, P.id)).where(eq(P.tenantId, tenantId)).orderBy(desc(P.createdAt)).limit(20);

/** Sağlayıcı sonucu. Satır kilidiyle idempotent: yalnız bekleyen ödeme işlenir; başarılıysa dönem uzar. */
export async function completePayment(id: string, ok: boolean, providerRef: string, now = new Date()): Promise<"odendi" | "basarisiz" | "zaten"> {
  return getDb().transaction(async (tx) => {
    const [p] = await tx.select().from(P).where(eq(P.id, id)).for("update");
    if (!p || p.status !== "bekliyor") return "zaten";
    if (!ok) {
      await tx.update(P).set({ status: "basarisiz", providerRef }).where(eq(P.id, id));
      return "basarisiz";
    }
    const [t] = await tx.select({ trialEndsAt: T.trialEndsAt, paidUntil: T.paidUntil }).from(T).where(eq(T.id, p.tenantId)).for("update");
    const until = extendFrom(t, p.period as BillingPeriod, now);
    await tx.update(T).set({ paidUntil: until }).where(eq(T.id, p.tenantId));
    await tx.update(P).set({ status: "odendi", providerRef, paidAt: now, periodEnd: until }).where(eq(P.id, id));
    await openSubscriptionInvoice(tx, p.tenantId, p.id); // #14: SaaS abonelik e-Arşiv faturası (bekleyen; cron keser)
    return "odendi";
  });
}

// — #15: İptal/iade. İptal: abonelik otomatik yenilenmediğinden işlem gerekmez (yasal/iade-iptal). İade: talep → onay; para hareketi sağlayıcıya (PayTR canlı anahtar) ya da elle işlenir, burada kayıt tutulur. —

export const REFUND_REASONS = ["hatali", "satissiz", "diger"] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];

/** Ödemeden bugüne kadarki satış sayısı — 7 gün + satışsız dönem koşulu için. */
export const salesSincePayment = (tenantId: string, paidAt: Date) =>
  withTenant(tenantId, async (tx) => {
    const [r] = await tx.select({ n: count() }).from(schema.sales).where(sql`${schema.sales.createdAt} >= ${paidAt.toISOString()}`);
    return r.n;
  });

/** Yalnız ödenmiş çekime talep açar; idempotent (zaten talepli/iadeli ise dokunmaz). */
export async function requestRefund(id: string, reason: RefundReason, note: string | null): Promise<boolean> {
  const [p] = await getDb().update(P).set({ status: "iade_talep", refundRequestedAt: new Date(), refundReason: reason, refundNote: note })
    .where(and(eq(P.id, id), eq(P.status, "odendi"))).returning({ id: P.id });
  return Boolean(p);
}

/** Talep sahibi vazgeçer: ödendi'ye döner, iade alanları temizlenir. */
export async function withdrawRefund(id: string): Promise<boolean> {
  const [p] = await getDb().update(P).set({ status: "odendi", refundRequestedAt: null, refundReason: null, refundNote: null })
    .where(and(eq(P.id, id), eq(P.status, "iade_talep"))).returning({ id: P.id });
  return Boolean(p);
}

/** Onay: iade işlendi (sağlayıcı ya da elle). Kayıt kalıcı; iade edilen dönem kısaltılmaz. */
export async function completeRefund(id: string, providerRef?: string | null, now = new Date()): Promise<boolean> {
  const [p] = await getDb().update(P).set({ status: "iade", refundedAt: now, providerRef: providerRef ?? undefined })
    .where(and(eq(P.id, id), eq(P.status, "iade_talep"))).returning({ id: P.id });
  return Boolean(p);
}
