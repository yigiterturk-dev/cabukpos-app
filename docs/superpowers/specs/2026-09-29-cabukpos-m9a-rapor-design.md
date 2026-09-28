# ÇabukPOS M9a — Raporlar (tasarım)

Tarih: 2026-09-29 · Durum: ONAYLANDI · Üst spec: `2026-09-28-cabukpos-pos-design.md` §M9

M9 üçe bölündü: **M9a raporlar** (bu belge) → M9b abonelik (PayTR/iyzico, sağlayıcıdan bağımsız + sahte sağlayıcı) → M9c ajans paneline izinli okuma.

## Amaç

İşletme sahibi/müdür bir tarih aralığı için: satış özeti, saat/gün yoğunluğu, ürün/kategori performansı ve personel (suistimal) raporunu görür, her birini Excel'in açtığı CSV olarak indirir. Mevcut Vardiyalar ve Kârlılık sekmeleri aynen kalır.

## Yaklaşım

İstek anında SQL toplama. Özet tablosu/cron yok: veri hep taze, geç eşitlenen satış kendiliğinden girer. Toplama mantığı tek modülde → gerekirse ileride günlük özet tablosuna geçmek yerel değişiklik. Materialized view RLS ile uyuşmadığı için elendi.

## 1. Veri

### Yeni tablo `register_events` (kasa olayı)
Hızlı satışta sepetten silinen satır ve boşaltılan sepet bugün buluta hiç gitmiyor (okut → tahsil et → sil hırsızlığı görünmez).

| alan | not |
|---|---|
| `id` uuid PK | istemci üretir (idempotent) |
| `tenant_id`, `store_id`, `device_id`, `shift_id`, `staff_id` | |
| `at` timestamptz | cihaz saati |
| `type` text | `line_removed` \| `cart_cleared` |
| `lines` jsonb | `{ productId, name, qtyMilli, total }[]` — silinen içerik (kuruş, KDV dahil) |
| `total` integer | silinen toplam (kuruş) |
| `synced_at` | |

