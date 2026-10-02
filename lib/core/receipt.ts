// lib/core/receipt.ts — Bilgi fişi ve gün sonu raporunun ESC/POS hâli (ekrandaki fişle aynı içerik).
import { formatTL } from "./money";
import { PAY_METHODS, shownMethods } from "./payment";
import type { Payment } from "./payment";
import type { VatLine } from "./cart";
import type { summarizeShift } from "./shift";
import { EscPos, BRANDS, fromBase64, type Codepage, type PaperWidth, type PrinterBrand } from "./escpos";
import type { LogoImg } from "./png";
import { refundNote, type RefundFiscal } from "./refundNote";

export type PrintOpts = { width: PaperWidth; codepage: Codepage; brand?: PrinterBrand; drawer?: boolean; appUrl?: string; logo?: LogoImg | null };
/** M8: e-Arşiv. number yoksa henüz kesilmedi (çevrimdışı/gecikme) → bağlantı ya da e-posta notu. */
export type ReceiptFiscal = { token: string; number: string | null; ettn: string | null; buyer: { name: string; email?: string } | null; test?: boolean };
export const fiscalLink = (appUrl: string, token: string) => `${appUrl.replace(/\/$/, "")}/f/${token}`;
/** Ekrandaki ve basılı fişte aynı metin. */
export function fiscalNotes(f: ReceiptFiscal, appUrl: string): { title: string | null; rows: [string, string][]; notes: string[]; url: string } {
  const url = fiscalLink(appUrl, f.token);
  const rows: [string, string][] = [];
  if (f.buyer && f.buyer.name !== "Nihai Tüketici") rows.push(["Alıcı", f.buyer.name]);
  if (f.number) {
    rows.push(["e-Arşiv No", f.number]);
    return { title: "e-ARŞİV FATURA", rows, notes: [`ETTN: ${f.ettn ?? ""}`, ...(f.test ? ["TEST — mali değeri yoktur"] : [])], url };
  }
  return { title: null, rows, notes: [f.buyer?.email ? "Faturanız e-postayla gönderilecek." : `Faturanız: ${url}`], url };
}
export type ReceiptSale = {
  receiptNo: string; at: string; staffName: string;
  lines: { productId: string | null; name: string; unitPrice: number; qtyMilli: number; options?: { name: string }[]; note?: string | null; discount?: number }[];
  payments: Payment[]; total: number; change: number; vat: VatLine[];
  refund?: boolean; refundOfNo?: string; tableName?: string;
  fiscal?: ReceiptFiscal;
  refundFiscal?: RefundFiscal; // e-Arşiv'li satışın iadesi → tutanak / alıcı faturası notu
};
export type ReceiptHeader = { tenantName: string; storeName: string; storeAddress: string | null };

const TZ = "Europe/Istanbul";
const date = (d: Date) => d.toLocaleDateString("tr-TR", { timeZone: TZ });
const time = (d: Date) => d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const payLabel = (m: string) => PAY_METHODS.find((p) => p.value === m)?.label ?? m;
export const qtyText = (m: number, weighed = false) =>
  weighed ? `${(m / 1000).toLocaleString("tr-TR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`
    : m % 1000 === 0 ? String(m / 1000) : (m / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 3 });

function header(p: EscPos, h: ReceiptHeader, logo: LogoImg | null | undefined) {
  if (logo) {
    try { p.align("center").raster({ width: logo.w, data: fromBase64(logo.data) }).feed(1).align("left"); }
    catch { /* bozuk logo fişi bloklamasın */ }
  }
  p.align("center").bold(true).size(2).lines(h.tenantName).size(1).bold(false);
  if (h.storeName) p.lines(h.storeName);
  if (h.storeAddress) p.lines(h.storeAddress);
  p.align("left");
}

