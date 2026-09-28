# ÇabukPOS M6 — Paket, kurye, online sipariş merkezi

Spec: `docs/superpowers/specs/2026-09-28-cabukpos-m6-online-design.md`. Kabul: `e2e/m6.mjs` → "M6 OK"; M1–M5 E2E hâlâ geçer; `npm test`, eslint, tsc temiz.

Dal: `m6-online`, `m5-salon` üstünde (= 1e18fc8).

## Kararlar (spec'i somutlaştıran)
- **Masasız adisyon.** `TabEvent.tableId: string | null`, `TabDoc.tableId` nullable, `tab_events.table_id` nullable. `TabState` ekleri: `kind: "masa" | "paket" | "platform"` (`open.kind`, yoksa masa), `order: OrderInfo | null`, `delivery: { status, courierId, outAt, deliveredAt, method, acceptedAt, prepMin, rejected, cancelled }`. `openTabsByTable` masasızları atlar; paket panosu `openDeliveries(tabs)` kullanır.
- **Paket durumu** (`deliveryStatus(tab)`): `iptal` (cancel) | `reddedildi` (reject) | `onay_bekliyor` (platform, accept yok) | `teslim` (delivered/handover) | `yolda` (out) | `hazir` (en az bir fiş ve hepsi hazır/teslim) | `hazirlaniyor`. Kapanma: M5 kuralı + `delivered|handover` sonrası ödeme; `cancel`/`reject` adisyonu kapatır (ödemesiz).
- **Serbest satır.** `add.productId: string | null`; `saleLineDoc.productId` nullable; `CartLine.productId: string | null`. Bulut: masa adisyonunda serbest satır → review; satışta `productId` null satır, tab'ı paket/platform ise review'suz, değilse "serbest satır" review. Stok hareketi yalnız bilinen ürüne (mevcut).
- **Ödeme yöntemi `online`**: `PAY_METHODS`'a eklenir ama kasa `PayDialog` listesinde gösterilmez (`selectable: false`); yalnız paket/platform akışı kullanır. Gün sonu raporunda ayrı satır (nakde girmez).
- **Satış kanalı**: satış belgesinde `tab` varsa bulut `channel` = tab kind (masa|paket|platform). `sale.tab.tableId` nullable.
- **Müşteri**: `applyTab` `order` olayında `phone` normalize → `customers` upsert (kiracı + telefon benzersiz; ad güncellenir, `last_order_at`), adres metni yeniyse `customer_addresses`'e eklenir (bölgeyle). Olaydaki `customerId` yok sayılır; bulut bulduğu kimliği `order` olayına **yazmaz** (olay değişmez), `GET /api/musteri` telefonla çalışır.
- **`GET /api/musteri?tel=`** (cihaz çerezi): müşteri + adresler + son 5 paket siparişi (order olayı olan adisyonların `add` satırları: ad, ürün, fiyat, adet, seçenek, not). "Tekrarla" = bu satırlar yeni `lineId` ile.
- **Bölgeler katalogda**: `deliveryZones[{id,name,fee,minOrder}]` (restoran). Kurye listesi = katalog `staff` rolü `kurye`.
- **Kurye cihazı**: `device_role += kurye`. KasaApp'te kurye rolü → PIN (yalnız kurye personeli) → vardiya yoksa açılış nakdi 0 ile otomatik `shift_open` → `CourierScreen`. "Teslim ettim" = `recordSaleLocal` (tab: kind paket) + `delivered{method}` olayı. "Hesap kapat" = kasiyer/müdür PIN'i (`PinPad only`) → mevcut `GunSonu` (sayılan nakit) → `shift_close`.
- **Platform**: `lib/platform/types.ts` `OrderSource { id; parseWebhook(body: string, headers: Headers, conn): IncomingOrder[] | Error; accept(conn, externalId, prepMin): Promise<void>; reject(conn, externalId, reason): Promise<void> }`; `IncomingOrder { externalId, customer {name, phone}, address, directions, note, payIntent, deadline, lines[{code, name, unitPrice, qtyMilli, note}], raw }`. Sahte platform `mock`: HMAC-SHA256 hex `x-signature` (`webhook_secret`), accept/reject → `audit_log` (`platform.accept|reject`, detay externalId) — E2E buradan doğrular. Kimlik bilgisi yok (`credentials` boş).
- **Webhook yazımı** (`lib/platform/ingest.ts`): tek işlemde, `tab_events` için `device_id` null, `staff_id` null: `open{kind:"platform",guests:0}`, `order{…, source}`, eşlenen/eşlenmeyen `add`'ler; `auto_accept` → `accept{prepMin: 20}` + istasyona göre `send`'ler (+ `OrderSource.accept` işlem sonrası). Kısmi benzersiz indeks çakışırsa (aynı externalId) → hiçbir şey yazılmaz, 200.
- **Kabul/red geri bildirimi**: `applyTab` `accept|reject` platform adisyonunda işlem **sonrası** `OrderSource` çağrısı (`applyDoc` sonuç döndükten sonra, `after` kuyruğu yok; 5 sn zaman aşımı); hata → `tab_events.review` güncellenir ("platform bildirimi başarısız") + audit. Kasa kartında review uyarısı yok (v1: yönetim review listesinde görünür).
- **Yetki**: `cancel` müdür (NEEDS_MANAGER'a). `reject`, `accept`, `courier`, `out`, `handover` serbest; `delivered` yalnız atanmış kurye ya da müdür değilse review.
- **Fiş**: paket fişi `renderDeliverySlip` kasa yazıcısından (ajan `kasa` rolü yazıcı) "Mutfağa gönder" anında; platform siparişi kabulde kasada basılır (`printed` benzeri: `slip` olayı yok, kasa yerelde basılanları `localStorage` kimlik listesiyle izler — tekrar basmaz).

## Görevler

### 1. Saf çekirdek + test
- `lib/core/tab.ts`: `tableId` null, `open.kind`, yeni olaylar `order`, `accept`, `reject`, `courier`, `out`, `delivered`, `handover`, `cancel`; `add.productId` null; `TabState.kind/order/delivery`; `deliveryStatus`, `openDeliveries(tabs, now)` (açık + bugün teslim/iptal), `openTabsByTable` masasızları atlar; `tabLabel(tab, tables)` ("M3" | "Paket · Ayşe" | "Platform · #1234").
- `lib/core/delivery.ts`: `normalizePhone("0532 123 45 67") → "905321234567"` (10 hane → 90 öneki, 0 atılır, 11 hane 0'lı, 12 hane 90'lı; aksi null), `zoneCheck(zone, subtotal) → {fee, belowMin}`, `feeLine(fee) → add payload (serbest satır, KDV 10)`, `courierCash(tabs, courierId)` (teslim edilmiş, nakit yöntemli toplam), `renderDeliverySlip({...}) → Uint8Array`.
- `lib/core/platform.ts`: `toTabEvents(order: IncomingOrder, codes: Map<code, product>, stationOf) → TabEv[]` (open + order + add; eşlenmeyen serbest satır, `unmapped` sayısı), `verifySignature(secret, body, sig)`.
- `lib/core/payment.ts`: `online` (selectable false). `lib/core/cart.ts`: `productId` null.
- Testler: `tests/delivery.test.ts` (telefon biçimleri, bölge asgari/ücret, kurye nakdi, fiş baytı "PAKET" + adres), `tests/tab.test.ts`'e (paket durum zinciri, platform onay_bekliyor → kabul → hazır → handover + ödeme → kapalı; reject/cancel kapatır; openTabsByTable masasızı atlar), `tests/platform.test.ts` (eşleme + serbest satır, imza doğru/yanlış).

### 2. Şema + eşitleme (bulut)
- `db/schema.ts`: enumlar (`staff_role += kurye`, `device_role += kurye`, `pay_method += online`); `tab_events.table_id` + `device_id` nullable + kısmi benzersiz indeks; `customers`, `customer_addresses`, `delivery_zones`, `platform_connections`, `product_platform_codes`. `db/rls.sql` listesi.
- `lib/sync/docs.ts`: `tabEv` yeni türler, `tableId` nullable, `add.productId` nullable, `saleLineDoc.productId` nullable, `payMethod` online, `sale.tab.tableId` nullable.
- `lib/sync/apply.ts`: `applyTab` masasız (masa kontrolü yalnız tableId varsa), serbest satır kuralı, `order` → müşteri upsert, `cancel` müdür, `delivered` kurye kontrolü, accept/reject sonrası platform bildirimi; `applySale` kanal = tab kind, serbest satır review kuralı; `toTabEvent` null alanlar.
- `tests/tab-db.test.ts`'e: paket adisyonu masasız yazılır; order → müşteri + adres (ikinci siparişte aynı müşteri, yeni adres eklenir); serbest satır masa adisyonunda review, paket'te değil; paket satışı kanal `paket`, `online` ödeme; müdürsüz cancel → review.

### 3. Platform ucu + katalog + müşteri API
- `lib/platform/{types,mock,index,ingest}.ts`; `app/api/platform/[platform]/webhook/route.ts` (`?c=` bağlantı; bağlantı RLS'siz sahip bağlantısıyla bulunur → kiracı → `withTenant`).
- Katalog: `deliveryZones`; `device.role` kurye. `app/api/musteri/route.ts`.
- `tests/platform-db.test.ts`: imzalı webhook iki kez → tek adisyon; auto_accept → accept + send + audit `platform.accept`; yanlış imza 401; eşlenmeyen kod serbest satır.

### 4. Yönetim
- `/yonetim/bolgeler` (ad, ücret, asgari; sil/pasif), `/yonetim/musteriler` (telefon/ad arama, adresler, düzenle), `/yonetim/platformlar` (bağlantı: Deneme platformu, otomatik kabul, webhook adresi + gizli anahtar, ürün kodu eşleme tablosu, "Deneme siparişi gönder" → sunucu eylemi imzalı gövdeyi `ingest`'e verir).
- Personel formu `kurye`, cihaz formu `kurye`. Nav: restoran dikeyinde Bölgeler/Müşteriler/Platformlar. Eylemler `lib/admin/delivery-actions.ts`.

### 5. Kasa: paket panosu + yeni paket
- `components/kasa/DeliveryBoard.tsx`: sütunlar, kartlar (süre, müşteri, bölge, tutar, niyet, kurye, platform geri sayımı), kurye ata (`Select`), "Kuryeye verildi" (platform → `PayDialog`'suz `online` satış + `handover`), İptal (müdür PIN), platform Kabul (süre seç)/Red (sebep); yeni `onay_bekliyor` varken tekrarlayan ses.
- `components/kasa/NewDelivery.tsx`: telefon → `/api/musteri` (çevrimdışı → boş) → müşteri/adres seç ya da yeni → bölge → `open{kind:"paket"}` + `order` + ücret satırı → `TabScreen` (masasız mod: başlık `tabLabel`, "Taşı"/"Hesap iste" gizli; "Mutfağa gönder" + paket fişi). Asgari altı uyarı.
- KasaApp: kasa+restoran sekmeleri Salon | Paket | Hızlı satış; paket adisyonu hesap = kurye tahsil eder (kasada "Hesap" yalnız gel-al için: kurye atanmamış paket, `BillScreen`).

### 6. Kurye ekranı + mutfak etiketi
- `components/kasa/CourierScreen.tsx`: atanan siparişler (adres, `https://maps.google.com/?q=`, `tel:`, tutar, niyet, not), toplu "Yola çıktım", "Teslim ettim" (yöntem: nakit/kart/yemek kartı/online) → satış + delivered; "Hesap kapat" → PIN (kasiyer/müdür) → GunSonu.
- KitchenScreen + mutfak fişi: masa adı yerine `tabLabel`; mutfak fişinde paket için "PAKET".

### 7. E2E + belge
- `e2e/m6.mjs`: kayıt (restoran) → yönetim: bölge "Merkez" (ücret 15, asgari 100), istasyon "Mutfak" (sahte TCP yazıcı değil; ekran), ürün "Lahmacun" 60 TL (platform kodu `LAH`), kasiyer + kurye personeli, cihazlar kasa + kurye + mutfak, "Deneme platformu" (otomatik kabul kapalı) → kasa: Yeni paket, 0532…, adres, Merkez, Lahmacun ×2 → gönder → mutfak: hazır → kasa: kurye ata → kurye: yola çıktım, teslim nakit (135,00) → kurye: hesap kapat kasiyer PIN'i, sayılan 135,00 → fark 0 → `/api/musteri` aynı müşteriyi döner → webhook iki kez (LAH ×1 + bilinmeyen kod) → kasa: tek onay bekleyen kart → Kabul → audit `platform.accept` → mutfak hazır → "Kuryeye verildi" → `online` satış (kanal platform). Sonunda "M6 OK".
- `docs/PROGRESS.md` M6 bölümü.
