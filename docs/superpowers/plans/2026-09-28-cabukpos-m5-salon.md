# ÇabukPOS M5 — Restoran salon

Spec: `docs/superpowers/specs/2026-09-28-cabukpos-m5-salon-design.md`. Kabul: `e2e/m5.mjs` → "M5 OK" (garson + mutfak + kasa, sahte TCP mutfak yazıcısı); M1–M4 E2E hâlâ geçer; `npm test`, eslint, tsc temiz.

Dal: `m5-salon`, main'den (= 55dc09a).

## Kararlar (spec'i somutlaştıran)
- **Roller.** `staff_role += garson`. `devices.role` (kasa|garson|mutfak, varsayılan kasa) + `devices.stations uuid[]`. Mutfak cihazı PIN istemez, doğrudan mutfak ekranı. Garson PIN'le girer, vardiya istemez; masa açar, sipariş alır, gönderir, "Hesap iste" der. **Tahsilat yalnız kasa rolünde** (vardiya + fiş sayacı kasada). Restoran dikeyinde kasa rolünün ana ekranı Salon'dur; "Hızlı satış" sekmesi mevcut `SaleScreen` (masasız).
- **Adisyon olayı = eşitleme belgesi `tab`.** `{kind:"tab", id, tabId, tableId, at, staffId|null, approvedBy|null, ev}`; `ev` türe göre ayrışan birleşim: `open{guests}`, `add{lineId, productId, name, unitPrice, vatRate, qtyMilli, options[{id,name,delta}], note, stationId|null}`, `void{lineId, reason}`, `send{ticketId, lineIds, stationId|null}`, `move{toTableId}`, `comp{lineId, reason}`, `discount{percent|null, amount|null, reason}`, `bill{}`, `kitchen{ticketId, status: hazirlaniyor|hazir|teslim}`, `printed{ticketId}`. `paid` olayı ayrı belge değildir: masadan satış belgesi `tabId` + `paidLines[{lineId, qtyMilli}]` taşır; bulut o satışı yazarken aynı kimlikle `tab_events` satırı (`paid`) ekler, istemci de yerelde ekler.
- **Satış belgesi ekleri.** `sale.tabId?`, `tableId?`, `paidLines?`; satırda `options?`, `note?`, `discount?` (kuruş). `CartLine.discount?` → `lineTotal = round(birim×adet) − discount` (bulut `write()` da `lineTotal` kullanır). Fiyat kontrolü: beklenen = ürün fiyatı + seçenek farkları (DB'den), fark → review.
- **Fold (`lib/core/tab.ts`).** Girdi: sunucu olayları (seq sırası) + yerel bekleyenler (at sırası). Çıktı: `TabState {id, tableId, openedAt, guests, lines[{…, sent, voided, comped, paidMilli}], discount, tickets[{id, stationId, lineIds, at, status, printed}], billRequested, total, paid, remaining, closed}`. Kapalı = en az bir satır ve kalan 0 (ya da tüm satırlar iptal). Bilinmeyen satıra olay → yok sayılır. Masa durumu: `bos | dolu | hazir | uzun` (hazır bilet varsa `hazir`, açık > 90 dk `uzun`). Aynı masada iki açık adisyon (çevrimdışı çakışma) → ikisi de listelenir.
- **Bölme (`lib/core/split.ts`).** Ödenecek birimler = kalan satırlar (iptal/ikram hariç; ikram 0 TL satır olarak ilk parçaya). `splitEqual(units, n)` → n parça; satır tutarları değil **tutar** bölünür: her parça kalan satırlardan oransal `qtyMilli` alır (milli yuvarlama, son parça artığı alır), kuruş sapması son parçada. `splitPick(lines, picked)` seçilen satır/adetler. Tab indirimi parçaya satır `discount`'u olarak oransal dağıtılır (artık son satıra).
- **SSE `GET /api/tabs/stream`.** Cihaz çerezi; `Last-Event-ID` (seq) ya da `?after=`. İlk bağlantı (after yok): son 24 saatte olayı olan adisyonların tüm olayları. Sunucu 1 sn'de bir `seq > after` sorgular (şube filtresi), 15 sn'de bir `: ping`, 240 sn'de kapatır (`maxDuration=300`); istemci `EventSource` kendiliğinden yeniden bağlanır.
- **Mutfak yazıcısı.** `stations.printer` = ajan yazıcı kimliği (ya da boş). Yazıcı sorumlusu: kasa rolü + `meta.agent` olan cihaz; fold'daki `printed=false`, yazıcılı istasyon, 30 dk'dan yeni biletleri sırayla basar → `printed` olayı. Basılamazsa 30 sn sonra tekrar.
- **Yetki.** İkram, indirim, gönderilmiş satır iptali: personel müdür değilse müdür PIN'i → `approvedBy`; bulut müdür değilse `review` işaretler (reddetmez) ve `audit_log`'a yazar. Gönderilmemiş satır iptali serbest.
- **RLS.** Yeni tablolar listeye; `bigserial` için `grant usage, select on all sequences` + default privileges.

## Görevler

### 1. Saf çekirdek + test
- `lib/core/cart.ts`: `CartLine.discount?`, `lineTotal` indirimi düşer (0'ın altına inmez).
- `lib/core/options.ts`: `validateOptions(groups, picked) → {ok, unitPrice, options} | {ok:false, error}` (min/max, bilinmeyen seçenek, birim fiyat ≥ 0).
- `lib/core/tab.ts`: `TabEvent` tipi (docs'taki `ev` + zarf), `foldTabs(events) → Map<tabId, TabState>`, `tableStatus(tabs, now)`, `openTabsByTable`.
- `lib/core/split.ts`: `payableLines(tab)`, `splitEqual`, `splitPick`, `withTabDiscount`.
- `lib/core/kitchen.ts`: `renderKitchenTicket({tableName, staffName, at, lines[{qtyMilli,name,options,note}], stationName, width, codepage}) → Uint8Array` (EscPos; masa adı çift boy).
- Testler: `tests/tab.test.ts` (ekle/gönder/iptal/ikram/indirim/taşı/ödeme → kalan, kapanma, çift adisyon, bilinmeyen satır), `tests/split.test.ts` (3'e eşit 100,00 → 33,34/33,33/33,33 toplamı tutar; adet bölme; indirim dağıtımı toplamı korur), `tests/kitchen.test.ts` (bayt `ESC @` + `GS V`, seçenek/not satırları, 58 mm ≤ 32), `tests/cart.test.ts`'e indirim.

### 2. Şema + eşitleme (bulut)
- `db/schema.ts`: `staffRole += garson`, `deviceRole` enum, `devices.role/stations`; `areas`, `tables`, `option_groups`, `options`, `product_option_groups`, `stations`; `categories.station_id`, `products.station_id`; `sales.tab_id/table_id`; `sale_lines.options jsonb, note, discount`; `tab_events {id uuid pk, tenant, store, seq bigserial unique, tab_id, table_id, device_id, staff_id?, approved_by?, at, type, payload jsonb, review}` + index (store, seq), (tab_id).
- `db/rls.sql`: yeni tablolar + sequence izinleri.
- `lib/sync/docs.ts`: `tab` belgesi, sale ekleri. `lib/sync/apply.ts`: `applyTab` (idempotent; masa/ürün kiracıda mı; yetki kontrolü → review + audit), sale: seçenekli fiyat kontrolü, `lineTotal`, satır ekleri, `tabId` varsa `paid` olayı.
- `tests/tab-db.test.ts`: aynı olay iki kez → tek satır; başka kiracının masası → red; garson ikramı müdürsüz → review + audit; masadan satış → `paid` olayı + sale_lines options/discount; seq artar; RLS (başka kiracı göremez).

### 3. Katalog + akış
- Katalog: `areas`, `tables`, `stations`, `optionGroups[{id,name,min,max,options}]`, ürün `optionGroupIds`, `stationId` (ürün ?? kategori); `device.role`, `device.stations`. `lib/offline/state.ts` tipleri + `emptyMeta`.
- `app/api/tabs/stream/route.ts` + `lib/tabs/stream.ts` (`eventsAfter(ctx, after)`, `initialEvents(ctx)`).
- `tests/catalog.test.ts`'e salon alanları; `tests/tab-db.test.ts`'e `eventsAfter`/`initialEvents`.

### 4. Yönetim
- `/yonetim/salon`: bölge ekle/sil/yeniden adlandır, masa ekle (toplu "M1–M12"), sil. `/yonetim/secenekler`: grup (ad, en az, en çok) + seçenekler (ad, fark TL). `/yonetim/istasyonlar`: istasyon (ad, ajan yazıcısı `Select` — donanımdaki mutfak rollü yazıcılar).
- Ürün formu: seçenek grupları (çoklu onay kutusu) + istasyon; kategori formunda istasyon. Cihaz formu: rol + (mutfaksa) istasyonlar. Personel formu: garson rolü. Nav: yalnız restoran dikeyinde Salon/Seçenekler/İstasyonlar.
- Sunucu eylemleri `lib/admin/salon.ts` (zod + `withTenant` + audit), mevcut `useFormAction` deseni.

### 5. İstemci adisyon katmanı
- Dexie v3: `tabEvents: "id, seq, tabId, at"`. `lib/offline/tabs.ts`: `addTabEvent(ev)` (yerel kayıt + giden kutusu, tek işlem), `allTabEvents()`, `mergeServerEvents(evs)`, `createTabStream(onChange)` (EventSource `/api/tabs/stream?after=<max seq>`; hata → tarayıcı yeniden bağlanır; 24 saatten eski kapalı adisyon olaylarını temizler).
- `recordSaleLocal` ekleri: `tab?: {tabId, tableId, paidLines}` → satış belgesi + yerel `paid` olayı aynı işlemde.
- `useTabs()` kancası: olaylar → `foldTabs`.

### 6. Kasa/garson ekranları
- `components/kasa/SalonScreen.tsx`: bölge sekmeleri, masa kartları (durum rengi, toplam, süre, hazır rozeti + ses).
- `components/kasa/TabScreen.tsx`: sol ürün ızgarası (kategori), `OptionsDialog`; sağ adisyon (gönderilmiş/gönderilmemiş, not, adet), "Mutfağa gönder", "Taşı", "İkram", "İndirim", "İptal" (gerekçe + `ApprovalDialog` müdür PIN), "Hesap iste"; kasa rolünde "Hesap" → `BillScreen`.
- `components/kasa/BillScreen.tsx`: tümü / eşit N / seç → parça → mevcut `PayDialog` (SaleScreen'den dışa aktarılır) → `recordSaleLocal(..., tab)` → fiş; sonraki parça; bitince salon.
- `KasaApp`: rol yönlendirme (mutfak → `KitchenScreen`, garson → vardiyasız salon, kasa+restoran → Salon | Hızlı satış sekmesi).

### 7. Mutfak ekranı + yazıcı sorumlusu
- `components/kasa/KitchenScreen.tsx`: istasyon filtresi (cihazdan), kartlar (masa, süre, satırlar, seçenek/not), dokun → `hazirlaniyor` → `hazir`; hazırlar ayrı sütunda 10 dk görünür.
- `lib/offline/kitchenPrinter.ts`: `pendingPrints(tabs, stations, now)` (saf, test `tests/tab.test.ts`'e) + KasaApp'te döngü.
- Garson/kasa: `hazir` bilet → masa kartında rozet; adisyonda "Teslim edildi" → `teslim`.

### 8. E2E + belge
- `e2e/m5.mjs`: kayıt (restoran) → yönetim: bölge "Salon" + M1–M4, istasyon "Izgara" (sahte TCP yazıcı ajanla), seçenek grubu "Pişirme" (zorunlu tek), ürün "Köfte" (Izgara, Pişirme), garson + kasiyer personeli, üç cihaz (kasa, garson, mutfak) → ajan eşle → garson: M1 aç, Köfte ×2 "Az pişmiş" + not, gönder → mutfak: bilet görünür, hazır → garson: hazır rozeti → yazıcıya tek mutfak fişi ("M1", "Az pişmiş") → kasa: M1 hesap, 2'ye eşit, iki nakit ödeme → iki fiş, masa boş → gün sonu 2 satış. Sonunda "M5 OK".
- `docs/PROGRESS.md` M5 bölümü; `README`/AGENT gerekmez.
