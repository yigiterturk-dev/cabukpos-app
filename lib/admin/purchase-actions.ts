"use server";
// Alış fişi, tedarikçi kartı, tedarikçi ödemesi. Kayıt mantığı lib/admin/purchase.ts; her yazma requireWriter + withTenant (RLS) + denetim kaydı.
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { schema, withTenant } from "@/db";
import { requireWriter } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { parseTL } from "@/lib/core/money";
import { parseQty, stockUnitOf } from "@/lib/core/stock";
import { cancelPurchase as cancelTx, recordPurchase } from "./purchase";
import { firstStoreId } from "./stock";

export type PurchaseState = { error?: string; field?: string; savedAt?: number };
const UUID = /^[0-9a-f-]{36}$/i;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const today = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);

function parseDate(s: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) return null;
  return s <= today() && s >= "2020-01-01" ? s : null;
}

export async function savePurchase(_: PurchaseState, form: FormData): Promise<PurchaseState> {
  const a = await requireWriter();
  const supplierId = str(form, "supplierId") || null;
  if (supplierId && !UUID.test(supplierId)) return { error: "Tedarikçi geçersiz.", field: "supplierId" };
  const date = parseDate(str(form, "date"));
  if (!date) return { error: "Tarih geçersiz (ileri tarih olmaz).", field: "date" };
  const docNo = str(form, "docNo").slice(0, 40) || null;
  const note = str(form, "note").slice(0, 200) || null;
  const pids = form.getAll("pid").map(String), qtys = form.getAll("qty").map(String), prices = form.getAll("price").map(String);
  const raw = pids.map((pid, i) => ({ pid, qty: qtys[i] ?? "", price: prices[i] ?? "" })).filter((l) => l.pid || l.qty.trim() || l.price.trim());
  if (!raw.length) return { error: "En az bir kalem girin.", field: "lines" };
  if (raw.some((l) => !UUID.test(l.pid))) return { error: "Her kalemde ürün seçin.", field: "lines" };
  const err = await withTenant(a.tenantId, async (tx): Promise<PurchaseState | null> => {
    const P = schema.products;
    const units = new Map((await tx.select({ id: P.id, name: P.name, kind: P.kind, unit: P.unit, sellable: P.sellable }).from(P)).map((p) => [p.id, p]));
    const lines = [];
    for (const l of raw) {
      const p = units.get(l.pid);
      if (!p) return { error: "Ürün bulunamadı.", field: "lines" };
      const unit = stockUnitOf(p);
      const qtyMilli = parseQty(l.qty, unit);
      if (qtyMilli === null) return { error: `${p.name}: miktar ${unit === "adet" ? "tam sayı" : `${unit} (ör. 2,5)`} olmalı.`, field: "lines" };
      const unitCost = parseTL(l.price);
      if (unitCost === null || unitCost > 10_000_000) return { error: `${p.name}: birim fiyat geçersiz (ör. 20,00).`, field: "lines" };
      lines.push({ productId: l.pid, qtyMilli, unitCost });
    }
    const storeId = await firstStoreId(tx);
    if (!storeId) return { error: "Şube yok." };
    const r = await recordPurchase(tx, a.tenantId, a.id, { storeId, supplierId, docNo, date, note, lines });
    if ("error" in r) return { error: r.error, field: "lines" };
    await audit(tx, a.tenantId, `user:${a.id}`, "purchase.create", { id: r.id, supplierId, docNo, date, lines });
    return null;
  });
  if (err) return err;
  revalidatePath("/yonetim/alislar");
  revalidatePath("/yonetim/stok");
  return { savedAt: Date.now() };
}

export async function cancelPurchase(id: string) {
  const a = await requireWriter();
  if (!UUID.test(id)) return;
  await withTenant(a.tenantId, async (tx) => {
    if (await cancelTx(tx, a.id, id)) return;
    await audit(tx, a.tenantId, `user:${a.id}`, "purchase.cancel", { id });
  });
  revalidatePath("/yonetim/alislar");
  revalidatePath("/yonetim/stok");
  revalidatePath("/yonetim/tedarikciler");
}

export async function saveSupplier(id: string | null, _: PurchaseState, form: FormData): Promise<PurchaseState> {
  const a = await requireWriter();
  if (id && !UUID.test(id)) return { error: "Tedarikçi bulunamadı." };
  const name = str(form, "name");
  if (name.length < 2 || name.length > 80) return { error: "Ad 2-80 karakter.", field: "name" };
  const v = { name, phone: str(form, "phone").slice(0, 30) || null, taxNo: str(form, "taxNo").slice(0, 20) || null, note: str(form, "note").slice(0, 200) || null };
  if (v.taxNo && !/^\d{10,11}$/.test(v.taxNo)) return { error: "Vergi / TC no 10-11 hane.", field: "taxNo" };
  const err = await withTenant(a.tenantId, async (tx) => {
    const S = schema.suppliers;
    if (id) {
      const [row] = await tx.update(S).set(v).where(eq(S.id, id)).returning({ id: S.id });
      if (!row) return "Tedarikçi bulunamadı.";
    } else await tx.insert(S).values({ tenantId: a.tenantId, ...v });
    await audit(tx, a.tenantId, `user:${a.id}`, id ? "supplier.update" : "supplier.create", { id, name });
    return null;
  });
  if (err) return { error: err };
  revalidatePath("/yonetim/tedarikciler");
  return { savedAt: Date.now() };
}

export async function addSupplierPayment(supplierId: string, _: PurchaseState, form: FormData): Promise<PurchaseState> {
  const a = await requireWriter();
  if (!UUID.test(supplierId)) return { error: "Tedarikçi bulunamadı." };
  const amount = parseTL(str(form, "amount"));
  if (!amount || amount > 100_000_000) return { error: "Tutar geçersiz (ör. 1.500,00).", field: "amount" };
  const method = str(form, "method");
  if (method !== "nakit" && method !== "havale" && method !== "kart") return { error: "Ödeme şekli geçersiz.", field: "method" };
  const date = parseDate(str(form, "date"));
  if (!date) return { error: "Tarih geçersiz (ileri tarih olmaz).", field: "date" };
  const note = str(form, "note").slice(0, 200) || null;
  const err = await withTenant(a.tenantId, async (tx) => {
    const [s] = await tx.select({ id: schema.suppliers.id }).from(schema.suppliers).where(eq(schema.suppliers.id, supplierId));
    if (!s) return "Tedarikçi bulunamadı.";
    await tx.insert(schema.supplierPayments).values({ tenantId: a.tenantId, supplierId, amount, method, date, note, createdBy: a.id });
    await audit(tx, a.tenantId, `user:${a.id}`, "supplier.payment", { supplierId, amount, method, date });
    return null;
  });
  if (err) return { error: err };
  revalidatePath("/yonetim/tedarikciler");
  return { savedAt: Date.now() };
}
