// loadBusinessState — DB'den tam BusinessState kurar (server-only, tenant-scope'lu).
//
// withTenant tek transaction'da tüm tabloları çeker; RLS + eq(businessId) backstop birlikte.
// Çıktı, lib/store.tsx'teki BusinessState ile BİREBİR aynı şekildedir (UI değişmesin).
// Server-only: db/* import zinciri (db/index.ts window guard'ı) client'ta patlar.

import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { withTenant } from "@/db/tenant";
import type { BusinessState } from "@/lib/types";
import {
  camelizeRows,
  DEFAULT_REMINDER_SETTINGS,
  rowToAppointment,
  rowToCampaign,
  rowToCustomer,
  rowToExpense,
  rowToInvoice,
  rowToPayment,
  rowToReminderLog,
  rowToService,
  rowToStaff,
  rowToSubscription,
} from "./map";

type Row = Record<string, unknown>;

/**
 * Verilen businessId için tam BusinessState'i DB'den okur.
 * İşletme bulunamazsa null döner.
 */
export async function loadBusinessState(businessId: string): Promise<BusinessState | null> {
  const [
    businessRows,
    serviceRows,
    staffRows,
    customerRows,
    appointmentRows,
    campaignRows,
    reminderLogRows,
    subscriptionRows,
    invoiceRows,
    paymentRows,
    expenseRows,
  ] = await withTenant(businessId, () => [
    db.select().from(schema.businesses).where(eq(schema.businesses.id, businessId)),
    db.select().from(schema.services).where(eq(schema.services.businessId, businessId)),
    db.select().from(schema.staff).where(eq(schema.staff.businessId, businessId)),
    db.select().from(schema.customers).where(eq(schema.customers.businessId, businessId)),
    db.select().from(schema.appointments).where(eq(schema.appointments.businessId, businessId)),
    db.select().from(schema.campaigns).where(eq(schema.campaigns.businessId, businessId)),
    db.select().from(schema.reminderLogs).where(eq(schema.reminderLogs.businessId, businessId)),
    db.select().from(schema.subscriptions).where(eq(schema.subscriptions.businessId, businessId)),
    db.select().from(schema.invoices).where(eq(schema.invoices.businessId, businessId)),
    db.select().from(schema.payments).where(eq(schema.payments.businessId, businessId)),
    db.select().from(schema.expenses).where(eq(schema.expenses.businessId, businessId)),
  ]);

  // Ham (snake_case) satırları $inferSelect (camelCase) şekline çevir.
  const business = camelizeRows<typeof schema.businesses.$inferSelect>(businessRows as Row[])[0];
  if (!business) return null;

  const subRow = camelizeRows<typeof schema.subscriptions.$inferSelect>(
    subscriptionRows as Row[]
  )[0];

  return {
    sector: business.sector ?? null,
    businessName: business.name,
    phone: business.phone ?? undefined,
    bookingSlug: business.bookingSlug,
    services: camelizeRows<typeof schema.services.$inferSelect>(serviceRows as Row[]).map((r) =>
      rowToService(r, businessId)
    ),
    staff: camelizeRows<typeof schema.staff.$inferSelect>(staffRows as Row[]).map((r) =>
      rowToStaff(r, businessId)
    ),
    customers: camelizeRows<typeof schema.customers.$inferSelect>(customerRows as Row[]).map((r) =>
      rowToCustomer(r, businessId)
    ),
    appointments: camelizeRows<typeof schema.appointments.$inferSelect>(appointmentRows as Row[]).map(
      (r) => rowToAppointment(r, businessId)
    ),
    campaigns: camelizeRows<typeof schema.campaigns.$inferSelect>(campaignRows as Row[]).map((r) =>
      rowToCampaign(r, businessId)
    ),
    reminderSettings: business.reminderSettings ?? DEFAULT_REMINDER_SETTINGS,
    reminderLogs: camelizeRows<typeof schema.reminderLogs.$inferSelect>(reminderLogRows as Row[]).map(
      (r) => rowToReminderLog(r, businessId)
    ),
    subscription: subRow
      ? rowToSubscription(subRow)
      : { planId: "profesyonel", startedAt: "", nextRenewal: "" },
    invoices: camelizeRows<typeof schema.invoices.$inferSelect>(invoiceRows as Row[]).map((r) =>
      rowToInvoice(r, businessId)
    ),
    payments: camelizeRows<typeof schema.payments.$inferSelect>(paymentRows as Row[]).map((r) =>
      rowToPayment(r, businessId)
    ),
    expenses: camelizeRows<typeof schema.expenses.$inferSelect>(expenseRows as Row[]).map((r) =>
      rowToExpense(r, businessId)
    ),
  };
}
