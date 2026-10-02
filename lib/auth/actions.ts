"use server";
import bcrypt from "bcryptjs";
import { eq, inArray, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { audit } from "@/lib/audit";
import { clientIp, hit } from "@/lib/ratelimit";
import { appUrl, esc, mailReady, sendEmail } from "@/lib/mail";
import { salesContact } from "@/lib/billing/plans";
import { passwordProblemAsync } from "./password";
import { failKey, shouldLock } from "./lockout";
import { newTotpSecret, otpauthUrl, verifyTotp } from "./totp";
import { checkReset, resetToken } from "./reset";
import { dogrulaToken } from "./verify-email";
import { clearAdminSession, getAdmin, setAdminSession } from "./session";

export type AuthState = { error?: string; field?: string; values?: Record<string, string>; ok?: string };

export async function signup(_: AuthState, form: FormData): Promise<AuthState> {
  const values = {
    businessName: String(form.get("businessName") ?? "").trim(),
    vertical: String(form.get("vertical") ?? ""),
    name: String(form.get("name") ?? "").trim(),
    email: String(form.get("email") ?? "").trim().toLowerCase(),
  };
  const password = String(form.get("password") ?? "");
  const fail = (error: string, field: string): AuthState => ({ error, field, values });
  if (values.businessName.length < 2 || values.businessName.length > 80) return fail("İşletme adı 2-80 karakter.", "businessName");
  if (values.vertical !== "restoran" && values.vertical !== "market") return fail("İşletme türünü seçin.", "vertical");
  if (values.name.length < 2) return fail("Ad soyad gerekli.", "name");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email)) return fail("E-posta geçersiz.", "email");
  const pw = await passwordProblemAsync(password);
  if (pw) return fail(pw, "password");
  if ((await hit(`signup:${await clientIp()}`, 60)) > 5) return fail("Çok fazla kayıt denemesi. Bir saat sonra tekrar deneyin.", "email");

  const hash = await bcrypt.hash(password, 12);
  const res = await getDb().transaction(async (tx) => {
    const [dup] = await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, values.email));
    if (dup) return null;
    const [t] = await tx.insert(schema.tenants).values({ name: values.businessName, vertical: values.vertical as "restoran" | "market" }).returning();
    const [u] = await tx.insert(schema.users).values({ tenantId: t.id, email: values.email, name: values.name, passwordHash: hash, role: "sahip" }).returning();
    await tx.execute(sql`select set_config('app.tenant_id', ${t.id}, true)`);
    await tx.insert(schema.stores).values({ tenantId: t.id, name: "Merkez" });
    await audit(tx, t.id, `user:${u.id}`, "tenant.signup", { vertical: values.vertical });
    return { userId: u.id, tenantId: t.id };
  });
  if (!res) return fail("Bu e-posta zaten kayıtlı.", "email");
  if (mailReady()) {
    const baglanti = `${appUrl()}/dogrula?t=${await dogrulaToken({ id: res.userId, email: values.email })}`;
    await sendEmail({
      to: [values.email],
      subject: "ÇabukPOS e-posta doğrulama",
      text: `Merhaba ${values.name},\n\nÇabukPOS hesabınızı doğrulamak için: ${baglanti}\n\nBağlantı 24 saat geçerlidir. Bu kaydı siz yapmadıysanız bu e-postayı yok sayın.`,
      html: `<p>Merhaba ${esc(values.name)},</p><p><a href="${esc(baglanti)}">E-postanızı doğrulamak için tıklayın</a>. Bağlantı 24 saat geçerlidir.</p><p>Bu kaydı siz yapmadıysanız bu e-postayı yok sayın.</p>`,
    }).catch(() => {});
  }
  await setAdminSession(res.userId, res.tenantId, 0);
  redirect("/yonetim");
}

