# ÇabukPOS — Tasarım dili ve arayüz yenileme

Tarih: 2026-09-29 · Dal: `arayuz-tasarim` · Onay: Yiğit ("en iyisi olmalıyız, sana bıraktım", yaklaşım 1 onaylı)

## Amaç

Tüm ÇabukPOS arayüzlerine (kasa, yönetim, tanıtım/giriş) tek, tutarlı bir tasarım dili. Hedef piyasadaki en iyi POS'lar
(Toast, Square, Lightspeed) düzeyinde: profesyonel, güven veren, kasada hızlı ve dokunmatik dostu.

## Teşhis (2026-09-29 ekran görüntüleri)

- Kasa: ürün kutuları birbirinin aynısı (kategori ayrımı yok, sepetteki adet kutuda görünmüyor); İade / Gün sonu / Kasiyer
  değiştir altı çizili bağlantı; bölüm sekmeleri ayrı satırda dikey alan yiyor; ödemede hızlı nakit tuşu ve büyük para üstü yok;
  "Kart ekle" bağlantı.
- Yönetim: 20 maddelik gruplanmamış, ikonsuz menü; `/yonetim` ana ekranı yok (Ürünler'e düşüyor); sayfalar formla açılıyor.
- Tanıtım: iyi; yalnız token hizalaması.
- Altyapı: 5 renk token'ı, 60 satırlık `components/ui.tsx`; ekranlar ham stone/amber/emerald sınıflarıyla dağınık.

## Değişmez kurallar

1. Beyaz zemin; koyu tema yok. Native `<select>` yok (`components/Select.tsx`).
2. Renk yalnız anlam taşır: marka turuncu = birincil eylem/seçili; yeşil = para/başarı; amber = uyarı/bekleyen;
   kırmızı = hata/silme. Kategori rengi tek istisna (ürünü tanıma işlevi var) ve soluk tonlarla.
3. **Erişilebilir adlar değişmez.** E2E'lerin kullandığı buton/etiket metinleri ("Öde", "Gir", "Eşle", "Satışı tamamla",
   "Tamamı nakit", "Kart ekle", "Paket", "Salon", "Gün sonu" …) aynen kalır; ikonlar `aria-hidden`. Yeni butonlar mevcut
   seçicilerle çakışan kelime içermez (ör. "Nakit", "Kart", "Hesap" geçmez).
4. İş mantığı değişmez: yalnız sunum katmanı (`components/**`, `app/**` JSX/sınıflar, `globals.css`). `lib/**` dokunulmaz.
5. Her faz ayrı commit dizisi; birim testler + ilgili E2E'ler yeşil olmadan main'e alınmaz.

## Temel (Faz 1 başında, tüm fazlar kullanır)

### Token'lar (`app/globals.css` `@theme`)

| Grup | Token | Değer |
|---|---|---|
| Marka | `brand` / `brand-hover` / `brand-soft` / `brand-ring` | #c2410c / #9a3412 / #fff7ed / #fed7aa |
| Metin | `ink` / `ink-2` / `muted` | #1c1917 / #44403c / #78716c |
| Yüzey | `surface-2` / `surface-3` | #fafaf9 / #f5f5f4 (beyazın bir-iki kademe altı: panel, kasa zemini) |
| Çizgi | `line` / `line-strong` | #e7e5e4 / #d6d3d1 |
| Anlam | `ok` `ok-soft` · `warn` `warn-soft` · `bad` `bad-soft` | #047857 #ecfdf5 · #b45309 #fffbeb · #b91c1c #fef2f2 |
| Gölge | `shadow-card` / `shadow-pop` | ince kart gölgesi / diyalog gölgesi |

Tipografi Geist (mevcut), rakamlar her yerde `tabular`. Yarıçap: kontrol 10px, kart 14px, diyalog 20px.
Dokunma: kasada her dokunulur öğe ≥ 48px; birincil eylem 56–64px.

### Bileşenler (`components/ui/` — `components/ui.tsx` klasöre taşınır, `@/components/ui` yolu aynı kalır)

- `Button` — variant: primary · secondary · ghost · danger · success; size: sm · md · lg · xl; `icon` prop'u.
- `IconButton` — yalnız ikon, zorunlu `label` (aria-label).
- `Dialog` — örtü + panel, Esc ve örtüye tıklama kapatır, başlık + gövde + alt eylem şeridi.
- `Segmented` — sekme/segment (aria-pressed ya da role=tab, çağırana göre).
- Mevcutlar (Input, Textarea, Field, Card, PageHeader, Badge, Empty) token'lara geçer, imzaları aynı.
- İkon seti: `lucide-react` (tek yeni bağımlılık, ağaç sallanır).
- Kategori rengi: `lib/ui/categoryTone.ts` — kategori id'sinden deterministik 8 soluk tondan biri (sunum yardımcısı,
  `lib/core` değil).