- Değişmez; RLS açık (tenant politikası, `db-rls.mjs`'e eklenir).
- İndeks: `(tenant_id, store_id, at)`.
- `line_removed` şunları kapsar: satır silme, adet azaltma (fark kadar), tartılı satırın silinmesi. Satışla sonuçlanan sepetin kapanması (`onDone`) olay DEĞİL.
- `cart_cleared`: "Temizle" düğmesi, sepet doluyken; tek olayda tüm satırlar.
- Müdür PIN'i istenmez; yalnız kayıt.

### Kasa tarafı
- `SyncDoc`'a `kind: "register_event"` eklenir; `lib/offline/db.ts` içinde `enqueue` ile giden kutusuna yazılır (vardiya açık değilse yazılmaz — satış da yapılamaz).
- Push uç noktası (`app/api/sync/push`) → `lib/sync/apply.ts` yeni türü idempotent `insert … on conflict do nothing` ile uygular. Cihaz/vardiya doğrulaması satışla aynı.

### İndeks
`sales (tenant_id, store_id, created_at)` — tüm dönem sorgularının dayanağı.

## 2. Hesap katmanı

- `lib/core/report.ts` — saf fonksiyonlar (DB yok, birim test): dönem/önceki dönem, İstanbul gün sınırı, özet ve değişim yüzdesi, yoğunluk ızgarası, ürün/kategori sıralaması, personel satırı birleştirme, CSV üretimi.
- `lib/admin/report.ts` — `withTenant` içinde dönem SQL sorguları; saf fonksiyonlara ham satır verir.

### Tanımlar
- **Dönem**: `bas`–`bit` (dahil) günleri, Europe/Istanbul. Satış zamanı = `sales.created_at` (cihaz saati; gün sonu raporuyla aynı).
- **Ciro (brüt)**: `status = kapandi` satışların `total`'ı − `status = iade` satışların `total`'ı. KDV dahil, indirim düşülmüş. `iptal` satış hiçbir toplamda yok.
- **Net**: `vat` jsonb'daki `net` toplamı, iade eksi.
- **Fiş sayısı**: `kapandi` satış adedi (iade ayrı sayılır). **Ortalama sepet** = brüt / fiş sayısı (fiş 0 ise "—").
- **Önceki dönem**: aynı gün sayısında hemen önceki aralık. Değişim % = (şimdi − önce) / önce; önce 0 ise "—".
- **Kanal dağılımı**: `sales.channel` bazında brüt + fiş.
- **Ödeme dağılımı**: `payments.method` bazında tutar; iade ödemeleri eksi. Para üstü (`sales.change`) nakitten düşülür.
- **Yoğunluk**: haftanın günü (Pzt–Paz) × saat (0–23) brüt ve fiş; İstanbul saatine göre.
- **Ürün**: `sale_lines` üzerinden `productId` (null ise ad) bazında adet (`qtyMilli`) ve brüt (`total`), iade eksi. Kategori: ürünün bugünkü kategorisi (kategorisiz → "Kategorisiz"). **Hiç satılmayanlar**: satılabilir, aktif, dönemde satırı olmayan ürünler.
- **Personel** (`staff` başına):
  - satış brüt + fiş sayısı (`sales.staff_id`)
  - iade: adet + tutar (iadeyi yapan `staff_id`; onaylayan ayrıca listede)
  - adisyon iptali (`tab_events.type = void`): adet + satır tutarı (satırın `add` olayından)
  - ikram (`comp`): adet + satır tutarı
  - indirim (`discount`): olay adedi; ayrıca kişinin satışlarındaki `sale_lines.discount` toplamı "indirim + ikram payı" sütunu olarak (ayrıştırılmaz)
  - paket iptali (`cancel`): adet
  - sepetten silinen (`register_events`): adet + tutar
- **Olay listesi** (kişiye tıklayınca): yukarıdaki olayların zaman sıralı birleşik listesi — zaman, tür, içerik, tutar, onaylayan, gerekçe. Tavan 500 satır.

## 3. Ekran — `/yonetim/raporlar`

Sekmeler (tablist, `?sekme=`): **Özet** (varsayılan) · **Yoğunluk** · **Ürünler** · **Personel** · **Vardiyalar** · **Kârlılık**.

- Ortak tarih seçici (Vardiyalar hariç): `bas`/`bit` + hazır aralıklar Bugün, Dün, 7 gün, 30 gün, Bu ay. Geçersiz tarih → varsayılan 7 gün. Aralık tavanı 366 gün.
- Kritik stok kartı üstte kalır.
- **Özet**: 3 kutu (brüt ciro, fiş, ortalama sepet) + değişim %, net ciro satırı; kanal ve ödeme tabloları.
- **Yoğunluk**: 7 × 24 tablo, hücre tonu brüte göre (CSS, `brand` rengi opaklık); hücre `title` = tutar + fiş. Mobilde yatay kaydırma kabı.
- **Ürünler**: ürün tablosu (ad, kategori, adet, brüt, pay %), `?sirala=adet|ciro`; altında kategori özeti ve "Hiç satılmayanlar" listesi.
- **Personel**: kişi tablosu; `?kisi=<staffId>` olay listesini açar. Silinen/iptal/ikram sütunları sıfırdan büyükse vurgulu.
- Tüm tutarlar `formatTL`, sayılar `tabular`. Beyaz zemin, native select yok (hafıza kuralı).

## 4. Dışa aktarma

- `GET /yonetim/raporlar/csv?sekme=ozet|yogunluk|urunler|personel|olaylar&bas&bit[&kisi]` — route handler, `requireAdmin` (sahip/müdür).
- UTF-8 BOM, `;` ayırıcı, CRLF, tutar `1234,50`, adet ondalık virgül; `"` kaçışı; `= + - @` ile başlayan hücre başına `'` (formül enjeksiyonu).
- Dosya adı: `cabukpos-<sekme>-<bas>_<bit>.csv`.
- Her sekmede "CSV indir" bağlantısı.

## 5. Hata/sınır durumları

- Veri yok → `Empty` bileşeni, CSV yalnız başlık satırı.
- Eski kasa sürümü `register_event` göndermez → sütun 0; hata yok.
- Bilinmeyen `type` → push reddeder (mevcut doğrulama).
- Personel adı `staff` tablosundan (pasif personel de dahil); bulunamazsa "Bilinmeyen".

## 6. Test

- Birim (`lib/core/report.test.ts`): brüt/iade/iptal, önceki dönem aralığı, İstanbul gün ve saat sınırı (UTC 21:00 = ertesi gün 00), yoğunluk ızgarası, ödeme dağılımında para üstü, personel birleştirme, CSV kaçışı + BOM + formül koruması.
- Kasa birimi: adet azaltma farkı, dolu sepette Temizle olayı, satışla kapanan sepette olay yok.
- Apply testi: `register_event` idempotent (iki kez push → tek satır), RLS başka kiracıyı görmez.
- `e2e/m9a.mjs`: kasada satış + sepetten silme + Temizle + iade → Özet brütü, Personel "silinen" tutarı ve olay listesi, CSV indirme (BOM + `;`). Regresyon: M1, M8.

## Kapsam dışı

Otomatik e-posta gün sonu özeti, şubeler arası karşılaştırma, grafik kütüphanesi, özet tablosu/cron.

## Prod

`scripts/prod-push.sh`: şema → db-rls (yeni tablo) → relrowsecurity kontrolü → main → canlı E2E; Yiğit `!` ile tek tek.
