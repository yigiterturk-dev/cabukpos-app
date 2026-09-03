// Gate (edge middleware) — korumalı uygulama rotalarını oturum VEYA demo çereziyle korur.
//
// EDGE UYUMLU: yalnız jose ile JWT doğrular (HS256). bcrypt/db ÇAĞIRMAZ (bunlar edge'de
// çalışmaz + ağır). Sadece imza/expiry geçerliyse "oturumlu" sayar.
//
// Public rotalar: /, /giris, /kayit, /r/[slug], /api/auth/*, /_next, statik dosyalar.
// Korumalı uygulama rotaları (aşağıdaki PROTECTED) → session VEYA demo çerezi yoksa /giris.

import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "rezzy_session";
const DEMO_COOKIE = "demo";

// Korumalı uygulama rota önekleri.
const PROTECTED = [
  "/dashboard",
  "/takvim",
  "/musteriler",
  "/kasa",
  "/hizmetler",
  "/personel",
  "/raporlar",
  "/kampanyalar",
  "/hatirlatma",
  "/rezervasyon",
  "/abonelik",
];

function isProtected(pathname: string): boolean {
  return PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

async function hasValidSession(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!isProtected(pathname)) return NextResponse.next();

  const session = await hasValidSession(req);
  const demo = !!req.cookies.get(DEMO_COOKIE)?.value;

  if (session || demo) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/giris";
  url.search = "";
  return NextResponse.redirect(url);
}

// matcher: _next/statik/api hariç tüm rotalar (PROTECTED kontrolü middleware içinde).
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|api/|.*\\..*).*)",
  ],
};
