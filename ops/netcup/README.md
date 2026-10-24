# Netcup bakım işleri

24 Ekim 2026'da mevcut `netcup` SSH hedefinde kuruldu. GitHub Actions gerekmez.

| İş | Zaman (UTC) | Türkiye saati |
| --- | --- | --- |
| Şifreli üretim DB yedeği | Her gün 03:15 | 06:15 |
| Son yedekten gerçek restore provası | Pazartesi 04:30 | 07:30 |

Timer'larda en fazla 60 saniye rastgele gecikme ve sunucu yeniden açıldığında
kaçırılan işi çalıştırma (`Persistent=true`) vardır. Ortak dosya kilidi paralel
yedek/restore çalışmasını engeller. Birimlerin zaman aşımı 30 dakikadır.

## Yerleşim ve gizli ayarlar

- Kod: `/opt/cabukpos-ops/maintenance.py`
- Ayar: `/etc/cabukpos-ops/config.json` (root, 0600)
- Şifreli yedekler ve HMAC metadata: `/var/lib/cabukpos-ops/backups/` (0700/0600)
- Son başarılı çalışma zamanları: `/var/lib/cabukpos-ops/{backup,restore}-status.json`
- Systemd birimleri: bu dizindeki `cabukpos-*.{service,timer}`

Ayar dosyası `database_url`, `encryption_key`, `image` içerir; isteğe bağlı
`state_dir` desteklenir. Değerler Git'e veya loglara yazılmaz. Kurulumda yalnız
ÇabukPOS Neon üretim bağlantısı alındı; Vercel sırları topluca indirilmedi.
Anahtarın kurtarma kopyası operatör Mac'inde
`~/.config/cabukpos/netcup-backup-key` (0600) altında tutulur. Anahtar olmadan
şifreli yedek geri yüklenemez; anahtarı yedek dosyalarıyla birlikte paylaşmayın.

Yedek, PostgreSQL 18 custom formatında `--no-owner --no-privileges` ile okunur.
Ham dump diske yazılmadan OpenSSL AES-256-CBC/PBKDF2 (310000 iterasyon) ile
şifrelenir; HMAC-SHA256 değiştirilmiş şifreli dosyayı restore öncesi reddeder.
Şifre çözme + `pg_restore --list` başarılı olmadan yeni yedek yayımlanmaz.
Tam restore provası yalnız bu programın oluşturduğu ağsız, portsuz, geçici Docker
container'ında çalışır. Üretime restore hedefi kabul edilmez. Kaynak policy rol
referansları için geçici DB'de NOLOGIN roller oluşturulur. `--exit-on-error`
ardından tenants doluluğu, billing_invoices ve report_due_tenants doğrulanır.
Container ve geçici veriler sonunda kaldırılır. Bu kontrol uygulama release
migrasyonu, RLS yeniden uygulaması veya uygulama readiness testinin yerine geçmez.

### Release provası (elle, canlıya yazmaz)

`maintenance.py release --release-dir /opt/cabukpos-ops/releases/2fd9d57`
aynı şifreli yedeği tekrar izole container'a yükler; `release_check.py` ardından:

1. Release SQL + RLS'yi tek transaction'da uygular ve ikinci uygulamayı da sınar.
2. tenants/users/stores/products/sales/stock_movements sayılarıyla satış/stok
   toplamlarını önce/sonra karşılaştırır.
3. Dokuz tabloda FORCE RLS, uygulama rolünün superuser/bypassrls olmaması,
   bağlamsız ve ilgisiz kiracıda sıfır satır, kendi kiracısında doğru sayıları sınar.
4. Uygulamayı ayrı Node container'ında, yalnız ağsız DB'nin network namespace'ini
   paylaşarak çalıştırır. Host portu açılmaz; üretim sağlayıcı anahtarları verilmez.
5. Gerçek production build'in `/api/ready` yanıtını uygulama DB rolüyle doğrular;
   `scripts/runtime-audit.mjs` kontrolünü çalıştırır. Geçici app/DB kaldırılır.

Build snapshot'ı `git archive` üzerinden sır içermeden kopyalanır; lockfile ile
`npm ci` ve `npm run build` mevcut Node 22 imajında, production ayarları olmadan
çalıştırılır. Build aşamasının paket indirmek için ağı vardır; restore ve çalışma
zamanı kontrollerinde dış ağ yoktur. Snapshot adı uygulama build commit'idir;
SQL düzeltmesi aynı dizine ayrıca aktarılmıştır. Uygulama kodu değişmediği için
build tekrarlanmadı. Denenen SQL'in kesin sürümü `migration_rls_sha256` ile kayıtlıdır.

Son başarılı kayıtlar `/var/lib/cabukpos-ops/release-status.json` ve
`release-evidence.json`; tablo/sütun metadata'sı `release-schema-inventory.json`
altındadır. Bu dosyalara tenant satırları veya erişim anahtarları yazılmaz.
Haftalık restore timer'ı temel restore kontrolünü sürdürür; release provası yeni
her build/sürüm için ayrıca çalıştırılır.

### Kontrollü canlı SQL geçişi

`apply_release.py --release-dir ... --expected-sha256 ...` önce yalnız okuma
kontrolü yapar. Yazma için ayrıca `--apply` gerekir. Script üretim bağlantısını
yalnız mevcut 0600 ayardan alır; parolayı komut argümanına yazmaz, verify-full
kullanır. En fazla bir saatlik başarılı backup/release kaydı, şifreli dosyanın
HMAC'i ve SQL'in prova kaydındaki hash'i eşleşmelidir. PG18 primary/owner rolü,
app rolünün bypass yetkisi olmaması ve 30 saniyeyi aşan transaction bulunmaması
kontrol edilir. Aktif oturum sayısı bilgi olarak kaydedilir; ölçüm anlıktır.

