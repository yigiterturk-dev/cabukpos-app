# ÇabukPOS M6 — Paket, kurye ve online sipariş merkezi tasarımı

Onay: Yiğit, 2026-09-28. Ana spec: `restoran-zirve/docs/superpowers/specs/2026-09-28-cabukpos-pos-design.md` (§5 restoran, §6 online sipariş, §9 M6). Dal `m6-online`, `m5-salon` üstünde.

## Kararlar
- **Öncelik**: kendi paket siparişimiz + kurye tam çalışır. Platform tarafı: sipariş merkezi ekranı + `OrderSource` arayüzü + **sahte platform**. Gerçek YS/Trendyol Go adaptörleri entegratör onayı gelince aynı arayüze eklenir (YS Partner API'deki sipariş ucu yalnız rapor; kabul/red DH POS entegrasyonu ister).
- **Kurye**: personel rolü `kurye`, kendi telefonunda PWA (`/kurye`); konum takibi yok.
- **Telefon siparişi**: müşteri defteri (telefonla bul, adresler, son siparişler, "tekrarla") + teslimat bölgeleri (ücret, asgari tutar). Arayan numara tanıma yok (ileride ajanla).
- **Model**: paket ve platform siparişi **masasız adisyon** (`tab_events`); mutfak, istasyon, yazıcı, SSE, ikram/indirim, çevrimdışı eşitleme M5'ten aynen gelir.
- **Kurye hesabı = kurye cihazının vardiyası**; kapanış kurye telefonunda, kasiyer/müdür PIN'iyle (mevcut gün sonu). Yeni para hareketi tablosu, yeni belge türü yok; çevrimdışı çalışır.
- `packages/platforms` taşıması gerçek adaptörlere kaldı (ana spec §2'deki not buna göre okunur).

## 1. Veri modeli (hepsi kiracı + RLS)
- `tab_events.table_id` boş olabilir. `open` olayına `kind: masa | paket | platform` (yoksa `masa`).
- Yeni olaylar:
  - `order`: `customerId?`, `name`, `phone`, `address`, `directions?`, `zoneId?`, `note?`, `payIntent` (nakit|kart|yemek_karti|online), `promisedAt?`, `source?` {`platform`, `externalId`, `deadline?`, `raw`}. Adisyonda birden çok `order` olursa son geçerli (düzeltme).
  - `accept` {`prepMin`}, `reject` {`reason`} — yalnız platform siparişi.
  - `courier` {`staffId | null`} (ata / geri al), `out`, `delivered` {`method`}, `handover` (platform kuryesine verildi).
  - `cancel` {`reason`} — müdür PIN'i (`approvedBy`) + denetim kaydı; ödemesi olan adisyonda review.
- **Serbest satır**: `add.productId` ve satış satırında `productId` boş olabilir (ad + fiyat + KDV satırda). Yalnız paket/platform adisyonunda kabul; masa adisyonunda review. Paket ücreti = serbest satır "Paket servis ücreti" (KDV %10), tutarı bölgeden; kasiyer silebilir. Eşlenmeyen platform ürünü de serbest satır.
- Platform idempotensi: kısmi benzersiz indeks `(store_id, (payload->'source'->>'externalId')) where type = 'order' and payload ? 'source'`.
- Yeni tablolar:
  - `customers` (tenant, `phone` normalize E.164 benzeri, kiracıda benzersiz; ad; not; son sipariş zamanı)
  - `customer_addresses` (müşteri, etiket, adres, tarif, `zone_id?`, silindi)
  - `delivery_zones` (şube, ad, ücret kuruş, asgari tutar kuruş, sıra, aktif)
  - `platform_connections` (şube, platform, şifreli anahtarlar, `webhook_secret`, `auto_accept`, aktif; şube × platform benzersiz)
  - `product_platform_codes` (ürün, platform, dış kod; şube × platform × dış kod benzersiz)
- Enum ekleri: `staff_role += kurye`, `device_role += kurye`, `pay_method += online`.
- Sunucu kaynaklı olaylar (webhook): `tab_events.device_id` boş olabilir; `staff_id` boş.

## 2. Saf çekirdek
- `lib/core/tab.ts` genişler: `kind`, `order` bilgisi, paket durumu:
  `onay_bekliyor` (platform, accept yok) → `hazirlaniyor` → `hazir` (tüm fişler hazır) → `yolda` (`out`) → `teslim` (`delivered` / `handover` + ödendi); `reddedildi`, `iptal` uçları. Geri sayım `source.deadline`'dan.
- `lib/core/delivery.ts`: telefon normalize, bölge ücreti + asgari tutar kontrolü (uyarı, engel değil), paket fişi (ESC/POS: büyük "PAKET", müşteri, telefon, adres, tarif, satırlar, toplam, ödeme niyeti, not).
- `lib/core/platform.ts`: platform siparişini adisyon olaylarına çevirir (`open` + `order` + `add`'ler); dış kod eşlemesi, eşlenmeyen satır serbest satır (`productId = null`, ad + fiyat platformdan) ve uyarı.
- Kurye özeti: cihaz vardiyasındaki satışlardan yönteme göre toplam (mevcut gün sonu hesabı).

## 3. Akışlar
- **Telefon siparişi (kasa)**: Kasa sekmeleri Salon | Paket | Hızlı satış. "Yeni paket": telefon → müşteri + adresler + son 5 sipariş ("tekrarla" = aynı satırlar) ya da yeni müşteri → adres → bölge/ücret → ürün ekle (adisyon ekranı) → "Mutfağa gönder" = `send` + paket fişi (ajan yazıcısı). Müşteri arama çevrimiçi (`GET /api/musteri?tel=`); kayıt/güncelleme ayrı API değil: bulut `order` olayını yazarken müşteriyi telefonla bulur/oluşturur, yeni adres metnini ekler (çevrimdışı sipariş de eşitlenince kaydolur).
- **Paket panosu**: sütunlar Onay bekleyen · Hazırlanıyor · Hazır · Yolda · Bugün teslim; kart: saat, müşteri, bölge, tutar, ödeme niyeti, kurye, geçen süre. Kuryeye ata (açık vardiyası olan kuryeler), "Kuryeye verildi" (platform kuryesi), iptal.
- **Platform siparişi**: webhook → bulut adisyon olaylarını yazar (SSE ile kasaya düşer). Kasa: tekrarlayan ses + geri sayım, Kabul (hazırlık süresi 10/15/20/30/45) ya da Red (sebep listesi). `auto_accept` açıksa bulut `accept` + `send` yazar. Kabul/red platforma `OrderSource` ile bildirilir; hata → olay yine yazılır, `review` + yeniden deneme (kasa ekranında uyarı).
- **Kurye (`/kurye`, cihaz rolü kurye)**: PIN → cihazda vardiya açılır. Liste: yalnız kendisine atanan açık siparişler; adres, Google Maps bağlantısı, `tel:`, tahsil edilecek tutar, ödeme niyeti, not. Toplu "Yola çıktım" (`out`). "Teslim ettim" → yöntem seç (niyet önseçili) → kurye cihazında satış (`channel = paket`, `tabId`) + `paid` + `delivered`. Online ödemeli siparişte yöntem `online`, tahsilat yok.
- **Kurye hesabı (kurye telefonunda)**: "Hesap kapat" → vardiya özeti (sipariş sayısı, yönteme göre toplam, beklenen nakit) → kasiyer/müdür PIN'i + sayılan nakit → mevcut `shift_close` (Z, fark). Kasa panosunda kurye adı + üzerindeki nakit (teslim olaylarından) görünür.
- **Platform kuryesi**: kasada "Kuryeye verildi" → kasa cihazında satış (`channel = platform`, yöntem `online`) + `handover`.
- **Satış kanalı**: paket → `paket`, platform → `platform`; raporlar mevcut satış modelinden.

## 4. Platform katmanı
- `lib/platform/types.ts`: `OrderSource` = `parseWebhook(req, conn) → IncomingOrder[]`, `accept(conn, externalId, prepMin)`, `reject(conn, externalId, reason)`, `ready?(conn, externalId)`.
- `lib/platform/mock.ts`: sahte platform; webhook gövdesi HMAC-SHA256 (`webhook_secret`) imzalı; geri bildirimler bellekte/günlükte tutulur (E2E doğrular).
- `POST /api/platform/[platform]/webhook?c=<connectionId>`: imza doğrula → idempotent yaz → 200. Aynı `externalId` ikinci kez 200 + yazma yok.
- Yönetim → Platformlar: bağlantı ekle (bu turda yalnız "Deneme platformu"), otomatik kabul, webhook adresi + gizli anahtar, ürün kodu eşleme, "Deneme siparişi gönder".

## 5. Yönetim
Teslimat bölgeleri; Müşteriler (ara, düzenle, adresler, sipariş geçmişi); Platformlar; personel rolüne `kurye`; cihaz rolüne `kurye`.

## 6. Hata ve sınırlar
- Webhook imzası yanlış → 401; bilinmeyen bağlantı → 404; bozuk gövde → 400 (platform yeniden dener).
- Platform `deadline` geçmiş ve kabul yoksa kart "süre doldu" gösterir; red/iptal kararı kasiyerde.
- Kuryeye atanmış ama kurye vardiyası kapanmış sipariş: panoda uyarı, yeniden atanabilir.
- v1 dışı: arayan numara tanıma, canlı kurye konumu, restoranın kendi web sipariş sitesi, gerçek YS/TGO adaptörleri, platform menü eşitlemesi.

## 7. Test
- Birim: paket durum katlaması (tüm uçlar), bölge/asgari tutar, telefon normalize, platform → olay çevirisi (eşlenmeyen satır), paket fişi, webhook imzası + idempotens, kurye vardiya özeti.
- E2E `e2e/m6.mjs`: telefon siparişi → mutfak hazır → kurye atanır → kurye telefonunda yolda/teslim (nakit) → kasada kurye hesabı kapanır (fark 0); sahte platform webhook'u (iki kez, tek adisyon) → kabul → mutfak → "Kuryeye verildi" → `online` satış. Ardından M1–M5 E2E.
