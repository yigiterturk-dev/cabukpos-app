# ÇabukPOS M5 — Restoran salon tasarımı

Onay: Yiğit, 2026-09-28. Ana spec: `restoran-zirve/docs/superpowers/specs/2026-09-28-cabukpos-pos-design.md` (§3–5, §9 M5).

## Kararlar
- **Kapsam**: masa planı, adisyon, seçenekler, mutfak ekranı + mutfak yazıcısı, hesap bölme, ikram/indirim/iptal. **Paket + kurye M6'ya** (online sipariş merkeziyle tek akış).
- **Canlı eşitleme**: bulut önce. Adisyon = değişmez olaylar; bulut saklar, cihazlar SSE ile dinler. Ajan üzerinden LAN aktarımı CF DNS kurulunca (olay biçimi aynı kalır).
- **Seçenekler**: seçenek grupları (en az/en çok, fiyat farkı; eksi olabilir → yarım porsiyon). Satırda serbest not ayrıca.
- **Mutfak**: istasyonlar; her istasyon mutfak ekranında + isteğe bağlı ajan yazıcısında.
- **Hesap bölme**: her parça ayrı satış belgesi (kendi fiş no'su; ileride kendi mali fişi).

## 1. Veri modeli (hepsi kiracı + RLS)
- `areas` (şube, ad, sıra), `tables` (bölge, ad, sıra, aktif)
- `option_groups` (ad, min, max), `options` (grup, ad, fiyat farkı kuruş ±, sıra), `product_option_groups` (ürün × grup, sıra)
- `stations` (şube, ad, yazıcı rolü adı — ajandaki yazıcı, boşsa yalnız ekran). `categories.station_id`, `products.station_id` (ürün kategoriyi ezer).
- `devices.role` enum kasa|garson|mutfak (varsayılan kasa); `devices.stations` uuid[] (mutfak ekranı filtresi, boş = tümü).
- `tab_events`: id (istemci uuid), tenant, store, `seq` bigserial (sunucu sırası), tab_id, table_id, device_id, staff_id, approved_by?, at, type, payload jsonb.
  Türler: `open` (kişi sayısı), `add` (satır: lineId, ürün, ad, birim fiyat seçenekler dahil, KDV, adet, seçenekler, not), `void` (lineId, gerekçe; gönderilmişse müdür onayı), `send` (ticketId, lineId'ler, istasyon), `move` (yeni masa), `comp` (lineId, gerekçe, onay), `discount` (tab düzeyi, yüzde ya da kuruş, onay), `kitchen` (ticketId, durum hazırlanıyor|hazır), `printed` (ticketId), `paid` (satış id, lineId → ödenen adet milli).
- Satış belgesi (`sale`) ek alanlar: `tabId?`, `tableId?` (varsa kanal `masa`); satırda `options?[]`, `note?`, `discount?` (kuruş, satır toplamından düşülür; KDV net tutardan).

## 2. Saf çekirdek
- `lib/core/tab.ts`: olayları seq/zaman sırasıyla katlar → masa başına açık adisyon: satırlar (gönderildi mi, iptal, ikram, ödenen adet), indirim, toplam, kalan, mutfak fişleri ve durumları, masa durumu (boş|dolu|hazır-bekliyor|uzun-açık). Kalan 0 ve en az bir ödeme varsa adisyon kapalı. İstemci ve sunucu aynı kod.
- `lib/core/options.ts`: seçim doğrulama (min/max), birim fiyat = ürün + farklar (0'ın altına düşmez).
- `lib/core/split.ts`: eşit N (kuruş artığı ilk parçalara), ürün seçerek, adetten parça (milli adet). Tab indirimi parçalara oransal dağıtılır.
- `lib/core/kitchen.ts`: gönderilen satırları istasyona ayırır; ESC/POS mutfak fişi (büyük masa adı, adet × ad, seçenekler, not, garson, saat).

## 3. Eşitleme
- Olaylar mevcut giden kutusundan `tab_event` belgesi olarak `/api/sync/push`'a gider; aynı kimlik ikinci kez yazılmaz. Bulut reddetmez; tutarsızlık (bilinmeyen satır, kapalı adisyona ekleme) işlenir ama `review` işaretlenir.
- `GET /api/tabs/stream` (SSE, cihaz jetonu): `Last-Event-ID` = seq; sunucu saniyede bir yeni olaylara bakar, ~240 s sonra kapatır, istemci yeniden bağlanır. İlk bağlantıda açık adisyonların tüm olayları (+ son 15 dk kapananlar) gelir.
- İstemci: Dexie'de `tabEvents` (sunucudan gelen + kendi bekleyenleri); durum = fold. İnternet yokken cihaz kendi olaylarıyla çalışır.
- Çakışma: satır eklemeler birleşir (her satır kimlikli). Zaten ödenmiş satıra ikinci ödeme gelirse satış yine kaydedilir, `review`.

## 4. Mutfak yazıcısı
Yazıcı sorumlusu = ajanı gören kasa cihazı. Akıştan gelen, yazıcılı istasyona ait, `printed` olayı olmayan fişi basar ve `printed` yazar. Kasanın kendi gönderdiği fiş aynı yoldan (yerel olay) hemen basılır → çevrimdışında da çalışır.

## 5. Ekranlar
- **Salon** (kasa + garson rolleri; restoran dikeyinde kasa açılış ekranı): bölge sekmeli masa planı, renkler boş/dolu/hazır-bekliyor/uzun-açık (>90 dk).
- **Adisyon**: ürün ızgarası → seçenek penceresi → satır; not; kişi sayısı; "Mutfağa gönder"; masa taşı; ikram / indirim / gönderilmiş satırı iptal (kasiyer ya da garsonsa müdür PIN'i + gerekçe → denetim); "Hesap".
- **Hesap**: tümü / eşit N / ürün seç → her parça mevcut ödeme akışı → ayrı `sale` + `paid` olayı + fiş.
- **Mutfak** (mutfak rolü): istasyon kartları, geçen süre, dokun → hazırlanıyor → hazır; garson ekranında hazır rozeti + ses.
- **Yönetim**: `/yonetim/salon` (bölge, masa), `/yonetim/secenekler`, `/yonetim/istasyonlar`; ürün formunda seçenek grupları + istasyon; kategoride istasyon; cihazda rol + istasyon filtresi.
- Katalog: bölgeler, masalar, seçenek grupları, istasyonlar, cihaz rolü.

## 6. Test
- Birim: tab fold, options, split, kitchen.
- `e2e/m5.mjs` (üç cihaz): garson masa açar, seçenekli ürün ekler, gönderir → mutfak cihazı akıştan görür, hazır yapar → garson hazır rozeti → sahte TCP yazıcıya mutfak fişi bir kez düşer → kasa 2 eşit böler → 2 satış, masa kapanır → gün sonu iki satışı içerir.

## Kapsam dışı
Paket/kurye (M6), masa birleştirme, rezervasyon, reçete düşümü (M7), ajan LAN aktarımı (CF DNS), satış sonrası seçenek raporu (M9).
