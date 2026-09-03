// Mutator'lar — lib/store.tsx metodlarının DB karşılığı (server-only, tenant-scope'lu).
//
// Her fonksiyon withTenant içinde çalışır (RLS) + her sorguya eq(businessId) backstop filtresi.
// id stratejisi store ile aynı: "svc-"/"stf-"/"cus-"/"apt-"/"cmp-"/"rl-"/"inv-" + Date.now().
// Dönüş tipleri, store'un optimistic UI'da kullandığı objelerle uyumlu (2d'de bağlanır).

import { and, eq, gte } from "drizzle-orm";

import { db, schema } from "@/db";
import { withTenant } from "@/db/tenant";
import type {
  Appointment,
  AppointmentStatus,
  Campaign,
  Customer,
  Expense,
  Invoice,
  Payment,
  PlanId,
  ReminderLog,
  ReminderSettings,
  Service,
  Staff,
} from "@/lib/types";
import {
  appointmentToInsert,
  camelizeRows,
  campaignToInsert,
  customerToInsert,
  expenseToInsert,
  invoiceToInsert,
  paymentToInsert,
  nsId,
  reminderLogToInsert,
  rowToReminderSettings,
  serviceToInsert,
  staffToInsert,
} from "./map";
import { isBookingSlugConflict } from "./seed-db";

type Row = Record<string, unknown>;

// store.tsx ile aynı plan fiyat/etiketleri (store.tsx "use client" olduğundan oradan
// server'a import edilemez — değerler birebir burada da tutuluyor).
// Fiyat/etiket TEK KAYNAK: lib/payments/plans.ts
import { planLabel as PLAN_LABEL_OF, planPrice as PLAN_PRICE_OF } from "@/lib/payments/plans";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ============================================================================
// Hizmet (services)
// ============================================================================

/** Yeni hizmet ekle (store.upsertService — ekleme yolu). id çağıran tarafça verilir. */
export async function addService(businessId: string, service: Service): Promise<Service> {
  await withTenant(businessId, () => [
    db.insert(schema.services).values(serviceToInsert(service, businessId)),
  ]);
  return service;
}

/** Mevcut hizmeti güncelle (store.upsertService — güncelleme yolu). */
export async function updateService(businessId: string, service: Service): Promise<Service> {
  const { id, ...rest } = serviceToInsert(service, businessId);
  void id;
  await withTenant(businessId, () => [
    db
      .update(schema.services)
      .set(rest)
      .where(
        and(
          eq(schema.services.id, nsId(businessId, service.id)),
          eq(schema.services.businessId, businessId)
        )
      ),
  ]);
  return service;
}

/**
 * Hizmeti sil. store.deleteService gibi: bu hizmete bağlı GELECEK/bekleyen randevuları da
 * temizler (geçmiş geldi/iptal kayıtları rapor bütünlüğü için korunur — burada SQL ile süzülür).
 */
export async function deleteService(businessId: string, id: string): Promise<void> {
  const today = todayISO();
  await withTenant(businessId, () => [
    // Bu hizmete bağlı GELECEK + bekleyen randevuları temizle (geçmiş geldi/iptal korunur).
    db
      .delete(schema.appointments)
      .where(
        and(
          eq(schema.appointments.businessId, businessId),
          eq(schema.appointments.serviceId, nsId(businessId, id)),
          eq(schema.appointments.status, "bekliyor"),
          gte(schema.appointments.date, today)
        )
      ),
    db
      .delete(schema.services)
      .where(
        and(eq(schema.services.id, nsId(businessId, id)), eq(schema.services.businessId, businessId))
      ),
  ]);
}

// ============================================================================
// Personel (staff)
// ============================================================================

export async function addStaff(businessId: string, member: Staff): Promise<Staff> {
  await withTenant(businessId, () => [
    db.insert(schema.staff).values(staffToInsert(member, businessId)),
  ]);
  return member;
}

