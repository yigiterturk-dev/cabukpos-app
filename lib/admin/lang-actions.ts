"use server";
// #45: panel dili seçimi (her yönetim oturumu — kasa personeli değil).
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { isLang, LANG_COOKIE } from "@/lib/core/i18n";

export type LangState = { error?: string; savedAt?: number };

export async function setLang(_: LangState, form: FormData): Promise<LangState> {
  await requireAdmin();
  const lang = String(form.get("lang") ?? "");
  if (!isLang(lang)) return { error: "Dil geçersiz." };
  (await cookies()).set(LANG_COOKIE, lang, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/yonetim", "layout");
  return { savedAt: Date.now() };
}
