# İlerleme — ÇabukPOS

## Kanıta dayalı ciro tahmini (2026-10-05)
- `/yonetim` Bugün ekranına son 28 tam günün brüt cirosundan 7 günlük yerel tahmin eklendi; en az 14 günlük pencere ve 7 aktif gün yoksa tahmin üretilmiyor.
- Tahmin günlük ortalama, örnek standart sapma, yaklaşık %80 aralık ve artış/azalış eğilimiyle gösteriliyor; UI kesinlik iddiasını açıkça reddediyor.
- Kanıt: `tests/forecast.test.ts`; tam süit yetkili yerel DB koşusunda **344/344** geçti.

## Yardım metni güvenlik kapısı (2026-10-05)
- Kullanım kılavuzu, gerçek e-Arşiv entegratörü olmadan canlı mali belge üretildiği izlenimini vermeyecek şekilde düzeltildi.
- `tests/help.test.ts` başlık bütünlüğünü, `tests/help-content.test.ts` ise bilgi fişi/mali belge ayrımı ve production entegratör kapısını içerik drift'ine karşı doğruluyor.

## Mali uyum kapısı (2026-10-05)
- GİB/YN ÖKC ve e-Arşiv kaynakları incelendi; ürünün "bilgi fişi" ile gerçek mali belge ayrımı, entegratör/ÖKC sorumluluğu ve pilot imza kapıları `docs/MALI-UYUM-GATE.md` içinde resmileştirildi.
- Resmî kaynaklar ürünün tek başına ÖKC veya gerçek e-Arşiv yerine geçtiğini kanıtlamıyor; bu nedenle canlı satış iddiası bilinçli olarak entegratör, cihaz ve mali müşavir kanıtına bağlı tutuluyor.

## M54 mobil/kiosk E2E (2026-10-05)
- Gerçek Chrome ile `npm run e2e:m54` geçti: 390×844 mobil kayıt/panel render, çekmece navigasyonu, ürün oluşturma, Kiosk/QR bağlantısı, herkese açık menüden sipariş ve durum ekranı; 1440px masaüstü menü taşma kontrolü de geçti (`M54 OK`).
- CI workflow'u production smoke testinden sonra `e2e:critical` ve `e2e:m54` çalıştıracak şekilde kapsıyor.

## Yedek artifact gizliliği (2026-10-05)
- Günlük backup workflow'u ham PostgreSQL dump'ını artifact'a yüklemiyor; `BACKUP_ENCRYPTION_KEY` ile AES-256-CBC/PBKDF2 şifreleyip yalnız `.dump.enc` saklıyor.
- Workflow, `BACKUP_DATABASE_URL` veya şifreleme anahtarı yoksa kontrollü biçimde duruyor; restore öncesi güvenli runner'da çözme ve katalog/restore provası adımları operasyon belgesine işlendi.

## RLS kapsam ve audit append-only kapısı (2026-10-05)
- `tests/rls-coverage.test.ts` tenant_id taşıyan tüm tabloları kaynak şema/RLS SQL'iyle karşılaştırıyor; yalnız gerekçeli kimlik/abonelik istisnaları allowlist'te kalabiliyor.
- `db/rls.sql` uygulama rolü için `audit_log` UPDATE/DELETE/TRUNCATE yetkilerini kaldırıyor; ekleme ve okuma dışındaki değişiklikler DB seviyesinde reddediliyor.
- Kanıt: RLS coverage testi 2/2; tam `npm test` toplamı **344/344**, statik kalite geçişi.

## Deployment runtime kanıtı (2026-10-05)
- Production deployment `dpl_7B1h2jvuMgMrFxhECqoQWJFDyeqt` **Ready** ve `cabukpos-app.vercel.app` alias'ına bağlı; `/api/health` ve `/api/ready` 200 (`database:ok`).
- `BASE=https://cabukpos-app.vercel.app npm run audit:runtime` 16/16 geçti: login/kayıt 200/307, anonim export/growth/fiscal/billing korumaları 401.
- GitHub Actions cron workflow'una `APP_URL` ve `CRON_SECRET` repository secret'ları eklendi. Manuel `uptime`, `agent-heartbeat` ve `fiscal` koşuları 200 geçti.
- Production cron logları `billing` için eksik `billing_invoices` tablosunu, `report` için eksik `report_due_tenants(text,timestamptz)` fonksiyonunu gösteriyor; canlı Neon migration owner bağlantısı olmadan bu iki iş tamamlanmış sayılmıyor.
- Cron'lar GitHub Actions workflow'una taşındı (`.github/workflows/cron.yml`); Vercel `vercel.json` cron tanımlamıyor. Backup workflow'u için ayrıca `BACKUP_DATABASE_URL` + `BACKUP_ENCRYPTION_KEY` secret'ları gerekiyor.

## Pilot onboarding — CSV ürün aktarımı (2026-10-05)
- Yönetim → Ürünler'e CSV'den toplu ürün aktarımı eklendi; Türkçe/İngilizce başlıklar, tırnaklı TL fiyatları ve kategori adları destekleniyor.
- Ürün/kategori yazımı tenant işleminde yapılır; tüm satırlar doğrulanmadan hiçbir ürün kaydedilmez. Kategori yoksa oluşturulur; PLU ve barkod çakışmaları mevcut veriye karşı reddedilir.
- Sınırlar: dosya en fazla 1 MB, aktarım en fazla 500 ürün. Şablon `public/indir/cabukpos-urun-sablonu.csv`; saf parser testi `tests/product-csv.test.ts`.
- Kanıt: `npm run qa:static`, `npm run build`, parser testleri yeşil. DB entegrasyon testi gerçek PostgreSQL bekler.

## Production mali güvenlik kapısı (2026-10-05)
- `fake-earsiv` ve `fake-okc` sağlayıcıları `NODE_ENV=production` veya `LAUNCH_ENV=production` altında fail-closed olur; sahte belge/künye üretmez.
- Testler: `tests/fiscal.test.ts`, `tests/okc.test.ts`; 16/16 ilgili saf test yeşil.
- Mali ayarlarda production + sahte sağlayıcı durumunda e-Arşiv düğmesi devre dışı; server action da e-Arşiv ayarını reddediyor, işletme bilgi fişiyle devam edebiliyor.

## Production abonelik fail-closed (2026-10-05)
- `getBillingProvider()` artık `NODE_ENV=production` veya `LAUNCH_ENV=production` altında `BILLING_PROVIDER=fake` için sağlayıcı döndürmüyor; launch-check atlanmış olsa bile sahte ücretsiz abonelik/yenileme akışı açılmıyor.
- Kanıt: `tests/billing-provider.test.ts` 1/1 ve `npm run qa:static` yeşil.

## CI workflow provenance (2026-10-05)
- CI, backup ve restore workflow'larındaki GitHub Actions referansları tam commit SHA'larına sabitlendi; workflow scanner artık aday bulmuyor.
- `actions/checkout` v4.2.2 (`11bd719…`), `actions/setup-node` v4.4.0 ve `actions/upload-artifact` v4.6.2 pinleri kullanılıyor.

## Dependency release evidence (2026-10-05)
- Dependency supply-chain scanner manifest/lockfile, Git/path bağımlılığı, install hook ve registry override adayı bulmadı.
- `npm audit --omit=dev --audit-level=high`: **0 vulnerability** (npm advisory verisi, 2026-10-05).