## Faz 1 — Kasa

1. **Üst şerit (KasaApp)**: tek 56px şerit. Sol: logo işareti + işletme · cihaz. Orta: bölüm segmenti (Salon / Paket /
   Hızlı satış) — ayrı satır kalkar. Sağ: eşitleme + ajan rozetleri, ikonlu İade ve Gün sonu butonları, kasiyer çipi
   (ad + "Kasiyer değiştir"). Mutfak/kurye/garson başlıkları aynı şerit bileşenini kullanır.
2. **Satış ekranı**: zemin `surface-2`, sol ürün alanı + sağ 400px sepet kartı.
   - Arama: büyük, arama/barkod ikonlu, marka odak halkası.
   - Kategori çipleri: renk noktası + ad; seçili = marka.
   - Ürün kutusu: 112px, üstte kategori rengi şeridi, ad (2 satır), kalın fiyat; sepetteyse sağ üstte marka rozetinde adet;
     basınca hafif ölçek geri bildirimi.
   - Sepet: başlık "Sepet · N kalem"; satır: ad + birim fiyat, 44px −/+ adımlayıcı, tutar; boş durum ikonlu.
   - Alt: KDV satırları, büyük TOPLAM; son satış kartı (yeşil, onay ikonu, fiş no, para üstü, Fişi yazdır);
     Temizle (ikonlu, ikincil) + Öde (64px, marka, tutarı da gösterir: "Öde" adı korunur, tutar `aria-hidden`).
3. **Ödeme diyaloğu**: üstte büyük tutar; üç yöntem kutusu (ikonlu: banknot / kart / yemek kartı; adlar aynı);
   alınan nakit alanı + hızlı nakit tuşları ("Tam tutar" ve tutarın üstündeki yuvarlak banknot değerleri, ör. 530 → 550,
   600, 1.000 ₺); Kart ekle / Yemek kartı ekle ikincil butonlar; Fatura butonu; büyük para üstü paneli (yeşil) ya da
   eksik tutar (kırmızı); Vazgeç + Satışı tamamla.
4. **PIN ekranı**: logo, işletme, 4 nokta (dolu = marka), 80px tuşlar, Sil ikonlu (ad "Sil"), Gir birincil.
5. **Eşleme, vardiya açma, gün sonu, fiş**: aynı kart + Button + Field dili.
6. **Salon**: bölge segmenti; masa kartı durum şeridi (boş/dolu/hazır/uzun — mevcut anlamlar), toplam ve süre ikonlu.
7. **Adisyon, hesap, iade, paket panosu, yeni paket, kurye, mutfak**: sınıflar token'lara ve ortak Button/Dialog'a geçer;
   düzenleri korunur, yalnız hiyerarşi (başlık, birincil eylem, boş durum) düzeltilir.

## Faz 2 — Yönetim

- Kenar menü grupları ve ikonları: **Genel** (Bugün, Raporlar) · **Menü** (Ürünler, Seçenekler, Reçeteler, Üretim,
  Raf etiketi) · **Stok** (Stok, Alışlar, Tedarikçiler) · **Satış kanalları** (Salon, İstasyonlar, Bölgeler, Müşteriler,
  Platformlar) · **İşletme** (Personel, Cihazlar, Donanım, Mali, Entegrasyonlar, Abonelik). Market kiracısında restorana
  özgü maddeler gizli (mevcut kural neyse korunur). Mobilde çekmece.
- **Bugün** ana ekranı (`/yonetim`): mevcut rapor sorgularıyla bugünkü ciro, fiş sayısı, ortalama sepet, açık adisyon,
  kritik stok uyarısı, son satışlar. Yeni sorgu gerekirse `lib/reports` içindeki mevcut fonksiyonlar kullanılır.
- Liste-önce düzeni: sayfa başlığı + "Yeni …" butonu → tablo; form sağdan açılan panelde (Sheet). Faz 2 planı sayfa
  sayfa çıkarılır (en çok kullanılan önce: Ürünler, Personel, Cihazlar, Stok).

## Faz 3 — Tanıtım ve giriş/kayıt

Yeni token'lar ve Button; giriş/kayıt ekranında sol marka paneli + sağ form; tanıtım sayfası yapısı korunur.

## Doğrulama

- `npm test` (birim) + `tsc` + `eslint` her görevde.
- Faz 1 sonu E2E: m1 (kasa satış/ödeme), m3 (market/tartı), m5 (salon/adisyon), m6 (paket/kurye), m9a (rapor + kasa silme).
- Önce/sonra ekran görüntüsü (1366×820 ve 1024×768 tablet) — göz denetimi.

## Kapsam dışı

Koyu tema, ürün görselleri (katalogda görsel alanı yok), animasyon kütüphanesi, iş mantığı değişiklikleri.
