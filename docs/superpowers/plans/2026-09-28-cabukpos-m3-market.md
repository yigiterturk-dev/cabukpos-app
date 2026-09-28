# ÇabukPOS M3 — Market

Spec §5 (Market) + §9 (M3): barkod, tartılı barkod, iade, stok hareketleri, sayım, raf etiketi. Kabul: E2E market kasası (`e2e/m3.mjs` → "M3 OK"), M1 + M2 E2E hâlâ geçer.

Dal: `m3-market`, `m2-cevrimdisi`'nden açılır (M2 henüz main'de değil; M2 prod onayı gelince ikisi sırayla birleşir).

## Kararlar
- **Tartılı ürün.** `products.kind = adet | tartili`. Tartılıda `price` = kg fiyatı, sepette `qtyMilli` = gram (mevcut `lineTotal` değişmeden doğru hesaplar). Tartılı satırda +/− yok; miktar "0,750 kg" gösterilir, satır silinebilir.
- **Terazi etiketi (EAN-13).** Önek 27/28/29 + 5 hane PLU + 5 hane gram + kontrol hanesi. Kontrol hanesi yanlışsa normal barkod gibi aranır. v1 yalnız **ağırlık** kodlu etiket; fiyat kodlu etiket (kuruş yuvarlaması satır toplamını etiketten 1-2 kuruş saptırır) gerçek terazi görülünce M4'te. `products.plu` 5 hane, kiracıda tekil, isteğe bağlı.
- **Elle tartım.** Etiketsiz tartılı ürüne dokununca/okutunca "Ağırlık (kg)" diyaloğu. Teraziden okuma M4 (ajan).
- **Çarpan.** Arama kutusuna `5*<barkod>` → 5 adet. Tartılıda çarpan hata verir.
- **Hızlı tuşlar.** `products.quick`. Market dikeyinde ürün ızgarası yalnız hızlı tuşları gösterir (binlerce ürün); arama her zaman tüm katalogda, en çok 60 sonuç. Restoranda davranış aynı kalır. Barkod/PLU araması `Map` dizininden (O(1)).
- **İade = fiş no ile, ayrı belge.** Yeni belge türü `refund`: `{id, shiftId, staffId, approvedBy, refundOf, receiptSeq, at, lines, payments}`. Aynı cihaz fiş sayacından numara alır, fişte "İADE" yazar. `sales` satırı olarak saklanır: `status = 'iade'`, `refund_of uuid` (FK yok: asıl satış başka cihazdan henüz eşitlenmemiş olabilir), `approved_by`.
  - Bulma: önce yerel satışlar; yoksa ve çevrimiçiyse `GET /api/sync/sale?no=<fiş no>` (kiracı geneli, satır başına iade edilebilir miktar = satılan − önceki iadeler). Çevrimdışı + yerelde yok → "İnternet gelince tekrar deneyin".
  - Onay: kasiyer rolündeyse **müdür PIN'i** istenir (hash'ler cihazda, çevrimdışı doğrulanır; aynı 5 yanlış kilidi).
  - Geri ödeme tek yöntem (nakit | kart | yemek kartı), tutar = iade toplamı, para üstü yok.
  - Bulut reddetmez: asıl satış bulunamadı, satılandan fazla iade, ödeme ≠ toplam → kaydet + `sales.review`.
- **Stok = hareketler.** `stock_movements {id, tenant_id, store_id, product_id, kind: satis|iade|alis|sayim|fire, qty_milli, at, sale_id?, actor, note?}`. Satış/iade hareketleri eşitlemede, yalnız `products.track_stock` açık ürünlere yazılır (satış negatif, iade pozitif). Sayım hareketi **mutlak** değer taşır: stok = son sayımın değeri + sayım anından (`at`) sonraki hareketlerin toplamı. Böylece sayımdan önce yapılıp sonra eşitlenen çevrimdışı satışlar stoğu iki kez düşmez. Eksi stok serbest, kırmızı gösterilir. Maliyet/alış fiyatı M7.
- **Şube.** Yönetim M1'deki gibi ilk şubeyi kullanır (`lib/admin` deseni); hareketler yine de `store_id` taşır.
- **Raf etiketi.** `products.price_changed_at` (oluştururken ve fiyat değişince), `label_printed_at`. `/yonetim/etiketler`: varsayılan "fiyatı değişmiş, etiketi basılmamış"; seçilenler A4'e 3×8 (70×37 mm) yazdırılır: ad, büyük fiyat, tartılıda "kg fiyatı" + PLU, geçerli EAN-13 ise SVG barkod (kendi kodlayıcımız, bağımlılık yok). "Basıldı" işareti ayrı düğme (yazdırma diyaloğunun sonucu bilinmez). Termal etiket yazıcısı M4.
- **Gün sonu.** `summarizeShift` iadeleri düşer: brüt, ödeme türleri, KDV ve beklenen nakit iadeleri çıkarır; `refundCount`, `refundTotal` eklenir. Bulutta `expectedCashOf` `iade` durumunu da okur.

