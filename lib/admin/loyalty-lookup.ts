// #33: kasada sadakat/kupon/hediye kartı sorguları (cihaz yetkili, kiracı içi RLS). Salt okuma; yazım satış eşitlemesinde.
import { and, eq, sql } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { couponCheck, type CouponLike } from "@/lib/loyalty";
import { normalizePhone } from "@/lib/core/delivery";

export type CustomerLoyalty = { customerId: string; name: string; points: number; enabled: boolean; kurusPerPoint: number; kurusPerRedeem: number; minRedeemPoints: number };

/** Telefonla müşteri + puan bakiyesi + sadakat ayarları. Yoksa null. */
export async function customerLoyalty(tenantId: string, rawPhone: string): Promise<CustomerLoyalty | null> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return null;
  return withTenant(tenantId, async (tx) => {
    const [c] = await tx.select({ id: schema.customers.id, name: schema.customers.name }).from(schema.customers).where(eq(schema.customers.phone, phone)).limit(1);
    if (!c) return null;
    const [bal] = await tx.select({ total: sql<number>`coalesce(sum(${schema.loyaltyEvents.points}), 0)::int` }).from(schema.loyaltyEvents).where(eq(schema.loyaltyEvents.customerId, c.id));
    const [s] = await tx.select().from(schema.loyaltySettings).limit(1);
    return {
      customerId: c.id, name: c.name, points: Number(bal?.total ?? 0),
      enabled: Boolean(s?.enabled), kurusPerPoint: s?.kurusPerPoint ?? 10000, kurusPerRedeem: s?.kurusPerRedeem ?? 100, minRedeemPoints: s?.minRedeemPoints ?? 10,
    };
  });
}

/** Kupon kodu doğrula (kasadaki ön denetim; kesin karar satış eşitlemesinde yeniden verilir). */
export async function checkCoupon(tenantId: string, code: string, subtotal: number, customerId?: string | null): Promise<{ ok: true; discount: number } | { ok: false; reason: string }> {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx.select().from(schema.coupons).where(and(eq(schema.coupons.code, code), eq(schema.coupons.status, "acik"))).limit(1);
    if (!row) return { ok: false as const, reason: "Kupon bulunamadı." };
    const [used] = customerId
      ? await tx.select({ n: sql<number>`count(*)::int` }).from(schema.couponUses).where(and(eq(schema.couponUses.couponId, row.id), eq(schema.couponUses.customerId, customerId)))
      : [{ n: 0 }];
    const like: CouponLike = { kind: row.kind, value: row.value, minSubtotal: row.minSubtotal, maxDiscount: row.maxDiscount, startsAt: row.startsAt, endsAt: row.endsAt, usageLimit: row.usageLimit, perCustomerLimit: row.perCustomerLimit, usedCount: row.usedCount };
    const r = couponCheck(like, subtotal, new Date(), Number(used?.n ?? 0));
    return r.ok ? { ok: true as const, discount: r.discount } : { ok: false as const, reason: r.reason };
  });
}

/** Hediye kartı kalan bakiye. */
export async function giftCardBalance(tenantId: string, code: string): Promise<{ ok: true; balance: number } | { ok: false; reason: string }> {
  return withTenant(tenantId, async (tx) => {
    const [card] = await tx.select().from(schema.giftCards).where(and(eq(schema.giftCards.code, code), eq(schema.giftCards.status, "aktif"))).limit(1);
    if (!card) return { ok: false as const, reason: "Hediye kartı bulunamadı." };
    if (card.expiresAt && card.expiresAt.getTime() < Date.now()) return { ok: false as const, reason: "Hediye kartının süresi doldu." };
    return { ok: true as const, balance: card.balanceKurus };
  });
}
