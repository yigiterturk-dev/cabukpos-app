// lib/core/payment.ts — Ödeme kapatma (saf). Kart/yemek kartı toplamı aşamaz; para üstü yalnız nakitten.
import { formatTL, type Kurus } from "./money";

export const PAY_METHODS = [
  { value: "nakit", label: "Nakit" },
  { value: "kart", label: "Kart" },
  { value: "yemek_karti", label: "Yemek kartı", rare: true },
  { value: "hediye_karti", label: "Hediye kartı", rare: true },
  // M6: platformda/online ödenmiş paket; kasada seçilemez, raporda yalnız varsa görünür
  { value: "online", label: "Online", rare: true, internal: true },
] as const;
/** Raporda gösterilecek yöntemler: sık olanlar her zaman, seyrekler yalnız tutar varsa. */
export const shownMethods = (byMethod: Record<PayMethod, Kurus>) => PAY_METHODS.filter((m) => !("rare" in m) || byMethod[m.value] !== 0);
export const SELECTABLE_METHODS = PAY_METHODS.filter((m) => !("internal" in m));
export type PayMethod = (typeof PAY_METHODS)[number]["value"];
export type Payment = { method: PayMethod; amount: Kurus };
/** Payment amounts must fit the maximum serialized sync amount (1.000.000,00). */
export const MAX_PAYMENT_KURUS = 100_000_000;
export type Settlement = { ok: true; payments: Payment[]; paid: Kurus; change: Kurus } | { ok: false; error: string };

export function settle(total: Kurus, input: Payment[]): Settlement {
  if (input.some((p) => !Number.isInteger(p.amount) || p.amount <= 0 || p.amount > MAX_PAYMENT_KURUS || !PAY_METHODS.some((m) => m.value === p.method))) return { ok: false, error: "Geçersiz tutar ya da ödeme türü; yöntem başına üst sınır 1.000.000,00." };
  const merged = new Map<PayMethod, Kurus>();
  for (const p of input) merged.set(p.method, (merged.get(p.method) ?? 0) + p.amount);
  const payments = [...merged].map(([method, amount]) => ({ method, amount }));
  const nonCash = payments.filter((p) => p.method !== "nakit").reduce((a, p) => a + p.amount, 0);
  if (nonCash > total) return { ok: false, error: "Nakit dışındaki ödemelerin toplamı, ödenecek tutarı aşamaz." };
  const paid = payments.reduce((a, p) => a + p.amount, 0);
  if (paid < total) return { ok: false, error: `Eksik ödeme: ${formatTL(total - paid)}` };
  return { ok: true, payments, paid, change: paid - total };
}
