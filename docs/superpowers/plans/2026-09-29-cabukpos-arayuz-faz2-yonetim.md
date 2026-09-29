# ÇabukPOS arayüz Faz 2 — Yönetim

Spec: `docs/superpowers/specs/2026-09-29-cabukpos-arayuz-tasarim-dili-design.md` (Faz 2). Kurallar aynı: yalnız sunum,
`lib/**` dokunulmaz, erişilebilir adlar ve e2e seçicileri değişmez.

**Karar (spec'ten sapma):** form "sağdan açılan Sheet" yerine **sağa yapışık yan panel** (geniş ekranda liste solda,
form sağda sürekli açık; dar ekranda form üstte). Sebep: e2e'ler sayfaya gidip formu doğrudan dolduruyor (urunler 17,
cihazlar 13, personel 10 kullanım) — gizli Sheet her testi değiştirirdi; yönetimde de ek tıklama kazandırır.

## Görevler

1. **Kabuk:** `app/yonetim/Nav.tsx` gruplu + lucide ikonlu (Genel · Menü · Stok · Satış kanalları · İşletme; grup
   başlığı metin, link değil); `only` kuralı aynı. `layout.tsx`: masaüstünde sabit kenar menü (marka + işletme + kişi
   altta), mobilde üst çubuk + çekmece (`MobileNav` istemci bileşeni, rota değişince kapanır). Abonelik bandı tokenlı.
2. **Bugün** (`app/yonetim/page.tsx`, yönlendirme kalkar): `summaryData(bugün)` → ciro/fiş/ortalama sepet (dünkü
   aynı güne göre değil, `prevRange` = dün); restoranda açık adisyon sayısı + tutarı (`initialEvents` + `foldTabs`,
   kapanmamışlar); kritik stok (`stockLevels` + `isCriticalRow`); son 8 satış (sayfa içi sorgu, `sales` desc). Hızlı
   bağlantılar: Kasa, Raporlar, Ürünler.
3. **Yan panel düzeni:** `components/ui` → `SplitView` (liste + yapışık panel, `lg:grid-cols-[1fr_400px]`) ve
   `PanelHeader`. Ürünler, Personel, Cihazlar, Stok bu düzene; başlıkta "Yeni …" bağlantısı (`?duzenle` temizler).
4. **Token taraması:** kalan yönetim sayfaları + `components/admin/**` + `components/reports/**`: `stone-*`,
   `red-*`, `emerald-*`, `amber-*` → `ink/muted/line/surface/ok/warn/bad` tokenları; tablo başlığı tek stil.
5. **Doğrulama:** `tsc` + `eslint` + `npm test`; E2E m1, m3, m7, m9a, m9b, m9c (yönetim ağırlıklı); 1366 ve 390
   genişlikte ekran görüntüsü göz denetimi. Sonra main'e ff (şema yok).
