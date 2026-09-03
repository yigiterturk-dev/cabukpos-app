"use server";

// Public (oturumsuz) online rezervasyon server action'ı.
//
// GÜVENLİK: businessId ASLA client'tan/session'dan alınmaz — slug'tan SUNUCUDA çözülür
// (createPublicBookingDb → db/public-booking.sql SECURITY DEFINER). approval='bekliyor'.
//
// Anti-spam SUNUCU tarafında uygulanır (client-side localStorage'a GÜVENİLMEZ):
//   1) honeypot: gizli alan doluysa bot → sessizce başarı taklidi (ok:true), DB'ye yazma.
//   2) IP + slug bazlı rate-limit — sayaç DB'de (lib/rate-limit.ts + db/rate-limit.sql),
//      yani tüm serverless instance'lar aynı sayacı görür; cold start sıfırlamaz.

import { headers } from "next/headers";

import { RL, clientIp, rateLimited } from "@/lib/rate-limit";
import { isValidTRPhone } from "@/lib/utils";
import { createPublicBookingDb, type CreatePublicBookingInput } from "@/lib/data/public-booking";

export type PublicBookingResult =
  | { ok: true; appointmentId?: string }
  | { ok: false; error: string };

// Basit alan doğrulama (server-side — client validasyona güvenme).
function validShape(input: CreatePublicBookingInput): boolean {
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(input.date);
  const timeOk = /^\d{2}:\d{2}$/.test(input.start);
  return (
    typeof input.serviceId === "string" && input.serviceId.length > 0 && input.serviceId.length < 80 &&
    typeof input.staffId === "string" && input.staffId.length > 0 && input.staffId.length < 80 &&
    dateOk &&
    timeOk &&
    typeof input.name === "string" &&
    typeof input.phone === "string"
  );
}

/**
 * Public randevu oluştur. slug'a bağlı; session KULLANMAZ.
 * honeypot doluysa sessizce ok döner (bota bilgi verme). Aksi halde rate-limit + format
 * + telefon doğrulaması, sonra DB'ye approval='bekliyor' randevu yazar.
 */
export async function createPublicBooking(
  slug: string,
  input: CreatePublicBookingInput & { honeypot?: string; formMs?: number }
): Promise<PublicBookingResult> {
  const cleanSlug = (slug || "").trim();
  if (!cleanSlug) return { ok: false, error: "Geçersiz rezervasyon linki." };

  // 1) Honeypot — bot doldurursa sessizce "başarılı" gibi davran, DB'ye yazma.
  if (input.honeypot && input.honeypot.trim() !== "") {
    return { ok: true };
  }

  // 2) Çok hızlı submit (< 1.5 sn) — bot şüphesi.
  if (typeof input.formMs === "number" && input.formMs >= 0 && input.formMs < 1500) {
    return { ok: false, error: "Lütfen formu doldurduktan sonra tekrar deneyin." };
  }

  // 3) Format/alan doğrulama (server-side).
  if (!validShape(input)) {
    return { ok: false, error: "Eksik veya geçersiz bilgi." };
  }
  if (!isValidTRPhone(input.phone)) {
    return { ok: false, error: "Geçerli bir telefon numarası girin (örn. 0532 123 45 67)." };
  }

  // 4) Rate-limit (IP + slug) — DB sayacı, instance'lar arası ortak (lib/rate-limit.ts).
  const ip = await clientIp();
  if (await rateLimited(`booking:${ip}|${cleanSlug}`, RL.booking)) {
    return { ok: false, error: "Çok fazla talep aldık. Lütfen bir süre sonra tekrar deneyin." };
  }

  try {
    const { appointmentId } = await createPublicBookingDb(cleanSlug, {
      serviceId: input.serviceId,
      staffId: input.staffId,
      date: input.date,
      start: input.start,
      name: input.name.trim().slice(0, 80) || "Online Müşteri",
      phone: input.phone.trim().slice(0, 30) || "—",
    });
    return { ok: true, appointmentId };
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)) +
      " " + (e instanceof Error && e.cause instanceof Error ? e.cause.message : "");
    if (msg.includes("slot_taken")) {
      return { ok: false, error: "Bu saat az önce doldu. Lütfen başka bir saat seçin." };
    }
    if (msg.includes("business_not_found")) {
      return { ok: false, error: "İşletme bulunamadı." };
    }
    if (msg.includes("service_not_found") || msg.includes("staff_not_found")) {
      return { ok: false, error: "Seçilen hizmet/personel artık geçerli değil. Sayfayı yenileyin." };
    }
    return { ok: false, error: "Randevu oluşturulamadı. Lütfen tekrar deneyin." };
  }
}
