# ÇabukPOS M7 — Stok, reçete, alış, tedarikçi, kârlılık

Spec: `docs/superpowers/specs/2026-09-28-cabukpos-m7-stok-design.md` (onaylandı 2026-09-28). Dal `m7-stok` (m6-online üstünde).

## Görevler

### 1. Saf çekirdek + test
- `lib/core/stock.ts`: `STOCK_KINDS += recete, uretim`; `formatQty` birimle (`adet|kg|lt`), `parseQty` birimle (kg/lt 3 ondalık).
- `lib/core/recipe.ts`: `RecipeItem {productId|optionId, ingredientId, qtyMilli}`; `consumption(line {productId, qtyMilli, options}, recipesByProduct, recipesByOption) → Map<ingredientId, qtyMilli>` (Math.round, birleşir); `lineCost(line, recipes, costOf) → Kurus | null`; `batchCost(items, costOf, yieldMilli) → Kurus | null` (1 birim ara ürün); `productionMoves(productId, batchesMilli, yieldMilli, items)`; `isCritical(level, min)`.
- `lib/core/purchase.ts`: `purchaseTotal(lines)`, `shouldUpdateCost(date, costAt)`, `supplierBalance(purchases, payments)`.
- Testler: `tests/recipe.test.ts`, `tests/purchase.test.ts` (spec'teki durumlar).

### 2. Şema + RLS
- `db/schema.ts`: `stock_unit` enum, `products` ekleri (sellable, unit, cost, cost_at, min_stock, yield_milli), `stock_kind` ekleri, `stock_movements.purchase_id/production_id`, `recipe_items` (check: tam biri dolu), `suppliers`, `purchases`, `purchase_lines`, `supplier_payments`, `productions`, `sale_lines.cost`. `db/rls.sql` listesi. `npm run db:push:test && npm run db:rls:test`.

### 3. Eşitleme: reçete düşümü + satır maliyeti
- `lib/sync/apply.ts` `write`: satıştaki bilinen ürünlerin reçeteleri + seçenek reçeteleri + hammadde maliyetleri tek sorguda; reçeteli satır → `recete` hareketleri (iade ters), reçetesiz → mevcut kural; `sale_lines.cost` = `lineCost` (iadede de, pozitif).
- Katalog (`app/api/sync/catalog/route.ts`): `sellable = false` ürünler hariç.
- `tests/stock-db.test.ts`: reçeteli satış + seçenek → hareketler ve cost; iade ters; RLS.

### 4. Yönetim: ürün formu + reçeteler + üretim
- Ürün formu: "Kasada satılır" anahtarı, birim, maliyet, kritik sınır, parti miktarı; liste filtresi Satılan | Hammadde.
- `/yonetim/receteler`: ürün/ara ürün seç → kalemler (hammadde Select + miktar g/ml/adet), anlık maliyet ve marj; seçenek reçeteleri. Kaydederken döngü/derinlik kontrolü.
- `/yonetim/uretim`: ara ürün + parti → `productions` + hareketler + ara ürün maliyeti.
- Eylemler `lib/admin/recipe-actions.ts`.

### 5. Yönetim: alışlar + tedarikçiler
- `/yonetim/tedarikciler` (kart, bakiye, döküm, ödeme ekle), `/yonetim/alislar` (liste, yeni alış çok satırlı form, iptal). Eylemler `lib/admin/purchase-actions.ts` (tek işlem: alış + satırlar + hareketler + maliyet).
- Stok sayfası: maliyet, stok değeri, kritik rozeti, "Yalnız kritikler"; alış hızlı formu kalkar.

### 6. Raporlar
- Raporlar sayfası üstünde kritik stok kartı; **Kârlılık** sekmesi (tarih aralığı; ürün başına adet, net ciro, maliyet, brüt kâr, marj, maliyeti eksik satır).
- Nav: Reçeteler, Üretim (restoran); Alışlar, Tedarikçiler (iki dikey).

### 7. E2E + belge
- `e2e/m7.mjs` spec'teki senaryo; sonunda "M7 OK". Regresyon: E2E M3 (market stok) + M6.
- `docs/PROGRESS.md` M7 bölümü.

Prod sırası (M5+M6+M7): şema push → db-rls → relrowsecurity (yeni tablolar) → main.
