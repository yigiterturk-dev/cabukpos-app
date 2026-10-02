// lib/core/billing.ts — Abonelik durumu (saf). Bitiş = max(deneme sonu, ödenen dönem sonu);
// sonra 7 gün ek süre, sonra kilit (yalnız yönetim yazması; kasa hiç kilitlenmez).
export const DAY = 86400_000;
export const TRIAL_DAYS = 14, GRACE_DAYS = 7, WARN_DAYS = 7;

export type BillingPeriod = "aylik" | "yillik";
export const PERIODS: { key: BillingPeriod; label: string }[] = [{ key: "aylik", label: "Aylık" }, { key: "yillik", label: "Yıllık" }];
export type BillingState = "deneme" | "aktif" | "ek_sure" | "kilitli";
export const STATE_LABEL: Record<BillingState, string> = { deneme: "Deneme", aktif: "Aktif", ek_sure: "Ek süre", kilitli: "Kilitli" };
export type BillingDates = { trialEndsAt: Date; paidUntil: Date | null };
export type BillingInfo = { state: BillingState; endsAt: Date; lockAt: Date; daysLeft: number; warn: boolean; locked: boolean };

export const endOf = (t: BillingDates) => (t.paidUntil && t.paidUntil > t.trialEndsAt ? t.paidUntil : t.trialEndsAt);

export function billingInfo(t: BillingDates, now = new Date()): BillingInfo {
  const endsAt = endOf(t), lockAt = new Date(endsAt.getTime() + GRACE_DAYS * DAY), n = now.getTime();
  const state: BillingState = n < endsAt.getTime() ? (t.paidUntil && t.paidUntil.getTime() > n ? "aktif" : "deneme") : n < lockAt.getTime() ? "ek_sure" : "kilitli";
  const daysLeft = Math.max(0, Math.ceil(((state === "deneme" || state === "aktif" ? endsAt : lockAt).getTime() - n) / DAY));
  const running = state === "deneme" || state === "aktif";
  return { state, endsAt, lockAt, daysLeft, warn: running ? daysLeft <= WARN_DAYS : true, locked: state === "kilitli" };
}

/** Ödenen dönemin sonu: max(şimdi, mevcut bitiş) + 1 ay / 1 yıl. */
export function extendFrom(t: BillingDates, period: BillingPeriod, now = new Date()): Date {
  const d = new Date(Math.max(now.getTime(), endOf(t).getTime()));
  if (period === "aylik") d.setUTCMonth(d.getUTCMonth() + 1);
  else d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d;
}

/** Günlük hatırlatma: bitişe 1-7 gün kala, aynı bitiş için bir kez. */
export function reminderDue(t: BillingDates & { remindedEnd: Date | null }, now = new Date()): boolean {
  const i = billingInfo(t, now);
  return (i.state === "deneme" || i.state === "aktif") && i.daysLeft >= 1 && i.daysLeft <= WARN_DAYS && t.remindedEnd?.getTime() !== i.endsAt.getTime();
}

export function bannerText(i: BillingInfo): string {
  if (i.state === "kilitli") return "Aboneliğin sona erdi; yönetim salt okunur. Kasa satışa devam ediyor.";
  if (i.state === "ek_sure") return `Aboneliğin sona erdi. ${i.daysLeft} gün içinde ödeme yapılmazsa yönetim salt okunur olur.`;
  return `${i.state === "deneme" ? "Deneme süren" : "Aboneliğin"} ${i.daysLeft} gün sonra bitiyor.`;
}