Prova ve canlı aynı `release_transaction()` SQL üreticisini kullanır. Geçiş
REPEATABLE READ transaction'ında, 5 sn lock / 60 sn statement limiti ve advisory
kilidiyle yapılır. Geçiş öncesi sayılar/toplamlar geçici tabloda saklanır;
karşılaştırma ve dokuz FORCE RLS tablosu kontrolü **COMMIT öncesi** yapılır.
Başarılı sonuç `/var/lib/cabukpos-ops/production-release.json` içine yazılır.
Bu script uygulamayı deploy etmez veya otomatik geri dönüş başlatmaz.

`live_fixture.mjs create|cleanup <snapshot-dir>` yalnız işaretli, geçici tenant
ve üç doğrulanmış `.invalid` test hesabını yönetir; kayıt/davet e-postası yoktur.
Yerel `e2e/release-smoke.mjs`, BASE ve RELEASE_FIXTURE_FILE ile sahip/HQ/şube
girişlerini ve erişim kapılarını sınar. Cleanup kullanıcıları, oturumlarını ve
test tenant'ını kaldırır; başka tenant'a dokunmamak için ID+ad işareti doğrulanır.
Yerel fixture dosyasını da test bittikten sonra kaldırın. DB bağlantısı root
ayarını okuyabildiğinden fixture aracı yalnız kontrollü operatör çalıştırması içindir.

Mevcut PostgreSQL 18 imajı digest ile sabittir, iş sırasında image indirilmez:
`postgres@sha256:edb0c08dc33befd0262ab3b5cf1c4f3f8cfd8b09e88c05b45adee29d6761ddb6`.
Container başına 512 MB bellek ve 0.5 CPU sınırı vardır. DB bağlantısı
`verify-full` kullanır; VPS CA paketi container'a salt okunur bağlanır.
[PostgreSQL TLS doğrulaması](https://www.postgresql.org/docs/18/libpq-ssl.html).

Mevcut altı uygulama cron'u `/opt/cron-tetik/tetik.py` ve `/etc/cron.d/cron-tetik`
üzerinden zaten çalışıyordu; ikinci bir scheduler kurulmadı. Başarılı son çağrılar
sunucu logundan doğrulandı. Diğer projelerin cron'ları değiştirilmedi.

## Kontrol ve elle çalıştırma

```sh
ssh netcup 'systemctl list-timers --all cabukpos-backup.timer cabukpos-restore.timer'
ssh netcup 'systemctl show cabukpos-backup.service cabukpos-restore.service -p Id -p Result -p ExecMainStatus'
ssh netcup 'journalctl -u cabukpos-backup.service -u cabukpos-restore.service -n 25 --no-pager'
ssh netcup 'cat /var/lib/cabukpos-ops/backup-status.json /var/lib/cabukpos-ops/restore-status.json'
ssh netcup 'systemctl start cabukpos-backup.service'
ssh netcup 'systemctl start cabukpos-restore.service'
```

Status dosyası **son başarılı** çalışmayı gösterir; güncelliği ve servis sonucunu
birlikte kontrol edin. Kayıtlar journald'a gider; yeni otomatik e-posta kurulmadı.
Yedeklere otomatik silme uygulanmaz; disk kullanımını takip edin. Mevcut GitHub
artifact'ları korunur. Netcup dışına ikinci şifreli kopyalama henüz kurulmadı.

Kod güncellemesi için yalnız bu dizindeki dosyaları `/opt/cabukpos-ops/` altına
kopyalayın; ayar/anahtar dosyasını değiştirmeyin. Birimler değişirse 0644 izinle
`/etc/systemd/system/` altına kurup `systemctl daemon-reload` çalıştırın.
İlk kurulumda yedek ve restore başarılı olduktan sonra:

```sh
systemctl enable --now cabukpos-backup.timer cabukpos-restore.timer
```

Durdurma: `systemctl disable --now cabukpos-backup.timer cabukpos-restore.timer`.
Bu komut yedekleri, anahtarı veya mevcut uygulama cron'larını silmez.

## İlk canlı doğrulama

- 2026-10-24 09:39 UTC: gerçek Neon DB yedeği alındı; 265104 bayt şifreli dosya,
  şifre çözülmüş katalog kontrolü başarılı.
- 2026-10-24 09:41 UTC: aynı şifreli yedek izole PostgreSQL 18'e tamamen geri
  yüklendi; gerekli tablo/fonksiyon ve tenants kontrolü başarılı, servis exit 0.
- Yerel HMAC kontrolünde değiştirilmiş dosya reddedildi; Python derleme kontrolü geçti.
- 2026-10-24 09:54 UTC: Linux production build + gerçek yedek üzerinde release
  SQL/RLS iki uygulama, veri korunması, dokuz tabloda tenant görünürlüğü,
  uygulama DB rolüyle readiness ve runtime audit PASS. Geçici container kalmadı.
- İlk release denemesi eksik `category_station_routes` / `product_station_routes`
  tablolarını buldu; sürüm SQL'ine schema.ts ile aynı FK ve unique index'lerle
  eklemeli CREATE eklendi. Legacy mutfak yönlendirmesi uygulamada fallback olarak
  korunur; eski ürün/satış satırları değiştirilmedi.
