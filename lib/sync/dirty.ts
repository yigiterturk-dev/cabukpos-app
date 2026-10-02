// lib/sync/dirty.ts — Bulut→istemci itme belirteci: kiracıda "değişen bir şey var mı"nın ucuz imzası.
// Katalog içerik hash'i (catalog?v=) burada hesaplanmaz; belirteç değişince istemci kick() ile hafif katalog çekimi yapar.
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

export async function syncToken(tenantId: string): Promise<string> {
  const db = getDb();
  const [sales, tabs, shifts, devices] = await Promise.all([
    db.select({ m: sql<string>`coalesce(max(${schema.sales.syncedAt})::text, '-')` }).from(schema.sales).where(eq(schema.sales.tenantId, tenantId)),
    db.select({ m: sql<string>`coalesce(max(${schema.tabEvents.seq})::text, '-')` }).from(schema.tabEvents).where(eq(schema.tabEvents.tenantId, tenantId)),
    db.select({ m: sql<string>`coalesce(max(${schema.shifts.openedAt})::text, '-') || coalesce(max(${schema.shifts.closedAt})::text, '-')` }).from(schema.shifts).where(eq(schema.shifts.tenantId, tenantId)),
    db.select({ m: sql<string>`coalesce(max(${schema.devices.pairedAt})::text, '-') || coalesce(sum(${schema.devices.nextReceiptNo})::text, '-')` }).from(schema.devices).where(eq(schema.devices.tenantId, tenantId)),
  ]);
  return [sales[0]?.m, tabs[0]?.m, shifts[0]?.m, devices[0]?.m].join("|");
}
