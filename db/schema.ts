// Multi-tenant (çok-kiracılı) Drizzle şeması — tüm sektörler için paylaşımlı tablolar.
// Her veri tablosu businessId (tenant) taşır; izolasyon hem app-katmanında (Faz 2c)
// hem de RLS backstop ile (db/rls.sql) sağlanır.
//
// id stratejisi: businesses/users = uuid (auth/tenant kökü).
// Sektörel veri tabloları (services, staff, customers, ...) = text pk —
// mevcut localStorage store'undaki "svc-1", "stf-2", "cus-3", "apt-7" gibi string id'lerle
// birebir uyumlu olsun diye. (businessId izolasyonu zaten tenant ayrımını sağlıyor.)

import { relations, sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type {
  AppointmentStatus,
  ExpenseCategory,
  CampaignChannel,
  CampaignKind,
  MeasurementRecord,
  PaymentMethod,
  PetInfo,
  PlanId,
  ReminderLog,
  SectorId,
  TreatmentRecord,
  VaccineRecord,
} from "@/lib/types";

// ---- Kiracı (tenant) ----
// BusinessState'in işletme-seviyesi alanları. Diziler/ayarlar ayrı tablolarda.
export const businesses = pgTable(
  "businesses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    sector: text("sector").$type<SectorId>(),
    bookingSlug: text("booking_slug").notNull(),
    phone: text("phone"),
    // BusinessState.reminderSettings (enabled/channel/hoursBefore/template) — tek satır,
    // işletmeye 1-1 bağlı olduğu için jsonb olarak business üstünde tutuluyor.
    reminderSettings: jsonb("reminder_settings").$type<{
      enabled: boolean;
      channel: CampaignChannel;
      hoursBefore: number;
      template: string;
    }>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("businesses_booking_slug_uq").on(t.bookingSlug)]
);

// ---- Kullanıcı / Auth ----
// Şifre hash'i Faz 2b'de auth ile dolacak; tablo şimdi kuruluyor.
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    passwordHash: text("password_hash"),
    role: text("role").notNull().default("owner"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_uq").on(t.email),
    index("users_business_id_idx").on(t.businessId),
  ]
);

// ---- Hizmetler ----
export const services = pgTable(
  "services",
  {
    id: text("id").primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    durationMin: integer("duration_min").notNull(),
    price: doublePrecision("price").notNull(),
    commissionRate: doublePrecision("commission_rate").notNull(),
    active: boolean("active").default(true),
  },
  (t) => [index("services_business_id_idx").on(t.businessId)]
);

// ---- Personel ----
export const staff = pgTable(
  "staff",
  {
    id: text("id").primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role").notNull(),
    color: text("color").notNull(),
    initials: text("initials").notNull(),
    workStart: text("work_start"),
    workEnd: text("work_end"),
    // yetkin olduğu hizmet id'leri (boş = hepsi)
    serviceIds: jsonb("service_ids").$type<string[]>(),
    active: boolean("active").default(true),
  },
  (t) => [index("staff_business_id_idx").on(t.businessId)]
);

// ---- Müşteriler (+ sektörel alt-kayıtlar) ----
// Sektöre özel diziler/objeler jsonb: pet, vaccines[], treatments[], measurements[].
export const customers = pgTable(
  "customers",
  {
    id: text("id").primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    note: text("note"),
    birthday: text("birthday"), // "YYYY-MM-DD" veya "AA-GG"
    createdAt: text("created_at").notNull(), // ISO string (store ile birebir)
    // Sektörel — opsiyonel, geriye uyumlu
    pet: jsonb("pet").$type<PetInfo>(), // veteriner
    vaccines: jsonb("vaccines").$type<VaccineRecord[]>(), // veteriner
    treatments: jsonb("treatments").$type<TreatmentRecord[]>(), // dishekimi
    measurements: jsonb("measurements").$type<MeasurementRecord[]>(), // diyetisyen
    heightCm: doublePrecision("height_cm"), // diyetisyen
    targetWeightKg: doublePrecision("target_weight_kg"), // diyetisyen
  },
  (t) => [index("customers_business_id_idx").on(t.businessId)]
);

// ---- Randevular (+ onay + fiyat/prim snapshot) ----
export const appointments = pgTable(
  "appointments",
  {
    id: text("id").primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // YYYY-MM-DD
    start: text("start").notNull(), // HH:mm
    staffId: text("staff_id").notNull(),
    customerId: text("customer_id").notNull(),
    serviceId: text("service_id").notNull(),
    status: text("status").$type<AppointmentStatus>().notNull(),
    source: text("source").$type<"panel" | "online">(),
    approval: text("approval").$type<"bekliyor" | "onaylandi" | "reddedildi">(),
    // Fiyat/prim snapshot — randevu oluşturulduğu andaki değerler (geçmiş rapor doğruluğu)
    priceSnapshot: doublePrecision("price_snapshot"),
    commissionRateSnapshot: doublePrecision("commission_rate_snapshot"),
    serviceNameSnapshot: text("service_name_snapshot"),
    staffNameSnapshot: text("staff_name_snapshot"),
  },
  (t) => [index("appointments_business_id_idx").on(t.businessId)]
);

