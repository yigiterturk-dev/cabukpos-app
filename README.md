# ÇabukPOS

Restoran ve market için çok kiracılı satış noktası (POS). Her kiracının verisi Postgres `FORCE ROW LEVEL SECURITY` ile veritabanı seviyesinde ayrılır; uygulama süper kullanıcı değil, RLS'yi atlamayan ayrı bir rolle (`cabukpos_app`) bağlanır.

**Canlı:** https://cabukpos.com

## Ne var

- Kasa/kiosk akışı, ürün ve stok yönetimi, satış ve iade
- Çok kiracılılık: tenant bağlamı zorunlu, RLS ile ikinci savunma hattı
- Abonelik/faturalandırma (PayTR), plan ve birim fiyatlandırma
- E-posta bildirimleri, kimliği doğrulanmış cron işleri
- Idempotent senkronizasyon ve iade koruması, onay jetonu ile kritik işlemler
- Playwright ile kritik akış E2E, birim testleri ve statik QA kapısı

## Yığın

Next.js 16 (App Router) · TypeScript · PostgreSQL · Drizzle ORM · Tailwind CSS · Playwright · GitHub Actions · Docker

## Çalıştırma

```bash
npm ci
createdb cabukpos && createdb cabukpos_test
cp .env.example .env.local   # değerleri doldur
npm run db:push && npm run db:rls
npm run db:push:test && npm run db:rls:test
npm test
npm run dev
```

Şema işleri `MIGRATE_DATABASE_URL` ile yürür. Tasarım notları `docs/superpowers/specs/`, ilerleme `docs/PROGRESS.md` içinde.

Production doğrulama kapısı: `npm test`, `npm run qa:static`, `npm run build`.
Build, CI ve yerel doğrulamada aynı sonucu almak için Webpack ile sabitlenmiştir.
Yerel E2E için build sonrası çalışan sunucuya karşı `BASE=http://localhost:3800 npm run e2e:critical`.
GitHub Actions aynı kapıları temiz bir PostgreSQL 16 üzerinde çalıştırır; operasyon ve rollback notları `docs/OPERATIONS.md`, piyasaya çıkış kapıları `docs/LAUNCH-CHECKLIST.md` içinde.
