// lib/kasa/sale.ts — Satış kaydı. İdempotent: aynı id → aynı sonuç, yeni fiş no yok.
// M1 çevrimiçi: fiyat/KDV sunucudaki üründen alınır. (M2: çevrimdışı satışta istemci anlık görüntüsü kabul edilecek.)
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { addProduct, totals, type CartLine } from "@/lib/core/cart";
import { isVatRate } from "@/lib/core/money";
import { settle, type Payment } from "@/lib/core/payment";

export type SaleInput = { id: string; lines: { productId: string; qtyMilli: number }[]; payments: Payment[] };
export type SaleCtx = { tenantId: string; storeId: string; deviceId: string; staffId: string; receiptPrefix: string };
export type SaleResult = { ok: true; saleId: string; receiptNo: string; change: number } | { ok: false; error: string };

export async function recordSale(ctx: SaleCtx, input: SaleInput): Promise<SaleResult> {
  if (!/^[0-9a-f-]{36}$/i.test(input.id)) return { ok: false, error: "Geçersiz satış kimliği." };
  if (!input.lines.length) return { ok: false, error: "Sepet boş." };
  if (input.lines.some((l) => !Number.isInteger(l.qtyMilli) || l.qtyMilli <= 0 || l.qtyMilli > 1_000_000)) return { ok: false, error: "Geçersiz miktar." };

  return withTenant(ctx.tenantId, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.id}))`);
    const [done] = await tx.select({ receiptNo: schema.sales.receiptNo, change: schema.sales.change }).from(schema.sales).where(eq(schema.sales.id, input.id));
    if (done) return { ok: true, saleId: input.id, receiptNo: done.receiptNo, change: done.change };

    const [shift] = await tx.select({ id: schema.shifts.id }).from(schema.shifts).where(and(eq(schema.shifts.deviceId, ctx.deviceId), isNull(schema.shifts.closedAt)));
    if (!shift) return { ok: false, error: "Açık vardiya yok; önce vardiya açın." };

    const ids = [...new Set(input.lines.map((l) => l.productId))];
    const prods = await tx.select().from(schema.products).where(and(inArray(schema.products.id, ids), eq(schema.products.active, true)));
    if (prods.length !== ids.length) return { ok: false, error: "Sepetteki bir ürün bulunamadı ya da satıştan kalktı." };
    let cart: CartLine[] = [];
    for (const l of input.lines) {
      const p = prods.find((x) => x.id === l.productId)!;
      if (!isVatRate(p.vatRate)) return { ok: false, error: `${p.name}: KDV oranı geçersiz.` };
      cart = addProduct(cart, { id: p.id, name: p.name, price: p.price, vatRate: p.vatRate }, l.qtyMilli);
    }
    const t = totals(cart);
    const s = settle(t.total, input.payments);
    if (!s.ok) return s;

    const [n] = await tx
      .update(schema.devices)
      .set({ nextReceiptNo: sql`${schema.devices.nextReceiptNo} + 1` })
      .where(and(eq(schema.devices.id, ctx.deviceId), eq(schema.devices.tenantId, ctx.tenantId)))
      .returning({ no: sql<number>`${schema.devices.nextReceiptNo} - 1` });
    const receiptNo = `${ctx.receiptPrefix}-${String(n.no).padStart(6, "0")}`;

    await tx.insert(schema.sales).values({ id: input.id, tenantId: ctx.tenantId, storeId: ctx.storeId, deviceId: ctx.deviceId, shiftId: shift.id, staffId: ctx.staffId, receiptNo, total: t.total, change: s.change, vat: t.vat });
    await tx.insert(schema.saleLines).values(cart.map((l) => ({ tenantId: ctx.tenantId, saleId: input.id, productId: l.productId, name: l.name, unitPrice: l.unitPrice, vatRate: l.vatRate, qtyMilli: l.qtyMilli, total: Math.round((l.unitPrice * l.qtyMilli) / 1000) })));
    await tx.insert(schema.payments).values(s.payments.map((p) => ({ tenantId: ctx.tenantId, saleId: input.id, method: p.method, amount: p.amount })));
    return { ok: true, saleId: input.id, receiptNo, change: s.change };
  });
}
