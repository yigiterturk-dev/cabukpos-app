"use server";
// Abonelik server action'ları. Kilitliyken de çalışır (requireAdmin): ödeme kilidi açan tek yol.
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import type { BillingPeriod } from "@/lib/core/billing";
import { planPrice } from "./plans";
import { getBillingProvider } from "./provider";
import { completePayment, createPayment, paymentOf, tenantBilling } from "./service";
import { clientIp } from "@/lib/ratelimit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function startCheckout(form: FormData) {
  const a = await requireAdmin();
  const period: BillingPeriod = form.get("period") === "yillik" ? "yillik" : "aylik";
  const provider = getBillingProvider(), amount = planPrice(period);
  const phone = String(form.get("phone") ?? "").replace(/[^\d+]/g, "");
  if (!provider || !amount) redirect("/yonetim/abonelik?sonuc=hata");
  if (provider.name === "paytr" && phone.length < 10) redirect("/yonetim/abonelik?sonuc=telefon");
  const p = await createPayment(a.tenantId, provider.name, period, amount);
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
