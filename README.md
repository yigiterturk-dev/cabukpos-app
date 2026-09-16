# Yanında POS — İşletme Yönetimi

Randevu, müşteri (CRM), personel/prim ve tahsilat yönetimi. 8 sektör:
berber, güzellik, oto yıkama, veteriner, diyetisyen, psikolog, doktor, diş hekimi.

- **Uygulama:** https://app.yanindapos.com
- **Satış sayfası:** https://yanindapos.com (repo: `yigiterturk-dev/yanindapos-landing`)
- **Vercel projesi:** `isletme-suite` (bölge `lhr1`)

## Yığın
Next.js 15 (App Router) · React 19 · TypeScript · Tailwind 3 ·
Neon Postgres (`eu-west-2`) + Drizzle · e-posta/şifre auth (bcrypt + jose)

## Geliştirme
```bash
npm install
vercel env pull .env.local --environment=development   # DATABASE_URL + AUTH_SECRET
npm run dev        # http://localhost:3600
npm test           # node:test — ödeme imza doğrulaması ve plan mantığı
npx tsc --noEmit   # tip kontrolü
npm run build
```

> ⛔ **`npm run db:push` ÇALIŞTIRMA!** Canlı veritabanı, `db/schema.ts`'in ötesinde elle
> uygulanan güvenlik katmanları taşır (RLS politikaları, tenant rolü, cron fonksiyonu).
> drizzle-kit push bunları "drift" sanıp **KAPATIR/SILIR** (2026-09-16'da denendi; RLS
> 12 tabloda kapatıldı, `db/rls.sql` ile geri geldi). Şema değişikliği için:
> `db/schema.ts` + eşleşen `db/*.sql` dosyasına idempotent `ALTER/CREATE IF NOT EXISTS`
> ekle ve psql ile uygula (örnek: `db/pos.sql`).

## Ortam değişkenleri
| Değişken | Zorunlu | Açıklama |
|---|---|---|
| `DATABASE_URL` | ✅ | Neon bağlantı dizesi (pooler). Yoksa uygulama açılmaz. |
| `AUTH_SECRET` | ✅ | JWT imza anahtarı, **en az 32 karakter**. Kısaysa oturum sessizce geçersiz sayılır. |
| `PAYMENT_PROVIDER` | — | `none` (varsayılan) veya `stripe`. |
| `STRIPE_SECRET_KEY` | `stripe` ise | `sk_live_…` / `sk_test_…` |
| `STRIPE_WEBHOOK_SECRET` | `stripe` ise | `whsec_…` — webhook imza doğrulaması. |
| `NEXT_PUBLIC_APP_URL` | — | Ödeme dönüş URL'leri için mutlak kök; boşsa istek başlığından türetilir. |
| `MESSAGE_PROVIDER` | — | `none` (varsayılan) veya `twilio`. |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | `twilio` ise | Twilio kimlik bilgileri. |
| `TWILIO_SMS_FROM` / `TWILIO_WHATSAPP_FROM` | en az biri | Gönderici numara(lar). |
| `CRON_SECRET` | hatırlatma için | `/api/cron/reminders` yetkilendirmesi. Yoksa uç nokta 404. |

> Production'da `DATABASE_URL` ve `AUTH_SECRET` **sensitive** işaretli;
> `vercel env pull --environment=production` bunları **boş** döndürür. Yerel geliştirme
> için `development` ortamını çekin.

## Veritabanı
Şema `db/schema.ts` (10 tablo). Neon'a elle uygulanan SQL dosyaları:

| Dosya | Ne yapar |
|---|---|
| `db/auth.sql` | `auth_create_business_and_owner`, `auth_get_user_by_email` (SECURITY DEFINER) |
| `db/rls.sql` | Tüm tenant tablolarında RLS politikaları |
| `db/tenant-role.sql` | `app_tenant` (NOBYPASSRLS) rolü |
| `db/public-booking.sql` | Oturumsuz rezervasyon için dar SECURITY DEFINER yüzeyi |
| `db/rate-limit.sql` | `rate_limits` + `rl_hit`/`rl_reset`/`rl_gc` |
| `db/reminder-dispatch.sql` | `reminder_logs.appointment_id` + tekil indeks, `reminders_due()` |

