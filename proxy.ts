import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE } from "@/lib/auth/session-cookie";
import { verifyJwt } from "@/lib/auth/jwt";

// Yönetim yalnız imzalı yönetici çereziyle (ayrıntılı kontrol sayfada, DB'den). Kasa kendi cihaz/kasiyer kontrolünü yapar.
export async function proxy(req: NextRequest) {
  if (await verifyJwt("admin", req.cookies.get(ADMIN_COOKIE)?.value)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/giris";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/yonetim", "/yonetim/:path*"] };
