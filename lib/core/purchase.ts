// lib/core/purchase.ts — Alış fişi ve tedarikçi bakiyesi. Tutarlar KDV dahil kuruş.
import type { Kurus } from "./money";

export type PurchaseLineInput = { qtyMilli: number; unitCost: Kurus };

export const purchaseLineTotal = (l: PurchaseLineInput): Kurus => Math.round(l.qtyMilli * l.unitCost / 1000);
export const purchaseTotal = (lines: PurchaseLineInput[]): Kurus => lines.reduce((s, l) => s + purchaseLineTotal(l), 0);

/** Eski tarihli fiş son fiyatı ezmez. */
export function shouldUpdateCost(date: Date | string, costAt: Date | string | null | undefined): boolean {
  return costAt == null || new Date(date).getTime() >= new Date(costAt).getTime();
}

/** Pozitif = borcumuz. İptal alışlar sayılmaz. */
export function supplierBalance(purchases: { total: Kurus; status: string }[], payments: { amount: Kurus }[]): Kurus {
  return purchases.reduce((s, p) => s + (p.status === "iptal" ? 0 : p.total), 0) - payments.reduce((s, p) => s + p.amount, 0);
}
