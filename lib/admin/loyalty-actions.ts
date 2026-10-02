"use server";
// #33: Sadakat puanı + hediye kartı + kupon yönetimi (satış anı harcaması ayrı iş; burada şema + panel).
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { schema, withTenant } from "@/db";
import { requireWriter } from "@/lib/auth/session";
import { parseTL } from "@/lib/core/money";
import { audit } from "@/lib/audit";
import { newGiftCardCode, normalizeCouponCode } from "@/lib/loyalty";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const money = (form: FormData, key: string) => parseTL(text(form, key)) ?? NaN;
const int = (form: FormData, key: string) => {
  const n = Number(text(form, key));
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
};
const optionalDate = (form: FormData, key: string) => {
  const v = text(form, key);
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

// — Sadakat puanı —

export async function saveLoyaltySettings(form: FormData) {
  const a = await requireWriter();
  const enabled = text(form, "enabled") === "on";
  const kurusPerPoint = money(form, "kurusPerPoint");
  const kurusPerRedeem = money(form, "kurusPerRedeem");
  const minRedeemPoints = int(form, "minRedeemPoints");
  if (!Number.isFinite(kurusPerPoint) || kurusPerPoint < 100 || kurusPerPoint > 100_000_00) redirect("/yonetim/sadakat?hata=ayar");
  if (!Number.isFinite(kurusPerRedeem) || kurusPerRedeem < 1 || kurusPerRedeem > 100_000_00) redirect("/yonetim/sadakat?hata=ayar");
  if (!Number.isFinite(minRedeemPoints) || minRedeemPoints < 0 || minRedeemPoints > 1_000_000) redirect("/yonetim/sadakat?hata=ayar");
  await withTenant(a.tenantId, async (tx) => {
    await tx
      .insert(schema.loyaltySettings)
      .values({ tenantId: a.tenantId, enabled, kurusPerPoint, kurusPerRedeem, minRedeemPoints, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: schema.loyaltySettings.tenantId,
        set: { enabled, kurusPerPoint, kurusPerRedeem, minRedeemPoints, updatedAt: new Date() },
      });
    await audit(tx, a.tenantId, `user:${a.id}`, "loyalty.settings", { enabled, kurusPerPoint, kurusPerRedeem, minRedeemPoints });
  });
  revalidatePath("/yonetim/sadakat");
  redirect("/yonetim/sadakat?ok=ayar");
}

export async function adjustPoints(form: FormData) {
  const a = await requireWriter();
  const customerId = text(form, "customerId");
  const points = int(form, "points");
  const note = text(form, "note").slice(0, 200) || null;
  if (!customerId || !Number.isFinite(points) || points === 0 || Math.abs(points) > 100_000) redirect("/yonetim/sadakat?hata=puan");
  await withTenant(a.tenantId, async (tx) => {
    const c = await tx.select({ id: schema.customers.id }).from(schema.customers).where(eq(schema.customers.id, customerId)).limit(1);
    if (!c.length) redirect("/yonetim/sadakat?hata=puan");
    await tx.insert(schema.loyaltyEvents).values({ tenantId: a.tenantId, customerId, kind: "duzeltme", points, note, actor: `user:${a.id}` });
    await audit(tx, a.tenantId, `user:${a.id}`, "loyalty.points.adjust", { customerId, points });
  });
  revalidatePath("/yonetim/sadakat");
  redirect(`/yonetim/sadakat?ok=puan&id=${customerId}`);
}

// — Hediye kartı —

export async function createGiftCard(form: FormData) {
  const a = await requireWriter();
  const initial = money(form, "initial");
  const code = text(form, "code") ? normalizeCouponCode(text(form, "code")) : newGiftCardCode();
  const expiresAt = optionalDate(form, "expiresAt");
  const note = text(form, "note").slice(0, 200) || null;
  if (!code || !Number.isFinite(initial) || initial < 100 || initial > 50_000_00) redirect("/yonetim/hediyekarti?hata=eksik");
  await withTenant(a.tenantId, async (tx) => {
    await tx.insert(schema.giftCards).values({ tenantId: a.tenantId, code, initialKurus: initial, balanceKurus: initial, expiresAt, note, createdBy: a.id });
    await audit(tx, a.tenantId, `user:${a.id}`, "giftcard.created", { code, initialKurus: initial });
  });
  revalidatePath("/yonetim/hediyekarti");
  redirect("/yonetim/hediyekarti?ok=olusturuldu");
}

export async function giftCardLoad(form: FormData) {
  const a = await requireWriter();
  const cardId = text(form, "cardId");
  const amount = money(form, "amount");
  if (!cardId || !Number.isFinite(amount) || amount <= 0 || amount > 50_000_00) redirect("/yonetim/hediyekarti?hata=eksik");
  await withTenant(a.tenantId, async (tx) => {
    const rows = await tx.select().from(schema.giftCards).where(and(eq(schema.giftCards.id, cardId), eq(schema.giftCards.status, "aktif"))).limit(1);
    if (!rows.length) redirect("/yonetim/hediyekarti?hata=eksik");
    await tx.update(schema.giftCards).set({ balanceKurus: sql`${schema.giftCards.balanceKurus} + ${amount}`, initialKurus: sql`${schema.giftCards.initialKurus} + ${amount}` }).where(eq(schema.giftCards.id, cardId));
    await tx.insert(schema.giftCardEvents).values({ tenantId: a.tenantId, cardId, kind: "yukleme", amountKurus: amount, actor: `user:${a.id}` });
    await audit(tx, a.tenantId, `user:${a.id}`, "giftcard.loaded", { cardId, amountKurus: amount });
  });
  revalidatePath("/yonetim/hediyekarti");
  redirect(`/yonetim/hediyekarti?ok=yukleme&id=${cardId}`);
}

export async function giftCardCancel(form: FormData) {
  const a = await requireWriter();
  const cardId = text(form, "cardId");
  if (!cardId) redirect("/yonetim/hediyekarti");
  await withTenant(a.tenantId, async (tx) => {
    const rows = await tx.select().from(schema.giftCards).where(and(eq(schema.giftCards.id, cardId), eq(schema.giftCards.status, "aktif"))).limit(1);
    if (!rows.length) redirect("/yonetim/hediyekarti?hata=eksik");
    await tx.update(schema.giftCards).set({ status: "iptal" }).where(eq(schema.giftCards.id, cardId));
    await tx.insert(schema.giftCardEvents).values({ tenantId: a.tenantId, cardId, kind: "iptal", amountKurus: 0, note: "kalan bakiye donduruldu", actor: `user:${a.id}` });
    await audit(tx, a.tenantId, `user:${a.id}`, "giftcard.cancelled", { cardId, balanceKurus: rows[0].balanceKurus });
  });
  revalidatePath("/yonetim/hediyekarti");
  redirect(`/yonetim/hediyekarti?ok=iptal&id=${cardId}`);
}

// — Kupon —

export async function createCoupon(form: FormData) {
  const a = await requireWriter();
  const code = text(form, "code") ? normalizeCouponCode(text(form, "code")) : null;
  const kindRaw = text(form, "kind");
  const kind = kindRaw === "yuzde" || kindRaw === "tutar" || kindRaw === "teslimat" ? kindRaw : null;
  const value = int(form, "value");
  const minSubtotal = money(form, "minSubtotal") || 0;
  const maxDiscount = text(form, "maxDiscount") ? money(form, "maxDiscount") : null;
  const startsAt = optionalDate(form, "startsAt");
  const endsAt = optionalDate(form, "endsAt");
  const usageLimit = text(form, "usageLimit") ? int(form, "usageLimit") : null;
  const perCustomerLimit = Math.max(1, int(form, "perCustomerLimit") || 1);
  const note = text(form, "note").slice(0, 200) || null;
  if (!code || !kind) redirect("/yonetim/kuponlar?hata=eksik");
  if (kind === "yuzde" && (!Number.isFinite(value) || value < 1 || value > 100)) redirect("/yonetim/kuponlar?hata=eksik");
  if (kind === "tutar" && (!Number.isFinite(value) || value < 100 || value > 50_000_00)) redirect("/yonetim/kuponlar?hata=eksik");
  if (kind === "teslimat" && value !== 0) redirect("/yonetim/kuponlar?hata=eksik");
  if (maxDiscount !== null && (!Number.isFinite(maxDiscount) || maxDiscount <= 0)) redirect("/yonetim/kuponlar?hata=eksik");
  if (usageLimit !== null && (!Number.isFinite(usageLimit) || usageLimit < 1)) redirect("/yonetim/kuponlar?hata=eksik");
  if (startsAt && endsAt && endsAt < startsAt) redirect("/yonetim/kuponlar?hata=eksik");
  await withTenant(a.tenantId, async (tx) => {
    await tx.insert(schema.coupons).values({ tenantId: a.tenantId, code, kind, value: kind === "teslimat" ? 0 : value, minSubtotal, maxDiscount: kind === "yuzde" ? maxDiscount : null, startsAt, endsAt, usageLimit, perCustomerLimit, note, createdBy: a.id });
    await audit(tx, a.tenantId, `user:${a.id}`, "coupon.created", { code, kind, value });
  });
  revalidatePath("/yonetim/kuponlar");
  redirect("/yonetim/kuponlar?ok=olusturuldu");
}

export async function setCouponStatus(form: FormData) {
  const a = await requireWriter();
  const couponId = text(form, "couponId");
  const status = text(form, "status");
  if (!couponId || !["acik", "kapali"].includes(status)) redirect("/yonetim/kuponlar");
  await withTenant(a.tenantId, async (tx) => {
    await tx.update(schema.coupons).set({ status: status as "acik" | "kapali" }).where(eq(schema.coupons.id, couponId));
    await audit(tx, a.tenantId, `user:${a.id}`, "coupon.status", { couponId, status });
  });
  revalidatePath("/yonetim/kuponlar");
  redirect("/yonetim/kuponlar?ok=durum");
}
