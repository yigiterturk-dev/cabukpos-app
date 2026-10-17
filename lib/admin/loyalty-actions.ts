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
  return Number.isSafeInteger(n) ? n : NaN;
};
const optionalDate = (form: FormData, key: string) => {
  const v = text(form, key);
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

// — Sadakat puanı —

export type LoyaltyFormState = { error?: string; field?: string };
export async function saveLoyaltySettings(_: LoyaltyFormState, form: FormData): Promise<LoyaltyFormState> {
  const a = await requireWriter();
  const enabled = text(form, "enabled") === "on";
  const kurusPerPoint = money(form, "kurusPerPoint");
  const kurusPerRedeem = money(form, "kurusPerRedeem");
  const minRedeemPoints = int(form, "minRedeemPoints");
  if (!Number.isSafeInteger(kurusPerPoint) || kurusPerPoint < 100 || kurusPerPoint > 100_000_00) return { error: "1 puan için gereken harcama 1,00–100.000,00 arasında olmalı.", field: "kurusPerPoint" };
  if (!Number.isSafeInteger(kurusPerRedeem) || kurusPerRedeem < 1 || kurusPerRedeem > 100_000_00) return { error: "Puan indirimi 0,01–100.000,00 arasında olmalı.", field: "kurusPerRedeem" };
  if (!Number.isSafeInteger(minRedeemPoints) || minRedeemPoints < 0 || minRedeemPoints > 1_000_000) return { error: "En az harcanabilir puan 0–1.000.000 arasında tam sayı olmalı.", field: "minRedeemPoints" };
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

export async function adjustPoints(_: LoyaltyFormState, form: FormData): Promise<LoyaltyFormState> {
  const a = await requireWriter();
  const customerId = text(form, "customerId");
  const points = int(form, "points");
  const note = text(form, "note").slice(0, 200) || null;
  if (!customerId) return { error: "Müşteri seçilemedi; sayfayı yenileyip yeniden deneyin.", field: "points" };
  if (!Number.isSafeInteger(points) || points === 0 || Math.abs(points) > 100_000) return { error: "Puan düzeltmesi sıfırdan farklı, en fazla 100.000 mutlak değerli tam sayı olmalı.", field: "points" };
  const exists = await withTenant(a.tenantId, async (tx) => {
    const c = await tx.select({ id: schema.customers.id }).from(schema.customers).where(eq(schema.customers.id, customerId)).limit(1);
    if (!c.length) return false;
    await tx.insert(schema.loyaltyEvents).values({ tenantId: a.tenantId, customerId, kind: "duzeltme", points, note, actor: `user:${a.id}` });
    await audit(tx, a.tenantId, `user:${a.id}`, "loyalty.points.adjust", { customerId, points });
    return true;
  });
  if (!exists) return { error: "Müşteri bulunamadı; listeyi yenileyip yeniden deneyin.", field: "points" };
  revalidatePath("/yonetim/sadakat");
  redirect(`/yonetim/sadakat?ok=puan&id=${customerId}`);
}

// — Hediye kartı —

export type GiftCardState = { error?: string; field?: string };
export async function createGiftCard(_: GiftCardState, form: FormData): Promise<GiftCardState> {
  const a = await requireWriter();
  const initial = money(form, "initial");
  const rawCode = text(form, "code");
  const code = rawCode ? normalizeCouponCode(rawCode) : newGiftCardCode();
  const expiresAt = optionalDate(form, "expiresAt");
  const note = text(form, "note").slice(0, 200) || null;
  if (!code) return { error: "Kod 3–24 harf veya rakam olmalı.", field: "code" };
  if (!Number.isSafeInteger(initial) || initial < 100 || initial > 50_000_00) return { error: "Yüklenecek tutar 1,00–50.000,00 arasında olmalı.", field: "initial" };
  if (text(form, "expiresAt") && !expiresAt) return { error: "Son kullanma tarihi geçersiz.", field: "expiresAt" };
  await withTenant(a.tenantId, async (tx) => {
    await tx.insert(schema.giftCards).values({ tenantId: a.tenantId, code, initialKurus: initial, balanceKurus: initial, expiresAt, note, createdBy: a.id });
    await audit(tx, a.tenantId, `user:${a.id}`, "giftcard.created", { code, initialKurus: initial });
  });
  revalidatePath("/yonetim/hediyekarti");
  redirect("/yonetim/hediyekarti?ok=olusturuldu");
}

export async function giftCardLoad(_: GiftCardState, form: FormData): Promise<GiftCardState> {
  const a = await requireWriter();
  const cardId = text(form, "cardId");
  const amount = money(form, "amount");
  if (!cardId) return { error: "Hediye kartı seçilemedi; sayfayı yenileyip yeniden deneyin.", field: "amount" };
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 50_000_00) return { error: "Yüklenecek tutar 0,01–50.000,00 arasında olmalı.", field: "amount" };
  const error = await withTenant(a.tenantId, async (tx): Promise<string | null> => {
    const rows = await tx.select().from(schema.giftCards).where(and(eq(schema.giftCards.id, cardId), eq(schema.giftCards.status, "aktif"))).limit(1);
    if (!rows.length) return "Aktif hediye kartı bulunamadı; listeyi yenileyip yeniden deneyin.";
    await tx.update(schema.giftCards).set({ balanceKurus: sql`${schema.giftCards.balanceKurus} + ${amount}`, initialKurus: sql`${schema.giftCards.initialKurus} + ${amount}` }).where(eq(schema.giftCards.id, cardId));
    await tx.insert(schema.giftCardEvents).values({ tenantId: a.tenantId, cardId, kind: "yukleme", amountKurus: amount, actor: `user:${a.id}` });
    await audit(tx, a.tenantId, `user:${a.id}`, "giftcard.loaded", { cardId, amountKurus: amount });
    return null;
  });
  if (error) return { error, field: "amount" };
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

export type CouponCreateState = { error?: string; field?: string };
export async function createCoupon(_: CouponCreateState, form: FormData): Promise<CouponCreateState> {
  const a = await requireWriter();
  const code = text(form, "code") ? normalizeCouponCode(text(form, "code")) : null;
  const kindRaw = text(form, "kind");
  const kind = kindRaw === "yuzde" || kindRaw === "tutar" || kindRaw === "teslimat" ? kindRaw : null;
  const value = kind === "yuzde" ? Number(text(form, "value")) : kind === "tutar" ? money(form, "value") : kind === "teslimat" ? 0 : NaN;
  const minSubtotalRaw = text(form, "minSubtotal");
  const minSubtotal = minSubtotalRaw ? money(form, "minSubtotal") : 0;
  const maxDiscountRaw = kind === "yuzde" ? text(form, "maxDiscount") : "";
  const maxDiscount = maxDiscountRaw ? money(form, "maxDiscount") : null;
  const startsAt = optionalDate(form, "startsAt");
  const endsAt = optionalDate(form, "endsAt");
  const usageLimit = text(form, "usageLimit") ? int(form, "usageLimit") : null;
  const perCustomerLimitRaw = text(form, "perCustomerLimit");
  const perCustomerLimit = perCustomerLimitRaw ? int(form, "perCustomerLimit") : 1;
  const note = text(form, "note").slice(0, 200) || null;
  if (!code) return { error: "Kupon kodu geçersiz; 3–24 harf veya rakam girin.", field: "code" };
  if (!kind) return { error: "Kupon türünü seçin.", field: "kind" };
  if (kind === "yuzde" && (!Number.isInteger(value) || value < 1 || value > 100)) return { error: "İndirim yüzdesi 1–100 arasında tam sayı olmalı.", field: "value" };
  if (kind === "tutar" && (!Number.isFinite(value) || value < 100 || value > 50_000_00)) return { error: "Sabit indirim 1,00–50.000,00 arasında olmalı.", field: "value" };
  if (kind === "teslimat" && value !== 0) return { error: "Ücretsiz teslimat kuponunun değeri 0 olmalı.", field: "value" };
  if (!Number.isSafeInteger(minSubtotal) || minSubtotal < 0 || minSubtotal > 2_147_483_647) return { error: "Alt sınır geçersiz; sıfır veya daha büyük bir tutar girin.", field: "minSubtotal" };
  if (maxDiscount !== null && (!Number.isSafeInteger(maxDiscount) || maxDiscount <= 0 || maxDiscount > 2_147_483_647)) return { error: "Üst sınır pozitif ve geçerli bir tutar olmalı.", field: "maxDiscount" };
  if (usageLimit !== null && (!Number.isSafeInteger(usageLimit) || usageLimit < 1 || usageLimit > 2_147_483_647)) return { error: "Toplam kullanım limiti pozitif tam sayı olmalı.", field: "usageLimit" };
  if (!Number.isSafeInteger(perCustomerLimit) || perCustomerLimit < 1 || perCustomerLimit > 2_147_483_647) return { error: "Müşteri başına limit pozitif tam sayı olmalı.", field: "perCustomerLimit" };
  if (text(form, "startsAt") && !startsAt) return { error: "Başlangıç tarihi geçersiz.", field: "startsAt" };
  if (text(form, "endsAt") && !endsAt) return { error: "Bitiş tarihi geçersiz.", field: "endsAt" };
  if (startsAt && endsAt && endsAt < startsAt) return { error: "Bitiş tarihi başlangıç tarihinden önce olamaz.", field: "endsAt" };
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
  const q = text(form, "q").replace(/[%_]/g, "").slice(0, 40);
  const requestedPage = Number(text(form, "page"));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  if (!couponId || !["acik", "kapali"].includes(status)) redirect("/yonetim/kuponlar");
  await withTenant(a.tenantId, async (tx) => {
    await tx.update(schema.coupons).set({ status: status as "acik" | "kapali" }).where(eq(schema.coupons.id, couponId));
    await audit(tx, a.tenantId, `user:${a.id}`, "coupon.status", { couponId, status });
  });
  revalidatePath("/yonetim/kuponlar");
  redirect(`/yonetim/kuponlar?ok=durum&q=${encodeURIComponent(q)}&page=${page}`);
}