export async function updateStaff(businessId: string, member: Staff): Promise<Staff> {
  const { id, ...rest } = staffToInsert(member, businessId);
  void id;
  await withTenant(businessId, () => [
    db
      .update(schema.staff)
      .set(rest)
      .where(
        and(
          eq(schema.staff.id, nsId(businessId, member.id)),
          eq(schema.staff.businessId, businessId)
        )
      ),
  ]);
  return member;
}

/** Personeli sil + ona bağlı bekleyen/gelecek randevuları temizle (store.deleteStaff ile aynı niyet). */
export async function deleteStaff(businessId: string, id: string): Promise<void> {
  const today = todayISO();
  await withTenant(businessId, () => [
    db
      .delete(schema.appointments)
      .where(
        and(
          eq(schema.appointments.businessId, businessId),
          eq(schema.appointments.staffId, nsId(businessId, id)),
          eq(schema.appointments.status, "bekliyor"),
          gte(schema.appointments.date, today)
        )
      ),
    db
      .delete(schema.staff)
      .where(and(eq(schema.staff.id, nsId(businessId, id)), eq(schema.staff.businessId, businessId))),
  ]);
}

// ============================================================================
// Müşteri (customers)
// ============================================================================

/** Yeni müşteri ekle. store.addCustomer gibi id+createdAt burada üretilir. */
export async function addCustomer(
  businessId: string,
  data: Omit<Customer, "id" | "createdAt">
): Promise<Customer> {
  const cust: Customer = {
    ...data,
    id: "cus-" + Date.now(),
    createdAt: new Date().toISOString(),
  };
  await withTenant(businessId, () => [
    db.insert(schema.customers).values(customerToInsert(cust, businessId)),
  ]);
  return cust;
}

/**
 * Müşteriyi güncelle (store.updateCustomer + updateCustomerNote). patch'te olmayan alanlar
 * korunur: önce mevcut satırı okur, merge eder, tüm alanları yazar (jsonb sektörel alanlar dahil).
 */
export async function updateCustomer(
  businessId: string,
  id: string,
  patch: Partial<Omit<Customer, "id" | "createdAt">>
): Promise<Customer | null> {
  const dbId = nsId(businessId, id);
  const [rows] = await withTenant(businessId, () => [
    db
      .select()
      .from(schema.customers)
      .where(and(eq(schema.customers.id, dbId), eq(schema.customers.businessId, businessId))),
  ]);
  const existing = camelizeRows<typeof schema.customers.$inferSelect>(rows as Row[])[0];
  if (!existing) return null;

  // existing.id namespaced gelir; merged'da store-id (önek soyulmuş) kullan, customerToInsert
  // tekrar namespaceler (idempotent). patch FK referansı içermez.
  const merged: Customer = {
    id,
    name: existing.name,
    phone: existing.phone,
    note: existing.note ?? undefined,
    birthday: existing.birthday ?? undefined,
    createdAt: existing.createdAt,
    pet: existing.pet ?? undefined,
    vaccines: existing.vaccines ?? undefined,
    treatments: existing.treatments ?? undefined,
    measurements: existing.measurements ?? undefined,
    heightCm: existing.heightCm ?? undefined,
    targetWeightKg: existing.targetWeightKg ?? undefined,
    ...patch,
  };
  const { id: _id, ...values } = customerToInsert(merged, businessId);
  void _id;
  await withTenant(businessId, () => [
    db
      .update(schema.customers)
      .set(values)
      .where(and(eq(schema.customers.id, dbId), eq(schema.customers.businessId, businessId))),
  ]);
  return merged;
}

export async function deleteCustomer(businessId: string, id: string): Promise<void> {
  await withTenant(businessId, () => [
    // Tahsilat kayıtları SİLİNMEZ — para fiilen kasaya girdi, kasa raporu bozulmamalı.
    // Sadece cari bağı koparılır (sahipsiz tahsilat olarak kalır).
    db
      .update(schema.payments)
      .set({ customerId: null })
      .where(
        and(
          eq(schema.payments.customerId, nsId(businessId, id)),
          eq(schema.payments.businessId, businessId)
        )
      ),
    db
      .delete(schema.customers)
      .where(
        and(
          eq(schema.customers.id, nsId(businessId, id)),
          eq(schema.customers.businessId, businessId)
        )
      ),
  ]);
}

