# Koordinasyon — ÇabukPOS (2026-10-02)

Aynı repoda paralel çalışan ajanlar alan sahipliği buradan takip eder.
Kural: Başkasının alanındaki dosyaya dokunma; işin bitince commit + buraya satır ekle.

## Durum güncellemesi (2026-10-02)

Müdürlük bu panele (DB/ops ajanı) devredildi: **diğer ajan müdür**, bu panel işçi.
Görev dağılımını müdür belirler; bu panel `db/`, `scripts/`, cron, gözlemlenebilirlik
ve yedekleme alanında emre amade. İletişim: bu dosyaya not bırak, insan aktarır.

## Alan sahipliği

| Alan | Sahip | Kapsam |
|---|---|---|
| İade tutanağı + platform/paket hattı | **Diğer ajan** (yonetim paneli) | `app/yonetim/platformlar`, `lib/admin/delivery-actions.ts`, `lib/platform`, iade tutanağı modülü |
| DB, yedekleme, gözlemlenebilirlik, cron | **Müdür ajan** (bu panel) | `scripts/`, `lib/observability`, `app/api/cron`, `vercel.json`, `db/`, `.github/workflows`, `docs/OPERATIONS.md` |
| Launch checklist + birleştirme | **Müdür ajan** | `docs/LAUNCH-CHECKLIST.md`, main'e merge kararı/gate |
| Kimlik sertleştirme + kök app özel dosyaları + auth testleri | **Lead oturum** (insanın atadığı koordinatör) | `lib/auth`, `lib/site.ts`, `app/error.tsx`, `app/loading.tsx`, `app/robots.ts`, `app/sitemap.ts`, `tests/` |

## Yapıldı (bugün, müdür)

- [x] `700032d` Gerçek restore provası (`npm run db:restore:rehearsal`)
- [x] `f7f410c` Sessiz ajan heartbeat alarmı (5 dk cron)
- [x] `69f1898` Günlük backup workflow'u (secret: `BACKUP_DATABASE_URL` bekliyor)

## Görev dağılımı (2026-10-02, 61 maddelik açık-rapor taramasından)

Kural: kendi alanınla sınırlı çalış, her görevi bitirince commit + buraya `[x]` satırı bırak. Bitirdiğin görevin kapattığı açık-rapor maddesini parantezde yaz.

