// Public (oturumsuz) online rezervasyon veri katmanı — server-only.
//
// /r/[slug] sayfasının salt-okunur loader'ı + public randevu yazımı. Tümü db/public-booking.sql
// SECURITY DEFINER fonksiyonları üzerinden gider (owner db.execute bağlantısı). Bu fonksiyonlar
// slug'tan businessId çözer ve SADECE o işletmenin verisine erişir; hassas alan döndürmez.
//
// requireBusinessId(session) KULLANILMAZ — businessId daima slug'tan sunucuda çözülür.

import { sql } from "drizzle-orm";

import { db } from "@/db";
import type { SectorId } from "@/lib/types";

// Public sayfaya verilen DAR şekiller (BusinessState DEĞİL — yalnız gereken alanlar).
export type PublicBookingService = {
  id: string;
  name: string;
  durationMin: number;
  price: number;
};

export type PublicBookingStaff = {
  id: string;
  name: string;
  role: string;
  color: string;
  initials: string;
  workStart?: string;
  workEnd?: string;
  serviceIds?: string[];
};

export type PublicBookingBusy = {
  staffId: string;
  date: string;
  start: string;
  durationMin: number;
};

export type PublicBookingData = {
  slug: string;
  businessName: string;
  sector: SectorId | null;
  services: PublicBookingService[];
  staff: PublicBookingStaff[];
  busy: PublicBookingBusy[];
};

type ExecRows<T> = { rows: T[] };

/**
 * Slug'tan public rezervasyon verisini kurar. İşletme bulunamazsa null (sayfa 404 verir).
 * Yalnız işletme adı/sektör + AKTİF hizmetler + AKTİF personel + meşgul aralıklar döner.
 */
export async function getPublicBookingBySlug(slug: string): Promise<PublicBookingData | null> {
  const cleanSlug = (slug || "").trim();
  if (!cleanSlug) return null;

  const bizRes = (await db.execute(
    sql`SELECT id, name, sector FROM public_booking_business(${cleanSlug})`
  )) as unknown as ExecRows<{ id: string; name: string; sector: string | null }>;
  const biz = bizRes.rows?.[0];
  if (!biz) return null;

  const [svcRes, stfRes, busyRes] = (await Promise.all([
    db.execute(sql`SELECT id, name, duration_min, price FROM public_booking_services(${cleanSlug})`),
    db.execute(
      sql`SELECT id, name, role, color, initials, work_start, work_end, service_ids FROM public_booking_staff(${cleanSlug})`
    ),
    db.execute(sql`SELECT staff_id, date, start, duration_min FROM public_booking_busy(${cleanSlug})`),
  ])) as unknown as [
    ExecRows<{ id: string; name: string; duration_min: number; price: number }>,
    ExecRows<{
      id: string;
      name: string;
      role: string;
      color: string;
      initials: string;
      work_start: string | null;
      work_end: string | null;
      service_ids: string[] | null;
    }>,
    ExecRows<{ staff_id: string; date: string; start: string; duration_min: number }>,
  ];

  return {
    slug: cleanSlug,
    businessName: biz.name,
    sector: (biz.sector as SectorId | null) ?? null,
    services: (svcRes.rows ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      durationMin: Number(r.duration_min),
      price: Number(r.price),
    })),
    staff: (stfRes.rows ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      role: r.role,
      color: r.color,
      initials: r.initials,
      workStart: r.work_start ?? undefined,
      workEnd: r.work_end ?? undefined,
      serviceIds: r.service_ids ?? undefined,
    })),
    busy: (busyRes.rows ?? []).map((r) => ({
      staffId: r.staff_id,
      date: r.date,
      start: r.start,
      durationMin: Number(r.duration_min),
    })),
  };
}

export type CreatePublicBookingInput = {
  serviceId: string;
  staffId: string;
  date: string;
  start: string;
  name: string;
  phone: string;
};

/**
 * Public randevu yaz: businessId daima slug'tan SQL içinde çözülür (session DEĞİL).
 * approval='bekliyor', status='bekliyor', source='online'. Çakışma/geçersiz veri → hata.
 */
export async function createPublicBookingDb(
  slug: string,
  input: CreatePublicBookingInput
): Promise<{ appointmentId: string }> {
  const res = (await db.execute(
    sql`SELECT public_booking_create(
      ${slug}, ${input.serviceId}, ${input.staffId}, ${input.date}, ${input.start},
      ${input.name}, ${input.phone}
    ) AS appointment_id`
  )) as unknown as ExecRows<{ appointment_id: string }>;
  const appointmentId = res.rows?.[0]?.appointment_id;
  if (!appointmentId) {
    throw new Error("booking_failed");
  }
  return { appointmentId };
}
