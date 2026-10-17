// lib/core/refund.ts — İade edilebilir miktar (saf): satılan − önceki iadeler, ürün/birim fiyatı/seçenek bazında. Kasada ve bulutta aynı.
export type RefLine = { productId: string; name: string; unitPrice: number; vatRate: 1 | 10 | 20; qtyMilli: number; options?: { id: string; name: string; delta: number }[]; note?: string | null };

const priceKey = (l: Pick<RefLine, "productId" | "unitPrice" | "vatRate">) => `${l.productId}:${l.unitPrice}:${l.vatRate}`;
const refundKey = (l: Pick<RefLine, "productId" | "unitPrice" | "vatRate" | "options">) => `${priceKey(l)}:${(l.options ?? []).map((o) => o.id).sort().join(",")}`;

export function refundable(sold: RefLine[], refunded: { productId: string; qtyMilli: number; unitPrice?: number | null; vatRate?: RefLine["vatRate"] | null; options?: RefLine["options"] | null }[]): RefLine[] {
  const back = new Map<string, number>();
  const priceBack = new Map<string, number>();
  const legacyBack = new Map<string, number>();
  for (const r of refunded) {
    if (r.unitPrice == null || r.vatRate == null) legacyBack.set(r.productId, (legacyBack.get(r.productId) ?? 0) + r.qtyMilli);
    else if (r.options == null) {
      const key = priceKey({ productId: r.productId, unitPrice: r.unitPrice, vatRate: r.vatRate });
      priceBack.set(key, (priceBack.get(key) ?? 0) + r.qtyMilli);
    }
    else {
      const key = refundKey({ productId: r.productId, unitPrice: r.unitPrice, vatRate: r.vatRate, options: r.options });
      back.set(key, (back.get(key) ?? 0) + r.qtyMilli);
    }
  }
  return sold.map((l) => {
    const key = refundKey(l);
    const exact = Math.min(l.qtyMilli, back.get(key) ?? 0);
    back.set(key, (back.get(key) ?? 0) - exact);
    const price = Math.min(l.qtyMilli - exact, priceBack.get(priceKey(l)) ?? 0);
    priceBack.set(priceKey(l), (priceBack.get(priceKey(l)) ?? 0) - price);
    const legacy = Math.min(l.qtyMilli - exact - price, legacyBack.get(l.productId) ?? 0);
    legacyBack.set(l.productId, (legacyBack.get(l.productId) ?? 0) - legacy);
    const used = exact + price + legacy;
    return { ...l, qtyMilli: l.qtyMilli - used };
  }).filter((l) => l.qtyMilli > 0);
}
