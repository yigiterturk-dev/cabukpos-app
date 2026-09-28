# ÇabukPOS M7 — Stok, reçete, alış, tedarikçi, kârlılık

Ana spec: `2026-09-28-cabukpos-pos-design.md` (M7: reçete düşümü, alış, tedarikçi). Yiğit kararları (2026-09-28):
1. Hammadde = ürün tablosunda **satılmaz** işaretli ürün (kasa kataloğuna inmez); stok/sayım/fire mevcut koddan gelir.
2. Maliyet = **son alış fiyatı**; reçeteli ürünün maliyeti hammaddelerin son alış fiyatlarından.
3. **Alış fişi + tedarikçi bakiyesi** (tedarikçi kartı, alış fişi kalemli, ödemeler, borç).
4. Ekler: **seçenek reçetesi**, **kritik stok uyarısı**, **ara ürün (yarı mamul)**, **ürün kârlılığı raporu**.

## Veri
- `products` ekleri: `sellable boolean default true` (false = hammadde/ara ürün; kasada görünmez, katalogdan düşer), `unit stock_unit ('adet'|'kg'|'lt')` (stok birimi; satılan üründe `kind`'den türer: tartılı → kg), `cost integer null` (kuruş / 1 birim: adet, kg ya da lt), `cost_at ts null`, `min_stock integer null` (qtyMilli; kritik sınır), `yield_milli integer null` (ara ürün: bir üretim partisinin miktarı).
- `recipe_items (id, tenant, product_id null, option_id null, ingredient_id, qty_milli)`: tam olarak biri dolu (check). Miktar **1 birim** üst ürün (ya da seçenek) için; ara üründe **bir parti** (`yield_milli`) için. `ingredient_id` satılmaz ürün ya da stoklu satılan ürün olabilir; kendine/döngüye izin yok (kaydederken derinlik 1: ara ürünün reçetesinde ara ürün yok).
- `stock_kind` ekleri: `recete` (satıştan hammadde düşümü), `uretim` (ara ürün üretimi: ara ürün +, hammaddeler −). `stock_movements` ekleri: `purchase_id null`, `production_id null`.
- `suppliers (id, tenant, name, phone, tax_no, note, active)`.
- `purchases (id, tenant, store, supplier_id null, doc_no, date, total, note, status 'kayitli'|'iptal', created_by, created_at)`, `purchase_lines (id, purchase_id, product_id, qty_milli, unit_cost, total)`.
- `supplier_payments (id, tenant, supplier_id, amount, method 'nakit'|'havale'|'kart', date, note, created_by)`.
- `productions (id, tenant, store, product_id, batches_milli, note, created_by, created_at)`.
- `sale_lines.cost integer null`: satır maliyeti eşitleme anında donar (kârlılık raporu tarihsel doğru olsun).
- RLS: yeni tabloların hepsi `db/rls.sql` listesine.

## Kurallar (saf çekirdek `lib/core/recipe.ts`, `lib/core/purchase.ts`)
- **Düşüm** (`consumption(line, recipes)`): satır ürününün reçetesi varsa her kalem `qty × satır qtyMilli / 1000` (yuvarlama `Math.round`), seçeneklerin reçeteleri de aynı çarpanla eklenir; aynı hammadde birleşir. Reçeteli ürünün kendi stoğu düşmez (trackStock olsa bile); reçetesizse mevcut M3 kuralı (trackStock → `satis`). İade ters işaret, tür `recete` (iadeden) — `sale_id` iade satışı.
- **Maliyet** (`lineCost`): reçeteli → Σ kalem miktarı × hammadde `cost` / 1000; reçetesiz → ürün `cost` × qty / 1000; bir kalemin maliyeti yoksa satır maliyeti `null` (raporda "maliyet eksik").
- **Alış kaydı**: kalem başına `alis` hareketi (+qty, `purchase_id`); ürün `cost = unit_cost`, `cost_at = date` yalnız `date >= cost_at` ise (eski tarihli fiş son fiyatı ezmez). Toplam = Σ kalem (KDV dahil girilir; KDV ayrımı v1'de yok).
- **Alış iptali** (müdür değil yönetim kullanıcısı): `status = iptal`, her kalem için ters `alis` hareketi; maliyet geri alınmaz (not düşülür).
- **Tedarikçi bakiyesi** = Σ kayıtlı alış − Σ ödeme; pozitif = borcumuz.
- **Üretim**: `N` parti → ara ürün `+N × yield_milli`, her hammadde `−N × qty`; ara ürün `cost` = Σ hammadde maliyeti / (yield/1000). Hammadde maliyeti eksikse ara ürün maliyeti güncellenmez.
- **Kritik stok**: `min_stock` dolu ve seviye ≤ sınır.
- **Kârlılık** (dönem, mağaza): ürün başına adet, net ciro (KDV hariç, indirim düşülmüş), maliyet (Σ `sale_lines.cost`), brüt kâr, marj %; maliyeti eksik satır sayısı ayrı sütun. İadeler düşülür.

## Ekranlar (yönetim)
- **Ürünler**: formda "Kasada satılır" anahtarı; satılmazsa birim (adet/kg/lt), maliyet (TL), kritik sınır; ara ürün için "Parti miktarı". Liste filtresi: Satılan | Hammadde.
- **Reçeteler** (`/yonetim/receteler`, restoran): ürün seç → kalem ekle (hammadde + miktar; kg/lt biriminde g/ml girilir), anlık maliyet ve fiyata göre marj; seçenek reçeteleri aynı ekranda seçenek grubu altında; ara ürün reçetesi.
- **Üretim** (`/yonetim/uretim`, restoran): ara ürün + parti sayısı → kayıt; son üretimler.
- **Alışlar** (`/yonetim/alislar`): liste (tarih, tedarikçi, belge no, tutar, durum); yeni alış formu (tedarikçi seçimi ya da boş, belge no, tarih, kalem satırları: ürün + miktar + birim fiyat, toplam), iptal.
- **Tedarikçiler** (`/yonetim/tedarikciler`): kart, bakiye, hareket dökümü (alış + ödeme), ödeme ekle.
- **Stok**: mevcut sayfaya maliyet, stok değeri, kritik rozeti ve "Yalnız kritikler" filtresi; eski "alış" hızlı formu kalkar (Alışlar sayfasına bağlantı), sayım ve fire kalır.
- **Raporlar**: üstte kritik stok uyarı kartı (yönetim açılışında görünür; kasa gün sonu raporu stok bilmediği için uyarı yönetimde); yeni sekme **Kârlılık** (tarih aralığı).
- Nav: Reçeteler, Üretim restoran dikeyinde; Alışlar, Tedarikçiler iki dikeyde.

## Kasa
- Katalog `sellable = false` ürünleri göndermez (kasa kodu değişmez). Başka kasa değişikliği yok.

## Bilinçli dışarıda bırakılanlar
- Sipariş/mal kabul akışı, KDV'li alış ayrımı, ağırlıklı ortalama maliyet, çok seviyeli (iç içe) ara ürün, depo/şubeler arası transfer, kasada kritik stok uyarısı.

## Test
- Birim: `tests/recipe.test.ts` (düşüm: tartılı satır, seçenek reçetesi, birleşme, iade ters; maliyet eksik → null; üretim; kritik), `tests/purchase.test.ts` (eski tarihli alış maliyeti ezmez, bakiye).
- DB: `tests/stock-db.test.ts` (reçeteli satış eşitlemesi hammaddeyi düşer + `sale_lines.cost`; alış + iptal hareketleri; RLS başka kiracıyı görmez).
- E2E `e2e/m7.mjs`: restoran → hammaddeler (un kg, kıyma kg) → tedarikçi → alış (un 10 kg × 20 TL, kıyma 5 kg × 400 TL) → ara ürün "Harç" (reçete: kıyma 600 g, un 400 g; parti 1 kg) → üretim 2 parti → ürün Lahmacun reçetesi (harç 100 g, un 150 g) + seçenek "Ekstra kıyma" (kıyma 30 g) → kasa 3× Lahmacun (1'i ekstra) → stok sayfası beklenen seviyeler → kârlılık raporu maliyet ve marj → kritik sınır altına düşen hammadde uyarıda → tedarikçi ödemesi → bakiye.