export async function login(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const values = { email };
  if (!email || !password) return { error: "E-posta ve şifre gerekli.", values };
  const [e, i] = await Promise.all([hit(`e:${email}`), hit(`ip:${await clientIp()}`)]);
  if (e > 8 || i > 30) return { error: "Çok fazla deneme. 15 dakika sonra tekrar deneyin.", values };
  if (shouldLock(await hit(failKey(email)))) return { error: "Çok fazla başarısız deneme. Hesap 15 dakika kilitli; şifrenizi unuttuysanız yenileyin.", values };
  const [u] = await getDb().select().from(schema.users).where(eq(schema.users.email, email));
  if (!u || !u.active || !(await bcrypt.compare(password, u.passwordHash))) return { error: "E-posta veya şifre hatalı.", values };
  if (u.totpSecret) {
    const kod = String(form.get("kod") ?? "").trim();
    if (!kod) return { error: "2FA kodu gerekli. Kimlik doğrulayıcı uygulamanızdaki 6 haneli kodu girin.", values };
    if (!verifyTotp(u.totpSecret, kod)) return { error: "E-posta, şifre veya 2FA kodu hatalı.", values };
  }
  await getDb().delete(schema.loginAttempts).where(inArray(schema.loginAttempts.key, [`e:${email}`, failKey(email)]));
  await setAdminSession(u.id, u.tenantId, u.tokenVersion);
  redirect("/yonetim");
}

export type MfaState = { secret?: string; url?: string; error?: string; ok?: string };

/** Yeni 2FA kurulumu: gizli anahtar üretir, henüz kaydetmez; onay kodu doğrulaması kaydeder. */
export async function mfaBasla(): Promise<MfaState> {
  const a = await getAdmin();
  if (!a) return { error: "Oturum gerekli." };
  const secret = newTotpSecret();
  return { secret, url: otpauthUrl(secret, a.email) };
}

export async function mfaOnayla(_: MfaState, form: FormData): Promise<MfaState> {
  const a = await getAdmin();
  if (!a) return { error: "Oturum gerekli." };
  const secret = String(form.get("secret") ?? "");
  const kod = String(form.get("kod") ?? "");
  if (!/^[A-Z2-7]{32,64}$/i.test(secret)) return { error: "Kurulum baştan başlatılmalı." };
  if (!verifyTotp(secret, kod)) return { error: "Kod doğrulanamadı. Uygulamadaki güncel kodu girin." };
  await getDb().update(schema.users).set({ totpSecret: secret }).where(eq(schema.users.id, a.id));
  await getDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${a.tenantId}, true)`);
    await audit(tx, a.tenantId, `user:${a.id}`, "user.totp_on");
  });
  return { ok: "İki adımlı doğrulama açıldı. Girişte artık kod istenecek." };
}

export async function mfaKapat(_: MfaState, form: FormData): Promise<MfaState> {  const a = await getAdmin();
  if (!a) return { error: "Oturum gerekli." };
  const sifre = String(form.get("password") ?? "");
  const [u] = await getDb().select({ passwordHash: schema.users.passwordHash }).from(schema.users).where(eq(schema.users.id, a.id));
  if (!u || !(await bcrypt.compare(sifre, u.passwordHash))) return { error: "Şifre hatalı." };
  await getDb().update(schema.users).set({ totpSecret: null }).where(eq(schema.users.id, a.id));
  await getDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${a.tenantId}, true)`);
    await audit(tx, a.tenantId, `user:${a.id}`, "user.totp_off");
  });
  return { ok: "İki adımlı doğrulama kapatıldı." };
}

