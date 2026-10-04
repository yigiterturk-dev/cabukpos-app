// lib/billing/paytr.ts — PayTR iFrame API. Anahtarlar env'de (PAYTR_MERCHANT_ID/KEY/SALT); BILLING_PROVIDER=paytr ile açılır.
// Akış: get-token → /yonetim/abonelik/odeme/<id> iframe → PayTR "Bildirim URL"sine (/api/billing/paytr) POST → completePayment.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { BillingProvider, CheckoutInput } from "./provider";

export type PaytrKeys = { merchantId: string; key: string; salt: string; testMode: boolean };

export function paytrKeys(): PaytrKeys | null {
  const { PAYTR_MERCHANT_ID: merchantId, PAYTR_MERCHANT_KEY: key, PAYTR_MERCHANT_SALT: salt } = process.env;
  if (!merchantId || !key || !salt) return null;
  return { merchantId, key, salt, testMode: process.env.PAYTR_TEST_MODE === "1" };
}

const hmac = (key: string, s: string) => createHmac("sha256", key).update(s).digest("base64");

/** merchant_oid yalnız harf/rakam kabul eder → uuid'nin tiresiz hâli. */
export const oidOf = (paymentId: string) => paymentId.replace(/-/g, "");
export function paymentIdOf(oid: string): string | null {
  if (!/^[0-9a-f]{32}$/i.test(oid)) return null;
  return `${oid.slice(0, 8)}-${oid.slice(8, 12)}-${oid.slice(12, 16)}-${oid.slice(16, 20)}-${oid.slice(20)}`;
}

/** get-token isteğinin alanları (paytr_token dahil). amount kuruş = PayTR payment_amount (TL × 100). */
export function tokenFields(k: PaytrKeys, p: CheckoutInput, appUrl: string): Record<string, string> {
  const f = {
    merchant_id: k.merchantId,
    user_ip: p.userIp,
    merchant_oid: oidOf(p.paymentId),
    email: p.email,
    payment_amount: String(p.amount),
    user_basket: Buffer.from(JSON.stringify([[`ÇabukPOS ${p.period === "yillik" ? "yıllık" : "aylık"} abonelik`, (p.amount / 100).toFixed(2), 1]])).toString("base64"),
    no_installment: "1",
    max_installment: "0",
    currency: "TL",
    test_mode: k.testMode ? "1" : "0",
  };
  const hashStr = f.merchant_id + f.user_ip + f.merchant_oid + f.email + f.payment_amount + f.user_basket + f.no_installment + f.max_installment + f.currency + f.test_mode;
  return {
    ...f,
    paytr_token: hmac(k.key, hashStr + k.salt),
    user_name: p.tenantName.slice(0, 60),
    user_address: (p.address || "Türkiye").slice(0, 400),
    user_phone: (p.phone || "").slice(0, 20),
    merchant_ok_url: `${appUrl}/yonetim/abonelik?sonuc=isleniyor`,
    merchant_fail_url: `${appUrl}/yonetim/abonelik?sonuc=hata`,
    timeout_limit: "30",
    debug_on: k.testMode ? "1" : "0",
    lang: "tr",
  };
}

/** Bildirim imzası: base64(hmac(merchant_oid + salt + status + total_amount, key)). */
export function callbackValid(k: PaytrKeys, b: { merchant_oid: string; status: string; total_amount: string; hash: string }): boolean {
  const want = Buffer.from(hmac(k.key, b.merchant_oid + k.salt + b.status + b.total_amount));
  const got = Buffer.from(b.hash ?? "");
  return want.length === got.length && timingSafeEqual(want, got);
}

/**
 * #11: saklanan kart jetonuyla doğrudan çekim (PayTR Direct API / kart saklama).
 * ⚠️ Uç/env canlı PayTR hesabında doğrulanacak (insan işi); anahtar eksikse None döner ve yenileme atlanır.
 */
export async function paytrChargeStored(k: PaytrKeys, cardToken: string, amount: number, paymentId: string): Promise<{ ok: boolean; error?: string }> {
  const base = (process.env.PAYTR_DIRECT_URL ?? "https://www.paytr.com/odeme/api/odeme").replace(/\/$/, "");
  const f = {
    merchant_id: k.merchantId,
    payment_amount: String(amount),
    merchant_oid: oidOf(paymentId),
    card_token: cardToken,
    test_mode: k.testMode ? "1" : "0",
  };
  const hashStr = f.merchant_id + f.merchant_oid + f.payment_amount + f.card_token + f.test_mode;
  const res = await fetch(base, { method: "POST", body: new URLSearchParams({ ...f, paytr_token: hmac(k.key, hashStr + k.salt) }) });
  const j = (await res.json().catch(() => null)) as { status?: string; reason?: string; err_msg?: string } | null;
  if (j?.status === "success") return { ok: true };
  return { ok: false, error: j?.err_msg ?? j?.reason ?? `HTTP ${res.status}` };
}

export function paytrBilling(k: PaytrKeys): BillingProvider {
  return {
    name: "paytr",
    test: k.testMode,
    async start(p) {
      const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
      const res = await fetch("https://www.paytr.com/odeme/api/get-token", { method: "POST", body: new URLSearchParams(tokenFields(k, p, appUrl)) });
      const j = (await res.json().catch(() => null)) as { status?: string; token?: string; reason?: string } | null;
      if (j?.status !== "success" || !j.token) throw new Error(`PayTR token: ${j?.reason ?? res.status}`);
      return { redirectUrl: `/yonetim/abonelik/odeme/${p.paymentId}?t=${encodeURIComponent(j.token)}` };
    },
    chargeStored: (cardToken, amount, paymentId) => paytrChargeStored(k, cardToken, amount, paymentId),
  };
}
