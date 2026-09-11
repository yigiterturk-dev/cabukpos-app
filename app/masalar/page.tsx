"use client";

import { useState } from "react";
import { Shell } from "@/components/Shell";
import { useStore } from "@/lib/store";
import { sectorTerms } from "@/lib/sectors";
import { todayISO, formatTRY } from "@/lib/utils";
import { IcPlus, IcUsers } from "@/components/icons";
import { OrderModal } from "@/components/OrderModal";
import { CheckoutModal } from "@/components/CheckoutModal";

export default function MasalarPage() {
  const { state } = useStore();
  const terms = sectorTerms(state.sector);
  const [filter, setFilter] = useState<"hepsi" | "dolu" | "bos">("hepsi");
  const [orderModal, setOrderModal] = useState<{ open: boolean; tableId?: string }>({ open: false });
  const [checkoutModal, setCheckoutModal] = useState<{ open: boolean; tableId: string }>({ open: false, tableId: "" });

  // Masalar: Şimdilik sabit 20 masa. 
  // İleride DB'ye eklenebilir, şu an demo için UI'ı canlandırıyoruz.
  const allTables = Array.from({ length: 20 }, (_, i) => ({
    id: `masa-${i + 1}`,
    name: `Masa ${i + 1}`,
    capacity: (i % 3 === 0) ? 2 : (i % 5 === 0) ? 6 : 4,
  }));

  // Bugünkü adisyonları çekelim
  const today = todayISO();
  const todaysApts = state.appointments.filter(a => a.date === today && a.status !== "iptal");
  
  // Basit bir simülasyon: Rastgele masaları dolu gösterelim, seed datadan gelen siparişlerle eşleştirelim.
  // Gerçekte her siparişin (appointment) bir masa ID'si olmalı, ama şu an UI konseptini oturtuyoruz.
  const activeOrders = todaysApts.filter(a => a.status === "bekliyor");
  
  const tables = allTables.map((table, i) => {
    // Önce ismi "Masa X" olan bir müşteri var mı diye bak (Gerçek kullanım)
    const cid = state.customers.find(c => c.name.toLowerCase() === table.name.toLowerCase())?.id;
    let tableOrders = activeOrders.filter(a => a.customerId === cid);

    // Eğer yoksa ve boşsa, demo verilerini index'e göre paylaştır (Demo gösterimi için)
    if (tableOrders.length === 0 && !cid) {
      tableOrders = activeOrders.filter((_, idx) => (idx % allTables.length) === i);
    }

    const isOccupied = tableOrders.length > 0;
    const totalAmount = tableOrders.reduce((sum, o) => sum + (o.priceSnapshot || 0), 0);
    const openedAt = isOccupied ? tableOrders[0].start : null;

    return { ...table, isOccupied, totalAmount, openedAt, ordersCount: tableOrders.length };
  });

  const filteredTables = tables.filter(t => {
    if (filter === "dolu") return t.isOccupied;
    if (filter === "bos") return !t.isOccupied;
    return true;
  });

  const totalRevenue = tables.reduce((sum, t) => sum + t.totalAmount, 0);

  return (
    <Shell>
      <div className="mx-auto max-w-[1300px]">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-[24px] font-700 tracking-tight text-ink">Masalar & Adisyonlar</h1>
            <p className="mt-1 text-[14px] text-muted">Açık masaları yönetin, hızlı sipariş girin ve hesap alın.</p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setOrderModal({ open: true, tableId: "paket-servis" })}
              className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-[14px] font-medium text-ink transition-colors hover:bg-canvas"
            >
              <IcUsers className="h-4 w-4" /> Yeni Paket Servis
            </button>
            <button 
              onClick={() => setOrderModal({ open: true, tableId: "hizli-satis" })}
              className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-[14px] font-semibold text-white shadow-card transition-all hover:bg-brand-deep"
            >
              <IcPlus className="h-4 w-4" /> Hızlı Satış
            </button>
          </div>
        </div>

        {/* Özet ve Filtreler */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface p-2 pr-4 shadow-sm">
          <div className="flex items-center gap-1">
            {[
              { id: "hepsi", label: "Tüm Masalar" },
              { id: "dolu", label: "Dolu" },
              { id: "bos", label: "Boş" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id as any)}
                className={`rounded-xl px-4 py-2 text-[13.5px] font-semibold transition-all ${
                  filter === f.id
                    ? "bg-brand text-white shadow-sm"
                    : "text-muted hover:bg-canvas hover:text-ink"
                }`}
              >
                {f.label}
                {f.id === "dolu" && (
                  <span className={`ml-2 inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[11px] ${filter === 'dolu' ? 'bg-white/20 text-white' : 'bg-brand/10 text-brand'}`}>
                    {tables.filter(t => t.isOccupied).length}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-4 px-2">
            <div className="text-right">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Açık Adisyon Toplamı</div>
              <div className="text-[15px] font-bold text-ink">{formatTRY(totalRevenue)}</div>
            </div>
          </div>
        </div>

        {/* Masa Grid */}
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filteredTables.map((table) => (
            <button
              key={table.id}
              onClick={() => {
                if (!table.isOccupied) setOrderModal({ open: true, tableId: table.name });
                else setCheckoutModal({ open: true, tableId: table.name });
              }}
              className={`group relative flex h-[140px] flex-col justify-between rounded-2xl border p-4 text-left transition-all ${
                table.isOccupied
                  ? "border-brand bg-brand-soft ring-1 ring-brand hover:shadow-card"
                  : "border-line bg-surface hover:border-brand/40 hover:shadow-sm"
              }`}
            >
              <div className="flex w-full items-start justify-between">
                <div>
                  <h3 className={`font-display text-[17px] font-bold tracking-tight ${table.isOccupied ? 'text-brand-deep' : 'text-ink'}`}>
                    {table.name}
                  </h3>
                  <div className="mt-1 flex items-center gap-1.5 text-[12px] font-medium text-muted">
                    <IcUsers className="h-3.5 w-3.5" /> {table.capacity} Kişilik
                  </div>
                </div>
                {table.isOccupied && (
                  <span className="flex h-2.5 w-2.5 animate-pulse rounded-full bg-brand shadow-[0_0_8px_rgba(27,122,90,0.6)]" />
                )}
              </div>

              <div className="mt-auto w-full">
                {table.isOccupied ? (
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-[11px] font-medium text-brand-deep/70">Tutar</div>
                      <div className="font-display text-[16px] font-bold text-brand-deep">{formatTRY(table.totalAmount)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] font-medium text-brand-deep/70">Açılış</div>
                      <div className="text-[13px] font-semibold text-brand-deep">{table.openedAt}</div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-[13px] font-semibold text-muted transition-colors group-hover:text-brand">
                    <IcPlus className="h-4 w-4" /> Masayı Aç
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
      
      <OrderModal
        open={orderModal.open}
        onClose={() => setOrderModal({ open: false })}
        defaultTableId={orderModal.tableId}
      />
      <CheckoutModal
        open={checkoutModal.open}
        onClose={() => setCheckoutModal({ open: false, tableId: "" })}
        tableId={checkoutModal.tableId}
      />
    </Shell>
  );
}
