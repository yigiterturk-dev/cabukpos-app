# ÇabukPOS operasyon notları

Bu belge canlı çalıştırma sınırlarını ve geri dönüş adımlarını tek yerde tutar.
Piyasaya çıkıştaki tüm teknik/işletme onay kutuları için ayrıca `docs/LAUNCH-CHECKLIST.md` kullanılır.

## Dağıtım öncesi kapı

1. `npm ci`
2. `npm test`
3. `npm run qa:static`
4. `npm run build`
5. `BASE=<staging-or-local-url> npm run audit:runtime`
6. Şema değiştiyse önce staging/test veritabanında `npm run db:push` ve
   `npm run db:rls` çalıştırın; ardından RLS kontrolünü yapın.
7. Canlıda `DATABASE_URL` uygulama rolü, `MIGRATE_DATABASE_URL` ise yalnız
   migration sahibi rolü olmalıdır. Uygulama rolü `BYPASSRLS` olmamalıdır.

Growth şeması değiştiyse migration sahibi bağlantısıyla db:growth:verify
çalıştırılmalı; recipient_ref kolonu, iki growth tablosunun FORCE RLS/policy
durumu ve cabukpos_app BYPASSRLS durumu birlikte doğrulanmalıdır.

Billing/report cronlarının canlı şema kapısı için migration sahibi bağlantısıyla
`MIGRATE_DATABASE_URL=<owner-url> npm run db:verify:billing-report` çalıştırın.
Bu komut yalnızca okur; `billing_invoices`, `billing_invoice_counters`,
`report_settings` ve `report_due_tenants(text,timestamptz)` nesnelerini doğrular.

## Yedekleme

- `MIGRATE_DATABASE_URL` ile `npm run db:backup` çalıştırın. Komut custom-format
  dump üretir ve varsayılan olarak `backups/` altında tarihli dosya bırakır.
- Güvenli bir dış dizin için `npm run db:backup -- --output=/secure/cabukpos` kullanın;
  dump dosyasını repoya veya uygulama storage'ına koymayın.
- Yedeği canlıya geri yüklemeden doğrulamak için `pg_restore --list <dosya>`;
  gerçek restore provası için `REHEARSAL_DATABASE_URL=<izole staging DB> npm run db:restore:rehearsal -- --file=<dump>`
  (PostgreSQL sunucusu 18 ise `pg_dump`/`pg_restore` de 18 olmalı — `PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH`.
  Yedek `--no-privileges`, restore `--no-acl` kullanır: Neon'a özel ACL/ownership ifadeleri taşınamaz, `db:rls` zaten kurar.)
  komutu dump'ı izole veritabanına yükler, canlı URL ile aynı olduğunu reddeder,
  `pg_restore --exit-on-error` ile kısmi restore'u başarısız sayar ve tenants +
  billing/report şema duman testini çalıştırır.
- Komut yedeği üretir, zamanlamayı `.github/workflows/backup.yml` üstlenir: her gün
  03:15 UTC'de dump alır, katalog provası yapar, ardından AES-256-CBC + PBKDF2 ile
  şifreleyip yalnız `.dump.enc` artifact'ını 30 gün saklar. Repository secret'ları
  `BACKUP_DATABASE_URL` (okuma yetkili Neon bağlantısı) ve güçlü rastgele
  `BACKUP_ENCRYPTION_KEY` olmalıdır; ham dump artifact'a yüklenmez. Restore için
  artifact'ı güvenli runner'da `openssl enc -d -aes-256-cbc -pbkdf2 -iter 310000`
  ile açıp `npm run db:backup:verify -- --file=<dump>` ve gerçek restore provasını
  çalıştırın. Restore workflow'u ayrıca production build'i izole DB ile başlatıp
  `/api/ready` kontrolünü geçmeden başarılı olmaz. İlk koşuda Actions logundan
  "Yedek hazır" ve readiness başarı satırları doğrulanır.

## Uygulama cron'ları

- Canlı zamanlama netcup'taki `/opt/cron-tetik/tetik.py` üzerinden dakikada bir
  yapılır (GitHub Actions kotası 2026-10-14'te doldu). `.github/workflows/cron.yml`
  yalnız elle çalıştırma içindir ve aynı endpoint'leri çağırır.
- Çağrılan endpoint'ler: `/api/cron/agent-heartbeat`, `/api/cron/uptime`,
  `/api/cron/platform`, `/api/cron/fiscal`, `/api/cron/billing`, `/api/cron/report`,
  `/api/cron/courier`, `/api/cron/courier-status` ve `/api/cron/trendyol-yemek`.
  Kurye tekrarı saatlik, kurye durumu 5 dakikada bir, Trendyol Yemek polling
  2 dakikada bir çalışır.
- Yeni endpoint'ler uygulama canlıya alındıktan sonra tetik listesine eklenir;
  erken eklenirse 404 döner. YNR veya Trendyol Yemek yapılandırılmamışsa uçlar
  ağa çıkmadan boş sonuç döner.
- Repository secret'ları `APP_URL` ve `CRON_SECRET` tanımlı olmadan workflow
  bilerek başarısız olur. İlk açılışta her zamanlama en az bir kez çalıştırılmalı;
  Actions logundaki HTTP yanıtı ve uygulama audit/alert kaydı saklanmalıdır.
- Vercel Pro planı alınırsa zamanlamalar tekrar Vercel Cron'a taşınabilir; iki
  scheduler'ı aynı anda açmayın, yoksa işler çift çalışır.

Alarm bildirimi için production'da `AGENT_ALERT_WEBHOOK_URL` webhook'unu veya
`ALERT_EMAIL` + `RESEND_API_KEY` + `MAIL_FROM` e-posta üçlüsünü yapılandırın.
Webhook tanımlıysa önce webhook denenir; başarısız olursa Resend yedeğine geçer.
`npm run launch:check`, bu iki kanaldan en az birinin ayarlandığını doğrular.

## Canlı kontrol

- Deploy sonrası anonim ve korumalı kritik uçları tek komutla kontrol etmek için
  `npm run audit:runtime` çalıştırın. Başka bir ortamı kontrol etmek için
  `BASE=https://staging.example.com npm run audit:runtime` kullanabilirsiniz.
- Growth anahtarı hazırsa yalnız okuma sözleşmesini de doğrulamak için komuta
  `RUNTIME_GROWTH_KEY=<growth-key>` ekleyin; feature-pack, insights ve kampanya
  listesi 200/schema/PII kontrollerinden geçer. Anahtar değeri çıktıya yazılmaz.
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