// ============================================================================
// Randevu (appointments)
// ============================================================================

/**
 * Yeni randevu ekle (store.addAppointment). Fiyat/prim snapshot'ı oluşturma anındaki
 * hizmet/personel değerlerinden DB'den okunur (store JS'te ne yapıyorsa aynısı).
 */
export async function addAppointment(
  businessId: string,
  data: Omit<Appointment, "id">
): Promise<Appointment> {
  // Snapshot için hizmet/personel oku
  const [svcRows, stfRows] = await withTenant(businessId, () => [
    db
      .select()
      .from(schema.services)
      .where(
        and(
          eq(schema.services.id, nsId(businessId, data.serviceId)),
          eq(schema.services.businessId, businessId)
        )
      ),
    db
      .select()
      .from(schema.staff)
      .where(
        and(
          eq(schema.staff.id, nsId(businessId, data.staffId)),
          eq(schema.staff.businessId, businessId)
        )
      ),
  ]);
  const svc = camelizeRows<typeof schema.services.$inferSelect>(svcRows as Row[])[0];
  const stf = camelizeRows<typeof schema.staff.$inferSelect>(stfRows as Row[])[0];

  const apt: Appointment = {
    source: "panel",
    ...data,
    id: "apt-" + Date.now(),
    priceSnapshot: data.priceSnapshot ?? svc?.price,
    commissionRateSnapshot: data.commissionRateSnapshot ?? svc?.commissionRate,
    serviceNameSnapshot: data.serviceNameSnapshot ?? svc?.name,
    staffNameSnapshot: data.staffNameSnapshot ?? stf?.name,
  };
  await withTenant(businessId, () => [
    db.insert(schema.appointments).values(appointmentToInsert(apt, businessId)),
  ]);
  return apt;
}

/**
 * Randevu durumu güncelle + onay senkronu (store.updateAppointmentStatus K1 kuralı):
 * "geldi" işaretlenen ve approval "bekliyor" olan online talep otomatik "onaylandi" olur.
 */
export async function updateAppointmentStatus(
  businessId: string,
  id: string,
  status: AppointmentStatus
): Promise<void> {
  const dbId = nsId(businessId, id);
  const [rows] = await withTenant(businessId, () => [
    db
      .select({ approval: schema.appointments.approval })
      .from(schema.appointments)
      .where(and(eq(schema.appointments.id, dbId), eq(schema.appointments.businessId, businessId))),
  ]);
  const current = (rows as Row[])[0] as { approval: Appointment["approval"] } | undefined;
  if (!current) return;
  const approval =
    status === "geldi" && current.approval === "bekliyor" ? "onaylandi" : current.approval;

  await withTenant(businessId, () => [
    db
      .update(schema.appointments)
      .set({ status, approval: approval ?? null })
      .where(and(eq(schema.appointments.id, dbId), eq(schema.appointments.businessId, businessId))),
  ]);
}

/** Online randevu onay/ret (store.setApproval). Reddedilen SİLİNMEZ; sadece approval değişir. */
export async function setApproval(
  businessId: string,
  id: string,
  value: "onaylandi" | "reddedildi"
): Promise<void> {
  await withTenant(businessId, () => [
    db
      .update(schema.appointments)
      .set({ approval: value })
      .where(
        and(
          eq(schema.appointments.id, nsId(businessId, id)),
          eq(schema.appointments.businessId, businessId)
        )
      ),
  ]);
}