/** Doğrulama e-postasını yeniden gönder (sahip oturumu; form action). */
export async function emailDogrulamaGonderAction(): Promise<void> {
  const a = await getAdmin();
  if (!a || a.emailVerified) return;
  if ((await hit(`dv:${a.email}`, 60)) > 3) return;
  if (!mailReady()) return;
  const baglanti = `${appUrl()}/dogrula?t=${await dogrulaToken({ id: a.id, email: a.email })}`;
  await sendEmail({
    to: [a.email],
    subject: "ÇabukPOS e-posta doğrulama",
    text: `Merhaba ${a.name},\n\nE-postanızı doğrulamak için: ${baglanti}\n\nBağlantı 24 saat geçerlidir.`,
    html: `<p>Merhaba ${esc(a.name)},</p><p><a href="${esc(baglanti)}">E-postanızı doğrulamak için tıklayın</a>. Bağlantı 24 saat geçerlidir.</p>`,
  }).catch(() => {});
}

export async function logout() {
  await clearAdminSession();
  redirect("/giris");
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Hesap var mı yok mu belli etmez: her durumda aynı yanıt. Mail kapalıysa destek iletişimi gösterilir. */
export async function requestReset(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const values = { email };
  if (!EMAIL.test(email)) return { error: "E-posta geçersiz.", values };
  if (!mailReady()) {
    const c = salesContact();
    return { error: `E-posta gönderimi şu an kapalı.${c ? ` Şifre yenilemek için: ${c}` : " Destekle iletişime geçin."}`, values };
  }
  const [e, i] = await Promise.all([hit(`reset:${email}`, 60), hit(`reset-ip:${await clientIp()}`, 60)]);
  const ok = { ok: "Bu e-posta kayıtlıysa şifre yenileme bağlantısı gönderdik. Bağlantı 1 saat geçerli; gelen kutusu yoksa istenmeyen klasörüne bakın." };
  if (e > 3 || i > 10) return ok;
  const [u] = await getDb().select().from(schema.users).where(eq(schema.users.email, email));
  if (!u || !u.active) return ok;
  const link = `${appUrl()}/sifre-yenile?t=${await resetToken(u)}`;
  await sendEmail({
    to: [u.email],
    subject: "ÇabukPOS şifre yenileme",
    text: `Merhaba ${u.name},\n\nŞifrenizi yenilemek için: ${link}\n\nBağlantı 1 saat geçerlidir. Bu isteği siz yapmadıysanız bu e-postayı yok sayın.`,
    html: `<p>Merhaba ${esc(u.name)},</p><p><a href="${esc(link)}">Şifrenizi yenilemek için tıklayın</a>. Bağlantı 1 saat geçerlidir.</p><p>Bu isteği siz yapmadıysanız bu e-postayı yok sayın.</p>`,
  });
  return ok;
}

export async function resetPassword(_: AuthState, form: FormData): Promise<AuthState> {
  const token = String(form.get("t") ?? "");
  const password = String(form.get("password") ?? "");
  const pw = await passwordProblemAsync(password);
  if (pw) return { error: pw, field: "password" };
  const U = schema.users;
  const userId = await checkReset(token, async (id) => (await getDb().select({ passwordHash: U.passwordHash, active: U.active }).from(U).where(eq(U.id, id)))[0] ?? null);
  if (!userId) return { error: "Bağlantı geçersiz ya da süresi dolmuş. Yeni bağlantı isteyin." };
  const hash = await bcrypt.hash(password, 12);
  // tokenVersion artar → diğer cihazlardaki yönetim oturumları düşer.
  // Password reset revokes every previous session; the fresh session below is the only one kept.
  const revokeSessions = getDb().update(U).set({ passwordHash: hash, tokenVersion: sql`${U.tokenVersion} + 1` }).where(eq(U.id, userId)).returning();
  const [u] = await revokeSessions;
  await getDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${u.tenantId}, true)`);
    await audit(tx, u.tenantId, `user:${u.id}`, "user.password_reset");
  });
  await getDb().delete(schema.loginAttempts).where(inArray(schema.loginAttempts.key, [`e:${u.email}`, failKey(u.email)]));
  await setAdminSession(u.id, u.tenantId, u.tokenVersion);
  redirect("/yonetim");
}
