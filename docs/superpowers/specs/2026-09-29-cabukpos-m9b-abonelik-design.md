# ÇabukPOS M9b — Abonelik (tasarım)

Tarih: 2026-09-29 · Durum: ONAYLANDI · Üst: `2026-09-28-cabukpos-pos-design.md` §M9 · Önceki: M9a raporlar

## Kararlar
- **Paket/fiyat sonra**: tek paket, dönem aylık/yıllık. Fiyatlar env'den (`PLAN_PRICE_AYLIK`, `PLAN_PRICE_YILLIK`, kuruş, KDV dahil). Boşsa o dönem satın alınamaz ("Online ödeme yakında", `SALES_CONTACT` varsa gösterilir). Modül kilidi yok.
- **Deneme**: yeni işletme 14 gün. Mevcut işletmeler yayın anından 14 gün (sütun varsayılanı).
- **Durum tarihten türer** (cron yok): bitiş = max(deneme sonu, ödenen dönem sonu). `deneme` / `aktif` (ödenmiş dönem sürüyor) → bitişten sonra 7 gün `ek_sure` → sonra `kilitli`.
- **Uyarı**: bitişe ≤7 gün kala ve ek sürede yönetimde bant; kasada vardiya açma ekranında not.
- **Kilit**: yalnız yönetim yazması. Tüm yönetim server action'ları `requireWriter()` → kilitliyse `/yonetim/abonelik?kilit=1`. Okuma (raporlar dahil) açık. **Kasa asla kilitlenmez** (eşitleme, satış, vardiya sürer).
- **Ödeme**: `BillingProvider` arayüzü (`start` → yönlendirme URL'si). v1 yalnız `fake` (test ödeme sayfası: Başarılı/Başarısız). `BILLING_PROVIDER` boşsa ödeme kapalı — canlıda sahte sağlayıcı ücretsiz uzatma olurdu. Gerçek sağlayıcı (PayTR/iyzico) = yeni dosya + webhook route, `completePayment`'ı çağırır.
- **Uzatma**: dönem başlangıcı = max(şimdi, mevcut bitiş) → kalan deneme/dönem korunur, ek süre günleri sayılmaz. Aylık = +1 ay, yıllık = +1 yıl (UTC takvim).
- **Otomatik yenileme yok**: her dönem elle. Günlük cron (`/api/cron/billing`) bitişe 1-7 gün kala sahiplere tek hatırlatma e-postası (aynı bitişe bir kez; Resend yoksa atlanır).

## Veri
- `tenants` (+RLS'siz kimlik tablosu): `trial_ends_at` (not null, varsayılan `now() + 14 gün`), `paid_until`, `billing_reminded_end`.
- `billing_payments` (RLS yok; yalnız `lib/billing` erişir — sağlayıcı geri bildirimi kiracı bağlamsız gelir): id, tenant_id, provider, period, amount, status (`bekliyor`/`odendi`/`basarisiz`), provider_ref, period_end, created_at, paid_at.
- `completePayment(id, ok, ref)`: satır kilidiyle idempotent; yalnız `bekliyor` işlenir.

## Birimler
- `lib/core/billing.ts` saf: `billingInfo`, `extendFrom`, `reminderDue`, `bannerText`.
- `lib/billing/plans.ts` (env fiyat), `provider.ts` (arayüz + fake), `service.ts` (DB), `actions.ts` (server action).
- `lib/mail.ts` genel Resend yardımcısı.
- Ekran: `/yonetim/abonelik`, `/yonetim/abonelik/test-odeme/[id]`, layout bandı, Nav "Abonelik", kasa notu (katalog cevabında `device.billing`).

## Test
Birim (durumlar, uzatma, hatırlatma), DB (deneme varsayılanı, başarısız/başarılı/eşzamanlı ödeme), E2E `e2e/m9b.mjs` (deneme → kilit → ürün kaydı engellenir → başarısız ödeme → yıllık ödeme → aktif → ürün kaydı açılır; ödeme kapalıysa ödeme adımları atlanır). Regresyon M1, M9a.

## Kapsam dışı
Kendi e-Arşiv faturamız, süper yönetici paneli, kupon, kayıtlı kartla otomatik çekim, paket kademeleri.
