"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { formatTRY, todayISO, timeSlots, DAY_START_MIN, PX_PER_MIN, timeToMin } from "@/lib/utils";
import { IcX, IcPlus, IcTrash } from "@/components/icons";

interface Props {
  open: boolean;
  onClose: () => void;
  defaultTableId?: string;
}

export function OrderModal({ open, onClose, defaultTableId }: Props) {
  const { state, addAppointment, addCustomer } = useStore();
  const [tableId, setTableId] = useState(defaultTableId ?? "");
  
  // Cart: [{ serviceId, quantity }]
  const [cart, setCart] = useState<{ id: string; serviceId: string; name: string; price: number }[]>([]);

  useEffect(() => {
    if (open) {
      setTableId(defaultTableId ?? "masa-1");
      setCart([]);
    }
  }, [open, defaultTableId]);

  if (!open) return null;

  const total = cart.reduce((sum, item) => sum + item.price, 0);

  function addToCart(service: any) {
    setCart((prev) => [
      ...prev,
      { id: Date.now() + Math.random().toString(), serviceId: service.id, name: service.name, price: service.price }
    ]);
  }

  function removeFromCart(cartItemId: string) {
    setCart((prev) => prev.filter((i) => i.id !== cartItemId));
  }

  function submitOrder() {
    if (cart.length === 0) return;
    
    // Masa ID'si yoksa "Masa X" adında müşteri (customer) var mı kontrol et
    // Şimdilik demo amacıyla tableId'yi customerId olarak kullanıyoruz 
    // veya yoksa hızlıca oluşturuyoruz.
    let cid = state.customers.find(c => c.name.toLowerCase() === tableId.toLowerCase())?.id;
    if (!cid) {
      // Eğer o isimde bir müşteri (masa) yoksa, sahte bir tane ekleyelim (veri uyumluluğu için)
      const c = addCustomer({ name: tableId, phone: "—" });
      cid = c.id;
    }

    const now = new Date();
    const currentStart = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const staffId = state.staff[0]?.id; // Default staff (garson)
    const date = todayISO();

    cart.forEach(item => {
      addAppointment({
        date,
        start: currentStart,
        staffId,
        customerId: cid!,
        serviceId: item.serviceId,
        status: "bekliyor" // Sipariş alındı, açık
      });
    });

    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-[800px] flex-col overflow-hidden rounded-t-3xl bg-surface shadow-pop sm:h-[600px] sm:flex-row sm:rounded-2xl animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sol Taraf: Ürünler */}
        <div className="flex flex-1 flex-col border-r border-line">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <h3 className="font-display text-[17px] font-700 text-ink">Yeni Sipariş</h3>
              <p className="text-[12.5px] text-muted">{tableId.replace("-", " ").toUpperCase()}</p>
            </div>
            <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-ink sm:hidden">
              <IcX className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {state.services.map((svc) => (
                <button
                  key={svc.id}
                  onClick={() => addToCart(svc)}
                  className="group flex flex-col items-start justify-between rounded-2xl border border-line bg-canvas p-3 text-left transition-all hover:border-brand/40 hover:bg-surface hover:shadow-sm active:scale-95"
                >
                  <span className="font-semibold text-ink text-[13px] line-clamp-2">{svc.name}</span>
                  <span className="mt-2 font-display text-[15px] font-bold text-brand">{formatTRY(svc.price)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Sağ Taraf: Adisyon Sepeti */}
        <div className="flex h-[350px] w-full flex-col bg-canvas sm:h-full sm:w-[300px] shrink-0">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h3 className="font-display text-[16px] font-bold text-ink">Adisyon Özeti</h3>
            <button onClick={onClose} className="hidden rounded-lg p-1.5 text-muted hover:bg-surface hover:text-ink sm:block">
              <IcX className="h-5 w-5" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3">
            {cart.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center text-muted">
                <div className="mb-2 h-10 w-10 rounded-full bg-surface" />
                <p className="text-[13px] font-medium">Sipariş henüz boş.</p>
                <p className="text-[12px]">Sol taraftan ürün ekleyin.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {cart.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-xl border border-line bg-surface p-2.5 shadow-sm animate-fade-in">
                    <div className="flex flex-col">
                      <span className="text-[13px] font-semibold text-ink">{item.name}</span>
                      <span className="text-[12px] font-medium text-brand">{formatTRY(item.price)}</span>
                    </div>
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="rounded-md p-1.5 text-muted hover:bg-rose/10 hover:text-rose transition-colors"
                    >
                      <IcTrash className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-line bg-surface p-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[14px] font-medium text-muted">Toplam Tutar</span>
              <span className="font-display text-[22px] font-bold text-ink">{formatTRY(total)}</span>
            </div>
            <button
              onClick={submitOrder}
              disabled={cart.length === 0}
              className="w-full rounded-xl bg-brand px-4 py-3.5 text-[15px] font-semibold text-white shadow-card transition-all hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-40"
            >
              Siparişi Onayla
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
