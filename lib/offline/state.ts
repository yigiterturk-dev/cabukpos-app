// lib/offline/state.ts — Kasa yerel durumunun şekli ve saf uzlaştırma kuralları (tarayıcı + test).
import type { VatRate } from "@/lib/core/money";
import type { VatLine } from "@/lib/core/cart";
import type { Payment } from "@/lib/core/payment";
import type { SyncDoc } from "@/lib/sync/docs";

export type DeviceInfo = { id: string; name: string; receiptPrefix: string; tenantName: string; vertical: "restoran" | "market"; storeName: string; storeAddress: string | null; nextReceiptNo: number };
export type KasaProduct = { id: string; name: string; price: number; vatRate: VatRate; categoryId: string | null; barcodes: string[] };
export type KasaStaff = { id: string; name: string; role: "kasiyer" | "mudur"; pinHash: string };
export type Catalog = { categories: { id: string; name: string }[]; products: KasaProduct[]; staff: KasaStaff[] };
export type LocalShift = { id: string; openedBy: string; openedAt: string; openingCash: number };
export type ClosedShift = LocalShift & { closedBy: string; closedAt: string; countedCash: number; expectedCash: number };

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
};

export type LocalSale = {
  id: string; shiftId: string; staffId: string; staffName: string; seq: number; receiptNo: string; at: string;
  lines: { productId: string; name: string; unitPrice: number; vatRate: VatRate; qtyMilli: number }[];
  payments: Payment[]; total: number; change: number; vat: VatLine[];
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
export function reconcile(meta: Meta, server: { v: string; device: DeviceInfo; openShift: LocalShift | null; catalog: Catalog | null }, pending: number): Meta {
  return {
    ...meta,
    device: server.device,
    v: server.catalog ? server.v : meta.v,
    catalog: server.catalog ?? meta.catalog,
    nextSeq: Math.max(meta.nextSeq, server.device.nextReceiptNo),
    shift: pending > 0 ? meta.shift : server.openShift,
  };
}
