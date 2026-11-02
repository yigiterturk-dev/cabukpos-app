# Netcup canlı deploy — 2 Kasım 2026

Sonuç: **PASS**. Uygulama `ed89dbb` ile yayında; şema/RLS `b1f8c38` paketiyle
uygulandı. Canlı veri sayıları ve mali toplamlar korundu.

## Ön durum

- Canlı konteyner, 1 Kasım'da `apps-db` (Postgres 18, `127.0.0.1:5437`) üzerinde
  `apps` kullanıcısıyla çalışıyordu; bu rol superuser/BYPASSRLS olduğu için
  uygulama RLS'yi atlıyordu.
- Asıl hedef olan host Postgres 17 (`127.0.0.1:5432/cabukpos`) hazırdı; veri
  `apps-db` ile birebir aynıydı (sales 30, payments 31, tab_events 5, audit 177).
- Yedek servisi 1 Kasım'dan beri başarısızdı: `/etc/cabukpos-ops/config.json`
  hâlâ kapanmış Neon adresini gösteriyordu (`pipeline exit codes: 1,0`).
- `ops/netcup` araçları Neon varsayımları taşıyordu: `verify-full` TLS, sahip
  olarak `neondb_owner`, PG18 şartı ve loopback DB'ye köprü ağı yoktu.

## Yapılan güvenli düzeltmeler

- Yedek/apply ayarı host DB'ye çevrildi: `cabukpos` sahibi, `sslmode=disable`.
  Eski ayar `/root/cabukpos-ops-config-20261102.json` (0600) altında.
- `cabukpos` rolüne `BYPASSRLS` verildi. Gerekçe: FORCE RLS'li tablolarda
  `pg_dump` ve release sayım kontrolü sahip rolüyle çalışmıyordu. Uygulama rolü
  `cabukpos_app` **NOBYPASSRLS** kaldı; RLS doğrulaması bunu ayrıca sınıyor.
  Sahip rolü zaten tablo sahibi/DDL yetkili olduğundan ek yetki yüzeyi yok.
- `maintenance.py` / `apply_release.py`: URL'deki `sslmode` onurlandırılıyor,
  loopback hedefte `--network=host`, PG16+ kabulü, rehearsal rol yer
  tutucularına `cabukpos`/`apps` eklendi. Hata tanılaması konteyner stderr'ini
  ve çıkış kodunu içeriyor.
- Release snapshot'ı `node@sha256:3ed984…` (Node 22 glibc) imajında kuruldu;
  Alpine/musl kurulumu SWC binary'sini bulamıyordu.

## Prova ve canlı geçiş

- Taze şifreli yedek: `cabukpos-20261102T172311Z-f4107c.dump.enc`.
- `maintenance.py release --release-dir .` **PASS**: restore, 11 migration + RLS
  iki kez, hata enjeksiyonu geri alma, FORCE RLS/kiracı görünürlüğü, uygulama
  readiness + runtime audit, iş akışı smoke ve fixture temizliği.
- `apply_release.py --apply` **PASS**:
  `migration_rls_sha256=cd4e57bbe15252940ee4c74bf7b1583a890afd05935a44d7dc6238e63a6e660e`,
  kanıt `/var/lib/cabukpos-ops/production-release.json`. Ön kontrolde PG 17.0.11,
  sahip `cabukpos`, uzun işlem 0, uygulama rolü güvenli.
- Uygulama `ed89dbb` (rehearsal paketi `b1f8c38` + `main`'in yalnız
  Dockerfile/compose/CI dosyaları) ile `/opt/cabukpos` üzerinden
  `docker compose -f ops/netcup/app/docker-compose.yml up -d --build` ile
  yeniden başlatıldı. Konteyner artık host DB'ye `cabukpos_app` olarak bağlanıyor.
- Eski imaj geri dönüş için `cabukpos:pre-b1f8c38` etiketiyle duruyor.

## Doğrulama

- `/api/ready` 200 (`database:ok`); `https://cabukpos.com`, `/giris`, `www` 200.
- Yeni tablolar: `procurement_receipts`, `courier_jobs`, `staff_plans`,
  `stock_lots`. **64 tabloda FORCE RLS**.
- Uygulama rolüyle kiracı bağlamı yokken `sales` = 0; rehearsal'da kendi
  kiracısında beklenen sayılar doğrulandı.
- Cron: `/opt/cron-tetik/tetik.py` içine `courier` (saatlik), `courier-status`
  (5 dk), `trendyol-yemek` (2 dk) eklendi; üçü de elle 200 döndü. Uygulama
  canlıya alınmadan önce eklenmedi.
- Yedek timer'ı aynı gün elle çalıştırıldı ve başarılı kayıt üretti.

## Sınırlar ve geri dönüş

- YNR ve Trendyol Yemek anahtarları canlıda tanımlı değil; entegrasyonlar kapalı
  ve ağa çıkmıyor. Gerçek sağlayıcı sandbox doğrulaması hâlâ yapılmadı.
- Migration'lar eklemeli; eski uygulamaya yazımlı dönüş yeni tabloları silmez.
  Sorun olursa `cabukpos:pre-b1f8c38` imajı mevcut `.env` ile çalıştırılabilir;
  `apps-db` verisi silinmedi.
- Yedek/restore şifreleme anahtarı ve operatör kopyası değişmedi.
