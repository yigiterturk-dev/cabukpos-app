# İlerleme — ÇabukPOS

## Büyüme Merkezi / M9d (2026-10-01)
- Tenant içi ve yalnız restoran dikeyinde feature-pack, baseline/Laya advisor, kampanya taslağı, kampanya listesi/durumu ve idempotent ölçüm olayları tamamlandı.
- İletişim izni değişimleri audit edilir; kampanya hedefi yalnız açık izinli müşterilerden hesaplanır; ham müşteri PII'si harici API'ye çıkmaz.
- Harici servis erişimi growth kapsamlı anahtarla, dakikada 60 istekle sınırlıdır. Sağlayıcı webhook'u Bearer + timestamp/HMAC imzası, 5 dakika replay penceresi ve 64 KB gövde sınırı kullanır.
- İzinli kampanya hedefleri sayfalı audience endpoint'inden yalnız growth anahtarıyla türetilmiş hmac-sha256 recipientRef olarak okunur; telefon, ad ve müşteri UUID'si dışarı çıkmaz.
- API sözleşmesi docs/growth-api.openapi.yaml; operasyon/kullanım sınırları docs/GROWTH-API.md ve docs/GROWTH-SERVICE.md.
- Kanıt: 162/162 test, lint/typecheck, production build, webhook imza testleri, DB tenant/idempotency/audience testleri ve runtime audit'te 16 anonim/korumalı kontrol tanımı.
- Açık canlı kapılar: gerçek deployment doğrulaması, provider sandbox teslimat/opt-out provası, backup-restore provası ve hukuki/mali müşavir onayı. Bunlar repo testiyle kanıtlanmış sayılmaz.
- Canlı alias kontrolü (2026-10-01): health/ready 200 ve mevcut korumalı uçlar geçiyor; Growth feature-pack, insights, campaign, audience, event ve signed webhook uçları 404. Branch deploy edilmediği için canlı alias eski deployment'ı gösteriyor; Growth canlı kabulü yapılmadı.

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