// ---- Kampanyalar ----
export const campaigns = pgTable(
  "campaigns",
  {
    id: text("id").primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: text("kind").$type<CampaignKind>().notNull(),
    channel: text("channel").$type<CampaignChannel>().notNull(),
    message: text("message").notNull(),
    audience: text("audience").notNull(),
    reach: integer("reach").notNull(),
    active: boolean("active").notNull(),
    createdAt: text("created_at").notNull(), // ISO string
  },
  (t) => [index("campaigns_business_id_idx").on(t.businessId)]
);

// ---- Hatırlatma gönderim logları ----
export const reminderLogs = pgTable(
  "reminder_logs",
  {
    id: text("id").primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    at: text("at").notNull(), // ISO gönderim zamanı
    channel: text("channel").$type<CampaignChannel>().notNull(),
    to: text("to").notNull(),
    text: text("text").notNull(),
    status: text("status").$type<ReminderLog["status"]>().notNull(),
  },
  (t) => [index("reminder_logs_business_id_idx").on(t.businessId)]
);

// ---- Abonelik (işletmeye 1-1, ama izolasyon için businessId'li ayrı tablo) ----
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    planId: text("plan_id").$type<PlanId>().notNull(),
    startedAt: text("started_at").notNull(), // YYYY-MM-DD
    nextRenewal: text("next_renewal").notNull(), // YYYY-MM-DD
  },
  (t) => [index("subscriptions_business_id_idx").on(t.businessId)]
);

// ---- Faturalar ----
export const invoices = pgTable(
  "invoices",
  {
    id: text("id").primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // YYYY-MM-DD
    amount: doublePrecision("amount").notNull(),
    planLabel: text("plan_label").notNull(),
    status: text("status").$type<"odendi" | "bekliyor">().notNull(),
  },
  (t) => [index("invoices_business_id_idx").on(t.businessId)]
);

// ---- Tahsilat (kasaya giren) ----
// Ciro (randevu fiyatı, "hak edilen") ile tahsilat (kasaya giren) AYRI kavramlar.
// customerId opsiyonel: randevusuz/genel tahsilat da kaydedilebilir.
export const payments = pgTable(
  "payments",
  {
    id: text("id").primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // YYYY-MM-DD
    amount: doublePrecision("amount").notNull(),
    method: text("method").$type<PaymentMethod>().notNull(),
    customerId: text("customer_id"),
    appointmentId: text("appointment_id"),
    note: text("note"),
    createdAt: text("created_at").notNull(), // ISO string
  },
  (t) => [
    index("payments_business_id_idx").on(t.businessId),
    index("payments_customer_id_idx").on(t.customerId),
  ]
);

// ---- Gider (kasadan çıkan) ----
export const expenses = pgTable(
  "expenses",
  {
    id: text("id").primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // YYYY-MM-DD
    amount: doublePrecision("amount").notNull(),
    category: text("category").$type<ExpenseCategory>().notNull(),
    note: text("note"),
    createdAt: text("created_at").notNull(), // ISO string
  },
  (t) => [index("expenses_business_id_idx").on(t.businessId)]
);

// ---- Relations: businesses → hasMany ----
export const businessesRelations = relations(businesses, ({ many }) => ({
  users: many(users),
  services: many(services),
  staff: many(staff),
  customers: many(customers),
  appointments: many(appointments),
  campaigns: many(campaigns),
  reminderLogs: many(reminderLogs),
  subscriptions: many(subscriptions),
  invoices: many(invoices),
  payments: many(payments),
  expenses: many(expenses),
}));

export const usersRelations = relations(users, ({ one }) => ({
  business: one(businesses, {
    fields: [users.businessId],
    references: [businesses.id],
  }),
}));

export const servicesRelations = relations(services, ({ one }) => ({
  business: one(businesses, {
    fields: [services.businessId],
    references: [businesses.id],
  }),
}));

export const staffRelations = relations(staff, ({ one }) => ({
  business: one(businesses, {
    fields: [staff.businessId],
    references: [businesses.id],
  }),
}));

export const customersRelations = relations(customers, ({ one }) => ({
  business: one(businesses, {
    fields: [customers.businessId],
    references: [businesses.id],
  }),
}));

export const appointmentsRelations = relations(appointments, ({ one }) => ({
  business: one(businesses, {
    fields: [appointments.businessId],
    references: [businesses.id],
  }),
}));

export const campaignsRelations = relations(campaigns, ({ one }) => ({
  business: one(businesses, {
    fields: [campaigns.businessId],
    references: [businesses.id],
  }),
}));

export const reminderLogsRelations = relations(reminderLogs, ({ one }) => ({
  business: one(businesses, {
    fields: [reminderLogs.businessId],
    references: [businesses.id],
  }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  business: one(businesses, {
    fields: [subscriptions.businessId],
    references: [businesses.id],
  }),
}));

export const invoicesRelations = relations(invoices, ({ one }) => ({
  business: one(businesses, {
    fields: [invoices.businessId],
    references: [businesses.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  business: one(businesses, {
    fields: [payments.businessId],
    references: [businesses.id],
  }),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
  business: one(businesses, {
    fields: [expenses.businessId],
    references: [businesses.id],
  }),
}));

// Inferred tipler (data-layer Faz 2c'de kullanılacak)
export type Business = typeof businesses.$inferSelect;
export type NewBusiness = typeof businesses.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
