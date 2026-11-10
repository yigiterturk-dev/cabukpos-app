# ÇabukPOS piyasaya çıkış kapısı

Bu liste, uygulamanın teknik olarak hazır olmasını gerçek mağaza açılışından ayırır.
Her kutu kanıtla kapatılmadan genel satışa geçilmez.

24 Ekim sürüm adayı: kapsam donduruldu. Güncel teknik teslim, veri geçişi ve
kalan dış bağımlılıklar: [RELEASE-2026-10-24.md](RELEASE-2026-10-24.md).
Bu aday henüz production’a dağıtılmadı; aşağıdaki eski production kanıtları
24 Ekim değişikliklerinin canlı doğrulaması anlamına gelmez.

## Go / no-go

### Teknik kapı — mevcut durum

- [x] Son yerel kalite kapısı (2026-10-24): Node 22.23.4, `npm test` 482/482, lint + typecheck + production build
- [x] Web production dependency audit: `npm audit --omit=dev` 0 vulnerability (2026-10-24; Next 16.4.1 + Zod 4.6.6). Native-only ACME türevi sonrası tam dependency audit de 0; kaynak/lisans ve bundle kapısı RELEASE-2026-10-24.md içinde kayıtlıdır.
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
- [x] Pilot E2E komutu CI kapısına bağlı: market (`m3`), restoran salonu (`m5`) ve LAN/offline merkez (`lan`); 2026-10-18 lokal prova turu: m1 (tam müşteri yolculuğu), m3, m5, lan, m8, m9a, m9b, m9c, iade **success** (E2E seçicileri canlı UI ile hizalandı; m2/m4/m6/m7/m49/m54 ikincil suite hizalaması sürüyor)
- [x] İlk Nocturn Audit 27 bulgu: açık kayıt 0; kalan 9 desen belgelenmiş
- [x] `npm run launch:check` ile sırları göstermeden production ayar kontrolü; plan fiyatları production env'ine işlendi ve canlıya çıktı (2026-10-16 deploy — `/fiyatlandirma` tutarları basıyor, "Fiyat yakında" placeholder'ı gitti); yasal satıcı bilgileri (LEGAL_NAME/ADDRESS/EMAIL/PHONE) hâlâ bekleniyor; tahsilat manuel havale/EFT ile yapılacak (PayTR kapsam dışı)

### Canlı işletme kapısı — açılıştan önce zorunlu

- [~] Alarm hattı — ✅ webhook ve e-posta yedeği kodlandı; ⏳ kalan (insan): production env'de `AGENT_ALERT_WEBHOOK_URL` ya da `ALERT_EMAIL` + `RESEND_API_KEY` + `MAIL_FROM` tanımla. 2026-10-17 Vercel env listesinde iki kanal da yoktu. E-posta gönderen domaininin DNS doğrulaması gerekir.
- [x] Günlük backup scheduler — ✅ mekanizma kanıtlandı: owner yedeği + `openssl enc -aes-256-cbc -pbkdf2` şifrele/çöz → dump katalog doğrulaması OK; workflow PG18 client kurar (Neon PG18), artifact 30 gün. ✅ `BACKUP_ENCRYPTION_KEY` + `BACKUP_DATABASE_URL` (neonctl owner bağlantısı) repo secret'ları tanımlı; üretimde koşu YEŞİL: run 37907745803 (2026-10-09, 1m07s)
- [x] İzole staging veritabanına gerçek restore yapıldı — ✅ owner yedeği (`pg_dump --no-owner --no-privileges`, PG18) → yeni Neon branch'e `pg_restore --no-acl --exit-on-error`; STAGE=PROD (58 tablo, 47 RLS, 22 işletme, 30 satış, `report_due_tenants`). `scripts/backup-db.mjs`/`rehearse-restore.mjs` taşınabilirlik için güncellendi.
- [x] Growth recipient_ref/approval şeması production'a uygulandı — ✅ `db:growth:verify` **9/9 OK**; canlı akış: onaysız audience **403**, onaylı **200**; imzalı webhook **201** + replay **200 duplicate** (idempotent). Geçici anahtar/kampanya temizlendi.
- [x] Growth scope'lu key ile `RUNTIME_GROWTH_KEY=... BASE=<production> npm run audit:runtime` authenticated contract — ✅ **geçti**: feature-pack + insights + campaign listesi 200; audit anahtarı üretilip iptal edildi (`integration_keys` revoked). Tam runtime audit 16+3 PASS.
- [x] Ödeme yolu kararı (2026-11-10): **PayTR kullanılmayacak.** Pilot ve genel satışta tahsilat elden/havale/EFT ile alınır, abonelik `npm run billing:manual -- --email=... --months=... --confirm` ile uzatılır ve `audit_log`'a yazılır. PayTR yalnız ileride self-servis otomatik yenileme istenirse ayrı iş olarak eklenir; satış bloğu değildir.
- [ ] Gerçek e-Arşiv entegratörü seçildi; sandbox kesim, iptal ve e-posta testleri tamamlandı
- [ ] Bilgi fişi ile mali belge ayrımı mali müşavir tarafından onaylandı (`docs/MALI-UYUM-GATE.md`)
- [~] ÖKC kullanım/entegrasyon sorumluluğu işletme bazında yazılı olarak netleştirildi — ✅ taslak şablon hazır: `docs/OKC-SORUMLULUK-YAZISI.md` (sorumluluk tablosu + beyan + imza alanları; MALI-UYUM-GATE kapı 1/3 ile hizalı). ⏳ kalan (insan): hukuk/mali müşavir onayı + ilk pilot işletmeyle doldurulup imzalanması
- [~] `cabukpos.com` DNS, SSL, e-posta ve yasal iletişim adresleri doğrulandı — ✅ domain Vercel'de `cabukpos-app` projesine bağlandı (eski `cabukpos-landing` ataması kaldırıldı); `https://cabukpos.com` ve `https://www.cabukpos.com` 200 + geçerli TLS ile uygulamanın tanıtım sayfasını sunuyor (2026-10-16); `app.cabukpos.com` projeye eklendi ama DNS kaydı bekliyor. ⏳ kalan (insan): registrar panelinde NS'leri `ns1/ns2.vercel-dns.com`'a çekmek (Resend e-posta SPF/DKIM kayıtları için de şart) + `app` alt alanı için A/CNAME kaydı.
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
2. e-Arşiv sandbox doğrulaması (tahsilat manuel havale/EFT).
3. Tek pilot işletme ile sınırlı açılış.
4. Pilot sonunda backup, audit log, bekleyen offline kuyruk ve ödeme mutabakatı kontrolü.
5. Kritik hata yoksa satışa açılış; ilk hafta günlük operasyon gözden geçirmesi.

## Go kararı için saklanacak kanıt

- deployment URL'si ve Ready kaydı
- `npm run audit:runtime` çıktısı
- backup dosyası, restore sonucu ve tarih
- e-Arşiv test numaraları ve manuel tahsilat dekontu/audit kaydı
- donanım test formu ve pilot işletme kabulü
- mali müşavir/hukuk onayı

Production sırları repoya veya bu belgeye yazılmaz; yalnız Vercel/Neon ve güvenli
operasyon kasasında tutulur.
