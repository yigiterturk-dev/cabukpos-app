// lib/billing/service.ts — Abonelik DB işlemleri (tenants + billing_payments; ikisi de RLS'siz).
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { extendFrom, type BillingPeriod } from "@/lib/core/billing";

const T = schema.tenants, P = schema.billingPayments;

export async function tenantBilling(tenantId: string) {
  const [t] = await getDb().select({ trialEndsAt: T.trialEndsAt, paidUntil: T.paidUntil, address: T.address }).from(T).where(eq(T.id, tenantId));
  return t ?? null;
}

export async function createPayment(tenantId: string, provider: string, period: BillingPeriod, amount: number) {
  const [p] = await getDb().insert(P).values({ tenantId, provider, period, amount }).returning();
  return p;
}

export async function paymentOf(tenantId: string, id: string) {
  const [p] = await getDb().select().from(P).where(and(eq(P.id, id), eq(P.tenantId, tenantId)));
  return p ?? null;
}

export const paymentsOf = (tenantId: string) => getDb().select().from(P).where(eq(P.tenantId, tenantId)).orderBy(desc(P.createdAt)).limit(20);

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
    return "odendi";
  });
}
