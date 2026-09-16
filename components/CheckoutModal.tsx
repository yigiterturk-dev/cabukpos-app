"use client";

import { useStore } from "@/lib/store";
import { formatTRY, todayISO } from "@/lib/utils";
import { IcX, IcWallet, IcCard } from "@/components/icons";
import type { PaymentMethod } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  tableId: string;
}

export function CheckoutModal({ open, onClose, tableId }: Props) {
  const { state, addPayment, updateAppointmentStatus } = useStore();

  if (!open) return null;

  // Masa adına sahip müşteriyi bul
  const customer = state.customers.find((c) => c.name.toLowerCase() === tableId.toLowerCase());
  const cid = customer?.id;

  const today = todayISO();
  // Açık adisyonlar (bekliyor durumu)
  const activeOrders = state.appointments.filter(
    (a) => a.date === today && a.status === "bekliyor" && a.customerId === cid
  );

  const totalAmount = activeOrders.reduce((sum, a) => sum + (a.priceSnapshot || 0), 0);

  function handlePayment(method: PaymentMethod) {
    if (!cid || activeOrders.length === 0) return;

    // Ödeme kaydı oluştur (tek kalemde toplam tutar)
    addPayment({
      date: todayISO(),
      amount: totalAmount,
      method,
      customerId: cid,
      note: `${tableId} - Tahsilat`,
    });

    // Masadaki tüm siparişleri "geldi" (kapalı/ödendi) durumuna al
    activeOrders.forEach((order) => {
      updateAppointmentStatus(order.id, "geldi");
    });

    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[400px] animate-fade-up overflow-hidden rounded-t-3xl bg-surface shadow-pop sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h3 className="font-display text-[17px] font-700 text-ink">Hesap Tahsilat</h3>
            <p className="text-[12.5px] text-muted">{tableId.toUpperCase()}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-ink">
            <IcX className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[300px] overflow-y-auto px-5 py-3">
          {activeOrders.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">Açık adisyon bulunamadı.</p>
          ) : (
            <div className="space-y-2">
              {activeOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between border-b border-line pb-2 last:border-0 last:pb-0">
                  <span className="text-[13px] font-medium text-ink">{order.serviceNameSnapshot}</span>
                  <span className="text-[13.5px] font-semibold text-ink">{formatTRY(order.priceSnapshot || 0)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-line bg-canvas p-5">
          <div className="mb-5 flex items-center justify-between">
            <span className="text-[15px] font-medium text-muted">Ödenecek Tutar</span>
            <span className="font-display text-[26px] font-bold text-ink">{formatTRY(totalAmount)}</span>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handlePayment("nakit")}
              disabled={activeOrders.length === 0}
              className="flex items-center justify-center gap-2 rounded-xl border border-line bg-surface py-3 text-[14px] font-semibold text-ink shadow-sm transition-all hover:border-brand/40 hover:text-brand disabled:opacity-40"
            >
              <IcWallet className="h-4 w-4" /> Nakit
            </button>
            <button
              onClick={() => handlePayment("kart")}
              disabled={activeOrders.length === 0}
              className="flex items-center justify-center gap-2 rounded-xl bg-brand py-3 text-[14px] font-semibold text-white shadow-card transition-all hover:bg-brand-deep disabled:opacity-40"
            >
              <IcCard className="h-4 w-4" /> Kredi Kartı
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
