// lib/billing/dunning.ts — Ödeme gecikmesi takibi (saf). Ek sürenin 1/3/5. günü ve kilit günü + haftalık hatırlatma.
// Depolama yok: hangi gün hangi aşama gönderileceği tarihlerden türetilir, tekilleştirme cron'da hit() ile yapılır.
import { DAY, GRACE_DAYS, type BillingInfo } from "@/lib/core/billing";

export type DunningStage = "gecikme1" | "gecikme3" | "gecikme5" | "kilit1" | "kilitHaftalik";

/** Bugün gönderilecek aşama; gönderilecek bir şey yoksa null. */
export function dunningStage(i: BillingInfo, now = new Date()): DunningStage | null {
  if (now.getTime() < i.endsAt.getTime()) return null;
  const gecikme = Math.floor((now.getTime() - i.endsAt.getTime()) / DAY);
  if (now.getTime() < i.lockAt.getTime()) {
    if (gecikme === 1) return "gecikme1";
    if (gecikme === 3) return "gecikme3";
    if (gecikme === 5) return "gecikme5";
    return null;
  }
  const kilitli = Math.floor((now.getTime() - i.lockAt.getTime()) / DAY);
  if (kilitli === 0) return "kilit1";
  if (kilitli > 0 && kilitli % 7 === 0) return "kilitHaftalik";
  return null;
}

/** Aşamanın e-posta içeriği (şablon yer tutucuları cron'da doldurulur). */
export function dunningIcerik(stage: DunningStage): { baslik: string; kisa: string; kalin: string } {
  const kalan = GRACE_DAYS;
  switch (stage) {
    case "gecikme1":
      return { baslik: "Abonelik ödemesi gecikti", kisa: "Abonelik ödemen bugün itibarıyla gecikti.", kalin: `${kalan} gün içinde ödeme yapılmazsa yönetim paneli salt okunur olur. Kasa satışa devam eder.` };
    case "gecikme3":
      return { baslik: "Ödeme hatırlatması: 4 gün kaldı", kisa: "Abonelik ödemen 3 gün gecikti.", kalin: `${kalan - 3} gün içinde ödeme yapılmazsa yönetim paneli salt okunur olur. Kasa satışa devam eder.` };
    case "gecikme5":
      return { baslik: "Son 2 gün: yönetim kilitlenecek", kisa: "Abonelik ödemen 5 gün gecikti.", kalin: "2 gün içinde ödeme yapılmazsa yönetim paneli salt okunur olur. Kasa satışa devam eder." };
    case "kilit1":
      return { baslik: "Yönetim paneli salt okunura geçti", kisa: "Ödeme alınmadığı için yönetim paneli salt okunur oldu.", kalin: "Kasa satışa devam ediyor. Yönetimi yeniden açmak için aboneliğini bugün yenile." };
    case "kilitHaftalik":
      return { baslik: "Haftalık hatırlatma: yönetim salt okunur", kisa: "Aboneliğin hâlâ yenilenmedi.", kalin: "Kasa satışa devam ediyor; raporlar, ürünler ve ayarlar için aboneliğini yenile." };
  }
}
