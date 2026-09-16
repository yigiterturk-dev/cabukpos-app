"use client";

import { useState } from "react";
import { Shell } from "@/components/Shell";
import { Card, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/store";
import { formatTRY } from "@/lib/utils";
import type { Service } from "@/lib/types";
import { IcPlus, IcX, IcEdit, IcTrash, IcGrid } from "@/components/icons";

export default function UrunlerPage() {
  const { state, upsertService, deleteService } = useStore();
  const [editing, setEditing] = useState<Service | null>(null);

  // Hizmetler (Ürünler) listesi
  const products = state.services;

  return (
    <Shell>
      <div className="mx-auto max-w-[1100px]">
        <div className="flex items-end justify-between">
          <SectionTitle sub="Kasadaki menü ve ürünleri yönetin">Ürünler</SectionTitle>
          <button
            onClick={() => setEditing({ id: "", name: "", durationMin: 5, price: 0, commissionRate: 0 })}
            className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-[14px] font-semibold text-white shadow-card transition-all hover:bg-brand-deep"
          >
            <IcPlus className="h-4 w-4" /> Yeni Ürün
          </button>
        </div>

        <div className="mt-6">
          <Card className="overflow-hidden">
            <div className="hidden grid-cols-[2fr_1fr_1fr_auto] gap-2 border-b border-line px-5 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-muted sm:grid">
              <span>Ürün Adı</span>
              <span className="text-right">Fiyat</span>
              <span className="text-right">Prim / Maliyet Oranı</span>
              <span className="w-16" />
            </div>

            {products.length === 0 ? (
              <div className="py-12 text-center text-muted">
                <p className="text-[14px] font-medium">Henüz ürün eklemediniz.</p>
              </div>
            ) : (
              <div className="divide-y divide-line">
                {products.map((p) => (
                  <div key={p.id} className="group grid grid-cols-1 gap-2 px-5 py-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-center">
                    <div>
                      <div className="font-semibold text-ink">{p.name}</div>
                      {(p.barcode || p.trackStock) && (
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11.5px] text-muted">
                          {p.barcode && <span className="rounded bg-canvas px-1.5 py-0.5 font-mono">{p.barcode}</span>}
                          {p.trackStock && (
                            <span className={`rounded px-1.5 py-0.5 font-semibold ${(p.stock ?? 0) > 0 ? "bg-brand-soft text-brand-deep" : "bg-rose/10 text-rose"}`}>
                              Stok: {p.stock ?? 0}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center justify-between sm:justify-end">
                      <span className="text-[12px] text-muted sm:hidden">Fiyat</span>
                      <span className="font-display text-[15px] font-bold text-brand">{formatTRY(p.price)}</span>
                    </div>
                    
                    <div className="flex items-center justify-between sm:justify-end">
                      <span className="text-[12px] text-muted sm:hidden">Prim</span>
                      <span className="text-[14px] font-medium text-ink">
                        {p.commissionRate > 0 ? `%${(p.commissionRate * 100).toFixed(0)}` : "—"}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center justify-end gap-1 sm:mt-0">
                      <button
                        onClick={() => setEditing(p)}
                        className="rounded-lg p-1.5 text-muted opacity-100 transition-colors hover:bg-canvas hover:text-ink sm:opacity-0 sm:group-hover:opacity-100"
                        title="Düzenle"
                      >
                        <IcEdit className="h-4.5 w-4.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`${p.name} silinecek. Onaylıyor musunuz?`)) deleteService(p.id);
                        }}
                        className="rounded-lg p-1.5 text-muted opacity-100 transition-colors hover:bg-rose/10 hover:text-rose sm:opacity-0 sm:group-hover:opacity-100"
                        title="Sil"
                      >
                        <IcTrash className="h-4.5 w-4.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {editing && (
          <ProductModal
            product={editing}
            onClose={() => setEditing(null)}
            onSave={(val) => {
              upsertService(val);
              setEditing(null);
            }}
          />
        )}
      </div>
    </Shell>
  );
}

// ---------------- Modal ----------------
function ProductModal({ product, onClose, onSave }: { product: Service; onClose: () => void; onSave: (s: Service) => void }) {
  const [name, setName] = useState(product.name);
  const [price, setPrice] = useState(String(product.price || ""));
  const [comm, setComm] = useState(product.commissionRate > 0 ? String(product.commissionRate * 100) : "");
  const [barcode, setBarcode] = useState(product.barcode ?? "");
  const [trackStock, setTrackStock] = useState(product.trackStock ?? false);
  const [stock, setStock] = useState(product.trackStock ? String(product.stock ?? 0) : "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm animate-in fade-in" onClick={onClose}>
      <div className="w-full max-w-[400px] rounded-2xl bg-surface p-5 shadow-pop animate-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-[17px] font-700 text-ink">
            {product.id ? "Ürün Düzenle" : "Yeni Ürün"}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-ink">
            <IcX className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-ink">Ürün Adı</label>
            <input
              autoFocus
              className="w-full rounded-xl border border-line bg-canvas px-4 py-2.5 text-[14px] text-ink outline-none transition-colors focus:border-brand focus:bg-surface focus:ring-4 focus:ring-brand/10"
              placeholder="Örn: Hamburger Menü"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink">Fiyat (₺)</label>
              <input
                type="number"
                className="w-full rounded-xl border border-line bg-canvas px-4 py-2.5 text-[14px] text-ink outline-none transition-colors focus:border-brand focus:bg-surface focus:ring-4 focus:ring-brand/10"
                placeholder="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink">Prim Oranı (%)</label>
              <input
                type="number"
                className="w-full rounded-xl border border-line bg-canvas px-4 py-2.5 text-[14px] text-ink outline-none transition-colors focus:border-brand focus:bg-surface focus:ring-4 focus:ring-brand/10"
                placeholder="Örn: 5"
                value={comm}
                onChange={(e) => setComm(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-ink">Barkod (isteğe bağlı)</label>
            <input
              className="w-full rounded-xl border border-line bg-canvas px-4 py-2.5 text-[14px] text-ink outline-none transition-colors focus:border-brand focus:bg-surface focus:ring-4 focus:ring-brand/10"
              placeholder="Örn: 8690000000017"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
            />
          </div>

          <div className="rounded-xl bg-canvas p-3.5">
            <label className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={trackStock}
                onChange={(e) => setTrackStock(e.target.checked)}
                className="h-4 w-4 accent-[#1B7A5A]"
              />
              <span className="text-[13.5px] font-semibold text-ink">Stok takibi yapılsın</span>
            </label>
            {trackStock && (
              <input
                type="number"
                min={0}
                className="mt-2.5 w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-[14px] text-ink outline-none transition-colors focus:border-brand focus:ring-4 focus:ring-brand/10"
                placeholder="Mevcut stok adedi"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
              />
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl px-4 py-2.5 text-[14px] font-semibold text-muted hover:bg-canvas hover:text-ink">
            İptal
          </button>
          <button
            onClick={() => {
              if (!name.trim()) return;
              onSave({
                ...product,
                name: name.trim(),
                price: Number(price) || 0,
                durationMin: 5, // POS için süre gereksiz ama veritabanı şeması için 5 dk sabitliyoruz.
                commissionRate: (Number(comm) || 0) / 100,
                barcode: barcode.trim() || undefined,
                trackStock: trackStock || undefined,
                stock: trackStock ? Math.max(0, Number(stock) || 0) : undefined,
              });
            }}
            className="rounded-xl bg-ink px-5 py-2.5 text-[14px] font-semibold text-white shadow-md transition-colors hover:bg-ink-light"
          >
            Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}
