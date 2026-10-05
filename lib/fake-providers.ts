// lib/fake-providers.ts — Sahte sağlayıcı güvenlik kapısı.
//
// Sahte e-Arşiv/ÖKC/abonelik sağlayıcıları gerçek mali belge veya gerçek ödeme
// üretmez. Bu yüzden production'da fail-closed olurlar. Tek istisna: yerel
// production E2E'si (`next start` NODE_ENV=production çalışır) sahte sağlayıcıyla
// akışı sınar. Bunun için AÇIK bir kaçış kapısı vardır ve bu kapı yalnız test
// ortamı içindir: production'da `launch-check` bunu yasaklar, dolayısıyla canlı
// yayında asla açık kalmaz.
export function fakeProvidersBlocked(): boolean {
  const production = process.env.NODE_ENV === "production" || process.env.LAUNCH_ENV === "production";
  return production && process.env.ALLOW_FAKE_PROVIDERS !== "1";
}
