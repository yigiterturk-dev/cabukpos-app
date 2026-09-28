// lib/core/refund.ts — İade edilebilir miktar (saf): satılan − önceki iadeler, ürün bazında. Kasada ve bulutta aynı.
export type RefLine = { productId: string; name: string; unitPrice: number; vatRate: 1 | 10 | 20; qtyMilli: number };

export function refundable(sold: RefLine[], refunded: { productId: string; qtyMilli: number }[]): RefLine[] {
  const back = new Map<string, number>();
  for (const r of refunded) back.set(r.productId, (back.get(r.productId) ?? 0) + r.qtyMilli);
  return sold.map((l) => {
    const used = Math.min(l.qtyMilli, back.get(l.productId) ?? 0);
    back.set(l.productId, (back.get(l.productId) ?? 0) - used);
    return { ...l, qtyMilli: l.qtyMilli - used };
  }).filter((l) => l.qtyMilli > 0);
}
