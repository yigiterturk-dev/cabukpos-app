/** @type {import('next').NextConfig} */

// Güvenlik başlıkları — tüm rotalara uygulanır (async headers()).
//
// CSP NOTU: Next.js inline bootstrap/hidrasyon script'leri ve runtime style'lar enjekte eder.
// Nonce tabanlı CSP App Router'da tüm sayfaları dinamikleştireceği için (statik optimizasyon
// kaybı) burada 'unsafe-inline' ile Next-uyumlu, uygulamayı KIRMAYAN bir politika kullanıyoruz.
//   - script-src: 'self' 'unsafe-inline'  → Next inline bootstrap; dev'de eval gerekiyor.
//   - style-src:  'self' 'unsafe-inline'  → Tailwind/Next inline style + next/font.
//   - img-src:    'self' data: blob:      → QR (inline SVG) + data/blob görseller.
//   - font-src:   'self'                  → next/font build-time self-host (runtime fetch yok).
//   - frame-ancestors 'none'              → clickjacking koruması (X-Frame-Options ile çift).
const isDev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  // dev: Next/Turbopack HMR 'unsafe-eval' ister; prod: yalnız inline.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'" + (isDev ? " ws: wss:" : ""),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: import.meta.dirname,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