/** Randevu alanlarını güncelle (store.updateAppointment). Snapshot alanları patch'te yoksa korunur. */
export async function updateAppointment(
  businessId: string,
  id: string,
  patch: Partial<Omit<Appointment, "id">>
): Promise<void> {
  // Sadece patch'te verilen alanları set et (snapshot bütünlüğü için).
  const set: Record<string, unknown> = {};
  if (patch.date !== undefined) set.date = patch.date;
  if (patch.start !== undefined) set.start = patch.start;
  // FK referansları namespace'lenir (DB önekli id tutar).
  if (patch.staffId !== undefined) set.staffId = nsId(businessId, patch.staffId);
  if (patch.customerId !== undefined) set.customerId = nsId(businessId, patch.customerId);
  if (patch.serviceId !== undefined) set.serviceId = nsId(businessId, patch.serviceId);
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.source !== undefined) set.source = patch.source;
  if (patch.approval !== undefined) set.approval = patch.approval;
  if (patch.priceSnapshot !== undefined) set.priceSnapshot = patch.priceSnapshot;
  if (patch.commissionRateSnapshot !== undefined)
    set.commissionRateSnapshot = patch.commissionRateSnapshot;
  if (patch.serviceNameSnapshot !== undefined) set.serviceNameSnapshot = patch.serviceNameSnapshot;
  if (patch.staffNameSnapshot !== undefined) set.staffNameSnapshot = patch.staffNameSnapshot;
  if (Object.keys(set).length === 0) return;

  await withTenant(businessId, () => [
    db
      .update(schema.appointments)
      .set(set)
      .where(
        and(
          eq(schema.appointments.id, nsId(businessId, id)),
          eq(schema.appointments.businessId, businessId)
        )
      ),
  ]);
}

export async function deleteAppointment(businessId: string, id: string): Promise<void> {
  await withTenant(businessId, () => [
    db
      .delete(schema.appointments)
      .where(
        and(
          eq(schema.appointments.id, nsId(businessId, id)),
          eq(schema.appointments.businessId, businessId)
        )
      ),
  ]);
}

// ============================================================================
// Kampanya (campaigns) + gönderim
// ============================================================================

export async function addCampaign(
  businessId: string,
  data: Omit<Campaign, "id" | "createdAt">
): Promise<Campaign> {
  const campaign: Campaign = {
    ...data,
    id: "cmp-" + Date.now(),
    createdAt: new Date().toISOString(),
  };
  await withTenant(businessId, () => [
    db.insert(schema.campaigns).values(campaignToInsert(campaign, businessId)),
  ]);
  return campaign;
}

export async function toggleCampaign(businessId: string, id: string): Promise<void> {
  const dbId = nsId(businessId, id);
  const [rows] = await withTenant(businessId, () => [
    db
      .select({ active: schema.campaigns.active })
      .from(schema.campaigns)
      .where(and(eq(schema.campaigns.id, dbId), eq(schema.campaigns.businessId, businessId))),
  ]);
  const c = (rows as Row[])[0] as { active: boolean } | undefined;
  if (!c) return;
  await withTenant(businessId, () => [
    db
      .update(schema.campaigns)
      .set({ active: !c.active })
      .where(and(eq(schema.campaigns.id, dbId), eq(schema.campaigns.businessId, businessId))),
  ]);
}

export async function deleteCampaign(businessId: string, id: string): Promise<void> {
  await withTenant(businessId, () => [
    db
      .delete(schema.campaigns)
      .where(
        and(
          eq(schema.campaigns.id, nsId(businessId, id)),
          eq(schema.campaigns.businessId, businessId)
        )
      ),
  ]);
}

/**
 * Kampanyayı gönder (store.sendCampaign) — simüle: ilk N müşteriye reminderLog üretir, kaç
 * kişiye ulaşıldığını döner. store ile aynı: reach kadar (max 6) log, customer adlarıyla.
 */
