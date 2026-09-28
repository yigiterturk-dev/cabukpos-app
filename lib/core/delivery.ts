// lib/core/delivery.ts — Paket servis: telefon, bölge ücreti, paket fişi, kurye nakdi. Saf.
import { EscPos, type Codepage, type PaperWidth } from "./escpos";
import { formatTL, type Kurus } from "./money";
import { qtyText } from "./receipt";
import { lineGross, type OrderInfo, type PayIntent, type TabEv, type TabState } from "./tab";

/** "0532 123 45 67", "+90 532…", "5321234567" → "905321234567". Türkiye dışı/eksik → null. */
export function normalizePhone(input: string): string | null {
  const d = input.replace(/\D/g, "");
  if (d.length === 10 && !d.startsWith("0")) return `90${d}`;
  if (d.length === 11 && d.startsWith("0")) return `9${d}`;
  if (d.length === 12 && d.startsWith("90")) return d;
  return null;
}

/** "905321234567" → "0532 123 45 67" */
export const formatPhone = (p: string) => (/^90\d{10}$/.test(p) ? `0${p.slice(2, 5)} ${p.slice(5, 8)} ${p.slice(8, 10)} ${p.slice(10)}` : p);

export type Zone = { id: string; name: string; fee: Kurus; minOrder: Kurus };

/** Asgari tutar uyarıdır, engel değil (kasiyer karar verir). */
export const zoneCheck = (zone: Zone | null, subtotal: Kurus) => ({ fee: zone?.fee ?? 0, belowMin: Boolean(zone && zone.minOrder > 0 && subtotal < zone.minOrder) });

export const FEE_NAME = "Paket servis ücreti";

/** Paket ücreti serbest satırı (ürünsüz, KDV %10). */
export const feeLine = (lineId: string, fee: Kurus): Extract<TabEv, { type: "add" }> =>
  ({ type: "add", lineId, productId: null, name: FEE_NAME, unitPrice: fee, vatRate: 10, qtyMilli: 1000, options: [], note: null, stationId: null });

export const PAY_INTENTS: { value: PayIntent; label: string }[] = [
  { value: "nakit", label: "Nakit" },
  { value: "kart", label: "Kart (kapıda)" },
  { value: "yemek_karti", label: "Yemek kartı" },
  { value: "online", label: "Online ödendi" },
];
export const intentLabel = (v: PayIntent | null) => PAY_INTENTS.find((x) => x.value === v)?.label ?? "";

/** Kuryenin üzerindeki nakit: teslim ettiği, nakit tahsil edilmiş siparişlerin toplamı. */
export function courierCash(tabs: Iterable<TabState>, courierId: string): Kurus {
  let sum = 0;
  for (const t of tabs) if (t.delivery.courierId === courierId && t.delivery.deliveredAt && t.delivery.method === "nakit" && !t.delivery.cancelled) sum += t.total;
  return sum;
}

export type SlipData = { title: string; at: string; order: OrderInfo; zoneName: string | null; lines: { qtyMilli: number; name: string; unitPrice: Kurus; note: string | null; options: { name: string }[] }[]; total: Kurus };

const TZ = "Europe/Istanbul";

/** Paket fişi: kuryenin çantasına giden kâğıt (adres + tutar + ödeme niyeti). */
export function renderDeliverySlip(s: SlipData, o: { width: PaperWidth; codepage: Codepage }): Uint8Array {
  const p = new EscPos(o.codepage, o.width);
  const d = new Date(s.at);
  p.align("center").bold(true).size(2, 2).line("PAKET").size(1).line(s.title).bold(false);
  p.line(d.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: TZ }));
  p.align("left").rule().bold(true).lines(s.order.name).lines(formatPhone(s.order.phone)).bold(false);
  p.lines(s.order.address);
  if (s.order.directions) p.lines(`Tarif: ${s.order.directions}`);
  if (s.zoneName) p.line(`Bölge: ${s.zoneName}`);
  if (s.order.note) p.lines(`! ${s.order.note}`);
  p.rule();
  for (const l of s.lines) {
    p.cols2(`${qtyText(l.qtyMilli)} x ${l.name}`, formatTL(lineGross(l)));
    for (const op of l.options) p.lines(`  + ${op.name}`);
    if (l.note) p.lines(`  ! ${l.note}`);
  }
  p.rule().bold(true).size(2).cols2("TOPLAM", formatTL(s.total)).size(1).line(`Ödeme: ${intentLabel(s.order.payIntent)}`).bold(false);
  p.feed(3).cut();
  return p.bytes();
}
