// DB satırı ↔ store tipi dönüştürücüleri (server-only).
//
// Amaç: lib/store.tsx'teki BusinessState şekliyle BİREBİR aynı objeleri üretmek,
// böylece UI (lib/store.tsx tüketicileri) hiç değişmeden DB'ye bağlanabilsin.
//
// Drizzle $inferSelect tipleri null kullanır (kolon nullable ise), store tipleri ise
// `?` (undefined) kullanır. Bu katman null → undefined normalizasyonunu da yapar,
// store'un ürettiği objelerle JSON-eşdeğer çıktı vermek için.

import type {
  Appointment,
  Campaign,
  Customer,
  Invoice,
  Expense,
  MeasurementRecord,
  Payment,
  PetInfo,
  ReminderLog,
  ReminderSettings,
  Service,
  Staff,
  Subscription,
  TreatmentRecord,
  VaccineRecord,
} from "@/lib/types";
import type {
  appointments,
  businesses,
  campaigns,
  customers,
  expenses,
  invoices,
  payments,
  reminderLogs,
  services,
  staff,
  subscriptions,
} from "@/db/schema";

type ServiceRow = typeof services.$inferSelect;
type StaffRow = typeof staff.$inferSelect;
type CustomerRow = typeof customers.$inferSelect;
type AppointmentRow = typeof appointments.$inferSelect;
type CampaignRow = typeof campaigns.$inferSelect;
type ReminderLogRow = typeof reminderLogs.$inferSelect;
type SubscriptionRow = typeof subscriptions.$inferSelect;
type InvoiceRow = typeof invoices.$inferSelect;
type BusinessRow = typeof businesses.$inferSelect;
type PaymentRow = typeof payments.$inferSelect;
type ExpenseRow = typeof expenses.$inferSelect;

// null → undefined (store tipleri `?` kullanır; `undefined` JSON'da alanı düşürür)
const u = <T,>(v: T | null | undefined): T | undefined => (v == null ? undefined : v);

// ---------------------------------------------------------------------------
// id NAMESPACING (kritik — çoklu-kiracı PK çakışması çözümü)
//
// Veri tabloları (services/staff/customers/appointments/...) text PK kullanır ve store
// id'leri sektör-sabittir ("svc-1", "stf-1", "cus-1", "apt-1"...). Bu id'ler şemada GLOBAL
// PK olduğundan, iki farklı işletme aynı "svc-1"i yazmaya çalışınca PK çakışır (services_pkey).
//
// ÇÖZÜM (şemaya dokunmadan, veri katmanında): yazarken id'lerin başına işletmeye özel kısa
// bir önek koy ("<biz8>__svc-1"). FK referansları (serviceId/staffId/customerId) da AYNI
// fonksiyonla öneklenir → iç tutarlılık korunur. OKURKEN önek soyulur → BusinessState store
// şekliyle BİREBİR ("svc-1") döner, UI hiç değişmez. Önek businessId'den türediği için
// işletmeler arası global benzersizlik garanti.
// ---------------------------------------------------------------------------
const NS_SEP = "__";

/** businessId'den kararlı kısa önek (uuid'in ilk 8 hex'i). */
function nsPrefix(businessId: string): string {
  return businessId.replace(/-/g, "").slice(0, 8);
}
/** Store id → DB id (önekli). Zaten önekliyse tekrar eklemez. */
export function nsId(businessId: string, id: string): string {
  const p = nsPrefix(businessId) + NS_SEP;
  return id.startsWith(p) ? id : p + id;
}
/** DB id → store id (önek soyulmuş). Önek yoksa olduğu gibi döner. */
export function stripNs(businessId: string, id: string): string {
  const p = nsPrefix(businessId) + NS_SEP;
  return id.startsWith(p) ? id.slice(p.length) : id;
}

// KRİTİK: withTenant ham neon client'ı kullanır (b.toSQL() → client.query). Drizzle'ın
// row mapper'ı DEVREDE DEĞİL → satırlar snake_case kolon adlarıyla gelir (duration_min...).
// Bu yardımcı, snake_case ham satırı $inferSelect şekline (camelCase) çevirir. Tüm read
// sitelerinde mapper'lara vermeden önce çağrılır. (jsonb değerleri olduğu gibi kalır.)
function snakeToCamel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}
export function camelizeRow<T = Record<string, unknown>>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const k in row) out[snakeToCamel(k)] = row[k];
  return out as T;
}
export function camelizeRows<T = Record<string, unknown>>(rows: Record<string, unknown>[]): T[] {
  return rows.map((r) => camelizeRow<T>(r));
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: true,
  channel: "whatsapp",
  hoursBefore: 24,
  template: "",
};

