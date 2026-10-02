// lib/auth/reauth.ts — hassas işlemde tekrar kimlik doğrulama.
// mfaKapat'ın inline şifre denetimi merkeze alındı: tehlikeli aksiyonlar (rol/PIN
// değişimi, erişim anahtarı üretimi, 2FA kapatma) oturum çalınmış olsa bile
// hesap şifresini bir daha ister. Form tabanlı aksiyonlara uygun: hata mesajı
// döner (null = geçti), fırlatmaz; State hattında field:"sifre" ile gösterilir.
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

export async function checkReauth(userId: string, form: FormData): Promise<string | null> {
  const sifre = String(form.get("sifre") ?? "");
  if (!sifre) return "Bu işlem için hesap şifrenizi girmeniz gerekir.";
  const [u] = await getDb().select({ passwordHash: schema.users.passwordHash }).from(schema.users).where(eq(schema.users.id, userId));
  if (!u || !(await bcrypt.compare(sifre, u.passwordHash))) return "Şifre hatalı.";
  return null;
}
