"use server";
// Abonelik server action'ları. Kilitliyken de çalışır (requireAdmin): ödeme kilidi açan tek yol.
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import type { BillingPeriod } from "@/lib/core/billing";
import { planPrice } from "./plans";
import { getBillingProvider } from "./provider";
import { completePayment, createPayment, paymentOf } from "./service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function startCheckout(form: FormData) {
  const a = await requireAdmin();
  const period: BillingPeriod = form.get("period") === "yillik" ? "yillik" : "aylik";
  const provider = getBillingProvider(), amount = planPrice(period);
  if (!provider || !amount) redirect("/yonetim/abonelik?sonuc=hata");
  const p = await createPayment(a.tenantId, provider.name, period, amount);
  const { redirectUrl } = await provider.start({ paymentId: p.id, amount, period, tenantName: a.tenantName, email: a.email });
  redirect(redirectUrl);
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
