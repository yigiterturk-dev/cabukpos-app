// lib/core/i18n.ts — #45 i18n altyapısı (saf, DB yok). TR kaynak dil; eksik EN → TR düşer.
// Pilot: ortak eylemler + Tercihler sayfası. Yeni anahtar eklerken tr yazısını anahtar yapmayın — kısa anahtar kullanın.
export const LANGS = ["tr", "en"] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = "tr";
export const LANG_COOKIE = "cz_dil";

export const isLang = (s: string | undefined | null): s is Lang => !!s && (LANGS as readonly string[]).includes(s);

type Entry = { tr: string; en: string };

/** Sözlük: anahtar kısa ve kararlı; {x} yer tutucular tf()'de değişir. */
export const dict = {
  // ortak eylemler
  kaydet: { tr: "Kaydet", en: "Save" },
  kaydediliyor: { tr: "Kaydediliyor…", en: "Saving…" },
  kaydedildi: { tr: "Kaydedildi.", en: "Saved." },
  iptal: { tr: "İptal", en: "Cancel" },
  sil: { tr: "Sil", en: "Delete" },
  duzenle: { tr: "Düzenle", en: "Edit" },
  ekle: { tr: "Ekle", en: "Add" },
  kapat: { tr: "Kapat", en: "Close" },
  ara: { tr: "Ara", en: "Search" },
  goster: { tr: "Göster", en: "Show" },
  indir: { tr: "İndir", en: "Download" },
  yazdirPdf: { tr: "Yazdır / PDF", en: "Print / PDF" },
  // gezinme
  raporlar: { tr: "Raporlar", en: "Reports" },
  tercihler: { tr: "Tercihler", en: "Preferences" },
  bildirimler: { tr: "Bildirimler", en: "Notifications" },
  cikis: { tr: "Çıkış", en: "Sign out" },
  sube: { tr: "Şube", en: "Store" },
  gunluk: { tr: "Günlük", en: "Daily" },
  haftalik: { tr: "Haftalık", en: "Weekly" },
  baslangic: { tr: "Başlangıç", en: "Start" },
  bitis: { tr: "Bitiş", en: "End" },
  toplam: { tr: "Toplam", en: "Total" },
  tarih: { tr: "Tarih", en: "Date" },
  // Tercihler sayfası (pilot)
  tercihDesc: { tr: "Görünüm ve uyarı ayarları bu cihazda saklanır; cihaz başına ayrı geçerlidir.", en: "Display and alert settings are stored on this device; they apply per device." },
  dil: { tr: "Dil", en: "Language" },
  dilHint: { tr: "Panelin dili. Yalnız sizin oturumunuzu etkiler; fişler ve raporlar Türkçe kalır.", en: "Panel language. Affects only your session; receipts and reports stay in Turkish." },
  tema: { tr: "Tema", en: "Theme" },
  temaHint: { tr: "Sistem seçiliyken işletim sisteminin koyu moduna uyar. Yazdırma her zaman açık kâğıtta yapılır.", en: "\"System\" follows your operating system's dark mode. Printing always uses light paper." },
  kasaSesi: { tr: "Kasa uyarı sesi", en: "Register alert sound" },
  kasaSesiHint: { tr: "Kapalıyken yeni platform siparişi ve hazırlık uyarıları sessiz gelir; ekrandaki rozetler aynen çalışır.", en: "When off, new platform orders and prep alerts arrive silently; on-screen badges still work." },
  uygulamaKur: { tr: "Uygulama olarak kur", en: "Install as app" },
  uygulamaKurHint: { tr: "Düğme yalnız tarayıcının kurma izni verdiği durumda görünür. iPhone/iPad: Safari'de Paylaş → Ana Ekrana Ekle.", en: "The button appears only when the browser allows installation. iPhone/iPad: Share → Add to Home Screen in Safari." },
  sistem: { tr: "Sistem", en: "System" },
  acik: { tr: "Açık", en: "Light" },
  koyu: { tr: "Koyu", en: "Dark" },
  kritikStok: { tr: "Kritik stok ({n})", en: "Critical stock ({n})" },
} as const satisfies Record<string, Entry>;

export type DictKey = keyof typeof dict;

/** Çekirdek çeviri. Eksik EN → TR (satisfies sayesinde derleyici iki dili de zorlar). */
export function t(lang: Lang, key: DictKey, vars?: Record<string, string | number>): string {
  const e: Entry = dict[key];
  let s: string = e ? (lang === "en" ? e.en : e.tr) : key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Bileşen kısayolu: const tt = tf(lang); tt("kaydet") */
export const tf = (lang: Lang) => (key: DictKey, vars?: Record<string, string | number>) => t(lang, key, vars);
