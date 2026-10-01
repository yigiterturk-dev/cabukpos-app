import type { buildFeaturePack } from "@/lib/growth/feature-pack";

export type GrowthFeaturePack = ReturnType<typeof buildFeaturePack>;
export type GrowthInsight = {
  key: string;
  kind: "opportunity" | "observation" | "warning";
  title: string;
  body: string;
  confidence: "observed" | "insufficient_data";
  evidence: Record<string, number>;
};

/** Laya yokken çalışan, tahmin/vaat üretmeyen kanıtlı taban danışman. */
export function baselineAdvisor(pack: GrowthFeaturePack): GrowthInsight[] {
  const out: GrowthInsight[] = [];
  const { customer, package90, campaigns } = pack;
  if (customer.consentedDormant30 > 0) {
    out.push({ key: "dormant-consented", kind: "opportunity", title: "Geri kazanım segmenti hazır", body: `İletişim izinli ${customer.consentedDormant30} müşteri 30 gündür sipariş vermemiş; tenant içinde geri kazanım segmenti oluşturulabilir.`, confidence: "observed", evidence: { dormant30: customer.dormant30, consentedDormant30: customer.consentedDormant30 } });
  }
  if (package90.orders > 0) {
    out.push({ key: "package-baseline", kind: "observation", title: "Paket satış referansı oluştu", body: `Son 90 günde ${package90.orders} paket siparişi ve ${(package90.gross / 100).toLocaleString("tr-TR")} TL brüt ciro gözlendi.`, confidence: "observed", evidence: { orders90: package90.orders, gross90: package90.gross, avgBasket90: package90.avgBasket } });
  } else {
    out.push({ key: "package-insufficient", kind: "warning", title: "Paket verisi yetersiz", body: "Son 90 günde referans paket siparişi yok; sepet veya dönüşüm tahmini üretilmiyor.", confidence: "insufficient_data", evidence: { orders90: 0 } });
  }
  if (campaigns.events.converted === 0) {
    out.push({ key: "campaign-learning", kind: "warning", title: "Kampanya öğrenme verisi yok", body: campaigns.events.sent === 0 ? "Henüz kampanya gönderimi yok; Laya dönüşüm tahmini yapamaz." : "Gönderim var ancak ölçülmüş dönüşüm yok; önce sonuç olayları biriktirilmeli.", confidence: "insufficient_data", evidence: { sent: campaigns.events.sent, converted: campaigns.events.converted, revenue: campaigns.events.revenue } });
  } else {
    out.push({ key: "campaign-observed", kind: "observation", title: "Kampanya dönüşümü gözlendi", body: `${campaigns.events.converted} dönüşüm ve ${(campaigns.events.revenue / 100).toLocaleString("tr-TR")} TL kampanya cirosu kaydedildi.`, confidence: "observed", evidence: { delivered: campaigns.events.delivered, converted: campaigns.events.converted, revenue: campaigns.events.revenue } });
  }
  return out;
}
