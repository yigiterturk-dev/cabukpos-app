// lib/billing/invoice.ts — #14: SaaS'ın kendi abonelik e-Arşiv faturası (satıcı ÇabukPOS, alıcı kiracı).
// RLS'siz tablo; yalnız buradan erişilir. Gerçek entegratör #17'de tek noktadan bağlanır (şimdilik fake-earsiv).
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { getDb, schema, type Tx } from "@/db";
import { buyerSchema, formatNumber, MAX_ATTEMPTS, newFiscalToken, NIHAI_TUKETICI, type Buyer } from "@/lib/core/fiscal";
import { splitVat } from "@/lib/core/money";
import { getProvider, type IssueInput } from "@/lib/fiscal/provider";

const I = schema.billingInvoices, T = schema.tenants, P = schema.billingPayments;

/** SaaS satıcı künyesi; env eksikse fatura denenmez (bekler). */
export const saasSeller = () => {
  const name = process.env.SAAS_NAME, taxId = process.env.SAAS_TAX_ID, address = process.env.SAAS_ADDRESS;
  return name && taxId && address ? { name, taxId, address, taxOffice: process.env.SAAS_TAX_OFFICE ?? null } : null;
};
export const saasSeries = () => (process.env.SAAS_SERIES || "CBP").toUpperCase();
const trYear = (d: Date) => Number(new Intl.DateTimeFormat("en", { timeZone: "Europe/Istanbul", year: "numeric" }).format(d));

const buyerOf = (t: { name: string; taxId: string | null; address: string | null }): Buyer =>
  t.taxId ? { taxId: t.taxId, name: t.name, ...(t.address ? { address: t.address } : {}) } : { ...NIHAI_TUKETICI };

/** Ödeme anında (aynı işlemde) bekleyen fatura açar; paymentId unique → idempotent. */
export async function openSubscriptionInvoice(tx: Tx, tenantId: string, paymentId: string) {
  const [t] = await tx.select({ name: T.name, taxId: T.taxId, address: T.address }).from(T).where(eq(T.id, tenantId));
  if (!t) return;
  await tx.insert(I).values({ paymentId, tenantId, buyer: buyerOf(t), token: newFiscalToken() }).onConflictDoNothing();
}

const failRow = (error: string) => ({ status: "error", attempts: sql`${I.attempts} + 1`, lastError: error.slice(0, 500), lastTryAt: new Date() } as const);

/** Bekleyen faturayı keser. Sayaç yalnız başarılı kesimde yanar; sağlayıcı hatasında geri alınır. */
export async function issueSubscriptionInvoice(invoiceId: string): Promise<boolean> {
  const seller = saasSeller();
  return getDb().transaction(async (tx) => {
    const [inv] = await tx.select().from(I).where(and(eq(I.id, invoiceId), inArray(I.status, ["pending", "error"]))).for("update");
    if (!inv) return false;
    if (!seller) {
      await tx.update(I).set(failRow("SaaS satıcı bilgisi eksik (SAAS_NAME/SAAS_TAX_ID/SAAS_ADDRESS)")).where(eq(I.id, inv.id));
      return false;
    }
    const b = buyerSchema.safeParse(inv.buyer);
    if (!b.success) {
      await tx.update(I).set(failRow(`Alıcı bilgisi geçersiz: ${b.error.issues[0]?.message ?? ""}`)).where(eq(I.id, inv.id));
      return false;
    }
    const [p] = await tx.select().from(P).where(eq(P.id, inv.paymentId));
    if (!p || p.status !== "odendi") return false;
    const at = p.paidAt ?? p.createdAt, year = trYear(at);
    const [s] = await tx.insert(schema.billingInvoiceCounters).values({ year, counter: 1 })
      .onConflictDoUpdate({ target: schema.billingInvoiceCounters.year, set: { counter: sql`${schema.billingInvoiceCounters.counter} + 1` } }).returning();
    const number = formatNumber(saasSeries(), year, s.counter);
    const { net, vat } = splitVat(p.amount, 20);
    const input: IssueInput = {
      seller,
      buyer: b.data,
      lines: [{ name: `ÇabukPOS aboneliği (${p.period === "yillik" ? "Yıllık" : "Aylık"})`, qty: 1, unitPrice: p.amount, vatRate: 20, total: p.amount }],
      vat: [{ rate: 20, gross: p.amount, net, vat }],
      discount: 0, total: p.amount, soldAt: at, number,
    };
    let r;
    try { r = await getProvider(inv.provider, { fakeFail: false }).issue(input); }
    catch (e) { r = { ok: false as const, error: e instanceof Error ? e.message : "Sağlayıcı hatası", retryable: true }; }
    if (!r.ok) {
      await tx.update(schema.billingInvoiceCounters).set({ counter: s.counter - 1 }).where(eq(schema.billingInvoiceCounters.year, year));
      await tx.update(I).set(failRow(r.error)).where(eq(I.id, inv.id));
      return false;
    }
    await tx.update(I).set({ status: "issued", ettn: r.ettn, number: r.number, issuedAt: new Date(), lastTryAt: new Date(), attempts: sql`${I.attempts} + 1`, lastError: null }).where(eq(I.id, inv.id));
    return true;
  });
}

/** Günlük cron: kesilememiş abonelik faturaları. */
export const dueSubscriptionInvoices = (limit = 20) =>
  getDb().select({ id: I.id }).from(I).where(and(inArray(I.status, ["pending", "error"]), lt(I.attempts, MAX_ATTEMPTS))).orderBy(I.createdAt).limit(limit);
