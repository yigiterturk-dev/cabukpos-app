import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, ADMIN_SESSION_MAX_AGE, secureByProto, shouldRenewSession } from "@/lib/auth/session-cookie";
import { signJwt, verifyJwt } from "@/lib/auth/jwt";

// Yönetim yalnız imzalı yönetici çereziyle (ayrıntılı kontrol sayfada, DB'den). Kasa kendi cihaz/kasiyer kontrolünü yapar.
export async function proxy(req: NextRequest) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const p = await verifyJwt("admin", token);
  if (!p) {
    const url = req.nextUrl.clone();
    url.pathname = "/giris";
    url.search = "";
    return NextResponse.redirect(url);
  }
  // Kayan oturum: etkinlikte jeton yaşı eşiği aşınca yeni 14 günlük jeton ver (aynı kimlik; eski değer kendi süresi dolana dek geçerli kalır — tam iptal #9'da DB oturum listesiyle).
  if (token && shouldRenewSession(p.iat, Date.now() / 1000)) {
    const fresh = await signJwt("admin", { userId: p.userId, tenantId: p.tenantId, v: p.v }, ADMIN_SESSION_MAX_AGE);
    const res = NextResponse.next();
    res.cookies.set(ADMIN_COOKIE, fresh, {
      httpOnly: true,
      secure: secureByProto(req.headers.get("x-forwarded-proto") ?? (req.nextUrl.protocol === "https:" ? "https" : "http")),
      sameSite: "lax",
      path: "/",
      maxAge: ADMIN_SESSION_MAX_AGE,
    });
    return res;
  }
  return NextResponse.next();
}

export const config = { matcher: ["/yonetim", "/yonetim/:path*"] };
