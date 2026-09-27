"use server";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { audit } from "@/lib/audit";
import { clientIp, hit } from "@/lib/ratelimit";
import { passwordProblem } from "./password";
import { clearAdminSession, setAdminSession } from "./session";

export type AuthState = { error?: string; field?: string; values?: Record<string, string> };

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
  const pw = passwordProblem(password);
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
  const [u] = await getDb().select().from(schema.users).where(eq(schema.users.email, email));
  if (!u || !u.active || !(await bcrypt.compare(password, u.passwordHash))) return { error: "E-posta veya şifre hatalı.", values };
  await getDb().delete(schema.loginAttempts).where(eq(schema.loginAttempts.key, `e:${email}`));
  await setAdminSession(u.id, u.tenantId, u.tokenVersion);
  redirect("/yonetim");
}

export async function logout() {
  await clearAdminSession();
  redirect("/giris");
}
