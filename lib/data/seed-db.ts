// DB seeding — mevcut lib/seed.ts (seedFor) çıktısını DB'ye yazar (server-only, tenant-scope'lu).
//
// İki giriş noktası:
//  - seedBusinessToDb(businessId, sector): "demo veriyle başla" → seedFor(sector)'ün tüm
//    objelerini ilgili tablolara INSERT eder + business satırını günceller (name/slug/sector/
//    reminderSettings) + subscription/invoices kurar.
//  - createBusinessProfile(businessId, opts): boş başlat → minimal kayıtlar (sektör + isim/slug,
//    opsiyonel kullanıcı hizmet/personel, varsayılan subscription, boş geri kalan).
//
// businesses satırı signup'ta zaten oluşturulduğu için burada UPDATE edilir (insert değil).
// Tüm yazımlar withTenant içinde; her insert businessId taşır.

import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { withTenant } from "@/db/tenant";
import { seedFor } from "@/lib/seed";
import type { Service, Staff, SectorId } from "@/lib/types";
import {
  appointmentToInsert,
  camelizeRows,
  campaignToInsert,
  customerToInsert,
  expenseToInsert,
  invoiceToInsert,
  paymentToInsert,
  reminderLogToInsert,
  serviceToInsert,
  staffToInsert,
} from "./map";

type Row = Record<string, unknown>;

// bookingSlug GLOBAL benzersizdir (businesses_booking_slug_uq). createBusinessProfile/
// updateBusinessProfile bu slug'ı doğrudan yazar → başka bir işletme aynı slug'ı almışsa
// UPDATE unique violation (23505) ile 500 atardı. Aşağıdaki yardımcı, çakışmayı yakalayıp
// slug'a "-2", "-3" ... son eki ekleyerek tekrar dener; makul deneme sonunda anlamlı hata döner.
const MAX_SLUG_ATTEMPTS = 25;

/** Postgres unique_violation (23505) ve booking_slug index'i mi? (Drizzle hatayı e.cause altında saklar.) */
export function isBookingSlugConflict(e: unknown): boolean {
  const err = e as { code?: string; constraint?: string; message?: string; cause?: unknown } | undefined;
  const layers = [err, err?.cause as typeof err];
  for (const l of layers) {
    if (!l) continue;
    const msg = `${l.code ?? ""} ${l.constraint ?? ""} ${l.message ?? ""}`;
    if (msg.includes("23505") || msg.toLowerCase().includes("unique")) {
      if (msg.includes("booking_slug") || msg.includes("businesses_booking_slug_uq")) return true;
    }
  }
  return false;
}

/**
 * businessId için bookingSlug'ı (ve opsiyonel ek alanları) güvenli yazar: slug global çakışırsa
 * "-2", "-3" ... son ekiyle tekrar dener. writeFn her denemede güncel slug'ı alır.
 * Hiçbir slug boşta değilse anlamlı bir hata fırlatır (kullanıcıya "bu link alınmış" gösterilebilir).
 */
export async function writeBusinessSlugWithRetry(
  baseSlug: string,
  writeFn: (slug: string) => Promise<void>
): Promise<string> {
  let attempt = 1;
  let slug = baseSlug;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await writeFn(slug);
      return slug;
    } catch (e) {
      if (isBookingSlugConflict(e) && attempt < MAX_SLUG_ATTEMPTS) {
        attempt += 1;
        slug = `${baseSlug}-${attempt}`;
        continue;
      }
      if (isBookingSlugConflict(e)) {
        throw new Error("booking_slug_taken");
      }
      throw e;
    }
  }
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function nextMonthFirstISO() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

/**
 * Demo seed'i DB'ye yaz. seedFor(sector) ile birebir aynı veri kümesini üretir ve
 * ilgili tüm tablolara dağıtır. business satırı UPDATE edilir.
 */
