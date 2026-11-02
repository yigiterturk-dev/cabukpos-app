// lib/courier/hooks.ts — Adisyon olayından dış kurye sevkini tetikler.
// YNR yapılandırılmamışsa tek satır çalışmaz (mevcut kuryesiz kullanım bozulmaz).
// Olaylar YNR'de (provider, accountId, externalOrderId) ile tekilleştiği için tekrar gönderim zararsızdır.
import type { TabEv } from "@/lib/core/tab";
import { cancelWithCourier, dispatchToCourier } from "./send";
import { ynrConfig } from "./ynr";

/** Kurye sevkini etkileyen olaylar: mutfak "hazır" sinyali ve sipariş iptali. */
export const courierEventRelevant = (ev: TabEv) => (ev.type === "kitchen" && ev.status === "hazir") || ev.type === "cancel";

export async function onCourierEvent(tenantId: string, tabId: string, ev: TabEv): Promise<void> {
  if (!ynrConfig()) return;
  // Mutfak hazır sinyali: biletlerin tamamı hazırsa dispatchReady=true, değilse sipariş "mağaza hazırlıyor" olarak açılır.
  const result = ev.type === "cancel" ? await cancelWithCourier(tenantId, tabId, "system") : await dispatchToCourier(tenantId, tabId, "system");
  // 400 = bu adisyon kuryeye uygun değil (masa/platform/eksik alan); sessiz geç.
  if (!result.ok && result.status !== 400) console.error("kurye sevki başarısız", { tabId, error: result.error, status: result.status });
}
