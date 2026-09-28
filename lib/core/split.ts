// lib/core/split.ts — Masa hesabını parçalara bölme. Her parça ayrı satış (kendi fişi) olur.
// İndirim satırlara dağıtılır: ikram = satırın tamamı; adisyon indirimi ikram dışı satırlara brüt oranında (artık son satıra).
// Satırın ödenen kısmı kadar indirim de "kullanılmış" sayılır → son parça kalan indirimi tam alır, toplam kuruşu kuruşuna tutar.
import type { AnyLine } from "./cart";
import type { Kurus } from "./money";
import type { LineOption } from "./options";
import { lineGross, type PaidLine, type TabState } from "./tab";

export type PayLine = AnyLine & { lineId: string; options: LineOption[]; note: string | null; discount: Kurus };

/** Satır kimliği → tam satır için indirim (kuruş). */
export function lineDiscounts(tab: TabState): Map<string, Kurus> {
  const m = new Map<string, Kurus>();
  const live = tab.lines.filter((l) => !l.voided);
  for (const l of live) if (l.comped) m.set(l.lineId, lineGross(l));
  const paying = live.filter((l) => !l.comped);
  let left = tab.discountAmount;
  paying.forEach((l, i) => {
    const d = i === paying.length - 1 ? left : tab.gross ? Math.floor((tab.discountAmount * lineGross(l)) / tab.gross) : 0;
    m.set(l.lineId, d);
    left -= d;
  });
  return m;
}

/** Henüz ödenmemiş kısımlar (ikram satırları 0 TL olarak dahil). */
export function payableLines(tab: TabState): PayLine[] {
  const disc = lineDiscounts(tab);
  return tab.lines.filter((l) => !l.voided && l.qtyMilli > l.paidMilli).map((l) => ({
    lineId: l.lineId, productId: l.productId, name: l.name, unitPrice: l.unitPrice, vatRate: l.vatRate, options: l.options, note: l.note,
    qtyMilli: l.qtyMilli - l.paidMilli,
    discount: Math.max(0, (disc.get(l.lineId) ?? 0) - l.paidDiscount),
  }));
}

/** Satırdan q milli adet: kalan tamamı alınıyorsa kalan indirim, değilse oransal. */
export function take(l: PayLine, q: number): PayLine {
  if (q >= l.qtyMilli) return l;
  return { ...l, qtyMilli: q, discount: Math.floor((l.discount * q) / l.qtyMilli) };
}

/** Eşit bölmede sıradaki parça: kalan her satırın 1/partsLeft'i (milli adet). Son parça kalanın tamamı. */
export function equalPart(lines: PayLine[], partsLeft: number): PayLine[] {
  if (partsLeft <= 1) return lines;
  return lines.map((l) => take(l, Math.round(l.qtyMilli / partsLeft))).filter((l) => l.qtyMilli > 0);
}

/** Ürün seçerek: satır kimliği → milli adet. */
export function pickPart(lines: PayLine[], picks: Record<string, number>): PayLine[] {
  return lines.flatMap((l) => { const q = Math.min(l.qtyMilli, picks[l.lineId] ?? 0); return q > 0 ? [take(l, q)] : []; });
}

export const paidLinesOf = (part: PayLine[]): PaidLine[] => part.map((l) => ({ lineId: l.lineId, qtyMilli: l.qtyMilli, discount: l.discount }));
