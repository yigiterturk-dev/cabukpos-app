// lib/offline/state.ts — Kasa yerel durumunun şekli ve saf uzlaştırma kuralları (tarayıcı + test).
import type { RefundFiscal } from "@/lib/core/refundNote";
import type { BillingState } from "@/lib/core/billing";
import type { VatRate, Currency } from "@/lib/core/money";
import type { VatLine } from "@/lib/core/cart";
import type { Payment } from "@/lib/core/payment";
import type { SyncDoc } from "@/lib/sync/docs";
import type { KasaAgent, LanLink } from "@/lib/agent/config";
import type { LineOption, OptionGroup } from "@/lib/core/options";
import type { Buyer, ChannelModes } from "@/lib/core/fiscal";

export type DeviceRole = "kasa" | "garson" | "mutfak" | "kurye";
export type DeviceInfo = { id: string; name: string; receiptPrefix: string; tenantName: string; vertical: "restoran" | "market"; role?: DeviceRole; stations?: string[]; storeName: string; storeAddress: string | null; nextReceiptNo: number; billing?: { state: BillingState; daysLeft: number } | null; currency?: Currency }; // #16: fiş/rapor para birimi (eski kayıtlarda yok → TRY)
export type KasaProduct = { id: string; name: string; price: number; vatRate: VatRate; categoryId: string | null; barcodes: string[]; kind: "adet" | "tartili"; plu: string | null; quick: boolean; stationId?: string | null; optionGroupIds?: string[] };
export type KasaStaff = { id: string; name: string; role: "kasiyer" | "mudur" | "garson" | "kurye"; pinHash?: string };
export type Area = { id: string; name: string };
export type Table = { id: string; areaId: string; name: string };
export type Station = { id: string; name: string; printer: string | null };
export type DeliveryZone = { id: string; name: string; fee: number; minOrder: number; perKm: number | null; startMin: number | null; endMin: number | null };
// #50: fiyat listesi / happy hour (market + restoran; kasa satır eklerken uygular)
export type KasaPriceList = { id: string; name: string; kind?: "fiyat" | "yuzde"; percent?: number | null; categoryIds?: string[] | null; days: number[]; startMin: number; endMin: number; storeId: string | null; items: { productId: string; price: number }[] };
// M5: restoran salonu (market kataloğunda yok)
export type Catalog = { categories: { id: string; name: string }[]; products: KasaProduct[]; staff: KasaStaff[]; areas?: Area[]; tables?: Table[]; stations?: Station[]; optionGroups?: OptionGroup[]; deliveryZones?: DeliveryZone[]; priceLists?: KasaPriceList[]; fiscal?: { modes: ChannelModes; provider: string; sellerTaxId?: string | null } };
export type LocalShift = { id: string; openedBy: string; openedAt: string; openingCash: number };
export type ClosedShift = LocalShift & { closedBy: string; closedAt: string; countedCash: number; expectedCash: number; dropped: number };
/** #48: vardiyada seifeye alınan paralar (safe drop); beklenen kasadan düşer. */
export type CashDrop = { id: string; at: string; amount: number; by: string };
/** Re-pair sıfırlaması kullanıcıya haber verilir: kaç bekleyen belge reddedildi listesine taşındı, neden. (#24) */
export type ResetNotice = { at: string; reason: string; pending: number };

export type Meta = {
  key: "state";
  v: string | null; // katalog içerik özeti
  device: DeviceInfo | null;
  catalog: Catalog;
  shift: LocalShift | null;
  lastClosed: ClosedShift | null; // gün sonu raporu yeniden yazdırılabilsin
  nextSeq: number; // sıradaki fiş sırası
  pinFails: number;
  pinLockUntil: number;
  agent?: KasaAgent | null; // M4: şubedeki yerel ajan (yoksa null/undefined → tarayıcı yazdırma)
  lan?: LanLink | null; // LAN merkezi: kasa dışı cihazın adisyon akışı (yazdırma yok)
  resetNotice?: ResetNotice | null; // son re-pair sıfırlamasının bildirimi; "Anladım" ile temizlenir
  drops?: CashDrop[]; // #48: açık vardiyanın safe-drop'ları; kapanınca temizlenir
};

export type LocalSale = {
  id: string; shiftId: string; staffId: string; staffName: string; seq: number; receiptNo: string; at: string;
  lines: { productId: string | null; name: string; unitPrice: number; vatRate: VatRate; qtyMilli: number; options?: LineOption[]; note?: string | null; discount?: number }[];
  payments: Payment[]; total: number; change: number; vat: VatLine[];
  tip?: number; // #49: bahşiş — toplamın içinde
  discount?: number; customerId?: string | null; // #33: kupon + puan indirimi / sadakat müşterisi
  tabId?: string; tableName?: string; // M5: masadan parça ödeme (M6: paket/platform başlığı)
  refund?: boolean; refundOf?: string; refundOfNo?: string; approvedBy?: string; // iade fişi
  fiscal?: { token: string; buyer: Buyer | null; number: string | null; ettn: string | null }; // M8 e-Arşiv
  refundFiscal?: RefundFiscal; // iade: asıl satış e-Arşiv'liyse tutanak / alıcı faturası notu
};
export type OutboxRow = { n?: number; id: string; doc: SyncDoc };
export type RejectedRow = { id: string; doc: SyncDoc; error: string; at: string };

export const emptyMeta = (): Meta => ({ key: "state", v: null, device: null, catalog: { categories: [], products: [], staff: [] }, shift: null, lastClosed: null, nextSeq: 1, pinFails: 0, pinLockUntil: 0 });

export const PIN_MAX_FAILS = 5;
export const PIN_LOCK_MS = 5 * 60_000;

/**
 * Buluttan gelen cihaz durumunu yerel duruma işler.
 * - Fiş sırası geri gitmez: max(yerel, bulut).
 * - Giden kutusu boşsa bulut vardiyada yetkilidir (yönetimden kapatılmış olabilir); doluysa yerel vardiya korunur.
 */
export function reconcile(meta: Meta, server: { v: string; device: DeviceInfo; openShift: LocalShift | null; catalog: Catalog | null; agent?: KasaAgent | null; lan?: LanLink | null }, pending: number): Meta {
  return {
    ...meta,
    agent: server.agent ?? null,
    lan: server.lan ?? null,
    device: server.device,
    v: server.catalog ? server.v : meta.v,
    catalog: server.catalog ?? meta.catalog,
    nextSeq: Math.max(meta.nextSeq, server.device.nextReceiptNo),
    shift: pending > 0 ? meta.shift : server.openShift,
  };
}
