// lib/core/cart.ts — Saf sepet. Miktar qtyMilli (1 adet = 1000).
import { splitVat, type Kurus, type VatRate } from "./money";

export type CartProduct = { id: string; name: string; price: Kurus; vatRate: VatRate };
export type CartLine = { productId: string; name: string; unitPrice: Kurus; vatRate: VatRate; qtyMilli: number; discount?: Kurus };
export type VatLine = { rate: VatRate; gross: Kurus; net: Kurus; vat: Kurus };

/** Satır tutarı; indirim (ikram, adisyon indirimi) düşülür, 0'ın altına inmez. */
export const lineTotal = (l: CartLine): Kurus => Math.max(0, Math.round((l.unitPrice * l.qtyMilli) / 1000) - (l.discount ?? 0));

export function addProduct(cart: CartLine[], p: CartProduct, qtyMilli = 1000): CartLine[] {
  const i = cart.findIndex((l) => l.productId === p.id);
  if (i === -1) return [...cart, { productId: p.id, name: p.name, unitPrice: p.price, vatRate: p.vatRate, qtyMilli }];
  return cart.map((l, j) => (j === i ? { ...l, qtyMilli: l.qtyMilli + qtyMilli } : l));
}

export function setQty(cart: CartLine[], productId: string, qtyMilli: number): CartLine[] {
  return qtyMilli <= 0 ? cart.filter((l) => l.productId !== productId) : cart.map((l) => (l.productId === productId ? { ...l, qtyMilli } : l));
}

export function totals(cart: CartLine[]): { total: Kurus; count: number; vat: VatLine[] } {
  const byRate = new Map<VatRate, Kurus>();
  let total = 0;
  let count = 0;
  for (const l of cart) {
    const t = lineTotal(l);
    total += t;
    count += Math.ceil(l.qtyMilli / 1000);
    byRate.set(l.vatRate, (byRate.get(l.vatRate) ?? 0) + t);
  }
  const vat = [...byRate].sort(([a], [b]) => a - b).map(([rate, gross]) => ({ rate, gross, ...splitVat(gross, rate) }));
  return { total, count, vat };
}