### Ajan-1 (yonetim paneli) — iade tutanağı bittikten sonra sırayla
1. [x] Yonetim alt sayfalarına `loading.tsx` + `error.tsx` iskeletleri (#56) — `f99c9fd`
2. [x] Bildirim merkezi iskeleti + Nav zil ikonu (#46) — `/yonetim/bildirimler` (canlı kaynaklar: onay bekleyen sipariş, geciken hazırlık, inceleme/mali uyarı) + Nav'da sayaç rozeti
3. [x] `lib/platform`: Getir/Yemeksepeti adaptör arayüzü + sandbox driver (#28 ilk adım) — `b1d9482`; env kapalı varsayılan (`GETIR_ENABLED`, `YS_ENABLED`), canlı anahtar insan işi
4. [x] Kurye akışına durum zaman damgası + gecikme uyarısı (#39 kolay kısmı) — paket hattında kabul/yolda/teslim saatleri + "Gecikti" rozeti (prepMin aşımı)
5. [x] #33 sadakat/hediye kartı/kupon (şema+UI): 6 RLS'li tablo + `lib/loyalty.ts` + `/yonetim/sadakat|kuponlar|hediyekarti` + Nav "Sadakat" grubu + testler; satış anı entegrasyonu (kazanç/harcanma/hediye kartı ödemesi) kasa tarafında ayrı iş — dev DB'ye db:push uygulandı
6. [x] #44 şube UI + kapsam: `/yonetim/subeler` + `cz_sube` çerezi + `lib/admin/store-scope.ts`; bugün/raporlar/stok/platformlar + ilgili aksiyonlar seçili şubeye bakıyor; `delivery-actions` platform kabulü cihazı şubeye göre seçiyor (sıradaki: #37 QR menü/kiosko)
7. [x] #15 abonelik iptal/iade akışı: iade talep→onay kayıtları + 7 gün satışsız koşul yardımcısı + abonelik sayfası iade/iptal UI + testler (`billing-refund`); para iadesi PayTR canlı anahtar bekliyor (sıradaki: #37 QR menü/kiosko)
8. [x] #37 QR menü + kiosko + müşteri ekranı: `/menu/<şube>` (definer fn `public_menu_by_store`), `/api/kiosk` (sır doğrulamalı, rate limitli, tab olaylarına yazar), `/menu/<şube>/s/<tab>` durum ekranı, panelde kiosko bağlantısı + QR; `qrcode` bağımlılığı eklendi (sıradaki: #22 panel offline)
9. [x] #22 panel offline + Background Sync: SW artık `/yonetim` gezinmelerini de ağ-önce/önbellek-sonra tutuyor (`cabukpos-yonetim-v1`; çevrimdışında son kopya → panel girişi), panele `PanelOffline` bandı + SW kaydı/warm eklendi; kasada `registerOutboxSync` (çevrimdışı+kuyruk dolu → SyncManager) + SW `sync` olayı sayfaya `sync-now` mesajı → eşitleme motoru çalışır — `d33e9e3` (sıradaki: #34 pazarlama sağlayıcı)
10. [x] #34 pazarlama sağlayıcı: `lib/growth/messaging` — SMS HTTP sürücüsü (`MARKETING_SMS_ENABLED`/`API_BASE`/`API_KEY`/`FROM`, kapalıyken ağa çıkmaz), `sendGrowthCampaignPage` (onaylı kampanyayı izinli alıcıya sayfa sayfa gönderir, sent olayı + ref eşlemesi idempotent, opt-out'lular atlanır, telefon log/audit'e yazılmaz), kampanya sayfasında "Gönder (SMS)" (sahip + env açık); opt-out geri çağrısı mevcut events API'si üzerinden izni kapatır — `44152b5`; canlı SMS/WhatsApp hesabı insan işi (sıradaki: #20 muhasebe export)
11. [x] #20 muhasebe export: `lib/core/accounting.ts` (saf yevmiye kuralları: gün sonu POS 102/600/391, e-Arşiv 120 cari — POS özetinden düşülür, iadeler ters, alımlar 153/320; CSV hücre kaçışı + formül koruması) + `lib/admin/accounting.ts` (aylık DB özeti, Istanbul ay aralığı, audit) + `GET /api/yonetim/muhasebe?aylik=YYYY-MM&format=parasut|logo|mikro|edefter` (sahip/müdür) + Mali'de "Muhasebe" sekmesi — `07b46a9`; not: alım KDV ayrıştırması fişte yok (153'e toplam), e-Defter çıktısı entegratör ön verisi, GİB imzası kapsamaz (sıradaki: #27 bulut→istemci push)
12. [x] #27 bulut→istemci push: `GET /api/sync/stream` (SSE; cihaz çerezi; 2 sn'de bir `lib/sync/dirty.ts` ucuz kiracı belirteci — satış synced_at, tab_events seq, vardiya aç/kapa, cihaz eşleme/fiş sayacı; 15 sn ping, ~240 sn ömür, EventSource kendi bağlanır) + kasada `es.onmessage → sync.kick()` (çekim yine ?v= katalog özetiyle; belirteçte katalog içeriği yok, katalog düzeni 60 sn periyodla gelir) — `1448969` (sıradaki: #29 marketplace'e geri push)
13. [x] #29 marketplace'e geri push: `OrderSource.pushCatalog?` (opsiyonel adaptör metodu) + `lib/platform/outbound.ts` (`pushStoreCatalog`: eşlenmiş kod → ürün adı/fiyat/stok, stok `stockLevels`'ten, izlemesizde null; ağ DB işlemi dışında; audit) — mock sürücü anında ok (MOCK_PLATFORM_FAIL hata yolu), Getir sandbox `PUT /stores/:id/catalog` (GETIR_ENABLED kapalıysa error; `createGetirSource` artık test için config parametreli), kiosk/ys "unsupported"; Platformlar sayfasında "Menü/fiyat/stok gönder" butonu — `a2420ba`; not: `Conn` tipine + `cols`'a `active` eklendi (pushStoreCatalog kapalı bağlantıyı reddeder); canlı Getir/YS katalog onayı insan işi (sıradaki: #30 webhook kimliklendirme)

### Müdür ajan (DB/ops)
1. [x] Sentry/APM iskeleti + uptime kontrolü — `lib/observability` (#57) — `ed5db94` (telemetri env-kapalı OTLP; hata kancaları; `/api/cron/uptime`)
2. [x] CI restore provası job'ı — `.github/workflows` (#58) — `ba57d7a`
3. [x] Fiscal backlog escalation: 5/gün limitine takılan kiracı için alarm — `app/api/cron`, `vercel.json` (#21) — `6b79dfd`
4. [x] `db/`: `users.emailVerified` + `users.totpSecret` kolon şeması (2FA/e-posta doğrulama ön hazırlığı; auth tarafını lead oturum yazar) (#1, #4 ön hazırlık) — `54e160a`; ⚠️ yayında `db:push` gerekir

### Lead oturum (koordinatör) — ŞİMDİ YAPIYOR
1. [x] `lib/auth/password.ts`: HIBP sızma şifre kontrolü + sıkı politika (#5) — `31d8e06`
2. [x] `lib/auth/actions.ts`: başarısız girişte hesap kilitleme (#6) — `31d8e06`
3. [x] Kök `app/error.tsx` + `app/global-error.tsx` + `app/loading.tsx` (#56) — `31d8e06`
4. [x] `app/robots.ts` + `app/sitemap.ts` + layout noindex kapısı (#59) — `31d8e06`
5. [x] İlgili birim testleri (#53 kısmi) — `31d8e06`
6. [x] Uygulama düzeyi CSRF katmanı (#2): `lib/auth/csrf.ts` saf `csrfVerdict` + `assertCsrf()` → `requireWriter`'da; çapraz site/same-site + origin↔host reddi, tüm yönetim aksiyonlarını tek merkezden kapatır (`f5b5386`)
7. [x] Kayan oturum yenileme (#3): proxy'de 1 günü aşan jetona yeni 14 gün; `shouldRenewSession` saf + testli (`343fe1a`)
8. [x] #7 raporlandı (mevcut `AUTH_SECRET|<aud>` türev anahtar tasarımı zaten kapatıyor); #8 tamamlandı: form tabanlı hassas işlemlerde `checkReauth` (`9e41459`) + kalanı: yıkıcı iptaller (cihaz/ajan/ajans anahtarı) şifreli re-auth (`RevokeForm`) + `cz_device` jeton rotasyonu (30 günde bir, önceki jeton geçiş süresiyle; katalog çekiminde döner) (`c10af14`, E2E m1+m5 yeşil)
9. [x] Merkezi API kimlik kapıları (#10): `lib/auth/api.ts` requireApiAdmin/Writer + apiRole + mutasyonda CSRF; 2 admin rotası taşındı (`ae9504f`)
10. [x] SW sekmesiz outbox boşaltımı (#23): ham-IDB pusher + periodicsync (`969cfbb`); 14 gün prune + parti hizalama koruması (#26) (`f864f71`)
11. [x] Re-pair sıfırlama bildirimi (#24): resetNotice + kasa rozeti (`49d5e19`, E2E m2 yeni build'de yeşil); fiş çakışması iade politikası (#25): çekirdek no → "-N" ikiz düşüşü (`443633c`, DB testli) — offline grubu (23-26) tamamlandı
12. [x] #16 tamamlandı: lead yarısı Currency meta + formatMoney (`7bca038`); müdür yarısı `tenants.currency` kolonu + Tercihler'de seçici (sahip/müdür) + Yönetim Bugün para birimi duyarlı biçim (`040990c`; kasa fişi/ESCPOS hâlâ ₺, ihtiyaç olursa ayrı iş); #36 tamamlandı: barkod + raster + marka profilleri (`5eb6f3d`+`0d392da`) + logo PNG→1bit (`aa044ce`: lib/core/png.ts çözücü, agentConfig.logo, Donanım yükleme/önizleme, fiş+gün sonu başlığı)
13. [x] #9 aktif oturum listesi + tüm cihazlardan çıkış (`9deaf14`): lead istediği `sessions` şemasını kendisi yazdı (müdür yokken kilidi açmak için; RLS dışı kimlik tablosu çünkü lib/auth tenantsız bağlantı kullanıyor — istekteki "RLS'li" bu yüzden değişti). Girişte hash kaydı, getAdmin hash kapısı, çıkışta iptal, Güvenlik sayfasında liste + re-auth'lu düşme. ⚠️ yayında `db:push` gerekir.
14. [x] #48 para kırılımı sayımı + safe-drop (`d5bb003`): sayım paneli Gün sonu'nda; seifeye alma → `safe_drop` outbox belgesi → `register_events` (yeni type, şema değişikliği yok) → beklenen kasa yerelde ve bulutta düşer. Rapor/fişte "Seifeye alınan" satırı

## Müdür için istek (lead)

- **#11 otomatik yenileme** `tenants` tablosuna `cardToken text` + `cardMark text` kolonu bekleniyor; Lead sonra cron'da tokenli yenileme yazar

## İnsan müdahalesi bekleyenler (kod değil)

- GitHub secret `BACKUP_DATABASE_URL`, Vercel env `AGENT_ALERT_WEBHOOK_URL`
- PayTR canlı anahtarları, e-Arşiv entegratörü, hukuk/mali müşavir, DNS

## İş kuyruğu (loop) — 2026-10-02

Tam açık listesi: **`docs/ACIK-RAPORU.md`** (61 madde, P0→P2 sıralı).
Kural: rapordan kendi alanına düşen ilk açık `[ ]`'i al → yap → commit → raporda `[x]` + sha → sıradaki.

- **Ajan-1 sıradaki:** #30 webhook URL kimliklendirme — [x] `1dbfe47` (`webhookToken` unique, `/api/platform/<p>/webhook?t=`, panelde jetonlu adres; eski `?c=` geçerliliği korumada)
- **Müdür sıradaki:** #43 konsolide rapor (#40 kohort/RFM tamamlandı — Raporlar→Müşteriler)
- **Lead sıradaki:** #11+#12 PayTR otomatik yenileme + dunning → #1 2FA → #4 e-posta doğrulama
- **İnsan bekleyen:** PayTR canlı anahtar + **kart saklama (Direct API) sözleşmesi** (#11 için), e-Arşiv/ÖKC entegratör hesabı, SMS/WhatsApp hesabı, Getir/YS API erişimi
- **Müdür notu (#11 bağımlılığı):** `tenants` tablosuna `cardToken text` + `cardMark text` kolonu ekle (#11 otomatik yenileme bunu bekliyor); Lead sonra cron'da tokenli yenileme yazar

## Birleştirme

Hepimiz `iade-tutanak` dalındayız. İki taraf da commit'ini bitirince müdür
main'e merge eder; gate: lint + typecheck + tam test + build.
