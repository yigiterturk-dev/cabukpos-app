// lib/delivery/customers.ts — Müşteri defteri sorguları (kasa araması, yönetim). Kiracı içinde (RLS).
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { normalizePhone } from "@/lib/core/delivery";
import { foldTabs, type TabEv } from "@/lib/core/tab";
import { toTabEvent } from "@/lib/sync/apply";

export type CustomerLookup = {
  customer: { id: string; name: string; phone: string; note: string | null } | null;
  addresses: { id: string; label: string | null; address: string; directions: string | null; zoneId: string | null }[];
  recent: { tabId: string; at: string; total: number; lines: Extract<TabEv, { type: "add" }>[] }[];
};

const RECENT = 5;

/** Telefonla müşteri + adresler + son paket siparişleri (satırlar "tekrarla" için). */
export function lookupCustomer(tenantId: string, storeId: string, phoneInput: string): Promise<CustomerLookup | null> {
  const phone = normalizePhone(phoneInput);
  if (!phone) return Promise.resolve(null);
  return withTenant(tenantId, async (tx) => {
    const C = schema.customers, A = schema.customerAddresses, E = schema.tabEvents;
    const [customer] = await tx.select({ id: C.id, name: C.name, phone: C.phone, note: C.note }).from(C).where(eq(C.phone, phone));
    if (!customer) return { customer: null, addresses: [], recent: [] };
    const addresses = await tx.select({ id: A.id, label: A.label, address: A.address, directions: A.directions, zoneId: A.zoneId }).from(A)
      .where(and(eq(A.customerId, customer.id), eq(A.deleted, false))).orderBy(desc(A.lastUsedAt));
    // Telefon olayda ham yazılmış olabilir → rakamlarının normalize hâliyle eşleştir (son 90 günün siparişleri).
    const orders = await tx.select({ tabId: E.tabId, at: E.at, phone: sql<string>`${E.payload}->>'phone'` }).from(E)
      .where(and(eq(E.storeId, storeId), eq(E.type, "order"), sql`${E.at} > now() - interval '90 days'`, sql`regexp_replace(${E.payload}->>'phone', '\\D', '', 'g') like ${`%${phone.slice(2)}`}`))
      .orderBy(desc(E.at)).limit(RECENT * 3);
    const tabIds = [...new Set(orders.filter((o) => normalizePhone(o.phone) === phone).map((o) => o.tabId))].slice(0, RECENT);
    const events = tabIds.length ? (await tx.select().from(E).where(inArray(E.tabId, tabIds)).orderBy(E.seq)).map(toTabEvent) : [];
    const tabs = foldTabs(events);
    const recent = tabIds.flatMap((id) => {
      const t = tabs.get(id);
      if (!t || t.delivery.cancelled || t.delivery.rejected) return [];
      const lines = t.lines.filter((l) => !l.voided && l.productId).map(({ type, lineId, productId, name, unitPrice, vatRate, qtyMilli, options, note, stationId }) => ({ type, lineId, productId, name, unitPrice, vatRate, qtyMilli, options, note, stationId }));
      return lines.length ? [{ tabId: id, at: t.openedAt, total: t.total, lines }] : [];
    });
    return { customer, addresses, recent };
  });
}