## Büyüme Merkezi / M9d (2026-10-01)
- Tenant içi ve yalnız restoran dikeyinde feature-pack, baseline/Laya advisor, kampanya taslağı, kampanya listesi/durumu ve idempotent ölçüm olayları tamamlandı.
- İletişim izni değişimleri audit edilir; kampanya hedefi yalnız açık izinli müşterilerden hesaplanır; ham müşteri PII'si harici API'ye çıkmaz.
- Harici servis erişimi growth kapsamlı anahtarla, dakikada 60 istekle sınırlıdır. Sağlayıcı webhook'u Bearer + timestamp/HMAC imzası, 5 dakika replay penceresi ve 64 KB gövde sınırı kullanır.
- İzinli kampanya hedefleri sayfalı audience endpoint'inden yalnız growth anahtarıyla türetilmiş hmac-sha256 recipientRef olarak okunur; telefon, ad ve müşteri UUID'si dışarı çıkmaz.
- Audience yanıtındaki recipientRef tenant içi eşleme tablosuna yazılır; sağlayıcı opt-out olayını yalnız recipientRef ile gönderdiğinde POS doğru müşterinin iznini kapatır, UUID paylaşımı gerekmez.
- Kampanya taslağı işletme sahibi onaylamadan audience endpoint'i 403 döner; onay aktörü/zamanı audit edilir ve yalnız onay sonrası hedef referansları açılır.
- Multi-tenant audit tamamlandı: API anahtarı/oturum tenant'ı `withTenant` ve RLS ile taşınıyor; kampanya, audience, event ve opt-out akışlarında başka tenant negatifleri geçiyor. İç çağrılarda da `customerId` tenant doğrulaması savunma katmanı olarak zorunlu.
- Laya egress sınırı sertleştirildi: yalnız PII'siz feature-pack gönderiliyor; production'da HTTPS dışı, placeholder/localhost veya userinfo içeren danışman URL'si çağrılmıyor; cevap schema ve gözlenen evidence ile doğrulanıyor.
- API sözleşmesi docs/growth-api.openapi.yaml; operasyon/kullanım sınırları docs/GROWTH-API.md ve docs/GROWTH-SERVICE.md.
- Kanıt: 169/169 test, lint/typecheck, production build, webhook imza testleri, DB tenant/idempotency/audience/recipient-dedupe testleri ve runtime audit'te 16 anonim/korumalı kontrol tanımı; `RUNTIME_GROWTH_KEY` ile buna ek 3 authenticated Growth contract kontrolü.
- Açık canlı kapılar: gerçek deployment doğrulaması (şema + RLS + yeni recipient-ref tablosu), provider sandbox teslimat/opt-out provası, backup-restore provası ve hukuki/mali müşavir onayı. Bunlar repo testiyle kanıtlanmış sayılmaz.
- Canlı alias kontrolü (2026-10-02): production deployment `dpl_Au7pGSjpMXEteaW959XfJ43soWkf` hazır; health/ready 200, anonim Growth feature-pack/insights/campaign/audience/event/signed-webhook uçları beklenen 401 dönüyor. Authenticated Growth sözleşmesi gerçek key olmadığı için henüz çalıştırılmadı.

Spec: docs/superpowers/specs/2026-09-28-cabukpos-pos-design.md · Planlar: docs/superpowers/plans/2026-09-28-cabukpos-m1-cekirdek-kasa.md, …-m2-cevrimdisi.md, …-m3-market.md
Eski (YanındaPOS tabanlı) kod: git etiketi `yanindapos-tabanli-v0`. Bu dal (`pos-cekirdek`) main'e, production kurulumu (Neon rolü + env) kararlaştırılınca birleşir.

## M1 — Çekirdek + kasa
- [x] T1 İskelet + test düzeni
- [x] T2 Para ve sepet çekirdeği
- [x] T3 Ödeme + vardiya özeti
- [x] T4 PIN + cihaz jetonları
- [x] T5 Şema + RLS + withTenant
- [x] T6 Kayıt, giriş, proxy
- [x] T7 Ürün/kategori yönetimi
- [x] T8 Personel PIN + cihaz eşleme
- [x] T9 Kasa: eşleme, PIN, vardiya açma (E2E ile tarayıcıda doğrulandı)
- [x] T10 Satış ekranı + idempotent satış (E2E: karma ödeme, para üstü)
- [x] T11 Bilgi fişi 80 mm (/kasa/fis/[id]), gün sonu (/kasa/gun-sonu), /yonetim/raporlar (+ayrıntı), E2E e2e/m1.mjs → "M1 OK"

**M1 BİTTİ (2026-09-28).** Kapanış kapısı: npm test 12/12, eslint + tsc temiz, E2E M1 OK (yerel DB).
PRODUCTION (2026-09-28): Neon projesi `cabukpos` (orange-moon-25841597, org agen, eu-central-1); `cabukpos_app` rolü SQL ile açıldı (neonctl ile açılan rol neon_superuser → BYPASSRLS, kullanma). Vercel env: DATABASE_URL (app rolü) + AUTH_SECRET yenilendi. main'e birleşti, canlı E2E (`BASE=https://cabukpos-app.vercel.app node e2e/m1.mjs`) M1 OK. Şema değişikliğinde sahip URL'si: `npx neonctl connection-string --project-id=orange-moon-25841597`. Sıradaki: M2 (çevrimdışı).

Not: sunucu `node --env-file=.env.local node_modules/.bin/next start -p 3800`; plan kodu `python3 scripts/plan-extract.py <yol>` ile çıkarılır.

## M2 — Çevrimdışı kasa
- [x] Şema `sales.review`, `sales.synced_at`; `lib/sync` (belge şemaları + bulutta uygulama), testli
- [x] `/api/sync/catalog` (içerik özetli katalog + cihaz + açık vardiya), `/api/sync/push` (FIFO, idempotent, 409 eşleme değişti)
- [x] İstemci: Dexie (`lib/offline`), eşitleme motoru (artan bekleme), `KasaApp` (PIN cihazda, vardiya/satış/fiş/gün sonu yerel)
- [x] Service worker `public/sw.js` + ilk yüklemede statik ısıtma; manifest
- [x] E2E `e2e/m2.mjs` → "M2 OK"; `e2e/m1.mjs` yeni akışa uyarlandı → "M1 OK"

