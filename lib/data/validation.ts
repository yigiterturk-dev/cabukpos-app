// Authenticated mutation input validasyonu (zod).
//
// AMAÇ: client'tan gelen Service/Staff/Customer/Appointment/Campaign vb. objeleri DB'ye
// insert etmeden önce şekil + uzunluk + aralık limitlerine zorla. Bu XSS değil (React zaten
// escape eder) — DEPOLAMA ABUSE'una ve BOZUK VERİYE karşı koruma. public-booking-actions.ts'teki
// sunucu-taraflı disiplinin authenticated yüzeye taşınmış hâli.
//
// Geçersizse anlamlı (kullanıcıya gösterilebilir) Türkçe hata fırlatır; iç detay sızdırmaz.

import { z } from "zod";

import type {
  Appointment,
  Campaign,
  Customer,
  Expense,
  Payment,
  ReminderSettings,
  Service,
  Staff,
} from "@/lib/types";

// ---- Ortak yardımcılar ----
const id = z.string().trim().min(1, "Geçersiz kimlik.").max(80);
const shortText = (label: string, max = 200) =>
  z.string().trim().min(1, `${label} boş olamaz.`).max(max, `${label} çok uzun.`);
const optText = (max = 200) => z.string().trim().max(max).optional();
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Geçersiz tarih biçimi.");
const dateLoose = z
  .string()
  .trim()
  .max(20)
  .regex(/^(\d{4}-)?\d{2}-\d{2}$/, "Geçersiz tarih biçimi.");
const timeStr = z.string().regex(/^\d{2}:\d{2}$/, "Geçersiz saat biçimi.");
const phone = z.string().trim().min(1, "Telefon boş olamaz.").max(30, "Telefon çok uzun.");
const money = z.number().finite().min(0, "Negatif değer olamaz.").max(1_000_000);
const rate = z.number().finite().min(0).max(1);
const hex = z.string().trim().max(20);

/** İç hata yerine ilk zod mesajını anlamlı şekilde yukarı taşır. */
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) {
    const msg = r.error.issues[0]?.message ?? "Geçersiz veri.";
    throw new Error(msg);
  }
  return r.data;
}

// ---- Hizmet ----
const serviceSchema = z.object({
  id,
  name: shortText("Hizmet adı", 200),
  durationMin: z.number().int().min(1).max(24 * 60),
  price: money,
  commissionRate: rate,
  active: z.boolean().optional(),
  // POS alanları (opsiyonel)
  barcode: z
    .string()
    .trim()
    .max(64, "Barkod en fazla 64 karakter olabilir.")
    .optional()
    .or(z.literal("")),
  stock: z.number().int().min(0, "Stok negatif olamaz.").max(1_000_000).optional(),
  trackStock: z.boolean().optional(),
});
export const validateService = (v: Service): Service => parse(serviceSchema, v) as Service;

// ---- Personel ----
const staffSchema = z.object({
  id,
  name: shortText("Personel adı", 200),
  role: z.string().trim().max(120),
  color: hex,
  initials: z.string().trim().max(8),
  workStart: timeStr.optional(),
  workEnd: timeStr.optional(),
  serviceIds: z.array(id).max(200).optional(),
  active: z.boolean().optional(),
});
export const validateStaff = (v: Staff): Staff => parse(staffSchema, v) as Staff;

// ---- Müşteri (sektörel jsonb alt-kayıtları dahil, makul limitlerle) ----
const petSchema = z.object({
  name: z.string().trim().max(120),
  species: z.string().trim().max(60),
  breed: optText(120),
  birthYear: z.number().int().min(1900).max(2100).optional(),
});
const vaccineSchema = z.object({
  id,
  name: z.string().trim().max(160),
  date: dateStr,
  nextDue: dateStr.optional(),
});
const treatmentSchema = z.object({
  id,
  date: dateStr,
  tooth: optText(20),
  name: z.string().trim().max(160),
  status: z.enum(["planlandı", "yapıldı"]),
});
const measurementSchema = z.object({
  id,
  date: dateStr,
  weightKg: z.number().finite().min(0).max(1000),
  note: optText(500),
});
const customerCore = {
  name: shortText("Müşteri adı", 200),
  phone,
  note: optText(2000),
  birthday: dateLoose.optional(),
  pet: petSchema.optional(),
  vaccines: z.array(vaccineSchema).max(200).optional(),
  treatments: z.array(treatmentSchema).max(500).optional(),
  measurements: z.array(measurementSchema).max(500).optional(),
  heightCm: z.number().finite().min(0).max(300).optional(),
  targetWeightKg: z.number().finite().min(0).max(1000).optional(),
};
const customerCreateSchema = z.object(customerCore);
const customerPatchSchema = z.object(customerCore).partial();
export const validateCustomerCreate = (
  v: Omit<Customer, "id" | "createdAt">
): Omit<Customer, "id" | "createdAt"> => parse(customerCreateSchema, v) as Omit<Customer, "id" | "createdAt">;
export const validateCustomerPatch = (
  v: Partial<Omit<Customer, "id" | "createdAt">>
): Partial<Omit<Customer, "id" | "createdAt">> =>
  parse(customerPatchSchema, v) as Partial<Omit<Customer, "id" | "createdAt">>;

