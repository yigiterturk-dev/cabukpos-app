// lib/sync/docs.ts — Kasa → bulut eşitleme belgeleri (istemci ve sunucu ortak, saf).
// Belgeler değişmez; kimlik istemcide üretilir, bulut aynı kimliği ikinci kez yazmaz.
import { z } from "zod";
import { VAT_RATES } from "@/lib/core/money";
import { PAY_METHODS } from "@/lib/core/payment";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const kurus = z.number().int().min(0).max(100_000_000);
const at = z.iso.datetime({ offset: true });

export const saleLineDoc = z.object({
  productId: uuid.nullable(), // M6: serbest satır (paket ücreti, eşlenmeyen platform ürünü)
  name: z.string().min(1).max(120),
  unitPrice: kurus,
  vatRate: z.union(VAT_RATES.map((r) => z.literal(r)) as [z.ZodLiteral<1>, z.ZodLiteral<10>, z.ZodLiteral<20>]),
  qtyMilli: z.number().int().min(1).max(1_000_000),
  // M5 masa: seçenekler (birim fiyata dahil), not, indirim payı (ikram + adisyon indirimi)
  options: z.array(z.object({ id: uuid, name: z.string().min(1).max(80), delta: z.number().int().min(-100_000_000).max(100_000_000) })).max(20).optional(),
  note: z.string().max(200).nullable().optional(),
  discount: kurus.optional(),
});

const reason = z.string().max(200);
const vatRate = saleLineDoc.shape.vatRate;
export const tabEv = z.discriminatedUnion("type", [
  z.object({ type: z.literal("open"), guests: z.number().int().min(0).max(999), kind: z.enum(["masa", "paket", "platform"]).optional() }),
  z.object({
    type: z.literal("add"), lineId: uuid, productId: uuid.nullable(), name: z.string().min(1).max(120), unitPrice: kurus, vatRate,
    qtyMilli: z.number().int().min(1).max(1_000_000), options: saleLineDoc.shape.options.unwrap(), note: z.string().max(200).nullable(), stationId: uuid.nullable(),
  }),
  z.object({ type: z.literal("void"), lineId: uuid, reason }),
  z.object({ type: z.literal("send"), ticketId: uuid, lineIds: z.array(uuid).min(1).max(200), stationId: uuid.nullable() }),
  z.object({ type: z.literal("move"), toTableId: uuid }),
  z.object({ type: z.literal("comp"), lineId: uuid, reason }),
  z.object({ type: z.literal("discount"), percent: z.number().int().min(1).max(100).nullable(), amount: kurus.nullable(), reason }),
  z.object({ type: z.literal("bill") }),
  z.object({ type: z.literal("kitchen"), ticketId: uuid, status: z.enum(["hazirlaniyor", "hazir", "teslim"]) }),
  z.object({ type: z.literal("printed"), ticketId: uuid }),
  z.object({ type: z.literal("close"), reason }),
  // M6 paket/platform
  z.object({
    type: z.literal("order"), customerId: uuid.nullable(), name: z.string().trim().min(1).max(120), phone: z.string().regex(/^\d{6,15}$/),
    address: z.string().trim().min(1).max(500), directions: z.string().max(300).nullable(), zoneId: uuid.nullable(), note: z.string().max(300).nullable(),
    payIntent: z.enum(["nakit", "kart", "yemek_karti", "online"]), promisedAt: at.nullable(),
    source: z.object({ platform: z.string().min(1).max(40), externalId: z.string().min(1).max(120), deadline: at.nullable(), raw: z.unknown().optional() }).nullable(),
  }),
  z.object({ type: z.literal("accept"), prepMin: z.number().int().min(1).max(240) }),
  z.object({ type: z.literal("reject"), reason }),
  z.object({ type: z.literal("courier"), staffId: uuid.nullable() }),
  z.object({ type: z.literal("out") }),
  z.object({ type: z.literal("delivered"), method: z.enum(["nakit", "kart", "yemek_karti", "online"]) }),
  z.object({ type: z.literal("handover") }),
  z.object({ type: z.literal("cancel"), reason }),
]);
const paidLine = z.object({ lineId: uuid, qtyMilli: z.number().int().min(1).max(1_000_000), discount: kurus });

