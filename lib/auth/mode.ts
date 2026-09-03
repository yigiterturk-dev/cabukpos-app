"use server";

// Mod (mode) yardımcıları — DB modu vs Demo modu (server action'lar).
//
// İki mod:
//   - "db":   geçerli session var → veriler Neon'dan (RLS, tenant-scope).
//   - "demo": session yok ama `demo` çerezi var → localStorage davranışı (satış demosu).
//   - "none": ikisi de yok → middleware /giris'e yönlendirir.
//
// NOT: "use server" dosyaları yalnız async fonksiyon export edebilir → sabit/tip burada
// EXPORT EDİLMEZ (DEMO_COOKIE değeri middleware'de ayrıca tanımlı; AppMode tipi store.tsx'te).

import { cookies } from "next/headers";
import { getLiveSession } from "./session";

const DEMO_COOKIE = "demo";
const DEMO_MAX_AGE = 60 * 60 * 24 * 30; // 30 gün

/**
 * Aktif modu döndürür (server-side): "db" | "demo" | "none".
 *
 * getLiveSession kullanılır, getSession DEĞİL: imza geçerli olsa bile kullanıcı
 * silinmiş ya da erişimi iptal edilmiş olabilir. İmzaya bakıp "db" demek, iptal
 * edilmiş bir oturumu içeri almak demekti.
 */
export async function getMode(): Promise<"db" | "demo" | "none"> {
  const session = await getLiveSession();
  if (session?.businessId) return "db";
  const store = await cookies();
  if (store.get(DEMO_COOKIE)?.value) return "demo";
  return "none";
}

/** Demo modunu başlat (çerez set). Onboarding "Demo'yu dene" akışında çağrılır. */
export async function enableDemoMode(): Promise<void> {
  const store = await cookies();
  store.set(DEMO_COOKIE, "1", {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DEMO_MAX_AGE,
  });
}

/** Demo çerezini temizle. */
export async function disableDemoMode(): Promise<void> {
  const store = await cookies();
  store.delete(DEMO_COOKIE);
}