Uygulama (neon-http tek istekte çoklu komut kabul etmez, bu yüzden yardımcı script):
```bash
node scripts/apply-sql.cjs db/rate-limit.sql
node scripts/apply-sql.cjs db/reminder-dispatch.sql
```
Uygulandı mı kontrolü: `curl https://app.yanindapos.com/api/health`

### Çok kiracılılık (kritik)
Neon bağlantı rolü `neondb_owner` **BYPASSRLS taşır** — RLS'i atlar. Bu yüzden her tenant
sorgusu `withTenant()` içinden geçer: tek transaction'da önce `SET LOCAL ROLE app_tenant`
(NOBYPASSRLS), sonra `SET LOCAL app.business_id`, sonra asıl sorgular. Rol geçişi başarısız
olursa **fail-closed** davranır. `db/tenant.ts` başındaki açıklamayı okumadan bu katmana dokunmayın.

Uygulama sorgularına ayrıca `eq(table.businessId, businessId)` filtresi de eklenir (RLS backstop).

## Ödeme
Yükseltme **yalnız** şu zincirle olur:
`startCheckoutAction` → sağlayıcı ödeme sayfası → `POST /api/payments/webhook` (imza doğrulanır).

- Fatura `odendi` durumu **sadece** doğrulanmış webhook'tan yazılır.
- Düşürme ve aynı plan ücretsiz yoldan geçer.
- `PAYMENT_PROVIDER` kurulu değilse yükseltme yapılmaz; ürün çalışmaya devam eder.
- Yeni sağlayıcı eklemek: `lib/payments/types.ts` içindeki `PaymentProvider` arayüzünü
  uygulayın, `lib/payments/index.ts` içinde env'e bağlayın. Başka yeri değiştirmeyin.

## Otomatik hatırlatma
Randevudan N saat önce WhatsApp/SMS gönderir. Zincir:

`zamanlayıcı → POST /api/cron/reminders` (Bearer `CRON_SECRET`) → `reminders_due()` →
sağlayıcı → `reminder_logs`

- **Çift mesaj imkânsız:** `reminder_logs (business_id, appointment_id)` UNIQUE.
  Önce log yazılır, sonra gönderilir; ikinci çalıştırmanın insert'i patlar ve gönderim denenmez.
- Gönderim başarısız + **tekrar denenebilir** (5xx/429/ağ) → kilit bırakılır, sonraki tur dener.
  Kalıcı hata (4xx) → kilit kalır, aynı hata her turda tekrarlanmaz.
- Sağlayıcı yoksa **hiçbir şey "gönderildi" yazılmaz**; UI "yakında" rozeti gösterir.
- İptal/gelmedi randevular ve onay bekleyen online randevular atlanır.

Zamanlayıcı Vercel'de değil dışarıda (Hetzner) olmalı — Hobby planında cron günde bir kez
çalışır, "2 saat önce" hatırlatması için yetmez. Saatlik crontab örneği:
```
0 * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://app.yanindapos.com/api/cron/reminders >/dev/null
```

## Rate limit
Sayaç DB'de (`lib/rate-limit.ts` + `db/rate-limit.sql`) — serverless instance'ları aynı sayacı
görür. Tablo yoksa süreç-içi sayaca düşer ve bir kez uyarı loglar.

| Yol | Limit |
|---|---|
| Giriş | IP başına 10/15dk **ve** hesap başına 5/15dk |
| Kayıt | IP başına 5/saat |
| Public rezervasyon | IP+slug başına 5/saat |
| Checkout | işletme başına 10/saat |

## ⚠️ Kod kaybı notu
Bu repo, 2026-09-03'te **Vercel deployment kaynak arşivinden kurtarıldı** — asıl klasör
silinmişti ve GitHub'a hiç push edilmemişti. Artık `yigiterturk-dev/yanindapos-app`
GitHub'a bağlı ve Vercel git connect ile eşleşmiş durumda. **CLI'dan deploy edilen her
proje GitHub'a da push edilmeli.**
