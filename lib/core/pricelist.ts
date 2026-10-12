// lib/core/pricelist.ts — #50 fiyat listesi / happy hour. Saf: saat + gün penceresinde ürün fiyatını ezer.
// İki tür: "fiyat" (ürün başı liste fiyatı) ve "yuzde" (kapsam = tüm ürünler ya da seçili kategoriler, yüzde indirim).
// Liste sırası sort'a göre; ilk uyan kazanır. Kasa çevrimdışı hesaplar: katalog listeleri taşır, fiyat satır eklenirken donar.

export type PriceListCore = {
  id: string;
  kind?: "fiyat" | "yuzde";
  percent?: number | null; // yuzde: 1-100
  categoryIds?: string[] | null; // yuzde kapsamı; boş/null = tüm ürünler
  days: number[]; // JS getDay: 0 pazar … 6 cumartesi; boş = her gün
  startMin: number; // gece yarısından dakika
  endMin: number;
  storeId: string | null; // null = tüm şubeler
  items: { productId: string; price: number }[];
};

/** An, listenin gün + saat penceresine düşüyor mu? endMin <= startMin = gece yarısını aşar (22:00–02:00). */
export function listActiveAt(list: PriceListCore, at: Date, storeId?: string | null): boolean {
  if (list.storeId && list.storeId !== storeId) return false;
  if (list.days.length && !list.days.includes(at.getDay())) return false;
  const m = at.getHours() * 60 + at.getMinutes();
  if (list.startMin === list.endMin) return false;
  if (list.startMin < list.endMin) return m >= list.startMin && m < list.endMin;
  return m >= list.startMin || m < list.endMin; // gece yarısı aşımı
}

/** Yüzde listesi bu ürünü kapsıyor mu? Kategori seçilmemişse tüm ürünler. */
export function percentCovers(list: PriceListCore, categoryId: string | null | undefined): boolean {
  if (list.categoryIds && list.categoryIds.length) return !!categoryId && list.categoryIds.includes(categoryId);
  return true;
}

/** Yüzde uygulanmış fiyat (kuruş, aşağı yuvarlar). */
export const discountedPrice = (base: number, percent: number): number => Math.max(0, Math.round((base * (100 - percent)) / 100));

/** Ürünün o anki efektif fiyatı: eşleşen ilk liste (sıra verildiği gibi). Yüzde listesi kategori kapsamına bakmazsa atlanır. */
export function effectivePrice(productId: string, basePrice: number, lists: PriceListCore[], at: Date, storeId?: string | null, categoryId?: string | null): number {
  for (const l of lists) {
    if (!listActiveAt(l, at, storeId)) continue;
    if (l.kind === "yuzde") {
      if (l.percent == null) continue;
      if (!percentCovers(l, categoryId)) continue;
      return discountedPrice(basePrice, l.percent);
    }
    const item = l.items.find((i) => i.productId === productId);
    if (item) return item.price;
  }
  return basePrice;
}

/** Ürüne bu an hangi listenin uygulandığı (panelde/kasada göstermek için); yoksa null. */
export function appliedList(productId: string, lists: PriceListCore[], at: Date, storeId?: string | null, categoryId?: string | null): string | null {
  for (const l of lists) {
    if (!listActiveAt(l, at, storeId)) continue;
    if (l.kind === "yuzde") { if (l.percent != null && percentCovers(l, categoryId)) return l.id; continue; }
    if (l.items.some((i) => i.productId === productId)) return l.id;
  }
  return null;
}
