// lib/sync/docs.ts — Kasa → bulut eşitleme belgeleri (istemci ve sunucu ortak, saf).
// Belgeler değişmez; kimlik istemcide üretilir, bulut aynı kimliği ikinci kez yazmaz.
import { z } from "zod";
import { VAT_RATES } from "@/lib/core/money";
import { PAY_METHODS } from "@/lib/core/payment";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const kurus = z.number().int().min(0).max(100_000_000);
const at = z.iso.datetime({ offset: true });

export const saleLineDoc = z.object({
  productId: uuid,
  name: z.string().min(1).max(120),
  unitPrice: kurus,
  vatRate: z.union(VAT_RATES.map((r) => z.literal(r)) as [z.ZodLiteral<1>, z.ZodLiteral<10>, z.ZodLiteral<20>]),
  qtyMilli: z.number().int().min(1).max(1_000_000),
});

export const syncDoc = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("sale"),
    id: uuid,
    shiftId: uuid,
    staffId: uuid,
    receiptSeq: z.number().int().min(1).max(99_999_999),
    at,
    lines: z.array(saleLineDoc).min(1).max(500),
    payments: z.array(z.object({ method: z.enum(PAY_METHODS.map((m) => m.value) as ["nakit", "kart", "yemek_karti"]), amount: kurus.min(1) })).min(1).max(10),
  }),
  z.object({ kind: z.literal("shift_open"), id: uuid, staffId: uuid, at, openingCash: kurus }),
  z.object({ kind: z.literal("shift_close"), id: uuid, staffId: uuid, at, countedCash: kurus }),
]);

export type SyncDoc = z.infer<typeof syncDoc>;
export type SaleDoc = Extract<SyncDoc, { kind: "sale" }>;
export type DocResult = { id: string; ok: true } | { id: string; ok: false; error: string };

/** Cihaz öneki + sıra → "K1-000042". Kasada ve bulutta aynı. */
export const formatReceipt = (prefix: string, seq: number) => `${prefix}-${String(seq).padStart(6, "0")}`;

/** Eşitleme yeniden denemesi: 2 s, 4 s, 8 s … en çok 5 dk. */
export const backoffMs = (failures: number) => Math.min(300_000, 2000 * 2 ** Math.max(0, failures - 1));

export const PUSH_BATCH = 50;