/** weighed(productId): tartılı ürün mü (miktar kg gösterilir). */
export function renderReceipt(sale: ReceiptSale, h: ReceiptHeader, o: PrintOpts, weighed: (id: string) => boolean = () => false): Uint8Array {
  const p = new EscPos(o.codepage, o.width, o.brand ?? "genel");
  const at = new Date(sale.at);
  if (o.drawer) p.drawer();
  header(p, h, o.logo);
  if (sale.refund) p.align("center").bold(true).line("İADE FİŞİ").bold(false).align("left");
  p.rule().cols2(date(at), time(at)).cols2("Fiş no", sale.receiptNo);
  if (sale.refund && sale.refundOfNo) p.cols2("Asıl fiş", sale.refundOfNo);
  if (sale.tableName) p.cols2("Masa", sale.tableName);
  p.cols2("Kasiyer", sale.staffName).rule();
  for (const l of sale.lines) {
    p.lines(l.name);
    for (const o of l.options ?? []) p.lines(`  + ${o.name}`);
    p.cols2(`  ${qtyText(l.qtyMilli, Boolean(l.productId && weighed(l.productId)))} x ${formatTL(l.unitPrice)}`, formatTL(Math.round((l.unitPrice * l.qtyMilli) / 1000)));
    if (l.discount) p.cols2("  İndirim", `-${formatTL(l.discount)}`);
  }
  p.rule();
  for (const v of sale.vat) p.cols2(`KDV %${v.rate}  matrah ${formatTL(v.net)}`, formatTL(v.vat));
  p.rule().bold(true).size(2).cols2(sale.refund ? "İADE" : "TOPLAM", formatTL(sale.total)).size(1).bold(false);
  for (const x of sale.payments) p.cols2(sale.refund ? `İade (${payLabel(x.method)})` : payLabel(x.method), formatTL(x.amount));
  if (sale.change > 0) p.cols2("Para üstü", formatTL(sale.change));
  const f = sale.fiscal && o.appUrl ? fiscalNotes(sale.fiscal, o.appUrl) : null;
  if (f) {
    p.rule();
    if (f.title) p.align("center").bold(true).line(f.title).bold(false).align("left");
    for (const [k, v] of f.rows) p.cols2(k, v);
    for (const n of f.notes) p.lines(n);
    p.align("center").qr(f.url).align("left");
  }
  const rn = sale.refund && sale.refundFiscal ? refundNote(sale.refundFiscal, h.tenantName, sale.receiptNo) : null;
  if (rn?.kind === "note") p.rule().lines(rn.text);
  if (rn?.kind === "tutanak") {
    p.rule().align("center").bold(true).line(rn.title).bold(false).align("left");
    for (const [k, v] of rn.rows) if (k === "ETTN") p.lines(`${k}: ${v}`); else p.cols2(k, v);
    p.lines(rn.statement);
    for (const s of rn.sign) p.line().line(`${s}: `.padEnd(o.width === 58 ? 32 : 48, "."));
  }
  if (!f?.title) p.rule().align("center").lines("Bilgi fişidir, mali değeri yoktur.").align("left");
  // Fiş no barkodu (#36): iade/kasa sorgusunda el girişi yerine okutma.
  p.align("center").barcode(sale.receiptNo).align("left");
  p.feed(3).cut();
  return p.bytes();
}

export type ShiftPrint = {
  deviceName: string; openedByName: string; closedByName: string;
  openingCash: number; openedAt: Date; closedAt: Date | null; countedCash: number | null; expectedCash: number | null;
  summary: ReturnType<typeof summarizeShift>;
  fiscalErrors?: number;
};

export function renderShiftReport(s: ShiftPrint, h: ReceiptHeader, o: PrintOpts): Uint8Array {
  const p = new EscPos(o.codepage, o.width, o.brand ?? "genel");
  const m = s.summary;
  const expected = s.expectedCash ?? m.expectedCash;
  header(p, h, o.logo);
  p.align("center").bold(true).line(s.closedAt ? "GÜN SONU" : "ARA RAPOR").bold(false).align("left").rule();
  p.cols2("Kasa", s.deviceName).cols2("Açan", s.openedByName).cols2("Açılış", `${date(s.openedAt)} ${time(s.openedAt)}`);
  if (s.closedAt) p.cols2("Kapatan", s.closedByName).cols2("Kapanış", `${date(s.closedAt)} ${time(s.closedAt)}`);
  p.rule().cols2("Satış sayısı", String(m.saleCount));
  if (m.refundCount > 0) p.cols2(`İade (${m.refundCount})`, `-${formatTL(m.refundTotal)}`);
  p.bold(true).cols2("Ciro", formatTL(m.gross)).bold(false);
  for (const x of shownMethods(m.byMethod)) p.cols2(x.label, formatTL(m.byMethod[x.value]));
  if (m.vat.length) { p.rule(); for (const v of m.vat) p.cols2(`KDV %${v.rate}  matrah ${formatTL(v.net)}`, formatTL(v.vat)); }
  p.rule().cols2("Açılış nakdi", formatTL(s.openingCash)).bold(true).cols2("Beklenen kasa", formatTL(expected)).bold(false);
  if (s.countedCash !== null) {
    const d = s.countedCash - expected;
    p.cols2("Sayılan nakit", formatTL(s.countedCash)).bold(true).cols2("Fark", `${d < 0 ? "-" : d > 0 ? "+" : ""}${formatTL(Math.abs(d))}`).bold(false);
  }
  if (s.fiscalErrors) p.rule().bold(true).cols2("Kesilemeyen e-Arşiv", String(s.fiscalErrors)).bold(false);
  p.rule().align("center").lines("Mali Z raporu değildir.").align("left").feed(3).cut();
  return p.bytes();
}
