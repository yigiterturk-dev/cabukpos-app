// lib/core/fiscal.ts — Mali belge saf yardımcıları: kanal modu, VKN/TCKN, numara, yeniden deneme.
import { z } from "zod";

export const FISCAL_CHANNELS = ["kasa", "masa", "paket", "platform"] as const;
export type Channel = (typeof FISCAL_CHANNELS)[number];
export type DocMode = "info" | "earsiv";
export type ChannelModes = Record<Channel, DocMode>;
export const DEFAULT_MODES: ChannelModes = { kasa: "info", masa: "info", paket: "info", platform: "info" };

export const NIHAI_TUKETICI = { taxId: "11111111111", name: "Nihai Tüketici" } as const;

function validVkn(s: string): boolean {
  const d = [...s].map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const t = (d[i] + 10 - (i + 1)) % 10;
    const v = t === 0 ? 0 : (t * 2 ** (9 - i)) % 9 || 9;
    sum += v;
  }
  return (10 - (sum % 10)) % 10 === d[9];
}

function validTckn(s: string): boolean {
  const d = [...s].map(Number);
  if (d[0] === 0) return false;
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  if ((((odd * 7 - even) % 10) + 10) % 10 !== d[9]) return false;
  return d.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === d[10];
}

export function validateTaxId(s: string): "vkn" | "tckn" | null {
  if (/^\d{10}$/.test(s)) return validVkn(s) ? "vkn" : null;
  if (/^\d{11}$/.test(s)) return s === NIHAI_TUKETICI.taxId || validTckn(s) ? "tckn" : null;
  return null;
}

export function docModeFor(channel: Channel, modes: Partial<ChannelModes> | null | undefined, invoiceRequested: boolean): DocMode {
  if (invoiceRequested) return "earsiv";
  return modes?.[channel] ?? DEFAULT_MODES[channel];
}

export function formatNumber(series: string, year: number, n: number): string {
  if (!/^[A-Z0-9]{3}$/.test(series)) throw new Error("Seri 3 büyük harf/rakam olmalı");
  if (!Number.isInteger(n) || n < 1 || n > 999_999_999) throw new Error("Sıra 1..999999999 olmalı");
  return `${series}${year}${String(n).padStart(9, "0")}`;
}

const RETRY_MIN = [1, 5, 15, 60];
export const MAX_ATTEMPTS = 5;

/** attempts = yapılmış deneme sayısı; null = otomatik deneme bitti. */
export function nextRetryDue(attempts: number, lastTry: Date): Date | null {
  if (attempts < 1) return lastTry;
  if (attempts >= MAX_ATTEMPTS) return null;
  return new Date(lastTry.getTime() + RETRY_MIN[attempts - 1] * 60_000);
}

export const buyerSchema = z
  .object({
    taxId: z.string().trim().refine((s) => validateTaxId(s) !== null, "Geçersiz VKN/TCKN"),
    name: z.string().trim().min(1, "Ad/unvan gerekli").max(200),
    email: z.string().trim().max(254, "E-posta en fazla 254 karakter olabilir").email("Geçersiz e-posta").optional().or(z.literal("").transform(() => undefined)),
    address: z.string().trim().max(500).optional(),
  })
  .superRefine((b, ctx) => {
    if (validateTaxId(b.taxId) === "vkn" && !b.address) ctx.addIssue({ code: "custom", path: ["address"], message: "VKN'de adres zorunlu" });
  });
export type Buyer = z.infer<typeof buyerSchema>;

export function newFiscalToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(18));
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_");
}
