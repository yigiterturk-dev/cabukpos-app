"use server";
// Abonelik server action'ları. Kilitliyken de çalışır (requireAdmin): ödeme kilidi açan tek yol.
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import type { BillingPeriod } from "@/lib/core/billing";
import { planPriceFor } from "./plans";
import { getBillingProvider } from "./provider";
import { completePayment, REFUND_REASONS, completeRefund, createPayment, paymentOf, requestRefund, tenantBilling, tenantUnits, withdrawRefund, type RefundReason } from "./service";
import { clientIp } from "@/lib/ratelimit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function startCheckout(form: FormData) {
  const a = await requireAdmin();
  const period: BillingPeriod = form.get("period") === "yillik" ? "yillik" : "aylik";
  const provider = getBillingProvider(), units = await tenantUnits(a.tenantId), amount = planPriceFor(period, units);
  const phone = String(form.get("phone") ?? "").replace(/[^\d+]/g, "");
  if (!provider || !amount) redirect("/yonetim/abonelik?sonuc=hata");
  if (provider.name === "paytr" && phone.length < 10) redirect("/yonetim/abonelik?sonuc=telefon");
  const p = await createPayment(a.tenantId, provider.name, period, amount, units);
  const t = await tenantBilling(a.tenantId);
  let url: string;
  try {
    ({ redirectUrl: url } = await provider.start({ paymentId: p.id, amount, period, tenantName: a.tenantName, email: a.email, userIp: await clientIp(), phone, address: t?.address }));
  } catch (e) {
    console.error("[billing] start", e);
    await completePayment(p.id, false, "start-hata");
    redirect("/yonetim/abonelik?sonuc=hata");
  }
  redirect(url);
}

/** Yalnız sahte sağlayıcı: test ödeme sayfasının sonucu. */
export async function fakeResult(form: FormData) {
  const a = await requireAdmin();
  const id = String(form.get("id") ?? "");
  if (getBillingProvider()?.name !== "fake" || !UUID.test(id)) redirect("/yonetim/abonelik?sonuc=hata");
  const p = await paymentOf(a.tenantId, id);
  if (!p || p.provider !== "fake") redirect("/yonetim/abonelik?sonuc=hata");
  const r = await completePayment(p.id, form.get("ok") === "1", `fake-${p.id}`);
  redirect(`/yonetim/abonelik?sonuc=${r === "odendi" ? "ok" : "hata"}`);
}

// — #15: İptal/iade. İade: talep → (sahip) onay. Onayda para hareketi sağlayıcıya bağlıdır; kayıt anında işaretlenir. —

const refundReason = (v: FormDataEntryValue | null): RefundReason | null => {
  const s = String(v ?? "");
  return (REFUND_REASONS as readonly string[]).includes(s) ? (s as RefundReason) : null;
};

export async function requestRefundAction(form: FormData) {
  const a = await requireAdmin();
  const id = String(form.get("id") ?? "");
  const reason = refundReason(form.get("reason"));
  const note = String(form.get("note") ?? "").trim().slice(0, 300) || null;
  if (!UUID.test(id) || !reason) redirect("/yonetim/abonelik?iade=hata");
  const p = await paymentOf(a.tenantId, id);
  if (!p || p.status !== "odendi") redirect("/yonetim/abonelik?iade=hata");
  await requestRefund(id, reason, note);
  redirect("/yonetim/abonelik?iade=talep");
}

export async function withdrawRefundAction(form: FormData) {
  const a = await requireAdmin();
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id) || !(await paymentOf(a.tenantId, id))) redirect("/yonetim/abonelik?iade=hata");
  await withdrawRefund(id);
  redirect("/yonetim/abonelik?iade=ceklildi");
}

export async function approveRefundAction(form: FormData) {
  const a = await requireAdmin();
  const id = String(form.get("id") ?? "");
  const note = String(form.get("note") ?? "").trim().slice(0, 300) || null;
  if (a.role !== "sahip" || !UUID.test(id)) redirect("/yonetim/abonelik?iade=hata");
  const p = await paymentOf(a.tenantId, id);
  if (!p || p.status !== "iade_talep") redirect("/yonetim/abonelik?iade=hata");
  await completeRefund(id, null);
  if (note) await getDb().update(schema.billingPayments).set({ refundNote: note }).where(eq(schema.billingPayments.id, id));
  redirect("/yonetim/abonelik?iade=onaylandi");
}
