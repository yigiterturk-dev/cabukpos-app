"use server";

// E-posta/şifre auth — server action'ları.
//
// RLS notu: signup/login pre-auth yolları, SECURITY DEFINER SQL fonksiyonları
// (db/auth.sql: auth_create_business_and_owner, auth_get_user_by_email) üzerinden
// gider. Bu fonksiyonlar RLS'i güvenli ve dar bir yüzeyle atlar (app.business_id
// henüz set edilmemişken e-postadan kullanıcı bulma / business+owner oluşturma).

import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { RL, clientIp, rateLimited, resetRateLimit } from "@/lib/rate-limit";
import { createSession, destroySession } from "./session";

const BCRYPT_ROUNDS = 12;

export type AuthResult =
  | { ok: true; businessId: string }
  | { ok: false; error: string };

// Türkçe karakterleri sadeleştirip url-güvenli slug üretir.
function slugify(input: string): string {
  const map: Record<string, string> = {
    ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u",
    Ç: "c", Ğ: "g", İ: "i", Ö: "o", Ş: "s", Ü: "u",
  };
  const base = input
    .trim()
    .replace(/[çğıöşüÇĞİÖŞÜ]/g, (m) => map[m] ?? m)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "isletme";
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Kayıt: business + owner user oluştur (tek SQL işleminde), session cookie set et.
 * sector opsiyonel — onboarding sonra ayarlar.
 */
export async function signupAction(input: {
  email: string;
  password: string;
  businessName: string;
  sector?: string | null;
}): Promise<AuthResult> {
  const email = input.email?.trim().toLowerCase() ?? "";
  const password = input.password ?? "";
  const businessName = input.businessName?.trim() ?? "";

  if (!isValidEmail(email)) {
    return { ok: false, error: "Geçerli bir e-posta girin." };
  }
  if (password.length < 8) {
    return { ok: false, error: "Şifre en az 8 karakter olmalı." };
  }
  if (businessName.length < 2) {
    return { ok: false, error: "İşletme adını girin." };
  }

  // Sahte işletme spam'ini kes: IP başına saatte 5 kayıt.
  if (await rateLimited(`signup:ip:${await clientIp()}`, RL.signup)) {
    return { ok: false, error: "Çok fazla kayıt denemesi. Bir süre sonra tekrar deneyin." };
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const slug = slugify(businessName);

  try {
    const rows = (await db.execute(
      sql`SELECT auth_create_business_and_owner(
        ${businessName}, ${email}, ${passwordHash}, ${slug}, ${input.sector ?? null}
      ) AS business_id`
    )) as unknown as { rows: Array<{ business_id: string }> };

    const businessId = rows.rows?.[0]?.business_id;
    if (!businessId) {
      return { ok: false, error: "Kayıt oluşturulamadı. Tekrar deneyin." };
    }

    // Yeni kullanıcının id'sini al (session payload için)
    const userRows = (await db.execute(
      sql`SELECT id, role FROM auth_get_user_by_email(${email})`
    )) as unknown as { rows: Array<{ id: string; role: string }> };
    const user = userRows.rows?.[0];

    await createSession({
      userId: user?.id ?? "",
      businessId,
      role: user?.role ?? "owner",
    });

    return { ok: true, businessId };
  } catch (e) {
    // Drizzle, asıl Postgres hatasını e.cause altında saklar; her ikisine de bak.
    const cause = e instanceof Error ? (e.cause as unknown) : undefined;
    const causeMsg =
      cause instanceof Error ? cause.message : cause ? String(cause) : "";
    const msg = (e instanceof Error ? e.message : String(e)) + " " + causeMsg;
    if (msg.includes("email_taken") || msg.includes("users_email_uq")) {
      return { ok: false, error: "Bu e-posta zaten kayıtlı." };
    }
    return { ok: false, error: "Kayıt sırasında bir hata oluştu." };
  }
}

/**
 * Giriş: e-postadan kullanıcıyı bul (SECURITY DEFINER), bcrypt compare, session set et.
 */
export async function loginAction(input: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  const email = input.email?.trim().toLowerCase() ?? "";
  const password = input.password ?? "";

  if (!isValidEmail(email) || !password) {
    return { ok: false, error: "E-posta veya şifre hatalı." };
  }

  // İKİ EKSENLİ limit: tek IP'nin çok hesap denemesi VE çok IP'nin tek hesabı denemesi.
  // Hesap ekseninde anahtar e-postadır; kullanıcı var mı yok mu bilgisini SIZDIRMAMAK için
  // her iki durumda da aynı mesaj döner.
  const ip = await clientIp();
  const ipKey = `login:ip:${ip}`;
  const acctKey = `login:acct:${email}`;
  if (
    (await rateLimited(ipKey, RL.login)) ||
    (await rateLimited(acctKey, RL.loginAccount))
  ) {
    return {
      ok: false,
      error: "Çok fazla başarısız deneme. 15 dakika sonra tekrar deneyin.",
    };
  }

  try {
    const rows = (await db.execute(
      sql`SELECT id, business_id, password_hash, role
          FROM auth_get_user_by_email(${email})`
    )) as unknown as {
      rows: Array<{
        id: string;
        business_id: string;
        password_hash: string | null;
        role: string;
      }>;
    };

    const user = rows.rows?.[0];
    // Kullanıcı yoksa da bcrypt'i TAM tur çalıştırıp zamanlama farkını azalt (user enumeration
    // zorlaştır). GEÇERLİ formatlı sabit bir hash kullan: geçersiz formatlı hash bcrypt.compare'in
    // erken dönmesine ve zamanlama sızıntısına yol açar. (Bu hash bcrypt.hashSync("x",12) çıktısı,
    // hiçbir gerçek şifreyle eşleşmemesi için kasıtlı sabit/keyfi.)
    const DUMMY_HASH = "$2b$12$s90IMUcABFrs8Ebsczxu/.jBZ/f8yjn6QsT1VjklS9QZ0.7PAJ6kC";
    const hash = user?.password_hash ?? DUMMY_HASH;
    const match = await bcrypt.compare(password, hash);

    if (!user || !user.password_hash || !match) {
      return { ok: false, error: "E-posta veya şifre hatalı." };
    }

    // Doğru şifre → sayaçları temizle, meşru kullanıcı kilitte kalmasın.
    await Promise.all([resetRateLimit(ipKey), resetRateLimit(acctKey)]);

    await createSession({
      userId: user.id,
      businessId: user.business_id,
      role: user.role,
    });

    return { ok: true, businessId: user.business_id };
  } catch {
    return { ok: false, error: "Giriş sırasında bir hata oluştu." };
  }
}

/** Çıkış: session cookie'sini temizle. */
export async function logoutAction(): Promise<void> {
  await destroySession();
}