export async function seedBusinessToDb(
  businessId: string,
  sector: SectorId,
  // Onboarding'de kullanıcının girdiği profil. Verilirse seed'in sektör-sabit
  // adı/telefonu bunu EZMEZ — kullanıcı ne yazdıysa o kalır.
  profile?: { businessName?: string; phone?: string | null }
): Promise<void> {
  const s = seedFor(sector);

  // bookingSlug GLOBAL benzersizdir (businesses_booking_slug_uq). seedFor sektör-sabit bir
  // slug üretir (ör. "maestro-kuafor") → aynı sektörü seed eden iki işletme çakışır. Mevcut
  // işletmenin (signup'ta gerçek isimden üretilmiş) slug'ını KORU; demo isim/sektör yine yazılır.
  const [bizRows] = await withTenant(businessId, () => [
    db.select().from(schema.businesses).where(eq(schema.businesses.id, businessId)),
  ]);
  const existing = camelizeRows<typeof schema.businesses.$inferSelect>(bizRows as Row[])[0];
  const bookingSlug = existing?.bookingSlug || s.bookingSlug;
  // İsim önceliği: onboarding'de girilen > kayıtta girilen > seed varsayılanı.
  const businessName = profile?.businessName?.trim() || existing?.name || s.businessName;
  const phone = profile?.phone?.trim() || existing?.phone || s.phone || null;

  await withTenant(businessId, () => [
    // 1) İşletme satırını seed profiliyle güncelle (slug korunur)
    db
      .update(schema.businesses)
      .set({
        name: businessName,
        sector: s.sector,
        bookingSlug,
        phone,
        reminderSettings: s.reminderSettings,
      })
      .where(eq(schema.businesses.id, businessId)),
    // 2) Çocuk tablolar
    db.insert(schema.services).values(s.services.map((x) => serviceToInsert(x, businessId))),
    db.insert(schema.staff).values(s.staff.map((x) => staffToInsert(x, businessId))),
    db.insert(schema.customers).values(s.customers.map((x) => customerToInsert(x, businessId))),
    db
      .insert(schema.appointments)
      .values(s.appointments.map((x) => appointmentToInsert(x, businessId))),
    db.insert(schema.campaigns).values(s.campaigns.map((x) => campaignToInsert(x, businessId))),
    db
      .insert(schema.reminderLogs)
      .values(s.reminderLogs.map((x) => reminderLogToInsert(x, businessId))),
    // 3) Abonelik
    db.insert(schema.subscriptions).values({
      businessId,
      planId: s.subscription.planId,
      startedAt: s.subscription.startedAt,
      nextRenewal: s.subscription.nextRenewal,
    }),
    // 4) Faturalar
    db.insert(schema.invoices).values(s.invoices.map((x) => invoiceToInsert(x, businessId))),
    // 5) Kasa: tahsilat + gider
    db.insert(schema.payments).values(s.payments.map((x) => paymentToInsert(x, businessId))),
    db.insert(schema.expenses).values(s.expenses.map((x) => expenseToInsert(x, businessId))),
  ]);
}

/**
 * Boş başlat (minimal kayıtlar). store.chooseSector'ın empty=true yolunun DB karşılığı:
 * business satırını sektör/isim/slug/telefon ile günceller, opsiyonel hizmet/personel ekler,
 * varsayılan subscription kurar. customers/appointments/campaigns/reminderLogs/invoices boş kalır.
 */
export async function createBusinessProfile(
  businessId: string,
  opts: {
    sector: SectorId;
    businessName: string;
    bookingSlug: string;
    phone?: string | null;
    services?: Service[];
    staff?: Staff[];
  }
): Promise<void> {
  const defaultReminder = {
    enabled: true,
    channel: "whatsapp" as const,
    hoursBefore: 24,
    template: "",
  };

  // business satırını yaz — slug global çakışırsa "-2", "-3" ... ile tekrar dene (500 atma).
  await writeBusinessSlugWithRetry(opts.bookingSlug, (slug) =>
    withTenant(businessId, () => [
      db
        .update(schema.businesses)
        .set({
          name: opts.businessName,
          sector: opts.sector,
          bookingSlug: slug,
          phone: opts.phone ?? null,
          reminderSettings: defaultReminder,
        })
        .where(eq(schema.businesses.id, businessId)),
    ]).then(() => undefined)
  );

  // subscription ayrı yazılır (slug retry'den bağımsız; mükerrer insert'i önlemek için).
  await withTenant(businessId, () => [
    db.insert(schema.subscriptions).values({
      businessId,
      planId: "profesyonel",
      startedAt: todayISO(),
      nextRenewal: nextMonthFirstISO(),
    }),
  ]);

  if (opts.services && opts.services.length > 0) {
    await withTenant(businessId, () => [
      db.insert(schema.services).values(opts.services!.map((x) => serviceToInsert(x, businessId))),
    ]);
  }
  if (opts.staff && opts.staff.length > 0) {
    await withTenant(businessId, () => [
      db.insert(schema.staff).values(opts.staff!.map((x) => staffToInsert(x, businessId))),
    ]);
  }
}
