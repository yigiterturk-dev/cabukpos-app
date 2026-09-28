// lib/core/receipt.ts — Bilgi fişi ve gün sonu raporunun ESC/POS hâli (ekrandaki fişle aynı içerik).
import { formatTL } from "./money";
import { PAY_METHODS } from "./payment";
import type { Payment } from "./payment";
import type { VatLine } from "./cart";
import type { summarizeShift } from "./shift";
import { EscPos, type Codepage, type PaperWidth } from "./escpos";

export type PrintOpts = { width: PaperWidth; codepage: Codepage; drawer?: boolean };
export type ReceiptSale = {
  receiptNo: string; at: string; staffName: string;
  lines: { productId: string; name: string; unitPrice: number; qtyMilli: number; options?: { name: string }[]; note?: string | null; discount?: number }[];
  payments: Payment[]; total: number; change: number; vat: VatLine[];
  refund?: boolean; refundOfNo?: string; tableName?: string;
};
export type ReceiptHeader = { tenantName: string; storeName: string; storeAddress: string | null };

const TZ = "Europe/Istanbul";
const date = (d: Date) => d.toLocaleDateString("tr-TR", { timeZone: TZ });
const time = (d: Date) => d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const payLabel = (m: string) => PAY_METHODS.find((p) => p.value === m)?.label ?? m;
export const qtyText = (m: number, weighed = false) =>
  weighed ? `${(m / 1000).toLocaleString("tr-TR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`
    : m % 1000 === 0 ? String(m / 1000) : (m / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 3 });

function header(p: EscPos, h: ReceiptHeader) {
  p.align("center").bold(true).size(2).lines(h.tenantName).size(1).bold(false);
  if (h.storeName) p.lines(h.storeName);
  if (h.storeAddress) p.lines(h.storeAddress);
  p.align("left");
}

/** weighed(productId): tartılı ürün mü (miktar kg gösterilir). */
export function renderReceipt(sale: ReceiptSale, h: ReceiptHeader, o: PrintOpts, weighed: (id: string) => boolean = () => false): Uint8Array {
  const p = new EscPos(o.codepage, o.width);
  const at = new Date(sale.at);
  if (o.drawer) p.drawer();
  header(p, h);
  if (sale.refund) p.align("center").bold(true).line("İADE FİŞİ").bold(false).align("left");
  p.rule().cols2(date(at), time(at)).cols2("Fiş no", sale.receiptNo);
  if (sale.refund && sale.refundOfNo) p.cols2("Asıl fiş", sale.refundOfNo);
  if (sale.tableName) p.cols2("Masa", sale.tableName);
  p.cols2("Kasiyer", sale.staffName).rule();
  for (const l of sale.lines) {
    p.lines(l.name);
    for (const o of l.options ?? []) p.lines(`  + ${o.name}`);
    p.cols2(`  ${qtyText(l.qtyMilli, weighed(l.productId))} x ${formatTL(l.unitPrice)}`, formatTL(Math.round((l.unitPrice * l.qtyMilli) / 1000)));
    if (l.discount) p.cols2("  İndirim", `-${formatTL(l.discount)}`);
  }
  p.rule();
  for (const v of sale.vat) p.cols2(`KDV %${v.rate}  matrah ${formatTL(v.net)}`, formatTL(v.vat));
  p.rule().bold(true).size(2).cols2(sale.refund ? "İADE" : "TOPLAM", formatTL(sale.total)).size(1).bold(false);
  for (const x of sale.payments) p.cols2(sale.refund ? `İade (${payLabel(x.method)})` : payLabel(x.method), formatTL(x.amount));
  if (sale.change > 0) p.cols2("Para üstü", formatTL(sale.change));
  p.rule().align("center").lines("Bilgi fişidir, mali değeri yoktur.").align("left").feed(3).cut();
  return p.bytes();
}

export type ShiftPrint = {
  deviceName: string; openedByName: string; closedByName: string;
  openingCash: number; openedAt: Date; closedAt: Date | null; countedCash: number | null; expectedCash: number | null;
  summary: ReturnType<typeof summarizeShift>;
};

export function renderShiftReport(s: ShiftPrint, h: ReceiptHeader, o: PrintOpts): Uint8Array {
  const p = new EscPos(o.codepage, o.width);
  const m = s.summary;
  const expected = s.expectedCash ?? m.expectedCash;
  header(p, h);
  p.align("center").bold(true).line(s.closedAt ? "GÜN SONU" : "ARA RAPOR").bold(false).align("left").rule();
  p.cols2("Kasa", s.deviceName).cols2("Açan", s.openedByName).cols2("Açılış", `${date(s.openedAt)} ${time(s.openedAt)}`);
  if (s.closedAt) p.cols2("Kapatan", s.closedByName).cols2("Kapanış", `${date(s.closedAt)} ${time(s.closedAt)}`);
  p.rule().cols2("Satış sayısı", String(m.saleCount));
  if (m.refundCount > 0) p.cols2(`İade (${m.refundCount})`, `-${formatTL(m.refundTotal)}`);
  p.bold(true).cols2("Ciro", formatTL(m.gross)).bold(false);
  for (const x of PAY_METHODS) if (x.value !== "yemek_karti" || m.byMethod.yemek_karti !== 0) p.cols2(x.label, formatTL(m.byMethod[x.value]));
  if (m.vat.length) { p.rule(); for (const v of m.vat) p.cols2(`KDV %${v.rate}  matrah ${formatTL(v.net)}`, formatTL(v.vat)); }
  p.rule().cols2("Açılış nakdi", formatTL(s.openingCash)).bold(true).cols2("Beklenen kasa", formatTL(expected)).bold(false);
  if (s.countedCash !== null) {
    const d = s.countedCash - expected;
    p.cols2("Sayılan nakit", formatTL(s.countedCash)).bold(true).cols2("Fark", `${d < 0 ? "-" : d > 0 ? "+" : ""}${formatTL(Math.abs(d))}`).bold(false);
  }
  p.rule().align("center").lines("Mali Z raporu değildir.").align("left").feed(3).cut();
  return p.bytes();
}
