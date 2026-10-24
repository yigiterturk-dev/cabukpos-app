"use server";
// Kullanıcı yönetimi: sahip + zincir merkezi (HQ) hesap açar, rol/şube atar, pasifleştirir.
// Şube müdürü (users.storeId dolu) bu ekranı kullanamaz; kural lib/core/access.ts'te saf ve testli.
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema, withTenant } from "@/db";
import { requireWriter } from "@/lib/auth/session";
import { esc, mailReady, sendEmail } from "@/lib/mail";
import { inviteLink } from "@/lib/auth/invite";
import { assignProblem, canManageUsers } from "@/lib/core/access";

import { changeUserAccess } from "./user-access";
import { createManagedUser } from "./user-create";
import { issueUserInvite } from "./user-invite";

export type UserState = { error?: string; field?: string; ok?: string; inviteUrl?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID = /^[0-9a-f-]{36}$/i;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function inviteMail(to: string, name: string, link: string): Promise<boolean> {
  if (!mailReady()) return false;
  return sendEmail({
    to: [to],
    subject: "ÇabukPOS hesabınıza davet",
    text: `Merhaba ${name},\n\nÇabukPOS yönetim paneli hesabınız açıldı. Şifrenizi belirlemek için: ${link}\n\nBağlantı 3 gün geçerlidir. Bu daveti beklemiyorsanız bu e-postayı yok sayın.`,
    html: `<p>Merhaba ${esc(name)},</p><p>ÇabukPOS yönetim paneli hesabınız açıldı. <a href="${esc(link)}">Şifrenizi belirlemek için tıklayın</a>.</p><p>Bağlantı 3 gün geçerlidir. Bu daveti beklemiyorsanız bu e-postayı yok sayın.</p>`,
  }).catch(() => false);
}

export async function createUser(_: UserState, form: FormData): Promise<UserState> {
  const a = await requireWriter();
  const name = str(form, "name").slice(0, 120);
  const email = str(form, "email").toLowerCase();
  const role = str(form, "role");
  const storeRaw = str(form, "storeId");
  if (name.length < 2) return { error: "Ad soyad 2-120 karakter olmalı.", field: "name" };
  if (email.length > 254 || !EMAIL.test(email)) return { error: "E-posta geçersiz (en fazla 254 karakter).", field: "email" };
  const problem = assignProblem(a, role, storeRaw || null);
  if (problem === "role") return { error: "Rol geçersiz.", field: "role" };
  if (problem === "store") return { error: "İşletme sahibi belirli bir şubeye bağlanamaz.", field: "storeId" };
  if (problem === "forbidden") return { error: "Bu rolde kullanıcı açma yetkiniz yok.", field: "role" };
  if (role === "mudur" && storeRaw && !UUID.test(storeRaw)) return { error: "Şube bulunamadı; listeyi yenileyip tekrar deneyin.", field: "storeId" };
  const [dup] = await getDb().select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
  if (dup) return { error: "Bu e-posta zaten kayıtlı.", field: "email" };

  const passwordHash = await bcrypt.hash(randomBytes(32).toString("base64url"), 12);
  const result = await withTenant(a.tenantId, (tx) => createManagedUser(tx, a.tenantId, a, {
    name, email, role, storeId: storeRaw || null, passwordHash,
  }));
  if ("error" in result) return result;
  revalidatePath("/yonetim/kullanicilar");
  const link = await inviteLink(result.user);
  const mailed = await inviteMail(email, name, link);
  return { ok: mailed ? "Kullanıcı açıldı; davet e-postası gönderildi." : "Kullanıcı açıldı. E-posta gönderimi kapalı — davet bağlantısını kopyalayıp iletin.", inviteUrl: mailed ? undefined : link };
}

export async function updateUserAccess(_: UserState, form: FormData): Promise<UserState> {
  const a = await requireWriter();
  const userId = str(form, "userId");
  const role = str(form, "role");
  const storeRaw = str(form, "storeId");
  const active = str(form, "active") === "on";
  if (!UUID.test(userId)) return { error: "Kullanıcı bulunamadı; listeyi yenileyin." };
  const result = await withTenant(a.tenantId, (tx) => changeUserAccess(tx, a.tenantId, a.id, {
    userId, role, storeId: storeRaw || null, active,
  }));
  if (result.error) return result;
  revalidatePath("/yonetim/kullanicilar");
  return result;
}

export async function sendUserInvite(userId: string): Promise<UserState> {
  const a = await requireWriter();
  if (!canManageUsers(a)) return { error: "Davet gönderme yetkiniz yok." };
  if (!UUID.test(userId)) return { error: "Kullanıcı bulunamadı." };
  const result = await withTenant(a.tenantId, (tx) => issueUserInvite(tx, a.tenantId, a, userId));
  if ("error" in result) return result;
  const { email, name, link } = result.invite;
  const mailed = await inviteMail(email, name, link);
  return { ok: mailed ? "Davet e-postası gönderildi." : "E-posta gönderimi kapalı — davet bağlantısını kopyalayıp iletin.", inviteUrl: mailed ? undefined : link };
}

/** Form sarmalayıcısı: satırdaki "Davet gönder" düğmesi için. */
export async function sendUserInviteAction(_: UserState, form: FormData): Promise<UserState> {
  return sendUserInvite(str(form, "userId"));
}