## Görevler

### 1. Saf çekirdek + birim test
- `lib/core/scan.ts`
  - `ean13Valid(code: string): boolean`
  - `parseScaleBarcode(code: string): { plu: string; grams: number } | null`: 13 hane, 27/28/29 önek, geçerli kontrol hanesi, grams > 0
  - `parseScanInput(raw: string): { qty: number; code: string }`: `5*abc` → `{5,"abc"}`; çarpan 1-999
  - `parseKg(s: string): number | null`: "0,75" / "0.75" / "1" → gram; 0 ve 3 haneden fazla ondalık → null
  - `buildIndex(products: KasaProduct[]): ScanIndex` (`byBarcode`, `byPlu` Map'leri)
  - `resolveScan(raw: string, ix: ScanIndex): { product: KasaProduct; qtyMilli: number } | { weigh: KasaProduct } | { error: string }`: terazi etiketi → gram; tartılı ürünün düz barkodu → `weigh`; çarpan × adet; tartılıda çarpan → error
- `lib/core/stock.ts`: `stockLevel(moves: { kind: StockKind; qtyMilli: number; at: string }[]): number`
- `lib/core/ean13.ts`: `ean13Modules(code: string): string | null` (95 karakter 0/1; L/G/R tabloları + ilk hane paritesi)
- `lib/core/shift.ts`: `ShiftSale` += `refund?: boolean`; iadeler eksi yönde.
- Testler `tests/scan.test.ts`, `tests/stock.test.ts`, `tests/ean13.test.ts`, `tests/shift.test.ts`:
  - `2712345007504` geçerli, `2712345007505` null; `parseScaleBarcode` → `{plu:"12345", grams:750}`
  - `3*8690000000012` → 3000; tartılıda `2*` → error; bilinmeyen kod → error
  - sayım yoksa toplam; sayım (20) + sonrasında −3 → 17; sayımdan **önceki** `at`'li geç gelen satış yok sayılır; iki sayımda son geçerli
  - `5901234123457` → 95 modül, `101` ile başlar/biter, orta `01010`, ilk hane 5 paritesi LGGLLG
  - 100 ₺ satış + 30 ₺ nakit iade → brüt 70, nakit 70, `refundCount` 1
- Komut: `npm test`. Commit: `M3: tarama, stok, EAN-13 çekirdeği`

### 2. Şema + ürün yönetimi
- `db/schema.ts`: `productKind` enum; `products` += `kind` (default adet), `plu`, `trackStock` (default false), `quick` (default false), `priceChangedAt`, `labelPrintedAt`; `uniqueIndex(tenantId, plu)`; `saleStatus` += `iade`; `sales` += `refundOf uuid`, `approvedBy uuid → staff`; `stockKind` enum + `stock_movements` (indeks `(product_id, at)`).
- `db/rls.sql`: `stock_movements` RLS (diğer iş tablolarıyla aynı kalıp). `tests/rls.test.ts`: yeni tabloda başka kiracı satırı görünmez.
- `lib/admin/catalog-actions.ts`: kind, PLU (5 hane, tekil → alan hatası), trackStock, quick; fiyat değişince `priceChangedAt = now()`.
- `components/admin/ProductForm.tsx`: tür (adet/tartılı düğme grubu, KDV düğmeleri gibi), tartılıda fiyat etiketi "kg fiyatı", PLU alanı, iki onay kutusu. Native select yok.
- `app/yonetim/urunler/page.tsx`: listede tür/PLU/hızlı tuş işareti.
- `app/api/sync/catalog/route.ts` + `lib/offline/state.ts`: `KasaProduct` += `kind`, `plu`, `quick`.
- `npm run db:push:test` + `npm run db:push` (yerel), `npm test`. Commit: `M3: tartılı ürün, PLU, stok takibi, hızlı tuş alanları`

### 3. Eşitleme: stok hareketi + iade
- `lib/sync/docs.ts`: `refund` belgesi (`refundOf`, `approvedBy`, `lines` = `saleLineDoc`, `payments` tek öğe).
- `lib/sync/apply.ts`: `applySale` track_stock ürünlere `satis` hareketi (−qty, `at` = satış anı); `applyRefund`: idempotent, asıl satış yoksa / fazla iade / ödeme ≠ toplam → review; `iade` hareketi (+qty); fiş sayacı ilerler. `expectedCashOf` iadeleri kapsar.
- `app/api/sync/sale/route.ts` (GET, cihaz çerezi, `no-store`): fiş no → satış + satırlar + iade edilebilir miktar; yoksa 404.
- `tests/sync.test.ts`: stoksuz ürün hareket yazmaz; iade iki kez gelince tek kayıt; fazla iade review; bilinmeyen asıl satış review; vardiya kapanışında beklenen nakit iadeyi düşer; lookup başka kiracının fişini göstermez.
- Commit: `M3: iade belgesi, stok hareketleri eşitlemede, fiş sorgusu`

### 4. Stok yönetimi
- `lib/admin/stock.ts`: `stockLevels(tx, storeId)` tek SQL (ürün başına son sayım `DISTINCT ON` + sonrası toplam); eylemler `addPurchase`, `addWaste` (not zorunlu), `setCount` (mutlak). Hepsi `audit`.
- `app/yonetim/stok/page.tsx`: stok takipli ürünler, arama, stok (eksi kırmızı), satır başına Alış / Fire / Sayım formu; son 50 hareket. `Nav.tsx` bağlantısı.
- `tests/stock-db.test.ts` (test DB): karışık hareket kümesinde `stockLevels` = `stockLevel` (saf).
- Commit: `M3: stok ekranı — alış, fire, sayım`

### 5. Kasa: market satışı + iade
- `components/kasa/SaleScreen.tsx`: `buildIndex` + `resolveScan`; hata kısa süre kutunun altında; `WeighDialog` (parseKg); tartılı satır gösterimi; market dikeyinde ızgara = hızlı tuşlar; arama sonucu ≤ 60; okutma sonrası odak hep arama kutusunda.
- `components/kasa/RefundScreen.tsx`: fiş no → yerel/buluttan bul → satır ve miktar seç (tartılı satır ya hep ya hiç) → yöntem → kasiyerse müdür PIN (`verifyPin`, ortak kilit) → giden kutusu + yerel kayıt → iade fişi.
- `lib/offline/state.ts`: `LocalSale` += `kind: "sale" | "refund"`, `refundOf?`, `approvedBy?`; yerel iade edilebilir miktar hesabı.
- `components/kasa/KasaApp.tsx`: üst çubukta "İade"; fişte "İADE" başlığı ve eksi tutarlar; gün sonu iadeli özet.
- Doğrulama tarayıcıda Görev 7'nin E2E'si ile. Commit: `M3: kasa — barkod/terazi/çarpan, elle tartım, iade`

### 6. Raf etiketi
- `lib/admin/labels.ts`: `labelQueue(tx)` (basılmamış veya fiyat değişmiş), `markPrinted(ids)`.
- `app/yonetim/etiketler/page.tsx` + `components/admin/LabelSheet.tsx`: seçim, "Tümü / Yalnız değişenler" düğmeleri, `@media print` A4 3×8 ızgara, `ean13Modules` → SVG; mevcut `PrintButton`.
- Commit: `M3: raf etiketi yazdırma`

### 7. E2E + kapı
- `e2e/m3.mjs` (m2 kalıbı, sistem Chrome): market kiracısı kaydı → ürünler: barkodlu stok takipli (hızlı tuş), tartılı PLU 12345 80 ₺/kg → alış 10 → müdür + kasiyer personel → cihaz eşleme → kasiyer PIN → vardiya 100 ₺ → `3*<barkod>` → toplam 3 adet → terazi etiketi `2712345007504` → 60,00 ₺ satır → nakit öde → İade: fiş no, 1 adet, müdür PIN → iade fişi → offline → 1 adet sat → online → bekleyen 0 → yönetim stok 10−3+1−1 = 7 → sayım 20 → 20 → ürün fiyatı değiştir → etiket listesinde → Basıldı → listeden çıkar → gün sonu beklenen nakit = 100 + satışlar − iade → "M3 OK".
- Kapı: `npm test`, `npx eslint`, `npx tsc --noEmit`, `npm run build`, E2E m1 + m2 + m3 yerelde. `docs/PROGRESS.md` M3 bölümü. Push `m3-market`.
- Prod (şema push + `db-rls.mjs` + `relrowsecurity` kontrolü + main) bu planın dışında: M2 ile birlikte Yiğit onayı.