// ---- Randevu ----
const appointmentCore = {
  date: dateStr,
  start: timeStr,
  staffId: id,
  customerId: id,
  serviceId: id,
  status: z.enum(["bekliyor", "geldi", "iptal"]),
  source: z.enum(["panel", "online"]).optional(),
  approval: z.enum(["bekliyor", "onaylandi", "reddedildi"]).optional(),
  priceSnapshot: money.optional(),
  commissionRateSnapshot: rate.optional(),
  serviceNameSnapshot: optText(200),
  staffNameSnapshot: optText(200),
};
const appointmentCreateSchema = z.object(appointmentCore);
const appointmentPatchSchema = z.object(appointmentCore).partial();
export const validateAppointmentCreate = (
  v: Omit<Appointment, "id">
): Omit<Appointment, "id"> => parse(appointmentCreateSchema, v) as Omit<Appointment, "id">;
export const validateAppointmentPatch = (
  v: Partial<Omit<Appointment, "id">>
): Partial<Omit<Appointment, "id">> =>
  parse(appointmentPatchSchema, v) as Partial<Omit<Appointment, "id">>;

// ---- Kampanya ----
const campaignSchema = z.object({
  title: shortText("Kampanya başlığı", 200),
  kind: z.enum(["indirim", "geri-kazanim", "dogum-gunu", "paket"]),
  channel: z.enum(["whatsapp", "sms"]),
  message: z.string().trim().min(1, "Mesaj boş olamaz.").max(2000),
  audience: z.string().trim().max(200),
  reach: z.number().int().min(0).max(1_000_000),
  active: z.boolean(),
});
export const validateCampaignCreate = (
  v: Omit<Campaign, "id" | "createdAt">
): Omit<Campaign, "id" | "createdAt"> => parse(campaignSchema, v) as Omit<Campaign, "id" | "createdAt">;

// ---- Hatırlatma ayarları ----
const reminderSettingsSchema = z
  .object({
    enabled: z.boolean(),
    channel: z.enum(["whatsapp", "sms"]),
    hoursBefore: z.number().int().min(0).max(168),
    template: z.string().trim().max(2000),
  })
  .partial();
export const validateReminderSettings = (
  v: Partial<ReminderSettings>
): Partial<ReminderSettings> => parse(reminderSettingsSchema, v) as Partial<ReminderSettings>;

// ---- İşletme profili ----
const businessProfileSchema = z.object({
  businessName: shortText("İşletme adı", 200).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  bookingSlug: z
    .string()
    .trim()
    .min(1, "Rezervasyon linki boş olamaz.")
    .max(80)
    .regex(/^[a-z0-9-]+$/, "Link yalnız küçük harf, rakam ve tire içerebilir.")
    .optional(),
  reminderSettings: reminderSettingsSchema.optional(),
});
export const validateBusinessProfile = (v: {
  businessName?: string;
  phone?: string | null;
  bookingSlug?: string;
  reminderSettings?: Partial<ReminderSettings>;
}) => parse(businessProfileSchema, v);

// ---- Kurulum (createBusinessProfile) ----
const sectorEnum = z.enum([
  "berber",
  "guzellik",
  "otoyikama",
  "veteriner",
  "diyetisyen",
  "psikolog",
  "doktor",
  "dishekimi",
  "restoran",
  "market",
  "kafe",
  "pastane",
]);
export const validateSector = (v: unknown) => parse(sectorEnum, v);

const createBusinessSchema = z.object({
  sector: sectorEnum,
  businessName: shortText("İşletme adı", 200),
  bookingSlug: z
    .string()
    .trim()
    .min(1, "Rezervasyon linki boş olamaz.")
    .max(80)
    .regex(/^[a-z0-9-]+$/, "Link yalnız küçük harf, rakam ve tire içerebilir."),
  phone: z.string().trim().max(30).nullable().optional(),
  services: z.array(serviceSchema).max(500).optional(),
  staff: z.array(staffSchema).max(500).optional(),
});
export const validateCreateBusiness = (v: {
  sector: z.infer<typeof sectorEnum>;
  businessName: string;
  bookingSlug: string;
  phone?: string | null;
  services?: Service[];
  staff?: Staff[];
}) => parse(createBusinessSchema, v);

// ---- Tahsilat / Gider ----
// amount: 0 tahsilat anlamsız (kayıt kirliliği) → strictly positive.
const positiveMoney = z
  .number()
  .finite()
  .positive("Tutar sıfırdan büyük olmalı.")
  .max(1_000_000, "Tutar çok yüksek.");

const paymentSchema = z.object({
  date: dateStr,
  amount: positiveMoney,
  method: z.enum(["nakit", "kart", "havale"]),
  customerId: id.optional(),
  appointmentId: id.optional(),
  note: optText(300),
});
export const validatePaymentCreate = (
  v: Omit<Payment, "id" | "createdAt">
): Omit<Payment, "id" | "createdAt"> =>
  parse(paymentSchema, v) as Omit<Payment, "id" | "createdAt">;

const expenseSchema = z.object({
  date: dateStr,
  amount: positiveMoney,
  category: z.enum(["kira", "maas", "malzeme", "fatura", "vergi", "diger"]),
  note: optText(300),
});
export const validateExpenseCreate = (
  v: Omit<Expense, "id" | "createdAt">
): Omit<Expense, "id" | "createdAt"> =>
  parse(expenseSchema, v) as Omit<Expense, "id" | "createdAt">;

// ---- Demo seed profili (onboarding'de girilen isim/telefon) ----
const seedProfileSchema = z.object({
  businessName: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
});
export const validateSeedProfile = (v: {
  businessName?: string;
  phone?: string | null;
}) => parse(seedProfileSchema, v);
