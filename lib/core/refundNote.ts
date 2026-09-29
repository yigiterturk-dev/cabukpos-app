// lib/core/refundNote.ts — e-Arşiv'li satışın iadesinde belge içeriği (kasa ekranı, ESC/POS ve A4 aynı kaynak).
// Nihai tüketiciye (TCKN) satıcı iade faturası kesemez → iade tutanağı; VKN'li alıcı iade faturasını kendisi keser.
import { validateTaxId } from "./fiscal";

export type RefundFiscal = { number: string; ettn: string; invoiceAt: string; buyerKind: "tckn" | "vkn"; partial: boolean; sellerTaxId: string | null };
export type RefundNote =
  | { kind: "tutanak"; title: "İADE TUTANAĞI"; rows: [string, string][]; statement: string; sign: string[] }
  | { kind: "note"; text: string };

export const buyerKindOf = (taxId: string | null | undefined): "tckn" | "vkn" => (taxId && validateTaxId(taxId) === "vkn" ? "vkn" : "tckn");

/** Tam iade = ilk iade ve kalan tüm kalemler tam miktarıyla seçili. Bulutta aynı kural: ilk iade ve toplam ≥ asıl. */
export function isPartialRefund(remaining: { productId: string; qtyMilli: number }[], picked: { productId: string; qtyMilli: number }[], refundedBefore: boolean): boolean {
  if (refundedBefore) return true;
  const got = new Map(picked.map((p) => [p.productId, p.qtyMilli]));
  return remaining.some((r) => (got.get(r.productId) ?? 0) < r.qtyMilli);
}

const day = (iso: string) => new Date(iso).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" });

export function refundNote(f: RefundFiscal, sellerName: string, refundNo: string): RefundNote | null {
  if (!f.partial) return null;
  if (f.buyerKind === "vkn") return { kind: "note", text: `Alıcı iade faturası düzenleyecektir. Fatura: ${f.number}` };
  return {
    kind: "tutanak",
    title: "İADE TUTANAĞI",
    rows: [["Tutanak no", refundNo], ["Satıcı", sellerName], ["Satıcı VKN", f.sellerTaxId ?? "—"], ["Asıl fatura", f.number], ["Fatura tarihi", day(f.invoiceAt)], ["ETTN", f.ettn]],
    statement: "Yukarıdaki kalemler müşteriye iade edilmiş ve bedeli ödenmiştir.",
    sign: ["Müşteri ad soyad", "Müşteri TCKN", "Müşteri imza", "Satıcı imza"],
  };
}

/** Alıcının (VKN) düzenlediği iade faturasının kaydı: no + tarih (YYYY-AA-GG, asıl satış gününden önce olamaz). */
export function validateBuyerInvoice(no: string, date: string, soldAt: Date): string | null {
  if (!no.trim()) return "Fatura no gerekli.";
  if (no.trim().length > 40) return "Fatura no en çok 40 karakter.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return "Tarih biçimi geçersiz.";
  const soldDay = soldAt.toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
  return date < soldDay ? "Tarih asıl satıştan önce olamaz." : null;
}
