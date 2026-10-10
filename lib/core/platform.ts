// lib/core/platform.ts — Platform siparişi → adisyon olayları. Saf; bulut (webhook) ve testler kullanır.
// Eşlenen dış kod ürünün adı/KDV'si/istasyonuyla, fiyat platformdan (müşterinin ödediği) gelir.
// Eşlenmeyen satır serbest satırdır (productId null): sipariş düşer, yönetimde eşleme uyarısı çıkar.
import type { Kurus, VatRate } from "./money";
import type { PayIntent, TabEv } from "./tab";

export type IncomingOrder = {
  externalId: string;
  customer: { name: string; phone: string };
  address: string; directions: string | null; note: string | null;
  payIntent: PayIntent; deadline: string | null;
  lines: { code: string; name: string; unitPrice: Kurus; qtyMilli: number; note: string | null }[];
  raw?: unknown;
};

export type MappedProduct = { id: string; name: string; vatRate: VatRate; stationId: string | null };

export const PLATFORM_NAMES: Record<string, string> = { mock: "Deneme", yemeksepeti: "Yemeksepeti", trendyol: "Trendyol Go", getir: "Getir", migros: "Migros Yemek", tiklagelsin: "Tıkla Gelsin", kiosk: "Kiosk / QR" };

/** Otomatik kabulün varsayılan hazırlık süresi (dk) — oto-kabul ve yönetim kabulü aynı süreyi kullanır. */
export const AUTO_PREP_MIN = 20;

export function toTabEvents(o: IncomingOrder, platform: string, codes: Map<string, MappedProduct>, newId: () => string): { events: TabEv[]; unmapped: number } {
  let unmapped = 0;
  const adds: TabEv[] = o.lines.map((l) => {
    const p = codes.get(l.code);
    if (!p) unmapped++;
    return { type: "add", lineId: newId(), productId: p?.id ?? null, name: p?.name ?? l.name, unitPrice: l.unitPrice, vatRate: p?.vatRate ?? 10, qtyMilli: l.qtyMilli, options: [], note: l.note, stationId: p?.stationId ?? null };
  });
  const events: TabEv[] = [
    { type: "open", guests: 0, kind: "platform" },
    {
      type: "order", customerId: null, name: o.customer.name, phone: o.customer.phone, address: o.address, directions: o.directions, zoneId: null,
      note: o.note, payIntent: o.payIntent, promisedAt: null, source: { platform, externalId: o.externalId, deadline: o.deadline, raw: o.raw },
    },
    ...adds,
  ];
  return { events, unmapped };
}

/** Gönderilmemiş satırlar istasyona göre biletlere (kabulde / kasada "Mutfağa gönder"). */
export function sendByStation(lines: { lineId: string; stationId: string | null }[], newId: () => string): Extract<TabEv, { type: "send" }>[] {
  const by = new Map<string | null, string[]>();
  for (const l of lines) by.set(l.stationId, [...(by.get(l.stationId) ?? []), l.lineId]);
  return [...by].map(([stationId, lineIds]) => ({ type: "send", ticketId: newId(), lineIds, stationId }));
}
