// lib/core/transfer.ts — Şubeler arası stok transferi kuralları (saf).
// Kaynak ve hedef aynı olamaz; miktar pozitif olmalı ve kaynak şubedeki mevcut stoktan fazla olamaz.

export type TransferProblem = "same-store" | "qty" | "insufficient";
export const MAX_TRANSFER_LINES = 20;

export function transferProblem(input: {
  fromStoreId: string;
  toStoreId: string;
  qtyMilli: number;
  level: number;
}): TransferProblem | null {
  if (input.fromStoreId === input.toStoreId) return "same-store";
  if (!Number.isSafeInteger(input.qtyMilli) || input.qtyMilli <= 0) return "qty";
  if (input.qtyMilli > input.level) return "insufficient";
  return null;
}