export async function sendCampaign(
  businessId: string,
  id: string
): Promise<{ reach: number; logs: ReminderLog[] }> {
  const [campRows, custRows] = await withTenant(businessId, () => [
    db
      .select()
      .from(schema.campaigns)
      .where(
        and(
          eq(schema.campaigns.id, nsId(businessId, id)),
          eq(schema.campaigns.businessId, businessId)
        )
      ),
    db
      .select({ name: schema.customers.name })
      .from(schema.customers)
      .where(eq(schema.customers.businessId, businessId)),
  ]);
  const c = camelizeRows<typeof schema.campaigns.$inferSelect>(campRows as Row[])[0];
  if (!c) return { reach: 0, logs: [] };
  const custs = custRows as { name: string }[];

  const now = Date.now();
  const logs: ReminderLog[] = Array.from({ length: Math.min(c.reach, 6) }, (_, i) => ({
    id: "rl-" + now + "-" + i,
    at: new Date().toISOString(),
    channel: c.channel,
    to: custs[i]?.name ?? "Müşteri",
    text: c.message.slice(0, 80),
    status: "gonderildi" as const,
  }));

  if (logs.length > 0) {
    await withTenant(businessId, () => [
      db.insert(schema.reminderLogs).values(logs.map((l) => reminderLogToInsert(l, businessId))),
    ]);
  }
  return { reach: c.reach, logs };
}

// ============================================================================
// Hatırlatma ayarları (business.reminderSettings jsonb)
// ============================================================================

export async function updateReminderSettings(
  businessId: string,
  patch: Partial<ReminderSettings>
): Promise<ReminderSettings> {
  const [rows] = await withTenant(businessId, () => [
    db.select().from(schema.businesses).where(eq(schema.businesses.id, businessId)),
  ]);
  const b = camelizeRows<typeof schema.businesses.$inferSelect>(rows as Row[])[0];
  const current = b ? rowToReminderSettings(b) : { enabled: true, channel: "whatsapp" as const, hoursBefore: 24, template: "" };
  const next: ReminderSettings = { ...current, ...patch };
  await withTenant(businessId, () => [
    db
      .update(schema.businesses)
      .set({ reminderSettings: next })
      .where(eq(schema.businesses.id, businessId)),
  ]);
  return next;
}

// ============================================================================
// Abonelik / plan (store.changePlan)
// ============================================================================

/**
 * Plan değiştir (store.changePlan). Plan gerçekten değiştiyse yeni "ödendi" fatura üretir.
 * subscription tablosunu günceller. Dönüş: yeni planId + (varsa) eklenen fatura.
 */
/** İşletmenin yürürlükteki planı. Abonelik kaydı yoksa en alt plan varsayılır. */
export async function getCurrentPlan(businessId: string): Promise<PlanId> {
  const [rows] = await withTenant(businessId, () => [
    db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.businessId, businessId)),
  ]);
  const sub = camelizeRows<typeof schema.subscriptions.$inferSelect>(rows as Row[])[0];
  return sub?.planId ?? "baslangic";
}

export async function changePlan(
  businessId: string,
  planId: PlanId,
  /** true YALNIZCA doğrulanmış ödeme webhook'undan gelir. */
  paid = false
): Promise<{ planId: PlanId; invoice: Invoice | null }> {
  const [subRows] = await withTenant(businessId, () => [
    db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.businessId, businessId)),
  ]);
  const sub = camelizeRows<typeof schema.subscriptions.$inferSelect>(subRows as Row[])[0];
  const changed = !sub || sub.planId !== planId;

  const today = todayISO();
  let invoice: Invoice | null = null;

  if (changed) {
    invoice = {
      id: "inv-" + Date.now(),
      date: today,
      amount: PLAN_PRICE_OF(planId),
      planLabel: `${PLAN_LABEL_OF(planId)} — Aylık`,
      // Bu yol ÜCRET ALMAZ (düşürme / ödeme kurulu değilken). Tahsil edilmemiş
      // parayı "ödendi" yazmak muhasebeyi ve müşteriye verilen sözü bozar.
      status: paid ? "odendi" : "bekliyor",
    };
  }

  await withTenant(businessId, () => {
    const queries = [];
    if (sub) {
      queries.push(
        db
          .update(schema.subscriptions)
          .set({ planId })
          .where(eq(schema.subscriptions.businessId, businessId))
      );
    } else {
      // subscription yoksa kur (changePlan defansif)
      queries.push(
        db.insert(schema.subscriptions).values({
          businessId,
          planId,
          startedAt: today,
          nextRenewal: today,
        })
      );
    }
    if (invoice) {
      queries.push(db.insert(schema.invoices).values(invoiceToInsert(invoice, businessId)));
    }
    return queries as never;
  });

  return { planId, invoice };
}