**M2 BİTTİ (2026-09-28)** yerelde: npm test 17/17, eslint + tsc temiz, E2E M1 OK + M2 OK.
Kaldırılan: kasiyer çerezi, `/kasa/fis/[id]`, `/kasa/gun-sonu`, `lib/kasa/sale.ts` (hepsi KasaApp + lib/sync'e taşındı).
⚠️ `drizzle-kit push` RLS'yi KAPATIYOR (şemada tanımlı değil) → `db:push`/`db:push:test` artık ardından RLS'yi uyguluyor. Prod'da şema değişikliğinden sonra MUTLAKA `MIGRATE_DATABASE_URL=<sahip> node scripts/db-rls.mjs` + `relrowsecurity` kontrolü.
Sonra (M4+): uygulama simgeleri (kurulabilir PWA için 192/512 png), reddedilen belgeler için yönetim ekranı, `sales.review` listesi.

## M3 — Market (dal `m3-market`, `m2-cevrimdisi` üstünde)
- [x] Saf çekirdek: `lib/core/scan.ts` (EAN-13, terazi etiketi 27/28/29+PLU+gram, `5*` çarpan, kg), `stock.ts` (son sayım mutlak + sonrası), `ean13.ts`, `refund.ts`; gün sonu iadeyi düşer
- [x] Şema: `products.kind/plu/track_stock/quick/price_changed_at/label_printed_at`, `sale_status += iade`, `sales.refund_of/approved_by`, `stock_movements` (RLS)
- [x] Eşitleme: `refund` belgesi (fazla iade / bilinmeyen asıl satış / ödeme farkı / müdür olmayan onay → review), satış/iade stok hareketi, `GET /api/sync/sale?no=`
- [x] Yönetim: ürün formu (tür, PLU, stok takibi, hızlı tuş), `/yonetim/stok` (alış/fire/sayım), `/yonetim/etiketler` (A4 3×8, EAN-13 SVG)
- [x] Kasa: okutma çözümü, elle tartım, market ızgarası = hızlı tuşlar, iade ekranı (kasiyerse müdür PIN'i), iade fişi
- [x] E2E `e2e/m3.mjs` → "M3 OK"; M1 OK + M2 OK

**M3 BİTTİ (2026-09-28)** yerelde: npm test 33/33, eslint + tsc temiz, build, E2E M1 + M2 + M3 OK.
v1 sınırları: terazi etiketi yalnız ağırlık kodlu (fiyat kodlu M4'te gerçek teraziyle); teraziden okuma ve termal etiket M4 (ajan); maliyet M7.
Prod: M2 ile birlikte bekliyor. Sıra: `m2-cevrimdisi` → main, sonra `m3-market` → main. Her şema push'undan sonra `db-rls.mjs` + `relrowsecurity` kontrolü (yeni tablo `stock_movements` dahil).
Açık kalan (M2'den): uygulama simgeleri (192/512 png), yönetimde reddedilen belgeler ve `sales.review` listeleri — iade review'ları da bu listeye düşecek.

## M4 — Yerel ajan (dal `m4-ajan`, main üstünde)
Plan: docs/superpowers/plans/2026-09-28-cabukpos-m4-ajan.md · Kurulum/güvenlik: docs/AGENT.md
- [x] Saf çekirdek: `lib/core/escpos.ts` (PC857, sütun, kes, çekmece), `lib/core/receipt.ts` (fiş + gün sonu, 58/80 mm), `lib/agent/ticket.ts` (HMAC bilet), `agent/src/scale.ts`, `agent/src/queue.ts`
- [x] Ajan `agent/src/*` (yalnız Node yerleşikleri + acme-client): yazıcı (ağ/paylaşım/CUPS/dosya), terazi (TCP/seri), HTTP API (bilet, CORS, PNA), heartbeat, `pair/run/install/test-print`; esbuild → `public/indir/cabukpos-agent.cjs` (build'e zincirli)
- [x] Bulut: `agents` tablosu (RLS dışı kimlik), `/api/agent/{pair,heartbeat,dns}`, `/yonetim/donanim`, katalogda `agent {url, ticket}`, `audit` eşitleme belgesi (çekmece)
- [x] Kasa: otomatik fiş, nakitte çekmece, "Yazdırılamadı → Yeniden dene", ajan rozeti, müdür onaylı "Çekmece", "Teraziden al", gün sonu fiş yazıcısına
- [x] E2E `e2e/m4.mjs` → "M4 OK" (sahte TCP yazıcı + terazi, paketlenmiş ajan)

**M4 BİTTİ (2026-09-28)** yerelde: npm test 46/46, eslint + tsc temiz, build, E2E M1 + M2 + M3 + M4 OK.
Prod sırası: şema push (`agents` yeni tablo; RLS dışı ama `db-rls.mjs` GRANT'leri için yine şart) → `relrowsecurity` kontrolü → main.
Yiğit işleri: gerçek yazıcı/terazi denemesi (XPrinter dükkânda), cabukpos.com DNS'i Cloudflare'e + `CF_API_TOKEN`/`CF_ZONE_ID` (tablet/ikinci kasa için; tek PC'de gerekmez).
v1 sınırları: şube başına tek ajan; LAN WebSocket yayını M5'te (masa/mutfak); fiyat kodlu terazi etiketi gerçek teraziyle; termal etiket yazıcısı (`etiket` rolü tanımlanabilir, baskı akışı yok).

## M5 — Restoran salon (dal `m5-salon`, main üstünde)
Spec: docs/superpowers/specs/2026-09-28-cabukpos-m5-salon-design.md · Plan: docs/superpowers/plans/2026-09-28-cabukpos-m5-salon.md
- [x] Saf çekirdek: `lib/core/tab.ts` (adisyon olaylarını katlar, masa durumu), `options.ts`, `split.ts` (tümü/eşit/seç, indirim dağıtımı), `kitchen.ts` (mutfak fişi, bekleyen baskılar)
- [x] Şema: `areas`, `tables`, `option_groups`, `options`, `product_option_groups`, `stations`, `tab_events` (seq bigserial), `devices.role/stations`, `staff_role += garson`, `sales.tab_id/table_id`, `sale_lines.options/note/discount`; RLS + sequence izinleri
- [x] Eşitleme: `tab` belgesi (ikram/indirim/gönderilmiş iptal müdürsüzse review + audit), masadan satış → `paid` olayı (çift ödeme review), seçenekli fiyat kontrolü; SSE `/api/tabs/stream`
- [x] Yönetim: Salon, Seçenekler, İstasyonlar (kategori → istasyon), ürüne seçenek + istasyon, cihaz rolü, garson personeli
- [x] Kasa: Salon | Hızlı satış (masa yoksa doğrudan hızlı satış), adisyon, seçenek penceresi, taşı, ikram/indirim/iptal (müdür PIN), hesap bölme, "Masayı kapat" (tamamı ikram); garson tableti (vardiyasız, "Hesap iste"); mutfak ekranı (PIN'siz); mutfak yazıcısı kasadan (ajan), hazır sesi
- [x] E2E `e2e/m5.mjs` → "M5 OK"

**M5 BİTTİ (2026-09-28)** yerelde: npm test 62/62, eslint + tsc temiz, build, E2E M1–M5 OK (M2 bir koşuda PIN ekranı zaman aşımı, tekrarında OK).
Prod sırası: şema push → `db-rls.mjs` (yeni tablolar + **sequence izinleri**; yoksa tab_events yazılamaz) → `relrowsecurity` kontrolü (tab_events dahil) → main.
v1 sınırları: tahsilat yalnız kasa rolünde; kişi sayısı girişi yok; paket/kurye M6; ajan LAN aktarımı CF DNS'e bağlı (tablet mutfak yazıcısına kasa üzerinden basar).
E2E notu: aynı saatte çok koşu → yerel `delete from login_attempts` (signup/pair sınırı).

## M6 — Paket, kurye, online sipariş (dal `m6-online`, m5-salon üstünde)
Spec: docs/superpowers/specs/2026-09-28-cabukpos-m6-online-design.md · Plan: docs/superpowers/plans/2026-09-28-cabukpos-m6-online.md
- [x] Görev 1 çekirdek: `tab.ts` (masasız adisyon, kind, order/accept/reject/courier/out/delivered/handover/cancel, deliveryStatus, openDeliveries, tabLabel), `delivery.ts`, `platform.ts`, `online` ödeme (`SELECTABLE_METHODS`, `shownMethods`), `AnyLine` (serbest satır)
- [x] Görev 2 şema + eşitleme: enumlar, tab_events table_id/device_id null + platform kısmi benzersiz indeks, delivery_zones/customers/customer_addresses/platform_connections (RLS dışı)/product_platform_codes; applyTab/applySale M6 kuralları, `upsertCustomer`
- [x] Görev 3: `lib/platform` (types, mock HMAC, index, notify, ingest), webhook ucu, `GET /api/musteri`, katalog `deliveryZones`; `tests/delivery-db.test.ts`
- [x] Görev 4 yönetim: /yonetim/bolgeler, /musteriler, /platformlar (deneme siparişi), kurye personel/cihaz rolü
- [x] Görev 5 kasa: `DeliveryBoard` (sütunlar, kabul/red + tekrarlayan ses, kurye ata, Kuryeye verildi → `online` satış + handover, iptal müdür PIN), `NewDelivery` (telefon → /api/musteri → adres/bölge/niyet, tekrarla), KasaApp sekmeleri Salon | Paket | Hızlı satış, paket fişi kasa yazıcısından bir kez (localStorage), gel-al "Hesap"
- [x] Görev 6: `CourierScreen` (kurye cihazı yalnız kurye PIN'i, vardiya 0 ile kendiliğinden; toplu Yola çıktım, Teslim ettim → delivered + satış, üzerindeki nakit; Hesap kapat → kasiyer/müdür PIN → GunSonu), mutfak fişinde "PAKET" başlığı
- [x] Görev 7: `e2e/m6.mjs` → M6 OK (74/74 test; E2E M5 + M6 OK). Düzeltme: platform adisyonunun satışında fiyat/KDV kontrolü yok (fiyatı platform belirler), aksi halde eşlenen üründe review düşüyordu.
M6 KODDA BİTTİ (dal `m6-online`). Açık: E2E ajan/paket fişi baskısını sınamıyor (M4/M5 ajan testleri kapsıyor); `courierCash` kapanmış adisyonları useTabs'in tuttuğu sürece sayar.
Prod sırası (M5 ile birlikte): şema push → db-rls → relrowsecurity (yeni 4 tablo) → main.

## M7 — Stok, reçete, alış, tedarikçi, kârlılık (dal `m7-stok`, m6-online üstünde)
Spec: docs/superpowers/specs/2026-09-28-cabukpos-m7-stok-design.md · Plan: docs/superpowers/plans/2026-09-28-cabukpos-m7-stok.md
- [x] Görev 1 çekirdek: `recipe.ts` (consumption, lineCost, batchCost, productionMoves, isCritical, recipeError derinlik 1), `purchase.ts`, `profit.ts`; `stock.ts` birim adet|kg|lt + `stockUnitOf` (satılanda türden, satılmazda products.unit → veri göçü yok)
- [x] Görev 2 şema: stock_unit, products (sellable, unit, cost, cost_at, min_stock, yield_milli), stock_kind recete/uretim, stock_movements purchase_id/production_id, recipe_items (check tam biri dolu), suppliers, purchases, purchase_lines, supplier_payments, productions, sale_lines.cost; hepsi RLS listesinde
- [x] Görev 3 eşitleme: reçeteli satırda ürün değil hammaddeler düşer (`recete`, iade ters), seçenek reçeteleri eklenir; `sale_lines.cost` eşitlemede donar; katalog satılmazları göndermez
- [x] Görev 4 yönetim: ürün formu (Kasada satılır, birim, maliyet, kritik sınır, parti), liste Satılan | Hammadde; /yonetim/receteler (ürün, ara ürün, seçenek; anlık maliyet + KDV hariç marj), /yonetim/uretim
- [x] Görev 5: /yonetim/alislar (çok kalemli, iptal = ters hareket, maliyet gün bazında: eski tarihli fiş ezmez), /yonetim/tedarikciler (bakiye, döküm, ödeme); stok sayfası maliyet/değer/kritik rozeti/"Yalnız kritikler"; stok formunda alış kalktı (sayım + fire)
- [x] Görev 6: raporlarda kritik stok kartı + Kârlılık sekmesi (tarih aralığı, maliyeti eksik sütunu)
- [x] Görev 7: `e2e/m7.mjs` → M7 OK; regresyon E2E M3 (alış artık Alışlar'dan) + M6 OK; 88/88 test
M7 KODDA BİTTİ (dal `m7-stok`). Notlar: seçenek reçetesi yalnız adisyonda işler (hızlı satış ekranında seçenek yok — E2E masa M1 üzerinden); hammadde formunda KDV gizli → 1; ara ürün reçetesi parti miktarı olmadan kaydedilmez; seçenek adı değişirse (salon-actions ada göre eşler) reçetesi silinir.
Prod sırası (M5+M6+M7 birlikte): şema push → db-rls → relrowsecurity (M7'nin 6 yeni tablosu) → main.

## M8 — Mali belge: bilgi fişi + sahte e-Arşiv (dal `m8-mali`, main üstünde)
Spec: docs/superpowers/specs/2026-09-28-cabukpos-m8-mali-design.md · Plan: docs/superpowers/plans/2026-09-28-cabukpos-m8-mali.md
- [x] Görev 1 çekirdek: `lib/core/fiscal.ts` (VKN/TCKN algoritmaları, `docModeFor`, `formatNumber`, `nextRetryDue`, `buyerSchema`, `newFiscalToken`), `lib/fiscal/provider.ts` + `fake.ts`
- [x] Görev 2 şema: tenants tax_id/tax_office/address, `fiscal_settings`, `fiscal_documents` (+ plandan farklı: `last_try_at`, `cancel_pending`), RLS; `fiscal_doc_by_token` + `fiscal_pending_tenants` SECURITY DEFINER. FORCE RLS sahibi de bağladığı için sahibine `definer_read` (yalnız SELECT) politikası
- [x] Görev 3 sunucu: `lib/fiscal/issue.ts` (issueOne satır kilidi bekler → eşzamanlı ikinci çağrı numara yakmaz; hata → sayaç geri; retryable:false → attempts 5), iade → tam: iptal kuyruğu / kısmi: cancel_rejected / kesilmeden tam: cancelled; push sonrası `after(processDue)` (taze belge 15 sn kasaya bırakılır), `/api/fiscal/issue`, `/api/cron/fiscal` + vercel.json (günlük 03:00 UTC), Resend (anahtarsız atlar)
- [x] Görev 4 kasa: ödeme diyaloğunda "Fatura" (InvoiceForm), token satış anında istemcide, 3 sn bekle (eşitle + kes) → `setSaleFiscal`; fişte e-ARŞİV FATURA/no/ETTN/QR (`EscPos.qr`) ya da "e-postayla"/bağlantı; e-Arşivde çekmece fişi beklemez
- [x] Görev 5 yönetim: /yonetim/mali Ayarlar (vergi bilgisi, seri, kanal başına bölümlü düğme, hata simülasyonu) + Belgeler (süzgeç, sayaçlar, Yeniden dene, E-postayı gönder); gün sonunda "Kesilemeyen e-Arşiv" (kasada `/api/fiscal/shift`, yönetim raporunda sunucudan)
- [x] Görev 6: `/f/<token>` (noindex, IP başına dakikada 30, TEST/İPTAL bantları, yazdır; loading.tsx yok)
- [x] Görev 7: `e2e/m8.mjs` → M8 OK; regresyon M1 + M6 OK; 101/101 test. E2E'de kasa kanalı kullanıldı (paket kanalı modu DB testinde).
M8 KODDA BİTTİ. Açık: gerçek entegratör sürücüsü (anahtar gelince `lib/fiscal/<ad>.ts` + getProvider), iade faturası üretimi, ÖKC.
Prod sırası: şema push → db-rls → relrowsecurity + prosecdef kontrolü → Vercel env (`CRON_SECRET`, `APP_URL=https://cabukpos-app.vercel.app`, isteğe bağlı `RESEND_API_KEY`/`MAIL_FROM`) → main → canlı E2E M8 (`scripts/prod-push.sh 1..5`).

## Çalıştırma
- DB: yerel Postgres (`.env.local`: DATABASE_URL uygulama rolü, MIGRATE_DATABASE_URL sahip). Şema `npm run db:push`, RLS `npm run db:rls` (test DB: `db:push:test`, `db:rls:test`).
- E2E: `npm run build` → `node --env-file=.env.local node_modules/.bin/next start -p 3800` → `node --env-file=.env.local e2e/m1.mjs`. Kayıt sınırı IP başına saatte 5 (her koşu 2 kayıt); aşılırsa yerel DB'de `delete from login_attempts where key like 'signup:%'`.
- Kritik kapı (`npm run e2e:critical`) M9a/iade/M9b/M9c tarayıcılarına ayrılmış dokümantasyon IP'si gönderir; bu dört akış art arda çalıştırıldığında kayıt rate-limit'i birbirini etkilemez.
- Gün sonu kapanınca kasiyer oturumu düşer; cihazın son 15 dk içinde kapanan vardiyası /kasa/gun-sonu'da PIN'siz yazdırılabilir.

## M9a — Raporlar (2026-09-29)

Spec `docs/superpowers/specs/2026-09-29-cabukpos-m9a-rapor-design.md`, plan `docs/superpowers/plans/2026-09-29-cabukpos-m9a-rapor.md`. 115/115 test, E2E M9a + regresyon M1/M8 OK.
- Sekmeler: Özet (varsayılan), Yoğunluk, Ürünler, Personel, Vardiyalar, Kârlılık; ortak tarih çubuğu + CSV (`/yonetim/raporlar/csv`, BOM + `;`). Oturumsuz CSV → proxy `/giris`'e yönlendirir (307).
- Kasa: sepetten azaltma/silme ve Temizle → `register_event` → `register_events` (RLS). Satışla kapanan sepet olay değil. Adetli üründe "Sil" düğmesi yok; 1'den azaltmak satırı siler.
- Rapor = istek anında SQL (`lib/admin/report.ts`) + saf hesap (`lib/core/report.ts`). İade olayı iade fişinin kendi numarasıyla görünür.
- E2E art arda koşulursa kayıt sınırı (saatte 5/IP) dolar → yerelde `delete from login_attempts where key like 'signup:%'`.
- Prod: `scripts/prod-push.sh 1` (şema: register_events + sales_at_idx) → `2` (rls) → `3` (relrowsecurity: register_events t) → main → canlı E2E m9a.

## M9b — Abonelik (2026-09-29)

Spec `docs/superpowers/specs/2026-09-29-cabukpos-m9b-abonelik-design.md`, plan `docs/superpowers/plans/2026-09-29-cabukpos-m9b-abonelik.md`. 120/120 test, E2E M9b + regresyon M1/M9a OK.
- 14 gün deneme (`tenants.trial_ends_at`, mevcut işletmeler yayından 14 gün), durum tarihten türer: deneme/aktif → 7 gün ek süre → kilit. Kilit = yönetim server action'ları `requireWriter` ile Abonelik'e yönlenir; okuma açık; **kasa hiç kilitlenmez**.
- Ödeme: `BillingProvider`; v1 yalnız `fake` (`BILLING_PROVIDER=fake`, yalnız yerel). Canlıda env yok → "Online ödeme yakında". Gerçek sağlayıcı = yeni dosya + webhook route → `completePayment`.
- Fiyat env: `PLAN_PRICE_AYLIK`, `PLAN_PRICE_YILLIK` (kuruş, KDV dahil), `SALES_CONTACT`. Yerel .env.local'da TEST değerleri.
- Günlük cron `/api/cron/billing` (06:00 UTC): bitişe 1-7 gün kala sahiplere tek e-posta (Resend yoksa atlar).
- Prod: şema → db-rls (billing_payments izni) → kontrol → main → canlı E2E m9b (ödeme adımları atlanır).

## M9c — Ajans izinli okuma (2026-09-29)

Spec `docs/superpowers/specs/2026-09-29-cabukpos-m9c-ajans-okuma-design.md`, plan `docs/superpowers/plans/2026-09-29-cabukpos-m9c-ajans-okuma.md`. 130/130 test, E2E M9c + regresyon M9a OK.
- Yönetim → Entegrasyonlar: yalnız sahip `cpk_…` ajans anahtarı üretir (bir kez gösterilir, DB'de sha256) ve iptal eder. Oluşturma abonelik kilidinde kapalı, iptal her zaman açık.
- Uç `GET /api/v1/stats/daily?from&to` (Bearer, ≤92 gün, anahtar başına 60/dk): günlük sipariş/ciro/iade + kanal kırılımı (masa/paket/kasa). Kilitte de çalışır.
- Platform satışı ve iadesi hariç (ajans onu platform bağlantısından alır); iadenin kanalı asıl satıştan (`refund_of` join); adisyon parçaları aynı gün tek sipariş.
- `integration_keys` RLS dışı (devices gibi; anahtar kiracı bilinmeden aranır) → yalnız `lib/integrations/keys.ts`, her sorguda tenantId.
- `lib/ratelimit`: `next/headers` dinamik içe aktarılır (node testleri `hit()`i yükleyebilsin).
- Ajans tarafı: restoran-zirve `lib/platforms/cabukpos` (`orders.stats`), `CABUKPOS_API_URL` (varsayılan cabukpos-app.vercel.app).
- Yerel: şema değişince hem `db:push:test` hem `db:push` (yerel sunucu `cabukpos` DB'sini kullanır).
- Prod: `scripts/prod-push.sh 1` (şema) → `2` (rls, yeni tabloya GRANT) → `3` (integration_keys|f, sales|t, t) → `4` main → `5` canlı E2E m9c.

## LAN merkezi — internetsiz salon (2026-09-29)

Spec `docs/superpowers/specs/2026-09-29-cabukpos-lan-merkez-design.md`, plan `docs/superpowers/plans/2026-09-29-cabukpos-lan-merkez.md`. 135/135 test; E2E `lan` (2× üst üste) + regresyon M5, M4 OK.
- Ajan 0.5.0: `agent/src/tabs.ts` arabellek (bellek + `tabs.jsonl`, 24 saat, 20 000, lanSeq yalnız artar); `POST /tabs/events` (≤200), `GET /tabs/stream` (SSE; `?ticket=` YALNIZ bu yolda, `Last-Event-ID`, ajan sıfırlandıysa baştan). Ajan buluta olay yollamaz.
- Cihaz: `mergeLanEvents` yalnız yerelde olmayanı `seq: null` ekler (bulut seq'li kopya ezilmez), giden kutusuna girmez; yeni olay ajana da gider; bağlanınca seq'siz olaylar yeniden yollanır.
- Katalog: kasa `agent` (değişmedi); kasa DIŞI restoran cihazı yeni `lan` alanı (yalnız url+bilet, yazdırma yok) — ajan sertifikalıysa (https) ya da yerel geliştirmede (localhost). Canlıda sertifikasız → null → tablet bugünkü gibi yalnız bulut (Chrome yerel ağ izin penceresi de çıkmaz).
- Gösterge: `link` bulut|lan|yok; "Yerel ağ (internet yok)" yalnız lan'da ortak başlıkta + mutfak/kurye başlığında; mevcut "Canlı bağlantı yok" metni aynen.
- E2E notu: art arda koşuda eşleme sınırı dolar → yerelde `delete from login_attempts`. Bir koşuda garson sipariş penceresinde "Artır" tıklaması takıldı (sonraki 3 koşu temiz) — tekrarlarsa useTabs yeniden çizim sıklığına bak.
- Prod: şema değişikliği YOK → main + Vercel. Kasalar ajan 0.5.0'ı Donanım'dan yeniden indirmeli. Tablet LAN'ı: cabukpos.com DNS → Cloudflare + `CF_API_TOKEN`, `CF_ZONE_ID`.
- ⚠️ Chrome 142+ "Yerel ağ erişimi" (canlıda doğrulandı, Chrome 154): https canlı sayfadan `127.0.0.1` ajanına istek İZİN ister. Kasa PC'sinde Chrome ilk seferde "yerel ağdaki cihazlara erişim" penceresi açar → **İzin ver** denmeli (yoksa yazıcı/çekmece/terazi ve LAN sessizce çalışmaz). M4'ten beri var; canlı E2E ilk kez yakaladı. E2E'ler (m4, m5, lan) bağlama `local-network-access` izni verir.

## Tam bitirme (2026-09-29, dal `tam-bitirme`, lan-merkez üstünde)
- Donanım: Chrome "yerel ağ erişimi" izni kurulum adımı + üstte uyarı. Kasa rozeti: ajan erişilemez ve izin `denied` ise "Chrome yerel ağ izni kapalı" (başlıkta nasıl açılacağı).
- PayTR (`lib/billing/paytr.ts`): iFrame API. `BILLING_PROVIDER=paytr` + `PAYTR_MERCHANT_ID/KEY/SALT` (+ `PAYTR_TEST_MODE=1`) ile açılır; anahtar eksikse ödeme kapalı kalır. Akış: get-token → `/yonetim/abonelik/odeme/<id>` iframe → PayTR paneline Bildirim URL'si `https://<app>/api/billing/paytr` (imza doğrulanır, taksitsiz, `payment_amount` bizim tutarla aynı değilse başarısız) → `completePayment`. `merchant_oid` = tiresiz uuid. Kartla ödeme cep telefonu ister (formda). ok_url `?sonuc=isleniyor`. Canlıda henüz env YOK (şirket kurulunca).
- Raporlar → İncelenecek: `sales.review` + `tab_events.review` + reddedilen belgeler (push reddi artık `audit_log` `sync.red`, actor `device:<id>`). E2E m9a'ya adım eklendi.
- Uygulama simgeleri: `app/icon.png`, `app/apple-icon.png`, `app/favicon.ico`, `public/icons/{icon-192,icon-512,maskable-512}.png` (manifest'te).
- 138/138 test; E2E M9a (yeni adımla), M9b, M4 OK. Prod: şema yok → `prod-push.sh 4` → Vercel Ready → `5` (canlı m9a).
- Şifre sıfırlama: `/sifremi-unuttum` → e-posta (Resend; kapalıysa dürüst uyarı + SALES_CONTACT) → `/sifre-yenile?t=` (JWT aud `reset`, 1 saat, şifre özeti parmak izi → tek kullanımlık; tokenVersion++ diğer oturumları düşürür). DB değişikliği yok. E2E `e2e/sifre.mjs` (yalnız yerel: AUTH_SECRET'la bağlantı üretir).
- Yasal sayfalar `/yasal/{kullanim-kosullari,kvkk,mesafeli-satis,iade-iptal,iletisim}`; satıcı bilgisi env `LEGAL_NAME, LEGAL_ADDRESS, LEGAL_TAX_OFFICE, LEGAL_TAX_ID, LEGAL_MERSIS, LEGAL_EMAIL, LEGAL_PHONE, LEGAL_KEP` (boşsa "[şirket kuruluşunda eklenecek]" + üstte uyarı). Kayıt ve ödeme ekranında kabul metni, giriş/kayıt/ana sayfada alt bağlantılar. ⚠️ Metinler taslak: avukat/mali müşavir onayı; iade politikası (7 gün içinde, satış yoksa tam iade) Yiğit onayı bekler.

## İade tutanağı (2026-09-29, dal `iade-tutanak`, main üstünde)
- Spec `docs/superpowers/specs/2026-09-29-cabukpos-iade-tutanagi-design.md`, plan `docs/superpowers/plans/2026-09-29-cabukpos-iade-tutanagi.md`.
- e-Arşiv'li satışın **kısmi** iadesi (ya da önceden iadesi olan satışın iadesi): nihai tüketici/TCKN → kasada iade fişinin altında termal **İADE TUTANAĞI** (tutanak no = iade fiş no, asıl fatura no + ETTN + tarih, satıcı VKN, imza alanları); VKN'li alıcı → fişte "Alıcı iade faturası düzenleyecektir" notu. İçerik tek kaynak `lib/core/refundNote.ts`.
- Bulut: `fiscal_refunds` (RLS; `refund_sale_id` unique). `onRefund(tx, tenantId, refundOf, refundId)`: ilk iade + tam → iptal kuyruğu (değişmedi); aksi → kayıt (tutanak çözülmüş, `alici_faturasi` açık). Kısmi iade artık `cancel_rejected` ÜRETMEZ, fatura `issued` kalır. `cancelOne` reddi → aynı yedek kayıt. Mali'de `cancel_rejected` etiketi "İptal reddedildi".
- Kasa: `LookedUpSale.fiscal` (bulutta issued belge; yerelde kasadaki numara). Yerelde numara yoksa (`fiscalPending`) ve çevrimiçiyse bilgi buluttan sorulur. Katalogda `fiscal.sellerTaxId`.
- Yönetim: Raporlar → İncelenecek üstünde "Alıcının iade faturası bekleniyor (N)" + no/tarih formu (`resolveBuyerInvoice`); Mali → Belgeler satırında "İade tutanağı" / "Alıcı iade faturası …" bağlantısı → `/yonetim/mali/iade/<id>` A4 (yazdır).
- 147/147 test; E2E `e2e/iade.mjs` İADE OK, regresyon M8 + M3 OK.
- ⚠️ Tutanak metni taslak: mali müşavir onayı (Yiğit). Prod: `prod-push.sh 1..5` (şema → rls → kontrol → main → canlı E2E iade).

## #49 — Bahşiş, masa birleştirme, rezervasyonlar (2026-10-04)
- Bahşiş: `sales.tip` (toplamın içinde müşteri öder); satışta kasa PayDialog "Bahşiş" alanı, masada BillScreen→`onTabPay` zinciri; fişte "Bahşiş (dahil)" satırı. `applySale` toplam = satır toplamı + tip, payments farkı öder; bahşişsiz eski belge değişmez.
- Masa birleştirme: `merge` (satır kopyaları hedefe, idempotent) + `merge_away` (kaynak kapanır; satırsız kaynak dahil — `mergedAway` bayrağı). Kasada adisyon ekranında "Birleştir" (adaylar: açık, ödemesiz masa adisyonları, kendisi/ödenmiş hariç). Bulut iki olayı tek hedef belgesiyle yazar.
- Rezervasyonlar: `reservations` (RLS) + `/yonetim/rezervasyonlar` (gün çubuğu, ekle, Onayla/Geldi/Gelmedi/İptal), `lib/core/reservation.ts` (doğrulama + saat dönüşümü), `lib/admin/reservation-actions.ts`.
- E2E `e2e/m49.mjs` (npm run e2e:m49): rezervasyon onayı → garson iki masa → kasada birleştirme → bahşişli kart ödemesi → fiş → gün sonu. E2E m5 yeni salon kurulumuna uyarlandı (bölge "Masa" → M1-M4).
- 312/312 test. Prod: `prod-push.sh 1..5` (şema: reservations + sales.tip; rls: reservations).

## CSP düzeltmesi — canlıda ajan kırığı (2026-10-04)
- Güvenlik sertleştirmesindeki `connect-src 'self' https:` yerel ajana (http://127.0.0.1:port) izin vermiyordu → **canlıda yazıcı/çekmece/terazi ve LAN sessizce çalışmıyordu**. `http://127.0.0.1:* http://localhost:* http://[::1]:*` eklendi (`next.config.ts`). Prod'a gidince kasa sekmesi tazelenmeli.

## #8 kalanı — re-auth + cihaz jeton rotasyonu (2026-10-04)
- Yıkıcı iptaller (cihaz, ajan, ajans anahtarı) artık hesap şifresi ister: `RevokeForm` (istemci, useActionState) + üç aksiyon `(id, state, form)` imzasına geçti, `checkReauth` boş/hatalı şifrede iptal etmez. `verifyReauth` çekirdeğe ayrıldı.
- `cz_device` rotasyonu: `devices.prevTokenHash + tokenRotatedAt`; katalog çekiminde (`/api/sync/catalog`) 30 günde bir yeni jeton; eski jeton yeni yazılana dek geçerli (çoklu sekme/çakışma penceresi). Re-pair ve iptal önceki jetonu temizler. `next/headers` dinamik içe aktarılır (node testleri).
- Test: `tests/device-rotate.test.ts`. Prod: şema (devices 2 kolon) → `prod-push.sh 1`.

## #16 — çoklu para birimi (2026-10-04)
- `tenants.currency` (TRY|USD|EUR|GBP, varsayılan TRY) + Tercihler'de "Para birimi" paneli (sahip/müdür, `setTenantCurrency`) + Yönetim Bugün tüm para değerleri `formatMoney(k, currency)` ile (`moneyFormatter`).
- Kuruş tamsayıları dönüştürülmez; yalnız gösterim. Kasa fişi (ESCPOS) ve kasa ekranları hâlâ ₺ — ihtiyaç olursa ayrı iş. Test: `tests/currency-db.test.ts`. Prod: şema (tenants.currency) → `prod-push.sh 1`.

## E2E tazeleme (2026-10-04)
- `e2e/m5.mjs` yeni salon kurulum akışına uyarlandı (bölge adı "Masa" → masa adları M1-M4; tek düzeltmeyle koştu).
- Dikkat: yerel e2e'lerde eşleme limiti `pair:<ip>` 10/15dk, kayıt `signup:%` 5/saat → `delete from login_attempts`.

## ✅ ÇÖZÜLDÜ — m1 kapanış "askıda" (2026-10-04)
- `e2e/m1.mjs` gün sonu kapanışı (sayılan nakit girilip kapat) kasanın `closeShiftLocal` IndexedDB işleminin **rastgele bir noktasında sonsuza kadar askıda** (bazı koşuda satış okuması, bazında budama). Raw IndexedDB aynı anda sağlıklı (count ms=1); hata JS istisnası üretmez; sayfa donmaz. #48 (para kırılımı, `d5bb003`) ile KapanisForm değişti; m1 o tarihten beri koşulmuyordu — hata büyük olasılık #48 sonrası, benim değişikliklerimden bağımsız.
- **Kök neden**: #26'dan beri `closeShiftLocal` kapanışta `d.rejected` tablosunu (14 gün budama) yazıyordu ama işlem kapsamı `[meta, sales, outbox]` — kapsam dışı tablo erişimi tarayıcıda işlemi sessiz `NotFoundError` ile iptal ediyordu; ret `void onClose()` hattında yutulduğu için ekranda hiçbir şey olmuyor gibiydi. İzole repro: `tests/dexie-close.test.ts` (fake-indexeddb; Node'da NotFoundError deterministik çıkıyor).
- **Düzeltme**: kapsam `[meta, sales, outbox, rejected]`; `KapanisForm` ret artık `setError` ile gösteriyor (`void onClose().catch`). Ek önlem kaldı: `closeShiftGuarded` (kapanışta `pauseSync` + 8 sn zaman aşımında yeniden deneme). E2E m1 tam yeşil; test 315/315.

## Çözüldü — /f soft-404 (2026-10-04)
- #56'daki kök `app/loading.tsx` her sayfayı 200 streaming shell'ine çeviriyordu: `/f/<token>` notFound()'u shell'in İÇİNDE kalıyor, bilinmeyen token 200 dönüyordu (SEO soft-404; e2e m8 kırığı). Kaldırıldı — yönetim sayfalarının kendi iskeletleri (#56 madde 1) zaten var.
- /f doğrulaması yeni `layout.tsx`'e taşındı (shell basılmadan 404; gelecekte loading eklenirse de korunur); belge sorgusu `doc.ts`'te React `cache()` ile layout+sayfa arasında tek sorgu. Sınır (30/dk) yalnız gerçek belge görünümünü sayar; bilinmeyen token ucuz 404.
- `e2e/m9c.mjs` anahtar iptali artık şifreli re-auth (#8) ile: `key-row` içinde Şifreniz doldurulur.
- Tam critical set yeşil: m8, m9a, iade, m9b, m9c (+ m1, m5, m49). Test 315/315.

## Tam e2e maratonu + 2 bug daha (2026-10-04)
- TÜM e2e seti son build'de tek tek koşuldu: **m1 m2 m3 m4 m5 m6 m7 m8 m9a m9b m9c iade lan sifre — 14/14 OK**. Unit 315/315, tsc/eslint sıfır uyarı.
- **Bug: sabit ücretli teslimat bölgesi oluşturulamıyordu** (#52 sonrası): `saveZone` boş `perKm`'i ("boş = sabit") `null` sayıp hemen reddediyordu — boş meşru değer; yalnız dolu-çözümsüz girdi hata. `e2e/m6.mjs` bu yüzden hiç güncellenmemiş adımlarla koşuyordu; webhook URL (`?t=`) ve eşleme formu combobox'ı da yenilenendi.
- e2e m6/m7/lan yeni salon kurulum akışına uyarlandı (bölge "Masa"); lint'in 4 ölü uyarısı temizlendi.
- Prod push öncesi her şey yeşil: `prod-push.sh` (şema: reservations, sales.tip, tenants.currency, devices rotasyon kolonları → rls → kontrol → main → canlı e2e).

## #40 — Müşteriler sekmesi: RFM + kohort (2026-10-04)
- Raporlar'a "Müşteriler" sekmesi: RFM tablosu (R-F-M puanı + segment rozeti: Şampiyon/Sadık/Yeni/Büyüyen/Risk altında/Uyuyan/Kayıp; sabit eşikler), kohort gridi (ilk sipariş ayına göre aylık retention %), özet kartlar (kayıtlı, 30 gün aktif, 30 gün yeni, 30 gün müşteri cirosu), CSV.
- Veri yolu: paket sipariş olayının telefonu (`upsertCustomer` normalize'ü) → müşteri; `sales.tabId` bağlantısıyla adet/harcama/son sipariş; iadeler düşük, 365 gün pencere, ilk 500 harcamaya göre.
- Saf çekirdek `lib/core/rfm.ts` (puan/segment/grid/CSV — `rfmMonths` burada), DB `lib/admin/rfm.ts`, UI `components/reports/MusterilerTab.tsx`, CSV `reportCsv(..., tenantId, ...)` imzasına tenantId eklendi (arama rotası güncel).
- Test: `tests/rfm.test.ts` + `tests/rfm-db.test.ts` — **321/321**; e2e m9a + m8 yeşil. Şema değişikliği yok.

## #43 — Aylık konsolide rapor (2026-10-04)
- E-posta türü "aylik": geçen ayın 1'i–sonu (IST); cron ayın 1'i gönderir (`report_due_tenants` artık `monthly`/`last_monthly_at` dalı). İçerik: özet + ödemeler + kanallar + çok satanlar + personel top 5 + kritik stok + müşteri özeti (#40'tan).
- Yazdırılabilir sayfa `/yonetim/raporlar/konsolide?ay=YYYY-MM` (A4, Yazdır/PDF) — e-posta ile aynı saf içerik (`konsolideData` → `digestContent("aylik")`). Raporlar→Özet'te bağlantı + ReportMailCard'a "Aylık konsolide" onay kutusu.
- Şema: `report_settings.monthly + last_monthly_at` (db:push uygulandı, prod'da 1. adım). Test: `tests/konsolide.test.ts` — **323/323**; e2e m9a + m8 yeşil.

## #11 — Kartla otomatik yenileme (2026-10-04)
- `tenants.cardToken` (AES-256-GCM şifreli, `card-vault`; anahtar AUTH_SECRET'ten türetilir) + `cardMark` ("Visa •••• 4242" gösterimi; ham kart verisi tutulmaz).
- `BillingProvider.chargeStored?` — fake: her zaman ok (yerel); paytr: Direct API çekim (`PAYTR_DIRECT_URL`, varsayılan paytr.com/odeme/api/odeme; ⚠️ uç/env canlı hesapta doğrulanacak — insan işi).
- PayTR bildirimi `card_token` taşıyorsa (kart saklama) şifreli kaydedilir; Abonelik sayfasında kayıtlı kart gösterimi + silme.
- `renewDue`: vade ≤3 gün + kartı olan kiracı → aylik dönem için çekim → `completePayment` (başarılıysa dönem uzar; e-Arşiv faturası mevcut cron akışından çıkar). Başarısızsa 24 saat içinde tekrar denenmez; dunning aşamaları (gecikme/kilit) zaten devrede. Cron `/api/cron/billing` yanıtı `renew` alanı taşır.
- Test: `tests/renewal-db.test.ts` — **327/327**; e2e m9b yeşil. Şema: tenants 2 kolon (db:push ✓).

## UI/UX denetimi + koyu tema kök düzeltmesi (2026-10-05)
- İlk kez görsel denetim yapıldı (seed'li demo kiracı, 1440px + mobil 390px, açık/koyu): giriş, panel Bugün, raporlar (Müşteriler dahil), ürünler, abonelik, rezervasyon, platformlar, kasa satış/salon/ödeme.
- **Kök bug: `@theme inline`** — Tailwind v4'te inline token değerleri utility'lere gömülür; `html.dark` override'ları hiç etki etmezdi. #46 koyu teması doğuşundan beri içerik alanlarında çalışamıyordu (açık zemin + krem metin = okunmaz). Çözüm: renk token'ları `@theme`'e (var referanslı) taşındı, fontlar inline kaldı; koyu tema artık gerçekten uygulanıyor (/giris koyu doğrulandı).
- 36 dosyada sabit açık renkler token'lara çevrildi (`bg-white`→`bg-surface`, `bg/text-stone-*`→surface/ink/muted, `divide/border-stone-*`→line). Yazdırma/belge sayfaları (A4 /f, fatura, konsolide, etiket) bilinçli beyaz bırakıldı; `bg-white/10` (marka paneli) ve `bg-stone-900/40` (dialog perdesi) bilinçli.
- Görsel durum: panel/mobil/giriş/kasa/ödeme ekranları tasarım diline uygun (gruplu ikonlu menü, stat kartlar, kategori şeridi, ödeme diyaloğu hızlı nakit + bahşiş). Bilinen küçük notlar: girişte 2FA alanı herkesin formunda (isteğe çekilebilir), boş kohort tablosu başlığı sadeleşebilir — sonraki tasarım turu.
- 327/327 test; koyu tema probe ile token düzeyi + ekran düzeyi doğrulandı.

## Sertifika: tam e2e maratonu — son build'de 14/14 (2026-10-05)
- Koyu tema düzeltmesi (36 dosya) + #40/#43/#11 sonrası tam regresyon: **m1 m2 m3 m4 m5 m6 m7 m8 m9a m9b m9c iade lan sifre — hepsi OK** (son build, 327/327 unit).
- UI denetimi notları kapandı: girişte 2FA alanı katlanabilir ("İki adımlı doğrulama kodu (varsa)"); boş kohort tablosunda başlık gizlenir.

## 2FA e2e + kurulum butonu bug'ı (2026-10-05)
- **Gerçek bug**: `MfaAc`'ın "Kurulumu başlat" butonu `onClick` ile sahte FormEvent gönderiyordu → `FormData(e.currentTarget)` patlıyor → **2FA kurulumu UI'dan hiç başlamıyordu** (kimse e2e'lemediği için 3 gündür duruyordu). Gerçek `<form>`'a çevrildi.
- `e2e/mfa.mjs` (npm run e2e:mfa): kayıt → TOTP kur (kod e2e içinde RFC 6238 ile hesaplanır) → çıkış → yanlış kod reddi → doğru kodla giriş → şifreli re-auth ile kapatma. **MFA OK**.

## #4 e-posta doğrulama e2e'si (2026-10-05)
- `e2e/dogrula.mjs` (npm run e2e:dogrula): kayıt → panelde banner → yerelde imzalanmış bağlantı (/dogrula) → doğrulandı → banner kalkar → ikinci kullanım "Zaten doğrulanmış" → bozuk bağlantı başarısız sayfası. **DOGRULA OK**. Kasa koyu tema da görsel doğrulandı (salon ekranı).
- Auth yüzeylerinin tamamı artık e2e'li: giriş, şifre sıfırlama, 2FA, e-posta doğrulama.
