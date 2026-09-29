# ÇabukPOS operasyon notları

Bu belge canlı çalıştırma sınırlarını ve geri dönüş adımlarını tek yerde tutar.

## Dağıtım öncesi kapı

1. `npm ci`
2. `npm test`
3. `npm run lint`
4. `npx tsc --noEmit`
5. `npm run build`
6. Şema değiştiyse önce staging/test veritabanında `npm run db:push` ve
   `npm run db:rls` çalıştırın; ardından RLS kontrolünü yapın.
7. Canlıda `DATABASE_URL` uygulama rolü, `MIGRATE_DATABASE_URL` ise yalnız
   migration sahibi rolü olmalıdır. Uygulama rolü `BYPASSRLS` olmamalıdır.

## Canlı kontrol

- Vercel deployment'ın Ready durumunu ve build logunu doğrulayın.
- Liveness için `/api/health`, veritabanı dahil trafik hazırlığı için `/api/ready`
  uçlarının sırasıyla `200` ve `200` dönmesini kontrol edin. `/api/ready` `503`
  dönerse deployment'ı trafiğe almadan önce veritabanı bağlantısını inceleyin.
- `/giris`, `/kayit` ve `/f/<token>` akışlarını anonim olarak kontrol edin.
- Yönetim ve kasa girişinden sonra küçük bir test satışı açıp eşitleme, fiş ve
  gün sonu akışını doğrulayın.
- Cron uçlarına yalnız `CRON_SECRET` ile erişilebildiğini kontrol edin.
- Şema değişikliğinden sonra yeni tabloların `relrowsecurity = true` olduğunu
  ve `cabukpos_app` rolünün `rolbypassrls = false` olduğunu doğrulayın.

## Geri dönüş

Kod dağıtımında sorun varsa Vercel'de son sağlıklı deployment'ı promote edin;
veritabanı migration'ını otomatik olarak geri çevirmeyin. Önce yeni kodun eski
şemayla birlikte çalışıp çalışmadığını doğrulayın. Geri dönüş mümkün değilse
uygulamayı read-only duruma almak yerine kasa cihazlarının çevrimdışı kuyruğunu
koruyun ve satış verisini silmeyin.

Şema değişiklikleri için geri dönüş planı migration ile birlikte yazılmalı:
geri alınabilir değişiklikler iki aşamalı (önce uyumlu kolon/tablo, sonra kod)
uygulanmalı; veri silen işlemler için sahip onayı ve yedek kanıtı olmadan canlı
çalıştırılmamalıdır.

## Olay sonrası

Tenant, deployment, zaman aralığı ve etkilenen cihazları kaydedin. `audit_log`,
Vercel logları, Neon sorgu logları ve cihazın bekleyen eşitleme kuyruğunu
koruyun. Sır sızıntısı şüphesinde sırrı döndürün; müşteri verisini loglara
taşımayın.