// ---- DB → store ----

export function rowToService(r: ServiceRow, businessId: string): Service {
  return {
    id: stripNs(businessId, r.id),
    name: r.name,
    durationMin: r.durationMin,
    price: r.price,
    commissionRate: r.commissionRate,
    active: u(r.active),
  };
}

export function rowToStaff(r: StaffRow, businessId: string): Staff {
  return {
    id: stripNs(businessId, r.id),
    name: r.name,
    role: r.role,
    color: r.color,
    initials: r.initials,
    workStart: u(r.workStart),
    workEnd: u(r.workEnd),
    // serviceIds, service id'lerine referans → onlar da soyulmalı
    serviceIds: r.serviceIds ? r.serviceIds.map((s) => stripNs(businessId, s)) : undefined,
    active: u(r.active),
  };
}

export function rowToCustomer(r: CustomerRow, businessId: string): Customer {
  return {
    id: stripNs(businessId, r.id),
    name: r.name,
    phone: r.phone,
    note: u(r.note),
    birthday: u(r.birthday),
    createdAt: r.createdAt,
    pet: u(r.pet) as PetInfo | undefined,
    vaccines: u(r.vaccines) as VaccineRecord[] | undefined,
    treatments: u(r.treatments) as TreatmentRecord[] | undefined,
    measurements: u(r.measurements) as MeasurementRecord[] | undefined,
    heightCm: u(r.heightCm),
    targetWeightKg: u(r.targetWeightKg),
  };
}

export function rowToAppointment(r: AppointmentRow, businessId: string): Appointment {
  return {
    id: stripNs(businessId, r.id),
    date: r.date,
    start: r.start,
    staffId: stripNs(businessId, r.staffId),
    customerId: stripNs(businessId, r.customerId),
    serviceId: stripNs(businessId, r.serviceId),
    status: r.status,
    source: u(r.source),
    approval: u(r.approval),
    priceSnapshot: u(r.priceSnapshot),
    commissionRateSnapshot: u(r.commissionRateSnapshot),
    serviceNameSnapshot: u(r.serviceNameSnapshot),
    staffNameSnapshot: u(r.staffNameSnapshot),
  };
}

export function rowToCampaign(r: CampaignRow, businessId: string): Campaign {
  return {
    id: stripNs(businessId, r.id),
    title: r.title,
    kind: r.kind,
    channel: r.channel,
    message: r.message,
    audience: r.audience,
    reach: r.reach,
    active: r.active,
    createdAt: r.createdAt,
  };
}

export function rowToReminderLog(r: ReminderLogRow, businessId: string): ReminderLog {
  return {
    id: stripNs(businessId, r.id),
    at: r.at,
    channel: r.channel,
    to: r.to,
    text: r.text,
    status: r.status,
  };
}

export function rowToSubscription(r: SubscriptionRow): Subscription {
  return {
    planId: r.planId,
    startedAt: r.startedAt,
    nextRenewal: r.nextRenewal,
  };
}

export function rowToInvoice(r: InvoiceRow, businessId: string): Invoice {
  return {
    id: stripNs(businessId, r.id),
    date: r.date,
    amount: r.amount,
    planLabel: r.planLabel,
    status: r.status,
  };
}

export function rowToPayment(r: PaymentRow, businessId: string): Payment {
  return {
    id: stripNs(businessId, r.id),
    date: r.date,
    amount: r.amount,
    method: r.method,
    // customerId/appointmentId FK referansları → önekleri soyulur
    customerId: r.customerId ? stripNs(businessId, r.customerId) : undefined,
    appointmentId: r.appointmentId ? stripNs(businessId, r.appointmentId) : undefined,
    note: u(r.note),
    createdAt: r.createdAt,
  };
}

export function rowToExpense(r: ExpenseRow, businessId: string): Expense {
  return {
    id: stripNs(businessId, r.id),
    date: r.date,
    amount: r.amount,
    category: r.category,
    note: u(r.note),
    createdAt: r.createdAt,
  };
}

