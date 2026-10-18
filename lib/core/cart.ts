// lib/core/cart.ts — Saf sepet. Miktar qtyMilli (1 adet = 1000).
import { splitVat, type Kurus, type VatRate } from "./money";

export type CartProduct = { id: string; name: string; price: Kurus; vatRate: VatRate };
export type CartLine = { productId: string; name: string; unitPrice: Kurus; vatRate: VatRate; qtyMilli: number; discount?: Kurus };
export const MAX_CART_LINE_QTY_MILLI = 1_000_000;
/** Satış satırı: sepet satırı ya da serbest satır (M6: paket ücreti, eşlenmeyen platform ürünü; ürünsüz). */
export type AnyLine = Omit<CartLine, "productId"> & { productId: string | null };
export type VatLine = { rate: VatRate; gross: Kurus; net: Kurus; vat: Kurus };

/** Satır tutarı; indirim (ikram, adisyon indirimi) düşülür, 0'ın altına inmez. */
export const lineTotal = (l: AnyLine): Kurus => Math.max(0, Math.round((l.unitPrice * l.qtyMilli) / 1000) - (l.discount ?? 0));

export function addProduct(cart: CartLine[], p: CartProduct, qtyMilli = 1000): CartLine[] {
  const i = cart.findIndex((l) => l.productId === p.id);
  if (i === -1) return [...cart, { productId: p.id, name: p.name, unitPrice: p.price, vatRate: p.vatRate, qtyMilli }];
  return cart.map((l, j) => (j === i ? { ...l, qtyMilli: l.qtyMilli + qtyMilli } : l));
}

export function setQty(cart: CartLine[], productId: string, qtyMilli: number): CartLine[] {
  return qtyMilli <= 0 ? cart.filter((l) => l.productId !== productId) : cart.map((l) => (l.productId === productId ? { ...l, qtyMilli } : l));
}

/** M9a: kasadan silinen içerik (register_events.lines). total KDV dahil, indirimsiz. */
export type RemovedLine = { productId: string | null; name: string; qtyMilli: number; total: Kurus };

/** Sepet değişiminde çıkan miktar (silinen satır / azaltılan adet). Artış ve yeni satır yok sayılır. */
export function removedLines(before: CartLine[], after: CartLine[]): RemovedLine[] {
  const now = new Map(after.map((l) => [l.productId, l.qtyMilli]));
  return before.flatMap((l) => {
    const gone = l.qtyMilli - (now.get(l.productId) ?? 0);
    return gone > 0 ? [{ productId: l.productId, name: l.name, qtyMilli: gone, total: lineTotal({ ...l, qtyMilli: gone, discount: 0 }) }] : [];
  });
}

export function totals(cart: AnyLine[]): { total: Kurus; count: number; vat: VatLine[] } {
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

/** #33: satış düzeyi indirim (kupon/puan) KDV kırılımına oransal yansır — matrah ve KDV indirimsiz brütle gösterilir.
 *  Kırılım brüt toplamı tam korunur: artan kuruş son orana yazılır. İndirim kırılım toplamını aşamaz. */
export function discountedVat<R extends number>(vat: { rate: R; gross: Kurus; net: Kurus; vat: Kurus }[], discount: Kurus = 0): { rate: R; gross: Kurus; net: Kurus; vat: Kurus }[] {
  const gross = vat.reduce((t, v) => t + v.gross, 0);
  const cut = Math.min(Math.max(0, discount), gross);
  let left = cut;
  return vat.map((v, i) => {
    const d = i === vat.length - 1 ? left : Math.min(left, Math.round((cut * v.gross) / (gross || 1)));
    left -= d;
    const g = v.gross - d;
    return { rate: v.rate, gross: g, ...splitVat(g, v.rate as VatRate) } as { rate: R; gross: Kurus; net: Kurus; vat: Kurus };
  });
}
