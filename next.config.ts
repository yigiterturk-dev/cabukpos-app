import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    const security = [
      { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.paytr.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' https: http://127.0.0.1:* http://localhost:*; frame-src https://www.paytr.com https://www.openstreetmap.org; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self' https://www.paytr.com; frame-ancestors 'none'" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
    ];
    return [
      { source: "/(.*)", headers: security },
      // Kasa service worker'ı her açılışta tazelenmeli (önbellekte eski SW kalmasın).
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }, ...security] },
    ];
  },
};

export default nextConfig;
