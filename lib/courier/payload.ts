// lib/courier/payload.ts — Adisyonu YNR sipariş gövdesine çevirir. Saf: ağ ve DB yok.
import { normalizePhone } from "@/lib/core/delivery";
import type { TabState } from "@/lib/core/tab";
import type { YnrSendOrder } from "./ynr";

export type PayloadInput = {
  provider: string;
  accountId: string;
  pickup: { address: string; lat: number; lng: number };
  dropoff: { lat: number; lng: number };
};

export type PayloadResult = { ok: true; order: YnrSendOrder } | { ok: false; error: string };

/** Hazırlık sinyali: tüm biletler hazır/teslim edilmişse paket alınabilir. */
export const deliveryIsReady = (t: TabState) => t.tickets.length > 0 && t.tickets.every((k) => k.status === "hazir" || k.status === "teslim");

/** YNR yalnız kendi kuryesiyle teslim edilecek paketleri alır; platform siparişleri ve masalar dışarıda kalır. */
export function ynrOrderFromTab(t: TabState, input: PayloadInput, dispatchReady: boolean): PayloadResult {
  if (t.kind === "masa") return { ok: false, error: "Masa adisyonu kuryeye gönderilmez." };
  if (t.kind === "platform") return { ok: false, error: "Platform siparişinin kuryesi platformdan gelir." };
  if (!t.order) return { ok: false, error: "Sipariş bilgisi yok." };
  if (t.delivery.cancelled || t.delivery.rejected) return { ok: false, error: "Kapalı sipariş kuryeye gönderilmez." };
  if (t.delivery.deliveredAt) return { ok: false, error: "Teslim edilmiş sipariş kuryeye gönderilmez." };
  if (!t.order.address.trim()) return { ok: false, error: "Teslim adresi boş." };
  const phone = normalizePhone(t.order.phone);
  if (!phone) return { ok: false, error: "Müşteri telefonu geçersiz." };

  const total = t.total > 0 ? t.total : t.gross;
  return {
    ok: true,
    order: {
      provider: input.provider,
      accountId: input.accountId,
      externalOrderId: t.id,
      dispatchReady,
      order: {
        customerName: t.order.name,
        customerPhone: `+${phone}`,
        pickupAddress: input.pickup.address,
        pickupLat: input.pickup.lat,
        pickupLng: input.pickup.lng,
        dropoffAddress: t.order.address,
        dropoffLat: input.dropoff.lat,
        dropoffLng: input.dropoff.lng,
        // YNR teslimat ücretini kendi tarifesinden hesaplar; bu alan yalnız uyumluluk için.
        price: 0,
        // Kapıda ödeme: online ödenmiş siparişte tahsilat yok. Kuruş → TL.
        codAmount: t.order.payIntent === "online" ? 0 : Math.round(total) / 100,
        ...(t.order.note ? { notes: t.order.note.slice(0, 500) } : {}),
      },
    },
  };
}
