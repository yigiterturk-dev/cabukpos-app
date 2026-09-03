"use server";

// Server action katmanı — store.tsx'in DB modundaki mutasyon yüzeyi.
//
// GÜVENLİK (kritik): businessId ASLA client'tan alınmaz. Her action getSession() ile
// oturumdan türetir; oturum yoksa hata fırlatır (fail-closed). Böylece bir kullanıcı
// başka bir işletmenin verisini değiştiremez (RLS + eq(businessId) backstop'a ek olarak
// kimliğin kendisi de sunucuda doğrulanır).
//
// Bu modül lib/data mutator'larını (server-only) sarmalar; store optimistic UI yapıp
// dönen tam objeyle (rollback için) state'i kesinleştirir.

import { headers } from "next/headers";

import { getLiveSession } from "@/lib/auth/session";
import { messagingEnabled } from "@/lib/messaging";
import { getPaymentProvider, isUpgrade } from "@/lib/payments";
import type { CheckoutResult } from "@/lib/payments";
import { rateLimited } from "@/lib/rate-limit";
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
  SectorId,
  Service,
  Staff,
} from "@/lib/types";
import * as data from "@/lib/data";
import * as v from "./validation";

/** Oturumdan businessId çıkarır; yoksa fail-closed (yetkisiz). */
async function requireBusinessId(): Promise<string> {
  // getLiveSession: imza + süre YETMEZ; kullanıcı hâlâ var mı ve erişimi iptal
  // edilmemiş mi diye de bakar (db/session-epoch.sql). Fail-closed.
  const session = await getLiveSession();
  if (!session?.businessId) {
    throw new Error("Yetkisiz: oturum bulunamadı.");
  }
  return session.businessId;
}

// ---- Hizmet ----
export async function addServiceAction(service: Service): Promise<Service> {
  return data.addService(await requireBusinessId(), v.validateService(service));
}
export async function updateServiceAction(service: Service): Promise<Service> {
  return data.updateService(await requireBusinessId(), v.validateService(service));
}
export async function deleteServiceAction(id: string): Promise<void> {
  return data.deleteService(await requireBusinessId(), id);
}

// ---- Personel ----
export async function addStaffAction(member: Staff): Promise<Staff> {
  return data.addStaff(await requireBusinessId(), v.validateStaff(member));
}
export async function updateStaffAction(member: Staff): Promise<Staff> {
  return data.updateStaff(await requireBusinessId(), v.validateStaff(member));
}
export async function deleteStaffAction(id: string): Promise<void> {
  return data.deleteStaff(await requireBusinessId(), id);
}

// ---- Müşteri ----
export async function addCustomerAction(
  c: Omit<Customer, "id" | "createdAt">
): Promise<Customer> {
  return data.addCustomer(await requireBusinessId(), v.validateCustomerCreate(c));
}
export async function updateCustomerAction(
  id: string,
  patch: Partial<Omit<Customer, "id" | "createdAt">>
): Promise<Customer | null> {
  return data.updateCustomer(await requireBusinessId(), id, v.validateCustomerPatch(patch));
}
export async function deleteCustomerAction(id: string): Promise<void> {
  return data.deleteCustomer(await requireBusinessId(), id);
}

// ---- Randevu ----
export async function addAppointmentAction(
  a: Omit<Appointment, "id">
): Promise<Appointment> {
  return data.addAppointment(await requireBusinessId(), v.validateAppointmentCreate(a));
}
export async function updateAppointmentStatusAction(
  id: string,
  status: AppointmentStatus
): Promise<void> {
  return data.updateAppointmentStatus(await requireBusinessId(), id, status);
}
export async function setApprovalAction(
  id: string,
  value: "onaylandi" | "reddedildi"
): Promise<void> {
  return data.setApproval(await requireBusinessId(), id, value);
}
export async function updateAppointmentAction(
  id: string,
  patch: Partial<Omit<Appointment, "id">>
): Promise<void> {
  return data.updateAppointment(await requireBusinessId(), id, v.validateAppointmentPatch(patch));
}
export async function deleteAppointmentAction(id: string): Promise<void> {
  return data.deleteAppointment(await requireBusinessId(), id);
}

// ---- Tahsilat / Gider (kasa) ----
export async function addPaymentAction(
  p: Omit<Payment, "id" | "createdAt">
): Promise<Payment> {
  return data.addPayment(await requireBusinessId(), v.validatePaymentCreate(p));
}
export async function deletePaymentAction(id: string): Promise<void> {
  return data.deletePayment(await requireBusinessId(), id);
}
export async function addExpenseAction(
  e: Omit<Expense, "id" | "createdAt">
): Promise<Expense> {
  return data.addExpense(await requireBusinessId(), v.validateExpenseCreate(e));
}
export async function deleteExpenseAction(id: string): Promise<void> {
  return data.deleteExpense(await requireBusinessId(), id);
}

