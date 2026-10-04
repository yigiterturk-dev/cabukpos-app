// lib/admin/currency.ts — #16: işletme para birimi (şema müdürü). Kuruş tamsayısı birimden bağımsız.
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { formatMoney, isCurrency, type Currency } from "@/lib/core/money";

export async function tenantCurrency(tenantId: string): Promise<Currency> {
  const [row] = await getDb().select({ currency: schema.tenants.currency }).from(schema.tenants).where(eq(schema.tenants.id, tenantId));
  return isCurrency(row?.currency) ? row.currency : "TRY";
}

/** Para birimi duyarlı biçimleyici: panellerde `f(k)` olarak kullanılır. */
export const moneyFormatter = async (tenantId: string) => {
  const c = await tenantCurrency(tenantId);
  return (k: number) => formatMoney(k, c);
};