// ============================================================================
// İşletme profili (isim / telefon / bookingSlug / reminderSettings)
// ============================================================================

export async function updateBusinessProfile(
  businessId: string,
  patch: {
    businessName?: string;
    phone?: string | null;
    bookingSlug?: string;
    reminderSettings?: Partial<ReminderSettings>;
  }
): Promise<void> {
  const set: Record<string, unknown> = {};
  if (patch.businessName !== undefined) set.name = patch.businessName;
  if (patch.phone !== undefined) set.phone = patch.phone;
  if (patch.bookingSlug !== undefined) set.bookingSlug = patch.bookingSlug;

  if (patch.reminderSettings) {
    const [rows] = await withTenant(businessId, () => [
      db.select().from(schema.businesses).where(eq(schema.businesses.id, businessId)),
    ]);
    const b = camelizeRows<typeof schema.businesses.$inferSelect>(rows as Row[])[0];
    const current = b ? rowToReminderSettings(b) : { enabled: true, channel: "whatsapp" as const, hoursBefore: 24, template: "" };
    set.reminderSettings = { ...current, ...patch.reminderSettings };
  }

  if (Object.keys(set).length === 0) return;

  // bookingSlug değişiyorsa global-uniq çakışmasında 500 atma: çakışırsa anlamlı hata döndür.
  // (Profil ekranında kullanıcı slug'ı kendi seçtiği için otomatik suffix yerine net hata daha iyi —
  //  "bu link alınmış" gösterilebilir. Onboarding'in aksine burada sessiz değişiklik istenmez.)
  if (patch.bookingSlug !== undefined) {
    try {
      await withTenant(businessId, () => [
        db.update(schema.businesses).set(set).where(eq(schema.businesses.id, businessId)),
      ]);
    } catch (e) {
      if (isBookingSlugConflict(e)) {
        throw new Error("booking_slug_taken");
      }
      throw e;
    }
    return;
  }

  await withTenant(businessId, () => [
    db.update(schema.businesses).set(set).where(eq(schema.businesses.id, businessId)),
  ]);
}

// ============================================================================
// Tahsilat (payments) — kasaya giren para
// ============================================================================

/** Tahsilat kaydet. id çağıran tarafça verilir (store "pay-" + Date.now() üretir). */
export async function addPayment(
  businessId: string,
  data: Omit<Payment, "id" | "createdAt">
): Promise<Payment> {
  const payment: Payment = {
    ...data,
    id: "pay-" + Date.now(),
    createdAt: new Date().toISOString(),
  };
  await withTenant(businessId, () => [
    db.insert(schema.payments).values(paymentToInsert(payment, businessId)),
  ]);
  return payment;
}

export async function deletePayment(businessId: string, id: string): Promise<void> {
  await withTenant(businessId, () => [
    db
      .delete(schema.payments)
      .where(
        and(
          eq(schema.payments.id, nsId(businessId, id)),
          eq(schema.payments.businessId, businessId)
        )
      ),
  ]);
}

// ============================================================================
// Gider (expenses) — kasadan çıkan para
// ============================================================================

export async function addExpense(
  businessId: string,
  data: Omit<Expense, "id" | "createdAt">
): Promise<Expense> {
  const expense: Expense = {
    ...data,
    id: "exp-" + Date.now(),
    createdAt: new Date().toISOString(),
  };
  await withTenant(businessId, () => [
    db.insert(schema.expenses).values(expenseToInsert(expense, businessId)),
  ]);
  return expense;
}

export async function deleteExpense(businessId: string, id: string): Promise<void> {
  await withTenant(businessId, () => [
    db
      .delete(schema.expenses)
      .where(
        and(
          eq(schema.expenses.id, nsId(businessId, id)),
          eq(schema.expenses.businessId, businessId)
        )
      ),
  ]);
}