// ---- Kampanya ----
export async function addCampaignAction(
  c: Omit<Campaign, "id" | "createdAt">
): Promise<Campaign> {
  return data.addCampaign(await requireBusinessId(), v.validateCampaignCreate(c));
}
export async function toggleCampaignAction(id: string): Promise<void> {
  return data.toggleCampaign(await requireBusinessId(), id);
}
export async function deleteCampaignAction(id: string): Promise<void> {
  return data.deleteCampaign(await requireBusinessId(), id);
}
export async function sendCampaignAction(
  id: string
): Promise<{ reach: number; logs: ReminderLog[] }> {
  return data.sendCampaign(await requireBusinessId(), id);
}

// ---- Hatırlatma ----
export async function updateReminderSettingsAction(
  patch: Partial<ReminderSettings>
): Promise<ReminderSettings> {
  return data.updateReminderSettings(await requireBusinessId(), v.validateReminderSettings(patch));
}

// ---- Abonelik ----
//
// GÜVENLİK: yükseltme (daha pahalı plana geçiş) BU YOLDAN YAPILAMAZ. Aksi halde
// oturumu olan herkes kendini en üst plana çıkarıp "ödendi" faturası üretebilirdi.
// Yükseltme yalnız startCheckoutAction → sağlayıcı ödeme sayfası → doğrulanmış
// webhook zinciriyle gerçekleşir (app/api/payments/webhook).
export async function changePlanAction(
  planId: PlanId
): Promise<{ planId: PlanId; invoice: Invoice | null; needsCheckout?: boolean }> {
  const businessId = await requireBusinessId();
  const current = await data.getCurrentPlan(businessId);

  if (isUpgrade(current, planId)) {
    return { planId: current, invoice: null, needsCheckout: true };
  }
  // Aynı plan veya düşürme → ücret yok, doğrudan uygula.
  return data.changePlan(businessId, planId);
}

/**
 * Ödeme oturumu açar ve yönlendirme URL'i döner.
 * Sağlayıcı kurulmamışsa ücretli plana GEÇİRMEZ, dürüstçe "kurulmadı" der.
 */
export async function startCheckoutAction(planId: PlanId): Promise<CheckoutResult> {
  const businessId = await requireBusinessId();

  const provider = getPaymentProvider();
  if (!provider) {
    return {
      ok: false,
      unconfigured: true,
      error: "Online ödeme henüz açılmadı. Yükseltme için bizimle iletişime geçin.",
    };
  }

  // Kötüye kullanım freni: aynı işletme için saatte 10 ödeme oturumu yeter.
  if (await rateLimited(`checkout:${businessId}`, { windowMs: 60 * 60 * 1000, max: 10 })) {
    return { ok: false, error: "Çok fazla deneme. Bir süre sonra tekrar deneyin." };
  }

  const base = await appBaseUrl();
  return provider.createCheckout({
    businessId,
    planId,
    successUrl: `${base}/abonelik?odeme=basarili`,
    cancelUrl: `${base}/abonelik?odeme=iptal`,
  });
}

/** İstek başlıklarından mutlak site kökü (ödeme dönüş URL'leri için). */
async function appBaseUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "app.yanindapos.com";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

// ---- İşletme profili ----
export async function updateBusinessProfileAction(patch: {
  businessName?: string;
  phone?: string | null;
  bookingSlug?: string;
  reminderSettings?: Partial<ReminderSettings>;
}): Promise<void> {
  return data.updateBusinessProfile(await requireBusinessId(), v.validateBusinessProfile(patch));
}

// ---- Kurulum (onboarding sonrası) ----
/** Demo veriyle başla: seedFor(sector) çıktısını DB'ye yazar. */
export async function seedBusinessAction(
  sector: SectorId,
  profile?: { businessName?: string; phone?: string | null }
): Promise<void> {
  return data.seedBusinessToDb(
    await requireBusinessId(),
    v.validateSector(sector),
    profile ? v.validateSeedProfile(profile) : undefined
  );
}
/** Boş başla: minimal profil + opsiyonel hizmet/personel. */
export async function createBusinessProfileAction(opts: {
  sector: SectorId;
  businessName: string;
  bookingSlug: string;
  phone?: string | null;
  services?: Service[];
  staff?: Staff[];
}): Promise<void> {
  return data.createBusinessProfile(await requireBusinessId(), v.validateCreateBusiness(opts));
}

// ---- Mesajlaşma durumu ----
/**
 * Otomatik hatırlatma gerçekten gönderilebiliyor mu?
 * UI bunu, gönderilmeyecek bir şeyi "otomatik gönderilecek" diye SUNMAMAK için kullanır.
 */
export async function messagingStatusAction(): Promise<{ enabled: boolean }> {
  await requireBusinessId(); // oturumsuz çağrıya kapalı
  return { enabled: messagingEnabled() };
}
