// Herkese açık rezervasyon linkinin TEK KAYNAĞI.
//
// NEDEN VAR: kod dört ayrı yerde "yanindapos.com/r/<slug>" yazıyordu. Uygulama
// app.yanindapos.com'da; yanindapos.com satış sayfası ve /r rotası YOK → o adres 404.
// Yani işletme sahibine yanlış link gösteriliyor, kampanya mesajı müşteriye ÖLÜ LİNK
// gönderiyordu. Adres artık tek yerden üretilir.

/**
 * Uygulamanın herkese açık kökü (sonda / yok).
 *
 * ⚠️ BURADA `window` OKUMAYIN. Bu fonksiyon render sırasında çağrılıyor; sunucuda
 * bir değer, istemcide başka bir değer dönerse React hidrasyon hatası verir
 * (bir kez böyle yazıldı ve /rezervasyon'da patladı). Değer BELİRLENİMCİ olmalı:
 * env varsa o, yoksa sabit üretim adresi.
 *
 * Çalışma anındaki gerçek origin'e ihtiyaç varsa (dev/preview), bileşen bunu
 * mount sonrası state'e alsın — bkz. app/rezervasyon/page.tsx.
 */
export function appOrigin(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (env) return env.replace(/\/+$/, "");
  return "https://app.yanindapos.com";
}

/** Müşteriye verilecek tam rezervasyon adresi. */
export function bookingUrl(slug: string): string {
  return `${appOrigin()}/r/${slug}`;
}

/** Ekranda gösterim için protokolsüz hali (ör. "app.yanindapos.com/r/nova"). */
export function bookingUrlLabel(slug: string): string {
  return bookingUrl(slug).replace(/^https?:\/\//, "");
}

/** Slug'tan önce gösterilen sabit önek (ör. "app.yanindapos.com/r/"). */
export function bookingUrlPrefix(): string {
  return `${appOrigin().replace(/^https?:\/\//, "")}/r/`;
}
