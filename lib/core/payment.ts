// lib/core/payment.ts — Ödeme kapatma (saf). Kart/yemek kartı toplamı aşamaz; para üstü yalnız nakitten.
import { formatTL, type Kurus } from "./money";

export const PAY_METHODS = [
  { value: "nakit", label: "Nakit" },
  { value: "kart", label: "Kart" },
  { value: "yemek_karti", label: "Yemek kartı" },
] as const;
export type PayMethod = (typeof PAY_METHODS)[number]["value"];
export type Payment = { method: PayMethod; amount: Kurus };
export type Settlement = { ok: true; payments: Payment[]; paid: Kurus; change: Kurus } | { ok: false; error: string };

export function settle(total: Kurus, input: Payment[]): Settlement {
  if (input.some((p) => !Number.isInteger(p.amount) || p.amount <= 0 || !PAY_METHODS.some((m) => m.value === p.method))) return { ok: false, error: "Geçersiz tutar ya da ödeme türü." };
  const merged = new Map<PayMethod, Kurus>();
  for (const p of input) merged.set(p.method, (merged.get(p.method) ?? 0) + p.amount);
  const payments = [...merged].map(([method, amount]) => ({ method, amount }));
  const nonCash = payments.filter((p) => p.method !== "nakit").reduce((a, p) => a + p.amount, 0);
  if (nonCash > total) return { ok: false, error: "Kart ve yemek kartı tutarı toplamı aşamaz." };
  const paid = payments.reduce((a, p) => a + p.amount, 0);
  if (paid < total) return { ok: false, error: `Eksik ödeme: ${formatTL(total - paid)}` };
  return { ok: true, payments, paid, change: paid - total };
}