const payMethod = z.enum(PAY_METHODS.map((m) => m.value) as ["nakit", "kart", "yemek_karti", "online"]);

export const syncDoc = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("sale"),
    id: uuid,
    shiftId: uuid,
    staffId: uuid,
    receiptSeq: z.number().int().min(1).max(99_999_999),
    at,
    lines: z.array(saleLineDoc).min(1).max(500),
    payments: z.array(z.object({ method: payMethod, amount: kurus.min(1) })).min(1).max(10),
    // M5: masa adisyonundan parça ödeme
    tab: z.object({ tabId: uuid, tableId: uuid.nullable(), paidLines: z.array(paidLine).min(1).max(500) }).optional(),
  }),
  // İade: fiş no ile, müdür onaylı, tek yöntemle geri ödeme. Aynı fiş sayacından numara alır.
  z.object({
    kind: z.literal("refund"),
    id: uuid,
    shiftId: uuid,
    staffId: uuid,
    approvedBy: uuid,
    refundOf: uuid,
    receiptSeq: z.number().int().min(1).max(99_999_999),
    at,
    lines: z.array(saleLineDoc).min(1).max(500),
    payments: z.array(z.object({ method: payMethod, amount: kurus.min(1) })).length(1),
  }),
  // M5: adisyon olayı (garson/kasa/mutfak). Ödeme olayı ayrı belge değil: masadan satış (tab alanı) bulutta "paid" olayı üretir.
  z.object({ kind: z.literal("tab"), id: uuid, tabId: uuid, tableId: uuid.nullable(), at, staffId: uuid.nullable(), approvedBy: uuid.nullable(), ev: tabEv }),
  z.object({ kind: z.literal("shift_open"), id: uuid, staffId: uuid, at, openingCash: kurus }),
  z.object({ kind: z.literal("shift_close"), id: uuid, staffId: uuid, at, countedCash: kurus }),
  // Yetkili işlem kaydı (M4: elle çekmece açma). Kimlik audit_log.id olur → tekrar gelirse ikinci kayıt yok.
  z.object({ kind: z.literal("audit"), id: uuid, staffId: uuid, approvedBy: uuid.nullable(), at, action: z.enum(["cekmece"]) }),
]);

export type SyncDoc = z.infer<typeof syncDoc>;
export type SaleDoc = Extract<SyncDoc, { kind: "sale" }>;
export type RefundDoc = Extract<SyncDoc, { kind: "refund" }>;
export type TabDoc = Extract<SyncDoc, { kind: "tab" }>;
export type DocResult = { id: string; ok: true } | { id: string; ok: false; error: string };

/** Cihaz öneki + sıra → "K1-000042". Kasada ve bulutta aynı. */
export const formatReceipt = (prefix: string, seq: number) => `${prefix}-${String(seq).padStart(6, "0")}`;

/** Elle yazılan fiş no: "k1-42" → "K1-000042"; "K1-000042-2" korunur. Biçim dışıysa null. */
export function normalizeReceiptNo(input: string): string | null {
  const m = /^([A-Z0-9]{1,4})-(\d{1,6})(-\d{1,3})?$/.exec(input.trim().toUpperCase());
  return m ? `${formatReceipt(m[1], Number(m[2]))}${m[3] ?? ""}` : null;
}

/** Eşitleme yeniden denemesi: 2 s, 4 s, 8 s … en çok 5 dk. */
export const backoffMs = (failures: number) => Math.min(300_000, 2000 * 2 ** Math.max(0, failures - 1));

export const PUSH_BATCH = 50;
