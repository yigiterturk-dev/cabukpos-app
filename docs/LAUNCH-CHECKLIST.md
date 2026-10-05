# ÇabukPOS piyasaya çıkış kapısı

Bu liste, uygulamanın teknik olarak hazır olmasını gerçek mağaza açılışından ayırır.
Her kutu kanıtla kapatılmadan genel satışa geçilmez.

## Go / no-go

### Teknik kapı — mevcut durum

- [x] `npm ci` temiz kurulum: 0 vulnerability
- [x] `npm test`: 344/344
- [x] `npm run qa:static`: lint + typecheck
- [x] `npm run build`: Webpack production build
- [x] Production `/api/health` ve `/api/ready`: `https://cabukpos-app.vercel.app` üzerinde health `ok:true`, ready `database:ok`
- [x] Mevcut release değişiklikleri deploy edildi; aynı production alias'ta health/ready ve `BASE=https://cabukpos-app.vercel.app npm run audit:runtime` geçti (16/16)
- [x] Cron scheduler: GitHub Actions `APP_URL` + `CRON_SECRET` tanımlı; beş zamanlama da (uptime, agent-heartbeat, fiscal, billing, report) success. Production'da eksik olan 19 tablo + `report_due_tenants` fonksiyonu owner bağlantısıyla eklendi (58 tablo, 47 RLS); `billing`/`report` 08:14'te failure → 08:37'de success.
- [x] Growth feature-pack, insights ve event intake tenant/scope sınırları
- [x] Production kritik anonim/korumalı uçlar: runtime audit 16/16 kontrol tanımı
- [x] Neon migration ve FORCE RLS doğrulaması
- [x] Kaynak RLS coverage gate ve `audit_log` append-only yetki testi
- [x] M8, M9a, iade tutanağı, M9b ve M9c kritik E2E akışları
- [x] Pilot E2E komutu CI kapısına bağlı: market (`m3`), restoran salonu (`m5`) ve LAN/offline merkez (`lan`); son 5 CI koşusu (2026-10-05 09:06–09:12) **success**
- [x] İlk Nocturn Audit 27 bulgu: açık kayıt 0; kalan 9 desen belgelenmiş
- [~] `npm run launch:check` ile sırları göstermeden production ayar kontrolü; canlı alias'ta fiyatlar ve satıcı bilgileri hâlâ placeholder olduğu için production env kanıtı bekleniyor

### Canlı işletme kapısı — açılıştan önce zorunlu

- [~] `AGENT_ALERT_WEBHOOK_URL` alarm hattı — ✅ mekanizma uçtan uca kanıtlandı: sessiz ajan kaydı → `GET /api/cron/agent-heartbeat` (yetkisiz 401 / yetkili `{alerted:1}`) → webhook'a `{service,event:agent.heartbeat.stale,detail}` düştü; `tests/alerts.test.ts` (no-op/iletim/hata yutma). ⏳ kalan (insan): production'a gerçek alarm kanalı URL'i (Slack/Discord/ops) tanımla
- [~] Günlük backup scheduler — ✅ mekanizma kanıtlandı: owner yedeği + `openssl enc -aes-256-cbc -pbkdf2` şifrele/çöz → dump katalog doğrulaması OK; workflow PG18 client kurar (Neon PG18), artifact 30 gün. ⏳ kalan (insan): GitHub secret `BACKUP_DATABASE_URL` + `BACKUP_ENCRYPTION_KEY` tanımla
- [x] İzole staging veritabanına gerçek restore yapıldı — ✅ owner yedeği (`pg_dump --no-owner --no-privileges`, PG18) → yeni Neon branch'e `pg_restore --no-acl --exit-on-error`; STAGE=PROD (58 tablo, 47 RLS, 22 işletme, 30 satış, `report_due_tenants`). `scripts/backup-db.mjs`/`rehearse-restore.mjs` taşınabilirlik için güncellendi.
- [~] Growth recipient_ref/approval şeması production'a uygulandı — ✅ owner ile `db:growth:verify` **9/9 OK** (kolonlar + RLS/FORCE + `tenant_isolation` + BYPASSRLS kapalı); ⏳ kalan: owner approval 403/200 akışı ve signed webhook'un staging'de canlı provası
- [x] Growth scope'lu key ile `RUNTIME_GROWTH_KEY=... BASE=<production> npm run audit:runtime` authenticated contract — ✅ **geçti**: feature-pack + insights + campaign listesi 200; audit anahtarı üretilip iptal edildi (`integration_keys` revoked). Tam runtime audit 16+3 PASS.
- [ ] `BILLING_PROVIDER=paytr` için canlı PayTR anahtarları ve bildirim URL'si doğrulandı
- [ ] Gerçek e-Arşiv entegratörü seçildi; sandbox kesim, iptal ve e-posta testleri tamamlandı
- [ ] Bilgi fişi ile mali belge ayrımı mali müşavir tarafından onaylandı (`docs/MALI-UYUM-GATE.md`)
- [ ] ÖKC kullanım/entegrasyon sorumluluğu işletme bazında yazılı olarak netleştirildi
- [ ] `cabukpos.com` DNS, SSL, e-posta ve yasal iletişim adresleri doğrulandı
- [ ] KVKK, kullanım şartları, mesafeli satış ve iade metinleri onaylandı

### Mağaza pilot kapısı — ilk müşteriyle

- [ ] Windows cihazda agent kurulumu ve otomatik başlatma (indirme betiği hazır: `public/indir/cabukpos-agent-install.ps1`; gerçek Windows kanıtı bekliyor)
- [ ] Termal yazıcıdan bilgi fişi ve iade tutanağı çıktısı
- [ ] Barkod okuyucu, para çekmecesi ve terazi
- [ ] İnternet kesintisi → satış → bağlantı dönüşü → eşitleme
- [ ] Aynı mağazada ikinci kasa/garson cihazı ve LAN merkez akışı
- [ ] Gün sonu, vardiya farkı, rapor ve veri export
- [ ] İlk müşteride en az 3 iş günü hata/alert takibi

Pilot uygulama adımları ve imza alanları: `docs/PILOT-REHEARSAL.md`.

`LAUNCH_ENV=production npm run launch:check` eksik ayarları kontrol eder; değerleri
ekrana basmaz ve `AUTH_SECRET`/`CRON_SECRET` için en az 32 karakter şartını uygular.
Deployment rotalarını da doğrulamak için `APP_URL` tanımlı olarak
`LAUNCH_RUNTIME_CHECK=1` eklenir; bu varyant health/ready ve korumalı Growth
rotalarının 404 yerine beklenen auth yanıtını verdiğini test eder. `RUNTIME_GROWTH_KEY`
verilirse üç authenticated Growth contract kontrolü de eklenir.

## Yayına alma sırası

1. Staging restore ve donanım provası.
2. PayTR/e-Arşiv sandbox doğrulaması.
3. Tek pilot işletme ile sınırlı açılış.
4. Pilot sonunda backup, audit log, bekleyen offline kuyruk ve ödeme mutabakatı kontrolü.
5. Kritik hata yoksa satışa açılış; ilk hafta günlük operasyon gözden geçirmesi.

## Go kararı için saklanacak kanıt

- deployment URL'si ve Ready kaydı
- `npm run audit:runtime` çıktısı
- backup dosyası, restore sonucu ve tarih
- PayTR/e-Arşiv test numaraları
- donanım test formu ve pilot işletme kabulü
- mali müşavir/hukuk onayı

Production sırları repoya veya bu belgeye yazılmaz; yalnız Vercel/Neon ve güvenli
operasyon kasasında tutulur.
