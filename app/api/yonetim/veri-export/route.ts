import { eq } from "drizzle-orm";
import { getDb, schema, withTenant } from "@/db";
import { requireApiAdmin, apiRole } from "@/lib/auth/api";

export const dynamic = "force-dynamic";

/** İşletme sahibinin taşınabilir veri kopyası. Sırlar, hash'ler ve cihaz jetonları dışarı alınmaz. */
export async function GET(req: Request) {
  const g = await requireApiAdmin(req);
  if (!g.ok) return g.res;
  const denied = apiRole(g.admin, ["sahip"]);
  if (denied) return denied;
  const a = g.admin;

  const db = getDb();
  const [tenant, users, devices, agents, platforms, billing, keys] = await Promise.all([
    db.select({ id: schema.tenants.id, name: schema.tenants.name, vertical: schema.tenants.vertical, taxId: schema.tenants.taxId, taxOffice: schema.tenants.taxOffice, address: schema.tenants.address, createdAt: schema.tenants.createdAt }).from(schema.tenants).where(eq(schema.tenants.id, a.tenantId)),
    db.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.users.role, active: schema.users.active, createdAt: schema.users.createdAt }).from(schema.users).where(eq(schema.users.tenantId, a.tenantId)),
    db.select({ id: schema.devices.id, storeId: schema.devices.storeId, name: schema.devices.name, receiptPrefix: schema.devices.receiptPrefix, role: schema.devices.role, stations: schema.devices.stations, pairedAt: schema.devices.pairedAt, lastSeenAt: schema.devices.lastSeenAt, revokedAt: schema.devices.revokedAt, createdAt: schema.devices.createdAt }).from(schema.devices).where(eq(schema.devices.tenantId, a.tenantId)),
    db.select({ id: schema.agents.id, storeId: schema.agents.storeId, name: schema.agents.name, config: schema.agents.config, lanIp: schema.agents.lanIp, port: schema.agents.port, httpsPort: schema.agents.httpsPort, certExpiresAt: schema.agents.certExpiresAt, version: schema.agents.version, status: schema.agents.status, pairedAt: schema.agents.pairedAt, lastSeenAt: schema.agents.lastSeenAt, revokedAt: schema.agents.revokedAt, createdAt: schema.agents.createdAt }).from(schema.agents).where(eq(schema.agents.tenantId, a.tenantId)),
    db.select({ id: schema.platformConnections.id, storeId: schema.platformConnections.storeId, platform: schema.platformConnections.platform, autoAccept: schema.platformConnections.autoAccept, active: schema.platformConnections.active, createdAt: schema.platformConnections.createdAt }).from(schema.platformConnections).where(eq(schema.platformConnections.tenantId, a.tenantId)),
    db.select({ id: schema.billingPayments.id, provider: schema.billingPayments.provider, period: schema.billingPayments.period, amount: schema.billingPayments.amount, status: schema.billingPayments.status, periodEnd: schema.billingPayments.periodEnd, createdAt: schema.billingPayments.createdAt, paidAt: schema.billingPayments.paidAt }).from(schema.billingPayments).where(eq(schema.billingPayments.tenantId, a.tenantId)),
    db.select({ id: schema.integrationKeys.id, name: schema.integrationKeys.name, scope: schema.integrationKeys.scope, prefix: schema.integrationKeys.prefix, createdAt: schema.integrationKeys.createdAt, lastUsedAt: schema.integrationKeys.lastUsedAt, revokedAt: schema.integrationKeys.revokedAt }).from(schema.integrationKeys).where(eq(schema.integrationKeys.tenantId, a.tenantId)),
  ]);

  const [tenantRow] = tenant;
  const data = await withTenant(a.tenantId, async (tx) => {
    const [stores, staff, categories, products, shifts, sales, saleLines, payments, stockMovements, auditLog, areas, tables, optionGroups, options, productOptionGroups, stations, tabEvents, deliveryZones, customers, customerAddresses, productPlatformCodes, recipeItems, suppliers, purchases, purchaseLines, supplierPayments, productions, fiscalSettings, fiscalDocuments, fiscalRefunds, registerEvents] = await Promise.all([
      tx.select().from(schema.stores),
      tx.select({ id: schema.staff.id, name: schema.staff.name, role: schema.staff.role, active: schema.staff.active, createdAt: schema.staff.createdAt }).from(schema.staff),
      tx.select().from(schema.categories), tx.select().from(schema.products), tx.select().from(schema.shifts),
      tx.select().from(schema.sales), tx.select().from(schema.saleLines), tx.select().from(schema.payments),
      tx.select().from(schema.stockMovements), tx.select().from(schema.auditLog), tx.select().from(schema.areas),
      tx.select().from(schema.tables), tx.select().from(schema.optionGroups), tx.select().from(schema.options),
      tx.select().from(schema.productOptionGroups), tx.select().from(schema.stations), tx.select().from(schema.tabEvents),
      tx.select().from(schema.deliveryZones), tx.select().from(schema.customers), tx.select().from(schema.customerAddresses),
      tx.select().from(schema.productPlatformCodes), tx.select().from(schema.recipeItems), tx.select().from(schema.suppliers),
      tx.select().from(schema.purchases), tx.select().from(schema.purchaseLines), tx.select().from(schema.supplierPayments),
      tx.select().from(schema.productions), tx.select().from(schema.fiscalSettings), tx.select().from(schema.fiscalDocuments),
      tx.select().from(schema.fiscalRefunds), tx.select().from(schema.registerEvents),
    ]);
    return { stores, staff, categories, products, shifts, sales, saleLines, payments, stockMovements, auditLog, areas, tables, optionGroups, options, productOptionGroups, stations, tabEvents, deliveryZones, customers, customerAddresses, productPlatformCodes, recipeItems, suppliers, purchases, purchaseLines, supplierPayments, productions, fiscalSettings, fiscalDocuments, fiscalRefunds, registerEvents };
  });

  const body = JSON.stringify({ exportVersion: 1, exportedAt: new Date().toISOString(), tenant: tenantRow, users, devices, agents, platforms, billing, integrationKeys: keys, ...data });
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const dateParts = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const day = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="cabukpos-veri-${day}.json"`,
      "cache-control": "no-store",
    },
  });
}
