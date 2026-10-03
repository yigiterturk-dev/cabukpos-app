// lib/admin/lang.ts — #45: panel dili cz_dil çerezinde; geçersizse TR.
import { cookies } from "next/headers";
import { DEFAULT_LANG, isLang, type Lang } from "@/lib/core/i18n";

export async function getLang(): Promise<Lang> {
  const v = (await cookies()).get("cz_dil")?.value;
  return isLang(v) ? v : DEFAULT_LANG;
}