export function rowToReminderSettings(r: BusinessRow): ReminderSettings {
  return r.reminderSettings ?? DEFAULT_REMINDER_SETTINGS;
}

// ---- store → DB insert değerleri ----
// (businessId çağıran tarafça eklenir; burada sadece alan eşlemesi yapılır)

export function serviceToInsert(s: Service, businessId: string): typeof services.$inferInsert {
  return {
    id: nsId(businessId, s.id),
    businessId,
    name: s.name,
    durationMin: s.durationMin,
    price: s.price,
    commissionRate: s.commissionRate,
    active: s.active ?? true,
  };
}

export function staffToInsert(s: Staff, businessId: string): typeof staff.$inferInsert {
  return {
    id: nsId(businessId, s.id),
    businessId,
    name: s.name,
    role: s.role,
    color: s.color,
    initials: s.initials,
    workStart: s.workStart ?? null,
    workEnd: s.workEnd ?? null,
    // serviceIds FK referansları → onlar da öneklenir (tutarlılık)
    serviceIds: s.serviceIds ? s.serviceIds.map((id) => nsId(businessId, id)) : null,
    active: s.active ?? true,
  };
}

export function customerToInsert(c: Customer, businessId: string): typeof customers.$inferInsert {
  return {
    id: nsId(businessId, c.id),
    businessId,
    name: c.name,
    phone: c.phone,
    note: c.note ?? null,
    birthday: c.birthday ?? null,
    createdAt: c.createdAt,
    pet: c.pet ?? null,
    vaccines: c.vaccines ?? null,
    treatments: c.treatments ?? null,
    measurements: c.measurements ?? null,
    heightCm: c.heightCm ?? null,
    targetWeightKg: c.targetWeightKg ?? null,
  };
}

export function appointmentToInsert(a: Appointment, businessId: string): typeof appointments.$inferInsert {
  return {
    id: nsId(businessId, a.id),
    businessId,
    date: a.date,
    start: a.start,
    staffId: nsId(businessId, a.staffId),
    customerId: nsId(businessId, a.customerId),
    serviceId: nsId(businessId, a.serviceId),
    status: a.status,
    source: a.source ?? null,
    approval: a.approval ?? null,
    priceSnapshot: a.priceSnapshot ?? null,
    commissionRateSnapshot: a.commissionRateSnapshot ?? null,
    serviceNameSnapshot: a.serviceNameSnapshot ?? null,
    staffNameSnapshot: a.staffNameSnapshot ?? null,
  };
}

export function campaignToInsert(c: Campaign, businessId: string): typeof campaigns.$inferInsert {
  return {
    id: nsId(businessId, c.id),
    businessId,
    title: c.title,
    kind: c.kind,
    channel: c.channel,
    message: c.message,
    audience: c.audience,
    reach: c.reach,
    active: c.active,
    createdAt: c.createdAt,
  };
}

export function reminderLogToInsert(r: ReminderLog, businessId: string): typeof reminderLogs.$inferInsert {
  return {
    id: nsId(businessId, r.id),
    businessId,
    at: r.at,
    channel: r.channel,
    to: r.to,
    text: r.text,
    status: r.status,
  };
}

export function invoiceToInsert(i: Invoice, businessId: string): typeof invoices.$inferInsert {
  return {
    id: nsId(businessId, i.id),
    businessId,
    date: i.date,
    amount: i.amount,
    planLabel: i.planLabel,
    status: i.status,
  };
}

export function paymentToInsert(p: Payment, businessId: string): typeof payments.$inferInsert {
  return {
    id: nsId(businessId, p.id),
    businessId,
    date: p.date,
    amount: p.amount,
    method: p.method,
    customerId: p.customerId ? nsId(businessId, p.customerId) : null,
    appointmentId: p.appointmentId ? nsId(businessId, p.appointmentId) : null,
    note: p.note ?? null,
    createdAt: p.createdAt,
  };
}

export function expenseToInsert(e: Expense, businessId: string): typeof expenses.$inferInsert {
  return {
    id: nsId(businessId, e.id),
    businessId,
    date: e.date,
    amount: e.amount,
    category: e.category,
    note: e.note ?? null,
    createdAt: e.createdAt,
  };
}
